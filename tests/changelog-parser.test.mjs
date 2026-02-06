/**
 * Tests for changelog-parser.mjs
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseChangelog, parseVersion } from '../scripts/utils/changelog-parser.mjs';

describe('parseChangelog', () => {
  it('should parse multi-version changelog with multiple entries', () => {
    const markdown = `
## 2.1.0

- [Feature] Added new feature
- [Bug] Fixed critical bug
- Improved performance

## 2.0.0

- [Breaking] Major update
- Added support for new API
`;

    const result = parseChangelog(markdown);

    assert.equal(result.length, 2);
    assert.equal(result[0].version, '2.1.0');
    assert.equal(result[0].entries.length, 3);
    assert.equal(result[1].version, '2.0.0');
    assert.equal(result[1].entries.length, 2);
  });

  it('should parse pre-release version', () => {
    const markdown = `
## 2.1.0-beta.1

- [Feature] Beta feature
- Fixed beta bug
`;

    const result = parseChangelog(markdown);

    assert.equal(result.length, 1);
    assert.equal(result[0].version, '2.1.0-beta.1');
    assert.equal(result[0].entries.length, 2);
  });

  it('should handle empty input', () => {
    const result = parseChangelog('');
    assert.equal(result.length, 0);
  });

  it('should handle input with no version headers', () => {
    const markdown = `
Some random text
- Random bullet point
- Another point
`;

    const result = parseChangelog(markdown);
    assert.equal(result.length, 0);
  });

  it('should correctly categorize entries', () => {
    const markdown = `
## 1.0.0

- Added new feature
- Fixed bug
- Improved performance
- Changed behavior
- Removed deprecated API
- Updated documentation
`;

    const result = parseChangelog(markdown);
    const entries = result[0].entries;

    assert.equal(entries[0].category, 'added');
    assert.equal(entries[1].category, 'fixed');
    assert.equal(entries[2].category, 'improved');
    assert.equal(entries[3].category, 'changed');
    assert.equal(entries[4].category, 'removed');
  });

  it('should extract scope tags', () => {
    const markdown = `
## 1.0.0

- [Feature] Added scope feature
- [Bug] Fixed scope bug
- No scope here
`;

    const result = parseChangelog(markdown);
    const entries = result[0].entries;

    assert.equal(entries[0].scope, 'Feature');
    assert.equal(entries[0].text, 'Added scope feature');
    assert.equal(entries[1].scope, 'Bug');
    assert.equal(entries[2].scope, null);
  });
});

describe('parseVersion', () => {
  it('should parse specific version from changelog', () => {
    const markdown = `
## 2.1.0

- Feature A

## 2.0.0

- Feature B
`;

    const result = parseVersion(markdown, '2.0.0');

    assert.equal(result.version, '2.0.0');
    assert.equal(result.entries.length, 1);
    assert.equal(result.entries[0].text, 'Feature B');
  });

  it('should return null for non-existent version', () => {
    const markdown = `
## 2.1.0

- Feature A
`;

    const result = parseVersion(markdown, '3.0.0');
    assert.equal(result, null);
  });
});
