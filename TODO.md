# TODO: 배포 및 확장 계획

## 1단계: GitHub Pages 배포

### 설정 방법
1. GitHub repo 생성 (또는 기존 repo 사용)
2. Settings → Pages → Source: GitHub Actions 선택
3. `.github/workflows/deploy.yml` 생성

### GitHub Actions 워크플로우

```yaml
name: Deploy to GitHub Pages

on:
  schedule:
    - cron: '0 */6 * * *'  # 6시간마다 실행
  workflow_dispatch:  # 수동 실행
  push:
    branches: [main]

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      # 캐시 삭제 및 최신 changelog 가져오기
      - name: Fetch latest changelog
        run: rm -f data/raw/CHANGELOG.md

      - name: Parse changelog
        run: npm run parse

      - name: Translate new versions
        env:
          GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}
        run: npm run translate

      - name: Build site
        run: npm run build

      - name: Deploy to GitHub Pages
        uses: peaceiris/actions-gh-pages@v3
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./site
```

### 필요한 Secret 설정
- `GEMINI_API_KEY`: Gemini API 키 (Settings → Secrets → Actions)

### 배포 URL
- `https://<username>.github.io/<repo-name>/`

---

## 2단계: 클라우드 DB 연결 (Supabase)

### 언제 전환?
- 서비스 3개 이상 추가 시
- 검색/필터 기능 복잡해질 때
- 크로스 서비스 비교 기능 필요 시

### Supabase 설정

1. https://supabase.com 가입 (무료: 500MB)

2. 새 프로젝트 생성

3. 테이블 스키마:
```sql
CREATE TABLE changelogs (
  id SERIAL PRIMARY KEY,
  service TEXT NOT NULL,        -- 'claude-code', 'cursor', 'windsurf'
  version TEXT NOT NULL,
  category TEXT,                -- 'added', 'fixed', 'improved'
  scope TEXT,                   -- 'VSCode', 'SDK', etc.
  original TEXT NOT NULL,
  translation TEXT,
  translated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(service, version, original)
);

CREATE INDEX idx_service ON changelogs(service);
CREATE INDEX idx_version ON changelogs(version);
```

4. 환경변수 설정:
```
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=eyJxxx...
```

### 클라이언트 연결 (브라우저)
```javascript
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// 데이터 조회
const { data } = await supabase
  .from('changelogs')
  .select('*')
  .eq('service', 'claude-code')
  .order('version', { ascending: false })
```

### Row Level Security (RLS) 설정
```sql
-- 누구나 읽기 가능 (공개 서비스)
ALTER TABLE changelogs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read access" ON changelogs
  FOR SELECT USING (true);
```

---

## 서비스 확장 계획

| 서비스 | Changelog URL | 우선순위 |
|--------|---------------|----------|
| Claude Code | github.com/anthropics/claude-code | 완료 |
| Cursor | ? | 예정 |
| Windsurf | ? | 예정 |
| GitHub Copilot | ? | 예정 |

---

## 비용 요약

| 항목 | 비용 |
|------|------|
| GitHub Pages | 무료 |
| GitHub Actions | 무료 (2,000분/월) |
| Gemini API | 무료 (20회/일) |
| Supabase | 무료 (500MB) |
| **총합** | **$0** |
