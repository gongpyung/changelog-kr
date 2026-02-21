# Supabase 설정 가이드

이 문서는 ChangeLog.kr의 사용자 확인 기능을 위한 Supabase 설정 방법을 안내합니다.

## 1. Supabase 프로젝트 생성

1. [Supabase](https://supabase.com)에 접속하여 로그인 또는 회원가입
2. "New Project" 클릭
3. 프로젝트 정보 입력:
   - **Name**: `changelog-kr` (또는 원하는 이름)
   - **Database Password**: 강력한 비밀번호 설정 (저장해두세요)
   - **Region**: `Northeast Asia (Tokyo)` 또는 `Southeast Asia (Singapore)` 권장
4. "Create new project" 클릭
5. 프로젝트 생성 완료까지 1-2분 대기

## 2. 데이터베이스 스키마 적용

1. Supabase 대시보드에서 **SQL Editor** 메뉴로 이동
2. "New query" 클릭
3. `supabase/schema.sql` 파일의 내용을 복사하여 붙여넣기
4. "Run" 클릭하여 실행
5. 성공 메시지 확인

## 3. OAuth 인증 설정 (Google)

1. **Authentication** > **Providers** 메뉴로 이동
2. Google 행에서 "Enable" 클릭
3. Google Cloud Console에서 OAuth 2.0 클라이언트 ID 생성:
   - [Google Cloud Console](https://console.cloud.google.com/apis/credentials) 접속
   - "Create Credentials" > "OAuth client ID"
   - Application type: "Web application"
   - Authorized JavaScript origins:
     - `http://localhost:3000` (개발용)
     - `https://changelog.kr` (프로덕션)
   - Authorized redirect URIs:
     - `https://YOUR_PROJECT_ID.supabase.co/auth/v1/callback`
4. Client ID와 Client Secret을 Supabase에 입력
5. "Save" 클릭

## 4. OAuth 인증 설정 (GitHub) - 선택사항

1. **Authentication** > **Providers** 메뉴로 이동
2. GitHub 행에서 "Enable" 클릭
3. GitHub에서 OAuth App 생성:
   - [GitHub Developer Settings](https://github.com/settings/developers) 접속
   - "New OAuth App" 클릭
   - Application name: `ChangeLog.kr`
   - Homepage URL: `https://changelog.kr`
   - Authorization callback URL: `https://YOUR_PROJECT_ID.supabase.co/auth/v1/callback`
4. Client ID와 Client Secret을 Supabase에 입력
5. "Save" 클릭

## 5. 환경 변수 설정

1. **Settings** > **API** 메뉴로 이동
2. 다음 값들을 복사:
   - **Project URL**: `https://xxxxx.supabase.co`
   - **anon public**: `eyJhbGciOiJIUzI1NiIsInR5cCI6...`
3. `.env.example`을 `.env`로 복사:
   ```bash
   cp .env.example .env
   ```
4. `.env` 파일에 복사한 값들을 붙여넣기

## 6. 로컬 개발 환경 URL 설정

**Authentication** > **URL Configuration** 메뉴에서:

- **Site URL**: `http://localhost:3000` (개발) 또는 `https://changelog.kr` (프로덕션)
- **Redirect URLs**:
  - `http://localhost:3000/*`
  - `https://changelog.kr/*`

## 7. 확인

설정이 완료되면 다음을 확인하세요:

1. Supabase 대시보드 **Table Editor**에서 `user_checkins` 테이블이 보이는지 확인
2. **Authentication** > **Users**에서 테스트 사용자 생성 가능

## 문제 해결

### RLS 정책 오류
- SQL Editor에서 `SELECT * FROM user_checkins;` 실행 시 권한 오류가 정상입니다
- 클라이언트에서 인증된 사용자로만 접근 가능합니다

### OAuth 콜백 오류
- redirect URI가 정확한지 확인 (`/auth/v1/callback` 경로 포함)
- Site URL과 Redirect URLs가 일치하는지 확인

### CORS 오류
- **Settings** > **API** > **CORS**에서 도메인 추가
