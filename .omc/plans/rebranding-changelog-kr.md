# ChangeLog.kr 리브랜딩 계획

## 1. 개요

### 1.1 현재 상태
- **프로젝트명**: `claude-code-changelog-ko`
- **사이트 제목**: "AI Changelog Hub - 한국어"
- **로고**: `>_` 터미널 커서
- **태그라인**: "한국어 번역"

### 1.2 목표 상태
- **브랜드명**: **ChangeLog.kr**
- **사이트 제목**: "ChangeLog.kr - AI 도구 변경 로그"
- **로고**: `>_` 유지 (터미널 감성과 잘 어울림)
- **태그라인**: "AI 도구 업데이트, 한국어로"

### 1.3 범위
- 모든 AI 도구 커버 (코딩 어시스턴트 + 범용 AI)
  - Claude Code, Cursor, Windsurf, Copilot
  - ChatGPT, Gemini, Perplexity 등
- 한국어 전용 서비스

---

## 2. 수용 기준 (Acceptance Criteria)

### 2.1 브랜딩
- [ ] **AC-1**: 사이트 제목이 "ChangeLog.kr"로 변경됨
- [ ] **AC-2**: 메타 태그(description, og:title 등)가 새 브랜드 반영
- [ ] **AC-3**: 푸터에 브랜드명 표시
- [ ] **AC-4**: 파비콘 유지 (현재 디자인 우수)

### 2.2 콘텐츠
- [ ] **AC-5**: 헤더 태그라인이 "AI 도구 업데이트, 한국어로"로 변경
- [ ] **AC-6**: "Claude Code" 하드코딩 제거, 동적 서비스명 표시
- [ ] **AC-7**: 사이드바 로고 영역에 "ChangeLog.kr" 표시

### 2.3 기술
- [ ] **AC-8**: GitHub 저장소명은 현재 유지 (URL 변경 최소화)
- [ ] **AC-9**: 기존 URL 구조 유지 (`?service=xxx`)
- [ ] **AC-10**: 도메인 연결 준비 (CNAME 파일)

---

## 3. 파일별 변경 사항

### Phase 1: HTML 템플릿 수정

#### Task 1.1: 메타 태그 업데이트
**파일**: `templates/index.html.template`

```html
<!-- 변경 전 -->
<title>AI Changelog Hub - 한국어</title>
<meta name="description" content="AI 코딩 툴들의 변경 로그를 한국어로 확인하세요. Claude Code, Cursor, Windsurf 등">

<!-- 변경 후 -->
<title>ChangeLog.kr - AI 도구 변경 로그</title>
<meta name="description" content="AI 도구들의 변경 로그를 한국어로 확인하세요. Claude Code, Cursor, ChatGPT, Gemini 등 모든 AI 서비스 업데이트">
<meta name="keywords" content="AI changelog, 변경로그, Claude Code, Cursor, ChatGPT, Gemini, 한국어, 번역">

<!-- Open Graph -->
<meta property="og:title" content="ChangeLog.kr - AI 도구 변경 로그">
<meta property="og:description" content="AI 도구들의 변경 로그를 한국어로 확인하세요">
<meta property="og:site_name" content="ChangeLog.kr">
```

#### Task 1.2: 사이드바 로고 영역 수정
**파일**: `templates/index.html.template`

```html
<!-- 변경 전 -->
<h1 class="font-display font-bold text-white text-base tracking-tight">Changelog</h1>
<p class="text-xs text-terminal-muted">한국어 번역</p>

<!-- 변경 후 -->
<h1 class="font-display font-bold text-white text-base tracking-tight">ChangeLog<span class="text-neon-cyan">.kr</span></h1>
<p class="text-xs text-terminal-muted">AI 도구 업데이트</p>
```

#### Task 1.3: 헤더 서비스 타이틀 영역
**파일**: `templates/index.html.template`

현재 동적으로 서비스명 표시 중 (app.js에서 처리) - 변경 불필요

#### Task 1.4: 푸터 브랜딩 추가
**파일**: `templates/index.html.template`

```html
<!-- 변경 전 -->
<p>Powered by <span class="text-gray-400">GitHub Actions</span> & <span class="text-gray-400">AI Translation</span></p>

<!-- 변경 후 -->
<div class="flex items-center gap-2">
  <span class="font-display font-bold text-white">ChangeLog<span class="text-neon-cyan">.kr</span></span>
  <span class="text-terminal-muted">|</span>
  <span>Powered by GitHub Actions & AI Translation</span>
</div>
```

---

### Phase 2: 서비스 확장 준비

#### Task 2.1: services.json 확장
**파일**: `data/services.json`

```json
{
  "services": [
    {
      "id": "claude-code",
      "name": "Claude Code",
      "shortName": "Claude",
      "icon": "claude",
      "color": "#00D9FF",
      "category": "coding",
      "sourceUrl": "https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md",
      "enabled": true
    },
    {
      "id": "cursor",
      "name": "Cursor",
      "shortName": "Cursor",
      "icon": "cursor",
      "color": "#7B61FF",
      "category": "coding",
      "sourceUrl": "https://changelog.cursor.com",
      "enabled": false
    },
    {
      "id": "windsurf",
      "name": "Windsurf",
      "shortName": "Windsurf",
      "icon": "windsurf",
      "color": "#10B981",
      "category": "coding",
      "sourceUrl": "https://docs.codeium.com/windsurf/changelog",
      "enabled": false
    },
    {
      "id": "chatgpt",
      "name": "ChatGPT",
      "shortName": "ChatGPT",
      "icon": "chatgpt",
      "color": "#10A37F",
      "category": "general",
      "sourceUrl": "https://help.openai.com/en/articles/6825453-chatgpt-release-notes",
      "enabled": false
    },
    {
      "id": "gemini",
      "name": "Google Gemini",
      "shortName": "Gemini",
      "icon": "gemini",
      "color": "#4285F4",
      "category": "general",
      "sourceUrl": "https://gemini.google.com/updates",
      "enabled": false
    },
    {
      "id": "copilot",
      "name": "GitHub Copilot",
      "shortName": "Copilot",
      "icon": "copilot",
      "color": "#000000",
      "category": "coding",
      "sourceUrl": "https://github.blog/changelog/label/copilot/",
      "enabled": false
    },
    {
      "id": "perplexity",
      "name": "Perplexity",
      "shortName": "Perplexity",
      "icon": "perplexity",
      "color": "#20808D",
      "category": "general",
      "sourceUrl": "https://www.perplexity.ai/hub/changelog",
      "enabled": false
    }
  ],
  "categories": {
    "coding": "코딩 어시스턴트",
    "general": "범용 AI"
  },
  "defaultService": "claude-code"
}
```

#### Task 2.2: 사이드바 카테고리 그룹화 (선택사항)
**파일**: `site/assets/app.js`

서비스가 많아지면 카테고리별 그룹화 고려:
```
SERVICES
├── 코딩 어시스턴트
│   ├── Claude Code ●
│   ├── Cursor
│   ├── Windsurf
│   └── Copilot
└── 범용 AI
    ├── ChatGPT
    ├── Gemini
    └── Perplexity
```

---

### Phase 3: 도메인 연결 준비

#### Task 3.1: CNAME 파일 생성
**파일**: `site/CNAME`

```
changelog.kr
```

#### Task 3.2: GitHub Pages 설정
- Settings > Pages > Custom domain: `changelog.kr`
- DNS 설정:
  - A 레코드: `185.199.108.153` (GitHub Pages IP)
  - CNAME: `www` → `{username}.github.io`

---

## 4. 변경하지 않는 것

| 항목 | 이유 |
|------|------|
| GitHub 저장소명 | URL 변경 시 기존 링크 깨짐, 리다이렉트 복잡 |
| 파비콘 디자인 | 현재 `>_` 터미널 커서가 브랜드와 잘 어울림 |
| 색상 팔레트 | Neon Terminal 테마 유지 |
| 기술 스택 | Vanilla JS + Tailwind 유지 |

---

## 5. 구현 순서

### 즉시 실행 (Phase 1)
1. HTML 템플릿 메타 태그 수정
2. 사이드바 로고 영역 수정
3. 푸터 브랜딩 추가
4. 빌드 및 배포

### 추후 실행 (Phase 2-3)
1. services.json 확장 (새 서비스 추가 시)
2. 사이드바 카테고리 그룹화 (서비스 5개 이상 시)
3. 도메인 구매 및 연결

---

## 6. 커밋 전략

```
1. feat(branding): rebrand to ChangeLog.kr
   - Update meta tags and title
   - Update sidebar logo and footer
   - Add CNAME for custom domain

2. feat(services): expand service definitions
   - Add ChatGPT, Gemini, Copilot, Perplexity metadata
   - Add category field for grouping
```

---

## 7. 검증

### 브랜딩 검증
- [ ] 브라우저 탭에 "ChangeLog.kr" 표시
- [ ] 사이드바에 "ChangeLog.kr" 로고 표시
- [ ] 푸터에 브랜드 표시
- [ ] Open Graph 미리보기 확인

### 기능 검증
- [ ] 기존 기능 모두 정상 작동
- [ ] 서비스 전환 정상
- [ ] URL 파라미터 정상

---

**Plan created by**: Planner
**Created at**: 2026-02-06
**Status**: READY FOR REVIEW
