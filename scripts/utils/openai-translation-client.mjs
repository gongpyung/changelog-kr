/**
 * OpenAI API Translation Client
 * Uses GPT-4o for high-quality changelog translations
 */

import { PartialTranslationError } from './gemini-translation-client.mjs';

const API_ENDPOINT = 'https://api.openai.com/v1/chat/completions';
const MODEL = process.env.OPENAI_MODEL || 'gpt-4o';
const MAX_BATCH_SIZE = 20;
const BATCH_DELAY_MS = 300;

/**
 * Build translation prompt for OpenAI
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
- REMOVE conventional commit prefixes before translating: strip patterns like "feat:", "feat(scope):",
  "fix:", "chore:", "docs:", "test:", "refactor:", "perf:", "style:", "build:", "ci:", "revert:"
  from the START of each entry. Translate ONLY the description after the prefix.
  Example: "feat(cli): add new command" → "새 명령어 추가" (NOT "기능(cli): 새 명령어 추가")

ENTRIES TO TRANSLATE:
${numbered}`;
}

/**
 * Parse response to extract translations
 */
function parseResponse(responseText, expectedCount) {
  const lines = responseText.trim().split('\n');
  const translations = [];

  for (const line of lines) {
    const match = line.match(/^\d+\.\s*(.+)$/);
    if (match) {
      translations.push(match[1].trim());
    }
  }

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
 * Call OpenAI API for translation
 */
async function callOpenAIAPI(texts, apiKey) {
  const prompt = buildPrompt(texts);

  const response = await fetch(API_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        {
          role: 'system',
          content: 'You are a professional translator. Output only the numbered translations, nothing else.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.3,
      max_tokens: 8192,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();

  if (!data.choices || !data.choices[0]?.message?.content) {
    throw new Error('Invalid OpenAI API response format');
  }

  const responseText = data.choices[0].message.content;
  const translations = parseResponse(responseText, texts.length);

  if (translations.length !== texts.length) {
    throw new PartialTranslationError(translations, texts.length);
  }

  return translations;
}

/**
 * Split texts into batches
 */
function createBatches(texts) {
  const batches = [];
  for (let i = 0; i < texts.length; i += MAX_BATCH_SIZE) {
    batches.push(texts.slice(i, i + MAX_BATCH_SIZE));
  }
  return batches;
}

/**
 * Translate a batch of texts using OpenAI
 * @param {string[]} texts - Array of texts to translate
 * @returns {Promise<{translations: string[], charCount: number}>}
 */
export async function translateWithOpenAI(texts) {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error(
      'OPENAI_API_KEY environment variable is not set. ' +
      'Get your API key from https://platform.openai.com/api-keys'
    );
  }

  if (!texts || texts.length === 0) {
    return { translations: [], charCount: 0 };
  }

  const batches = createBatches(texts);
  const allTranslations = [];
  let totalCharCount = 0;

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const batchCharCount = batch.reduce((sum, text) => sum + text.length, 0);

    console.log(`    OpenAI batch ${i + 1}/${batches.length} (${batch.length} items)...`);

    const translations = await callOpenAIAPI(batch, apiKey);
    allTranslations.push(...translations);
    totalCharCount += batchCharCount;

    if (i < batches.length - 1) {
      await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
    }
  }

  return {
    translations: allTranslations,
    charCount: totalCharCount,
  };
}
