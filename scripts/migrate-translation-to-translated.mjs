#!/usr/bin/env node

/**
 * Migrate "translation" key to "translated" key
 *
 * For each entry in each translation JSON file:
 * - translated only (no translation): keep as-is
 * - translation only (no translated): copy translation → translated
 * - both exist, same value: delete translation key
 * - both exist, different value: keep translated, log conflict, delete translation
 * - finally: remove all "translation" keys from entries
 *
 * Usage:
 *   node scripts/migrate-translation-to-translated.mjs --dry-run   # Preview only
 *   node scripts/migrate-translation-to-translated.mjs --apply     # Apply changes
 */

import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = process.env.MIGRATE_BASE_DIR || join(__dirname, '..');

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const APPLY = args.includes('--apply');

if (!DRY_RUN && !APPLY) {
  console.error('Usage: node migrate-translation-to-translated.mjs [--dry-run | --apply]');
  process.exit(1);
}

/**
 * Recursively find all translation JSON files under data/services/
 */
async function findTranslationFiles(baseDir) {
  const files = [];
  const services = await readdir(baseDir);

  for (const serviceId of services) {
    const translationsDir = join(baseDir, serviceId, 'translations');
    try {
      const entries = await readdir(translationsDir);
      for (const entry of entries) {
        if (entry.endsWith('.json')) {
          files.push(join(translationsDir, entry));
        }
      }
    } catch {
      // No translations dir for this service
    }
  }

  return files;
}

/**
 * Process a single translation JSON file.
 * Returns { modified: boolean, conflictCount: number, conflicts: Array }
 */
async function processFile(filePath) {
  const content = await readFile(filePath, 'utf-8');
  const data = JSON.parse(content);

  if (!data.entries || !Array.isArray(data.entries)) {
    return { modified: false, conflictCount: 0, conflicts: [] };
  }

  let modified = false;
  const conflicts = [];

  for (const entry of data.entries) {
    const hasTranslation = Object.prototype.hasOwnProperty.call(entry, 'translation');
    const hasTranslated = Object.prototype.hasOwnProperty.call(entry, 'translated');

    if (!hasTranslation) {
      // translated only or neither — keep as-is
      continue;
    }

    if (hasTranslation && !hasTranslated) {
      // translation only → copy to translated
      entry.translated = entry.translation;
      delete entry.translation;
      modified = true;
    } else if (hasTranslation && hasTranslated) {
      if (entry.translation === entry.translated) {
        // same value → just delete translation
        delete entry.translation;
        modified = true;
      } else if (!entry.translated && entry.translation) {
        // translated is null/empty but translation has value → adopt translation
        entry.translated = entry.translation;
        delete entry.translation;
        modified = true;
      } else {
        // conflict → keep translated, log, delete translation
        conflicts.push({
          original: entry.original,
          translated: entry.translated,
          translation: entry.translation,
        });
        delete entry.translation;
        modified = true;
      }
    }
  }

  if (modified && APPLY) {
    await writeFile(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
  }

  return { modified, conflictCount: conflicts.length, conflicts };
}

async function main() {
  const mode = DRY_RUN ? '[DRY RUN]' : '[APPLY]';
  console.log(`Migration: "translation" → "translated" ${mode}\n`);

  const servicesDir = join(PROJECT_ROOT, 'data', 'services');
  const files = await findTranslationFiles(servicesDir);
  console.log(`Found ${files.length} translation files\n`);

  let totalModifiedFiles = 0;
  let totalConflicts = 0;
  const allConflicts = [];

  for (const filePath of files) {
    const { modified, conflictCount, conflicts } = await processFile(filePath);
    if (modified) {
      const rel = filePath.replace(PROJECT_ROOT + '/', '');
      console.log(`${DRY_RUN ? '[DRY] ' : '✓ '}${rel}: ${conflictCount > 0 ? `${conflictCount} conflict(s)` : 'migrated'}`);
      totalModifiedFiles++;
      totalConflicts += conflictCount;
      for (const c of conflicts) {
        allConflicts.push({ file: filePath.replace(PROJECT_ROOT + '/', ''), ...c });
      }
    }
  }

  console.log('\n' + '='.repeat(60));
  if (totalModifiedFiles === 0) {
    console.log('No files need migration. All entries already use "translated".');
  } else {
    console.log(`${DRY_RUN ? 'Would modify' : 'Modified'}: ${totalModifiedFiles} file(s)`);
    console.log(`Conflicts: ${totalConflicts}`);

    if (totalConflicts > 0) {
      const sampleSize = Math.min(5, allConflicts.length);
      console.log(`\nSample conflicts (${sampleSize}/${allConflicts.length}):`);
      for (const c of allConflicts.slice(0, sampleSize)) {
        console.log(`  File: ${c.file}`);
        console.log(`  Original: ${c.original?.slice(0, 60)}`);
        console.log(`  translated: ${c.translated?.slice(0, 60)}`);
        console.log(`  translation: ${c.translation?.slice(0, 60)}`);
        console.log('');
      }
    }

    if (DRY_RUN) {
      console.log('\nRun with --apply to apply changes.');
    }
  }
  console.log('='.repeat(60));
}

main().catch(error => {
  console.error('Fatal error:', error.message);
  process.exit(1);
});
