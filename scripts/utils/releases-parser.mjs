/**
 * GitHub Releases API 파서
 *
 * GitHub Releases API에서 릴리스 정보를 가져와 changelog-parser.mjs와 동일한 형식으로 변환합니다.
 *
 * 주요 기능:
 * - GitHub API를 통한 릴리스 정보 조회 (인증 불필요, 공개 저장소)
 * - draft/prerelease/excludePattern 기반 필터링
 * - "What's Changed" PR 목록 파싱
 * - 태그 이름 정규화 (rust-v, v, plain 접두사 처리)
 * - changelog-parser.mjs와 동일한 인터페이스 반환
 */

/**
 * 태그를 semver 버전 문자열로 정규화
 *
 * 처리 가능한 형식:
 * - "v1.0.0" -> "1.0.0"
 * - "rust-v0.99.0-alpha.4" -> "0.99.0-alpha.4"
 * - "release-1.0.0" -> "1.0.0"
 * - "1.0.0" -> "1.0.0"
 *
 * @param {string} tagName - Git 태그 이름
 * @returns {string} 정규화된 버전 문자열
 */
export function normalizeTagToVersion(tagName) {
  const match = tagName.match(/v?(\d+\.\d+\.\d+(?:-[a-z0-9.]+)?)/i);
  return match ? match[1] : tagName;
}

/**
 * 키워드 기반 카테고리 분류 (내부 헬퍼)
 * @param {string} lower - 소문자로 변환된 텍스트
 * @returns {string} 카테고리
 */
function classifyByKeyword(lower) {
  if (lower.startsWith('feat') || lower.startsWith('add') || lower.startsWith('new')) return 'added';
  if (lower.startsWith('fix') || lower.includes('bug')) return 'fixed';
  if (lower.startsWith('perf') || lower.startsWith('refactor') || lower.startsWith('improve') || lower.startsWith('enhance')) return 'improved';
  if (lower.startsWith('update') || lower.startsWith('change') || lower.startsWith('rename') || lower.startsWith('chore')) return 'changed';
  if (lower.startsWith('remove') || lower.startsWith('deprecate')) return 'removed';
  return 'other';
}

/**
 * 릴리스 본문에서 엔트리 카테고리 추론 (Two-Phase Bold Label 알고리즘)
 *
 * Phase 0: 커밋 해시 접두사 제거
 * Phase 1: Bold 레이블 추출 → 레이블 자체로 분류 시도 → 실패 시 나머지 텍스트로 재시도
 * Phase 2: 기존 키워드 매칭 (bold가 없는 경우)
 *
 * @param {string} text - 릴리스 엔트리 내용
 * @returns {string} 엔트리 카테고리 (added, fixed, improved, changed, removed, other)
 */
export function inferCategory(text) {
  // Phase 0: 커밋 해시 접두사 제거
  const stripped = text.replace(/^[0-9a-f]{7,40}\s+/, '');

  // Phase 1: Bold 레이블 추출 및 레이블 자체로 분류 시도
  const boldMatch = stripped.match(/^\*\*([^*]+)\*\*\s*:?\s*/);
  if (boldMatch) {
    const label = boldMatch[1].toLowerCase();
    const labelResult = classifyByKeyword(label);
    if (labelResult !== 'other') return labelResult;
    const remainder = stripped.slice(boldMatch[0].length);
    if (remainder.trim()) {
      const remainderResult = classifyByKeyword(remainder.toLowerCase());
      if (remainderResult !== 'other') return remainderResult;
    }
    return 'other';
  }

  // Phase 2: 기존 키워드 매칭
  return classifyByKeyword(stripped.toLowerCase());
}

/**
 * Keep a Changelog 형식 섹션 헤딩을 카테고리로 매핑
 *
 * changelog-parser.mjs의 mapSectionToCategory()와 동일한 매핑 규칙을 사용합니다.
 *
 * @param {string} headingText - 섹션 헤딩 텍스트 (예: "Added", "Fixed")
 * @returns {string|null} 카테고리 (added, fixed, improved, changed, removed) 또는 null (알 수 없는 헤딩)
 */
function mapSectionHeading(headingText) {
  const normalized = headingText.toLowerCase().trim();

  if (normalized === 'added' || normalized === 'new' || normalized === "what's new") return 'added';
  if (normalized === 'fixed' || normalized === 'bug fixes') return 'fixed';
  if (normalized === 'changed' || normalized === "what's changed") return 'changed';
  if (normalized === 'removed') return 'removed';
  if (normalized === 'deprecated') return 'removed';
  if (normalized === 'improved' || normalized === 'performance') return 'improved';
  if (normalized === 'breaking changes' || normalized === 'refactored' || normalized === 'security') return 'changed';

  return null; // 알 수 없는 헤딩 → inferCategory() 폴백
}

/**
 * 릴리스 본문 "What's Changed" 섹션을 엔트리 배열로 파싱
 *
 * GitHub 자동 생성 릴리스 노트 형식을 처리합니다:
 * - "* PR title by @author in https://..." 패턴
 * - 일반 리스트 항목 (단, "Full Changelog", "New Contributors" 제외)
 * - Keep a Changelog 형식 섹션 헤딩 (### Added, ### Fixed 등)
 *
 * changelog-parser.mjs와 호환되는 형식을 반환합니다.
 *
 * @param {string} body - 릴리스 본문
 * @returns {Array<{text: string, scope: string|null, category: string, raw: string}>} 파싱된 엔트리 배열
 */
export function parseReleaseBody(body) {
  if (!body || !body.trim()) return [];

  const entries = [];
  const lines = body.split(/\r?\n/);
  let currentSectionCategory = null;

  for (const line of lines) {
    // 섹션 헤딩 감지 (### Added, ### Fixed 등)
    const sectionMatch = line.match(/^###\s+(.+)$/);
    if (sectionMatch) {
      currentSectionCategory = mapSectionHeading(sectionMatch[1]);
      continue;
    }

    // PR 패턴: "* PR title by @author in https://..."
    const prMatch = line.match(/^\*\s+(.+?)\s+by\s+@\S+\s+in\s+https:\/\/.+$/);
    if (prMatch) {
      const raw = line.trim().replace(/^\*\s+/, '');
      const text = prMatch[1].trim();
      entries.push({
        text,
        scope: null, // GitHub releases don't have scope tags by default
        category: currentSectionCategory || inferCategory(text),
        raw
      });
      continue;
    }

    // 일반 리스트 항목 ("Full Changelog", "New Contributors" 링크 제외)
    const listMatch = line.match(/^[-*]\s+(.+)$/);
    if (listMatch && !line.includes('**Full Changelog**') && !line.includes('New Contributors')) {
      let text = listMatch[1].trim();

      // CLA 서명 항목 필터
      if (/@\S+\s+has signed the CLA/i.test(text)) continue;

      // Merge 커밋 필터
      if (/^Merge pull request #\d+/i.test(text)) continue;
      if (/^Merge branch\s/i.test(text)) continue;

      // 기여자 감사 항목 필터
      if (/made their first contribution/i.test(text)) continue;

      // 단독 @username 항목 필터
      if (/^@\w+[:\s]*$/.test(text)) continue;

      // @username 접미사 제거
      text = text.replace(/\s+@[\w-]+\s*$/, '').trim();

      entries.push({
        text,
        scope: null,
        category: currentSectionCategory || inferCategory(text),
        raw: text
      });
    }
  }

  return entries;
}

/**
 * GitHub Releases API에서 릴리스 정보를 가져와 파싱
 *
 * @param {Object} source - 소스 설정
 * @param {string} source.owner - 저장소 소유자
 * @param {string} source.repo - 저장소 이름
 * @param {boolean} [source.includePrerelease=true] - 프리릴리스 포함 여부
 * @param {string|null} [source.excludePattern=null] - 제외할 태그 패턴 (예: "nightly")
 * @returns {Promise<{versions: Array<{version: string, date: string|null, entries: Array}>}>}
 *
 * @example
 * const result = await fetchAndParseReleases({
 *   owner: 'astral-sh',
 *   repo: 'ruff',
 *   includePrerelease: false,
 *   excludePattern: 'nightly'
 * });
 * // result.versions[0] = { version: '0.27.2', date: '2024-01-15', entries: [...] }
 *
 * @note
 * 현재 구현은 per_page=100으로 제한됩니다.
 * 고빈도 nightly 릴리스를 하는 저장소의 경우 오래된 stable 릴리스를 놓칠 수 있습니다.
 * 향후 개선: Link 헤더를 통한 페이지네이션 지원
 */
export async function fetchAndParseReleases(source) {
  const { owner, repo, includePrerelease = true, excludePattern = null } = source;

  const url = `https://api.github.com/repos/${owner}/${repo}/releases?per_page=100`;
  const response = await fetch(url, {
    headers: {
      'Accept': 'application/vnd.github+json',
      'User-Agent': 'changelog-kr'
    }
  });

  if (!response.ok) {
    console.warn(`Failed to fetch releases for ${owner}/${repo}: ${response.status}`);
    return { versions: [] };
  }

  const releases = await response.json();

  // 필터링: draft, prerelease, excludePattern
  const filtered = releases.filter(release => {
    if (release.draft) return false;
    if (!includePrerelease && release.prerelease) return false;
    if (excludePattern && release.tag_name.includes(excludePattern)) return false;
    return true;
  });

  // changelog-parser.mjs 인터페이스와 동일한 형식으로 변환
  const versions = filtered.map(release => {
    const entries = parseReleaseBody(release.body || '');
    return {
      version: normalizeTagToVersion(release.tag_name),
      date: release.published_at?.split('T')[0] || null,
      entries,
      entryCount: entries.length
    };
  });

  return { versions };
}
