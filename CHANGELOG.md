# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.2.1] - 2026-02-08

### Added
- **정적 에셋 content hash 캐시 버스팅** - `app.js` → `app.{hash}.js` 형태로 빌드하여 배포 시 브라우저 캐시 자동 무효화
- **마크다운 인라인 렌더링** - 번역 텍스트의 `**bold**`를 **bold**로, `` `code` ``를 `code`로 렌더링
  - `renderInlineMarkdown()` 함수 추가 (`app.js`)
  - `.inline-code` 스타일 추가 (`style.css`)

### Fixed
- **releases-parser `\r\n` 호환성** - Windows 줄 바꿈이 포함된 GitHub Releases 파싱 오류 수정
- **codex v0.98.0 번역 파일 리셋** - 빈 entries로 파싱된 잘못된 번역 파일 제거
- **번역 후 자동 빌드 트리거** - translate 워크플로우 완료 후 빌드가 누락되던 문제 수정
- **parsedAt 불필요 갱신 방지** - 변경 없을 때 불필요한 커밋 발생 방지
- **모바일 버전명 줄바꿈** - 작은 화면에서 버전명이 잘리던 문제 수정

### Changed
- **prerelease 버전 제거** - alpha/beta 등 prerelease 버전을 제외하고 소스 타입을 github-releases로 통일
- **알림 워크플로우 비활성화** - `notify.yml` 임시 비활성화

## [2.2.0] - 2026-02-07

### Fixed
- **Light theme全面 개선** - 19개 라이트 모드 이슈 수정
  - 사이드바가 라이트 모드에서도 다크 배경으로 표시되던 문제 (CRITICAL)
  - 타임라인 선이 흰 배경에 검정으로 나오던 문제 (CRITICAL)
  - 빈 상태/에러 상태 박스가 다크 색상으로 나오던 문제 (CRITICAL)
  - 필터 버튼 hover/active 색상이 다크 모드 전용이던 문제 (CRITICAL)
  - `text-terminal-muted` 등 Tailwind 유틸리티 클래스에 `dark:` 접두사 누락 (HIGH)
  - 카테고리 뱃지 배경색이 흰 배경에서 너무 연하던 문제 (HIGH)
  - 에러 상태 텍스트(`text-gray-300`)가 흰 배경에서 안 보이던 문제 (HIGH)

### Changed
- **CSS 변수 활용 개선** - 하드코딩된 `rgba()` 값을 CSS 변수(`var(--neon-cyan-glow)` 등)로 교체하여 라이트/다크 자동 전환
- **라이트 모드 전용 오버라이드 추가** - 카드 hover shadow, 뱃지 색상 강화, 선택 영역 색상 등 `html:not(.dark)` 블록 추가
- **Tailwind 클래스 페어링** - 모든 `terminal-*` 클래스에 `dark:` 접두사와 라이트 모드 대응 클래스 추가 (`bg-white dark:bg-terminal-surface` 패턴)

## [2.1.0] - 2026-02-07

### Added
- **oh-my-claudecode service** - New service integration for oh-my-claudecode changelog with 55 versions and Korean translations
- **Keep a Changelog parser support** - `changelog-parser.mjs` now recognizes `### Added`, `### Fixed`, `### Changed` section headings for proper category classification
- **Category fix script** - `scripts/fix-categories.mjs` one-time script to update existing translation categories
- **New Codex CLI translations** - 80+ new version translations (0.80.0 through 0.99.0-alpha.6)
- **New Gemini CLI translations** - 60+ new version translations (0.20.0-preview.5 through 0.28.0-preview.5)
- **New Claude Code translations** - 3 new versions (2.1.32, 2.1.33, 2.1.34)

### Fixed
- **Category classification for Keep a Changelog format** - Entries from oh-my-claudecode were all classified as "other" because the parser only checked the first word of each bullet. Now uses `### Added/Fixed/Changed` headings when available with `classifyEntry()` fallback

### Changed
- **Translation improvements** - Updated translations across all services for better Korean quality
- **Detection script** - Updated `detect-new-versions.mjs` with improved multi-service support
- **Translation client** - Updated `openai-translation-client.mjs` for better batch handling
- **Site assets** - Updated `app.js` and `style.css` for multi-service UI improvements
- **Build template** - Updated `templates/index.html.template` with service-related changes

## [2.0.0] - 2026-02-07

### Added
- **Multi-service architecture** - Evolved from single-service (Claude Code only) to supporting Codex CLI and Gemini CLI
- **GitHub Releases API parser** - `releases-parser.mjs` for parsing GitHub release pages (used by Codex CLI, Gemini CLI)
- **Per-service data directories** - `data/services/{id}/` structure with individual versions.json and translations
- **2-layer merge protection** - Preserves existing translations when re-parsing changelogs
- **Dynamic service switching UI** - Frontend supports selecting between multiple services
- **50 unit tests** - For changelog-parser, releases-parser, version-utils, PlaceholderManager
- **Multi-service CI/CD** - Updated check-updates, translate, and notify workflows

### Fixed
- **PlaceholderManager shared state bug** - Fixed batch translation placeholder conflicts
- **translationStatus never set to 'completed'** - Fixed translation completion tracking
- **VERSION_REGEX pre-release support** - Unified regex to support pre-release version strings (e.g., 0.88.0-alpha.1)

### Changed
- **Scripts rewritten** - detect/parse/translate scripts use multi-service common interface
- **Concurrency protection** - Added workflow concurrency for translate CI

### Removed
- **Legacy data directories** - Removed `data/translations/`, `data/translations.backup/`, `data/raw/`
- **Unused telegram template** - Removed `templates/telegram.md.template`
- **Invalid Tailwind classes** - Removed `light:` prefix classes that don't exist in Tailwind

## [1.1.0] - 2026-02-06

### Changed
- **README redesign** - Multi-service architecture documentation with badges, supported services table, and simplified quick start guide

## [1.0.0] - 2026-02-06

### Added
- **ChangeLog.kr platform** - Initial release as AI tool changelog translation platform
- **Multi-service architecture foundation** - Support structure for Claude Code, Cursor, Windsurf etc.
- **Neon Terminal UI design** - Dark theme design system with neon accent colors
- **Korean auto-translation** - Automated changelog translation to Korean via Google/OpenAI/Gemini APIs
- **204 translated versions** - Initial batch of Claude Code changelog translations
- **GitHub Actions workflows** - Automated check-updates, translate, and notify pipelines
- **Static site generator** - Build script generating `site/` from templates and data
