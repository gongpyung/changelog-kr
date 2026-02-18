/**
 * Gemini API Translation Client
 * Uses Google Gemini for high-quality changelog translations
 *
 * Supports multi-model fallback via options.model parameter.
 * Throws QuotaExhaustedError when daily RPD limit is reached,
 * allowing the caller to switch to a fallback model.
 */

const DEFAULT_MODEL = 'gemini-3-flash-preview';
const BATCH_DELAY_MS = 13000; // 13s between batches (conservative for RPM 5)
const MAX_RETRIES = 3;
const RETRY_BASE_MS = 15000; // 15s base for exponential backoff

/**
 * Custom error thrown when the daily quota (RPD) is exhausted.
 * Unlike a transient rate limit, this signals the caller should switch models.
 */
export class QuotaExhaustedError extends Error {
  constructor(model, message) {
    super(message);
    this.name = 'QuotaExhaustedError';
    this.model = model;
  }
}

/**
 * Build translation prompt for Gemini
 */
function buildPrompt(texts) {
  const numbered = texts.map((text, i) => `${i + 1}. ${text}`).join('\n');

  return `You are a professional translator specializing in software documentation.
Translate the following software changelog entries from English to Korean.

RULES:
- Translate naturally into Korean, not word-by-word
- DO NOT translate: code in backticks (\`code\`), file paths, URLs, CLI commands, technical terms like API names
- Keep the same numbering format
- Output ONLY the translations, one per line, with the same numbering

ENTRIES TO TRANSLATE:
${numbered}

KOREAN TRANSLATIONS:`;
}

/**
 * Parse Gemini response to extract translations
 */
function parseResponse(responseText, expectedCount) {
  const lines = responseText.trim().split('\n');
  const translations = [];

  for (const line of lines) {
    // Match lines starting with number and dot
    const match = line.match(/^\d+\.\s*(.+)$/);
    if (match) {
      translations.push(match[1].trim());
    }
  }

  // If parsing failed, try to split by newlines
  if (translations.length !== expectedCount) {
    const fallback = responseText.trim().split('\n')
      .filter(line => line.trim())
      .map(line => line.replace(/^\d+\.\s*/, '').trim());

    if (fallback.length === expectedCount) {
      return fallback;
    }
  }

  return translations;
}

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

/**
 * Sleep for the given milliseconds with optional jitter.
 */
function sleep(ms, jitterMs = 0) {
  const actual = ms + Math.floor((Math.random() * 2 - 1) * jitterMs);
  return new Promise(resolve => setTimeout(resolve, Math.max(0, actual)));
}

/**
 * Call Gemini API for a single batch of texts, with retry logic.
 * Throws QuotaExhaustedError if daily RPD limit is reached.
 */
async function callGeminiAPI(texts, apiKey, model) {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const prompt = buildPrompt(texts);
  const body = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 4096,
    },
  });

  let lastError;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const backoffMs = RETRY_BASE_MS * Math.pow(2, attempt - 1);
      console.log(`    Retry attempt ${attempt}/${MAX_RETRIES} after ${backoffMs / 1000}s...`);
      await sleep(backoffMs, 2000);
    }

    const response = await fetch(`${endpoint}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });

    if (response.ok) {
      const data = await response.json();

      if (!data.candidates || !data.candidates[0]?.content?.parts?.[0]?.text) {
        throw new Error('Invalid Gemini API response format');
      }

      const responseText = data.candidates[0].content.parts[0].text;
      const translations = parseResponse(responseText, texts.length);

      if (translations.length !== texts.length) {
        console.warn(`Warning: Expected ${texts.length} translations, got ${translations.length}`);
        while (translations.length < texts.length) {
          translations.push(texts[translations.length]);
        }
      }

      return translations;
    }

    const errorText = await response.text();

    // Handle 429: distinguish RPD exhaustion from RPM rate limit
    if (response.status === 429) {
      if (isDailyQuotaExhausted(errorText)) {
        throw new QuotaExhaustedError(
          model,
          `[${model}] Daily quota (RPD) exhausted: ${errorText}`
        );
      }
      // RPM exceeded — retryable
      lastError = new Error(`Gemini API rate limit (${response.status}): ${errorText}`);
      console.warn(`    Rate limited (RPM), will retry...`);
      continue;
    }

    // Handle transient server errors: retryable
    if ([500, 502, 503, 504].includes(response.status)) {
      lastError = new Error(`Gemini API server error (${response.status}): ${errorText}`);
      console.warn(`    Server error ${response.status}, will retry...`);
      continue;
    }

    // Non-retryable errors (400, 403, etc.)
    throw new Error(`Gemini API error (${response.status}): ${errorText}`);
  }

  throw lastError || new Error('Gemini API call failed after retries');
}

/**
 * Split texts into batches of MAX_BATCH_SIZE
 */
function createBatches(texts, batchSize = 20) {
  const batches = [];
  for (let i = 0; i < texts.length; i += batchSize) {
    batches.push(texts.slice(i, i + batchSize));
  }
  return batches;
}

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
    return { translations: [], charCount: 0 };
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
  };
}
