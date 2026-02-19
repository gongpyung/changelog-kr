<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-02-18 | Updated: 2026-02-18 -->

# site/assets/

## Purpose
클라이언트 사이드 정적 자산. `app.js`와 `style.css`는 **소스 파일**이며 직접 편집 가능합니다. 해시 버전(`app.{hash}.js` 등)은 빌드 시 자동 생성됩니다.

## Key Files

| File | Description |
|------|-------------|
| `app.js` | 메인 Vanilla JS — IIFE 패턴, 필터·검색·테마·서비스 선택 |
| `style.css` | CSS 변수 기반 테마 + Tailwind CDN 보완 스타일 |
| `favicon.svg` | Neon Terminal 로고 SVG |
| `app.{hash}.js` | 캐시버스팅 해시 버전 (빌드 자동 생성, git ignore) |
| `style.{hash}.css` | 캐시버스팅 해시 버전 (빌드 자동 생성, git ignore) |

## For AI Agents

### Working In This Directory
- `app.js`와 `style.css`는 **소스 파일** — 자유롭게 편집 가능
- 해시 파일(`*.{hash}.*`)은 절대 직접 편집하지 말 것 — `npm run build`로 재생성
- 편집 후 `npm run build` 실행 → 해시 갱신됨

### Testing Requirements
```bash
npm run build    # 해시 버전 재생성 확인
# 브라우저에서 http://localhost로 직접 테스트 권장
```

### Common Patterns — app.js

**IIFE 구조:**
```js
(function() {
  'use strict';
  // 전역 상태
  let allVersions = [];
  let filteredVersions = [];
  let expandedSet = new Set();
  let manualToggleState = null; // null | true | false

  // ... 함수 정의 ...
  // ... 초기화 ...
})();
```

**tri-state 토글:**
- `null` — 기본값 (상위 5개만 펼침)
- `true` — 전체 펼침
- `false` — 전체 접기

**카테고리:** `added`, `fixed`, `improved`, `changed`, `removed`, `other`

### Common Patterns — style.css

**다크/라이트 테마 구조:**
```css
:root { --bg-primary: #0D0D0D; }           /* 다크 기본값 */
html:not(.dark) { --bg-primary: #FAFAFA; } /* 라이트 오버라이드 */
```

**필수 규칙:**
- `text-white` 단독 → `text-gray-900 dark:text-white`
- `bg-black` 단독 → `bg-white dark:bg-black`
- `html.dark` 클래스 토글로 테마 전환

## Dependencies

### Internal
- `templates/index.html.template` — `{{APP_JS_FILE}}`, `{{STYLE_CSS_FILE}}`로 참조

### External
- Tailwind CDN (인터넷 연결 필요, 로컬 빌드 불필요)

<!-- MANUAL: -->
