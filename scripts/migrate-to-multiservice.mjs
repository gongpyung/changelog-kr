#!/usr/bin/env node

/**
 * Migration script: Move to multi-service structure
 * Moves data/translations/*.json -> data/services/claude-code/translations/
 */

import { readdir, mkdir, copyFile, rm, stat } from 'node:fs/promises';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');

const OLD_TRANSLATIONS_DIR = join(PROJECT_ROOT, 'data', 'translations');
const BACKUP_DIR = join(PROJECT_ROOT, 'data', 'translations.backup');
const NEW_TRANSLATIONS_DIR = join(PROJECT_ROOT, 'data', 'services', 'claude-code', 'translations');

async function fileExists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function copyDir(src, dest) {
  await mkdir(dest, { recursive: true });
  const files = await readdir(src);
  for (const file of files) {
    await copyFile(join(src, file), join(dest, file));
  }
  return files.length;
}

async function migrate() {
  console.log('');
  console.log('========================================');
  console.log('  Multi-Service Migration Script');
  console.log('========================================');
  console.log('');

  // Check if already migrated
  if (await fileExists(NEW_TRANSLATIONS_DIR)) {
    const files = await readdir(NEW_TRANSLATIONS_DIR);
    if (files.length > 0) {
      console.log('Migration already completed. Found', files.length, 'files in new location.');
      return;
    }
  }

  // Check source exists
  if (!(await fileExists(OLD_TRANSLATIONS_DIR))) {
    console.error('Source directory not found:', OLD_TRANSLATIONS_DIR);
    process.exit(1);
  }

  // Step 1: Create backup
  console.log('[1/4] Creating backup...');
  if (await fileExists(BACKUP_DIR)) {
    console.log('  Backup already exists, skipping...');
  } else {
    const backupCount = await copyDir(OLD_TRANSLATIONS_DIR, BACKUP_DIR);
    console.log(`  Backed up ${backupCount} files to ${BACKUP_DIR}`);
  }

  // Step 2: Create new directory structure
  console.log('[2/4] Creating new directory structure...');
  await mkdir(NEW_TRANSLATIONS_DIR, { recursive: true });
  console.log('  Created:', NEW_TRANSLATIONS_DIR);

  // Step 3: Move files
  console.log('[3/4] Moving translation files...');
  const files = await readdir(OLD_TRANSLATIONS_DIR);
  const jsonFiles = files.filter(f => f.endsWith('.json'));

  for (const file of jsonFiles) {
    await copyFile(
      join(OLD_TRANSLATIONS_DIR, file),
      join(NEW_TRANSLATIONS_DIR, file)
    );
  }
  console.log(`  Moved ${jsonFiles.length} files`);

  // Step 4: Verify
  console.log('[4/4] Verifying migration...');
  const movedFiles = await readdir(NEW_TRANSLATIONS_DIR);
  const movedJsonFiles = movedFiles.filter(f => f.endsWith('.json'));

  if (movedJsonFiles.length === jsonFiles.length) {
    console.log(`  ✓ Verified: ${movedJsonFiles.length} files migrated successfully`);
  } else {
    console.error(`  ✗ Verification failed: expected ${jsonFiles.length}, got ${movedJsonFiles.length}`);
    process.exit(1);
  }

  // Clean up old directory (optional - keep for now)
  // await rm(OLD_TRANSLATIONS_DIR, { recursive: true });

  console.log('');
  console.log('========================================');
  console.log('  Migration Complete!');
  console.log('========================================');
  console.log('');
  console.log('Note: Original files kept in data/translations/');
  console.log('      Backup created at data/translations.backup/');
  console.log('      New location: data/services/claude-code/translations/');
  console.log('');
}

migrate().catch(error => {
  console.error('Migration failed:', error);
  process.exit(1);
});
