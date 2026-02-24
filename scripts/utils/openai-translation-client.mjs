/**
 * OpenAI API Translation Client
 * Uses GPT-4o for high-quality changelog translations
 */

import {
  buildTranslationPrompt,
  parseNumberedResponse,
  createBatches,
  PartialTranslationError,
  registerProvider,
} from './translation-provider.mjs';

const API_ENDPOINT = 'https://api.openai.com/v1/chat/completions';
const MODEL = process.env.OPENAI_MODEL || 'gpt-4o';
const BATCH_DELAY_MS = 300;

// buildPrompt, parseResponse, createBatches are now shared via translation-provider.mjs

/**
 * Call OpenAI API for translation
 */
async function callOpenAIAPI(texts, apiKey) {
  const prompt = buildTranslationPrompt(texts);

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
  const translations = parseNumberedResponse(responseText, texts.length);

  if (translations.length !== texts.length) {
    throw new PartialTranslationError(translations, texts.length);
  }

  return translations;
}

// createBatches is now shared via translation-provider.mjs

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
    return { translations: [], charCount: 0, meta: { provider: 'openai', model: MODEL, endpointType: 'openai-compatible' } };
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
    meta: { provider: 'openai', model: MODEL, endpointType: 'openai-compatible' },
  };
}

// Register as a provider
registerProvider('openai', { translate: translateWithOpenAI });
