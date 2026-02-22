/**
 * Migration Script Unit Tests
 * scripts/migrate-translation-to-translated.mjs 의 5가지 분기를 검증
 *
 * Node.js 20+ node:test + node:assert/strict
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(__dirname, '..', 'scripts', 'migrate-translation-to-translated.mjs');

let tmpDir;
let translationsDir;

function setup(entries) {
  tmpDir = mkdtempSync(join(tmpdir(), 'migrate-test-'));
  translationsDir = join(tmpDir, 'data', 'services', 'test-svc', 'translations');
  mkdirSync(translationsDir, { recursive: true });
  writeFileSync(
    join(translationsDir, '1.0.0.json'),
    JSON.stringify({ version: '1.0.0', entries }, null, 2),
  );
}

function runMigrate(mode) {
  execSync(`node "${SCRIPT}" ${mode}`, {
    env: { ...process.env, MIGRATE_BASE_DIR: tmpDir },
    encoding: 'utf-8',
  });
}

function readEntries() {
  const data = JSON.parse(readFileSync(join(translationsDir, '1.0.0.json'), 'utf-8'));
  return data.entries;
}

function cleanup() {
  if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
}

describe('migrate-translation-to-translated', () => {
  afterEach(() => cleanup());

  it('translated만 존재 → 변경 없음', () => {
    setup([{ category: 'added', original: 'Hello', translated: '안녕하세요' }]);
    runMigrate('--apply');
    const entries = readEntries();
    assert.equal(entries[0].translated, '안녕하세요');
    assert.equal(Object.prototype.hasOwnProperty.call(entries[0], 'translation'), false);
  });

  it('translation만 존재 → translated로 복사', () => {
    setup([{ category: 'added', original: 'Hello', translation: '안녕하세요' }]);
    runMigrate('--apply');
    const entries = readEntries();
    assert.equal(entries[0].translated, '안녕하세요');
    assert.equal(Object.prototype.hasOwnProperty.call(entries[0], 'translation'), false);
  });

  it('둘 다 존재 + 값 동일 → translation 삭제', () => {
    setup([{ category: 'added', original: 'Hello', translated: '안녕하세요', translation: '안녕하세요' }]);
    runMigrate('--apply');
    const entries = readEntries();
    assert.equal(entries[0].translated, '안녕하세요');
    assert.equal(Object.prototype.hasOwnProperty.call(entries[0], 'translation'), false);
  });

  it('둘 다 존재 + 값 다름 → translated 우선, translation 삭제 (conflict)', () => {
    setup([{ category: 'added', original: 'Hello', translated: '안녕하세요', translation: '반갑습니다' }]);
    runMigrate('--apply');
    const entries = readEntries();
    assert.equal(entries[0].translated, '안녕하세요');
    assert.equal(Object.prototype.hasOwnProperty.call(entries[0], 'translation'), false);
  });

  it('translated: null + translation 유효 → translation 값 채택 (데이터 유실 방지)', () => {
    setup([{ category: 'added', original: 'Hello', translated: null, translation: '안녕하세요' }]);
    runMigrate('--apply');
    const entries = readEntries();
    assert.equal(entries[0].translated, '안녕하세요');
    assert.equal(Object.prototype.hasOwnProperty.call(entries[0], 'translation'), false);
  });

  it('conflict 발생 시 stdout에 건수 및 상세 내용 출력', () => {
    setup([
      { category: 'added', original: 'Hello', translated: '안녕하세요', translation: '반갑습니다' },
      { category: 'fixed', original: 'Goodbye', translated: '안녕히 가세요', translation: '잘 가요' },
    ]);
    const stdout = execSync(`node "${SCRIPT}" --dry-run`, {
      env: { ...process.env, MIGRATE_BASE_DIR: tmpDir },
      encoding: 'utf-8',
    });
    assert.match(stdout, /Conflicts: 2/);
    assert.match(stdout, /Sample conflicts \(2\/2\)/);
    assert.match(stdout, /translated: 안녕하세요/);
    assert.match(stdout, /translation: 반갑습니다/);
    assert.match(stdout, /translated: 안녕히 가세요/);
    assert.match(stdout, /translation: 잘 가요/);
  });

  it('dry-run 모드에서 파일 수정 안 함', () => {
    setup([{ category: 'added', original: 'Hello', translation: '안녕하세요' }]);
    runMigrate('--dry-run');
    const entries = readEntries();
    assert.equal(Object.prototype.hasOwnProperty.call(entries[0], 'translation'), true);
    assert.equal(Object.prototype.hasOwnProperty.call(entries[0], 'translated'), false);
  });
});
