#!/usr/bin/env node

/**
 * Static Site Builder
 * Reads translation JSON files, merges them, and generates the final site.
 *
 * Usage:
 *   node scripts/build-site.mjs
 *   npm run build
 */

import { readFile, writeFile, readdir, mkdir, copyFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compareVersions } from './utils/version-utils.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');
const TRANSLATIONS_DIR = join(PROJECT_ROOT, 'data', 'translations');
const SERVICES_DIR = join(PROJECT_ROOT, 'data', 'services');
const SERVICES_CONFIG = join(PROJECT_ROOT, 'data', 'services.json');
const TEMPLATE_PATH = join(PROJECT_ROOT, 'templates', 'index.html.template');
const SITE_DIR = join(PROJECT_ROOT, 'site');
const SITE_DATA_DIR = join(SITE_DIR, 'data');
const SITE_ASSETS_DIR = join(SITE_DIR, 'assets');
const OUTPUT_HTML = join(SITE_DIR, 'index.html');
const OUTPUT_JSON = join(SITE_DATA_DIR, 'all-translations.json');

/**
 * Discover services from services.json and validate their directories
 */
async function discoverServices() {
  let config;
  try {
    config = JSON.parse(await readFile(SERVICES_CONFIG, 'utf-8'));
  } catch (error) {
    console.warn('  ⚠ No services.json found, falling back to legacy mode');
    return null;
  }

  const validServices = [];

  for (const serviceMeta of config.services) {
    if (!serviceMeta.enabled) continue;

    const translationsPath = join(SERVICES_DIR, serviceMeta.id, 'translations');
    let jsonFiles = [];
    try {
      const files = await readdir(translationsPath);
      jsonFiles = files.filter(f => f.endsWith('.json'));
    } catch {
      // translations folder doesn't exist - service has zero translations
    }

    validServices.push({
      id: serviceMeta.id,
      meta: serviceMeta,
      translationsPath,
      fileCount: jsonFiles.length
    });
  }

  return validServices;
}

/**
 * Build data for a single service
 */
async function buildServiceData(service) {
  let jsonFiles = [];
  try {
    const files = await readdir(service.translationsPath);
    jsonFiles = files.filter(f => f.endsWith('.json'));
  } catch {
    // translations dir may not exist for new services
  }

  const versions = [];
  for (const file of jsonFiles) {
    try {
      const content = await readFile(join(service.translationsPath, file), 'utf-8');
      versions.push(JSON.parse(content));
    } catch (error) {
      console.warn(`  ⚠ Skipping ${file}: ${error.message}`);
    }
  }

  const sorted = sortVersionsDescending(versions);
  const stripped = stripForFrontend(sorted);

  const outputDir = join(SITE_DATA_DIR, 'services', service.id);
  const outputPath = join(outputDir, 'translations.json');

  await mkdir(outputDir, { recursive: true });

  const output = {
    generatedAt: new Date().toISOString(),
    serviceId: service.id,
    versionCount: stripped.length,
    versions: stripped
  };

  await writeFile(outputPath, JSON.stringify(output), 'utf-8');

  const sizeKB = (Buffer.byteLength(JSON.stringify(output)) / 1024).toFixed(1);
  console.log(`  Built ${service.id}: ${stripped.length} versions (${sizeKB} KB)`);

  return { serviceId: service.id, versionCount: stripped.length };
}

/**
 * Read all translation JSON files from data/translations/
 */
async function readTranslations() {
  let files;
  try {
    files = await readdir(TRANSLATIONS_DIR);
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.warn('  ⚠ No translations directory found. Creating empty output.');
      return [];
    }
    throw error;
  }

  const jsonFiles = files.filter(f => f.endsWith('.json'));
  console.log(`  Found ${jsonFiles.length} translation files`);

  const versions = [];

  for (const file of jsonFiles) {
    try {
      const content = await readFile(join(TRANSLATIONS_DIR, file), 'utf-8');
      const data = JSON.parse(content);
      versions.push(data);
    } catch (error) {
      console.warn(`  ⚠ Skipping ${file}: ${error.message}`);
    }
  }

  return versions;
}

/**
 * Sort versions descending (newest first) using semver comparison
 */
function sortVersionsDescending(versions) {
  return versions.sort((a, b) => compareVersions(b.version, a.version));
}

/**
 * Strip metadata from translation data for smaller payload.
 * Keep only what the frontend needs.
 */
function stripForFrontend(versions) {
  return versions.map(v => ({
    version: v.version,
    entries: (v.entries || []).map(entry => ({
      category: entry.category || 'other',
      scope: entry.scope || null,
      original: entry.original || entry.text || '',
      translated: entry.translated || entry.translation || null,
    })),
  }));
}

/**
 * Build the consolidated all-translations.json
 */
async function buildTranslationsJson(versions) {
  const stripped = stripForFrontend(versions);

  const output = {
    generatedAt: new Date().toISOString(),
    versionCount: stripped.length,
    versions: stripped,
  };

  await mkdir(SITE_DATA_DIR, { recursive: true });
  await writeFile(OUTPUT_JSON, JSON.stringify(output), 'utf-8');

  const sizeKB = (Buffer.byteLength(JSON.stringify(output)) / 1024).toFixed(1);
  console.log(`  Wrote ${OUTPUT_JSON} (${sizeKB} KB, ${stripped.length} versions)`);

  return output;
}

/**
 * Format date for display in Korean locale
 */
function formatDate(isoString) {
  const date = new Date(isoString);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

/**
 * Build index.html from template
 */
async function buildHtml(translationsData) {
  let template;
  try {
    template = await readFile(TEMPLATE_PATH, 'utf-8');
  } catch (error) {
    console.error(`  ✗ Failed to read template: ${error.message}`);
    throw error;
  }

  const versionCount = translationsData.versionCount;
  const lastUpdated = formatDate(translationsData.generatedAt);
  const latestVersion = translationsData.versions.length > 0
    ? translationsData.versions[0].version
    : '0.0.0';

  // Replace template placeholders
  let html = template;
  html = html.replace(/\{\{VERSION_COUNT\}\}/g, String(versionCount));
  html = html.replace(/\{\{LAST_UPDATED\}\}/g, lastUpdated);
  html = html.replace(/\{\{LATEST_VERSION\}\}/g, latestVersion);

  await writeFile(OUTPUT_HTML, html, 'utf-8');

  const sizeKB = (Buffer.byteLength(html) / 1024).toFixed(1);
  console.log(`  Wrote ${OUTPUT_HTML} (${sizeKB} KB)`);
}

/**
 * Ensure static asset directories exist
 */
async function ensureAssetDirs() {
  await mkdir(SITE_ASSETS_DIR, { recursive: true });
  await mkdir(SITE_DATA_DIR, { recursive: true });
}

/**
 * Main build process
 */
async function main() {
  const startTime = Date.now();

  console.log('');
  console.log('========================================');
  console.log('  ChangeLog.kr - Site Builder');
  console.log('========================================');
  console.log('');

  // Step 1: Ensure output directories
  console.log('[1/4] Preparing output directories...');
  await ensureAssetDirs();
  console.log('  Done');

  // Try multi-service mode first
  const services = await discoverServices();

  let translationsData;

  if (services && services.length > 0) {
    console.log(`[2/4] Building multi-service data (${services.length} services)...`);

    for (const service of services) {
      await buildServiceData(service);
    }

    // Copy services.json to site/data/
    await copyFile(SERVICES_CONFIG, join(SITE_DATA_DIR, 'services.json'));
    console.log('  Copied services.json');

    // Build combined all-translations.json from default service for backward compatibility
    console.log('[3/4] Building all-translations.json (backward compatibility)...');
    let config;
    try {
      config = JSON.parse(await readFile(SERVICES_CONFIG, 'utf-8'));
    } catch { config = null; }
    const defaultServiceId = config?.defaultService || 'claude-code';
    const primaryService = services.find(s => s.id === defaultServiceId) || services[0];
    let primaryFiles = [];
    try {
      const allFiles = await readdir(primaryService.translationsPath);
      primaryFiles = allFiles.filter(f => f.endsWith('.json'));
    } catch {
      // primary service may have no translations dir
    }
    const jsonFiles = primaryFiles;

    const versions = [];
    for (const file of jsonFiles) {
      try {
        const content = await readFile(join(primaryService.translationsPath, file), 'utf-8');
        versions.push(JSON.parse(content));
      } catch (error) {
        console.warn(`  ⚠ Skipping ${file}: ${error.message}`);
      }
    }

    const sorted = sortVersionsDescending(versions);
    translationsData = await buildTranslationsJson(sorted);
  } else {
    // Legacy mode - use old TRANSLATIONS_DIR
    console.log('[2/4] Reading translation files (legacy mode)...');
    const rawVersions = await readTranslations();

    // Step 3: Sort and build JSON
    console.log('[3/4] Building all-translations.json...');
    const sorted = sortVersionsDescending(rawVersions);
    translationsData = await buildTranslationsJson(sorted);
  }

  // Step 4: Build HTML from template
  console.log('[4/4] Building index.html from template...');
  await buildHtml(translationsData);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);

  console.log('');
  console.log('========================================');
  console.log(`  Build complete in ${elapsed}s`);
  console.log(`  Versions: ${translationsData.versionCount}`);
  if (services && services.length > 0) {
    console.log(`  Services: ${services.map(s => s.id).join(', ')}`);
  }
  console.log(`  Output:   ${SITE_DIR}/`);
  console.log('========================================');
  console.log('');
}

main().catch(error => {
  console.error('\n✗ Build failed:', error.message);
  process.exit(1);
});
