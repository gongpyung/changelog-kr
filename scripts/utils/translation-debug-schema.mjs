/**
 * Translation Debug Event Schema
 * Defines event types, required fields, and validation for debug logging.
 */

export const EVENT_TYPES = {
  // Run lifecycle
  RUN_START: 'run_start',
  RUN_END: 'run_end',
  RUN_ERROR: 'run_error',

  // Service/version
  SERVICE_START: 'service_start',
  VERSION_START: 'version_start',
  VERSION_END: 'version_end',

  // Provider calls
  PROVIDER_REQUEST: 'provider_request',
  PROVIDER_SUCCESS: 'provider_success',
  PROVIDER_ERROR: 'provider_error',

  // Fallback
  FALLBACK: 'fallback',

  // Quality
  QUALITY_CHECK: 'quality_check',

  // Retranslation
  RETRANSLATE_START: 'retranslate_start',
  RETRANSLATE_END: 'retranslate_end',
  RETRANSLATE_ENTRY: 'retranslate_entry',
};

export const ERROR_CLASSES = {
  AUTH: 'auth',
  QUOTA: 'quota',
  RATE_LIMIT: 'rate_limit',
  SERVER: 'server',
  CLIENT: 'client',
  PARSE: 'parse',
  UNKNOWN: 'unknown',
};

// Common fields required on every event
export const COMMON_FIELDS = ['timestamp', 'event_type', 'run_id', 'session_id'];

// Required fields per event type (beyond common fields)
export const REQUIRED_FIELDS = {
  [EVENT_TYPES.RUN_START]: ['engine', 'fallback_chain', 'total_services', 'total_versions'],
  [EVENT_TYPES.RUN_END]: ['total_services', 'total_versions', 'total_entries', 'total_chars', 'duration_ms'],
  [EVENT_TYPES.RUN_ERROR]: ['error_class', 'error_message'],

  [EVENT_TYPES.SERVICE_START]: ['service_id'],
  [EVENT_TYPES.VERSION_START]: ['service_id', 'version'],
  [EVENT_TYPES.VERSION_END]: ['service_id', 'version', 'entry_count', 'duration_ms'],

  [EVENT_TYPES.PROVIDER_REQUEST]: ['provider', 'model', 'endpoint_type', 'batch_size', 'char_count'],
  [EVENT_TYPES.PROVIDER_SUCCESS]: ['provider', 'model', 'duration_ms', 'batch_size', 'char_count', 'http_status'],
  [EVENT_TYPES.PROVIDER_ERROR]: ['provider', 'model', 'duration_ms', 'error_class', 'error_message', 'http_status', 'retry_count'],

  [EVENT_TYPES.FALLBACK]: ['from_provider', 'to_provider', 'reason', 'error_class'],

  [EVENT_TYPES.QUALITY_CHECK]: ['context', 'total_count', 'warning_count', 'ratio', 'is_poor_quality'],

  [EVENT_TYPES.RETRANSLATE_START]: ['context', 'poor_version_count'],
  [EVENT_TYPES.RETRANSLATE_END]: ['found_count', 'retranslated_count', 'still_poor_count'],
  [EVENT_TYPES.RETRANSLATE_ENTRY]: ['service_id', 'version', 'provider'],
};

/**
 * Validate an event object against the schema.
 * Returns { valid: boolean, missing: string[] }
 */
export function validateEvent(event) {
  const missing = [];

  for (const field of COMMON_FIELDS) {
    if (event[field] === undefined || event[field] === null) {
      missing.push(field);
    }
  }

  const eventType = event.event_type;
  const extraRequired = REQUIRED_FIELDS[eventType] ?? [];
  for (const field of extraRequired) {
    if (event[field] === undefined || event[field] === null) {
      missing.push(field);
    }
  }

  return { valid: missing.length === 0, missing };
}
