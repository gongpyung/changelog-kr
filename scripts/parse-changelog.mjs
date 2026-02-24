#!/usr/bin/env node

/**
 * Parse Changelog Script (Multi-Service)
 *
 * Reads changelog sources for all enabled services and generates structured JSON files.
 * Supports both markdown (CHANGELOG.md) and github-releases sources.
 *
 * 2-Layer Merge Protection:
 *   Layer 1: versions.json index merge - preserves translationStatus, translatedAt, etc.
 *   Layer 2: per-version file protection - skips writing files that already have translations
 *
 * Usage:
 *   node scripts/parse-changelog.mjs                  # parse all enabled services
 *   node scripts/parse-changelog.mjs --service claude-code  # parse only one service
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseChangelog } from './utils/changelog-parser.mjs';
import { fetchAndParseReleases } from './utils/releases-parser.mjs';
import { sortVersions } from './utils/version-utils.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');
const SERVICES_FILE = join(PROJECT_ROOT, 'data', 'services.json');

/**
 * Load enabled services from services.json
 */
async function loadServices() {
  const content = await readFile(SERVICES_FILE, 'utf-8');
  const data = JSON.parse(content);
  return data.services.filter(s => s.enabled && s.changelogType);
}

/**
 * Fetch and parse versions for a service based on its changelogType
 * Returns array of { version, date?, entries, entryCount }
 */
async function fetchAndParseService(service, options = {}) {
  if (service.changelogType === 'markdown') {
    const url = service.changelogSource.url;
    console.log(`  Fetching markdown from ${url}...`);
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to fetch changelog: ${response.status} ${response.statusText}`);
    }

    const markdown = await response.text();

    // Save raw markdown cache
    const rawDir = join(PROJECT_ROOT, 'data', 'services', service.id, 'raw');
    await mkdir(rawDir, { recursive: true });
    await writeFile(join(rawDir, 'CHANGELOG.md'), markdown, 'utf-8');

    return parseChangelog(markdown);
  }

  if (service.changelogType === 'github-releases') {
    console.log(`  Fetching GitHub releases for ${service.changelogSource.owner}/${service.changelogSource.repo}...`);
    const fetchOptions = {};
    if (options.maxPages) fetchOptions.maxPages = options.maxPages;
    const result = await fetchAndParseReleases(service.changelogSource, fetchOptions);
    return result.versions;
  }

  console.warn(`  Unknown changelogType: ${service.changelogType}`);
  return [];
}

/**
 * Fetch dates from external source (e.g., GitHub Releases API)
 * Returns Map<version, dateString> (e.g., "2.1.34" → "2026-02-06")
 */
async function fetchDatesFromSource(service) {
  const dateMap = new Map();
  const src = service.dateSource;

  if (src.type === 'github-releases') {
    console.log(`  Fetching dates from GitHub Releases (${src.owner}/${src.repo})...`);
    let page = 1;
    const perPage = 100;

    while (true) {
      const url = `https://api.github.com/repos/${src.owner}/${src.repo}/releases?per_page=${perPage}&page=${page}`;
      const headers = { 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'changelog-kr-parser' };
      if (process.env.GITHUB_TOKEN) {
        headers['Authorization'] = `token ${process.env.GITHUB_TOKEN}`;
      }

      const response = await fetch(url, { headers });
      if (!response.ok) {
        console.warn(`  ⚠ Failed to fetch dates: ${response.status}`);
        break;
      }

      const releases = await response.json();
      if (releases.length === 0) break;

      for (const rel of releases) {
        const version = rel.tag_name.replace(/^v/, '');
        const date = rel.published_at ? rel.published_at.slice(0, 10) : null;
        if (date) {
          dateMap.set(version, date);
        }
      }

      if (releases.length < perPage) break;
      page++;
    }

    console.log(`  Found dates for ${dateMap.size} version(s)`);
  }

  return dateMap;
}

/**
 * Layer 1: Merge parsed versions with existing versions.json
 * Preserves: translationStatus, translatedAt, translationCharCount, translationEntryCount
 * Updates: entries, entryCount, date
 */
function mergeVersions(existingVersions, parsedVersions) {
  const existingMap = new Map(existingVersions.map(v => [v.version, v]));

  for (const parsed of parsedVersions) {
    const existing = existingMap.get(parsed.version);
    if (existing) {
      // Update content fields, preserve translation metadata
      existing.entryCount = parsed.entryCount || parsed.entries?.length || 0;
      if (parsed.date) {
        existing.date = parsed.date;
      }
      // Preserve: translationStatus, translatedAt, translationCharCount, translationEntryCount
    } else {
      // New version - add with pending status
      existingMap.set(parsed.version, {
        version: parsed.version,
        entryCount: parsed.entryCount || parsed.entries?.length || 0,
        date: parsed.date || null,
        translationStatus: 'pending',
        translatedAt: null,
        translationCharCount: null,
        translationEntryCount: null
      });
    }
  }

  return Array.from(existingMap.values());
}

/**
 * Process a single service: fetch, parse, merge, write
 */
async function processService(service, options = {}) {
  console.log(`\n=== ${service.name} (${service.id}) ===`);

  const serviceDir = join(PROJECT_ROOT, 'data', 'services', service.id);
  const versionsIndexPath = join(serviceDir, 'versions.json');
  const translationsDir = join(serviceDir, 'translations');

  // Fetch and parse versions from source
  const parsedVersions = await fetchAndParseService(service, options);
  console.log(`  Parsed ${parsedVersions.length} version(s) from source`);

  // Fetch dates from external source if configured
  if (service.dateSource) {
    const dateMap = await fetchDatesFromSource(service);
    for (const ver of parsedVersions) {
      if (!ver.date && dateMap.has(ver.version)) {
        ver.date = dateMap.get(ver.version);
      }
    }
  }

  if (parsedVersions.length === 0) {
    console.log('  No versions found, skipping.');
    return { service: service.id, versionCount: 0, newCount: 0, skippedCount: 0 };
  }

  // Read existing versions.json (Layer 1 input)
  let existingVersions = [];
  try {
    const existingContent = await readFile(versionsIndexPath, 'utf-8');
    const existingData = JSON.parse(existingContent);
    existingVersions = existingData.versions || [];
  } catch {
    // No existing file, start fresh
  }

  const existingVersionSet = new Set(existingVersions.map(v => v.version));

  // Layer 1: Merge versions index
  const mergedVersions = mergeVersions(existingVersions, parsedVersions);

  // Sort versions (newest first)
  const sortedVersionStrings = sortVersions(mergedVersions.map(v => v.version), 'desc');
  const versionOrderMap = new Map(sortedVersionStrings.map((v, i) => [v, i]));
  mergedVersions.sort((a, b) => (versionOrderMap.get(a.version) ?? 999) - (versionOrderMap.get(b.version) ?? 999));

  // Write versions.json index
  const versionIndex = {
    lastUpdated: new Date().toISOString(),
    totalVersions: mergedVersions.length,
    versions: mergedVersions
  };

  await mkdir(dirname(versionsIndexPath), { recursive: true });
  await writeFile(versionsIndexPath, JSON.stringify(versionIndex, null, 2) + '\n', 'utf-8');
  console.log(`  Wrote versions index: ${mergedVersions.length} version(s)`);

  // Layer 2: Write individual version files with translation protection
  await mkdir(translationsDir, { recursive: true });

  let newCount = 0;
  let skippedCount = 0;

  for (const versionData of parsedVersions) {
    const versionFile = join(translationsDir, `${versionData.version}.json`);

    // Check if file already exists with translations
    let existingData = null;
    try {
      existingData = JSON.parse(await readFile(versionFile, 'utf-8'));
    } catch {
      // File doesn't exist or is invalid
    }

    // Layer 2 protection: skip if file already exists (already parsed)
    // Use --force flag to override and re-parse from source
    const forceReparse = process.argv.includes('--force');
    if (!forceReparse && existingData && existingData.parsedAt) {
      const reason = existingData.entries?.some(e => e.translated !== null) ? 'translated' : 'already parsed';
      console.log(`  - ${versionData.version}: ${reason}, skipping`);
      skippedCount++;
      continue;
    }

    // Write new/untranslated version file
    const versionJson = {
      version: versionData.version,
      date: versionData.date || null,
      parsedAt: new Date().toISOString(),
      translationStatus: 'pending',
      entries: (versionData.entries || []).map(entry => ({
        category: entry.category,
        scope: entry.scope,
        original: entry.text,
        translated: null
      }))
    };

    await writeFile(versionFile, JSON.stringify(versionJson, null, 2) + '\n', 'utf-8');

    const isNew = !existingVersionSet.has(versionData.version);
    const marker = isNew ? '(new)' : '(updated)';
    console.log(`  - ${versionData.version}: ${versionData.entryCount || versionData.entries?.length || 0} entries ${marker}`);
    newCount++;
  }

  console.log(`  Summary: ${newCount} written, ${skippedCount} skipped (translated)`);

  return {
    service: service.id,
    versionCount: mergedVersions.length,
    newCount,
    skippedCount
  };
}

/**
 * Parse --service CLI argument
 */
function getServiceFilter() {
  const args = process.argv.slice(2);
  const serviceIdx = args.indexOf('--service');
  if (serviceIdx !== -1 && args[serviceIdx + 1]) {
    return args[serviceIdx + 1];
  }
  return null;
}

/**
 * Parse --max-pages CLI argument (limits GitHub API pagination)
 */
function getMaxPages() {
  const args = process.argv.slice(2);
  const idx = args.indexOf('--max-pages');
  if (idx !== -1 && args[idx + 1]) {
    const val = parseInt(args[idx + 1], 10);
    if (val > 0) return val;
  }
  return null;
}

/**
 * Main parse function
 */
async function main() {
  try {
    console.log('Multi-Service Changelog Parser\n');

    // Load services
    let services = await loadServices();
    console.log(`Loaded ${services.length} enabled service(s)`);

    // Filter by --service if specified
    const serviceFilter = getServiceFilter();
    if (serviceFilter) {
      services = services.filter(s => s.id === serviceFilter);
      if (services.length === 0) {
        console.error(`Service "${serviceFilter}" not found or not enabled.`);
        process.exit(1);
      }
      console.log(`Filtered to service: ${serviceFilter}`);
    }

    // Process each service
    const maxPages = getMaxPages();
    const processOptions = maxPages ? { maxPages } : {};
    if (maxPages) {
      console.log(`Limiting GitHub API pagination to ${maxPages} page(s)`);
    }

    const results = [];
    for (const service of services) {
      try {
        const result = await processService(service, processOptions);
        results.push(result);
      } catch (error) {
        console.error(`\nError processing ${service.name}: ${error.message}`);
        results.push({ service: service.id, versionCount: 0, newCount: 0, skippedCount: 0, error: error.message });
      }
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('Parse complete!');
    for (const r of results) {
      if (r.error) {
        console.log(`  ${r.service}: ERROR - ${r.error}`);
      } else {
        console.log(`  ${r.service}: ${r.versionCount} total, ${r.newCount} written, ${r.skippedCount} skipped`);
      }
    }
    console.log('='.repeat(60));

    // Set GitHub Actions output if in CI
    if (process.env.GITHUB_ACTIONS) {
      const outputFile = process.env.GITHUB_OUTPUT;
      if (outputFile) {
        const totalVersions = results.reduce((sum, r) => sum + r.versionCount, 0);
        const { appendFileSync } = await import('node:fs');
        appendFileSync(outputFile, `has_versions=true\nversion_count=${totalVersions}\n`, 'utf-8');
      }
    }

  } catch (error) {
    console.error('Error parsing changelog:', error);
    process.exit(1);
  }
}

main();
