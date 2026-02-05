#!/usr/bin/env node

/**
 * Parse Changelog Script
 * Reads CHANGELOG.md and generates structured JSON files
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseChangelog } from './utils/changelog-parser.mjs';
import { sortVersions } from './utils/version-utils.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');
const RAW_CHANGELOG_PATH = join(PROJECT_ROOT, 'data', 'raw', 'CHANGELOG.md');
const VERSIONS_INDEX_PATH = join(PROJECT_ROOT, 'data', 'versions.json');
const TRANSLATIONS_DIR = join(PROJECT_ROOT, 'data', 'translations');

/**
 * Fetch changelog from GitHub if not present locally
 */
async function fetchChangelog() {
  const GITHUB_URL = 'https://raw.githubusercontent.com/anthropics/claude-code/main/CHANGELOG.md';

  console.log('Fetching changelog from GitHub...');
  const response = await fetch(GITHUB_URL);

  if (!response.ok) {
    throw new Error(`Failed to fetch changelog: ${response.status} ${response.statusText}`);
  }

  const markdown = await response.text();

  // Save to local cache
  await mkdir(dirname(RAW_CHANGELOG_PATH), { recursive: true });
  await writeFile(RAW_CHANGELOG_PATH, markdown, 'utf-8');

  console.log(`Saved changelog to ${RAW_CHANGELOG_PATH}`);
  return markdown;
}

/**
 * Read changelog (local or remote)
 */
async function readChangelog() {
  try {
    console.log('Reading local changelog...');
    return await readFile(RAW_CHANGELOG_PATH, 'utf-8');
  } catch (error) {
    if (error.code === 'ENOENT') {
      return await fetchChangelog();
    }
    throw error;
  }
}

/**
 * Main parse function
 */
async function main() {
  try {
    console.log('Starting changelog parse...');

    // Read changelog
    const markdown = await readChangelog();

    // Parse all versions
    console.log('Parsing versions...');
    const versions = parseChangelog(markdown);

    console.log(`Found ${versions.length} versions`);

    // Create master index
    const versionIndex = {
      lastUpdated: new Date().toISOString(),
      totalVersions: versions.length,
      versions: versions.map(v => ({
        version: v.version,
        entryCount: v.entryCount,
        translationStatus: 'pending'
      }))
    };

    // Sort versions (newest first)
    versionIndex.versions = versionIndex.versions.sort((a, b) =>
      sortVersions([a.version, b.version], 'desc')[0] === a.version ? -1 : 1
    );

    // Write master index
    await mkdir(dirname(VERSIONS_INDEX_PATH), { recursive: true });
    await writeFile(
      VERSIONS_INDEX_PATH,
      JSON.stringify(versionIndex, null, 2),
      'utf-8'
    );
    console.log(`Wrote versions index to ${VERSIONS_INDEX_PATH}`);

    // Write individual version files (English only, no translations yet)
    await mkdir(TRANSLATIONS_DIR, { recursive: true });

    for (const versionData of versions) {
      const versionFile = join(TRANSLATIONS_DIR, `${versionData.version}.json`);

      const versionJson = {
        version: versionData.version,
        parsedAt: new Date().toISOString(),
        translationStatus: 'pending',
        entries: versionData.entries.map(entry => ({
          category: entry.category,
          scope: entry.scope,
          original: entry.text,
          translation: null
        }))
      };

      await writeFile(versionFile, JSON.stringify(versionJson, null, 2), 'utf-8');
      console.log(`  - ${versionData.version}: ${versionData.entryCount} entries`);
    }

    console.log('\nParse complete!');
    console.log(`Total versions: ${versions.length}`);

    // Set GitHub Actions output if in CI
    if (process.env.GITHUB_ACTIONS) {
      const outputFile = process.env.GITHUB_OUTPUT;
      if (outputFile) {
        const output = `has_versions=true\nversion_count=${versions.length}\n`;
        await writeFile(outputFile, output, { flag: 'a' });
      }
    }

  } catch (error) {
    console.error('Error parsing changelog:', error);
    process.exit(1);
  }
}

main();
