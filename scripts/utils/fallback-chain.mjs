/**
 * Policy-Based Translation Fallback Chain
 *
 * Environment variables:
 *   TRANSLATION_ENGINE         - Primary engine: 'auto'|'gemini'|'glm'|'openai'|'google'|'mock'
 *   TRANSLATION_FALLBACK_CHAIN - Comma-separated provider order: 'gemini,glm,openai,google,mock'
 */

/**
 * Valid TRANSLATION_ENGINE values. Any other value causes an immediate error.
 */
export const VALID_ENGINES = ['auto', 'gemini', 'glm', 'openai', 'google', 'mock'];

/**
 * Parse a comma-separated fallback chain string into an array of provider names.
 *
 * @param {string|null|undefined} chainStr - e.g. "gemini,glm,openai,google,mock"
 * @returns {string[]} e.g. ['gemini', 'glm', 'openai', 'google', 'mock']
 */
export function parseFallbackChain(chainStr) {
  if (!chainStr) return [];
  return chainStr
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(s => s.length > 0);
}

/**
 * Check if a provider has the required credentials available.
 *
 * @param {string} providerName - 'gemini'|'glm'|'openai'|'google'|'mock'
 * @returns {boolean}
 */
export function isProviderAvailable(providerName) {
  switch (providerName) {
    case 'gemini':
      return !!process.env.GEMINI_API_KEY;
    case 'glm':
      return !!(process.env.GLM_API_KEY || process.env.ZAI_API_KEY);
    case 'openai':
      return !!process.env.OPENAI_API_KEY;
    case 'google':
      return !!process.env.GOOGLE_TRANSLATE_API_KEY;
    case 'mock':
      return true;
    default:
      return false;
  }
}

/**
 * Returns the default fallback chain based on available API keys.
 * If TRANSLATION_FALLBACK_CHAIN env is set, parse and return it.
 * Otherwise, build from available keys.
 *
 * @returns {string[]} Ordered list of provider names, always ending with 'mock'
 */
export function getDefaultFallbackChain() {
  if (process.env.TRANSLATION_FALLBACK_CHAIN) {
    return parseFallbackChain(process.env.TRANSLATION_FALLBACK_CHAIN);
  }

  const chain = [];
  if (isProviderAvailable('gemini')) chain.push('gemini');
  if (isProviderAvailable('glm')) chain.push('glm');
  if (isProviderAvailable('openai')) chain.push('openai');
  if (isProviderAvailable('google')) chain.push('google');
  chain.push('mock');
  return chain;
}

/**
 * Select the primary translation engine to use.
 * Replaces the existing getTranslationEngine() logic in translate.mjs.
 *
 * - If TRANSLATION_ENGINE is set to a specific engine (not 'auto'), return it
 * - If 'auto', return the first provider in the fallback chain that has credentials available
 *
 * @returns {string} Provider name
 */
export function selectPrimaryEngine() {
  const engineEnv = (process.env.TRANSLATION_ENGINE || 'auto').toLowerCase();

  if (!VALID_ENGINES.includes(engineEnv)) {
    throw new Error(
      `Invalid TRANSLATION_ENGINE="${engineEnv}". Valid values: ${VALID_ENGINES.join(', ')}`
    );
  }

  if (engineEnv !== 'auto') {
    return engineEnv;
  }

  // auto: use first available provider in the fallback chain
  const chain = getDefaultFallbackChain();
  for (const provider of chain) {
    if (isProviderAvailable(provider)) {
      return provider;
    }
  }

  return 'mock';
}

/**
 * Get the list of fallback providers to try after the primary engine fails.
 * Returns the fallback chain starting AFTER the primary engine.
 *
 * Example: primary='gemini', chain=['gemini','glm','openai','google','mock']
 *          → returns ['glm','openai','google','mock']
 *
 * If the primary engine is not found in the chain, returns the full chain.
 *
 * @param {string} primaryEngine - The primary engine that failed
 * @returns {string[]} Ordered list of fallback provider names
 */
export function getFallbackProviders(primaryEngine) {
  const chain = getDefaultFallbackChain();
  const idx = chain.indexOf(primaryEngine);
  if (idx === -1) {
    return chain;
  }
  return chain.slice(idx + 1);
}
