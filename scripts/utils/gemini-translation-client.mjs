/**
 * Gemini API Translation Client
 * Uses Google Gemini for high-quality changelog translations
 */

const API_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';
const MAX_BATCH_SIZE = 20;
const BATCH_DELAY_MS = 500;

/**
 * Build translation prompt for Gemini
 */
function buildPrompt(texts) {
  const numbered = texts.map((text, i) => `${i + 1}. ${text}`).join('\n');

  return `You are a professional translator specializing in software documentation.
Translate the following Claude Code changelog entries from English to Korean.

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
 * Call Gemini API for translation
 */
async function callGeminiAPI(texts, apiKey) {
  const prompt = buildPrompt(texts);

  const response = await fetch(`${API_ENDPOINT}?key=${apiKey}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [{
        parts: [{ text: prompt }]
      }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 4096,
      }
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();

  if (!data.candidates || !data.candidates[0]?.content?.parts?.[0]?.text) {
    throw new Error('Invalid Gemini API response format');
  }

  const responseText = data.candidates[0].content.parts[0].text;
  const translations = parseResponse(responseText, texts.length);

  if (translations.length !== texts.length) {
    console.warn(`Warning: Expected ${texts.length} translations, got ${translations.length}`);
    // Pad with original texts if needed
    while (translations.length < texts.length) {
      translations.push(texts[translations.length]);
    }
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
 * Translate a batch of texts using Gemini
 * @param {string[]} texts - Array of texts to translate
 * @returns {Promise<{translations: string[], charCount: number}>}
 */
export async function translateWithGemini(texts) {
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

  const batches = createBatches(texts);
  const allTranslations = [];
  let totalCharCount = 0;

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const batchCharCount = batch.reduce((sum, text) => sum + text.length, 0);

    console.log(`    Gemini batch ${i + 1}/${batches.length} (${batch.length} items)...`);

    const translations = await callGeminiAPI(batch, apiKey);
    allTranslations.push(...translations);
    totalCharCount += batchCharCount;

    // Rate limit delay
    if (i < batches.length - 1) {
      await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
    }
  }

  return {
    translations: allTranslations,
    charCount: totalCharCount,
  };
}
