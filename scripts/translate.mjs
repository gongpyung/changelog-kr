/**
 * Translate changelog entries for multiple services
 *
 * Usage:
 *   NEW_VERSIONS_MAP='{"claude-code":["2.1.31"],"gemini-cli":["0.27.2"]}' node scripts/translate.mjs
 *   NEW_VERSIONS='["2.1.31","2.1.32"]' node scripts/translate.mjs  (backward compat: defaults to claude-code)
 *   node scripts/translate.mjs  (translates all untranslated versions across all services)
 *
 * Environment variables:
 *   NEW_VERSIONS_MAP  - JSON object: {"service-id": ["version1", "version2"]}
 *   NEW_VERSIONS      - JSON array (backward compat, defaults to claude-code service)
 *   OPENAI_API_KEY    - Use OpenAI GPT-4o-mini
 *   GEMINI_API_KEY    - Use Gemini API
 *   GOOGLE_TRANSLATE_API_KEY - Use Google Translate v2
 */

import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { translateBatch } from './utils/translation-client.mjs';
import { translateWithGemini } from './utils/gemini-translation-client.mjs';
import { translateWithOpenAI } from './utils/openai-translation-client.mjs';

const SERVICES_FILE = join('data', 'services.json');

/**
 * Get per-service data paths
 */
function getServicePaths(serviceId) {
  const serviceDir = join('data', 'services', serviceId);
  return {
    versionsFile: join(serviceDir, 'versions.json'),
    translationsDir: join(serviceDir, 'translations'),
  };
}

/**
 * Load enabled services from services.json
 */
async function loadServices() {
  const content = await readFile(SERVICES_FILE, 'utf-8');
  const data = JSON.parse(content);
  return data.services.filter(s => s.enabled && s.changelogType);
}

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
 * @param {string} serviceId - Service ID
 * @param {string} serviceName - Service display name (for logging)
 * @param {string} version - Version to translate
 * @param {'mock' | 'google' | 'gemini' | 'openai'} engine - Translation engine to use
 */
async function translateVersion(serviceId, serviceName, version, engine = 'mock') {
  const { translationsDir } = getServicePaths(serviceId);
  const filePath = join(translationsDir, `${version}.json`);

  console.log(`\n  [${serviceName}] Processing version ${version}...`);

  // Read existing translation file
  let data;
  try {
    const content = await readFile(filePath, 'utf-8');
    data = JSON.parse(content);
  } catch (error) {
    console.error(`    Failed to read ${filePath}: ${error.message}`);
    return null;
  }

  // Extract texts to translate
  const textsToTranslate = data.entries.map(entry => entry.original);

  if (textsToTranslate.length === 0) {
    console.log(`    No entries to translate, skipping...`);
    return null;
  }

  console.log(`    Translating ${textsToTranslate.length} entries with ${engine}...`);

  // Translate
  let result;
  try {
    if (engine === 'openai') {
      // NOTE: Translation clients currently have hardcoded "Claude Code" in prompts.
      // Dynamic service name injection requires updating translation-client files (separate task).
      result = await translateWithOpenAI(textsToTranslate);
    } else if (engine === 'gemini') {
      result = await translateWithGemini(textsToTranslate);
    } else if (engine === 'google') {
      result = await translateBatch(textsToTranslate);
    } else {
      console.log('    Using mock translations (no API key)');
      result = createMockTranslations(textsToTranslate);
    }
  } catch (error) {
    console.error(`    Translation failed: ${error.message}`);
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

  console.log(`    Translated ${result.translations.length} entries (${result.charCount} chars)`);

  return {
    version,
    charCount: result.charCount,
    entryCount: result.translations.length,
  };
}

/**
 * Build the service-to-versions map to translate.
 * Priority:
 *   1. NEW_VERSIONS_MAP env: {"service-id": ["v1", "v2"]}
 *   2. NEW_VERSIONS env: ["v1", "v2"] (backward compat, defaults to claude-code)
 *   3. Scan all enabled services for untranslated versions
 */
async function getVersionsMap() {
  // Priority 1: NEW_VERSIONS_MAP
  if (process.env.NEW_VERSIONS_MAP) {
    try {
      const map = JSON.parse(process.env.NEW_VERSIONS_MAP);
      if (typeof map !== 'object' || Array.isArray(map)) {
        throw new Error('NEW_VERSIONS_MAP must be a JSON object');
      }
      console.log('Using NEW_VERSIONS_MAP from environment');
      for (const [id, versions] of Object.entries(map)) {
        console.log(`  ${id}: ${versions.join(', ')}`);
      }
      return map;
    } catch (error) {
      console.error(`Error parsing NEW_VERSIONS_MAP: ${error.message}`);
      process.exit(1);
    }
  }

  // Priority 2: NEW_VERSIONS (backward compat -> claude-code)
  if (process.env.NEW_VERSIONS) {
    try {
      const versions = JSON.parse(process.env.NEW_VERSIONS);
      if (!Array.isArray(versions)) {
        throw new Error('NEW_VERSIONS must be a JSON array');
      }
      console.log(`Using NEW_VERSIONS from environment (defaulting to claude-code): ${versions.join(', ')}`);
      return { 'claude-code': versions };
    } catch (error) {
      console.error(`Error parsing NEW_VERSIONS: ${error.message}`);
      process.exit(1);
    }
  }

  // Priority 3: Scan all services for untranslated versions
  console.log('No version env vars specified, scanning all services for untranslated versions...\n');
  const services = await loadServices();
  const map = {};

  for (const service of services) {
    const { versionsFile } = getServicePaths(service.id);
    try {
      const versionsData = JSON.parse(await readFile(versionsFile, 'utf-8'));
      const untranslated = (versionsData.versions || []).filter(v => v.translationStatus !== 'completed');

      if (untranslated.length > 0) {
        map[service.id] = untranslated.map(v => v.version);
        console.log(`  ${service.name}: ${untranslated.length} untranslated version(s)`);
      } else {
        console.log(`  ${service.name}: all versions translated`);
      }
    } catch {
      console.log(`  ${service.name}: no versions.json found, skipping`);
    }
  }

  return map;
}

/**
 * Update service-specific versions.json with translation metadata
 */
async function updateVersionsMetadata(serviceId, translatedVersions) {
  const { versionsFile } = getServicePaths(serviceId);
  const versionsData = JSON.parse(await readFile(versionsFile, 'utf-8'));

  translatedVersions.forEach(({ version, charCount, entryCount }) => {
    const versionEntry = versionsData.versions.find(v => v.version === version);
    if (versionEntry) {
      versionEntry.translatedAt = new Date().toISOString();
      versionEntry.translationStatus = 'completed';
      versionEntry.translationCharCount = charCount;
      versionEntry.translationEntryCount = entryCount;
    }
  });

  await writeFile(versionsFile, JSON.stringify(versionsData, null, 2) + '\n', 'utf-8');
  console.log(`  Updated ${versionsFile} with translation metadata`);
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
 * Resolve service ID to display name from services.json
 */
async function loadServiceNameMap() {
  const content = await readFile(SERVICES_FILE, 'utf-8');
  const data = JSON.parse(content);
  const nameMap = {};
  for (const s of data.services) {
    nameMap[s.id] = s.name;
  }
  return nameMap;
}

/**
 * Main function
 */
async function main() {
  console.log('Multi-Service Changelog Translator\n');

  const versionsMap = await getVersionsMap();

  // Check if there's anything to translate
  const totalVersions = Object.values(versionsMap).reduce((sum, arr) => sum + arr.length, 0);
  if (totalVersions === 0) {
    console.log('No versions to translate.');
    return;
  }

  // Determine translation engine
  const engine = getTranslationEngine();

  if (engine === 'openai') {
    console.log('\nUsing OpenAI GPT-4o-mini for translation\n');
  } else if (engine === 'gemini') {
    console.log('\nUsing Gemini API for translation\n');
  } else if (engine === 'google') {
    console.log('\nUsing Google Translate API\n');
  } else {
    console.log('\nNo API key set - using mock translations');
    console.log('  Set OPENAI_API_KEY, GEMINI_API_KEY, or GOOGLE_TRANSLATE_API_KEY\n');
  }

  // Load service names for logging
  const serviceNames = await loadServiceNameMap();

  // Translate each service's versions
  let grandTotalChars = 0;
  let grandTotalEntries = 0;
  let grandTotalVersions = 0;

  for (const [serviceId, versions] of Object.entries(versionsMap)) {
    const serviceName = serviceNames[serviceId] || serviceId;
    console.log(`\n--- ${serviceName} (${serviceId}) ---`);
    console.log(`  ${versions.length} version(s) to translate`);

    const results = [];
    for (const version of versions) {
      const result = await translateVersion(serviceId, serviceName, version, engine);
      if (result) {
        results.push(result);
      }
    }

    // Update versions.json for this service
    if (results.length > 0) {
      await updateVersionsMetadata(serviceId, results);

      const serviceChars = results.reduce((sum, r) => sum + r.charCount, 0);
      const serviceEntries = results.reduce((sum, r) => sum + r.entryCount, 0);
      grandTotalChars += serviceChars;
      grandTotalEntries += serviceEntries;
      grandTotalVersions += results.length;

      console.log(`  ${serviceName}: ${results.length} version(s), ${serviceEntries} entries, ${serviceChars.toLocaleString()} chars`);
    } else {
      console.log(`  ${serviceName}: no translations performed`);
    }
  }

  // Grand summary
  console.log('\n' + '='.repeat(60));
  if (grandTotalVersions > 0) {
    console.log('Translation complete!');
    console.log(`  Services: ${Object.keys(versionsMap).length}`);
    console.log(`  Versions: ${grandTotalVersions}`);
    console.log(`  Entries: ${grandTotalEntries}`);
    console.log(`  Characters: ${grandTotalChars.toLocaleString()}`);
  } else {
    console.log('No translations were performed.');
  }
  console.log('='.repeat(60));
}

main().catch(error => {
  console.error('\nFatal error:', error.message);
  process.exit(1);
});
