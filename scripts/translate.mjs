/**
 * Translate changelog entries for multiple services
 *
 * Usage:
 *   NEW_VERSIONS_MAP='{"claude-code":["2.1.31"],"gemini-cli":["0.27.2"]}' node scripts/translate.mjs
 *   node scripts/translate.mjs  (translates all untranslated versions across all services)
 *
 * Environment variables:
 *   NEW_VERSIONS_MAP           - JSON object: {"service-id": ["version1", "version2"]}
 *   TRANSLATION_ENGINE         - 'auto' (default), 'gemini', 'glm', 'openai', 'google', 'mock'
 *                                 'auto': uses first available provider in TRANSLATION_FALLBACK_CHAIN
 *                                 Invalid values cause an immediate error (fail-fast).
 *   TRANSLATION_FALLBACK_CHAIN - Comma-separated provider order (default: 'gemini,glm,openai,google,mock')
 *   GEMINI_API_KEY             - Gemini API (multi-model chain: gemini-3-flash → gemini-2.5-flash)
 *   GLM_API_KEY / ZAI_API_KEY  - GLM API (OpenAI-compatible, model via GLM_MODEL, default: glm-5)
 *   OPENAI_API_KEY             - OpenAI API (model via OPENAI_MODEL, default: gpt-4o)
 *   GOOGLE_TRANSLATE_API_KEY   - Google Translate v2
 */

import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { translateBatch } from './utils/translation-client.mjs';
import { translateWithGemini, QuotaExhaustedError, PartialTranslationError } from './utils/gemini-translation-client.mjs';
import { translateWithOpenAI } from './utils/openai-translation-client.mjs';
import { createMockTranslations, translateWithGeminiChain, GEMINI_MODELS } from './utils/translation-provider.mjs';
import { stripPrefix } from './fix-translation-prefixes.mjs';
import { parseFallbackChain, getDefaultFallbackChain, selectPrimaryEngine, getFallbackProviders, isProviderAvailable } from './utils/fallback-chain.mjs';

let translateWithGlm;
try {
  const glmModule = await import('./utils/glm-translation-client.mjs');
  translateWithGlm = glmModule.translateWithGlm;
} catch {
  // GLM provider not available
}

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
 * Load multiple version files for a service.
 * Returns array of { version, filePath, data } for versions that have entries.
 */
async function loadVersionFiles(serviceId, versions) {
  const { translationsDir } = getServicePaths(serviceId);
  const loaded = [];

  for (const version of versions) {
    const filePath = join(translationsDir, `${version}.json`);
    try {
      const content = await readFile(filePath, 'utf-8');
      const data = JSON.parse(content);
      if (data.entries && data.entries.length > 0) {
        loaded.push({ version, filePath, data });
      } else {
        console.log(`    [${version}] No entries, skipping`);
      }
    } catch (error) {
      console.error(`    [${version}] Failed to read ${filePath}: ${error.message}`);
    }
  }

  return loaded;
}

/**
 * Load enabled services from services.json
 */
async function loadServices() {
  const content = await readFile(SERVICES_FILE, 'utf-8');
  const data = JSON.parse(content);
  return data.services.filter(s => s.enabled && s.changelogType);
}

// createMockTranslations is now imported from translation-provider.mjs

/**
 * Log quality warnings after a translation batch.
 * Warns when a translation is empty/null or identical to the original English text.
 * Returns { warnings: number, isPoorQuality: boolean }.
 * isPoorQuality is true if >10% of translations are problematic.
 *
 * @param {string[]} originals - Source texts (same order as translations)
 * @param {string[]} translations - Translated texts
 * @param {string} context - Label for log messages (e.g. version or service name)
 * @returns {{ warnings: number, isPoorQuality: boolean }}
 */
function checkTranslationQuality(originals, translations, context) {
  const POOR_QUALITY_THRESHOLD = 0.05; // 5% 이상 문제 시 poor quality
  let warnings = 0;

  for (let i = 0; i < translations.length; i++) {
    const t = translations[i];
    const orig = originals[i] || '';
    if (!t || t.trim() === '') {
      warnings++;
    } else if (t === orig && orig.length > 20 && /[a-zA-Z]{3,}/.test(orig)) {
      warnings++;
    }
  }

  const ratio = warnings / translations.length;
  const isPoorQuality = translations.length > 0 && ratio > POOR_QUALITY_THRESHOLD;

  if (warnings > 0) {
    console.warn(`    ⚠ [${context}] ${warnings}/${translations.length} entries (${(ratio * 100).toFixed(1)}%) may be poorly translated`);
    if (isPoorQuality) {
      console.warn(`    ⚠ Poor quality threshold exceeded (${(POOR_QUALITY_THRESHOLD * 100)}%) - will retry with fallback`);
    } else {
      console.warn(`      Run: node scripts/retranslate-poor-quality.mjs`);
    }
  }

  return { warnings, isPoorQuality };
}

/**
 * Try fallback providers in chain order after the primary engine fails.
 *
 * @param {string[]} texts - Texts to translate
 * @param {string} failedEngine - The engine that failed (to determine fallback starting point)
 * @param {Set<string>} exhaustedGeminiModels - Models already exhausted (for Gemini re-entry)
 * @returns {Promise<{result: object, usedEngine: string} | null>}
 */
async function tryFallbackChain(texts, failedEngine, exhaustedGeminiModels) {
  const fallbacks = getFallbackProviders(failedEngine);
  for (const fb of fallbacks) {
    if (!isProviderAvailable(fb)) continue;
    try {
      if (fb === 'gemini') {
        const gr = await translateWithGeminiChain(texts, exhaustedGeminiModels, translateWithGemini);
        if (gr) {
          const usedEngine = gr.usedModel === GEMINI_MODELS[0].model ? 'gemini' : gr.usedModel;
          return { result: gr.result, usedEngine };
        }
        // All Gemini models exhausted — continue to next fallback
        continue;
      } else if (fb === 'glm' && translateWithGlm) {
        const result = await translateWithGlm(texts);
        return { result, usedEngine: 'glm' };
      } else if (fb === 'openai') {
        const result = await translateWithOpenAI(texts);
        return { result, usedEngine: 'openai' };
      } else if (fb === 'google') {
        const result = await translateBatch(texts);
        return { result, usedEngine: 'google' };
      } else if (fb === 'mock') {
        const result = createMockTranslations(texts);
        return { result, usedEngine: 'mock' };
      }
    } catch (e) {
      console.warn(`    Fallback ${fb} failed: ${e.message}`);
    }
  }
  return null;
}

/**
 * Translate a single version's changelog entries
 *
 * @param {string} serviceId
 * @param {string} serviceName
 * @param {string} version
 * @param {'mock' | 'google' | 'gemini' | 'glm' | 'openai'} primaryEngine
 * @param {Set<string>} exhaustedGeminiModels - tracks spent Gemini models across versions
 */
async function translateVersion(serviceId, serviceName, version, primaryEngine, exhaustedGeminiModels) {
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

  // Translate with engine chain
  let result;
  let usedEngine = primaryEngine;

  try {
    if (primaryEngine === 'gemini') {
      const geminiResult = await translateWithGeminiChain(textsToTranslate, exhaustedGeminiModels, translateWithGemini);

      if (geminiResult === null) {
        // All Gemini models exhausted — use fallback chain
        console.log(`    All Gemini models exhausted, trying fallback chain...`);
        const fb = await tryFallbackChain(textsToTranslate, 'gemini', exhaustedGeminiModels);
        if (fb) {
          result = fb.result;
          usedEngine = fb.usedEngine;
        } else {
          console.log(`    All fallbacks exhausted, using mock translations`);
          result = createMockTranslations(textsToTranslate);
          usedEngine = 'mock';
        }
      } else {
        result = geminiResult.result;
        // Record which specific Gemini model was used
        usedEngine = geminiResult.usedModel === GEMINI_MODELS[0].model
          ? 'gemini'
          : geminiResult.usedModel;

        // Quality check: if Gemini produced poor quality, retry with fallback chain
        const quality = checkTranslationQuality(textsToTranslate, result.translations, `${version} (Gemini)`);
        if (quality.isPoorQuality) {
          console.log(`    Gemini quality poor, retrying with fallback chain...`);
          const fb = await tryFallbackChain(textsToTranslate, 'gemini', exhaustedGeminiModels);
          if (fb) {
            result = fb.result;
            usedEngine = fb.usedEngine;
          }
        }
      }
    } else if (primaryEngine === 'glm') {
      if (translateWithGlm) {
        result = await translateWithGlm(textsToTranslate);
        usedEngine = 'glm';
      } else {
        console.log('    GLM provider not available, trying fallback chain...');
        const fb = await tryFallbackChain(textsToTranslate, 'glm', exhaustedGeminiModels);
        if (fb) {
          result = fb.result;
          usedEngine = fb.usedEngine;
        } else {
          result = createMockTranslations(textsToTranslate);
          usedEngine = 'mock';
        }
      }
    } else if (primaryEngine === 'openai') {
      result = await translateWithOpenAI(textsToTranslate);
    } else if (primaryEngine === 'google') {
      result = await translateBatch(textsToTranslate);
    } else {
      console.log('    Using mock translations (no API key)');
      result = createMockTranslations(textsToTranslate);
    }
  } catch (error) {
    if (error instanceof PartialTranslationError) {
      const partial = error.partialTranslations || [];
      const missingIndices = [];
      const missingTexts = [];
      for (let i = 0; i < textsToTranslate.length; i++) {
        if (!partial[i]) {
          missingIndices.push(i);
          missingTexts.push(textsToTranslate[i]);
        }
      }
      if (missingTexts.length > 0) {
        console.log(`    Partial result (${partial.length}/${textsToTranslate.length}), completing missing entries with fallback chain...`);
        const fb = await tryFallbackChain(missingTexts, primaryEngine, exhaustedGeminiModels);
        if (fb) {
          const merged = [...partial];
          missingIndices.forEach((idx, i) => {
            merged[idx] = fb.result.translations[i] ?? textsToTranslate[idx];
          });
          result = { translations: merged, charCount: fb.result.charCount };
          usedEngine = fb.usedEngine;
        } else {
          result = { translations: partial, charCount: partial.reduce((s, t) => s + (t?.length || 0), 0) };
          usedEngine = primaryEngine;
        }
      } else {
        result = { translations: partial, charCount: partial.reduce((s, t) => s + (t?.length || 0), 0) };
        usedEngine = primaryEngine;
      }
    } else {
      console.log(`    Translation failed (${error.message}), trying fallback chain...`);
      const fb = await tryFallbackChain(textsToTranslate, primaryEngine, exhaustedGeminiModels);
      if (fb) {
        result = fb.result;
        usedEngine = fb.usedEngine;
      } else {
        console.error(`    All fallbacks failed: ${error.message}`);
        return null;
      }
    }
  }

  console.log(`    Translated ${textsToTranslate.length} entries with ${usedEngine}`);

  // Final quality check (for non-Gemini engines or if OpenAI fallback also failed)
  if (usedEngine !== 'gemini') {
    checkTranslationQuality(textsToTranslate, result.translations, version);
  }

  // Add translations to entries (prefix 자동 후처리 적용, null → original fallback)
  data.entries.forEach((entry, index) => {
    entry.translated = stripPrefix(result.translations[index] ?? entry.original);
  });

  // Update metadata
  data.translatedAt = new Date().toISOString();
  data.translationEngine = usedEngine;
  data.translationProvider = result.meta?.provider || usedEngine;
  data.translationModel = result.meta?.model || '';
  data.translationEndpointType = result.meta?.endpointType || '';
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
 * Translate multiple versions of a service in a single API request.
 *
 * Collects all entries across versions into one flat array, sends a single
 * API call, then splits the results back by version and writes each file.
 *
 * @param {string} serviceId
 * @param {string} serviceName
 * @param {string[]} versions
 * @param {'mock' | 'google' | 'gemini' | 'openai'} primaryEngine
 * @param {Set<string>} exhaustedGeminiModels
 * @returns {Promise<Array|null>} results array, or null if batch failed (caller should fall back)
 */
async function translateServiceVersionsBatch(serviceId, serviceName, versions, primaryEngine, exhaustedGeminiModels) {
  const loadedVersions = await loadVersionFiles(serviceId, versions);

  if (loadedVersions.length === 0) return [];

  // Build flat array of all texts + slice map to reconstruct per-version results
  const flatTexts = [];
  const sliceMap = []; // [{ version, filePath, data, startIdx, count }]

  for (const { version, filePath, data } of loadedVersions) {
    const texts = data.entries.map(e => e.original);
    sliceMap.push({ version, filePath, data, startIdx: flatTexts.length, count: texts.length });
    flatTexts.push(...texts);
  }

  console.log(`\n  [${serviceName}] Batch: ${loadedVersions.length} versions, ${flatTexts.length} entries total`);

  // Single API call for all versions combined
  let result;
  let usedEngine = primaryEngine;

  try {
    if (primaryEngine === 'gemini') {
      const geminiResult = await translateWithGeminiChain(flatTexts, exhaustedGeminiModels, translateWithGemini);

      if (geminiResult === null) {
        // All Gemini models exhausted — use fallback chain
        console.log(`    All Gemini models exhausted, trying fallback chain...`);
        const fb = await tryFallbackChain(flatTexts, 'gemini', exhaustedGeminiModels);
        if (fb) {
          result = fb.result;
          usedEngine = fb.usedEngine;
        } else {
          console.log(`    All fallbacks exhausted, using mock translations`);
          result = createMockTranslations(flatTexts);
          usedEngine = 'mock';
        }
      } else {
        result = geminiResult.result;
        usedEngine = geminiResult.usedModel === GEMINI_MODELS[0].model
          ? 'gemini'
          : geminiResult.usedModel;

        // Quality check: if Gemini produced poor quality, retry with fallback chain
        const quality = checkTranslationQuality(flatTexts, result.translations, `${serviceId} batch (Gemini)`);
        if (quality.isPoorQuality) {
          console.log(`    Gemini quality poor, retrying with fallback chain...`);
          const fb = await tryFallbackChain(flatTexts, 'gemini', exhaustedGeminiModels);
          if (fb) {
            result = fb.result;
            usedEngine = fb.usedEngine;
          }
        }
      }
    } else if (primaryEngine === 'glm') {
      if (translateWithGlm) {
        result = await translateWithGlm(flatTexts);
        usedEngine = 'glm';
      } else {
        console.log('    GLM provider not available, trying fallback chain...');
        const fb = await tryFallbackChain(flatTexts, 'glm', exhaustedGeminiModels);
        if (fb) {
          result = fb.result;
          usedEngine = fb.usedEngine;
        } else {
          result = createMockTranslations(flatTexts);
          usedEngine = 'mock';
        }
      }
    } else if (primaryEngine === 'openai') {
      result = await translateWithOpenAI(flatTexts);
    } else if (primaryEngine === 'google') {
      result = await translateBatch(flatTexts);
    } else {
      console.log('    Using mock translations (no API key)');
      result = createMockTranslations(flatTexts);
    }
  } catch (error) {
    if (error instanceof PartialTranslationError) {
      const partial = error.partialTranslations || [];
      const missingIndices = [];
      const missingTexts = [];
      for (let i = 0; i < flatTexts.length; i++) {
        if (!partial[i]) {
          missingIndices.push(i);
          missingTexts.push(flatTexts[i]);
        }
      }
      if (missingTexts.length > 0) {
        console.log(`    Partial batch translation (${partial.length}/${flatTexts.length}), completing missing entries with fallback chain...`);
        const fb = await tryFallbackChain(missingTexts, primaryEngine, exhaustedGeminiModels);
        if (fb) {
          const merged = [...partial];
          missingIndices.forEach((idx, i) => {
            merged[idx] = fb.result.translations[i] ?? flatTexts[idx];
          });
          result = { translations: merged, charCount: fb.result.charCount };
          usedEngine = fb.usedEngine;
        } else {
          result = { translations: partial, charCount: partial.reduce((s, t) => s + (t?.length || 0), 0) };
          usedEngine = primaryEngine;
        }
      } else {
        result = { translations: partial, charCount: partial.reduce((s, t) => s + (t?.length || 0), 0) };
        usedEngine = primaryEngine;
      }
    } else {
      console.log(`    Batch translation failed (${error.message}), trying fallback chain...`);
      const fb = await tryFallbackChain(flatTexts, primaryEngine, exhaustedGeminiModels);
      if (fb) {
        result = fb.result;
        usedEngine = fb.usedEngine;
      } else {
        console.error(`    All fallbacks failed: ${error.message}`);
        return null; // signal caller to fall back to per-version
      }
    }
  }

  console.log(`    Translated ${flatTexts.length} entries with ${usedEngine}`);

  // Final quality check (for non-Gemini engines)
  if (usedEngine !== 'gemini') {
    checkTranslationQuality(flatTexts, result.translations, `${serviceId} batch`);
  }

  // Split results back by version and write each file
  const results = [];

  for (const { version, filePath, data, startIdx, count } of sliceMap) {
    const versionTranslations = result.translations.slice(startIdx, startIdx + count);

    // prefix 자동 후처리 적용
    data.entries.forEach((entry, i) => {
      entry.translated = stripPrefix(versionTranslations[i] ?? entry.original);
    });

    const versionCharCount = data.entries.reduce((sum, e) => sum + (e.original?.length || 0), 0);
    data.translatedAt = new Date().toISOString();
    data.translationEngine = usedEngine;
    data.translationProvider = result.meta?.provider || usedEngine;
    data.translationModel = result.meta?.model || '';
    data.translationEndpointType = result.meta?.endpointType || '';
    data.translationCharCount = versionCharCount;

    await writeFile(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
    console.log(`    [${version}] Saved ${count} translations (${versionCharCount} chars)`);

    results.push({ version, charCount: versionCharCount, entryCount: count });
  }

  return results;
}

/**
 * Build the service-to-versions map to translate.
 * Priority:
 *   1. NEW_VERSIONS_MAP env: {"service-id": ["v1", "v2"]}
 *   2. Scan all enabled services for untranslated versions
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

  // Priority 2: Scan all services for untranslated versions
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
 * Determine which translation engine to use as primary.
 *
 * TRANSLATION_ENGINE env var (default: 'auto'):
 *   'auto'   - Uses policy-based fallback chain (Gemini → GLM → OpenAI → Google → Mock)
 *   'gemini' - Use Gemini model chain only
 *   'glm'    - Use GLM only
 *   'openai' - Use OpenAI only
 *   'google' - Use Google Translate only
 *   'mock'   - Mock translations (for testing)
 */
function getTranslationEngine() {
  return selectPrimaryEngine();
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

  const chain = getDefaultFallbackChain();
  console.log(`\nTranslation engine: ${engine}`);
  console.log(`Fallback chain: ${chain.join(' → ')}\n`);

  if (engine === 'gemini') {
    const geminiModels = GEMINI_MODELS.map(m => m.label).join(' → ');
    console.log(`  Gemini model chain: ${geminiModels}`);
  } else if (engine === 'openai') {
    console.log(`  OpenAI model: ${process.env.OPENAI_MODEL || 'gpt-4o'}`);
  } else if (engine === 'mock') {
    console.log('  No API key set - using mock translations');
    console.log('  Set GEMINI_API_KEY, GLM_API_KEY, OPENAI_API_KEY, or GOOGLE_TRANSLATE_API_KEY');
    console.log('  Or set TRANSLATION_ENGINE=gemini|glm|openai|google|mock');
  }
  console.log('');

  // Load service names for logging
  const serviceNames = await loadServiceNameMap();

  // Track exhausted Gemini models across all versions in this run
  const exhaustedGeminiModels = new Set();

  // Translate each service's versions
  let grandTotalChars = 0;
  let grandTotalEntries = 0;
  let grandTotalVersions = 0;

  for (const [serviceId, versions] of Object.entries(versionsMap)) {
    const serviceName = serviceNames[serviceId] || serviceId;
    console.log(`\n--- ${serviceName} (${serviceId}) ---`);
    console.log(`  ${versions.length} version(s) to translate`);

    let results = [];

    if (versions.length >= 2) {
      // Batch: translate all versions for this service in one API call
      const batchResults = await translateServiceVersionsBatch(
        serviceId, serviceName, versions, engine, exhaustedGeminiModels
      );

      if (batchResults !== null) {
        results = batchResults;
      } else {
        // Batch failed - fall back to per-version
        console.log(`  Falling back to per-version translation...`);
        for (const version of versions) {
          const result = await translateVersion(serviceId, serviceName, version, engine, exhaustedGeminiModels);
          if (result) results.push(result);
        }
      }
    } else {
      // Single version: use existing per-version translation
      const result = await translateVersion(serviceId, serviceName, versions[0], engine, exhaustedGeminiModels);
      if (result) results.push(result);
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
    if (exhaustedGeminiModels.size > 0) {
      const exhaustedLabels = [...exhaustedGeminiModels].map(m => {
        const found = GEMINI_MODELS.find(g => g.model === m);
        return found ? found.label : m;
      });
      console.log(`  Note: Gemini models exhausted this run: ${exhaustedLabels.join(', ')}`);
    }
  } else {
    console.log('No translations were performed.');
  }
  console.log('='.repeat(60));
}

main().catch(error => {
  console.error('\nFatal error:', error.message);
  process.exit(1);
});
