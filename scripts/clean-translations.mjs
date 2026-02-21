#!/usr/bin/env node
/**
 * clean-translations.mjs
 *
 * 번역 파일 일괄 정리 스크립트
 * - CLA, Merge, 기여자 감사, 단독 @username 항목 삭제
 * - prefix 제거 (커밋번호 #NNNNN, 영문/한국어 conventional commit prefix, 커밋 해시)
 * - @username 접미사 제거
 * - 번역문에서도 동일하게 정리
 */

import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const PROJECT_ROOT = resolve(import.meta.dirname, '..');
const DATA_DIR = join(PROJECT_ROOT, 'data', 'services');

// 영문 conventional commit prefix 목록
const EN_PREFIXES = [
  'feat', 'fix', 'chore', 'docs', 'style', 'refactor', 'perf', 'test',
  'build', 'ci', 'revert', 'wip', 'nit', 'clean', 'update', 'add', 'remove',
  'bump', 'release', 'merge', 'hotfix', 'security', 'deprecate', 'breaking'
];

// 한국어 conventional commit prefix 목록
const KO_PREFIXES = [
  '기능', '수정', '작업', '문서', '스타일', '리팩터', '리팩토링', '성능',
  '테스트', '빌드', '배포', '되돌리기', '사소한 수정', '정리', '업데이트',
  '추가', '제거', '보안', '핫픽스'
];

/**
 * entry에서 번역문 필드값을 가져옴 (translated 필드 사용)
 */
function getTranslation(entry) {
  return entry.translated || '';
}

/**
 * 항목을 삭제해야 하는지 판단
 */
function shouldDelete(entry) {
  const orig = (entry.original || '').trim();
  const trans = getTranslation(entry).trim();

  // 단독 @username 항목 (원본이 @username만 있는 경우)
  if (/^@\w[\w-]*$/.test(orig)) return true;

  // 단독 @username 항목 (번역도 @username만 있는 경우)
  if (/^@\w[\w-]*[:\s]*$/.test(trans)) return true;

  // CLA 관련 항목
  if (/\bCLA\b/i.test(orig) || /contributor license agreement/i.test(orig)) return true;
  if (/signed the CLA|CLA에 서명/i.test(orig) || /signed the CLA|CLA에 서명/i.test(trans)) return true;

  // Merge 커밋 항목
  if (/^Merge (pull request|branch|remote-tracking)/i.test(orig)) return true;
  if (/^Merge #\d+/i.test(orig)) return true;
  if (/풀 리퀘스트.*병합|^Merge branch/i.test(trans)) return true;

  // 기여자 감사 항목
  if (/thank.*(contributor|you)|contributor.*(thank)/i.test(orig)) return true;
  if (/first contribution|첫 기여/i.test(orig) || /first contribution|첫 기여/i.test(trans)) return true;
  if (/기여자.*감사|감사.*기여자/i.test(trans)) return true;

  return false;
}

/**
 * 텍스트에서 #NNNNN 커밋 번호 prefix 제거
 * 예: "#11383 Do not resend..." → "Do not resend..."
 */
function removeHashPrefix(text) {
  // #숫자 로 시작하는 경우 제거
  return text.replace(/^#\d+\s+/, '');
}

/**
 * 텍스트에서 영문 conventional commit prefix 제거
 * 예: "feat: support multiple rate limits" → "support multiple rate limits"
 * 예: "feat(core): promote..." → "promote..."
 */
function removeEnConventionalPrefix(text) {
  const prefixPattern = new RegExp(
    `^(${EN_PREFIXES.join('|')})(\\([^)]*\\))?!?:\\s*`,
    'i'
  );
  return text.replace(prefixPattern, '');
}

/**
 * 텍스트에서 한국어 conventional commit prefix 제거
 * 예: "기능: 여러 속도 제한 지원" → "여러 속도 제한 지원"
 * 예: "수정(tui): ..." → "..."
 */
function removeKoConventionalPrefix(text) {
  const prefixPattern = new RegExp(
    `^(${KO_PREFIXES.join('|')})(\\([^)]*\\))?!?[:\\s：]\\s*`,
    'i'
  );
  return text.replace(prefixPattern, '');
}

/**
 * 텍스트에서 @username 접미사 제거
 * 예: "기능: 메모리 읽기 경로 @jif-oai" → "기능: 메모리 읽기 경로"
 */
function removeUsernameSuffix(text) {
  return text.replace(/\s+@[\w][\w.-]*$/, '').trim();
}

/**
 * 40자 SHA 커밋 해시 제거 (텍스트 내 잔존)
 */
function removeCommitHash(text) {
  return text.replace(/\b[0-9a-f]{40}\b/gi, '').replace(/\s{2,}/g, ' ').trim();
}

/**
 * 번역 항목 텍스트 정리 (original, translated 모두 적용)
 */
function cleanText(text) {
  if (!text) return text;
  let t = text.trim();
  // 1. #NNNNN prefix 제거
  t = removeHashPrefix(t);
  // 2. 영문 conventional commit prefix 제거
  t = removeEnConventionalPrefix(t);
  // 3. @username 접미사 제거
  t = removeUsernameSuffix(t);
  // 4. 40자 커밋 해시 제거
  t = removeCommitHash(t);
  return t.trim();
}

/**
 * 번역문(translated) 전용 정리
 */
function cleanTranslated(text) {
  if (!text) return text;
  let t = text.trim();
  // 1. #NNNNN prefix 제거
  t = removeHashPrefix(t);
  // 2. 한국어 conventional commit prefix 제거
  t = removeKoConventionalPrefix(t);
  // 3. 영문 conventional commit prefix 제거 (번역이 영문 prefix를 그대로 둔 경우)
  t = removeEnConventionalPrefix(t);
  // 4. @username 접미사 제거
  t = removeUsernameSuffix(t);
  // 5. 40자 커밋 해시 제거
  t = removeCommitHash(t);
  return t.trim();
}

/**
 * 서비스 번역 파일 디렉토리 목록 반환
 */
async function getServiceIds() {
  const entries = await readdir(DATA_DIR, { withFileTypes: true });
  return entries
    .filter(e => e.isDirectory())
    .map(e => e.name);
}

/**
 * 번역 파일 목록 반환
 */
async function getTranslationFiles(serviceId) {
  const dir = join(DATA_DIR, serviceId, 'translations');
  try {
    const files = await readdir(dir);
    return files
      .filter(f => f.endsWith('.json'))
      .map(f => join(dir, f));
  } catch {
    return [];
  }
}

/**
 * 단일 번역 파일 정리
 */
async function cleanFile(filePath) {
  const raw = await readFile(filePath, 'utf-8');
  const data = JSON.parse(raw);

  if (!Array.isArray(data.entries) || data.entries.length === 0) {
    return { filePath, deleted: 0, cleaned: 0, total: 0, skipped: true };
  }

  const originalCount = data.entries.length;
  let deletedCount = 0;
  let cleanedCount = 0;

  // 삭제 대상 필터링
  const filtered = data.entries.filter(entry => {
    if (shouldDelete(entry)) {
      deletedCount++;
      return false;
    }
    return true;
  });

  // 각 항목 정리
  const cleaned = filtered.map(entry => {
    const origOriginal = entry.original;
    const origTranslated = entry.translated;

    const newOriginal = cleanText(entry.original);
    const newTranslated = cleanTranslated(origTranslated);

    if (newOriginal !== origOriginal || newTranslated !== origTranslated) {
      cleanedCount++;
    }

    const result = { ...entry, original: newOriginal, translated: newTranslated };
    return result;
  });

  // 변경사항이 있을 때만 파일 저장
  if (deletedCount > 0 || cleanedCount > 0) {
    const newData = { ...data, entries: cleaned };
    await writeFile(filePath, JSON.stringify(newData, null, 2) + '\n', 'utf-8');
  }

  return {
    filePath,
    total: originalCount,
    deleted: deletedCount,
    cleaned: cleanedCount,
    skipped: false,
  };
}

/**
 * 메인 실행
 */
async function main() {
  console.log('번역 파일 정리 시작...\n');

  const serviceIds = await getServiceIds();
  let totalFiles = 0;
  let totalDeleted = 0;
  let totalCleaned = 0;
  let totalEntries = 0;

  for (const serviceId of serviceIds) {
    const files = await getTranslationFiles(serviceId);
    if (files.length === 0) continue;

    let svcDeleted = 0;
    let svcCleaned = 0;
    let svcEntries = 0;

    for (const filePath of files) {
      const result = await cleanFile(filePath);
      if (!result.skipped) {
        totalFiles++;
        svcDeleted += result.deleted;
        svcCleaned += result.cleaned;
        svcEntries += result.total;
        totalDeleted += result.deleted;
        totalCleaned += result.cleaned;
        totalEntries += result.total;

        if (result.deleted > 0 || result.cleaned > 0) {
          const fname = filePath.split(/[\\/]/).pop();
          console.log(`  [${serviceId}] ${fname}: 삭제 ${result.deleted}, 정리 ${result.cleaned} / ${result.total}`);
        }
      }
    }

    if (svcDeleted > 0 || svcCleaned > 0) {
      console.log(`→ ${serviceId}: 총 삭제 ${svcDeleted}, 정리 ${svcCleaned} / ${svcEntries} 항목\n`);
    } else {
      console.log(`→ ${serviceId}: 변경 없음 (${files.length}개 파일)\n`);
    }
  }

  console.log('='.repeat(60));
  console.log(`정리 완료:`);
  console.log(`  처리 파일: ${totalFiles}개`);
  console.log(`  전체 항목: ${totalEntries}개`);
  console.log(`  삭제 항목: ${totalDeleted}개`);
  console.log(`  정리 항목: ${totalCleaned}개`);
}

main().catch(err => {
  console.error('오류:', err);
  process.exit(1);
});
