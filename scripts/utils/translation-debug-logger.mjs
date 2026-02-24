/**
 * Translation Debug Logger
 * Structured JSONL logging for translation pipeline debugging.
 *
 * Controlled by environment variables:
 *   TRANSLATION_DEBUG_ENABLED   - must be 'true' to enable (default: disabled)
 *   TRANSLATION_DEBUG_LOG_DIR   - log directory (default: 'logs/translation')
 *   TRANSLATION_DEBUG_REDACT_TEXT - redact text content (default: 'true')
 */

import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { appendFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { EVENT_TYPES } from './translation-debug-schema.mjs';

// Module-level session state
let _state = null;

function isEnabled() {
  return process.env.TRANSLATION_DEBUG_ENABLED === 'true';
}

function shouldRedact() {
  return process.env.TRANSLATION_DEBUG_REDACT_TEXT !== 'false';
}

function getLogDir() {
  return process.env.TRANSLATION_DEBUG_LOG_DIR || 'logs/translation';
}

/**
 * Redact sensitive text: returns { preview, hash, length }
 */
function redactText(text) {
  if (typeof text !== 'string') return text;
  const hash = createHash('sha256').update(text).digest('hex').slice(0, 12);
  return { preview: text.slice(0, 80), hash, length: text.length };
}

// Regex to detect sensitive field names
const SENSITIVE_FIELD_RE = /text|content|original|translated|prompt|body|authorization|api.?key/i;

/**
 * Recursively apply redaction rules to a data object.
 */
function applyRedaction(data) {
  if (!data || typeof data !== 'object') return data;
  const result = {};
  for (const [key, value] of Object.entries(data)) {
    if (SENSITIVE_FIELD_RE.test(key)) {
      if (typeof value === 'string') {
        // API keys / Authorization: always fully redact
        if (/authorization|api.?key/i.test(key)) {
          result[key] = '[REDACTED]';
        } else {
          result[key] = shouldRedact() ? redactText(value) : value;
        }
      } else {
        result[key] = value;
      }
    } else {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Initialize a new debug session.
 * @param {object} metadata - optional extra metadata to include in run_start
 * @returns {{ runId, sessionId, enabled }} or { enabled: false }
 */
export async function createDebugSession(metadata = {}) {
  if (!isEnabled()) {
    return { enabled: false };
  }

  const dateStr = new Date().toISOString().slice(0, 10);
  const hex = randomBytes(3).toString('hex');
  const runId = `${dateStr}-${hex}`;
  const sessionId = randomUUID();
  const logDir = getLogDir();
  const logFile = join(logDir, `${runId}.jsonl`);

  await mkdir(logDir, { recursive: true });

  _state = {
    runId,
    sessionId,
    logFile,
    startTime: Date.now(),
  };

  return { runId, sessionId, enabled: true };
}

/**
 * Log a structured event.
 * @param {string} eventType - one of EVENT_TYPES
 * @param {object} data - event-specific fields
 * @returns the written event object, or {} if disabled
 */
export async function logEvent(eventType, data = {}) {
  if (!isEnabled() || !_state) return {};

  const redacted = applyRedaction(data);

  const event = {
    timestamp: new Date().toISOString(),
    event_type: eventType,
    run_id: _state.runId,
    session_id: _state.sessionId,
    ...redacted,
  };

  await appendFile(_state.logFile, JSON.stringify(event) + '\n', 'utf8');
  return event;
}

// Track provider call start times keyed by a caller-provided key
const _providerCallStartTimes = new Map();

/**
 * Convenience wrapper for provider call events.
 * @param {'request'|'success'|'error'} phase
 * @param {object} data
 */
export async function logProviderCall(phase, data = {}) {
  if (!isEnabled() || !_state) return {};

  const callKey = data.call_key || `${data.provider}-${data.model}`;

  if (phase === 'request') {
    _providerCallStartTimes.set(callKey, Date.now());
    return logEvent(EVENT_TYPES.PROVIDER_REQUEST, data);
  }

  if (phase === 'success') {
    const startTime = _providerCallStartTimes.get(callKey);
    const duration_ms = startTime != null ? Date.now() - startTime : data.duration_ms ?? 0;
    _providerCallStartTimes.delete(callKey);
    return logEvent(EVENT_TYPES.PROVIDER_SUCCESS, { ...data, duration_ms });
  }

  if (phase === 'error') {
    const startTime = _providerCallStartTimes.get(callKey);
    const duration_ms = startTime != null ? Date.now() - startTime : data.duration_ms ?? 0;
    _providerCallStartTimes.delete(callKey);
    return logEvent(EVENT_TYPES.PROVIDER_ERROR, { ...data, duration_ms });
  }

  return {};
}

/**
 * Close the session and write a run_end event.
 * @param {object} summary - summary fields merged into run_end event
 * @returns the run_end event, or {} if disabled
 */
export async function closeDebugSession(summary = {}) {
  if (!isEnabled() || !_state) return {};

  const duration_ms = Date.now() - _state.startTime;
  const event = await logEvent(EVENT_TYPES.RUN_END, { ...summary, duration_ms });

  _state = null;
  _providerCallStartTimes.clear();

  return event;
}

/**
 * Expose internal state for testing purposes.
 * @internal
 */
export function _getState() {
  return _state;
}

/**
 * Reset state (for testing purposes).
 * @internal
 */
export function _resetState() {
  _state = null;
  _providerCallStartTimes.clear();
}
