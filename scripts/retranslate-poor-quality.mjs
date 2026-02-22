/**
 * Re-translate poor quality entries
 *
 * Scans all translation files and re-translates entries where:
 * 1. translation is empty/null
 * 2. translation === original (English passed through unchanged, for non-trivial text)
 * 3. translation has no Korean characters (and isn't a known technical term)
 *
 * Usage:
 *   node scripts/retranslate-poor-quality.mjs          # Re-translate all poor entries
 *   DRY_RUN=true node scripts/retranslate-poor-quality.mjs  # Preview only
 *   SERVICE=claude-code node scripts/retranslate-poor-quality.mjs  # Single service
 */

import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { translateWithGemini, QuotaExhaustedError } from './utils/gemini-translation-client.mjs';
import { translateWithOpenAI } from './utils/openai-translation-client.mjs';
import { stripPrefix } from './fix-translation-prefixes.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');
const SERVICES_CONFIG = join(PROJECT_ROOT, 'data', 'services.json');
const SERVICES_DIR = join(PROJECT_ROOT, 'data', 'services');

const DRY_RUN = process.env.DRY_RUN === 'true';
const SERVICE_FILTER = process.env.SERVICE || null;

const GEMINI_MODELS = [
  { model: 'gemini-3-flash-preview', label: 'Gemini 3 Flash' },
  { model: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
];

/**
 * Check if text is a technical term that should NOT be translated
 */
function isTechnicalTerm(text) {
  const t = text.trim();
  if (!t) return true;

  // Git hash (bare or with message)
  if (/^[0-9a-f]{7,40}$/.test(t)) return true;
  if (/^[0-9a-f]{7,10}\s/.test(t)) return true;

  // Environment variables (ALL_CAPS)
  if (/^[A-Z][A-Z0-9_]{2,}$/.test(t)) return true;

  // Keyboard shortcuts (Ctrl-O, Alt-Tab, etc.)
  if (/^(Ctrl|Alt|Shift|Cmd|Meta)[-+]\w+$/i.test(t)) return true;

  // Single-word identifier (lowercase-start only, short)
  if (/^[a-z][a-zA-Z0-9_.-]*$/.test(t) && t.length <= 25) return true;

  // Entire text in backticks (code, file paths)
  if (/^`.+`$/.test(t)) return true;

  // @mentions, #tags
  if (/^[@#][\w/.-]+/.test(t)) return true;

  // CLI commands
  if (/^(npm|pnpm|npx|yarn|node|git|bun)\s/.test(t)) return true;

  // SHA hash strings
  if (/^SHA\d+:\s*[0-9a-f]+/i.test(t)) return true;

  // Path/command rename (a -> b)
  if (/^[\w./-]+\s*(->|→)\s*[\w./-]+$/.test(t)) return true;

  // API names (xxx/yyy API pattern)
  if (/^[\w/-]+\/[\w/-]+\s+API$/i.test(t)) return true;

  // PR references (mem v2 - PR4, PR #503)
  if (/PR\s*#?\d+/i.test(t)) return true;
  if (/^[\w\s]+v?\d[\w\s]*-\s*PR\d*$/i.test(t)) return true;

  // Language/extension lists: "TypeScript/JavaScript: `.ts`, `.tsx`"
  if (/^[\w+/#/-]+:\s*(`\.\w+`[,\s]*)+$/.test(t)) return true;

  // Language lists: "Go, Rust, Java, C/C++"
  if (/^(Go|Rust|Java|Swift|Kotlin|Ruby|PHP|C)(,\s*(Go|Rust|Java|Swift|Kotlin|Ruby|PHP|C\/C\+\+|C#|C))+$/.test(t)) return true;

  // Extension-only patterns: "Python: `.py`, `.pyw`"
  if (/^\w+:\s*`\.\w+`/.test(t)) return true;

  // Version strings like "pnpm lint", "pnpm test", "pnpm build"
  if (/^(pnpm|npm|yarn)\s+(lint|test|build|install|run)/.test(t)) return true;

  // Install commands
  if (/^npm\s+i\s+-g\s+\w+/.test(t)) return true;

  // User mentions with colon (@username:)
  if (/^@[\w-]+:/.test(t)) return true;

  // SQLite/database version references
  if (/^sqlite\s+\d+$/i.test(t)) return true;

  // Command rename patterns (/old -> /new)
  if (/^\/[\w-]+\s*->\s*\/[\w-]+$/.test(t)) return true;

  return false;
}

/**
 * Determine if an entry needs retranslation.
 * Returns reason string if yes, null if the entry is OK.
 */
function needsRetranslation(entry) {
  const val = (entry.translated || '').trim();
  const orig = (entry.original || '').trim();

  // If the original already contains Korean, it was written in Korean — no translation needed
  const origKorean = (orig.match(/[가-힣]/g) || []).length;
  if (origKorean > 0) return null;

  // Check original against technical term patterns first (applies to all cases below)
  if (isTechnicalTerm(orig)) return null;

  // Empty/null — retranslate if original has meaningful English content
  if (!val) {
    if (orig.length <= 20 || !/[a-zA-Z]{3,}/.test(orig)) return null;
    return 'empty';
  }

  // Same as original
  if (val === orig) {
    if (orig.length <= 20) return null;           // Short text
    if (!/[a-zA-Z]{3,}/.test(orig)) return null;  // No meaningful English words
    return 'same-as-original';
  }

  // No Korean characters present in translation
  const koreanChars = (val.match(/[가-힣]/g) || []).length;
  if (koreanChars === 0) {
    if (orig.length <= 20) return null; // Short text, not worth retranslating
    return 'no-korean';
  }

  return null; // OK
}

/**
 * Translate texts using Gemini model chain, falling back to OpenAI
 */
async function translateWithGeminiChain(texts, exhaustedModels) {
  for (const { model, label } of GEMINI_MODELS) {
    if (exhaustedModels.has(model)) {
      console.log(`    [${label}] Skipped (quota exhausted)`);
      continue;
    }
    try {
      const result = await translateWithGemini(texts, { model });
      return { result, usedModel: model };
    } catch (error) {
      if (error instanceof QuotaExhaustedError) {
        console.warn(`    [${label}] Quota exhausted, trying next model...`);
        exhaustedModels.add(model);
      } else {
        throw error;
      }
    }
  }
  return null;
}

/**
 * Check if translations have poor quality (>10% empty or same as original)
 */
function isPoorQuality(originals, translations) {
  const POOR_QUALITY_THRESHOLD = 0.10;
  let poor = 0;
  for (let i = 0; i < translations.length; i++) {
    const t = translations[i];
    const orig = originals[i] || '';
    if (!t || t.trim() === '') {
      poor++;
    } else if (t === orig && orig.length > 20 && /[a-zA-Z]{3,}/.test(orig)) {
      poor++;
    }
  }
  return poor / translations.length > POOR_QUALITY_THRESHOLD;
}

/**
 * Translate a batch of texts using the available engine
 * If Gemini produces poor quality, automatically retries with OpenAI
 */
async function translateTexts(texts, exhaustedModels) {
  if (process.env.GEMINI_API_KEY) {
    const r = await translateWithGeminiChain(texts, exhaustedModels);
    if (r) {
      // Quality check: if Gemini produced poor quality, retry with OpenAI
      if (isPoorQuality(texts, r.result.translations) && process.env.OPENAI_API_KEY) {
        console.log('    Gemini quality poor, retrying with OpenAI...');
        const result = await translateWithOpenAI(texts);
        return result.translations;
      }
      return r.result.translations;
    }
    // All Gemini models exhausted — fall back to OpenAI
    if (process.env.OPENAI_API_KEY) {
      console.log('    All Gemini models exhausted, falling back to OpenAI...');
      const result = await translateWithOpenAI(texts);
      return result.translations;
    }
  } else if (process.env.OPENAI_API_KEY) {
    const result = await translateWithOpenAI(texts);
    return result.translations;
  }
  console.warn('    No API key available — cannot retranslate');
  return texts; // mock fallback
}

async function main() {
  console.log(`=== Re-translate Poor Quality Entries${DRY_RUN ? ' [DRY RUN]' : ''} ===\n`);

  const config = JSON.parse(await readFile(SERVICES_CONFIG, 'utf-8'));
  const services = config.services.filter(s => s.enabled);
  const exhaustedModels = new Set();

  const engine = process.env.GEMINI_API_KEY ? 'gemini' : process.env.OPENAI_API_KEY ? 'openai' : 'mock';
  console.log(`Engine: ${engine}`);
  if (SERVICE_FILTER) console.log(`Service filter: ${SERVICE_FILTER}`);
  console.log('');

  let grandTotal = { found: 0, retranslated: 0, stillPoor: 0 };

  for (const svc of services) {
    if (SERVICE_FILTER && svc.id !== SERVICE_FILTER) continue;

    const transDir = join(SERVICES_DIR, svc.id, 'translations');
    let files;
    try {
      files = (await readdir(transDir)).filter(f => f.endsWith('.json')).sort();
    } catch {
      continue;
    }

    let svcFound = 0;
    let svcRetranslated = 0;

    for (const file of files) {
      const filePath = join(transDir, file);
      const data = JSON.parse(await readFile(filePath, 'utf-8'));

      // Find entries needing retranslation
      const toRetranslate = [];
      for (let i = 0; i < (data.entries || []).length; i++) {
        const reason = needsRetranslation(data.entries[i]);
        if (reason) {
          toRetranslate.push({ idx: i, reason });
        }
      }

      if (toRetranslate.length === 0) continue;

      svcFound += toRetranslate.length;
      grandTotal.found += toRetranslate.length;

      console.log(`  [${svc.id}/${file}] ${toRetranslate.length} entries to retranslate:`);
      for (const { idx, reason } of toRetranslate) {
        const orig = (data.entries[idx].original || '').slice(0, 70);
        console.log(`    [${reason}] "${orig}"`);
      }

      if (DRY_RUN) continue;

      // Re-translate
      const texts = toRetranslate.map(({ idx }) => data.entries[idx].original);
      let translations;
      try {
        translations = await translateTexts(texts, exhaustedModels);
      } catch (err) {
        console.error(`    Translation failed: ${err.message}`);
        continue;
      }

      // Apply translations
      let stillPoor = 0;
      for (let k = 0; k < toRetranslate.length; k++) {
        const { idx } = toRetranslate[k];
        const newTranslation = stripPrefix(translations[k] || data.entries[idx].original);
        // Check if retry improved quality
        if (newTranslation === data.entries[idx].original) {
          console.warn(`    ⚠ Still untranslated after retry: "${(newTranslation).slice(0, 60)}"`);
          stillPoor++;
          grandTotal.stillPoor++;
        }
        data.entries[idx].translated = newTranslation;
      }

      data.retranslatedAt = new Date().toISOString();
      await writeFile(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8');

      const saved = toRetranslate.length - stillPoor;
      svcRetranslated += saved;
      grandTotal.retranslated += saved;
      console.log(`    ✓ Saved ${saved} retranslations${stillPoor > 0 ? `, ${stillPoor} still poor` : ''}`);
    }

    if (svcFound > 0) {
      console.log(`  [${svc.id}] found=${svcFound}, retranslated=${svcRetranslated}\n`);
    }
  }

  console.log('='.repeat(60));
  if (DRY_RUN) {
    console.log(`DRY RUN: would retranslate ${grandTotal.found} entries across all services`);
    console.log(`Run without DRY_RUN=true to apply changes.`);
  } else {
    console.log(`Total: found=${grandTotal.found}, retranslated=${grandTotal.retranslated}, still-poor=${grandTotal.stillPoor}`);
  }
  console.log('='.repeat(60));
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
