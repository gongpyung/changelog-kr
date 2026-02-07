/**
 * One-time script to fix category fields in oh-my-claudecode translation files
 *
 * Problem: Existing translation files have all entries with category: "other" because
 * the parser didn't recognize ### Added/Fixed/Changed headings initially.
 *
 * Solution: Re-parse the raw CHANGELOG.md and update ONLY the category fields
 * in existing translation files, preserving all translations.
 *
 * Usage: node scripts/fix-categories.mjs
 */

import { readFile, writeFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parseChangelog } from './utils/changelog-parser.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');

const RAW_CHANGELOG_PATH = join(PROJECT_ROOT, 'data/services/oh-my-claudecode/raw/CHANGELOG.md');
const TRANSLATIONS_DIR = join(PROJECT_ROOT, 'data/services/oh-my-claudecode/translations');

/**
 * Match entry by exact text comparison (original text should match parsed text)
 */
function matchByText(translationEntry, parsedEntries) {
  return parsedEntries.find(p => p.text === translationEntry.original);
}

/**
 * Match entry by index position (fallback when text doesn't match exactly)
 */
function matchByIndex(index, parsedEntries) {
  return parsedEntries[index] || null;
}

/**
 * Update category fields in a translation file
 */
async function updateTranslationFile(version, parsedVersion) {
  const filePath = join(TRANSLATIONS_DIR, `${version}.json`);

  try {
    const content = await readFile(filePath, 'utf-8');
    const translationData = JSON.parse(content);

    let updatedCount = 0;
    let exactMatches = 0;
    let indexMatches = 0;

    // Update each entry's category
    translationData.entries = translationData.entries.map((entry, index) => {
      // Try exact text match first
      let parsedEntry = matchByText(entry, parsedVersion.entries);

      if (parsedEntry) {
        exactMatches++;
      } else {
        // Fallback to index-based matching
        parsedEntry = matchByIndex(index, parsedVersion.entries);
        if (parsedEntry) {
          indexMatches++;
        }
      }

      // Update category if we found a match and it's different
      if (parsedEntry && entry.category !== parsedEntry.category) {
        updatedCount++;
        return {
          ...entry,
          category: parsedEntry.category
        };
      }

      return entry;
    });

    // Write back the updated file
    await writeFile(filePath, JSON.stringify(translationData, null, 2) + '\n', 'utf-8');

    return {
      version,
      updated: updatedCount,
      exactMatches,
      indexMatches,
      total: translationData.entries.length
    };
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null; // File doesn't exist, skip
    }
    throw error;
  }
}

/**
 * Main execution
 */
async function main() {
  console.log('🔧 Fixing category fields in oh-my-claudecode translation files...\n');

  // Read and parse the raw CHANGELOG
  console.log('📖 Reading raw CHANGELOG.md...');
  const rawChangelog = await readFile(RAW_CHANGELOG_PATH, 'utf-8');

  console.log('🔍 Parsing changelog...');
  const parsedVersions = parseChangelog(rawChangelog);
  console.log(`   Found ${parsedVersions.length} versions\n`);

  // Update each version's translation file
  console.log('📝 Updating translation files...\n');

  let totalFilesUpdated = 0;
  let totalEntriesUpdated = 0;
  let totalExactMatches = 0;
  let totalIndexMatches = 0;

  for (const parsedVersion of parsedVersions) {
    const result = await updateTranslationFile(parsedVersion.version, parsedVersion);

    if (result) {
      if (result.updated > 0) {
        console.log(`✅ ${result.version}: Updated ${result.updated}/${result.total} entries (${result.exactMatches} exact, ${result.indexMatches} by index)`);
        totalFilesUpdated++;
        totalEntriesUpdated += result.updated;
      } else {
        console.log(`⏭️  ${result.version}: No updates needed (${result.exactMatches} exact, ${result.indexMatches} by index)`);
      }
      totalExactMatches += result.exactMatches;
      totalIndexMatches += result.indexMatches;
    } else {
      console.log(`⚠️  ${parsedVersion.version}: Translation file not found, skipping`);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log(`✨ Complete!`);
  console.log(`   Files updated: ${totalFilesUpdated}`);
  console.log(`   Entries updated: ${totalEntriesUpdated}`);
  console.log(`   Matching: ${totalExactMatches} exact, ${totalIndexMatches} by index`);
  console.log('='.repeat(60));
}

main().catch(error => {
  console.error('❌ Error:', error);
  process.exit(1);
});
