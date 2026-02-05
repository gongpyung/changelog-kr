/**
 * Translate changelog entries using Google Cloud Translation API
 * Usage:
 *   NEW_VERSIONS='["2.1.31","2.1.32"]' node scripts/translate.mjs
 *   node scripts/translate.mjs  (translates all untranslated versions)
 */

import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { translateBatch } from './utils/translation-client.mjs';
import { translateWithGemini } from './utils/gemini-translation-client.mjs';
import { translateWithOpenAI } from './utils/openai-translation-client.mjs';

const DATA_DIR = 'data';
const TRANSLATIONS_DIR = join(DATA_DIR, 'translations');
const VERSIONS_FILE = join(DATA_DIR, 'versions.json');

/**
 * Create mock translations for development/testing
 */
function createMockTranslations(texts) {
  return {
    translations: texts.map(text => text),
    charCount: texts.reduce((sum, text) => sum + text.length, 0),
  };
}

/**
 * Translate a single version's changelog entries
 * @param {string} version - Version to translate
 * @param {'mock' | 'google' | 'gemini'} engine - Translation engine to use
 */
async function translateVersion(version, engine = 'mock') {
  const filePath = join(TRANSLATIONS_DIR, `${version}.json`);

  console.log(`\nProcessing version ${version}...`);

  // Read existing translation file
  let data;
  try {
    const content = await readFile(filePath, 'utf-8');
    data = JSON.parse(content);
  } catch (error) {
    console.error(`  ✗ Failed to read ${filePath}: ${error.message}`);
    return null;
  }

  // Check if already translated
  if (data.entries && data.entries.length > 0 && data.entries[0].translation) {
    console.log(`  ℹ Already translated, skipping...`);
    return null;
  }

  // Extract texts to translate
  const textsToTranslate = data.entries.map(entry => entry.original);

  if (textsToTranslate.length === 0) {
    console.log(`  ℹ No entries to translate, skipping...`);
    return null;
  }

  console.log(`  → Translating ${textsToTranslate.length} entries with ${engine}...`);

  // Translate
  let result;
  try {
    if (engine === 'openai') {
      result = await translateWithOpenAI(textsToTranslate);
    } else if (engine === 'gemini') {
      result = await translateWithGemini(textsToTranslate);
    } else if (engine === 'google') {
      result = await translateBatch(textsToTranslate);
    } else {
      console.log('  ℹ Using mock translations (no API key)');
      result = createMockTranslations(textsToTranslate);
    }
  } catch (error) {
    console.error(`  ✗ Translation failed: ${error.message}`);
    return null;
  }

  // Add translations to entries
  data.entries.forEach((entry, index) => {
    entry.translation = result.translations[index];
  });

  // Update metadata
  data.translatedAt = new Date().toISOString();
  data.translationEngine = engine;
  data.translationCharCount = result.charCount;

  // Write back
  await writeFile(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8');

  console.log(`  ✓ Translated ${result.translations.length} entries (${result.charCount} chars)`);

  return {
    version,
    charCount: result.charCount,
    entryCount: result.translations.length,
  };
}

/**
 * Get list of versions to translate
 */
async function getVersionsToTranslate() {
  // Check for NEW_VERSIONS environment variable
  if (process.env.NEW_VERSIONS) {
    try {
      const versions = JSON.parse(process.env.NEW_VERSIONS);
      if (!Array.isArray(versions)) {
        throw new Error('NEW_VERSIONS must be a JSON array');
      }
      console.log(`Using NEW_VERSIONS from environment: ${versions.join(', ')}`);
      return versions;
    } catch (error) {
      console.error(`Error parsing NEW_VERSIONS: ${error.message}`);
      process.exit(1);
    }
  }

  // Otherwise, find all untranslated versions
  console.log('No NEW_VERSIONS specified, finding untranslated versions...');

  const versionsData = JSON.parse(await readFile(VERSIONS_FILE, 'utf-8'));
  const untranslated = versionsData.versions.filter(v => !v.translatedAt);

  console.log(`Found ${untranslated.length} untranslated versions`);
  return untranslated.map(v => v.version);
}

/**
 * Update versions.json with translation metadata
 */
async function updateVersionsMetadata(translatedVersions) {
  const versionsData = JSON.parse(await readFile(VERSIONS_FILE, 'utf-8'));

  translatedVersions.forEach(({ version, charCount, entryCount }) => {
    const versionEntry = versionsData.versions.find(v => v.version === version);
    if (versionEntry) {
      versionEntry.translatedAt = new Date().toISOString();
      versionEntry.translationCharCount = charCount;
      versionEntry.translationEntryCount = entryCount;
    }
  });

  await writeFile(VERSIONS_FILE, JSON.stringify(versionsData, null, 2) + '\n', 'utf-8');
  console.log(`\n✓ Updated ${VERSIONS_FILE} with translation metadata`);
}

/**
 * Determine which translation engine to use
 */
function getTranslationEngine() {
  if (process.env.OPENAI_API_KEY) {
    return 'openai';
  }
  if (process.env.GEMINI_API_KEY) {
    return 'gemini';
  }
  if (process.env.GOOGLE_TRANSLATE_API_KEY) {
    return 'google';
  }
  return 'mock';
}

/**
 * Main function
 */
async function main() {
  console.log('Claude Code Changelog Translator\n');

  const versions = await getVersionsToTranslate();

  if (versions.length === 0) {
    console.log('No versions to translate.');
    return;
  }

  // Determine translation engine
  const engine = getTranslationEngine();

  if (engine === 'openai') {
    console.log('✓ Using OpenAI GPT-4o-mini for translation\n');
  } else if (engine === 'gemini') {
    console.log('✓ Using Gemini API for translation\n');
  } else if (engine === 'google') {
    console.log('✓ Using Google Translate API\n');
  } else {
    console.log('⚠ No API key set - using mock translations');
    console.log('  Set OPENAI_API_KEY, GEMINI_API_KEY, or GOOGLE_TRANSLATE_API_KEY\n');
  }

  // Translate each version
  const results = [];
  for (const version of versions) {
    const result = await translateVersion(version, engine);
    if (result) {
      results.push(result);
    }
  }

  // Update versions.json
  if (results.length > 0) {
    await updateVersionsMetadata(results);

    const totalChars = results.reduce((sum, r) => sum + r.charCount, 0);
    const totalEntries = results.reduce((sum, r) => sum + r.entryCount, 0);

    console.log('\n' + '='.repeat(60));
    console.log(`✓ Translation complete!`);
    console.log(`  Versions: ${results.length}`);
    console.log(`  Entries: ${totalEntries}`);
    console.log(`  Characters: ${totalChars.toLocaleString()}`);
    console.log('='.repeat(60));
  } else {
    console.log('\nNo translations were performed.');
  }
}

main().catch(error => {
  console.error('\n✗ Fatal error:', error.message);
  process.exit(1);
});
