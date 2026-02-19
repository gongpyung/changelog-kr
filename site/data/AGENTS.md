<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-02-18 | Updated: 2026-02-18 -->

# site/data/

## Purpose
빌드된 서비스 메타데이터 및 통합 번역 JSON. `build-site.mjs`가 `data/services/*/translations/`를 병합하여 생성합니다. **직접 편집 금지.**

## Key Files

| File | Description |
|------|-------------|
| `services.json` | 활성 서비스 메타데이터 배열 (id, name, color, icon 등) |
| `all-translations.json` | 전체 서비스 번역 데이터 통합 JSON (클라이언트 초기 로드용) |

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `services/` | 서비스별 분리 번역 JSON (`{id}/translations.json`) |

## For AI Agents

### Working In This Directory
- **직접 편집 금지** — `npm run build` 결과물
- `services/{id}/translations.json` = 해당 서비스의 전체 버전 번역 통합 파일
- `all-translations.json` = 모든 서비스 합산 (대용량 — 클라이언트에서 분할 로드 고려)
- 소스 변경 후 항상 `npm run build`로 재생성

## Dependencies

### Internal
- `scripts/build-site.mjs` — 이 폴더 생성
- `data/services/*/translations/*.json` — 빌드 입력 소스

<!-- MANUAL: -->
