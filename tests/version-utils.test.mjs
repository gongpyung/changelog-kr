/**
 * Tests for version-utils.mjs
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { compareVersions, sortVersions, isNewerThan } from '../scripts/utils/version-utils.mjs';

describe('compareVersions', () => {
  it('should compare equal versions', () => {
    assert.equal(compareVersions('1.0.0', '1.0.0'), 0);
    assert.equal(compareVersions('2.5.10', '2.5.10'), 0);
  });

  it('should compare by major version', () => {
    assert.equal(compareVersions('2.0.0', '1.0.0'), 1);
    assert.equal(compareVersions('1.0.0', '2.0.0'), -1);
  });

  it('should compare by minor version when major is equal', () => {
    assert.equal(compareVersions('1.5.0', '1.3.0'), 1);
    assert.equal(compareVersions('1.3.0', '1.5.0'), -1);
  });

  it('should compare by patch version when major and minor are equal', () => {
    assert.equal(compareVersions('1.0.5', '1.0.3'), 1);
    assert.equal(compareVersions('1.0.3', '1.0.5'), -1);
  });

  it('should treat pre-release as lower than stable', () => {
    assert.equal(compareVersions('2.1.0-beta.1', '2.1.0'), -1);
    assert.equal(compareVersions('2.1.0', '2.1.0-beta.1'), 1);
  });

  it('should compare two pre-release versions', () => {
    assert.equal(compareVersions('2.1.0-alpha', '2.1.0-beta'), -1);
    assert.equal(compareVersions('2.1.0-beta', '2.1.0-alpha'), 1);
    assert.equal(compareVersions('2.1.0-beta.1', '2.1.0-beta.2'), -1);
  });

  it('should handle versions with different number of digits', () => {
    assert.equal(compareVersions('1.0', '1.0.0'), 0);
    assert.equal(compareVersions('1', '1.0.0'), 0);
  });
});

describe('sortVersions', () => {
  it('should sort array of versions descending by default', () => {
    const versions = ['1.0.0', '2.0.0', '1.5.0', '1.0.5'];
    const sorted = sortVersions(versions);

    assert.deepEqual(sorted, ['2.0.0', '1.5.0', '1.0.5', '1.0.0']);
  });

  it('should sort array of versions ascending', () => {
    const versions = ['2.0.0', '1.0.0', '1.5.0'];
    const sorted = sortVersions(versions, 'asc');

    assert.deepEqual(sorted, ['1.0.0', '1.5.0', '2.0.0']);
  });

  it('should sort pre-release versions correctly', () => {
    const versions = ['2.1.0', '2.1.0-beta.1', '2.0.0', '2.1.0-alpha'];
    const sorted = sortVersions(versions);

    assert.deepEqual(sorted, ['2.1.0', '2.1.0-beta.1', '2.1.0-alpha', '2.0.0']);
  });

  it('should not mutate original array', () => {
    const versions = ['2.0.0', '1.0.0'];
    const original = [...versions];
    sortVersions(versions);

    assert.deepEqual(versions, original);
  });
});

describe('isNewerThan', () => {
  it('should return true when version is newer', () => {
    assert.equal(isNewerThan('2.0.0', '1.0.0'), true);
    assert.equal(isNewerThan('1.5.0', '1.0.0'), true);
    assert.equal(isNewerThan('1.0.5', '1.0.0'), true);
  });

  it('should return false when version is older', () => {
    assert.equal(isNewerThan('1.0.0', '2.0.0'), false);
    assert.equal(isNewerThan('1.0.0', '1.5.0'), false);
  });

  it('should return false when versions are equal', () => {
    assert.equal(isNewerThan('1.0.0', '1.0.0'), false);
  });

  it('should handle pre-release comparisons', () => {
    assert.equal(isNewerThan('2.1.0', '2.1.0-beta.1'), true);
    assert.equal(isNewerThan('2.1.0-beta.1', '2.1.0'), false);
    assert.equal(isNewerThan('2.1.0-beta.2', '2.1.0-beta.1'), true);
  });
});
