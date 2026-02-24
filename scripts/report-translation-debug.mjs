#!/usr/bin/env node
/**
 * Translation Debug Report Generator
 *
 * Reads JSONL debug logs and generates summary reports.
 *
 * Usage:
 *   node scripts/report-translation-debug.mjs --date 2026-02-24
 *   node scripts/report-translation-debug.mjs --days 7
 *   node scripts/report-translation-debug.mjs  (defaults to today)
 */

import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

// ============================================================================
// CLI Argument Parsing
// ============================================================================

/**
 * Parse CLI arguments from argv array.
 * @param {string[]} argv - process.argv.slice(2)
 * @returns {{ date: string, days: number, logDir: string, outputDir: string }}
 */
export function parseArgs(argv) {
  const args = {
    date: null,
    days: 1,
    logDir: null,
    outputDir: 'reports/translation-debug',
  };

  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const next = argv[i + 1];
    if (flag === '--date' && next) {
      args.date = next;
      i++;
    } else if (flag === '--days' && next) {
      const n = parseInt(next, 10);
      if (!isNaN(n) && n >= 1) args.days = n;
      i++;
    } else if (flag === '--log-dir' && next) {
      args.logDir = next;
      i++;
    } else if (flag === '--output-dir' && next) {
      args.outputDir = next;
      i++;
    }
  }

  if (!args.date) {
    args.date = new Date().toISOString().slice(0, 10);
  }
  if (!args.logDir) {
    args.logDir = process.env.TRANSLATION_DEBUG_LOG_DIR || 'logs/translation';
  }

  return args;
}

// ============================================================================
// File Discovery
// ============================================================================

/**
 * Find JSONL log files in logDir whose run_id date prefix falls in [startDate, endDate].
 * @param {string} logDir
 * @param {string} startDate - YYYY-MM-DD
 * @param {string} endDate   - YYYY-MM-DD
 * @returns {Promise<string[]>} absolute file paths
 */
export async function findLogFiles(logDir, startDate, endDate) {
  let files;
  try {
    files = await readdir(logDir);
  } catch {
    return [];
  }
  return files
    .filter(f => f.endsWith('.jsonl'))
    .filter(f => {
      const datePrefix = f.slice(0, 10); // YYYY-MM-DD
      return datePrefix >= startDate && datePrefix <= endDate;
    })
    .map(f => join(logDir, f));
}

// ============================================================================
// JSONL Parsing
// ============================================================================

/**
 * Parse a JSONL file into an array of event objects.
 * Invalid JSON lines are skipped with a warning.
 * @param {string} filePath
 * @returns {Promise<object[]>}
 */
export async function parseLogFile(filePath) {
  let content;
  try {
    content = await readFile(filePath, 'utf8');
  } catch {
    return [];
  }
  const events = [];
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      events.push(JSON.parse(trimmed));
    } catch {
      process.stderr.write(`[warn] Invalid JSON in ${filePath}: ${trimmed.slice(0, 80)}\n`);
    }
  }
  return events;
}

// ============================================================================
// Metric Computation
// ============================================================================

/**
 * Compute percentile from a sorted numeric array.
 * @param {number[]} sorted - sorted ascending
 * @param {number} p - percentile (0-100)
 * @returns {number}
 */
export function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

/**
 * Compute all metrics from an array of parsed events.
 * @param {object[]} events
 * @returns {object} metrics
 */
export function computeMetrics(events) {
  // Per-provider raw data: keyed by "provider/model"
  const providerRaw = {};

  // Run counters
  let totalRuns = 0;
  let successfulRuns = 0;
  let failedRuns = 0;

  // Cumulative totals from run_end events
  let totalServices = 0;
  let totalVersions = 0;
  let totalEntries = 0;
  let totalChars = 0;

  // Fallback
  let fallbackCount = 0;
  let mockFallbackCount = 0;

  // Quality
  let qualityChecks = 0;
  let poorBatches = 0;
  let sameAsOriginalCount = 0;
  let noKoreanCount = 0;
  let tooShortCount = 0;

  // Error breakdown
  const errorBreakdown = {
    auth: 0,
    quota: 0,
    rate_limit: 0,
    server: 0,
    client: 0,
    parse: 0,
    unknown: 0,
  };

  for (const event of events) {
    switch (event.event_type) {
      case 'run_start':
        totalRuns++;
        break;

      case 'run_end':
        successfulRuns++;
        totalServices += event.total_services || 0;
        totalVersions += event.total_versions || 0;
        totalEntries += event.total_entries || 0;
        totalChars += event.total_chars || 0;
        break;

      case 'run_error':
        failedRuns++;
        break;

      case 'provider_success': {
        const key = `${event.provider}/${event.model}`;
        if (!providerRaw[key]) {
          providerRaw[key] = { call_count: 0, success_count: 0, error_count: 0, durations: [] };
        }
        providerRaw[key].call_count++;
        providerRaw[key].success_count++;
        if (typeof event.duration_ms === 'number') {
          providerRaw[key].durations.push(event.duration_ms);
        }
        break;
      }

      case 'provider_error': {
        const key = `${event.provider}/${event.model}`;
        if (!providerRaw[key]) {
          providerRaw[key] = { call_count: 0, success_count: 0, error_count: 0, durations: [] };
        }
        providerRaw[key].call_count++;
        providerRaw[key].error_count++;
        const ec = event.error_class || 'unknown';
        if (ec in errorBreakdown) {
          errorBreakdown[ec]++;
        } else {
          errorBreakdown.unknown++;
        }
        break;
      }

      case 'fallback':
        fallbackCount++;
        if (event.to_provider === 'mock') mockFallbackCount++;
        break;

      case 'quality_check':
        qualityChecks++;
        if (event.is_poor_quality) poorBatches++;
        sameAsOriginalCount += event.same_as_original_count || 0;
        noKoreanCount += event.no_korean_count || 0;
        tooShortCount += event.too_short_count || 0;
        break;
    }
  }

  // Finalize provider metrics
  const providers = {};
  for (const [key, raw] of Object.entries(providerRaw)) {
    const sorted = [...raw.durations].sort((a, b) => a - b);
    providers[key] = {
      call_count: raw.call_count,
      success_count: raw.success_count,
      error_count: raw.error_count,
      success_rate: raw.call_count > 0 ? raw.success_count / raw.call_count : 0,
      error_rate: raw.call_count > 0 ? raw.error_count / raw.call_count : 0,
      latency: {
        p50_ms: percentile(sorted, 50),
        p95_ms: percentile(sorted, 95),
      },
    };
  }

  const totalCalls = Object.values(providerRaw).reduce((s, r) => s + r.call_count, 0);

  return {
    runs: { total: totalRuns, successful: successfulRuns, failed: failedRuns },
    providers,
    fallback: {
      total: fallbackCount,
      mock_fallback: mockFallbackCount,
      rate: totalCalls > 0 ? fallbackCount / totalCalls : 0,
    },
    quality: {
      checks: qualityChecks,
      poor_batches: poorBatches,
      poor_rate: qualityChecks > 0 ? poorBatches / qualityChecks : 0,
      same_as_original_count: sameAsOriginalCount,
      no_korean_count: noKoreanCount,
      too_short_count: tooShortCount,
    },
    errors: errorBreakdown,
    totals: {
      services: totalServices,
      versions: totalVersions,
      entries: totalEntries,
      chars: totalChars,
    },
  };
}

// ============================================================================
// Output Generators
// ============================================================================

/**
 * Generate machine-readable JSON summary.
 * @param {object} metrics - from computeMetrics()
 * @param {string} date    - YYYY-MM-DD
 * @returns {object}
 */
export function generateSummaryJson(metrics, date) {
  return {
    date,
    generated_at: new Date().toISOString(),
    runs: metrics.runs,
    providers: metrics.providers,
    fallback: metrics.fallback,
    quality: metrics.quality,
    errors: metrics.errors,
    totals: metrics.totals,
  };
}

/**
 * Generate human-readable Markdown summary.
 * @param {object} metrics - from computeMetrics()
 * @param {string} date    - YYYY-MM-DD
 * @returns {string}
 */
export function generateSummaryMd(metrics, date) {
  const lines = [];

  lines.push(`# Translation Debug Report: ${date}`);
  lines.push('');
  lines.push('## Summary');
  lines.push(
    `- Runs: ${metrics.runs.total} (${metrics.runs.successful} successful, ${metrics.runs.failed} failed)`
  );
  lines.push(
    `- Services: ${metrics.totals.services} | Versions: ${metrics.totals.versions} | Entries: ${metrics.totals.entries}`
  );
  lines.push('');

  lines.push('## Provider Performance');
  lines.push('| Provider | Model | Calls | Success | Errors | Rate | p50 | p95 |');
  lines.push('|----------|-------|-------|---------|--------|------|-----|-----|');
  const providerEntries = Object.entries(metrics.providers);
  if (providerEntries.length === 0) {
    lines.push('| (no data) | - | - | - | - | - | - | - |');
  } else {
    for (const [key, p] of providerEntries) {
      const slashIdx = key.indexOf('/');
      const provider = slashIdx >= 0 ? key.slice(0, slashIdx) : key;
      const model = slashIdx >= 0 ? key.slice(slashIdx + 1) : '-';
      const rate = `${(p.success_rate * 100).toFixed(1)}%`;
      const p50 = `${(p.latency.p50_ms / 1000).toFixed(1)}s`;
      const p95 = `${(p.latency.p95_ms / 1000).toFixed(1)}s`;
      lines.push(
        `| ${provider} | ${model} | ${p.call_count} | ${p.success_count} | ${p.error_count} | ${rate} | ${p50} | ${p95} |`
      );
    }
  }
  lines.push('');

  lines.push('## Fallback Usage');
  lines.push(
    `- Total fallbacks: ${metrics.fallback.total} (${(metrics.fallback.rate * 100).toFixed(1)}%)`
  );
  lines.push(`- Mock fallbacks: ${metrics.fallback.mock_fallback}`);
  lines.push('');

  lines.push('## Quality');
  lines.push(`- Total checks: ${metrics.quality.checks}`);
  lines.push(
    `- Poor quality batches: ${metrics.quality.poor_batches} (${(metrics.quality.poor_rate * 100).toFixed(1)}%)`
  );
  lines.push('');

  lines.push('## Errors by Class');
  lines.push('| Class | Count |');
  lines.push('|-------|-------|');
  const errorEntries = Object.entries(metrics.errors).filter(([, count]) => count > 0);
  if (errorEntries.length === 0) {
    lines.push('| (no errors) | 0 |');
  } else {
    for (const [cls, count] of errorEntries) {
      lines.push(`| ${cls} | ${count} |`);
    }
  }

  return lines.join('\n');
}

/**
 * Generate CSV of sample events, prioritizing problem items.
 * @param {object[]} events   - all parsed events
 * @param {number}   maxRows  - max output rows (default 50)
 * @returns {string}
 */
export function generateSamplesCsv(events, maxRows = 50) {
  const escapeField = (v) => {
    const s = String(v ?? '');
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const toRow = (e) =>
    [
      escapeField(e.timestamp ?? ''),
      escapeField(e.run_id ?? ''),
      escapeField(e.event_type ?? ''),
      escapeField(e.provider ?? ''),
      escapeField(e.model ?? ''),
      escapeField(e.error_class ?? ''),
      escapeField(e.error_message ?? ''),
      escapeField(e.duration_ms ?? ''),
    ].join(',');

  const header =
    'timestamp,run_id,event_type,provider,model,error_class,error_message,duration_ms';

  // Priority: errors → fallbacks → poor-quality checks → random successes
  const errors = events.filter((e) => e.event_type === 'provider_error');
  const fallbacks = events.filter((e) => e.event_type === 'fallback');
  const qualityIssues = events.filter(
    (e) => e.event_type === 'quality_check' && e.is_poor_quality
  );
  const successes = events.filter((e) => e.event_type === 'provider_success');

  const prioritized = [...errors, ...fallbacks, ...qualityIssues];
  const remaining = Math.max(0, maxRows - prioritized.length);

  let sampledSuccesses = successes;
  if (successes.length > remaining) {
    // Deterministic shuffle using sort with index-based pseudo-random
    sampledSuccesses = successes
      .map((e, i) => ({ e, sort: (i * 2654435761) % successes.length }))
      .sort((a, b) => a.sort - b.sort)
      .slice(0, remaining)
      .map(({ e }) => e);
  }

  const allSamples = [...prioritized, ...sampledSuccesses].slice(0, maxRows);
  const rows = [header, ...allSamples.map(toRow)];
  return rows.join('\n');
}

// ============================================================================
// Date Utilities
// ============================================================================

/**
 * Subtract N days from a YYYY-MM-DD date string.
 * @param {string} dateStr - YYYY-MM-DD
 * @param {number} days
 * @returns {string} YYYY-MM-DD
 */
function subtractDays(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const endDate = args.date;
  const startDate = subtractDays(endDate, args.days - 1);

  const logFiles = await findLogFiles(args.logDir, startDate, endDate);

  if (logFiles.length === 0) {
    console.log(
      `No log files found in "${args.logDir}" for date range ${startDate} – ${endDate}`
    );
    process.exit(0);
  }

  // Parse all events from matching log files
  const allEvents = [];
  for (const filePath of logFiles) {
    const events = await parseLogFile(filePath);
    allEvents.push(...events);
  }

  const metrics = computeMetrics(allEvents);

  await mkdir(args.outputDir, { recursive: true });

  const summaryJson = generateSummaryJson(metrics, endDate);
  const summaryMd = generateSummaryMd(metrics, endDate);
  const samplesCsv = generateSamplesCsv(allEvents);

  const jsonFile = join(args.outputDir, `${endDate}-summary.json`);
  const mdFile = join(args.outputDir, `${endDate}-summary.md`);
  const csvFile = join(args.outputDir, `${endDate}-samples.csv`);

  await writeFile(jsonFile, JSON.stringify(summaryJson, null, 2) + '\n', 'utf8');
  await writeFile(mdFile, summaryMd + '\n', 'utf8');
  await writeFile(csvFile, samplesCsv + '\n', 'utf8');

  console.log('Reports generated:');
  console.log(`  ${jsonFile}`);
  console.log(`  ${mdFile}`);
  console.log(`  ${csvFile}`);
}

// Run main only when executed directly (not imported)
const isMain =
  process.argv[1] &&
  (process.argv[1].endsWith('report-translation-debug.mjs') ||
    process.argv[1].endsWith('report-translation-debug'));

if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
