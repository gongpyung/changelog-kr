/**
 * Fix Translation Prefixes
 *
 * Removes conventional commit prefixes from existing translation fields.
 * No API calls needed - pure regex post-processing.
 *
 * Usage:
 *   node scripts/fix-translation-prefixes.mjs          # Apply fixes
 *   DRY_RUN=true node scripts/fix-translation-prefixes.mjs  # Preview only
 */

import { readFile, writeFile, readdir } from 'fs/promises';
import { join } from 'path';

const DRY_RUN = process.env.DRY_RUN === 'true';

// English conventional commit prefix pattern
// Matches: feat:, feat(scope):, fix:, chore(scope): etc.
const EN_PREFIX = /^(feat|fix|chore|docs|test|refactor|perf|style|build|ci|revert)(\([^)]*\))?[!]?:\s*/i;

// Korean translated prefix pattern
// Matches: 기능:, 기능(scope):, 수정:, 작업(릴리스):, 버그(UX), 리팩터링: etc.
const KO_PREFIX = /^(기능|수정|작업|문서|테스트|리팩터링|리팩터|성능|버그|스타일|빌드|되돌리기)(\([^)]*\))?[!]?[:\s]+/;

// Commit hash + English prefix: "a7507ab feat(scope): description"
const HASH_EN_PREFIX = /^[0-9a-f]{6,10}\s+(feat|fix|chore|docs|test|refactor|perf|style|build|ci|revert)(\([^)]*\))?[!]?:\s*/i;

// Commit hash + Korean prefix: "c21e0b09 수정(scope): description"
const HASH_KO_PREFIX = /^[0-9a-f]{6,10}\s+(기능|수정|작업|문서|테스트|리팩터링|리팩터|성능|버그|스타일|빌드|되돌리기)(\([^)]*\))?[!]?[:\s]+/;

// Commit hash only (no prefix): "9cda5eb README.md 다시 작성"
const HASH_ONLY = /^[0-9a-f]{6,10}\s+/;

// 커밋 번호 패턴 (PR 번호 등): "#1234 ", "1234 "
const COMMIT_NUMBER = /^#?\d{4,}\s+/;

// @username 접미사 패턴: " @username", " @username-oai"
const USERNAME_SUFFIX = /\s+@[\w-]+(?:-oai)?\s*$/;

/**
 * Strip prefix from a translation string.
 * Returns the cleaned string, or the original if no prefix found.
 * Order matters: hash+prefix patterns first, then plain prefix, then hash-only last.
 * 커밋 번호와 @username 접미사도 제거합니다.
 */
export function stripPrefix(text) {
  if (!text) return text;
  const stripped = text
    .replace(HASH_EN_PREFIX, '')
    .replace(HASH_KO_PREFIX, '')
    .replace(EN_PREFIX, '')
    .replace(KO_PREFIX, '')
    .replace(HASH_ONLY, '')
    .replace(COMMIT_NUMBER, '')
    .replace(USERNAME_SUFFIX, '');
  // Capitalize first letter if it was lowercased after stripping
  if (stripped !== text && stripped.length > 0) {
    return stripped.charAt(0).toUpperCase() + stripped.slice(1);
  }
  return stripped;
}

/**
 * Process a single translation JSON file.
 * Returns { modified: boolean, fixedCount: number }
 */
async function processFile(filePath) {
  const content = await readFile(filePath, 'utf-8');
  const data = JSON.parse(content);

  if (!data.entries || !Array.isArray(data.entries)) {
    return { modified: false, fixedCount: 0 };
  }

  let fixedCount = 0;
  for (const entry of data.entries) {
    const val = entry.translated;
    if (!val) continue;
    const cleaned = stripPrefix(val);
    if (cleaned !== val) {
      if (DRY_RUN) {
        console.log(`  [DRY] ${val}`);
        console.log(`     → ${cleaned}`);
      }
      entry.translated = cleaned;
      fixedCount++;
    }
  }

  if (fixedCount > 0 && !DRY_RUN) {
    await writeFile(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
  }

  return { modified: fixedCount > 0, fixedCount };
}

/**
 * Recursively find all translation JSON files under data/services/
 */
async function findTranslationFiles(baseDir) {
  const files = [];
  const services = await readdir(baseDir);

  for (const serviceId of services) {
    const translationsDir = join(baseDir, serviceId, 'translations');
    try {
      const entries = await readdir(translationsDir);
      for (const entry of entries) {
        if (entry.endsWith('.json')) {
          files.push(join(translationsDir, entry));
        }
      }
    } catch {
      // No translations dir for this service
    }
  }

  return files;
}

async function main() {
  console.log(`Translation Prefix Fixer${DRY_RUN ? ' [DRY RUN]' : ''}\n`);

  const servicesDir = join('data', 'services');
  const files = await findTranslationFiles(servicesDir);
  console.log(`Found ${files.length} translation files\n`);

  let totalFiles = 0;
  let totalFixed = 0;

  for (const filePath of files) {
    const { modified, fixedCount } = await processFile(filePath);
    if (modified || (DRY_RUN && fixedCount > 0)) {
      const rel = filePath.replace(/\\/g, '/').replace('data/services/', '');
      console.log(`${DRY_RUN ? '[DRY] ' : '✓ '}${rel}: ${fixedCount} prefix(es) removed`);
      totalFiles++;
      totalFixed += fixedCount;
    }
  }

  console.log('\n' + '='.repeat(50));
  if (totalFixed > 0) {
    console.log(`${DRY_RUN ? 'Would fix' : 'Fixed'}: ${totalFixed} entries across ${totalFiles} files`);
    if (DRY_RUN) {
      console.log('\nRun without DRY_RUN=true to apply changes.');
    }
  } else {
    console.log('No prefixes found to remove.');
  }
  console.log('='.repeat(50));
}

// 직접 실행 시에만 main() 호출 (import 시 실행 방지)
const isMain = process.argv[1] && (
  process.argv[1].endsWith('fix-translation-prefixes.mjs') ||
  process.argv[1].replace(/\\/g, '/').endsWith('fix-translation-prefixes.mjs')
);
if (isMain) {
  main().catch(error => {
    console.error('Fatal error:', error.message);
    process.exit(1);
  });
}
