# UI 리디자인 및 멀티서비스 확장 계획

## 1. 요구사항 요약

### 1.1 사용자 목표
- **UI 품질 향상**: 현재 "허접한" UI를 전문적이고 세련된 디자인으로 개선
- **멀티서비스 지원**: Claude Code 외에 Cursor, Windsurf 등 다른 AI 코딩 툴의 changelog도 관리
- **확장성**: 새로운 서비스를 쉽게 추가할 수 있는 구조

### 1.2 현재 상태 분석
| 항목 | 현재 상태 | 문제점 |
|------|----------|--------|
| 시각적 정체성 | 보라색 그라데이션 + 이모지 파비콘 | 전형적이고 아마추어적 |
| 레이아웃 | 단일 컬럼, 수직 스크롤 | 단조롭고 확장성 없음 |
| 서비스 구조 | Claude Code 하드코딩 | 멀티서비스 불가능 |
| 인터랙션 | 기본 호버만 | 모던 UX 부재 |

### 1.3 제안된 디자인 컨셉: "Precision Editorial"
- **철학**: 터미널/IDE의 정밀함 + 테크 매거진의 세련됨
- **색상 팔레트**: "Neon Terminal" - 시안 네온(#00D9FF) + 깊은 검정(#0D0D0D)
- **타이포그래피**: JetBrains Mono (display) + Inter (body) - *Geist Sans는 Google Fonts 미지원으로 Inter로 대체*
- **레이아웃**: 사이드바 네비게이션 (서비스 선택 전용) + 메인 영역 (콘텐츠)

---

## 2. 수용 기준 (Acceptance Criteria)

### 2.1 UI/UX 요구사항
- [ ] **AC-1**: 새로운 디자인 시스템이 적용되어 Neon Terminal 팔레트가 일관되게 사용됨
- [ ] **AC-2**: 다크 모드가 기본이며, 라이트 모드도 지원됨 (라이트 모드 팔레트 명시)
- [ ] **AC-3**: 사이드바 네비게이션으로 서비스 간 전환이 가능함 (탭 UI 제거 - 역할 단순화)
- [ ] **AC-4**: 반응형 디자인으로 모바일에서도 사용 가능함
- [ ] **AC-5**: 로딩 상태, 빈 상태, 에러 상태의 UI가 세련되게 표시됨
- [ ] **AC-6**: 부드러운 애니메이션과 트랜지션이 적용됨

### 2.2 멀티서비스 요구사항
- [ ] **AC-7**: 서비스 메타데이터가 `services.json`에서 관리됨
- [ ] **AC-8**: URL에서 서비스 선택이 가능함 (예: `?service=cursor`)
- [ ] **AC-9**: 서비스별로 독립적인 번역 데이터 구조 지원
- [ ] **AC-10**: 새 서비스 추가 시 코드 변경 없이 JSON만 추가하면 됨 (자동 감지 로직 명시)

### 2.3 기술 요구사항
- [ ] **AC-11**: Vanilla JS 유지 (프레임워크 전환 없음)
- [ ] **AC-12**: Tailwind CSS 유지
- [ ] **AC-13**: GitHub Pages 배포 호환
- [ ] **AC-14**: 기존 번역 데이터 마이그레이션 완료
- [ ] **AC-15**: 빌드 스크립트가 새 구조를 지원

---

## 3. 파일별 상세 구현 단계

### Phase 1: 데이터 구조 리팩토링 (우선순위: HIGH)

#### Task 1.1: 서비스 메타데이터 파일 생성
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
      "sourceUrl": "https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md",
      "enabled": true
    },
    {
      "id": "cursor",
      "name": "Cursor",
      "shortName": "Cursor",
      "icon": "cursor",
      "color": "#7B61FF",
      "sourceUrl": "https://changelog.cursor.com",
      "enabled": false
    },
    {
      "id": "windsurf",
      "name": "Windsurf",
      "shortName": "Windsurf",
      "icon": "windsurf",
      "color": "#10B981",
      "sourceUrl": "https://docs.codeium.com/windsurf/changelog",
      "enabled": false
    }
  ],
  "defaultService": "claude-code"
}
```
**작업 내용**:
- 서비스 메타데이터 스키마 정의
- 아이콘, 색상, 소스 URL 포함
- `enabled` 플래그로 준비된 서비스만 표시

#### Task 1.2: 데이터 마이그레이션 상세 (CRITICAL - 비평 반영)

##### 1.2.1 현재 파일 구조 (마이그레이션 전)
```
data/
├── translations/
│   ├── 2.1.31.json    # 개별 버전 파일 (100+개)
│   ├── 2.1.30.json
│   ├── 2.1.29.json
│   ├── ...
│   └── 1.0.97.json
```

각 버전 파일 스키마:
```json
{
  "version": "2.1.31",
  "parsedAt": "2026-02-05T05:07:04.086Z",
  "translationStatus": "pending",
  "entries": [
    {
      "category": "added",
      "scope": null,
      "original": "...",
      "translation": "..."
    }
  ],
  "translatedAt": "2026-02-05T05:13:19.391Z",
  "translationEngine": "openai",
  "translationCharCount": 1299
}
```

##### 1.2.2 새 파일 구조 (마이그레이션 후)
```
data/
├── services.json                    # 서비스 메타데이터 (신규)
├── services/
│   ├── claude-code/
│   │   └── translations/            # 기존 translations 폴더 이동
│   │       ├── 2.1.31.json
│   │       ├── 2.1.30.json
│   │       └── ...
│   ├── cursor/
│   │   └── translations/            # (미래)
│   └── windsurf/
│       └── translations/            # (미래)
```

##### 1.2.3 마이그레이션 스크립트 요구사항
**파일**: `scripts/migrate-to-multiservice.mjs`

```javascript
/**
 * 마이그레이션 스크립트 명세
 *
 * 1. data/translations/*.json -> data/services/claude-code/translations/*.json 이동
 * 2. 파일명 유지 (2.1.31.json 등)
 * 3. 파일 내용 변경 없음 (스키마 그대로)
 * 4. data/services.json 생성
 * 5. 원본 파일 삭제 또는 백업 폴더로 이동
 */

// 의사 코드:
async function migrate() {
  // 1. 백업 생성
  await copyDir('data/translations', 'data/translations.backup');

  // 2. 새 폴더 구조 생성
  await mkdir('data/services/claude-code/translations', { recursive: true });

  // 3. 모든 JSON 파일 이동
  const files = await glob('data/translations/*.json');
  for (const file of files) {
    await move(file, `data/services/claude-code/translations/${basename(file)}`);
  }

  // 4. services.json 생성
  await writeFile('data/services.json', servicesConfig);

  // 5. 검증: 이동된 파일 수 == 원본 파일 수
  const movedCount = (await glob('data/services/claude-code/translations/*.json')).length;
  const originalCount = files.length;
  assert(movedCount === originalCount, '마이그레이션 검증 실패');
}
```

##### 1.2.4 마이그레이션 검증 체크리스트
- [ ] 이동된 파일 수 일치 (현재 100+개)
- [ ] 각 파일 JSON 파싱 성공
- [ ] 빌드 스크립트 실행 성공
- [ ] 사이트 로드 시 모든 버전 표시

#### Task 1.3: 빌드 스크립트 업데이트 (CRITICAL - 비평 반영)
**파일**: `scripts/build-site.mjs`

##### 1.3.1 현재 빌드 로직
```javascript
// 현재: 단일 서비스, 고정 경로
const TRANSLATIONS_DIR = join(PROJECT_ROOT, 'data', 'translations');
const OUTPUT_JSON = join(SITE_DATA_DIR, 'all-translations.json');
```

##### 1.3.2 새 빌드 로직 (서비스 자동 감지)
```javascript
/**
 * 서비스 자동 감지 로직 (AC-10 검증 가능하도록 명시)
 *
 * 1. data/services/ 디렉토리의 모든 하위 폴더 스캔
 * 2. 각 폴더 내 translations/ 하위 폴더 존재 여부 확인
 * 3. translations/*.json 파일이 1개 이상 있으면 유효한 서비스로 인식
 * 4. services.json의 enabled 플래그와 교차 검증
 */

const SERVICES_DIR = join(PROJECT_ROOT, 'data', 'services');
const SERVICES_CONFIG = join(PROJECT_ROOT, 'data', 'services.json');

async function discoverServices() {
  const config = JSON.parse(await readFile(SERVICES_CONFIG, 'utf-8'));
  const discoveredDirs = await readdir(SERVICES_DIR);

  const validServices = [];

  for (const dir of discoveredDirs) {
    const translationsPath = join(SERVICES_DIR, dir, 'translations');
    try {
      const files = await readdir(translationsPath);
      const jsonFiles = files.filter(f => f.endsWith('.json'));

      if (jsonFiles.length > 0) {
        // services.json에서 메타데이터 찾기
        const meta = config.services.find(s => s.id === dir);
        if (meta && meta.enabled) {
          validServices.push({
            id: dir,
            meta,
            translationsPath,
            fileCount: jsonFiles.length
          });
        }
      }
    } catch (e) {
      // translations 폴더 없음 - 스킵
    }
  }

  return validServices;
}

async function buildServiceData(service) {
  // 기존 readTranslations() 로직을 서비스별로 실행
  const files = await readdir(service.translationsPath);
  const jsonFiles = files.filter(f => f.endsWith('.json'));

  const versions = [];
  for (const file of jsonFiles) {
    const content = await readFile(join(service.translationsPath, file), 'utf-8');
    versions.push(JSON.parse(content));
  }

  const sorted = sortVersionsDescending(versions);
  const stripped = stripForFrontend(sorted);

  // 출력: site/data/services/{service-id}/translations.json
  const outputDir = join(SITE_DATA_DIR, 'services', service.id);
  const outputPath = join(outputDir, 'translations.json');

  await mkdir(outputDir, { recursive: true });
  await writeFile(outputPath, JSON.stringify({
    generatedAt: new Date().toISOString(),
    serviceId: service.id,
    versionCount: stripped.length,
    versions: stripped
  }));

  return { serviceId: service.id, versionCount: stripped.length };
}

// 메인 빌드 플로우
async function main() {
  // 1. 서비스 자동 발견
  const services = await discoverServices();
  console.log(`Discovered ${services.length} enabled services`);

  // 2. 각 서비스 데이터 빌드
  for (const service of services) {
    const result = await buildServiceData(service);
    console.log(`Built ${result.serviceId}: ${result.versionCount} versions`);
  }

  // 3. services.json을 site/data/로 복사
  await copyFile(SERVICES_CONFIG, join(SITE_DATA_DIR, 'services.json'));

  // 4. HTML 빌드
  await buildHtml(...);
}
```

##### 1.3.3 AC-10 테스트 시나리오 (새 서비스 추가)
```bash
# 1. 새 서비스 폴더 생성
mkdir -p data/services/new-service/translations

# 2. 번역 파일 추가 (최소 1개)
echo '{"version":"1.0.0","entries":[]}' > data/services/new-service/translations/1.0.0.json

# 3. services.json에 메타데이터 추가
# {
#   "id": "new-service",
#   "name": "New Service",
#   "enabled": true
#   ...
# }

# 4. 빌드 실행
npm run build

# 5. 검증: site/data/services/new-service/translations.json 존재 확인
# 코드 변경 없이 새 서비스가 빌드됨
```

---

### Phase 2: 핵심 UI 리디자인 (우선순위: HIGH)

#### Task 2.1: Tailwind 설정 업데이트 (CRITICAL - 라이트 모드 추가)
**파일**: `site/index.html` (인라인 tailwind.config)

##### 2.1.1 폰트 설정 (CRITICAL - 비평 반영)
```html
<!-- Google Fonts CDN -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet">
```

**폰트 결정**:
- ~~Geist Sans~~: Google Fonts 미지원 (Vercel 전용 폰트)
- **대안: Inter** - Google Fonts 지원, 현대적이고 가독성 우수
- **JetBrains Mono**: Google Fonts 지원 O (위 링크에 포함)

##### 2.1.2 Tailwind 설정 (다크 + 라이트 모드)
```javascript
tailwind.config = {
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // === DARK MODE (기본) ===
        terminal: {
          bg: '#0D0D0D',
          surface: '#1A1A1A',
          elevated: '#242424',
          border: '#2A2A2A',
          'border-hover': '#3A3A3A',
          muted: '#666666',
        },
        // === LIGHT MODE (신규) ===
        light: {
          bg: '#FAFAFA',
          surface: '#FFFFFF',
          elevated: '#F5F5F5',
          border: '#E5E5E5',
          'border-hover': '#D4D4D4',
          muted: '#737373',
        },
        // === NEON ACCENTS (공통) ===
        neon: {
          cyan: '#00D9FF',
          'cyan-dim': '#00A3BF',      // 라이트 모드용 (대비 향상)
          purple: '#7B61FF',
          'purple-dim': '#5B41DF',    // 라이트 모드용
          green: '#10B981',
          'green-dim': '#059669',     // 라이트 모드용
          amber: '#F59E0B',
          'amber-dim': '#D97706',     // 라이트 모드용
          red: '#EF4444',
          'red-dim': '#DC2626',       // 라이트 모드용
        },
      },
      fontFamily: {
        display: ['"JetBrains Mono"', 'monospace'],
        body: ['"Inter"', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
      },
    }
  }
}
```

#### Task 2.2: 새로운 레이아웃 구조 구현 (CRITICAL - 역할 단순화)
**파일**: `site/index.html`

##### 2.2.1 역할 분리 (비평 반영 - 탭 제거)
```
사이드바 역할: 서비스 선택 전용
- Claude Code, Cursor, Windsurf 등 서비스 목록 표시
- 클릭 시 해당 서비스의 changelog 로드
- 활성 서비스 하이라이트

메인 영역 역할: 콘텐츠 표시
- 선택된 서비스의 버전 카드 리스트
- 필터 바 (카테고리, 범위, 버전)
- 탭 UI 없음 (중복 제거)
```

##### 2.2.2 레이아웃 와이어프레임
```
┌──────────────────────────────────────────────────────────────┐
│  [로고] AI Changelog Hub              [검색] [테마] [GitHub] │
├──────────┬───────────────────────────────────────────────────┤
│          │                                                   │
│  TOOLS   │   필터 바 (카테고리, 범위, 버전 드롭다운)         │
│          │                                                   │
│ ● Claude │  ─────────────────────────────────────────────── │
│ ○ Cursor │                                                   │
│ ○ Wind.. │   버전 카드 리스트                                │
│          │   (타임라인 스타일)                               │
│          │                                                   │
│          │                                                   │
└──────────┴───────────────────────────────────────────────────┘
```

**작업 내용**:
- 사이드바 네비게이션 추가 (데스크탑: 고정, 모바일: 드로어)
- ~~서비스 탭 UI 구현~~ → 제거 (사이드바와 중복)
- 헤더 리디자인 (심플하고 미니멀하게)
- 푸터 리디자인

#### Task 2.3: 버전 필터 동적 생성
**파일**: `site/assets/app.js`

```javascript
/**
 * 버전 필터 드롭다운 동적 생성
 * 데이터 로드 후 available versions에서 자동 생성
 */
function renderVersionFilter(versions) {
  const uniqueVersions = versions.map(v => v.version);
  const majorVersions = [...new Set(uniqueVersions.map(v => v.split('.')[0]))];

  // 필터 옵션 생성
  // - 전체
  // - v2.x
  // - v1.x
  // 또는 최근 10개 버전 직접 선택
}
```

#### Task 2.4: 버전 카드 리디자인
**파일**: `site/index.html` (템플릿)
**현재**: 기본 카드 + 아코디언
**변경**: 타임라인 스타일 + 호버 효과 + 마이크로 인터랙션

**작업 내용**:
- 타임라인 라인 + 도트 추가
- 카드 호버 시 글로우 효과
- 카테고리 뱃지 리디자인 (네온 색상)
- 엔트리 아이템 간격/타이포 개선

#### Task 2.5: 스타일시트 전면 개편
**파일**: `site/assets/style.css`
**작업 내용**:
- CSS 변수로 테마 시스템 구축 (다크 + 라이트)
- 카테고리 뱃지 네온 스타일
- 사이드바 스타일
- 타임라인 스타일
- 애니메이션/트랜지션 강화
- 스크롤바 커스터마이징 (네온 테마)

---

### Phase 3: JavaScript 리팩토링 (우선순위: HIGH)

#### Task 3.1: 서비스 관리 모듈 추가
**파일**: `site/assets/app.js`
**작업 내용**:
```javascript
// 서비스 상태 관리
let currentService = 'claude-code';
let servicesConfig = null;

// 서비스 로드
async function loadServicesConfig() { ... }

// 서비스 전환
function switchService(serviceId) { ... }

// URL 쿼리 파라미터 처리
function handleServiceFromURL() { ... }
```

#### Task 3.2: 데이터 로딩 로직 수정
**파일**: `site/assets/app.js`
**현재**: 하드코딩된 `data/all-translations.json`
**변경**: 동적 서비스별 경로

```javascript
// 변경 전
const DATA_URL = 'data/all-translations.json';

// 변경 후
function getDataURL(serviceId) {
  return `data/services/${serviceId}/translations.json`;
}
```

#### Task 3.3: 사이드바 렌더링 로직
**파일**: `site/assets/app.js`
**작업 내용**:
- 서비스 목록 동적 렌더링
- 활성 서비스 상태 표시
- 서비스 클릭 시 전환 처리
- 모바일 드로어 토글

#### Task 3.4: URL 상태 관리
**파일**: `site/assets/app.js`
**작업 내용**:
- `?service=xxx` 쿼리 파라미터 처리
- `#vX.X.X` 해시와 서비스 쿼리 조합
- 브라우저 히스토리 관리 (pushState)

---

### Phase 4: 인터랙션 및 애니메이션 (우선순위: MEDIUM)

#### Task 4.1: 마이크로 인터랙션 추가
**파일**: `site/assets/style.css`
**작업 내용**:
- 버튼 호버/클릭 효과 (글로우, 스케일)
- 카드 호버 시 보더 글로우
- 사이드바 아이템 선택 애니메이션
- 필터 버튼 활성화 트랜지션

#### Task 4.2: 로딩 상태 개선
**파일**: `site/index.html`, `site/assets/style.css`
**작업 내용**:
- 스켈레톤 로더 구현
- 서비스 전환 시 페이드 트랜지션
- 프로그레스 인디케이터 (네온 스타일)

#### Task 4.3: 빈 상태 / 에러 상태 개선
**파일**: `site/index.html`
**작업 내용**:
- 일러스트 또는 아이콘 추가
- 메시지 개선
- 액션 버튼 스타일링

---

### Phase 5: 반응형 디자인 (우선순위: MEDIUM)

#### Task 5.1: 모바일 네비게이션
**파일**: `site/index.html`, `site/assets/app.js`
**작업 내용**:
- 햄버거 메뉴 버튼
- 슬라이드 인 드로어
- 서비스 선택 후 자동 닫기

#### Task 5.2: 브레이크포인트 최적화
**파일**: `site/assets/style.css`
**작업 내용**:
- `sm`: 640px - 모바일
- `md`: 768px - 태블릿
- `lg`: 1024px - 데스크탑
- `xl`: 1280px - 와이드

#### Task 5.3: 터치 인터랙션 (간소화)
**파일**: `site/assets/app.js`
**작업 내용**:
- ~~스와이프로 사이드바 열기/닫기~~ → 복잡도 고려하여 Phase 7로 이동
- 터치 디바이스에서 호버 대체 (`:active` 스타일)

---

### Phase 6: 파비콘 및 브랜딩 (우선순위: LOW)

#### Task 6.1: SVG 로고/파비콘 제작 (CRITICAL - 지침 구체화)
**파일**: `site/assets/favicon.svg`, `site/assets/logo.svg`

##### 6.1.1 파비콘 디자인 명세
```
모양: 둥근 모서리 사각형 (border-radius: 20%)
배경: #0D0D0D (terminal-bg)
전경: 터미널 커서 모티프 ">" 또는 코드 블록 "{}"
색상: #00D9FF (neon-cyan)
크기: 32x32 기본, 16x16 및 180x180 (Apple Touch) 파생
```

##### 6.1.2 SVG 코드 예시
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="6" fill="#0D0D0D"/>
  <text x="8" y="22" font-family="JetBrains Mono, monospace"
        font-size="16" font-weight="bold" fill="#00D9FF">&gt;_</text>
</svg>
```

#### Task 6.2: 메타 태그 업데이트
**파일**: `site/index.html`
**작업 내용**:
- 파비콘 경로 변경
- Open Graph 이미지 추가
- 테마 컬러 변경 (#0D0D0D)

---

### Phase 7: 미래 개선사항 (BACKLOG)

#### Task 7.1: 스와이프 제스처 (복잡도 높음)
- Hammer.js 또는 직접 터치 이벤트 구현 필요
- MVP 이후 검토

#### Task 7.2: 오프라인 지원
- Service Worker 추가
- 캐싱 전략 수립

---

## 4. 리스크 및 완화 방안

| 리스크 | 영향도 | 발생 확률 | 완화 방안 |
|--------|--------|----------|----------|
| 기존 데이터 마이그레이션 실패 | HIGH | LOW | 마이그레이션 스크립트 테스트 + 백업 (Task 1.2 상세화) |
| Tailwind CDN 의존성 | MEDIUM | LOW | 필요시 빌드 타임 Tailwind로 전환 가능 |
| 반응형 디자인 버그 | MEDIUM | MEDIUM | 다양한 디바이스 테스트 |
| 서비스 전환 시 상태 유실 | MEDIUM | MEDIUM | URL 상태 동기화 + localStorage 백업 |
| 애니메이션 성능 이슈 | LOW | LOW | CSS 애니메이션 위주, JS 최소화 |
| 폰트 로딩 실패 | LOW | LOW | system-ui 폴백, preconnect 최적화 |

---

## 5. 검증 단계

### 5.1 단위 검증
- [ ] `services.json` 스키마 유효성
- [ ] 데이터 마이그레이션 무결성 (번역 수 일치: 100+개)
- [ ] 각 서비스 데이터 로드 성공
- [ ] AC-10 검증: 새 서비스 폴더 추가만으로 빌드 성공

### 5.2 UI 검증
- [ ] 다크 모드 / 라이트 모드 전환 (양쪽 팔레트 적용 확인)
- [ ] 사이드바 네비게이션 동작
- [ ] ~~서비스 탭 전환~~ → 제거됨
- [ ] 필터/검색 기능
- [ ] 버전 카드 펼침/접기

### 5.3 반응형 검증
- [ ] 모바일 (320px ~ 640px)
- [ ] 태블릿 (768px ~ 1024px)
- [ ] 데스크탑 (1024px+)

### 5.4 브라우저 호환성
- [ ] Chrome (최신)
- [ ] Firefox (최신)
- [ ] Safari (최신)
- [ ] Edge (최신)

### 5.5 배포 검증
- [ ] GitHub Pages 빌드 성공
- [ ] 모든 정적 자산 로드
- [ ] 404 없음

### 5.6 성능 검증 (CRITICAL - 비평 반영)
| 메트릭 | 기준 | 측정 방법 |
|--------|------|----------|
| 초기 로드 | < 3초 | Chrome DevTools Network (캐시 비활성화, Slow 3G) |
| 서비스 전환 | < 500ms | console.time() 측정 |
| Lighthouse Performance | > 80점 | Lighthouse CI |
| First Contentful Paint | < 1.5초 | Lighthouse |

### 5.7 접근성 검증 (CRITICAL - WCAG 레벨 명시)
| 항목 | 기준 | 검증 방법 |
|------|------|----------|
| 색상 대비 | WCAG 2.1 AA (4.5:1) | axe DevTools |
| 키보드 네비게이션 | 전체 기능 접근 가능 | Tab + Enter 테스트 |
| 스크린 리더 | aria-label 적용 | VoiceOver/NVDA 테스트 |
| 포커스 표시 | visible focus ring | 시각적 확인 |

---

## 6. 커밋 전략

```
1. feat(data): add multi-service data structure
   - Create services.json
   - Migrate translations to new folder structure
   - Add migration script

2. feat(build): update build script for multi-service
   - Add service auto-discovery logic
   - Output per-service translations.json
   - Copy services.json to site/data/

3. feat(ui): implement new design system
   - Update Tailwind config with Neon Terminal palette (dark + light)
   - Add Google Fonts (JetBrains Mono, Inter)

4. feat(ui): redesign layout with sidebar navigation
   - Add service sidebar (remove duplicate tabs)
   - Redesign header/footer

5. feat(ui): redesign version cards
   - Timeline style
   - Neon category badges
   - Hover effects

6. feat(js): add multi-service support
   - Service switching logic
   - URL state management
   - Dynamic data loading

7. feat(ui): add micro-interactions
   - Button effects
   - Card animations
   - Loading states

8. feat(ui): implement responsive design
   - Mobile drawer
   - Breakpoint optimizations

9. feat(branding): update favicon and meta tags
   - New SVG favicon
   - Open Graph meta
```

---

## 7. 성공 기준

| 기준 | 측정 방법 |
|------|----------|
| 디자인 품질 | 현대적인 터미널/IDE 느낌, 네온 액센트 |
| 확장성 | services.json에 새 서비스 추가 + 폴더 생성만으로 동작 (AC-10 테스트 통과) |
| 성능 | 초기 로드 < 3초, 서비스 전환 < 500ms (Lighthouse 80+) |
| 접근성 | WCAG 2.1 AA 준수, 키보드 네비게이션 지원 |
| 유지보수성 | 명확한 코드 구조, 주석 |

---

## 부록: 참고 디자인

### A. 색상 팔레트 상세 (다크 + 라이트)

#### A.1 다크 모드 (기본)
```css
:root {
  /* Backgrounds */
  --bg-primary: #0D0D0D;
  --bg-surface: #1A1A1A;
  --bg-elevated: #242424;

  /* Borders */
  --border-default: #2A2A2A;
  --border-hover: #3A3A3A;

  /* Text */
  --text-primary: #FFFFFF;
  --text-secondary: #A0A0A0;
  --text-muted: #666666;

  /* Neon Accents */
  --neon-cyan: #00D9FF;
  --neon-cyan-glow: rgba(0, 217, 255, 0.3);
  --neon-purple: #7B61FF;
  --neon-green: #10B981;
  --neon-amber: #F59E0B;
  --neon-red: #EF4444;
}
```

#### A.2 라이트 모드 (CRITICAL - 비평 반영)
```css
.light {
  /* Backgrounds */
  --bg-primary: #FAFAFA;
  --bg-surface: #FFFFFF;
  --bg-elevated: #F5F5F5;

  /* Borders */
  --border-default: #E5E5E5;
  --border-hover: #D4D4D4;

  /* Text */
  --text-primary: #171717;
  --text-secondary: #525252;
  --text-muted: #737373;

  /* Neon Accents (대비 향상 버전) */
  --neon-cyan: #0891B2;      /* cyan-600 */
  --neon-cyan-glow: rgba(8, 145, 178, 0.15);
  --neon-purple: #7C3AED;    /* violet-600 */
  --neon-green: #059669;     /* emerald-600 */
  --neon-amber: #D97706;     /* amber-600 */
  --neon-red: #DC2626;       /* red-600 */
}
```

### B. 카테고리 뱃지 색상 매핑
| 카테고리 | 다크 모드 | 라이트 모드 | 글로우 |
|---------|----------|------------|--------|
| 추가 (added) | #10B981 | #059669 | rgba(16,185,129,0.3) |
| 수정 (fixed) | #00D9FF | #0891B2 | rgba(0,217,255,0.3) |
| 개선 (improved) | #7B61FF | #7C3AED | rgba(123,97,255,0.3) |
| 변경 (changed) | #F59E0B | #D97706 | rgba(245,158,11,0.3) |
| 제거 (removed) | #EF4444 | #DC2626 | rgba(239,68,68,0.3) |

### C. 폰트 CDN 링크 (CRITICAL - 비평 반영)
```html
<!-- Google Fonts 최적화 로딩 -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet">
```

| 폰트 | 용도 | CDN 가용성 |
|------|------|-----------|
| JetBrains Mono | display, 코드 | Google Fonts O |
| Inter | body, UI | Google Fonts O |
| ~~Geist Sans~~ | ~~body~~ | Google Fonts X (Vercel 전용) → Inter로 대체 |

---

**Plan created by**: Planner (Prometheus)
**Created at**: 2026-02-05
**Revised at**: 2026-02-05 (Iteration 2)
**Status**: READY FOR REVIEW

---

## 개정 이력

### Iteration 2 (비평 반영)
1. **데이터 마이그레이션 전략** - Task 1.2에 현재/새 파일 구조, 마이그레이션 스크립트 명세, 검증 체크리스트 추가
2. **폰트 로딩** - Geist Sans → Inter로 대체, Google Fonts CDN 링크 명시
3. **사이드바/탭 역할 중복** - 탭 UI 제거, 사이드바만 서비스 선택에 사용
4. **AC-10 검증** - 빌드 스크립트의 서비스 자동 감지 로직 상세화, 테스트 시나리오 추가
5. **라이트 모드 팔레트** - 부록 A.2에 라이트 모드 전용 색상 팔레트 추가

### Minor 개선
- SVG 파비콘 디자인 명세 추가 (6.1.1)
- 스와이프 제스처를 Phase 7 (BACKLOG)로 이동
- 버전 필터 동적 생성 로직 추가 (Task 2.3)
- 성능 검증 기준 명시 (5.6)
- 접근성 WCAG 2.1 AA 레벨 명시 (5.7)
