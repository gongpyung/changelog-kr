/**
 * GLM API Translation Client
 * Uses GLM-5 (OpenAI-compatible format) for changelog translations
 *
 * Supports retry with exponential backoff for transient errors.
 * Throws QuotaExhaustedError when quota is exhausted,
 * allowing the caller to switch to a fallback provider.
 */

import {
  buildTranslationPrompt,
  parseNumberedResponse,
  createBatches,
  sleep,
  registerProvider,
  QuotaExhaustedError,
  PartialTranslationError,
} from './translation-provider.mjs';

import { logProviderCall } from './translation-debug-logger.mjs';
import { ERROR_CLASSES } from './translation-debug-schema.mjs';

const DEFAULT_MODEL = 'glm-5';
const DEFAULT_BASE_URL = 'https://api.z.ai/api/coding/paas/v4';
const BATCH_DELAY_MS = 500;
const MAX_RETRIES = 3;
const RETRY_BASE_MS = 5000;

/**
 * Classify a GLM API error by HTTP status and response body.
 *
 * @param {number} status - HTTP status code
 * @param {string|object} responseBody - Raw response body (string or parsed object)
 * @returns {'quota'|'model_unsupported'|'auth'|'server'|'client'}
 */
export function classifyGlmError(status, responseBody) {
  if (status === 429) {
    return 'quota';
  }

  if (status === 401 || status === 403) {
    return 'auth';
  }

  if (status === 404) {
    return 'model_unsupported';
  }

  if (status === 500 || status === 502 || status === 503 || status === 504) {
    return 'server';
  }

  // Try to inspect body for quota/model signals on other status codes
  try {
    const parsed = typeof responseBody === 'string' ? JSON.parse(responseBody) : responseBody;
    const errorCode = parsed?.error?.code || parsed?.error?.type || '';
    const errorMsg = (parsed?.error?.message || '').toLowerCase();

    if (
      errorCode === 'rate_limit_exceeded' ||
      errorMsg.includes('quota') ||
      errorMsg.includes('rate limit') ||
      errorMsg.includes('exceeded')
    ) {
      return 'quota';
    }

    if (
      errorCode === 'model_not_found' ||
      errorMsg.includes('model') && (errorMsg.includes('not found') || errorMsg.includes('unavailable'))
    ) {
      return 'model_unsupported';
    }
  } catch {
    // Ignore parse errors — fall through to default
  }

  return 'client';
}

/**
 * Call GLM API for a single batch of texts, with retry logic.
 * Throws QuotaExhaustedError if quota is exhausted (non-retryable).
 *
 * @param {string[]} texts - Texts to translate
 * @param {string} apiKey - GLM API key
 * @param {string} model - Model ID
 * @param {string} baseUrl - Base URL
 * @returns {Promise<string[]>} Translated texts
 */
async function callGlmAPI(texts, apiKey, model, baseUrl) {
  const endpoint = `${baseUrl}/chat/completions`;
  const prompt = buildTranslationPrompt(texts);

  const requestBody = JSON.stringify({
    model,
    messages: [
      {
        role: 'system',
        content: 'You are a professional translator. Output only the numbered translations, nothing else.',
      },
      {
        role: 'user',
        content: prompt,
      },
    ],
    temperature: 0.3,
    max_tokens: 8192,
  });

  const charCount = texts.reduce((sum, text) => sum + text.length, 0);
  const endpointType = baseUrl.includes('coding') ? 'coding' : 'general';
  let lastError;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const backoffMs = RETRY_BASE_MS * Math.pow(2, attempt - 1);
      console.log(`    GLM retry attempt ${attempt}/${MAX_RETRIES} after ${backoffMs / 1000}s...`);
      await sleep(backoffMs, 1000);
    }

    const callKey = `glm-${model}-attempt-${attempt}`;
    await logProviderCall('request', { provider: 'glm', model, endpoint_type: endpointType, batch_size: texts.length, char_count: charCount, call_key: callKey });

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: requestBody,
    });

    if (response.ok) {
      await logProviderCall('success', { provider: 'glm', model, batch_size: texts.length, char_count: charCount, http_status: response.status, call_key: callKey });
      const data = await response.json();

      if (!data.choices || !data.choices[0]?.message?.content) {
        throw new Error('Invalid GLM API response format');
      }

      const responseText = data.choices[0].message.content;
      const translations = parseNumberedResponse(responseText, texts.length);

      if (translations.length !== texts.length) {
        throw new PartialTranslationError(translations, texts.length);
      }

      return translations;
    }

    const errorText = await response.text();
    const errorClass = classifyGlmError(response.status, errorText);

    if (errorClass === 'quota') {
      await logProviderCall('error', { provider: 'glm', model, error_class: ERROR_CLASSES.QUOTA, error_message: errorText, http_status: response.status, retry_count: attempt, call_key: callKey });
      throw new QuotaExhaustedError(
        model,
        `[${model}] GLM quota exhausted (${response.status}): ${errorText}`
      );
    }

    if (errorClass === 'server') {
      await logProviderCall('error', { provider: 'glm', model, error_class: ERROR_CLASSES.SERVER, error_message: errorText, http_status: response.status, retry_count: attempt, call_key: callKey });
      lastError = new Error(`GLM API server error (${response.status}): ${errorText}`);
      console.warn(`    GLM server error ${response.status}, will retry...`);
      continue;
    }

    // auth, model_unsupported, client — non-retryable
    await logProviderCall('error', { provider: 'glm', model, error_class: errorClass === 'auth' ? ERROR_CLASSES.AUTH : ERROR_CLASSES.CLIENT, error_message: errorText, http_status: response.status, retry_count: attempt, call_key: callKey });
    throw new Error(`GLM API error (${response.status}) [${errorClass}]: ${errorText}`);
  }

  throw lastError || new Error('GLM API call failed after retries');
}

/**
 * Translate a batch of texts using GLM.
 *
 * @param {string[]} texts - Array of texts to translate
 * @param {object} [options]
 * @param {string} [options.model] - GLM model ID (default: GLM_MODEL env or 'glm-5')
 * @returns {Promise<{translations: string[], charCount: number, meta: object}>}
 * @throws {QuotaExhaustedError} When quota is exhausted
 */
export async function translateWithGlm(texts, options = {}) {
  const apiKey = process.env.GLM_API_KEY || process.env.ZAI_API_KEY;

  if (!apiKey) {
    throw new Error(
      'GLM_API_KEY (or ZAI_API_KEY) environment variable is not set.'
    );
  }

  if (!texts || texts.length === 0) {
    const model = options.model || process.env.GLM_MODEL || DEFAULT_MODEL;
    const baseUrl = process.env.GLM_BASE_URL || DEFAULT_BASE_URL;
    const endpointType = baseUrl.includes('coding') ? 'coding' : 'general';
    return { translations: [], charCount: 0, meta: { provider: 'glm', model, endpointType } };
  }

  const model = options.model || process.env.GLM_MODEL || DEFAULT_MODEL;
  const baseUrl = process.env.GLM_BASE_URL || DEFAULT_BASE_URL;
  const endpointType = baseUrl.includes('coding') ? 'coding' : 'general';

  const batches = createBatches(texts, 20);
  const allTranslations = [];
  let totalCharCount = 0;

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const batchCharCount = batch.reduce((sum, text) => sum + text.length, 0);

    console.log(`    [GLM/${model}] batch ${i + 1}/${batches.length} (${batch.length} items)...`);

    const translations = await callGlmAPI(batch, apiKey, model, baseUrl);
    allTranslations.push(...translations);
    totalCharCount += batchCharCount;

    if (i < batches.length - 1) {
      await sleep(BATCH_DELAY_MS);
    }
  }

  return {
    translations: allTranslations,
    charCount: totalCharCount,
    meta: { provider: 'glm', model, endpointType },
  };
}

// Register as a provider
registerProvider('glm', { translate: translateWithGlm });
