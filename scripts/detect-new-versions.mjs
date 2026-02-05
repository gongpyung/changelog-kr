/**
 * Detect new changelog versions by comparing remote with local data
 * Outputs GitHub Actions variables if running in CI
 */

import { readFile, appendFile } from 'fs/promises';
import { appendFileSync } from 'node:fs';
import { join } from 'path';

const REMOTE_CHANGELOG_URL = 'https://raw.githubusercontent.com/anthropics/claude-code/main/CHANGELOG.md';
const VERSIONS_FILE = join('data', 'versions.json');

/**
 * Fetch remote CHANGELOG.md
 */
async function fetchRemoteChangelog() {
  console.log('Fetching remote CHANGELOG.md...');
  const response = await fetch(REMOTE_CHANGELOG_URL);

  if (!response.ok) {
    throw new Error(`Failed to fetch remote changelog: ${response.status} ${response.statusText}`);
  }

  return await response.text();
}

/**
 * Parse version headers from markdown content
 */
function parseVersions(markdown) {
  const versionRegex = /^## (\d+\.\d+\.\d+(?:-[a-z0-9.]+)?)/gm;
  const versions = [];
  let match;

  while ((match = versionRegex.exec(markdown)) !== null) {
    versions.push(match[1]);
  }

  return versions;
}

/**
 * Read local versions.json
 */
async function readLocalVersions() {
  try {
    const content = await readFile(VERSIONS_FILE, 'utf-8');
    const data = JSON.parse(content);
    return data.versions.map(v => v.version);
  } catch (error) {
    console.warn(`Warning: Could not read ${VERSIONS_FILE}: ${error.message}`);
    return [];
  }
}

/**
 * Set GitHub Actions output variable
 */
function setGitHubOutput(name, value) {
  const outputFile = process.env.GITHUB_OUTPUT;
  if (!outputFile) {
    return;
  }

  // Write to GITHUB_OUTPUT file
  const line = `${name}=${value}\n`;
  appendFileSync(outputFile, line, 'utf-8');
}

/**
 * Main function
 */
async function main() {
  console.log('Claude Code Version Detector\n');

  // Fetch and parse remote versions
  const remoteMarkdown = await fetchRemoteChangelog();
  const remoteVersions = parseVersions(remoteMarkdown);
  console.log(`Found ${remoteVersions.length} versions in remote changelog`);

  // Read local versions
  const localVersions = await readLocalVersions();
  console.log(`Found ${localVersions.length} versions in local data`);

  // Find new versions
  const newVersions = remoteVersions.filter(v => !localVersions.includes(v));

  // Output results
  console.log('\n' + '='.repeat(60));
  if (newVersions.length > 0) {
    console.log(`✓ Found ${newVersions.length} new version(s):`);
    newVersions.forEach(v => console.log(`  - ${v}`));

    // Set GitHub Actions outputs
    setGitHubOutput('has_new', 'true');
    setGitHubOutput('new_versions', JSON.stringify(newVersions));
  } else {
    console.log('No new versions found.');

    // Set GitHub Actions outputs
    setGitHubOutput('has_new', 'false');
    setGitHubOutput('new_versions', '[]');
  }
  console.log('='.repeat(60));

  // Always exit 0
  process.exit(0);
}

main().catch(error => {
  console.error('\n✗ Error:', error.message);

  // Set GitHub Actions outputs for error case
  setGitHubOutput('has_new', 'false');
  setGitHubOutput('new_versions', '[]');

  // Still exit 0 (don't fail the workflow)
  process.exit(0);
});
