/**
 * Version Utilities
 * Semantic version comparison and sorting
 */

/**
 * Parse version string into [major, minor, patch]
 */
function parseVersion(version) {
  const [main, ...preReleaseParts] = version.split('-');
  const preRelease = preReleaseParts.length > 0 ? preReleaseParts.join('-') : null;
  const parts = main.split('.').map(Number);
  return {
    major: parts[0] || 0,
    minor: parts[1] || 0,
    patch: parts[2] || 0,
    preRelease
  };
}

/**
 * Compare two version strings
 * @returns -1 if a < b, 0 if a === b, 1 if a > b
 */
export function compareVersions(a, b) {
  const vA = parseVersion(a);
  const vB = parseVersion(b);

  if (vA.major !== vB.major) {
    return vA.major < vB.major ? -1 : 1;
  }

  if (vA.minor !== vB.minor) {
    return vA.minor < vB.minor ? -1 : 1;
  }

  if (vA.patch !== vB.patch) {
    return vA.patch < vB.patch ? -1 : 1;
  }

  // Pre-release handling: version with pre-release < version without
  if (vA.preRelease && !vB.preRelease) return -1;
  if (!vA.preRelease && vB.preRelease) return 1;
  if (vA.preRelease && vB.preRelease) {
    return vA.preRelease < vB.preRelease ? -1 : vA.preRelease > vB.preRelease ? 1 : 0;
  }

  return 0;
}

/**
 * Sort version strings
 * @param {string[]} versions - Array of version strings
 * @param {string} order - 'asc' or 'desc'
 */
export function sortVersions(versions, order = 'desc') {
  const sorted = [...versions].sort(compareVersions);
  return order === 'desc' ? sorted.reverse() : sorted;
}

/**
 * Check if version is newer than baseline
 */
export function isNewerThan(version, baseline) {
  return compareVersions(version, baseline) > 0;
}
