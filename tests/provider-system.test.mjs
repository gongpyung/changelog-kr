/**
 * Provider System Unit Tests
 * Tests for translation-provider.mjs, fallback-chain.mjs, glm-translation-client.mjs
 *
 * Node.js 20+ node:test + node:assert/strict
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildTranslationPrompt,
  parseNumberedResponse,
  createBatches,
  createMockTranslations,
  registerProvider,
  getProvider,
  getAvailableProviders,
  QuotaExhaustedError,
  PartialTranslationError,
} from '../scripts/utils/translation-provider.mjs';

import {
  VALID_ENGINES,
  parseFallbackChain,
  isProviderAvailable,
  getDefaultFallbackChain,
  selectPrimaryEngine,
  getFallbackProviders,
} from '../scripts/utils/fallback-chain.mjs';

import {
  classifyGlmError,
} from '../scripts/utils/glm-translation-client.mjs';

// ============================================================================
// Group 1: Translation Provider Shared Utilities
// ============================================================================

describe('Translation Provider: Shared Utilities', () => {
  it('buildTranslationPrompt: produces numbered entries with rules', () => {
    const prompt = buildTranslationPrompt(['Hello world', 'Fix bug']);
    assert.ok(prompt.includes('1. Hello world'), 'Should contain numbered first entry');
    assert.ok(prompt.includes('2. Fix bug'), 'Should contain numbered second entry');
    assert.ok(prompt.includes('RULES:'), 'Should contain RULES section');
    assert.ok(prompt.includes('KOREAN TRANSLATIONS:'), 'Should contain KOREAN TRANSLATIONS section');
  });

  it('parseNumberedResponse: extracts translations from numbered lines', () => {
    const input = '1. 안녕하세요\n2. 버그 수정';
    const result = parseNumberedResponse(input, 2);
    assert.deepEqual(result, ['안녕하세요', '버그 수정']);
  });

  it('parseNumberedResponse: handles fallback when count mismatch on primary parse', () => {
    // Primary parse would find numbered lines but wrong count;
    // fallback strips numbers and filters blanks — if that matches expectedCount it's used.
    const input = '안녕하세요\n버그 수정';
    const result = parseNumberedResponse(input, 2);
    // Fallback: split by newlines, filter blank, strip leading numbers → ['안녕하세요', '버그 수정']
    assert.deepEqual(result, ['안녕하세요', '버그 수정']);
  });

  it('parseNumberedResponse: returns partial when count mismatch and fallback also fails', () => {
    // Only 1 numbered line but expected 3; fallback also gives 1 line → returns partial
    const input = '1. 안녕하세요';
    const result = parseNumberedResponse(input, 3);
    assert.equal(result.length, 1);
    assert.equal(result[0], '안녕하세요');
  });

  it('createBatches: splits into correct batch sizes', () => {
    const texts = ['a', 'b', 'c', 'd', 'e'];
    const batches = createBatches(texts, 2);
    assert.equal(batches.length, 3);
    assert.deepEqual(batches[0], ['a', 'b']);
    assert.deepEqual(batches[1], ['c', 'd']);
    assert.deepEqual(batches[2], ['e']);
  });

  it('createBatches: single batch when items <= batchSize', () => {
    const texts = ['a', 'b', 'c'];
    const batches = createBatches(texts, 20);
    assert.equal(batches.length, 1);
    assert.deepEqual(batches[0], ['a', 'b', 'c']);
  });

  it('createBatches: empty input returns empty array', () => {
    const batches = createBatches([], 20);
    assert.deepEqual(batches, []);
  });

  it('createMockTranslations: returns original texts with meta', () => {
    const texts = ['Hello', 'World'];
    const result = createMockTranslations(texts);
    assert.deepEqual(result.translations, ['Hello', 'World']);
    assert.equal(result.charCount, 10); // 'Hello'.length + 'World'.length
    assert.equal(result.meta.provider, 'mock');
  });
});

// ============================================================================
// Group 2: Provider Registry
// ============================================================================

describe('Translation Provider: Registry', () => {
  it('registry: mock provider is registered by default', () => {
    const available = getAvailableProviders();
    assert.ok(available.includes('mock'), 'mock provider should be in registry');
  });

  it('registry: registerProvider adds new provider', () => {
    const testProvider = { translate: (texts) => ({ translations: texts, charCount: 0, meta: {} }) };
    registerProvider('test-provider-unique', testProvider);
    const retrieved = getProvider('test-provider-unique');
    assert.ok(retrieved !== undefined, 'Provider should be retrievable after registration');
    assert.equal(retrieved, testProvider);
  });

  it('registry: getProvider returns undefined for unknown provider', () => {
    const result = getProvider('nonexistent-provider-xyz');
    assert.equal(result, undefined);
  });
});

// ============================================================================
// Group 3: Error Classes
// ============================================================================

describe('Translation Provider: Error Classes', () => {
  it('QuotaExhaustedError: has correct properties', () => {
    const err = new QuotaExhaustedError('gemini-3-flash', 'quota exceeded');
    assert.equal(err.name, 'QuotaExhaustedError');
    assert.equal(err.model, 'gemini-3-flash');
    assert.equal(err.message, 'quota exceeded');
    assert.ok(err instanceof Error);
  });

  it('PartialTranslationError: has correct properties', () => {
    const err = new PartialTranslationError(['a', 'b'], 3);
    assert.equal(err.name, 'PartialTranslationError');
    assert.deepEqual(err.partialTranslations, ['a', 'b']);
    assert.equal(err.expectedCount, 3);
    assert.ok(err.message.includes('3'));
    assert.ok(err.message.includes('2'));
    assert.ok(err instanceof Error);
  });
});

// ============================================================================
// Group 4: Fallback Chain
// ============================================================================

describe('Fallback Chain', () => {
  // Save and restore env vars around each test
  let savedEnv;

  beforeEach(() => {
    savedEnv = {
      TRANSLATION_ENGINE: process.env.TRANSLATION_ENGINE,
      TRANSLATION_FALLBACK_CHAIN: process.env.TRANSLATION_FALLBACK_CHAIN,
      GEMINI_API_KEY: process.env.GEMINI_API_KEY,
      GLM_API_KEY: process.env.GLM_API_KEY,
      ZAI_API_KEY: process.env.ZAI_API_KEY,
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      GOOGLE_TRANSLATE_API_KEY: process.env.GOOGLE_TRANSLATE_API_KEY,
    };
    // Clear all relevant env vars before each test
    delete process.env.TRANSLATION_ENGINE;
    delete process.env.TRANSLATION_FALLBACK_CHAIN;
    delete process.env.GEMINI_API_KEY;
    delete process.env.GLM_API_KEY;
    delete process.env.ZAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.GOOGLE_TRANSLATE_API_KEY;
  });

  afterEach(() => {
    // Restore original env vars
    for (const [key, val] of Object.entries(savedEnv)) {
      if (val === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = val;
      }
    }
  });

  // parseFallbackChain
  it('parseFallbackChain: parses comma-separated string', () => {
    const result = parseFallbackChain('gemini,glm,openai,google,mock');
    assert.deepEqual(result, ['gemini', 'glm', 'openai', 'google', 'mock']);
  });

  it('parseFallbackChain: trims whitespace and lowercases', () => {
    const result = parseFallbackChain(' Gemini , GLM , OpenAI ');
    assert.deepEqual(result, ['gemini', 'glm', 'openai']);
  });

  it('parseFallbackChain: filters empty strings', () => {
    const result = parseFallbackChain('gemini,,openai,');
    assert.deepEqual(result, ['gemini', 'openai']);
  });

  it('parseFallbackChain: returns empty array for null/undefined/empty', () => {
    assert.deepEqual(parseFallbackChain(null), []);
    assert.deepEqual(parseFallbackChain(undefined), []);
    assert.deepEqual(parseFallbackChain(''), []);
  });

  // isProviderAvailable
  it('isProviderAvailable: mock is always available', () => {
    assert.equal(isProviderAvailable('mock'), true);
  });

  it('isProviderAvailable: checks correct env vars for gemini', () => {
    assert.equal(isProviderAvailable('gemini'), false);
    process.env.GEMINI_API_KEY = 'test-key';
    assert.equal(isProviderAvailable('gemini'), true);
  });

  it('isProviderAvailable: checks GLM_API_KEY for glm', () => {
    assert.equal(isProviderAvailable('glm'), false);
    process.env.GLM_API_KEY = 'test-key';
    assert.equal(isProviderAvailable('glm'), true);
  });

  it('isProviderAvailable: checks ZAI_API_KEY for glm as alternative', () => {
    assert.equal(isProviderAvailable('glm'), false);
    process.env.ZAI_API_KEY = 'test-key';
    assert.equal(isProviderAvailable('glm'), true);
  });

  it('isProviderAvailable: checks OPENAI_API_KEY for openai', () => {
    assert.equal(isProviderAvailable('openai'), false);
    process.env.OPENAI_API_KEY = 'test-key';
    assert.equal(isProviderAvailable('openai'), true);
  });

  it('isProviderAvailable: returns false for unknown provider', () => {
    assert.equal(isProviderAvailable('unknown-provider'), false);
  });

  // getDefaultFallbackChain
  it('getDefaultFallbackChain: uses TRANSLATION_FALLBACK_CHAIN env if set', () => {
    process.env.TRANSLATION_FALLBACK_CHAIN = 'openai,mock';
    const chain = getDefaultFallbackChain();
    assert.deepEqual(chain, ['openai', 'mock']);
  });

  it('getDefaultFallbackChain: auto-builds from available keys', () => {
    process.env.OPENAI_API_KEY = 'test-key';
    const chain = getDefaultFallbackChain();
    assert.ok(chain.includes('openai'), 'Should include openai when key is set');
    assert.ok(chain.includes('mock'), 'Should always include mock');
    assert.ok(!chain.includes('gemini'), 'Should not include gemini when no key');
    assert.ok(!chain.includes('glm'), 'Should not include glm when no key');
  });

  it('getDefaultFallbackChain: always ends with mock when no chain env set', () => {
    const chain = getDefaultFallbackChain();
    assert.equal(chain[chain.length - 1], 'mock');
  });

  // VALID_ENGINES
  it('VALID_ENGINES: contains all expected engine names', () => {
    assert.deepEqual(VALID_ENGINES, ['auto', 'gemini', 'glm', 'openai', 'google', 'mock']);
  });

  // selectPrimaryEngine
  it('selectPrimaryEngine: returns specific engine when TRANSLATION_ENGINE is set', () => {
    process.env.TRANSLATION_ENGINE = 'openai';
    assert.equal(selectPrimaryEngine(), 'openai');
  });

  it('selectPrimaryEngine: auto selects first available from chain', () => {
    process.env.GEMINI_API_KEY = 'test-key';
    // No TRANSLATION_ENGINE set → auto mode → first available is gemini
    const result = selectPrimaryEngine();
    assert.equal(result, 'gemini');
  });

  it('selectPrimaryEngine: falls back to mock when no keys available', () => {
    // No keys set at all → chain is ['mock'], first available is 'mock'
    const result = selectPrimaryEngine();
    assert.equal(result, 'mock');
  });

  it('selectPrimaryEngine: throws on invalid engine value', () => {
    process.env.TRANSLATION_ENGINE = 'glmm';
    assert.throws(
      () => selectPrimaryEngine(),
      (err) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes('Invalid TRANSLATION_ENGINE="glmm"'));
        assert.ok(err.message.includes('auto'));
        assert.ok(err.message.includes('gemini'));
        return true;
      }
    );
  });

  it('selectPrimaryEngine: throws on typo engine value', () => {
    process.env.TRANSLATION_ENGINE = 'opeanai';
    assert.throws(
      () => selectPrimaryEngine(),
      (err) => {
        assert.ok(err.message.includes('opeanai'));
        return true;
      }
    );
  });

  it('selectPrimaryEngine: accepts valid engine values case-insensitively', () => {
    for (const engine of VALID_ENGINES) {
      process.env.TRANSLATION_ENGINE = engine.toUpperCase();
      assert.doesNotThrow(() => selectPrimaryEngine());
    }
  });

  // Google provider
  it('isProviderAvailable: checks GOOGLE_TRANSLATE_API_KEY for google', () => {
    assert.equal(isProviderAvailable('google'), false);
    process.env.GOOGLE_TRANSLATE_API_KEY = 'test-key';
    assert.equal(isProviderAvailable('google'), true);
  });

  it('selectPrimaryEngine: returns google when TRANSLATION_ENGINE=google', () => {
    process.env.TRANSLATION_ENGINE = 'google';
    assert.equal(selectPrimaryEngine(), 'google');
  });

  it('getDefaultFallbackChain: includes google when key is available', () => {
    process.env.GOOGLE_TRANSLATE_API_KEY = 'test-key';
    const chain = getDefaultFallbackChain();
    assert.ok(chain.includes('google'), 'Should include google when key is set');
    assert.ok(chain.includes('mock'), 'Should always include mock');
  });

  // getFallbackProviders
  it('getFallbackProviders: returns providers after primary', () => {
    process.env.TRANSLATION_FALLBACK_CHAIN = 'gemini,glm,openai,mock';
    const result = getFallbackProviders('gemini');
    assert.deepEqual(result, ['glm', 'openai', 'mock']);
  });

  it('getFallbackProviders: returns full chain if primary not in chain', () => {
    process.env.TRANSLATION_FALLBACK_CHAIN = 'gemini,glm,openai,mock';
    const result = getFallbackProviders('nonexistent');
    assert.deepEqual(result, ['gemini', 'glm', 'openai', 'mock']);
  });
});

// ============================================================================
// Group 5: GLM Error Classifier
// ============================================================================

describe('GLM Error Classifier', () => {
  it('classifyGlmError: identifies quota errors (429)', () => {
    const result = classifyGlmError(429, '{"error":{"message":"rate limit"}}');
    assert.equal(result, 'quota');
  });

  it('classifyGlmError: identifies auth errors (401)', () => {
    const result = classifyGlmError(401, '{"error":{"message":"unauthorized"}}');
    assert.equal(result, 'auth');
  });

  it('classifyGlmError: identifies auth errors (403)', () => {
    const result = classifyGlmError(403, '{"error":{"message":"forbidden"}}');
    assert.equal(result, 'auth');
  });

  it('classifyGlmError: identifies server errors (500)', () => {
    assert.equal(classifyGlmError(500, ''), 'server');
  });

  it('classifyGlmError: identifies server errors (502)', () => {
    assert.equal(classifyGlmError(502, ''), 'server');
  });

  it('classifyGlmError: identifies server errors (503)', () => {
    assert.equal(classifyGlmError(503, ''), 'server');
  });

  it('classifyGlmError: identifies server errors (504)', () => {
    assert.equal(classifyGlmError(504, ''), 'server');
  });

  it('classifyGlmError: identifies model unsupported (404)', () => {
    const result = classifyGlmError(404, '{"error":{"message":"model not found"}}');
    assert.equal(result, 'model_unsupported');
  });

  it('classifyGlmError: identifies client errors (400)', () => {
    const result = classifyGlmError(400, '{"error":{"message":"bad request"}}');
    assert.equal(result, 'client');
  });

  it('classifyGlmError: detects quota from body message on non-429 status', () => {
    const body = JSON.stringify({ error: { message: 'quota exceeded' } });
    const result = classifyGlmError(200, body);
    assert.equal(result, 'quota');
  });

  it('classifyGlmError: detects model_unsupported from body on non-404 status', () => {
    const body = JSON.stringify({ error: { code: 'model_not_found' } });
    const result = classifyGlmError(200, body);
    assert.equal(result, 'model_unsupported');
  });
});
