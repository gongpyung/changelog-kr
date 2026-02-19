#!/usr/bin/env node

/**
 * Retroactive category re-classification for all enabled services.
 * Uses the updated inferCategory() Two-Phase Bold Label algorithm.
 *
 * Usage:
 *   DRY_RUN=true node scripts/fix-categories.mjs    # Preview only
 *   node scripts/fix-categories.mjs                 # Apply changes to all services
 *   node scripts/fix-categories.mjs --service oh-my-claudecode  # Single service only
 */

import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inferCategory } from './utils/releases-parser.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');
const SERVICES_CONFIG = join(PROJECT_ROOT, 'data', 'services.json');
const SERVICES_DIR = join(PROJECT_ROOT, 'data', 'services');
const DRY_RUN = process.env.DRY_RUN === 'true';

// Parse --service <id> argument
function getServiceFilter() {
  const args = process.argv.slice(2);
  const serviceIdx = args.indexOf('--service');
  if (serviceIdx !== -1 && args[serviceIdx + 1]) {
    return args[serviceIdx + 1];
  }
  return null;
}

const SERVICE_FILTER = getServiceFilter();

async function processService(serviceId) {
  const translationsDir = join(SERVICES_DIR, serviceId, 'translations');

  let files;
  try {
    files = await readdir(translationsDir);
  } catch {
    // No translations directory
    return { changedFiles: 0, changedEntries: 0, before: {}, after: {} };
  }

  const jsonFiles = files.filter(f => f.endsWith('.json'));
  if (jsonFiles.length === 0) {
    return { changedFiles: 0, changedEntries: 0, before: {}, after: {} };
  }

  let changedFiles = 0;
  let changedEntries = 0;
  const before = {};
  const after = {};

  for (const filename of jsonFiles) {
    const filePath = join(translationsDir, filename);
    const raw = await readFile(filePath, 'utf-8');
    const data = JSON.parse(raw);

    if (!Array.isArray(data.entries)) continue;

    let fileChanged = false;
    for (const entry of data.entries) {
      const text = entry.original || entry.text || '';
      const oldCat = entry.category || 'other';

      // Track before distribution
      before[oldCat] = (before[oldCat] || 0) + 1;

      // Only re-classify entries currently categorized as 'other'.
      // Entries classified by section headings (### Added, ### Fixed, etc.)
      // are already correct and should NOT be overridden by inferCategory().
      if (oldCat !== 'other') continue;

      const newCat = inferCategory(text);
      if (newCat !== 'other') {
        entry.category = newCat;
        fileChanged = true;
        changedEntries++;
      }
    }

    if (fileChanged) {
      changedFiles++;
      if (!DRY_RUN) {
        await writeFile(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
      }
    }
  }

  // Compute after distribution: start from before, apply changes
  const afterDist = { ...before };
  for (const filename of jsonFiles) {
    const filePath = join(translationsDir, filename);
    const raw = await readFile(filePath, 'utf-8');
    const data = JSON.parse(raw);
    if (!Array.isArray(data.entries)) continue;
    for (const entry of data.entries) {
      const text = entry.original || entry.text || '';
      const oldCat = entry.category || 'other';
      if (oldCat !== 'other') continue;
      const newCat = inferCategory(text);
      if (newCat !== 'other') {
        afterDist['other'] = (afterDist['other'] || 0) - 1;
        afterDist[newCat] = (afterDist[newCat] || 0) + 1;
      }
    }
  }

  return { changedFiles, changedEntries, before, after: afterDist };
}

async function main() {
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no files written)' : 'APPLY changes'}`);
  if (SERVICE_FILTER) {
    console.log(`Filter: --service ${SERVICE_FILTER}\n`);
  } else {
    console.log('Filter: all services\n');
  }

  const configRaw = await readFile(SERVICES_CONFIG, 'utf-8');
  const { services } = JSON.parse(configRaw);
  let enabled = services.filter(s => s.enabled);

  // Apply --service filter if specified
  if (SERVICE_FILTER) {
    enabled = enabled.filter(s => s.id === SERVICE_FILTER);
    if (enabled.length === 0) {
      console.error(`Service "${SERVICE_FILTER}" not found or not enabled.`);
      process.exit(1);
    }
  }

  let totalChangedFiles = 0;
  let totalChangedEntries = 0;

  for (const service of enabled) {
    const { changedFiles, changedEntries, before, after } = await processService(service.id);

    console.log(`=== ${service.name} (${service.id}) ===`);
    console.log(`  Changed files:   ${changedFiles}`);
    console.log(`  Changed entries: ${changedEntries}`);

    // Print category distribution table
    const allCats = new Set([...Object.keys(before), ...Object.keys(after)]);
    if (allCats.size > 0) {
      console.log('  Category distribution:');
      for (const cat of ['added', 'fixed', 'improved', 'changed', 'removed', 'other']) {
        if (!allCats.has(cat)) continue;
        const b = before[cat] || 0;
        const a = after[cat] || 0;
        const marker = b !== a ? ' *' : '';
        console.log(`    ${cat.padEnd(10)}: ${String(b).padStart(4)} → ${String(a).padStart(4)}${marker}`);
      }
    }
    console.log();

    totalChangedFiles += changedFiles;
    totalChangedEntries += changedEntries;
  }

  console.log('=== Grand Total ===');
  console.log(`  Changed files:   ${totalChangedFiles}`);
  console.log(`  Changed entries: ${totalChangedEntries}`);
  if (DRY_RUN) {
    console.log('\n[DRY RUN] No files were modified. Run without DRY_RUN=true to apply.');
  }
}

main().catch(err => { console.error(err); process.exit(1); });
