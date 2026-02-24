/**
 * Translation Debug Logger Unit Tests
 * Tests schema definitions, logger API, redaction, JSONL format, and no-op mode.
 *
 * Node.js 20+ node:test + node:assert/strict
 */

import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, rm, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  EVENT_TYPES,
  ERROR_CLASSES,
  COMMON_FIELDS,
  REQUIRED_FIELDS,
  validateEvent,
} from '../scripts/utils/translation-debug-schema.mjs';

import {
  createDebugSession,
  logEvent,
  logProviderCall,
  closeDebugSession,
  _getState,
  _resetState,
} from '../scripts/utils/translation-debug-logger.mjs';

// ============================================================================
// Group 1: Schema Tests
// ============================================================================

describe('Schema: EVENT_TYPES', () => {
  it('contains all required event type keys', () => {
    const expectedKeys = [
      'RUN_START', 'RUN_END', 'RUN_ERROR',
      'SERVICE_START', 'VERSION_START', 'VERSION_END',
      'PROVIDER_REQUEST', 'PROVIDER_SUCCESS', 'PROVIDER_ERROR',
      'FALLBACK',
      'QUALITY_CHECK',
      'RETRANSLATE_START', 'RETRANSLATE_END', 'RETRANSLATE_ENTRY',
    ];
    for (const key of expectedKeys) {
      assert.ok(key in EVENT_TYPES, `Missing key: ${key}`);
    }
  });

  it('values are lowercase snake_case strings', () => {
    for (const [key, value] of Object.entries(EVENT_TYPES)) {
      assert.equal(typeof value, 'string', `${key} value should be a string`);
      assert.match(value, /^[a-z_]+$/, `${key} value "${value}" should be lowercase snake_case`);
    }
  });
});

describe('Schema: ERROR_CLASSES', () => {
  it('contains expected error class values', () => {
    const expected = ['auth', 'quota', 'rate_limit', 'server', 'client', 'parse', 'unknown'];
    for (const val of expected) {
      assert.ok(Object.values(ERROR_CLASSES).includes(val), `Missing error class: ${val}`);
    }
  });
});

describe('Schema: COMMON_FIELDS', () => {
  it('includes timestamp, event_type, run_id, session_id', () => {
    for (const f of ['timestamp', 'event_type', 'run_id', 'session_id']) {
      assert.ok(COMMON_FIELDS.includes(f), `Missing common field: ${f}`);
    }
  });
});

describe('Schema: REQUIRED_FIELDS', () => {
  it('has entries for all event types', () => {
    for (const eventType of Object.values(EVENT_TYPES)) {
      assert.ok(eventType in REQUIRED_FIELDS, `Missing REQUIRED_FIELDS entry for: ${eventType}`);
    }
  });

  it('run_start requires engine, fallback_chain, total_services, total_versions', () => {
    const fields = REQUIRED_FIELDS[EVENT_TYPES.RUN_START];
    for (const f of ['engine', 'fallback_chain', 'total_services', 'total_versions']) {
      assert.ok(fields.includes(f), `Missing field: ${f}`);
    }
  });

  it('provider_request requires provider, model, endpoint_type, batch_size, char_count', () => {
    const fields = REQUIRED_FIELDS[EVENT_TYPES.PROVIDER_REQUEST];
    for (const f of ['provider', 'model', 'endpoint_type', 'batch_size', 'char_count']) {
      assert.ok(fields.includes(f), `Missing field: ${f}`);
    }
  });

  it('provider_error requires error_class, error_message, http_status, retry_count', () => {
    const fields = REQUIRED_FIELDS[EVENT_TYPES.PROVIDER_ERROR];
    for (const f of ['error_class', 'error_message', 'http_status', 'retry_count']) {
      assert.ok(fields.includes(f), `Missing field: ${f}`);
    }
  });

  it('retranslate_end requires found_count, retranslated_count, still_poor_count', () => {
    const fields = REQUIRED_FIELDS[EVENT_TYPES.RETRANSLATE_END];
    for (const f of ['found_count', 'retranslated_count', 'still_poor_count']) {
      assert.ok(fields.includes(f), `Missing field: ${f}`);
    }
  });
});

describe('Schema: validateEvent', () => {
  it('returns valid=true for a complete event', () => {
    const event = {
      timestamp: new Date().toISOString(),
      event_type: EVENT_TYPES.RUN_START,
      run_id: 'test-run-id',
      session_id: 'test-session-id',
      engine: 'gemini',
      fallback_chain: ['gemini', 'mock'],
      total_services: 2,
      total_versions: 5,
    };
    const result = validateEvent(event);
    assert.equal(result.valid, true);
    assert.deepEqual(result.missing, []);
  });

  it('returns valid=false with missing common fields', () => {
    const result = validateEvent({ event_type: EVENT_TYPES.RUN_START });
    assert.equal(result.valid, false);
    assert.ok(result.missing.includes('timestamp'));
    assert.ok(result.missing.includes('run_id'));
  });

  it('returns valid=false with missing event-specific fields', () => {
    const event = {
      timestamp: new Date().toISOString(),
      event_type: EVENT_TYPES.PROVIDER_REQUEST,
      run_id: 'x',
      session_id: 'y',
      // missing: provider, model, endpoint_type, batch_size, char_count
    };
    const result = validateEvent(event);
    assert.equal(result.valid, false);
    assert.ok(result.missing.includes('provider'));
    assert.ok(result.missing.includes('model'));
  });

  it('handles unknown event type gracefully (no extra required fields)', () => {
    const event = {
      timestamp: new Date().toISOString(),
      event_type: 'unknown_event',
      run_id: 'x',
      session_id: 'y',
    };
    const result = validateEvent(event);
    assert.equal(result.valid, true);
  });
});

// ============================================================================
// Group 2: Logger Disabled Mode (no-op)
// ============================================================================

describe('Logger: disabled mode (no-op)', () => {
  let savedEnv;

  beforeEach(() => {
    savedEnv = process.env.TRANSLATION_DEBUG_ENABLED;
    delete process.env.TRANSLATION_DEBUG_ENABLED;
    _resetState();
  });

  afterEach(() => {
    if (savedEnv === undefined) {
      delete process.env.TRANSLATION_DEBUG_ENABLED;
    } else {
      process.env.TRANSLATION_DEBUG_ENABLED = savedEnv;
    }
    _resetState();
  });

  it('createDebugSession returns { enabled: false }', async () => {
    const result = await createDebugSession();
    assert.deepEqual(result, { enabled: false });
  });

  it('createDebugSession does not create state', async () => {
    await createDebugSession();
    assert.equal(_getState(), null);
  });

  it('logEvent returns {} without writing', async () => {
    const result = await logEvent(EVENT_TYPES.RUN_START, { engine: 'mock' });
    assert.deepEqual(result, {});
  });

  it('logProviderCall returns {} without writing', async () => {
    const result = await logProviderCall('request', { provider: 'mock', model: 'mock' });
    assert.deepEqual(result, {});
  });

  it('closeDebugSession returns {} without writing', async () => {
    const result = await closeDebugSession({ total_services: 1 });
    assert.deepEqual(result, {});
  });
});

// ============================================================================
// Group 3: Logger Enabled Mode
// ============================================================================

describe('Logger: enabled mode', () => {
  let savedEnv;
  let testLogDir;

  before(async () => {
    testLogDir = join(tmpdir(), `debug-logger-test-${Date.now()}`);
    await mkdir(testLogDir, { recursive: true });
  });

  after(async () => {
    await rm(testLogDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    savedEnv = {
      TRANSLATION_DEBUG_ENABLED: process.env.TRANSLATION_DEBUG_ENABLED,
      TRANSLATION_DEBUG_LOG_DIR: process.env.TRANSLATION_DEBUG_LOG_DIR,
    };
    process.env.TRANSLATION_DEBUG_ENABLED = 'true';
    process.env.TRANSLATION_DEBUG_LOG_DIR = testLogDir;
    _resetState();
  });

  afterEach(() => {
    for (const [key, val] of Object.entries(savedEnv)) {
      if (val === undefined) delete process.env[key];
      else process.env[key] = val;
    }
    _resetState();
  });

  it('createDebugSession returns runId, sessionId, enabled=true', async () => {
    const result = await createDebugSession();
    assert.equal(result.enabled, true);
    assert.ok(typeof result.runId === 'string', 'runId should be a string');
    assert.ok(typeof result.sessionId === 'string', 'sessionId should be a string');
    assert.match(result.runId, /^\d{4}-\d{2}-\d{2}-[a-f0-9]{6}$/, 'runId format: YYYY-MM-DD-xxxxxx');
  });

  it('createDebugSession sets internal state', async () => {
    await createDebugSession();
    const state = _getState();
    assert.ok(state !== null);
    assert.ok(typeof state.runId === 'string');
    assert.ok(typeof state.sessionId === 'string');
    assert.ok(typeof state.logFile === 'string');
    assert.ok(typeof state.startTime === 'number');
  });

  it('logEvent writes a valid JSON line to the log file', async () => {
    const { runId } = await createDebugSession();
    await logEvent(EVENT_TYPES.SERVICE_START, { service_id: 'claude-code' });

    const logFile = join(testLogDir, `${runId}.jsonl`);
    const content = await readFile(logFile, 'utf8');
    const lines = content.trim().split('\n').filter(Boolean);
    assert.equal(lines.length, 1);

    const parsed = JSON.parse(lines[0]);
    assert.equal(parsed.event_type, EVENT_TYPES.SERVICE_START);
    assert.equal(parsed.service_id, 'claude-code');
    assert.ok(typeof parsed.timestamp === 'string');
    assert.ok(typeof parsed.run_id === 'string');
  });

  it('logEvent appends multiple lines', async () => {
    const { runId } = await createDebugSession();
    await logEvent(EVENT_TYPES.SERVICE_START, { service_id: 'svc-a' });
    await logEvent(EVENT_TYPES.VERSION_START, { service_id: 'svc-a', version: '1.0.0' });

    const logFile = join(testLogDir, `${runId}.jsonl`);
    const content = await readFile(logFile, 'utf8');
    const lines = content.trim().split('\n').filter(Boolean);
    assert.equal(lines.length, 2);
  });

  it('logProviderCall(request) maps to PROVIDER_REQUEST', async () => {
    const { runId } = await createDebugSession();
    const event = await logProviderCall('request', {
      provider: 'gemini', model: 'gemini-flash', endpoint_type: 'chat',
      batch_size: 5, char_count: 100, call_key: 'test-key-1',
    });
    assert.equal(event.event_type, EVENT_TYPES.PROVIDER_REQUEST);

    const logFile = join(testLogDir, `${runId}.jsonl`);
    const content = await readFile(logFile, 'utf8');
    const parsed = JSON.parse(content.trim().split('\n')[0]);
    assert.equal(parsed.event_type, EVENT_TYPES.PROVIDER_REQUEST);
  });

  it('logProviderCall(success) maps to PROVIDER_SUCCESS with duration_ms', async () => {
    const { runId } = await createDebugSession();
    await logProviderCall('request', {
      provider: 'gemini', model: 'gemini-flash', endpoint_type: 'chat',
      batch_size: 5, char_count: 100, call_key: 'test-key-2',
    });
    const event = await logProviderCall('success', {
      provider: 'gemini', model: 'gemini-flash',
      batch_size: 5, char_count: 100, http_status: 200, call_key: 'test-key-2',
    });
    assert.equal(event.event_type, EVENT_TYPES.PROVIDER_SUCCESS);
    assert.ok(typeof event.duration_ms === 'number', 'duration_ms should be a number');
    assert.ok(event.duration_ms >= 0);
  });

  it('logProviderCall(error) maps to PROVIDER_ERROR with duration_ms', async () => {
    await createDebugSession();
    await logProviderCall('request', {
      provider: 'gemini', model: 'gemini-flash', endpoint_type: 'chat',
      batch_size: 5, char_count: 100, call_key: 'test-key-3',
    });
    const event = await logProviderCall('error', {
      provider: 'gemini', model: 'gemini-flash',
      error_class: 'quota', error_message: 'exceeded', http_status: 429,
      retry_count: 0, call_key: 'test-key-3',
    });
    assert.equal(event.event_type, EVENT_TYPES.PROVIDER_ERROR);
    assert.ok(typeof event.duration_ms === 'number');
  });

  it('closeDebugSession writes run_end and clears state', async () => {
    const { runId } = await createDebugSession();
    const summary = { total_services: 2, total_versions: 4, total_entries: 20, total_chars: 500 };
    const event = await closeDebugSession(summary);

    assert.equal(event.event_type, EVENT_TYPES.RUN_END);
    assert.ok(typeof event.duration_ms === 'number');
    assert.equal(_getState(), null);

    const logFile = join(testLogDir, `${runId}.jsonl`);
    const content = await readFile(logFile, 'utf8');
    const lines = content.trim().split('\n').filter(Boolean);
    const last = JSON.parse(lines[lines.length - 1]);
    assert.equal(last.event_type, EVENT_TYPES.RUN_END);
  });
});

// ============================================================================
// Group 4: Redaction Tests
// ============================================================================

describe('Logger: redaction', () => {
  let savedEnv;
  let testLogDir;

  before(async () => {
    testLogDir = join(tmpdir(), `debug-logger-redact-test-${Date.now()}`);
    await mkdir(testLogDir, { recursive: true });
  });

  after(async () => {
    await rm(testLogDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    savedEnv = {
      TRANSLATION_DEBUG_ENABLED: process.env.TRANSLATION_DEBUG_ENABLED,
      TRANSLATION_DEBUG_LOG_DIR: process.env.TRANSLATION_DEBUG_LOG_DIR,
      TRANSLATION_DEBUG_REDACT_TEXT: process.env.TRANSLATION_DEBUG_REDACT_TEXT,
    };
    process.env.TRANSLATION_DEBUG_ENABLED = 'true';
    process.env.TRANSLATION_DEBUG_LOG_DIR = testLogDir;
    process.env.TRANSLATION_DEBUG_REDACT_TEXT = 'true';
    _resetState();
  });

  afterEach(() => {
    for (const [key, val] of Object.entries(savedEnv)) {
      if (val === undefined) delete process.env[key];
      else process.env[key] = val;
    }
    _resetState();
  });

  it('text fields are redacted to { preview, hash, length }', async () => {
    await createDebugSession();
    const event = await logEvent(EVENT_TYPES.VERSION_START, {
      service_id: 'test',
      version: '1.0.0',
      original: 'Hello world this is a test sentence',
    });

    assert.equal(typeof event.original, 'object', 'original should be redacted to object');
    assert.ok('preview' in event.original, 'should have preview field');
    assert.ok('hash' in event.original, 'should have hash field');
    assert.ok('length' in event.original, 'should have length field');
    assert.equal(event.original.length, 'Hello world this is a test sentence'.length);
    assert.equal(event.original.preview, 'Hello world this is a test sentence'.slice(0, 80));
    assert.equal(typeof event.original.hash, 'string');
    assert.equal(event.original.hash.length, 12);
  });

  it('translated fields are redacted', async () => {
    await createDebugSession();
    const event = await logEvent(EVENT_TYPES.VERSION_END, {
      service_id: 'test',
      version: '1.0.0',
      entry_count: 1,
      duration_ms: 100,
      translated: '안녕하세요',
    });
    assert.equal(typeof event.translated, 'object');
    assert.ok('hash' in event.translated);
  });

  it('authorization headers are fully replaced with [REDACTED]', async () => {
    await createDebugSession();
    const event = await logEvent(EVENT_TYPES.PROVIDER_REQUEST, {
      provider: 'gemini',
      model: 'gemini-flash',
      endpoint_type: 'chat',
      batch_size: 1,
      char_count: 5,
      authorization: 'Bearer sk-secret-key-12345',
    });
    assert.equal(event.authorization, '[REDACTED]');
  });

  it('api_key fields are fully replaced with [REDACTED]', async () => {
    await createDebugSession();
    const event = await logEvent(EVENT_TYPES.PROVIDER_REQUEST, {
      provider: 'openai',
      model: 'gpt-4',
      endpoint_type: 'chat',
      batch_size: 1,
      char_count: 5,
      api_key: 'sk-verysecretkey',
    });
    assert.equal(event.api_key, '[REDACTED]');
  });

  it('non-sensitive fields pass through unchanged', async () => {
    await createDebugSession();
    const event = await logEvent(EVENT_TYPES.FALLBACK, {
      from_provider: 'gemini',
      to_provider: 'openai',
      reason: 'quota',
      error_class: 'quota',
    });
    assert.equal(event.from_provider, 'gemini');
    assert.equal(event.to_provider, 'openai');
    assert.equal(event.reason, 'quota');
    assert.equal(event.error_class, 'quota');
  });
});

// ============================================================================
// Group 5: JSONL Format
// ============================================================================

describe('JSONL format', () => {
  let savedEnv;
  let testLogDir;

  before(async () => {
    testLogDir = join(tmpdir(), `debug-logger-jsonl-test-${Date.now()}`);
    await mkdir(testLogDir, { recursive: true });
  });

  after(async () => {
    await rm(testLogDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    savedEnv = {
      TRANSLATION_DEBUG_ENABLED: process.env.TRANSLATION_DEBUG_ENABLED,
      TRANSLATION_DEBUG_LOG_DIR: process.env.TRANSLATION_DEBUG_LOG_DIR,
    };
    process.env.TRANSLATION_DEBUG_ENABLED = 'true';
    process.env.TRANSLATION_DEBUG_LOG_DIR = testLogDir;
    _resetState();
  });

  afterEach(() => {
    for (const [key, val] of Object.entries(savedEnv)) {
      if (val === undefined) delete process.env[key];
      else process.env[key] = val;
    }
    _resetState();
  });

  it('each line is valid JSON', async () => {
    const { runId } = await createDebugSession();
    await logEvent(EVENT_TYPES.SERVICE_START, { service_id: 'svc1' });
    await logEvent(EVENT_TYPES.VERSION_START, { service_id: 'svc1', version: '2.0.0' });
    await closeDebugSession({ total_services: 1, total_versions: 1, total_entries: 0, total_chars: 0 });

    const logFile = join(testLogDir, `${runId}.jsonl`);
    const content = await readFile(logFile, 'utf8');
    const lines = content.trim().split('\n').filter(Boolean);

    assert.ok(lines.length >= 3, 'Should have at least 3 lines');
    for (const line of lines) {
      assert.doesNotThrow(() => JSON.parse(line), `Line should be valid JSON: ${line}`);
    }
  });

  it('one event per line (no multi-line JSON)', async () => {
    const { runId } = await createDebugSession();
    await logEvent(EVENT_TYPES.SERVICE_START, { service_id: 'svc1' });

    const logFile = join(testLogDir, `${runId}.jsonl`);
    const content = await readFile(logFile, 'utf8');
    const lines = content.trim().split('\n').filter(Boolean);

    // Each line should be a complete JSON object
    for (const line of lines) {
      const parsed = JSON.parse(line);
      assert.ok(typeof parsed === 'object' && parsed !== null);
      assert.ok('event_type' in parsed);
      assert.ok('timestamp' in parsed);
    }
  });

  it('log file is named after run_id with .jsonl extension', async () => {
    const { runId } = await createDebugSession();
    await logEvent(EVENT_TYPES.SERVICE_START, { service_id: 'svc1' });
    const logFile = join(testLogDir, `${runId}.jsonl`);
    // Verify the file exists by reading it
    const content = await readFile(logFile, 'utf8');
    assert.ok(typeof content === 'string');
    assert.ok(content.length > 0);
  });
});
