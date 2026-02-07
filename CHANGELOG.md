# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
