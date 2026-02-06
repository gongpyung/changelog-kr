/**
 * Tests for releases-parser.mjs
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseReleaseBody, normalizeTagToVersion } from '../scripts/utils/releases-parser.mjs';

describe('parseReleaseBody', () => {
  it('should parse "What\'s Changed" body with PR links', () => {
    const body = `
## What's Changed

* Add new feature by @user1 in https://github.com/owner/repo/pull/123
* Fix critical bug by @user2 in https://github.com/owner/repo/pull/124
* Update documentation by @user3 in https://github.com/owner/repo/pull/125

**Full Changelog**: https://github.com/owner/repo/compare/v1.0.0...v1.1.0
`;

    const result = parseReleaseBody(body);

    assert.equal(result.length, 3);
    assert.equal(result[0].text, 'Add new feature');
    assert.equal(result[0].category, 'added');
    assert.equal(result[1].text, 'Fix critical bug');
    assert.equal(result[1].category, 'fixed');
  });

  it('should handle empty body', () => {
    const result = parseReleaseBody('');
    assert.deepEqual(result, []);
  });

  it('should handle null body', () => {
    const result = parseReleaseBody(null);
    assert.deepEqual(result, []);
  });

  it('should infer entry type - feat', () => {
    const body = `
* feat: Add new feature by @user in https://github.com/owner/repo/pull/1
* Add another feature by @user in https://github.com/owner/repo/pull/2
`;

    const result = parseReleaseBody(body);

    assert.equal(result[0].category, 'added');
    assert.equal(result[1].category, 'added');
  });

  it('should infer entry type - fix', () => {
    const body = `
* fix: Fix bug by @user in https://github.com/owner/repo/pull/1
* Fixed another bug by @user in https://github.com/owner/repo/pull/2
`;

    const result = parseReleaseBody(body);

    assert.equal(result[0].category, 'fixed');
    assert.equal(result[1].category, 'fixed');
  });

  it('should infer entry type - chore', () => {
    const body = `
* chore: Update dependencies by @user in https://github.com/owner/repo/pull/1
`;

    const result = parseReleaseBody(body);

    assert.equal(result[0].category, 'changed');
  });

  it('should infer entry type - docs', () => {
    const body = `
* docs: Update README by @user in https://github.com/owner/repo/pull/1
`;

    const result = parseReleaseBody(body);

    assert.equal(result[0].category, 'other');
  });

  it('should filter out Full Changelog and New Contributors lines', () => {
    const body = `
* Add feature by @user in https://github.com/owner/repo/pull/1
**Full Changelog**: https://github.com/owner/repo/compare/v1.0.0...v1.1.0
* New Contributors section
`;

    const result = parseReleaseBody(body);

    assert.equal(result.length, 1);
    assert.equal(result[0].text, 'Add feature');
  });

  it('should handle general list items without PR pattern', () => {
    const body = `
- Added new feature
- Fixed bug
* Improved performance
`;

    const result = parseReleaseBody(body);

    assert.equal(result.length, 3);
    assert.equal(result[0].text, 'Added new feature');
    assert.equal(result[1].text, 'Fixed bug');
    assert.equal(result[2].text, 'Improved performance');
  });
});

describe('normalizeTagToVersion', () => {
  it('should normalize "v1.0.0" to "1.0.0"', () => {
    assert.equal(normalizeTagToVersion('v1.0.0'), '1.0.0');
  });

  it('should normalize "rust-v0.99.0-alpha.4" to "0.99.0-alpha.4"', () => {
    assert.equal(normalizeTagToVersion('rust-v0.99.0-alpha.4'), '0.99.0-alpha.4');
  });

  it('should keep "1.0.0" as "1.0.0" (no prefix)', () => {
    assert.equal(normalizeTagToVersion('1.0.0'), '1.0.0');
  });

  it('should handle release prefix', () => {
    assert.equal(normalizeTagToVersion('release-1.2.3'), '1.2.3');
  });

  it('should handle complex pre-release tags', () => {
    assert.equal(normalizeTagToVersion('v2.1.0-beta.1'), '2.1.0-beta.1');
    assert.equal(normalizeTagToVersion('v2.1.0-rc.2'), '2.1.0-rc.2');
  });

  it('should fallback to original tag if no match', () => {
    assert.equal(normalizeTagToVersion('invalid-tag'), 'invalid-tag');
  });
});
