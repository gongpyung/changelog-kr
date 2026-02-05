#!/usr/bin/env node

import { readFile } from 'fs/promises';
import { resolve } from 'path';

/**
 * Send email via Resend API
 */
async function sendEmail(apiKey, from, to, subject, html) {
  const url = 'https://api.resend.com/emails';

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from,
      to,
      subject,
      html
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Resend API error: ${response.status} ${error}`);
  }

  return response.json();
}

/**
 * Format changelog entries as HTML
 */
function formatEntriesHtml(entries) {
  const categoryColors = {
    added: '#10b981',
    fixed: '#3b82f6',
    improved: '#8b5cf6',
    changed: '#f97316',
    removed: '#ef4444'
  };

  const categoryLabels = {
    added: '추가',
    fixed: '수정',
    improved: '개선',
    changed: '변경',
    removed: '제거'
  };

  return entries.map(entry => {
    const color = categoryColors[entry.category] || '#6b7280';
    const label = categoryLabels[entry.category] || entry.category;
    const scope = entry.scope
      ? `<span style="display:inline-block;background:#e5e7eb;color:#374151;padding:2px 6px;border-radius:3px;font-size:11px;margin-left:8px;">${escapeHtml(entry.scope)}</span>`
      : '';
    const description = escapeHtml(entry.translation || entry.original || '');

    return `
      <div style="margin-bottom:16px;padding-left:8px;border-left:3px solid ${color};">
        <div style="margin-bottom:4px;">
          <span style="display:inline-block;background:${color};color:white;padding:2px 8px;border-radius:3px;font-size:11px;font-weight:600;">${label}</span>
          ${scope}
        </div>
        <div style="color:#374151;line-height:1.5;">${description}</div>
      </div>
    `;
  }).join('');
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, m => map[m]);
}

/**
 * Render email template
 */
async function renderTemplate(version, entries, siteUrl) {
  const templatePath = resolve(process.cwd(), 'templates/email.html.template');

  let template;
  try {
    template = await readFile(templatePath, 'utf-8');
  } catch (error) {
    console.error('Failed to read email template:', error.message);
    throw error;
  }

  const entriesHtml = formatEntriesHtml(entries);
  const date = new Date().toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  return template
    .replace(/{{VERSION}}/g, escapeHtml(version))
    .replace(/{{ENTRIES}}/g, entriesHtml)
    .replace(/{{SITE_URL}}/g, escapeHtml(siteUrl))
    .replace(/{{DATE}}/g, date);
}

/**
 * Main function
 */
async function main() {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.NOTIFY_EMAIL_FROM;
  const toList = process.env.NOTIFY_EMAIL_TO;
  const newVersionsJson = process.env.NEW_VERSIONS;
  const siteUrl = process.env.SITE_URL || 'https://claude-code-changelog-ko.pages.dev';

  if (!apiKey) {
    console.warn('⚠️  RESEND_API_KEY not set, skipping email notifications');
    return;
  }

  if (!from) {
    console.warn('⚠️  NOTIFY_EMAIL_FROM not set, skipping email notifications');
    return;
  }

  if (!toList) {
    console.warn('⚠️  NOTIFY_EMAIL_TO not set, skipping email notifications');
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

  const recipients = toList.split(',').map(email => email.trim()).filter(Boolean);
  if (recipients.length === 0) {
    console.warn('⚠️  No valid email recipients found');
    return;
  }

  console.log(`Sending email notifications for ${newVersions.length} version(s) to ${recipients.length} recipient(s)...`);

  let successCount = 0;
  let failCount = 0;

  for (const version of newVersions) {
    try {
      const translationPath = resolve(process.cwd(), `data/translations/${version}.json`);

      let entries;
      try {
        const data = await readFile(translationPath, 'utf-8');
        const parsed = JSON.parse(data);
        entries = parsed.entries;
      } catch (error) {
        console.error(`Failed to read translation for ${version}:`, error.message);
        failCount++;
        continue;
      }

      if (!entries || entries.length === 0) {
        console.warn(`No entries found for version ${version}`);
        failCount++;
        continue;
      }

      const html = await renderTemplate(version, entries, siteUrl);
      const subject = `Claude Code v${version} 업데이트 - 한국어 번역`;

      await sendEmail(apiKey, from, recipients, subject, html);
      console.log(`✅ Sent email notification for v${version}`);
      successCount++;

      // Rate limiting: wait 1 second between emails
      if (newVersions.indexOf(version) < newVersions.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    } catch (error) {
      console.error(`❌ Failed to send email for v${version}:`, error.message);
      failCount++;
    }
  }

  console.log(`\nEmail notifications: ${successCount} success, ${failCount} failed`);

  if (failCount > 0) {
    process.exit(1);
  }
}

main();
