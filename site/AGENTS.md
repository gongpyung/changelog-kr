<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-02-18 | Updated: 2026-02-18 -->

# site/

## Purpose
GitHub Pages로 배포되는 정적 사이트 빌드 결과물. `npm run build` (`scripts/build-site.mjs`)가 자동 생성합니다. **이 폴더의 파일을 직접 편집하지 마세요.**

## Key Files

| File | Description |
|------|-------------|
| `index.html` | 빌드 결과 HTML (직접 편집 X → `templates/index.html.template` 수정) |
| `assets/app.js` | Vanilla JS IIFE — 필터링·검색·테마·서비스 선택 로직 |
| `assets/style.css` | CSS 변수 + Tailwind CDN 스타일 |
| `assets/favicon.svg` | Neon Terminal 로고 |
| `assets/app.{hash}.js` | 캐시버스팅용 해시 버전 (빌드 시 자동 생성) |
| `assets/style.{hash}.css` | 캐시버스팅용 해시 버전 (빌드 시 자동 생성) |

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `assets/` | JS·CSS·SVG 정적 자산 (see `assets/AGENTS.md`) |
| `data/` | 서비스 메타데이터 및 통합 번역 JSON (see `data/AGENTS.md`) |

## For AI Agents

### Working In This Directory
- **직접 편집 금지**: `index.html`, `data/*.json` — 빌드 결과물
- `assets/app.js`와 `assets/style.css`는 **소스 파일** — 직접 편집 가능
- `app.js` 또는 `style.css` 수정 후 `npm run build`로 해시 버전 재생성 필요
- 다크/라이트 테마: `html.dark` 클래스 토글 방식, `text-gray-900 dark:text-white` 패턴 필수

### Testing Requirements
```bash
npm run build    # 전체 사이트 재빌드 후 브라우저에서 확인
```

### Common Patterns
- **테마 규칙**: `text-white` 단독 사용 금지 → `text-gray-900 dark:text-white`
- **JS 상태**: `allVersions`, `filteredVersions`, `expandedSet`, `manualToggleState`
- **tri-state 토글**: `manualToggleState` = null(기본) | true(전체 펼침) | false(전체 접기)
- **카테고리**: `added`, `fixed`, `improved`, `changed`, `removed`, `other`

## Dependencies

### Internal
- `templates/index.html.template` — HTML 소스 (빌드 입력)
- `data/services/{id}/translations/*.json` — 번역 데이터 (빌드 입력)

### External
- Tailwind CDN — CSS 유틸리티 클래스 (로컬 빌드 불필요)

<!-- MANUAL: -->
