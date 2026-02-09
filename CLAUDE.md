# ChangeLog.kr - Project Guide

AI 도구들의 Changelog를 한국어로 번역/표시하는 정적 사이트 (https://changelog.kr)

## Project Structure

```
changelog-kr/
├── site/                          # 정적 사이트 (GitHub Pages로 배포)
│   ├── index.html                 # 빌드 결과물 (직접 편집 X)
│   ├── assets/
│   │   ├── app.js                 # 클라이언트 JS (vanilla JS, IIFE)
│   │   ├── style.css              # 스타일 (CSS 변수 + Tailwind CDN)
│   │   └── favicon.svg
│   └── data/                      # 빌드 결과물 (직접 편집 X)
│       ├── services.json
│       ├── all-translations.json
│       └── services/{id}/translations.json
├── data/
│   ├── services.json              # 서비스 설정 (활성/비활성, 소스 URL 등)
│   └── services/{id}/
│       ├── changelog.md           # 원본 체인지로그
│       └── translations/*.json    # 버전별 한국어 번역 파일
├── templates/
│   └── index.html.template        # HTML 템플릿 ({{PLACEHOLDERS}})
├── scripts/
│   ├── build-site.mjs             # 빌드: 번역 JSON → site/ 생성
│   ├── detect-new-versions.mjs    # 새 버전 감지
│   ├── parse-changelog.mjs        # 체인지로그 파싱
│   └── translate.mjs              # 번역 실행
└── .github/workflows/
    ├── build-deploy.yml           # main push → 빌드 → GitHub Pages 배포
    ├── check-updates.yml          # 새 버전 감지 → 번역 트리거
    ├── translate.yml              # 번역 실행 → 커밋
    └── notify.yml                 # 알림 발송
```

## Tech Stack

- **프론트엔드**: Vanilla JS (IIFE 패턴), Tailwind CDN, CSS 변수
- **빌드**: Node.js 20+, ESM (`"type": "module"`)
- **배포**: GitHub Pages (GitHub Actions)
- **번역**: OpenAI API, Gemini API, Google Translate API
- **테스트**: `node --test tests/`

## Commands

```bash
npm run build        # 빌드: templates + data → site/
npm run parse        # 체인지로그 파싱
npm run translate    # 번역 실행 (API 키 필요)
npm run detect       # 새 버전 감지
npm test             # 테스트 실행
```

## Services

현재 지원 서비스 (`data/services.json`):

| ID | 서비스 | 벤더 | 소스 타입 |
|----|--------|------|-----------|
| claude-code | Claude Code | Anthropic | github-releases |
| codex-cli | Codex CLI | OpenAI | github-releases |
| gemini-cli | Gemini CLI | Google | github-releases |
| oh-my-claudecode | oh-my-claudecode | Yeachan Heo | github-releases |
| oh-my-opencode | oh-my-opencode | Yeongyu Kim | github-releases |
| openclaw | OpenClaw | OpenClaw | github-releases |

## Coding Conventions

### Theme / Dark Mode

CSS 변수(`style.css`)와 Tailwind `dark:` 클래스를 병행합니다. `html.dark` 클래스 토글 방식.

```css
/* style.css - CSS 변수로 테마 정의 */
:root { --bg-primary: #0D0D0D; }        /* 다크 기본값 */
html:not(.dark) { --bg-primary: #FAFAFA; } /* 라이트 오버라이드 */
```

**필수 규칙:**
- `text-white` 단독 사용 금지 → `text-gray-900 dark:text-white` 패턴 사용
- `bg-black` 단독 사용 금지 → `bg-white dark:bg-black` 패턴 사용
- 새 색상 추가 시 라이트/다크 모두 테스트

### JavaScript (app.js)

- IIFE 패턴 (`(function() { 'use strict'; ... })()`)
- 상태: `allVersions`, `filteredVersions`, `expandedSet`, `manualToggleState`
- `manualToggleState`: tri-state (null=기본, true=모두펼침, false=모두접기)
- 카테고리: added, fixed, improved, changed, removed, other

### HTML Template

- `templates/index.html.template` 편집 → `npm run build` → `site/index.html` 생성
- **site/index.html은 직접 편집하지 마세요** (빌드 결과물)
- 플레이스홀더: `{{VERSION_COUNT}}`, `{{LAST_UPDATED}}`, `{{LATEST_VERSION}}`

### Translation Data

각 번역 파일 구조 (`data/services/{id}/translations/{version}.json`):

```json
{
  "version": "1.0.0",
  "entries": [
    {
      "category": "added",
      "scope": "optional-scope",
      "original": "English text",
      "translated": "한국어 번역"
    }
  ]
}
```

## MCP 활용 규칙

코드 변경 시 MCP를 적극적으로 활용합니다. 사용자가 명시적으로 요청하지 않아도 자동으로 수행합니다.

| 상황 | MCP 도구 | 역할 |
|------|----------|------|
| 코드 변경 후 | `ask_codex` | `code-reviewer` - 코드 리뷰 |
| UI/프론트엔드 변경 시 | `ask_gemini` | `designer` - 디자인 검토 |
| 아키텍처 결정 시 | `ask_codex` | `architect` - 아키텍처 분석 |
| 보안 관련 코드 변경 시 | `ask_codex` | `security-reviewer` - 보안 검토 |
| 계획 수립 시 | `ask_codex` | `planner` - 전략 계획 |

## Important Notes

- Node.js 20 이상 필수 (ESM, `node:fs/promises` 등)
- 빌드 결과물(`site/index.html`, `site/data/`)은 커밋하지 않아도 됨 (CI가 빌드)
- 번역 시 합니다체(존댓말) 사용, 기술 용어는 영어 유지
- PR 생성 시 빌드 성공 여부 반드시 확인: `node scripts/build-site.mjs`
