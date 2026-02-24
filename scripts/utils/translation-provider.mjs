/**
 * Translation Provider Interface & Shared Utilities
 *
 * All providers implement: translate(texts, options) → { translations, charCount, meta }
 *
 * Shared logic extracted from gemini-translation-client.mjs and openai-translation-client.mjs
 * to eliminate duplication (buildPrompt, parseResponse, createBatches, sleep were identical).
 */

// ---------------------------------------------------------------------------
// Error Classes (canonical location — re-exported by gemini-translation-client.mjs
// for backward compatibility)
// ---------------------------------------------------------------------------

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
 * Custom error thrown when a provider returns fewer translations than expected.
 * Contains the partial results so the caller can complete them with a fallback.
 */
export class PartialTranslationError extends Error {
  constructor(partialTranslations, expectedCount) {
    super(`Expected ${expectedCount} translations, got ${partialTranslations.length}`);
    this.name = 'PartialTranslationError';
    this.partialTranslations = partialTranslations;
    this.expectedCount = expectedCount;
  }
}

/**
 * Build translation prompt for LLM-based providers (Gemini, OpenAI, etc.)
 * Extracted from gemini/openai clients where the implementation was identical.
 *
 * @param {string[]} texts - Array of texts to translate
 * @returns {string} Formatted prompt
 */
export function buildTranslationPrompt(texts) {
  const numbered = texts.map((text, i) => `${i + 1}. ${text}`).join('\n');

  return `You are a professional translator specializing in software documentation.
Translate the following software changelog entries from English to Korean.

RULES:
- Translate naturally into Korean, not word-by-word
- DO NOT translate: code in backticks (\`code\`), file paths, URLs, CLI commands, technical terms like API names
- Keep the same numbering format
- Output ONLY the translations, one per line, with the same numbering
- REMOVE conventional commit prefixes before translating: strip patterns like "feat:", "feat(scope):",
  "fix:", "chore:", "docs:", "test:", "refactor:", "perf:", "style:", "build:", "ci:", "revert:"
  from the START of each entry. Translate ONLY the description after the prefix.
  Example: "feat(cli): add new command" → "새 명령어 추가" (NOT "기능(cli): 새 명령어 추가")

ENTRIES TO TRANSLATE:
${numbered}

KOREAN TRANSLATIONS:`;
}

/**
 * Parse numbered response from LLM output.
 * Extracted from gemini/openai clients where the implementation was identical.
 *
 * @param {string} responseText - Raw response text from LLM
 * @param {number} expectedCount - Expected number of translations
 * @returns {string[]} Parsed translations
 */
export function parseNumberedResponse(responseText, expectedCount) {
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
 * Split texts into batches of given size.
 * Extracted from gemini/openai clients.
 *
 * @param {string[]} texts - Array of texts to batch
 * @param {number} [batchSize=20] - Maximum items per batch
 * @returns {string[][]} Array of batches
 */
export function createBatches(texts, batchSize = 20) {
  const batches = [];
  for (let i = 0; i < texts.length; i += batchSize) {
    batches.push(texts.slice(i, i + batchSize));
  }
  return batches;
}

/**
 * Sleep for the given milliseconds with optional jitter.
 * Extracted from gemini-translation-client.mjs.
 *
 * @param {number} ms - Base sleep duration in milliseconds
 * @param {number} [jitterMs=0] - Maximum jitter in milliseconds (bidirectional)
 * @returns {Promise<void>}
 */
export function sleep(ms, jitterMs = 0) {
  const actual = ms + Math.floor((Math.random() * 2 - 1) * jitterMs);
  return new Promise(resolve => setTimeout(resolve, Math.max(0, actual)));
}

// ---------------------------------------------------------------------------
// Provider Registry
// ---------------------------------------------------------------------------

const providers = new Map();

/**
 * Register a translation provider.
 *
 * @param {string} name - Provider name (e.g. 'gemini', 'openai', 'google', 'mock')
 * @param {{ translate: Function }} provider - Provider object with translate method
 */
export function registerProvider(name, provider) {
  providers.set(name, provider);
}

/**
 * Get a registered provider by name.
 *
 * @param {string} name - Provider name
 * @returns {{ translate: Function } | undefined}
 */
export function getProvider(name) {
  return providers.get(name);
}

/**
 * Get all registered provider names.
 *
 * @returns {string[]}
 */
export function getAvailableProviders() {
  return [...providers.keys()];
}

// ---------------------------------------------------------------------------
// Gemini Model Chain Helper
// ---------------------------------------------------------------------------

/**
 * Default Gemini model fallback chain (tried in order on QuotaExhaustedError).
 */
export const GEMINI_MODELS = [
  { model: 'gemini-3-flash-preview', label: 'Gemini 3 Flash' },
  { model: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
];

/**
 * Translate texts with Gemini, trying each model in the chain.
 * Models exhausted within this run are tracked in exhaustedModels.
 *
 * @param {string[]} texts - Texts to translate
 * @param {Set<string>} exhaustedModels - Models already exhausted in this run
 * @param {Function} translateFn - The translateWithGemini function (avoids circular import)
 * @param {Array<{model: string, label: string}>} [models] - Model chain (default: GEMINI_MODELS)
 * @returns {Promise<{result: object, usedModel: string} | null>} null if all models exhausted
 */
export async function translateWithGeminiChain(texts, exhaustedModels, translateFn, models = GEMINI_MODELS) {
  for (const { model, label } of models) {
    if (exhaustedModels.has(model)) {
      console.log(`    [${label}] Skipped (daily quota exhausted this run)`);
      continue;
    }

    try {
      const result = await translateFn(texts, { model });
      return { result, usedModel: model };
    } catch (error) {
      if (error instanceof QuotaExhaustedError) {
        console.warn(`    [${label}] Daily quota (RPD) exhausted — switching to next model`);
        exhaustedModels.add(model);
        // Continue to next model in chain
      } else {
        throw error; // Non-quota errors propagate up
      }
    }
  }

  return null; // All Gemini models exhausted
}

// ---------------------------------------------------------------------------
// Mock Provider (for testing)
// ---------------------------------------------------------------------------

/**
 * Create mock translations that return original texts unchanged.
 *
 * @param {string[]} texts - Array of texts
 * @returns {{ translations: string[], charCount: number, meta: object }}
 */
export function createMockTranslations(texts) {
  return {
    translations: texts.map(text => text),
    charCount: texts.reduce((sum, text) => sum + text.length, 0),
    meta: { provider: 'mock', model: 'mock', endpointType: 'mock' },
  };
}

registerProvider('mock', { translate: (texts) => createMockTranslations(texts) });
