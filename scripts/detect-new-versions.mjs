/**
 * Detect new changelog versions for all enabled services
 * Compares remote sources with local data/services/{id}/versions.json
 * Outputs GitHub Actions variables if running in CI
 *
 * Environment variables:
 *   SERVICE_ID - optional, check only one service (e.g. "claude-code")
 *
 * Outputs (GitHub Actions):
 *   has_new - "true" if any service has new versions
 *   new_versions_map - JSON object: {"claude-code": ["2.1.33"], "gemini-cli": ["0.27.2"]}
 */

import { readFile } from 'fs/promises';
import { appendFileSync } from 'node:fs';
import { join } from 'path';
import { fetchAndParseReleases } from './utils/releases-parser.mjs';

const SERVICES_FILE = join('data', 'services.json');

/**
 * Fetch remote CHANGELOG.md from URL and parse version headers
 */
async function fetchMarkdownVersions(url) {
  console.log(`  Fetching markdown changelog from ${url}...`);
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch changelog: ${response.status} ${response.statusText}`);
  }

  const markdown = await response.text();
  const versionRegex = /^## \[?(\d+\.\d+\.\d+(?:-[a-z0-9.]+)?)\]?/gm;
  const versions = [];
  let match;

  while ((match = versionRegex.exec(markdown)) !== null) {
    versions.push(match[1]);
  }

  return versions;
}

/**
 * Get remote versions for a service based on its changelogType
 */
async function getRemoteVersions(service) {
  if (service.changelogType === 'markdown') {
    return await fetchMarkdownVersions(service.changelogSource.url);
  }

  if (service.changelogType === 'github-releases') {
    const result = await fetchAndParseReleases(service.changelogSource, { maxPages: 1 });
    return result.versions.map(v => v.version);
  }

  console.warn(`  Unknown changelogType: ${service.changelogType}`);
  return [];
}

/**
 * Read local versions.json for a service
 */
async function readLocalVersions(serviceId) {
  const versionsFile = join('data', 'services', serviceId, 'versions.json');
  try {
    const content = await readFile(versionsFile, 'utf-8');
    const data = JSON.parse(content);
    return (data.versions || []).map(v => v.version);
  } catch (error) {
    console.warn(`  Warning: Could not read ${versionsFile}: ${error.message}`);
    return [];
  }
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
 * Set GitHub Actions output variable
 */
function setGitHubOutput(name, value) {
  const outputFile = process.env.GITHUB_OUTPUT;
  if (!outputFile) {
    return;
  }
  const line = `${name}=${value}\n`;
  appendFileSync(outputFile, line, 'utf-8');
}

/**
 * Main function
 */
async function main() {
  console.log('Multi-Service Version Detector\n');

  // Load services
  let services = await loadServices();
  console.log(`Loaded ${services.length} enabled service(s) from ${SERVICES_FILE}`);

  // Filter by SERVICE_ID if specified
  const filterServiceId = process.env.SERVICE_ID;
  if (filterServiceId) {
    services = services.filter(s => s.id === filterServiceId);
    if (services.length === 0) {
      console.error(`Service "${filterServiceId}" not found or not enabled.`);
      setGitHubOutput('has_new', 'false');
      setGitHubOutput('new_versions_map', '{}');
      process.exit(0);
    }
    console.log(`Filtered to service: ${filterServiceId}`);
  }

  const newVersionsMap = {};
  let totalNew = 0;
  let errorCount = 0;

  // Check each service
  for (const service of services) {
    console.log(`\n--- ${service.name} (${service.id}) ---`);

    try {
      // Get remote versions
      const remoteVersions = await getRemoteVersions(service);
      console.log(`  Remote: ${remoteVersions.length} version(s)`);

      // Get local versions
      const localVersions = await readLocalVersions(service.id);
      console.log(`  Local: ${localVersions.length} version(s)`);

      // Find new versions
      const newVersions = remoteVersions.filter(v => !localVersions.includes(v));

      if (newVersions.length > 0) {
        console.log(`  New: ${newVersions.length} version(s)`);
        newVersions.forEach(v => console.log(`    - ${v}`));
        newVersionsMap[service.id] = newVersions;
        totalNew += newVersions.length;
      } else {
        console.log('  No new versions.');
      }
    } catch (error) {
      console.error(`  [WARNING] Error checking ${service.name}: ${error.message}`);
      errorCount++;
    }
  }

  // Output results
  console.log('\n' + '='.repeat(60));
  if (totalNew > 0) {
    console.log(`Found ${totalNew} new version(s) across ${Object.keys(newVersionsMap).length} service(s):`);
    for (const [id, versions] of Object.entries(newVersionsMap)) {
      console.log(`  ${id}: ${versions.join(', ')}`);
    }

    setGitHubOutput('has_new', 'true');
    setGitHubOutput('new_versions_map', JSON.stringify(newVersionsMap));
  } else {
    console.log('No new versions found across all services.');

    setGitHubOutput('has_new', 'false');
    setGitHubOutput('new_versions_map', '{}');
  }
  console.log('='.repeat(60));

  // All services failed → signal CI failure
  if (errorCount > 0 && errorCount === services.length) {
    console.error(`\n[ERROR] All ${services.length} service(s) failed to fetch. Check network/API access.`);
    setGitHubOutput('has_new', 'false');
    setGitHubOutput('new_versions_map', '{}');
    process.exit(1);
  }

  // Partial failure is a warning, not an error
  if (errorCount > 0) {
    console.warn(`\n[WARNING] ${errorCount}/${services.length} service(s) failed; results may be incomplete.`);
  }

  process.exit(0);
}

main().catch(error => {
  console.error('\n[ERROR] Unexpected crash:', error.message);

  // Set GitHub Actions outputs for error case
  setGitHubOutput('has_new', 'false');
  setGitHubOutput('new_versions_map', '{}');

  // Total crash = failure
  process.exit(1);
});
