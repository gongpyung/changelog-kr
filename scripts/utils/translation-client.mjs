/**
 * Google Cloud Translation API v2 Client
 * Translates text batches while preserving code, URLs, and file paths
 */

const API_ENDPOINT = 'https://translation.googleapis.com/language/translate/v2';

// Strip conventional commit prefixes (feat:, fix(scope):, etc.) from source text
const EN_PREFIX = /^(feat|fix|chore|docs|test|refactor|perf|style|build|ci|revert)(\([^)]*\))?[!]?:\s*/i;

function stripConventionalPrefix(text) {
  return text.replace(EN_PREFIX, '');
}
const MAX_BATCH_SIZE = 50;
const MAX_CHARS_PER_BATCH = 5000;
const BATCH_DELAY_MS = 100;

class PlaceholderManager {
  constructor() {
    this.codeTokens = [];
    this.urls = [];
    this.paths = [];
  }

  protect(text) {
    let result = text;

    // Extract and replace code tokens (backtick-wrapped)
    result = result.replace(/`([^`]+)`/g, (match, content) => {
      const index = this.codeTokens.length;
      this.codeTokens.push(match);
      return `{{CODE_${index}}}`;
    });

    // Extract and replace URLs
    result = result.replace(/https?:\/\/[^\s]+/g, (match) => {
      const index = this.urls.length;
      this.urls.push(match);
      return `{{URL_${index}}}`;
    });

    // Extract and replace file paths (contains / or \)
    result = result.replace(/(?:^|\s)([^\s]*[\/\\][^\s]+)/g, (match, path) => {
      const index = this.paths.length;
      this.paths.push(path);
      return match.replace(path, `{{PATH_${index}}}`);
    });

    return result;
  }

  restore(text) {
    let restored = text;

    // Restore code tokens
    this.codeTokens.forEach((token, index) => {
      restored = restored.replace(`{{CODE_${index}}}`, token);
    });

    // Restore URLs
    this.urls.forEach((url, index) => {
      restored = restored.replace(`{{URL_${index}}}`, url);
    });

    // Restore paths
    this.paths.forEach((path, index) => {
      restored = restored.replace(`{{PATH_${index}}}`, path);
    });

    return restored;
  }
}

/**
 * Split texts into batches based on count and character limits
 */
function createBatches(texts) {
  const batches = [];
  let currentBatch = [];
  let currentCharCount = 0;

  for (const text of texts) {
    const textLength = text.length;

    if (currentBatch.length >= MAX_BATCH_SIZE ||
        (currentCharCount + textLength > MAX_CHARS_PER_BATCH && currentBatch.length > 0)) {
      batches.push(currentBatch);
      currentBatch = [];
      currentCharCount = 0;
    }

    currentBatch.push(text);
    currentCharCount += textLength;
  }

  if (currentBatch.length > 0) {
    batches.push(currentBatch);
  }

  return batches;
}

/**
 * Call Google Cloud Translation API for a single batch
 */
async function callTranslationAPI(texts, apiKey, sourceLang, targetLang) {
  const url = `${API_ENDPOINT}?key=${apiKey}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      q: texts,
      source: sourceLang,
      target: targetLang,
      format: 'text',
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Translation API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  return data.data.translations.map(t => t.translatedText);
}

/**
 * Translate a batch of texts from source language to target language
 * @param {string[]} texts - Array of texts to translate
 * @param {string} sourceLang - Source language code (default: 'en')
 * @param {string} targetLang - Target language code (default: 'ko')
 * @returns {Promise<{translations: string[], charCount: number}>}
 */
export async function translateBatch(texts, sourceLang = 'en', targetLang = 'ko') {
  const apiKey = process.env.GOOGLE_TRANSLATE_API_KEY;

  if (!apiKey) {
    throw new Error(
      'GOOGLE_TRANSLATE_API_KEY environment variable is not set. ' +
      'Please set it to use Google Cloud Translation API.'
    );
  }

  if (!texts || texts.length === 0) {
    return { translations: [], charCount: 0 };
  }

  // Strip conventional commit prefixes before translation
  const strippedTexts = texts.map(stripConventionalPrefix);

  // Protect code, URLs, and paths
  const managers = strippedTexts.map(() => new PlaceholderManager());
  const protectedTexts = strippedTexts.map((text, i) => managers[i].protect(text));

  // Create batches
  const batches = createBatches(protectedTexts);

  // Translate each batch
  const allTranslations = [];
  let totalCharCount = 0;

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const batchCharCount = batch.reduce((sum, text) => sum + text.length, 0);

    console.log(`Translating batch ${i + 1}/${batches.length} (${batch.length} items, ${batchCharCount} chars)...`);

    const translations = await callTranslationAPI(batch, apiKey, sourceLang, targetLang);
    allTranslations.push(...translations);
    totalCharCount += batchCharCount;

    // Delay between batches (except after last batch)
    if (i < batches.length - 1) {
      await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
    }
  }

  // Restore protected content
  const restoredTranslations = allTranslations.map((text, i) => managers[i].restore(text));

  return {
    translations: restoredTranslations,
    charCount: totalCharCount,
  };
}
