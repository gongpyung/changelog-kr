#!/usr/bin/env node

/**
 * Translation Quality Diagnostics
 * Scans all enabled services for translation quality issues.
 */

import { readFile, readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');
const SERVICES_CONFIG = join(PROJECT_ROOT, 'data', 'services.json');
const SERVICES_DIR = join(PROJECT_ROOT, 'data', 'services');
const SITE_DATA_DIR = join(PROJECT_ROOT, 'site', 'data');

async function main() {
  const config = JSON.parse(await readFile(SERVICES_CONFIG, 'utf-8'));
  const enabledServices = config.services.filter(s => s.enabled);

  console.log('=== Translation Quality Diagnostics ===\n');

  // Check stale site data
  console.log('--- Stale Site Data Check ---');
  for (const svc of enabledServices) {
    const siteFile = join(SITE_DATA_DIR, 'services', svc.id, 'translations.json');
    try {
      const siteData = JSON.parse(await readFile(siteFile, 'utf-8'));
      const generatedAt = new Date(siteData.generatedAt);

      // Find latest translation file mtime
      const transDir = join(SERVICES_DIR, svc.id, 'translations');
      const files = (await readdir(transDir)).filter(f => f.endsWith('.json'));
      let latestMtime = new Date(0);
      for (const f of files) {
        const content = JSON.parse(await readFile(join(transDir, f), 'utf-8'));
        const translatedAt = content.translatedAt ? new Date(content.translatedAt) : new Date(0);
        if (translatedAt > latestMtime) latestMtime = translatedAt;
      }

      const isStale = latestMtime > generatedAt;
      const siteVersions = siteData.versionCount || 0;
      console.log(`  ${svc.id}: site=${siteVersions}v, generated=${generatedAt.toISOString()}, latest=${latestMtime.toISOString()} ${isStale ? '⚠ STALE' : '✓ OK'}`);
    } catch {
      console.log(`  ${svc.id}: site data not found`);
    }
  }

  // Per-service diagnostics
  console.log('\n--- Per-Service Translation Quality ---');
  for (const svc of enabledServices) {
    const dir = join(SERVICES_DIR, svc.id, 'translations');
    let files;
    try {
      files = (await readdir(dir)).filter(f => f.endsWith('.json'));
    } catch {
      console.log(`  ${svc.id}: no translations directory`);
      continue;
    }

    let totalEntries = 0;
    let otherCount = 0;
    let untranslated = 0;
    const fieldUsage = { translation: 0, translated: 0, both: 0, neither: 0 };
    const categoryDist = {};
    const untranslatedExamples = [];

    for (const f of files) {
      const data = JSON.parse(await readFile(join(dir, f), 'utf-8'));
      for (const e of (data.entries || [])) {
        totalEntries++;

        // Category
        const cat = e.category || 'other';
        categoryDist[cat] = (categoryDist[cat] || 0) + 1;
        if (cat === 'other') otherCount++;

        // Field usage
        const hasTr = e.translation !== undefined && e.translation !== null && e.translation !== '';
        const hasTd = e.translated !== undefined && e.translated !== null && e.translated !== '';
        if (hasTr && hasTd) fieldUsage.both++;
        else if (hasTr) fieldUsage.translation++;
        else if (hasTd) fieldUsage.translated++;
        else fieldUsage.neither++;

        // Untranslated check
        const val = e.translated || e.translation || '';
        const koreanChars = (val.match(/[가-힣]/g) || []).length;
        if (val === '' || val === e.original || koreanChars === 0) {
          untranslated++;
          if (untranslatedExamples.length < 3) {
            untranslatedExamples.push({ version: data.version, original: (e.original || '').slice(0, 80) });
          }
        }
      }
    }

    const otherPct = totalEntries > 0 ? (otherCount / totalEntries * 100).toFixed(1) : '0.0';
    console.log(`\n  ${svc.id}: ${files.length} files, ${totalEntries} entries`);
    console.log(`    Untranslated: ${untranslated}`);
    if (untranslatedExamples.length > 0) {
      for (const ex of untranslatedExamples) {
        console.log(`      - v${ex.version}: "${ex.original}..."`);
      }
    }
    console.log(`    Field usage: translation=${fieldUsage.translation}, translated=${fieldUsage.translated}, both=${fieldUsage.both}, neither=${fieldUsage.neither}`);
    console.log(`    Category distribution:`);
    const sortedCats = Object.entries(categoryDist).sort((a, b) => b[1] - a[1]);
    for (const [cat, count] of sortedCats) {
      const pct = (count / totalEntries * 100).toFixed(1);
      console.log(`      ${cat}: ${count} (${pct}%)${cat === 'other' ? ` ← target: <35%` : ''}`);
    }
  }

  console.log('\n=== Diagnostics Complete ===');
}

main().catch(err => {
  console.error('Diagnostics failed:', err.message);
  process.exit(1);
});
