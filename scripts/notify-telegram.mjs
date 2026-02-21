#!/usr/bin/env node

import { readFile } from 'fs/promises';
import { resolve } from 'path';

/**
 * Load service name from services.json
 */
async function getServiceName(serviceId) {
  const config = JSON.parse(await readFile(resolve(process.cwd(), 'data/services.json'), 'utf-8'));
  const service = config.services.find(s => s.id === serviceId);
  return service?.name || serviceId;
}

/**
 * Escape special characters for Telegram MarkdownV2
 * Must escape: _*[]()~`>#+-=|{}.!
 */
function escapeMarkdownV2(text) {
  return text.replace(/([_*\[\]()~`>#+=|{}.!-])/g, '\\$1');
}

/**
 * Send message to Telegram
 */
async function sendTelegramMessage(botToken, chatId, message) {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: message,
      parse_mode: 'MarkdownV2',
      disable_web_page_preview: false
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Telegram API error: ${response.status} ${error}`);
  }

  return response.json();
}

/**
 * Format a single changelog entry
 */
function formatEntry(entry) {
  const categoryEmoji = {
    added: '✨',
    fixed: '🐛',
    improved: '⚡',
    changed: '🔄',
    removed: '🗑️'
  };

  const emoji = categoryEmoji[entry.category] || '•';
  const scope = entry.scope ? `\\[${escapeMarkdownV2(entry.scope)}\\] ` : '';
  const description = escapeMarkdownV2(entry.translated || entry.original || '');

  return `${emoji} ${scope}${description}`;
}

/**
 * Build Telegram message for a version
 */
async function buildMessage(serviceId, serviceName, version, siteUrl) {
  const translationPath = resolve(process.cwd(), `data/services/${serviceId}/translations/${version}.json`);

  let entries;
  try {
    const data = await readFile(translationPath, 'utf-8');
    const parsed = JSON.parse(data);
    entries = parsed.entries;
  } catch (error) {
    console.error(`Failed to read translation for ${version}:`, error.message);
    return null;
  }

  if (!entries || entries.length === 0) {
    console.warn(`No entries found for version ${version}`);
    return null;
  }

  // Build message
  const header = `🔄 *${escapeMarkdownV2(serviceName)} 업데이트*\n\n`;
  const versionLine = `*v${escapeMarkdownV2(version)}*\n\n`;

  // Top 5 entries
  const topEntries = entries.slice(0, 5);
  const entryLines = topEntries.map(entry => formatEntry(entry)).join('\n');

  // Extra count
  const extraCount = entries.length - 5;
  const extraLine = extraCount > 0
    ? `\n\\.\\.\\.외 ${extraCount}개 항목\n\n`
    : '\n\n';

  // Link
  const linkLine = `📖 [전체 번역 보기](${escapeMarkdownV2(siteUrl)}#v${escapeMarkdownV2(version)})`;

  return header + versionLine + entryLines + extraLine + linkLine;
}

/**
 * Main function
 */
async function main() {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  const versionsMap = process.env.NEW_VERSIONS_MAP;
  const siteUrl = process.env.SITE_URL || 'https://claude-code-changelog-ko.pages.dev';

  if (!botToken) {
    console.warn('⚠️  TELEGRAM_BOT_TOKEN not set, skipping Telegram notifications');
    return;
  }

  if (!chatId) {
    console.warn('⚠️  TELEGRAM_CHAT_ID not set, skipping Telegram notifications');
    return;
  }

  // Parse input
  let serviceVersions;
  if (versionsMap) {
    try {
      serviceVersions = JSON.parse(versionsMap);
    } catch (error) {
      console.error('Failed to parse NEW_VERSIONS_MAP:', error.message);
      process.exit(1);
    }
  } else {
    console.log('No versions specified');
    return;
  }

  if (Object.keys(serviceVersions).length === 0) {
    console.log('No new versions to notify');
    return;
  }

  let successCount = 0;
  let failCount = 0;

  for (const [serviceId, versions] of Object.entries(serviceVersions)) {
    if (!Array.isArray(versions) || versions.length === 0) {
      continue;
    }

    const serviceName = await getServiceName(serviceId);
    console.log(`Sending Telegram notifications for ${serviceName} (${versions.length} version(s))...`);

    for (const version of versions) {
      try {
        const message = await buildMessage(serviceId, serviceName, version, siteUrl);

        if (!message) {
          failCount++;
          continue;
        }

        await sendTelegramMessage(botToken, chatId, message);
        console.log(`✅ Sent Telegram notification for ${serviceName} v${version}`);
        successCount++;

        // Rate limiting: wait 1 second between messages
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        console.error(`❌ Failed to send notification for ${serviceName} v${version}:`, error.message);
        failCount++;
      }
    }
  }

  console.log(`\nTelegram notifications: ${successCount} success, ${failCount} failed`);

  if (failCount > 0) {
    process.exit(1);
  }
}

main();
