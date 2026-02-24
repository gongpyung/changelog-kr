/**
 * Gemini API Translation Client
 * Uses Google Gemini for high-quality changelog translations
 *
 * Supports multi-model fallback via options.model parameter.
 * Throws QuotaExhaustedError when daily RPD limit is reached,
 * allowing the caller to switch to a fallback model.
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

// Re-export error classes for backward compatibility
// (canonical definitions are now in translation-provider.mjs)
export { QuotaExhaustedError, PartialTranslationError };

const DEFAULT_MODEL = 'gemini-3-flash-preview';
const BATCH_DELAY_MS = 13000; // 13s between batches (conservative for RPM 5)
const MAX_RETRIES = 3;
const RETRY_BASE_MS = 15000; // 15s base for exponential backoff

// buildPrompt and parseResponse are now shared via translation-provider.mjs
// (buildTranslationPrompt, parseNumberedResponse)

/**
 * Check if a 429 error is a daily quota exhaustion (RPD) vs transient rate limit (RPM).
 * Returns true if daily quota is exhausted (caller should switch models, not retry).
 */
function isDailyQuotaExhausted(errorBody) {
  try {
    const parsed = typeof errorBody === 'string' ? JSON.parse(errorBody) : errorBody;
    const details = parsed?.error?.details || [];
    for (const detail of details) {
      const quotaLimit = detail?.metadata?.quota_limit || '';
      if (quotaLimit.toLowerCase().includes('perday')) {
        return true;
      }
    }
    // Also check error message for common daily quota keywords
    const message = (parsed?.error?.message || '').toLowerCase();
    if (message.includes('daily') || message.includes('per day')) {
      return true;
    }
  } catch {
    // If we can't parse the body, treat as transient (retryable)
  }
  return false;
}

// sleep is now shared via translation-provider.mjs

/**
 * Call Gemini API for a single batch of texts, with retry logic.
 * Throws QuotaExhaustedError if daily RPD limit is reached.
 */
async function callGeminiAPI(texts, apiKey, model) {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const prompt = buildTranslationPrompt(texts);
  const body = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 8192,
    },
  });

  const charCount = texts.reduce((sum, text) => sum + text.length, 0);
  let lastError;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const backoffMs = RETRY_BASE_MS * Math.pow(2, attempt - 1);
      console.log(`    Retry attempt ${attempt}/${MAX_RETRIES} after ${backoffMs / 1000}s...`);
      await sleep(backoffMs, 2000);
    }

    const callKey = `gemini-${model}-attempt-${attempt}`;
    await logProviderCall('request', { provider: 'gemini', model, endpoint_type: 'native', batch_size: texts.length, char_count: charCount, call_key: callKey });

    const response = await fetch(`${endpoint}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });

    if (response.ok) {
      await logProviderCall('success', { provider: 'gemini', model, batch_size: texts.length, char_count: charCount, http_status: response.status, call_key: callKey });
      const data = await response.json();

      if (!data.candidates || !data.candidates[0]?.content?.parts?.[0]?.text) {
        throw new Error('Invalid Gemini API response format');
      }

      const responseText = data.candidates[0].content.parts[0].text;
      const translations = parseNumberedResponse(responseText, texts.length);

      if (translations.length !== texts.length) {
        throw new PartialTranslationError(translations, texts.length);
      }

      return translations;
    }

    const errorText = await response.text();

    // Handle 429: distinguish RPD exhaustion from RPM rate limit
    if (response.status === 429) {
      if (isDailyQuotaExhausted(errorText)) {
        await logProviderCall('error', { provider: 'gemini', model, error_class: ERROR_CLASSES.QUOTA, error_message: errorText, http_status: 429, retry_count: attempt, call_key: callKey });
        throw new QuotaExhaustedError(
          model,
          `[${model}] Daily quota (RPD) exhausted: ${errorText}`
        );
      }
      // RPM exceeded — retryable
      await logProviderCall('error', { provider: 'gemini', model, error_class: ERROR_CLASSES.RATE_LIMIT, error_message: 'Rate limited (RPM)', http_status: 429, retry_count: attempt, call_key: callKey });
      lastError = new Error(`Gemini API rate limit (${response.status}): ${errorText}`);
      console.warn(`    Rate limited (RPM), will retry...`);
      continue;
    }

    // Handle transient server errors: retryable
    if ([500, 502, 503, 504].includes(response.status)) {
      await logProviderCall('error', { provider: 'gemini', model, error_class: ERROR_CLASSES.SERVER, error_message: errorText, http_status: response.status, retry_count: attempt, call_key: callKey });
      lastError = new Error(`Gemini API server error (${response.status}): ${errorText}`);
      console.warn(`    Server error ${response.status}, will retry...`);
      continue;
    }

    // Non-retryable errors (400, 403, etc.)
    await logProviderCall('error', { provider: 'gemini', model, error_class: ERROR_CLASSES.CLIENT, error_message: errorText, http_status: response.status, retry_count: attempt, call_key: callKey });
    throw new Error(`Gemini API error (${response.status}): ${errorText}`);
  }

  throw lastError || new Error('Gemini API call failed after retries');
}

// createBatches is now shared via translation-provider.mjs

/**
 * Translate a batch of texts using Gemini.
 *
 * @param {string[]} texts - Array of texts to translate
 * @param {object} [options]
 * @param {string} [options.model] - Gemini model ID (default: gemini-3-flash-preview)
 * @returns {Promise<{translations: string[], charCount: number}>}
 * @throws {QuotaExhaustedError} When the daily RPD quota for this model is exhausted
 */
export async function translateWithGemini(texts, options = {}) {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY environment variable is not set. ' +
      'Get your API key from https://aistudio.google.com/'
    );
  }

  if (!texts || texts.length === 0) {
    return { translations: [], charCount: 0, meta: { provider: 'gemini', model: options.model || process.env.GEMINI_MODEL || DEFAULT_MODEL, endpointType: 'native' } };
  }

  const model = options.model || process.env.GEMINI_MODEL || DEFAULT_MODEL;
  const batchDelayMs = options.batchDelayMs ?? BATCH_DELAY_MS;

  const batches = createBatches(texts);
  const allTranslations = [];
  let totalCharCount = 0;

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const batchCharCount = batch.reduce((sum, text) => sum + text.length, 0);

    console.log(`    [${model}] batch ${i + 1}/${batches.length} (${batch.length} items)...`);

    const translations = await callGeminiAPI(batch, apiKey, model);
    allTranslations.push(...translations);
    totalCharCount += batchCharCount;

    // Rate limit delay between batches (skip after last batch)
    if (i < batches.length - 1) {
      console.log(`    Waiting ${batchDelayMs / 1000}s (rate limit)...`);
      await sleep(batchDelayMs);
    }
  }

  return {
    translations: allTranslations,
    charCount: totalCharCount,
    meta: { provider: 'gemini', model, endpointType: 'native' },
  };
}

// Register as a provider
registerProvider('gemini', { translate: translateWithGemini });
