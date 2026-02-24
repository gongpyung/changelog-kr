/**
 * Translation Debug Report Generator Tests
 *
 * Tests for scripts/report-translation-debug.mjs
 * Node.js 20+ node:test + node:assert/strict
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { writeFile, readFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  parseArgs,
  findLogFiles,
  parseLogFile,
  computeMetrics,
  generateSummaryJson,
  generateSummaryMd,
  generateSamplesCsv,
  percentile,
} from '../scripts/report-translation-debug.mjs';

// ============================================================================
// Helpers
// ============================================================================

/** Serialize an array of event objects into JSONL string */
function toJsonl(events) {
  return events.map((e) => JSON.stringify(e)).join('\n') + '\n';
}

/** Build a minimal provider_success event */
function makeSuccess(provider, model, duration_ms = 1000, runId = '2026-02-24-aabbcc') {
  return {
    timestamp: '2026-02-24T10:00:00Z',
    event_type: 'provider_success',
    run_id: runId,
    session_id: 'sess-1',
    provider,
    model,
    duration_ms,
    batch_size: 5,
    char_count: 100,
    http_status: 200,
  };
}

/** Build a minimal provider_error event */
function makeError(provider, model, errorClass = 'quota', runId = '2026-02-24-aabbcc') {
  return {
    timestamp: '2026-02-24T10:01:00Z',
    event_type: 'provider_error',
    run_id: runId,
    session_id: 'sess-1',
    provider,
    model,
    duration_ms: 500,
    error_class: errorClass,
    error_message: 'Test error',
    http_status: 429,
    retry_count: 0,
  };
}

/** Build a fallback event */
function makeFallback(fromProvider, toProvider, errorClass = 'quota') {
  return {
    timestamp: '2026-02-24T10:02:00Z',
    event_type: 'fallback',
    run_id: '2026-02-24-aabbcc',
    session_id: 'sess-1',
    from_provider: fromProvider,
    to_provider: toProvider,
    reason: errorClass,
    error_class: errorClass,
  };
}

/** Build a quality_check event */
function makeQualityCheck(isPoor = false) {
  return {
    timestamp: '2026-02-24T10:03:00Z',
    event_type: 'quality_check',
    run_id: '2026-02-24-aabbcc',
    session_id: 'sess-1',
    context: 'claude-code@1.0.0',
    total_count: 10,
    warning_count: isPoor ? 8 : 1,
    ratio: isPoor ? 0.8 : 0.1,
    is_poor_quality: isPoor,
  };
}

/** Build run_start/run_end events */
function makeRunStart(runId = '2026-02-24-aabbcc') {
  return {
    timestamp: '2026-02-24T09:00:00Z',
    event_type: 'run_start',
    run_id: runId,
    session_id: 'sess-1',
    engine: 'gemini',
    fallback_chain: ['gemini', 'mock'],
    total_services: 3,
    total_versions: 6,
  };
}

function makeRunEnd(runId = '2026-02-24-aabbcc') {
  return {
    timestamp: '2026-02-24T10:05:00Z',
    event_type: 'run_end',
    run_id: runId,
    session_id: 'sess-1',
    total_services: 3,
    total_versions: 6,
    total_entries: 50,
    total_chars: 5000,
    duration_ms: 3900,
  };
}

// ============================================================================
// Group 1: Percentile Utility
// ============================================================================

describe('percentile()', () => {
  it('returns 0 for empty array', () => {
    assert.equal(percentile([], 50), 0);
  });

  it('returns single value for single-element array', () => {
    assert.equal(percentile([42], 50), 42);
    assert.equal(percentile([42], 95), 42);
  });

  it('p50 of [1,2,3,4] = 2', () => {
    assert.equal(percentile([1, 2, 3, 4], 50), 2);
  });

  it('p95 of [1..20] = 19', () => {
    const sorted = Array.from({ length: 20 }, (_, i) => i + 1);
    assert.equal(percentile(sorted, 95), 19);
  });

  it('p100 returns last element', () => {
    assert.equal(percentile([10, 20, 30], 100), 30);
  });
});

// ============================================================================
// Group 2: parseArgs
// ============================================================================

describe('parseArgs()', () => {
  it('returns defaults when no args given', () => {
    const args = parseArgs([]);
    const today = new Date().toISOString().slice(0, 10);
    assert.equal(args.date, today);
    assert.equal(args.days, 1);
    assert.equal(args.outputDir, 'reports/translation-debug');
  });

  it('--date sets date', () => {
    const args = parseArgs(['--date', '2026-02-20']);
    assert.equal(args.date, '2026-02-20');
  });

  it('--days sets days', () => {
    const args = parseArgs(['--days', '7']);
    assert.equal(args.days, 7);
  });

  it('--log-dir sets logDir', () => {
    const args = parseArgs(['--log-dir', '/tmp/logs']);
    assert.equal(args.logDir, '/tmp/logs');
  });

  it('--output-dir sets outputDir', () => {
    const args = parseArgs(['--output-dir', '/tmp/reports']);
    assert.equal(args.outputDir, '/tmp/reports');
  });

  it('all args together', () => {
    const args = parseArgs([
      '--date', '2026-01-15',
      '--days', '3',
      '--log-dir', '/tmp/logs',
      '--output-dir', '/tmp/out',
    ]);
    assert.equal(args.date, '2026-01-15');
    assert.equal(args.days, 3);
    assert.equal(args.logDir, '/tmp/logs');
    assert.equal(args.outputDir, '/tmp/out');
  });

  it('uses TRANSLATION_DEBUG_LOG_DIR env when --log-dir not given', () => {
    const saved = process.env.TRANSLATION_DEBUG_LOG_DIR;
    process.env.TRANSLATION_DEBUG_LOG_DIR = '/env/log/dir';
    try {
      const args = parseArgs([]);
      assert.equal(args.logDir, '/env/log/dir');
    } finally {
      if (saved === undefined) delete process.env.TRANSLATION_DEBUG_LOG_DIR;
      else process.env.TRANSLATION_DEBUG_LOG_DIR = saved;
    }
  });
});

// ============================================================================
// Group 3: findLogFiles
// ============================================================================

describe('findLogFiles()', () => {
  let testDir;

  before(async () => {
    testDir = join(tmpdir(), `report-find-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
    // Create test JSONL files
    await writeFile(join(testDir, '2026-02-22-aaa111.jsonl'), '');
    await writeFile(join(testDir, '2026-02-23-bbb222.jsonl'), '');
    await writeFile(join(testDir, '2026-02-24-ccc333.jsonl'), '');
    await writeFile(join(testDir, '2026-02-25-ddd444.jsonl'), '');
    await writeFile(join(testDir, 'not-a-log.txt'), '');
  });

  after(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it('returns files matching exact date', async () => {
    const files = await findLogFiles(testDir, '2026-02-24', '2026-02-24');
    assert.equal(files.length, 1);
    assert.ok(files[0].includes('2026-02-24'));
  });

  it('returns files in date range', async () => {
    const files = await findLogFiles(testDir, '2026-02-22', '2026-02-24');
    assert.equal(files.length, 3);
  });

  it('returns empty array when no files match', async () => {
    const files = await findLogFiles(testDir, '2026-01-01', '2026-01-01');
    assert.deepEqual(files, []);
  });

  it('returns empty array when dir does not exist', async () => {
    const files = await findLogFiles('/nonexistent/path/xyz', '2026-02-24', '2026-02-24');
    assert.deepEqual(files, []);
  });

  it('ignores non-.jsonl files', async () => {
    const files = await findLogFiles(testDir, '2026-02-22', '2026-02-25');
    for (const f of files) {
      assert.ok(f.endsWith('.jsonl'));
    }
  });
});

// ============================================================================
// Group 4: parseLogFile
// ============================================================================

describe('parseLogFile()', () => {
  let testDir;

  before(async () => {
    testDir = join(tmpdir(), `report-parse-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  after(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it('parses valid JSONL lines', async () => {
    const events = [makeSuccess('gemini', 'gemini-flash'), makeRunEnd()];
    const filePath = join(testDir, 'valid.jsonl');
    await writeFile(filePath, toJsonl(events), 'utf8');
    const parsed = await parseLogFile(filePath);
    assert.equal(parsed.length, 2);
    assert.equal(parsed[0].event_type, 'provider_success');
    assert.equal(parsed[1].event_type, 'run_end');
  });

  it('skips invalid JSON lines with warning', async () => {
    const filePath = join(testDir, 'invalid.jsonl');
    await writeFile(
      filePath,
      JSON.stringify(makeSuccess('gemini', 'gemini-flash')) + '\n' +
      'not valid json\n' +
      JSON.stringify(makeRunEnd()) + '\n',
      'utf8'
    );
    const parsed = await parseLogFile(filePath);
    assert.equal(parsed.length, 2);
  });

  it('handles empty file', async () => {
    const filePath = join(testDir, 'empty.jsonl');
    await writeFile(filePath, '', 'utf8');
    const parsed = await parseLogFile(filePath);
    assert.deepEqual(parsed, []);
  });

  it('returns empty array for nonexistent file', async () => {
    const parsed = await parseLogFile('/nonexistent/file.jsonl');
    assert.deepEqual(parsed, []);
  });

  it('handles blank lines between events', async () => {
    const filePath = join(testDir, 'blanks.jsonl');
    await writeFile(
      filePath,
      JSON.stringify(makeSuccess('gemini', 'flash')) + '\n\n' +
      JSON.stringify(makeRunEnd()) + '\n',
      'utf8'
    );
    const parsed = await parseLogFile(filePath);
    assert.equal(parsed.length, 2);
  });
});

// ============================================================================
// Group 5: computeMetrics
// ============================================================================

describe('computeMetrics()', () => {
  it('returns zero metrics for empty events', () => {
    const m = computeMetrics([]);
    assert.equal(m.runs.total, 0);
    assert.equal(m.runs.successful, 0);
    assert.deepEqual(m.providers, {});
    assert.equal(m.fallback.total, 0);
    assert.equal(m.quality.checks, 0);
  });

  it('counts run_start as total run', () => {
    const m = computeMetrics([makeRunStart(), makeRunStart('2026-02-24-zzzzzz')]);
    assert.equal(m.runs.total, 2);
  });

  it('counts run_end as successful', () => {
    const m = computeMetrics([makeRunStart(), makeRunEnd()]);
    assert.equal(m.runs.successful, 1);
    assert.equal(m.runs.failed, 0);
  });

  it('counts run_error as failed', () => {
    const events = [
      makeRunStart(),
      { event_type: 'run_error', run_id: 'r1', session_id: 's1', timestamp: 't', error_class: 'server', error_message: 'crash' },
    ];
    const m = computeMetrics(events);
    assert.equal(m.runs.failed, 1);
  });

  it('sums totals from multiple run_end events', () => {
    const events = [
      makeRunEnd(),
      makeRunEnd('2026-02-24-zzzzzz'),
    ];
    const m = computeMetrics(events);
    assert.equal(m.totals.entries, 100); // 50 + 50
    assert.equal(m.totals.chars, 10000); // 5000 + 5000
  });

  it('computes provider success_count and error_count', () => {
    const events = [
      makeSuccess('gemini', 'gemini-flash'),
      makeSuccess('gemini', 'gemini-flash'),
      makeError('gemini', 'gemini-flash', 'quota'),
    ];
    const m = computeMetrics(events);
    const p = m.providers['gemini/gemini-flash'];
    assert.ok(p, 'provider metrics should exist');
    assert.equal(p.call_count, 3);
    assert.equal(p.success_count, 2);
    assert.equal(p.error_count, 1);
  });

  it('computes success_rate and error_rate', () => {
    const events = [
      makeSuccess('gemini', 'gemini-flash'),
      makeError('gemini', 'gemini-flash', 'quota'),
    ];
    const m = computeMetrics(events);
    const p = m.providers['gemini/gemini-flash'];
    assert.equal(p.success_rate, 0.5);
    assert.equal(p.error_rate, 0.5);
  });

  it('computes latency p50 and p95 from provider_success events', () => {
    const durations = [1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 10000];
    const events = durations.map((d) => makeSuccess('openai', 'gpt-4', d));
    const m = computeMetrics(events);
    const p = m.providers['openai/gpt-4'];
    // p50 of 10 elements sorted: index = ceil(50/100 * 10) - 1 = 4 → value 5000
    assert.equal(p.latency.p50_ms, 5000);
    // p95: index = ceil(95/100 * 10) - 1 = 9 → value 10000
    assert.equal(p.latency.p95_ms, 10000);
  });

  it('counts fallbacks and mock fallbacks', () => {
    const events = [
      makeFallback('gemini', 'openai'),
      makeFallback('openai', 'mock'),
    ];
    const m = computeMetrics(events);
    assert.equal(m.fallback.total, 2);
    assert.equal(m.fallback.mock_fallback, 1);
  });

  it('computes fallback rate relative to total calls', () => {
    const events = [
      makeSuccess('gemini', 'flash'),
      makeSuccess('gemini', 'flash'),
      makeSuccess('gemini', 'flash'),
      makeError('gemini', 'flash'),
      makeFallback('gemini', 'openai'),
    ];
    const m = computeMetrics(events);
    // 4 total calls, 1 fallback → rate = 0.25
    assert.equal(m.fallback.rate, 0.25);
  });

  it('tracks quality checks and poor batches', () => {
    const events = [
      makeQualityCheck(false),
      makeQualityCheck(false),
      makeQualityCheck(true),
    ];
    const m = computeMetrics(events);
    assert.equal(m.quality.checks, 3);
    assert.equal(m.quality.poor_batches, 1);
    assert.ok(Math.abs(m.quality.poor_rate - 1 / 3) < 0.001);
  });

  it('tracks error_class breakdown', () => {
    const events = [
      makeError('gemini', 'flash', 'quota'),
      makeError('gemini', 'flash', 'quota'),
      makeError('openai', 'gpt-4', 'rate_limit'),
      makeError('openai', 'gpt-4', 'auth'),
    ];
    const m = computeMetrics(events);
    assert.equal(m.errors.quota, 2);
    assert.equal(m.errors.rate_limit, 1);
    assert.equal(m.errors.auth, 1);
    assert.equal(m.errors.server, 0);
  });
});

// ============================================================================
// Group 6: generateSummaryJson
// ============================================================================

describe('generateSummaryJson()', () => {
  it('returns correct top-level structure', () => {
    const events = [makeRunStart(), makeRunEnd(), makeSuccess('gemini', 'flash'), makeQualityCheck()];
    const metrics = computeMetrics(events);
    const json = generateSummaryJson(metrics, '2026-02-24');

    assert.equal(json.date, '2026-02-24');
    assert.ok(typeof json.generated_at === 'string');
    assert.ok('runs' in json);
    assert.ok('providers' in json);
    assert.ok('fallback' in json);
    assert.ok('quality' in json);
    assert.ok('errors' in json);
    assert.ok('totals' in json);
  });

  it('JSON is serializable', () => {
    const metrics = computeMetrics([makeRunEnd()]);
    const json = generateSummaryJson(metrics, '2026-02-24');
    assert.doesNotThrow(() => JSON.stringify(json));
  });

  it('providers map has expected shape', () => {
    const events = [makeSuccess('gemini', 'gemini-flash', 2500)];
    const metrics = computeMetrics(events);
    const json = generateSummaryJson(metrics, '2026-02-24');
    const p = json.providers['gemini/gemini-flash'];
    assert.ok(p, 'provider entry should exist');
    assert.ok('call_count' in p);
    assert.ok('success_count' in p);
    assert.ok('error_count' in p);
    assert.ok('success_rate' in p);
    assert.ok('error_rate' in p);
    assert.ok('latency' in p);
    assert.ok('p50_ms' in p.latency);
    assert.ok('p95_ms' in p.latency);
  });
});

// ============================================================================
// Group 7: generateSummaryMd
// ============================================================================

describe('generateSummaryMd()', () => {
  it('starts with correct heading', () => {
    const md = generateSummaryMd(computeMetrics([]), '2026-02-24');
    assert.ok(md.startsWith('# Translation Debug Report: 2026-02-24'));
  });

  it('contains Summary section', () => {
    const md = generateSummaryMd(computeMetrics([makeRunStart(), makeRunEnd()]), '2026-02-24');
    assert.ok(md.includes('## Summary'));
    assert.ok(md.includes('Runs:'));
  });

  it('contains Provider Performance table header', () => {
    const md = generateSummaryMd(computeMetrics([]), '2026-02-24');
    assert.ok(md.includes('## Provider Performance'));
    assert.ok(md.includes('| Provider | Model |'));
  });

  it('includes provider rows when data present', () => {
    const events = [makeSuccess('gemini', 'gemini-flash', 2500)];
    const md = generateSummaryMd(computeMetrics(events), '2026-02-24');
    assert.ok(md.includes('gemini'));
    assert.ok(md.includes('gemini-flash'));
  });

  it('shows (no data) row when no providers', () => {
    const md = generateSummaryMd(computeMetrics([]), '2026-02-24');
    assert.ok(md.includes('(no data)'));
  });

  it('contains Fallback Usage section', () => {
    const md = generateSummaryMd(computeMetrics([]), '2026-02-24');
    assert.ok(md.includes('## Fallback Usage'));
  });

  it('contains Quality section', () => {
    const md = generateSummaryMd(computeMetrics([]), '2026-02-24');
    assert.ok(md.includes('## Quality'));
  });

  it('contains Errors by Class table', () => {
    const md = generateSummaryMd(computeMetrics([]), '2026-02-24');
    assert.ok(md.includes('## Errors by Class'));
    assert.ok(md.includes('| Class | Count |'));
  });

  it('shows error rows when errors present', () => {
    const events = [makeError('gemini', 'flash', 'quota')];
    const md = generateSummaryMd(computeMetrics(events), '2026-02-24');
    assert.ok(md.includes('quota'));
  });

  it('shows (no errors) when no errors', () => {
    const md = generateSummaryMd(computeMetrics([makeSuccess('g', 'm')]), '2026-02-24');
    assert.ok(md.includes('(no errors)'));
  });

  it('formats success_rate as percentage string', () => {
    const events = [makeSuccess('gemini', 'flash'), makeError('gemini', 'flash')];
    const md = generateSummaryMd(computeMetrics(events), '2026-02-24');
    assert.ok(md.includes('50.0%'));
  });
});

// ============================================================================
// Group 8: generateSamplesCsv
// ============================================================================

describe('generateSamplesCsv()', () => {
  it('returns header row as first line', () => {
    const csv = generateSamplesCsv([]);
    const firstLine = csv.split('\n')[0];
    assert.equal(
      firstLine,
      'timestamp,run_id,event_type,provider,model,error_class,error_message,duration_ms'
    );
  });

  it('contains a row for each error event', () => {
    const events = [
      makeError('gemini', 'flash', 'quota'),
      makeError('openai', 'gpt-4', 'rate_limit'),
    ];
    const csv = generateSamplesCsv(events);
    const lines = csv.split('\n').filter(Boolean);
    assert.equal(lines.length, 3); // header + 2 rows
    assert.ok(lines[1].includes('provider_error'));
    assert.ok(lines[2].includes('provider_error'));
  });

  it('prioritizes errors over successes', () => {
    const events = [
      makeSuccess('gemini', 'flash'),
      makeError('gemini', 'flash', 'quota'),
    ];
    const csv = generateSamplesCsv(events);
    const lines = csv.split('\n').filter(Boolean);
    // Second row (index 1) should be the error
    assert.ok(lines[1].includes('provider_error'));
  });

  it('includes fallback events in output', () => {
    const events = [makeFallback('gemini', 'openai')];
    const csv = generateSamplesCsv(events);
    assert.ok(csv.includes('fallback'));
  });

  it('respects maxRows limit', () => {
    const events = Array.from({ length: 20 }, (_, i) =>
      makeSuccess('gemini', 'flash', 1000 + i)
    );
    const csv = generateSamplesCsv(events, 5);
    const lines = csv.split('\n').filter(Boolean);
    assert.equal(lines.length, 6); // header + 5 rows
  });

  it('escapes commas in field values', () => {
    const event = {
      ...makeError('gemini', 'flash'),
      error_message: 'error, with comma',
    };
    const csv = generateSamplesCsv([event]);
    assert.ok(csv.includes('"error, with comma"'));
  });

  it('escapes double-quotes in field values', () => {
    const event = {
      ...makeError('gemini', 'flash'),
      error_message: 'she said "hello"',
    };
    const csv = generateSamplesCsv([event]);
    assert.ok(csv.includes('""hello""'));
  });
});

// ============================================================================
// Group 9: Date Filtering (end-to-end via findLogFiles)
// ============================================================================

describe('Date filtering (integration)', () => {
  let testDir;

  before(async () => {
    testDir = join(tmpdir(), `report-datefilter-${Date.now()}`);
    await mkdir(testDir, { recursive: true });

    // Create files for different dates
    await writeFile(
      join(testDir, '2026-02-20-run1.jsonl'),
      toJsonl([makeRunStart('2026-02-20-run1'), makeRunEnd('2026-02-20-run1')]),
      'utf8'
    );
    await writeFile(
      join(testDir, '2026-02-22-run2.jsonl'),
      toJsonl([makeRunStart('2026-02-22-run2'), makeError('gemini', 'flash', 'quota', '2026-02-22-run2')]),
      'utf8'
    );
    await writeFile(
      join(testDir, '2026-02-24-run3.jsonl'),
      toJsonl([makeRunStart('2026-02-24-run3'), makeSuccess('gemini', 'flash', 3000, '2026-02-24-run3')]),
      'utf8'
    );
  });

  after(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it('finds only files matching single date', async () => {
    const files = await findLogFiles(testDir, '2026-02-22', '2026-02-22');
    assert.equal(files.length, 1);
    assert.ok(files[0].includes('2026-02-22'));
  });

  it('finds files across date range', async () => {
    const files = await findLogFiles(testDir, '2026-02-20', '2026-02-24');
    assert.equal(files.length, 3);
  });

  it('excludes files outside range', async () => {
    const files = await findLogFiles(testDir, '2026-02-21', '2026-02-23');
    assert.equal(files.length, 1);
    assert.ok(files[0].includes('2026-02-22'));
  });

  it('metrics only reflect events from matched files', async () => {
    // Only load the 2026-02-24 file
    const files = await findLogFiles(testDir, '2026-02-24', '2026-02-24');
    const events = [];
    for (const f of files) events.push(...(await parseLogFile(f)));
    const metrics = computeMetrics(events);
    // Only 1 run_start from 2026-02-24
    assert.equal(metrics.runs.total, 1);
    // Only gemini/flash from 2026-02-24 (makeSuccess used model='flash')
    assert.ok('gemini/flash' in metrics.providers);
    assert.equal(metrics.errors.quota, 0);
  });
});

// ============================================================================
// Group 10: Full pipeline (write → find → parse → compute → generate)
// ============================================================================

describe('Full pipeline', () => {
  let logDir;
  let outputDir;

  before(async () => {
    const base = join(tmpdir(), `report-pipeline-${Date.now()}`);
    logDir = join(base, 'logs');
    outputDir = join(base, 'reports');
    await mkdir(logDir, { recursive: true });
    await mkdir(outputDir, { recursive: true });

    const events = [
      makeRunStart(),
      makeSuccess('gemini', 'gemini-flash', 2500),
      makeSuccess('gemini', 'gemini-flash', 3000),
      makeError('gemini', 'gemini-flash', 'quota'),
      makeFallback('gemini', 'openai'),
      makeSuccess('openai', 'gpt-4', 5000),
      makeQualityCheck(true),
      makeQualityCheck(false),
      makeRunEnd(),
    ];
    await writeFile(join(logDir, '2026-02-24-test01.jsonl'), toJsonl(events), 'utf8');
  });

  it('generates JSON output with correct structure', async () => {
    const files = await findLogFiles(logDir, '2026-02-24', '2026-02-24');
    assert.equal(files.length, 1);

    const events = await parseLogFile(files[0]);
    const metrics = computeMetrics(events);
    const json = generateSummaryJson(metrics, '2026-02-24');

    assert.equal(json.date, '2026-02-24');
    assert.ok('gemini/gemini-flash' in json.providers);
    assert.ok('openai/gpt-4' in json.providers);
    assert.equal(json.providers['gemini/gemini-flash'].call_count, 3);
    assert.equal(json.providers['gemini/gemini-flash'].success_count, 2);
    assert.equal(json.providers['gemini/gemini-flash'].error_count, 1);
    assert.equal(json.fallback.total, 1);
    assert.equal(json.quality.checks, 2);
    assert.equal(json.quality.poor_batches, 1);
    assert.equal(json.errors.quota, 1);
  });

  it('generates Markdown output with all required sections', async () => {
    const events = await parseLogFile((await findLogFiles(logDir, '2026-02-24', '2026-02-24'))[0]);
    const metrics = computeMetrics(events);
    const md = generateSummaryMd(metrics, '2026-02-24');

    assert.ok(md.includes('# Translation Debug Report: 2026-02-24'));
    assert.ok(md.includes('## Summary'));
    assert.ok(md.includes('## Provider Performance'));
    assert.ok(md.includes('## Fallback Usage'));
    assert.ok(md.includes('## Quality'));
    assert.ok(md.includes('## Errors by Class'));
    assert.ok(md.includes('gemini-flash'));
    assert.ok(md.includes('gpt-4'));
  });

  it('generates CSV with correct columns and priority ordering', async () => {
    const events = await parseLogFile((await findLogFiles(logDir, '2026-02-24', '2026-02-24'))[0]);
    const csv = generateSamplesCsv(events);
    const lines = csv.split('\n').filter(Boolean);

    // Header check
    assert.ok(lines[0].includes('event_type'));
    assert.ok(lines[0].includes('provider'));
    assert.ok(lines[0].includes('error_class'));

    // Error comes first after header
    assert.ok(lines[1].includes('provider_error'));
  });

  it('writes output files to disk', async () => {
    const events = await parseLogFile((await findLogFiles(logDir, '2026-02-24', '2026-02-24'))[0]);
    const metrics = computeMetrics(events);

    const { writeFile: wf, mkdir: mk } = await import('node:fs/promises');
    await mk(outputDir, { recursive: true });
    const jsonContent = JSON.stringify(generateSummaryJson(metrics, '2026-02-24'), null, 2);
    const mdContent = generateSummaryMd(metrics, '2026-02-24');
    const csvContent = generateSamplesCsv(events);

    const jsonFile = join(outputDir, '2026-02-24-summary.json');
    const mdFile = join(outputDir, '2026-02-24-summary.md');
    const csvFile = join(outputDir, '2026-02-24-samples.csv');

    await wf(jsonFile, jsonContent, 'utf8');
    await wf(mdFile, mdContent, 'utf8');
    await wf(csvFile, csvContent, 'utf8');

    const jsonRead = JSON.parse(await readFile(jsonFile, 'utf8'));
    assert.equal(jsonRead.date, '2026-02-24');

    const mdRead = await readFile(mdFile, 'utf8');
    assert.ok(mdRead.includes('# Translation Debug Report'));

    const csvRead = await readFile(csvFile, 'utf8');
    assert.ok(csvRead.split('\n')[0].includes('event_type'));
  });
});
