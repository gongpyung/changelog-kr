/**
 * Changelog Parser for Claude Code
 * Parses markdown changelog into structured version entries
 */

const SCOPE_REGEX = /^\[([^\]]+)\]/;
const VERSION_REGEX = /^## (\d+\.\d+\.\d+(?:-[a-z0-9.]+)?)/;

/**
 * Classify entry based on first word
 */
function classifyEntry(text) {
  const firstWord = text.trim().split(/\s+/)[0].toLowerCase().replace(/[^a-z]/g, '');

  if (['added', 'add'].includes(firstWord)) return 'added';
  if (['fixed', 'fix'].includes(firstWord)) return 'fixed';
  if (['improved', 'improve', 'enhanced', 'enhance'].includes(firstWord)) return 'improved';
  if (['changed', 'change', 'updated', 'update', 'renamed', 'rename'].includes(firstWord)) return 'changed';
  if (['removed', 'remove', 'deprecated', 'deprecate'].includes(firstWord)) return 'removed';

  return 'other';
}

/**
 * Extract scope tag from start of text
 */
function extractScope(text) {
  const match = text.match(SCOPE_REGEX);
  if (match) {
    return {
      scope: match[1],
      text: text.slice(match[0].length).trim()
    };
  }
  return { scope: null, text };
}

/**
 * Parse a single version section
 */
function parseVersionSection(lines, startIndex) {
  const entries = [];
  let currentEntry = null;

  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i];

    // Stop at next version heading
    if (VERSION_REGEX.test(line)) {
      break;
    }

    // New bullet point
    if (line.startsWith('- ')) {
      // Save previous entry if exists
      if (currentEntry) {
        entries.push(currentEntry);
      }

      // Start new entry
      const bulletText = line.slice(2).trim();
      const { scope, text } = extractScope(bulletText);

      currentEntry = {
        text,
        scope,
        category: classifyEntry(text),
        raw: bulletText
      };
    }
    // Continuation line (multi-line bullet)
    else if (currentEntry && line.trim() && !line.startsWith('#')) {
      currentEntry.text += ' ' + line.trim();
      currentEntry.raw += ' ' + line.trim();
    }
  }

  // Add last entry
  if (currentEntry) {
    entries.push(currentEntry);
  }

  return entries;
}

/**
 * Parse entire changelog
 */
export function parseChangelog(markdown) {
  const lines = markdown.split('\n');
  const versions = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(VERSION_REGEX);

    if (match) {
      const version = match[1];
      const entries = parseVersionSection(lines, i + 1);

      versions.push({
        version,
        entries,
        entryCount: entries.length
      });
    }
  }

  return versions;
}

/**
 * Parse only a specific version
 */
export function parseVersion(markdown, versionStr) {
  const lines = markdown.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(VERSION_REGEX);

    if (match && match[1] === versionStr) {
      const entries = parseVersionSection(lines, i + 1);
      return {
        version: versionStr,
        entries,
        entryCount: entries.length
      };
    }
  }

  return null;
}
