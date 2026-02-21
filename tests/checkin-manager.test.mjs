/**
 * Tests for CheckInManager (site/assets/checkin.js)
 * Node.js 20+ node:test + node:assert/strict
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const checkinSrc = readFileSync(join(__dirname, '../site/assets/checkin.js'), 'utf8');

// Setup global mock environment and load CheckInManager
function loadCheckInManager() {
  const g = {
    window: {},
    SupabaseClient: null,
  };
  g.window = g;
  // Execute the IIFE in a controlled scope
  const fn = new Function('window', checkinSrc + '\nreturn window.CheckInManager;');
  return fn(g.window);
}

let CM;

// Re-create a fresh CheckInManager before each describe block by loading at module level
// and resetting internal state between tests via direct property access.
function freshCM() {
  CM = loadCheckInManager();
  CM._checkins = {};
  CM._initialized = false;
  return CM;
}

// ---------------------------------------------------------------------------
// _compareVersions
// ---------------------------------------------------------------------------

describe('_compareVersions', () => {
  beforeEach(() => freshCM());

  it('동일 버전은 0 반환', () => {
    assert.equal(CM._compareVersions('1.0.0', '1.0.0'), 0);
    assert.equal(CM._compareVersions('2.5.10', '2.5.10'), 0);
  });

  it('major 비교: 큰 쪽이 1 반환', () => {
    assert.equal(CM._compareVersions('2.0.0', '1.0.0'), 1);
    assert.equal(CM._compareVersions('1.0.0', '2.0.0'), -1);
  });

  it('minor 비교: major 같을 때', () => {
    assert.equal(CM._compareVersions('1.5.0', '1.3.0'), 1);
    assert.equal(CM._compareVersions('1.3.0', '1.5.0'), -1);
  });

  it('patch 비교: major/minor 같을 때', () => {
    assert.equal(CM._compareVersions('1.0.5', '1.0.3'), 1);
    assert.equal(CM._compareVersions('1.0.3', '1.0.5'), -1);
  });

  it('v 접두사 제거 후 동일 취급', () => {
    assert.equal(CM._compareVersions('v1.0.0', '1.0.0'), 0);
    assert.equal(CM._compareVersions('v2.0.0', 'v1.0.0'), 1);
  });

  it('2자리 버전: 누락 부분은 0 취급', () => {
    assert.equal(CM._compareVersions('1.0', '1.0.0'), 0);
    assert.equal(CM._compareVersions('1.1', '1.0.9'), 1);
  });
});

// ---------------------------------------------------------------------------
// isNewVersion
// ---------------------------------------------------------------------------

describe('isNewVersion', () => {
  beforeEach(() => freshCM());

  it('기록 없으면 true 반환 (모두 새 버전)', () => {
    assert.equal(CM.isNewVersion('claude-code', '1.0.0'), true);
    assert.equal(CM.isNewVersion('claude-code', '2.5.0'), true);
  });

  it('checkin 버전보다 높으면 true', () => {
    CM._checkins['claude-code'] = { lastCheckedVersion: '1.0.0' };
    assert.equal(CM.isNewVersion('claude-code', '1.1.0'), true);
    assert.equal(CM.isNewVersion('claude-code', '2.0.0'), true);
  });

  it('checkin 버전과 동일하면 false', () => {
    CM._checkins['claude-code'] = { lastCheckedVersion: '1.0.0' };
    assert.equal(CM.isNewVersion('claude-code', '1.0.0'), false);
  });

  it('checkin 버전보다 낮으면 false', () => {
    CM._checkins['claude-code'] = { lastCheckedVersion: '2.0.0' };
    assert.equal(CM.isNewVersion('claude-code', '1.9.9'), false);
    assert.equal(CM.isNewVersion('claude-code', '1.0.0'), false);
  });
});

// ---------------------------------------------------------------------------
// getUnseenVersions
// ---------------------------------------------------------------------------

describe('getUnseenVersions', () => {
  beforeEach(() => freshCM());

  const versions = [
    { version: '3.0.0' },
    { version: '2.5.0' },
    { version: '2.0.0' },
    { version: '1.0.0' },
  ];

  it('기록 없으면 전체 반환', () => {
    const result = CM.getUnseenVersions('svc', versions);
    assert.deepEqual(result, versions);
  });

  it('기록 있으면 그 이후 버전만 반환', () => {
    CM._checkins['svc'] = { lastCheckedVersion: '2.0.0' };
    const result = CM.getUnseenVersions('svc', versions);
    assert.deepEqual(result, [{ version: '3.0.0' }, { version: '2.5.0' }]);
  });

  it('최신 버전으로 체크인 시 빈 배열 반환', () => {
    CM._checkins['svc'] = { lastCheckedVersion: '3.0.0' };
    const result = CM.getUnseenVersions('svc', versions);
    assert.deepEqual(result, []);
  });

  it('빈 배열 입력 시 빈 배열 반환', () => {
    const result = CM.getUnseenVersions('svc', []);
    assert.deepEqual(result, []);
  });
});

// ---------------------------------------------------------------------------
// getUnseenCount
// ---------------------------------------------------------------------------

describe('getUnseenCount', () => {
  beforeEach(() => freshCM());

  const versions = [
    { version: '3.0.0' },
    { version: '2.5.0' },
    { version: '2.0.0' },
    { version: '1.0.0' },
  ];

  it('기록 없으면 전체 길이 반환', () => {
    assert.equal(CM.getUnseenCount('svc', versions), 4);
  });

  it('getUnseenVersions().length와 일치', () => {
    CM._checkins['svc'] = { lastCheckedVersion: '2.0.0' };
    const count = CM.getUnseenCount('svc', versions);
    const expected = CM.getUnseenVersions('svc', versions).length;
    assert.equal(count, expected);
    assert.equal(count, 2);
  });

  it('빈 배열 입력 시 0 반환', () => {
    assert.equal(CM.getUnseenCount('svc', []), 0);
  });
});

// ---------------------------------------------------------------------------
// getCheckIn / isInitialized
// ---------------------------------------------------------------------------

describe('getCheckIn', () => {
  beforeEach(() => freshCM());

  it('기록 없으면 null 반환', () => {
    assert.equal(CM.getCheckIn('unknown'), null);
  });

  it('기록 있으면 해당 객체 반환', () => {
    CM._checkins['svc'] = { lastCheckedVersion: '1.0.0', lastCheckedAt: '2024-01-01' };
    const result = CM.getCheckIn('svc');
    assert.equal(result.lastCheckedVersion, '1.0.0');
  });
});

describe('isInitialized', () => {
  beforeEach(() => freshCM());

  it('초기 상태는 false', () => {
    assert.equal(CM.isInitialized(), false);
  });

  it('_initialized = true 설정 후 true 반환', () => {
    CM._initialized = true;
    assert.equal(CM.isInitialized(), true);
  });
});
