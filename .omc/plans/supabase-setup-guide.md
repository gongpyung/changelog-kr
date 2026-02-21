# Supabase 설정 가이드 (초보자용)

Supabase는 Firebase의 오픈소스 대안으로, **인증(Auth)**, **데이터베이스(DB)**, **실시간 구독** 등을 제공합니다. 무료 티어로 시작할 수 있습니다.

---

## Step 1: Supabase 계정 생성 및 프로젝트 만들기

### 1-1. 회원가입
1. https://supabase.com 접속
2. **Start your project** 클릭
3. GitHub 계정으로 로그인 (권장) 또는 이메일로 가입

### 1-2. 조직(Organization) 생성
```
Organization name: changelog-kr (또는 원하는 이름)
```

### 1-3. 프로젝트 생성
```
Project name: changelog-kr
Database password: [강력한 비밀번호 생성 - 나중에 필요 없음]
Region: Northeast Asia (Tokyo) - 한국에서 가장 가까움
Plan: Free
```

**약 2분 정도 대기** 후 프로젝트가 생성됩니다.

---

## Step 2: API 키 확인하기

프로젝트가 생성되면 대시보드에서:

1. 왼쪽 메뉴에서 **Settings** (톱니바퀴 아이콘) 클릭
2. **API** 클릭
3. 다음 두 값을 복사해 두세요:

```
Project URL: https://xxxxxx.supabase.co
anon public: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

> **참고**: `anon` 키는 공개해도 안전합니다. 프론트엔드에서 사용됩니다.

---

## Step 3: 데이터베이스 테이블 생성

### 3-1. SQL Editor 열기
1. 왼쪽 메뉴에서 **SQL Editor** 클릭
2. **New query** 클릭

### 3-2. 스키마 실행
프로젝트의 `supabase/schema.sql` 내용을 복사해서 붙여넣고 **Run** 클릭:

```sql
-- ChangeLog.kr User Check-in Schema
CREATE TABLE IF NOT EXISTS user_checkins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  service_id TEXT NOT NULL,
  last_checked_version TEXT NOT NULL,
  last_checked_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, service_id)
);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_user_checkins_user_id ON user_checkins(user_id);
CREATE INDEX IF NOT EXISTS idx_user_checkins_service_id ON user_checkins(service_id);

-- RLS 활성화
ALTER TABLE user_checkins ENABLE ROW LEVEL SECURITY;

-- RLS 정책 (사용자는 자신의 데이터만 접근 가능)
CREATE POLICY "Users can view own checkins" ON user_checkins
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own checkins" ON user_checkins
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own checkins" ON user_checkins
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own checkins" ON user_checkins
  FOR DELETE USING (auth.uid() = user_id);
```

### 3-3. 테이블 확인
왼쪽 메뉴 **Table Editor** → `user_checkins` 테이블이 보이면 성공!

---

## Step 4: OAuth 설정 (GitHub)

### 4-1. GitHub OAuth App 생성
1. https://github.com/settings/developers 접속
2. **OAuth Apps** → **New OAuth App** 클릭
3. 입력:

```
Application name: ChangeLog.kr
Homepage URL: http://127.0.0.1:8080 (로컬 테스트용)
Authorization callback URL: https://[YOUR-PROJECT-ID].supabase.co/auth/v1/callback
```

4. **Register application** 클릭
5. **Generate a new client secret** 클릭
6. **Client ID**와 **Client Secret** 복사

### 4-2. Supabase에 GitHub 설정
1. Supabase 대시보드 → **Authentication** → **Providers**
2. **GitHub** 클릭
3. Enable 체크
4. Client ID, Client Secret 붙여넣기
5. **Save** 클릭

---

## Step 5: OAuth 설정 (Google)

### 5-1. Google Cloud Console 설정
1. https://console.cloud.google.com 접속
2. 새 프로젝트 생성 또는 기존 프로젝트 선택
3. **APIs & Services** → **Credentials**
4. **Create Credentials** → **OAuth client ID**
5. Application type: **Web application**
6. Authorized redirect URIs:
   ```
   https://[YOUR-PROJECT-ID].supabase.co/auth/v1/callback
   ```
7. **Create** 클릭
8. **Client ID**와 **Client Secret** 복사

### 5-2. Supabase에 Google 설정
1. Supabase 대시보드 → **Authentication** → **Providers**
2. **Google** 클릭
3. Enable 체크
4. Client ID, Client Secret 붙여넣기
5. **Save** 클릭

---

## Step 6: 환경 변수 설정

프로젝트 루트에 `.env` 파일 생성:

```bash
# C:\git\changelog-kr\.env
SUPABASE_URL=https://[YOUR-PROJECT-ID].supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

---

## Step 7: 빌드 및 실행

```bash
# 빌드 (환경 변수가 index.html에 주입됨)
npm run build

# 로컬 서버 실행
npx serve site -l 8080
```

---

## Step 8: 테스트

브라우저에서 http://127.0.0.1:8080 접속 후:

1. 우측 상단 **로그인** 버튼 클릭
2. **GitHub로 로그인** 또는 **Google로 로그인** 클릭
3. OAuth 승인 → 사이트로 리다이렉트
4. 로그인 성공 시 프로필 아바타 표시
5. 버전 카드에 **NEW** 배지와 **확인** 버튼 표시

---

## 체크리스트

| 단계 | 항목 | 완료 |
|------|------|------|
| 1 | Supabase 계정 생성 | ☐ |
| 2 | 프로젝트 생성 (Region: Tokyo) | ☐ |
| 3 | Project URL 복사 | ☐ |
| 4 | anon public 키 복사 | ☐ |
| 5 | schema.sql 실행 (테이블 생성) | ☐ |
| 6 | GitHub OAuth App 생성 | ☐ |
| 7 | Supabase에 GitHub OAuth 설정 | ☐ |
| 8 | Google OAuth Client 생성 | ☐ |
| 9 | Supabase에 Google OAuth 설정 | ☐ |
| 10 | .env 파일 생성 | ☐ |
| 11 | npm run build 실행 | ☐ |
| 12 | 로컬 서버 실행 및 테스트 | ☐ |

---

## 팁

- **무료 티어 한도**: 월 500MB 데이터베이스, 1GB 파일 저장, 50,000 MAU
- **로컬 테스트 URL**: `http://127.0.0.1:8080` (localhost 대신 IP 사용 권장)
- **프로덕션 배포 시**: GitHub/Google OAuth 설정에서 `Homepage URL`을 실제 도메인으로 추가 필요

문제가 발생하면 Supabase 대시보드의 **Logs** → **Auth Logs**에서 에러를 확인할 수 있습니다.
