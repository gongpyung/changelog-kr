#!/usr/bin/env node
/**
 * audit-translations.mjs
 * 전수 감사: 모든 번역 파일에서 문제 항목을 탐지
 */
import fs from 'node:fs/promises';
import path from 'node:path';

const DATA_DIR = path.resolve('data/services');

// --- 탐지 패턴 ---
const EN_PREFIX = /^(feat|fix|chore|docs|test|refactor|perf|style|build|ci|revert)(\([^)]*\))?[!]?:\s*/i;
const KO_PREFIX = /^(기능|수정|작업|문서|테스트|리팩터링|리팩터|성능|버그|스타일|빌드|되돌리기)(\([^)]*\))?[!]?[:\s]+/;
const HASH_EN_PREFIX = /^#?\d{4,}\s+(feat|fix|chore|docs|test|refactor|perf|style|build|ci|revert)(\([^)]*\))?[!]?:\s*/i;
const HASH_KO_PREFIX = /^#?\d{4,}\s+(기능|수정|작업|문서|테스트|리팩터링|리팩터|성능|버그|스타일|빌드|되돌리기)(\([^)]*\))?[!]?[:\s]+/;
const HASH_ONLY_PREFIX = /^[0-9a-f]{6,10}\s+/;
const HASH_NUM_PREFIX = /^#\d{4,}\s+/;
const CLA_PATTERN = /signed the CLA|CLA에 서명/i;
const MERGE_PATTERN = /^Merge pull request|풀 리퀘스트.*병합|^Merge branch/i;
const CONTRIBUTOR_PATTERN = /first contribution|첫 기여/i;
const USERNAME_ONLY = /^@\w+[:\s]*$/;
const HAS_KOREAN = /[가-힣]/;

// 번역 불필요한 기술 용어 패턴 (파일경로, 명령어, 단축키, API명, 언어 목록, 코드 등)
const TECH_TERM_ONLY = /^(`[^`]+`|[a-z]+\s+[a-z]+|pnpm\s|npm\s|Ctrl[-+][A-Z]|PR\s?#\d+|[A-Z_]{2,}\s*$|@\w+\s*\(|TypeScript|Python:|Go,\s*Rust|\/\w+.*->.*\/\w+|[a-z]+\/[a-z]+\s+API$|sqlite\s+\d+)/i;
// SHA256 해시 패턴
const SHA256_PATTERN = /^SHA256:/;
// 원문이 이미 한국어인 경우
const ORIGINAL_IS_KOREAN = /[가-힣]/;
// contributor 항목 (@username (Name) 패턴)
const CONTRIBUTOR_NAME = /^@\w+\s+\(/;

function detectIssues(entry) {
  const issues = [];
  const { original, translated, category } = entry;

  if (!translated || !original) return issues;

  // 커밋 해시로 시작하는 항목 (oh-my-opencode 스타일)
  const hasCommitHash = /^[0-9a-f]{6,10}\s+/.test(original);
  // 기술 용어만 있는 항목은 번역 불필요 (false positive 제외)
  // 백틱으로 시작하는 코드 스니펫이나 기술 언어 목록은 길이 제한 없이 제외
  const startsWithBacktick = original.trim().startsWith('`');
  const startsWithTechLang = /^(TypeScript|JavaScript|Python|Go,\s*Rust|sqlite)/i.test(original.trim());
  const isTechTermOnly = (original.length <= 60 || startsWithBacktick || startsWithTechLang) && TECH_TERM_ONLY.test(original.trim());
  // SHA256, contributor, 원문이 이미 한국어인 경우 번역 불필요
  const isNotTranslatable = SHA256_PATTERN.test(original) || ORIGINAL_IS_KOREAN.test(original) || CONTRIBUTOR_NAME.test(original);

  // 1. 미번역 (original === translated)
  if (original.trim() === translated.trim() && !isTechTermOnly && !isNotTranslatable) {
    issues.push({ type: 'untranslated', detail: '원문과 번역이 동일' });
  }
  // 1b. 번역에 한글이 없음 (영문 그대로일 가능성, 커밋 해시 포함 항목 제외)
  else if (!HAS_KOREAN.test(translated) && original.length > 20 && !isTechTermOnly && !isNotTranslatable && !hasCommitHash) {
    issues.push({ type: 'untranslated', detail: '번역에 한글 없음' });
  }

  // 2. 영문 prefix in translated
  if (EN_PREFIX.test(translated)) {
    issues.push({ type: 'en_prefix', detail: `영문 prefix: ${translated.match(EN_PREFIX)[0].trim()}` });
  }

  // 3. 한국어 prefix in translated
  if (KO_PREFIX.test(translated)) {
    issues.push({ type: 'ko_prefix', detail: `한국어 prefix: ${translated.match(KO_PREFIX)[0].trim()}` });
  }

  // 4. 커밋해시+prefix (original or translated)
  if (HASH_EN_PREFIX.test(translated) || HASH_KO_PREFIX.test(translated)) {
    issues.push({ type: 'hash_prefix', detail: '커밋번호+prefix 패턴' });
  }
  if (HASH_EN_PREFIX.test(original) || HASH_NUM_PREFIX.test(original)) {
    // original에 hash prefix가 있으면 translated에도 남아있을 가능성
    if (HASH_ONLY_PREFIX.test(translated) || HASH_NUM_PREFIX.test(translated)) {
      issues.push({ type: 'hash_in_translation', detail: '커밋 해시가 번역에 잔존' });
    }
  }

  // 5. CLA 서명
  if (CLA_PATTERN.test(original) || CLA_PATTERN.test(translated)) {
    issues.push({ type: 'cla_entry', detail: 'CLA 서명 항목' });
  }

  // 6. Merge 커밋
  if (MERGE_PATTERN.test(original) || MERGE_PATTERN.test(translated)) {
    issues.push({ type: 'merge_entry', detail: 'Merge 커밋 항목' });
  }

  // 7. 기여자 감사
  if (CONTRIBUTOR_PATTERN.test(original) || CONTRIBUTOR_PATTERN.test(translated)) {
    issues.push({ type: 'contributor_entry', detail: '기여자 감사 항목' });
  }

  // 8. 단독 @username
  if (USERNAME_ONLY.test(original) || USERNAME_ONLY.test(translated)) {
    issues.push({ type: 'username_only', detail: '단독 @username 항목' });
  }

  // 9. 불완전 번역 (원문 대비 30% 미만 길이)
  // 단, 원문 500자 초과이거나 커밋 해시로 시작하면 요약 번역으로 간주하여 제외
  if (translated.length < original.length * 0.3 && original.length > 50 && original.length <= 500 && !hasCommitHash && HAS_KOREAN.test(translated)) {
    issues.push({ type: 'incomplete', detail: `불완전 번역 (${translated.length}/${original.length} chars)` });
  }

  return issues;
}

async function auditService(serviceId) {
  const transDir = path.join(DATA_DIR, serviceId, 'translations');
  let files;
  try {
    files = (await fs.readdir(transDir)).filter(f => f.endsWith('.json'));
  } catch {
    return { serviceId, versions: 0, totalEntries: 0, issues: [] };
  }

  const allIssues = [];
  let totalEntries = 0;

  for (const file of files) {
    const filePath = path.join(transDir, file);
    const data = JSON.parse(await fs.readFile(filePath, 'utf-8'));
    const version = data.version || file.replace('.json', '');
    const entries = data.entries || [];
    totalEntries += entries.length;

    for (let i = 0; i < entries.length; i++) {
      const entry = {
        original: entries[i].original || entries[i].text || '',
        translated: entries[i].translated || entries[i].translation || '',
        category: entries[i].category || 'other',
      };
      const issues = detectIssues(entry);
      if (issues.length > 0) {
        allIssues.push({
          service: serviceId,
          version,
          file: file,
          index: i,
          original: entry.original.substring(0, 100),
          translated: entry.translated.substring(0, 100),
          category: entry.category,
          issues: issues.map(iss => `${iss.type}: ${iss.detail}`),
        });
      }
    }
  }

  return { serviceId, versions: files.length, totalEntries, issues: allIssues };
}

async function main() {
  const services = await fs.readdir(DATA_DIR);
  const results = [];

  for (const svc of services) {
    const stat = await fs.stat(path.join(DATA_DIR, svc));
    if (!stat.isDirectory()) continue;
    const result = await auditService(svc);
    results.push(result);
  }

  // Summary
  console.log('\n=== 번역 전수 감사 결과 ===\n');

  let grandTotalEntries = 0;
  let grandTotalIssues = 0;

  for (const r of results) {
    grandTotalEntries += r.totalEntries;
    grandTotalIssues += r.issues.length;
    console.log(`[${r.serviceId}] ${r.versions}개 버전, ${r.totalEntries}개 항목, ${r.issues.length}개 문제`);
  }
  console.log(`\n총합: ${grandTotalEntries}개 항목 중 ${grandTotalIssues}개 문제 발견\n`);

  // Issue type breakdown
  const typeCounts = {};
  for (const r of results) {
    for (const issue of r.issues) {
      for (const iss of issue.issues) {
        const type = iss.split(':')[0];
        typeCounts[type] = (typeCounts[type] || 0) + 1;
      }
    }
  }

  console.log('--- 문제 유형별 집계 ---');
  for (const [type, count] of Object.entries(typeCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${type}: ${count}건`);
  }
  console.log('');

  // Per-service detail
  for (const r of results) {
    if (r.issues.length === 0) continue;

    // Group by version
    const byVersion = {};
    for (const issue of r.issues) {
      if (!byVersion[issue.version]) byVersion[issue.version] = [];
      byVersion[issue.version].push(issue);
    }

    console.log(`\n--- ${r.serviceId} 상세 ---`);
    for (const [version, issues] of Object.entries(byVersion)) {
      console.log(`  v${version} (${issues.length}건):`);
      for (const iss of issues) {
        console.log(`    [${iss.category}] ${iss.issues.join(' | ')}`);
        console.log(`      원문: ${iss.original}`);
        if (iss.translated !== iss.original) {
          console.log(`      번역: ${iss.translated}`);
        }
      }
    }
  }

  // Write JSON report
  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      totalEntries: grandTotalEntries,
      totalIssues: grandTotalIssues,
      typeCounts,
    },
    services: results.map(r => ({
      serviceId: r.serviceId,
      versions: r.versions,
      totalEntries: r.totalEntries,
      issueCount: r.issues.length,
      issues: r.issues,
    })),
  };

  await fs.writeFile('audit-report.json', JSON.stringify(report, null, 2));
  console.log('\n상세 리포트: audit-report.json');
}

main().catch(console.error);
