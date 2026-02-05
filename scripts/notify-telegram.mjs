#!/usr/bin/env node

import { readFile } from 'fs/promises';
import { resolve } from 'path';

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
  const description = escapeMarkdownV2(entry.translation || entry.original || '');

  return `${emoji} ${scope}${description}`;
}

/**
 * Build Telegram message for a version
 */
async function buildMessage(version, siteUrl) {
  const translationPath = resolve(process.cwd(), `data/translations/${version}.json`);

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
  const header = '🔄 *Claude Code 업데이트*\n\n';
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
  const newVersionsJson = process.env.NEW_VERSIONS;
  const siteUrl = process.env.SITE_URL || 'https://claude-code-changelog-ko.pages.dev';

  if (!botToken) {
    console.warn('⚠️  TELEGRAM_BOT_TOKEN not set, skipping Telegram notifications');
    return;
  }

  if (!chatId) {
    console.warn('⚠️  TELEGRAM_CHAT_ID not set, skipping Telegram notifications');
    return;
  }

  if (!newVersionsJson) {
    console.log('No new versions to notify');
    return;
  }

  let newVersions;
  try {
    newVersions = JSON.parse(newVersionsJson);
  } catch (error) {
    console.error('Failed to parse NEW_VERSIONS:', error.message);
    process.exit(1);
  }

  if (!Array.isArray(newVersions) || newVersions.length === 0) {
    console.log('No new versions to notify');
    return;
  }

  console.log(`Sending Telegram notifications for ${newVersions.length} version(s)...`);

  let successCount = 0;
  let failCount = 0;

  for (const version of newVersions) {
    try {
      const message = await buildMessage(version, siteUrl);

      if (!message) {
        failCount++;
        continue;
      }

      await sendTelegramMessage(botToken, chatId, message);
      console.log(`✅ Sent Telegram notification for v${version}`);
      successCount++;

      // Rate limiting: wait 1 second between messages
      if (newVersions.indexOf(version) < newVersions.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    } catch (error) {
      console.error(`❌ Failed to send notification for v${version}:`, error.message);
      failCount++;
    }
  }

  console.log(`\nTelegram notifications: ${successCount} success, ${failCount} failed`);

  if (failCount > 0) {
    process.exit(1);
  }
}

main();
