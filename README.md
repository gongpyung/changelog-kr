# Claude Code 변경 로그 한국어 번역 서비스

Claude Code의 공식 Changelog를 자동으로 한국어로 번역하고 웹페이지로 제공하는 서비스입니다.

## 소개

이 프로젝트는 Claude Code의 최신 업데이트 내용을 한국어 사용자들이 쉽게 확인할 수 있도록 돕습니다. 새로운 버전이 출시되면 자동으로 감지하고 번역하여, Telegram 및 이메일로 알림을 보냅니다. 모든 과정이 GitHub Actions를 통해 자동화되어 있으며, 완전히 무료로 운영됩니다.

## 주요 기능

- **전체 Changelog 한글 번역 웹페이지**: 모든 버전의 변경 사항을 한눈에 확인
- **신규 버전 자동 감지**: 6시간마다 새로운 버전 확인
- **Telegram/Email 알림**: 새 버전 출시 시 즉시 알림 수신
- **GitHub Pages 호스팅**: 안정적인 정적 사이트 호스팅
- **무료 운영**: 모든 서비스의 무료 티어 활용으로 $0/월 비용

## 기술 스택

- **Node.js 20+**: npm 의존성 없이 순수 Node.js 사용
- **Google Cloud Translation API v2**: 무료 500K 문자/월 제공
- **GitHub Actions**: 자동화된 워크플로우
- **GitHub Pages**: 정적 사이트 호스팅
- **Telegram Bot API**: 실시간 알림
- **Resend API**: 이메일 알림 (무료 3,000건/월)

## 빠른 시작 (로컬)

로컬 환경에서 프로젝트를 실행해보려면:

```bash
# 1. 저장소 클론
git clone https://github.com/yourusername/claude-code-changelog-ko.git
cd claude-code-changelog-ko

# 2. 원본 changelog 다운로드
node scripts/fetch-changelog.mjs

# 3. changelog 파싱
node scripts/parse-changelog.mjs

# 4. Mock 번역 (API 키 없이 테스트)
node scripts/translate.mjs --mock

# 5. 사이트 빌드
node scripts/build-site.mjs

# 6. 브라우저에서 site/index.html 열기
# Windows: start site/index.html
# macOS: open site/index.html
# Linux: xdg-open site/index.html
```

## 배포 가이드 (GitHub)

GitHub에서 자동화된 서비스를 운영하는 방법을 단계별로 안내합니다.

### 1단계: GitHub 저장소 생성

1. GitHub에 로그인하고 새 저장소(repository)를 생성합니다
2. 저장소는 반드시 **Public**으로 설정해야 GitHub Pages를 무료로 사용할 수 있습니다
3. 로컬에 클론한 코드를 저장소에 push합니다:

```bash
git remote add origin https://github.com/yourusername/claude-code-changelog-ko.git
git branch -M main
git push -u origin main
```

### 2단계: GitHub Pages 활성화

1. GitHub 저장소 페이지에서 **Settings** 탭을 클릭합니다
2. 왼쪽 메뉴에서 **Pages**를 선택합니다
3. **Source** 섹션에서 드롭다운을 **GitHub Actions**로 변경합니다
4. 저장하면 자동으로 설정이 완료됩니다

이제 코드가 push될 때마다 자동으로 사이트가 빌드되고 배포됩니다.

### 3단계: Google Cloud Translation API 설정

Google 번역 API를 설정하여 자동 번역 기능을 활성화합니다.

1. [Google Cloud Console](https://console.cloud.google.com)에 접속합니다
2. 새 프로젝트를 생성합니다 (예: `claude-changelog-ko`)
3. 상단 검색창에서 "Cloud Translation API"를 검색하고 선택합니다
4. **사용 설정** 버튼을 클릭하여 API를 활성화합니다
5. 왼쪽 메뉴에서 **사용자 인증 정보**를 선택합니다
6. **+ 사용자 인증 정보 만들기** > **API 키**를 선택합니다
7. 생성된 API 키를 복사합니다
8. API 키를 제한하려면 **키 제한** 버튼을 클릭하고:
   - **API 제한사항**에서 "Cloud Translation API"만 선택
   - 저장합니다
9. GitHub 저장소의 **Settings** > **Secrets and variables** > **Actions**로 이동합니다
10. **New repository secret**을 클릭하고:
    - Name: `GOOGLE_TRANSLATE_API_KEY`
    - Secret: 복사한 API 키
    - **Add secret** 클릭

**무료 티어**: Google Cloud Translation API는 매월 500,000자까지 무료로 제공됩니다. Claude Code Changelog는 일반적으로 월 10,000자 이하이므로 충분합니다.

### 4단계: Telegram Bot 설정

Telegram으로 새 버전 알림을 받으려면:

1. Telegram 앱에서 [@BotFather](https://t.me/BotFather)를 검색하여 대화를 시작합니다
2. `/newbot` 명령어를 입력합니다
3. Bot의 이름을 입력합니다 (예: "Claude Changelog KO")
4. Bot의 username을 입력합니다 (예: "claude_changelog_ko_bot", 반드시 `_bot`으로 끝나야 함)
5. BotFather가 제공하는 **Bot Token**을 복사합니다 (예: `123456789:ABCdefGHIjklMNOpqrsTUVwxyz`)

6. 알림을 받을 채널 또는 그룹을 생성합니다:
   - 개인 알림: BotFather에서 생성한 Bot과 직접 대화 시작
   - 채널 알림: 새 채널을 만들고 Bot을 관리자로 추가
   - 그룹 알림: 새 그룹을 만들고 Bot을 추가

7. **Chat ID**를 확인합니다:
   - 브라우저에서 다음 URL을 엽니다 (YOUR_BOT_TOKEN을 실제 토큰으로 교체):
     ```
     https://api.telegram.org/botYOUR_BOT_TOKEN/getUpdates
     ```
   - Bot에게 메시지를 보내거나 채널/그룹에 메시지를 작성합니다
   - 다시 위 URL을 새로고침하면 `"chat":{"id":숫자}` 형태로 Chat ID가 표시됩니다
   - 개인 채팅: 양수 (예: `123456789`)
   - 그룹/채널: 음수 (예: `-1001234567890`)

8. GitHub 저장소의 **Settings** > **Secrets and variables** > **Actions**로 이동합니다
9. 두 개의 Secret을 추가합니다:
   - `TELEGRAM_BOT_TOKEN`: Bot Token
   - `TELEGRAM_CHAT_ID`: Chat ID

### 5단계: 이메일 알림 설정 (Resend)

Resend를 사용하여 이메일 알림을 받으려면:

1. [resend.com](https://resend.com)에 가입합니다
2. 대시보드에서 **API Keys** 메뉴로 이동합니다
3. **Create API Key** 버튼을 클릭하고 키를 생성합니다
4. 생성된 API 키를 복사합니다 (다시 확인할 수 없으므로 안전하게 보관)

5. 도메인 설정 (선택사항):
   - 자신의 도메인을 사용하려면 **Domains** 메뉴에서 도메인을 추가하고 DNS 레코드를 설정합니다
   - 테스트용으로는 Resend가 제공하는 `onboarding@resend.dev`를 사용할 수 있습니다 (일일 제한 있음)

6. GitHub 저장소의 **Settings** > **Secrets and variables** > **Actions**로 이동합니다
7. **Secrets** 탭에서:
   - `RESEND_API_KEY`: Resend API 키

8. **Variables** 탭으로 전환하고 두 개의 변수를 추가합니다:
   - `NOTIFY_EMAIL_FROM`: 발신자 이메일 (예: `noreply@yourdomain.com` 또는 `onboarding@resend.dev`)
   - `NOTIFY_EMAIL_TO`: 수신자 이메일, 여러 명에게 보낼 경우 쉼표로 구분 (예: `user1@example.com,user2@example.com`)

**무료 티어**: Resend는 매월 3,000건의 이메일을 무료로 제공합니다. 하루에 여러 번 확인해도 충분합니다.

### 6단계: 초기 번역 실행

모든 설정이 완료되면 전체 Changelog를 번역합니다:

1. GitHub 저장소의 **Actions** 탭으로 이동합니다
2. 왼쪽 워크플로우 목록에서 **Translate Changelog**를 선택합니다
3. 오른쪽 상단의 **Run workflow** 버튼을 클릭합니다
4. 드롭다운에서:
   - `translate_all`: **true**로 선택 (전체 번역)
   - **Run workflow** 버튼 클릭
5. 워크플로우 실행을 클릭하여 진행 상황을 확인합니다
6. 완료될 때까지 기다립니다 (보통 5-10분 소요)

초기 번역이 완료되면 자동으로 사이트가 빌드되고 배포됩니다.

### 7단계: 사이트 확인

브라우저에서 다음 URL로 접속합니다:

```
https://{username}.github.io/claude-code-changelog-ko/
```

(여기서 `{username}`은 본인의 GitHub 사용자명입니다)

번역된 Changelog가 표시되면 성공입니다! 이제 6시간마다 자동으로 새 버전을 확인하고 번역합니다.

## GitHub Secrets 및 Variables 요약

설정해야 할 모든 값들의 요약입니다:

| 이름 | 유형 | 설명 | 필수 여부 |
|------|------|------|-----------|
| `GOOGLE_TRANSLATE_API_KEY` | Secret | Google Cloud Translation API 키 | 필수 |
| `TELEGRAM_BOT_TOKEN` | Secret | Telegram Bot 토큰 | 선택 (알림 사용 시) |
| `TELEGRAM_CHAT_ID` | Secret | Telegram 채팅 ID (개인/채널/그룹) | 선택 (알림 사용 시) |
| `RESEND_API_KEY` | Secret | Resend 이메일 API 키 | 선택 (이메일 알림 사용 시) |
| `SITE_URL` | Variable | GitHub Pages URL (예: `https://username.github.io/claude-code-changelog-ko`) | 선택 (알림 링크용) |
| `NOTIFY_EMAIL_FROM` | Variable | 발신자 이메일 주소 | 선택 (이메일 알림 사용 시) |
| `NOTIFY_EMAIL_TO` | Variable | 수신자 이메일 주소 (쉼표로 구분) | 선택 (이메일 알림 사용 시) |

**Secrets 추가 경로**: Repository → Settings → Secrets and variables → Actions → Secrets 탭
**Variables 추가 경로**: Repository → Settings → Secrets and variables → Actions → Variables 탭

## 프로젝트 구조

```
claude-code-changelog-ko/
├── .github/
│   └── workflows/
│       ├── check-updates.yml       # 6시간마다 새 버전 확인
│       ├── translate.yml           # 번역 워크플로우
│       ├── build-deploy.yml        # 사이트 빌드 및 배포
│       └── notify.yml              # Telegram/Email 알림 발송
├── scripts/
│   ├── fetch-changelog.mjs         # 원본 Changelog 다운로드
│   ├── parse-changelog.mjs         # Markdown 파싱 및 구조화
│   ├── translate.mjs               # Google Translate API 호출
│   ├── build-site.mjs              # HTML 사이트 생성
│   ├── check-new-version.mjs       # 새 버전 감지
│   └── notify.mjs                  # Telegram/Email 알림 전송
├── data/
│   ├── changelog-original.md       # 다운로드한 원본 Changelog
│   ├── changelog-parsed.json       # 파싱된 JSON 데이터
│   └── changelog-translated.json   # 번역된 JSON 데이터
├── site/
│   ├── index.html                  # 생성된 웹페이지
│   └── styles.css                  # 스타일시트 (인라인 포함)
├── .version                        # 현재 번역된 최신 버전 번호
└── README.md                       # 본 문서
```

## 작동 방식

서비스의 데이터 흐름은 다음과 같습니다:

```
1. check-updates.yml (6시간마다 실행)
   └─> 새 버전 감지 시 translate.yml 트리거

2. translate.yml
   ├─> fetch-changelog.mjs: 원본 다운로드
   ├─> parse-changelog.mjs: JSON 파싱
   ├─> translate.mjs: Google Translate로 번역
   ├─> 변경사항 커밋 및 push
   └─> build-deploy.yml 트리거

3. build-deploy.yml
   ├─> build-site.mjs: HTML 생성
   └─> GitHub Pages에 배포

4. notify.yml (번역 완료 후 실행)
   ├─> notify.mjs --telegram: Telegram 알림
   └─> notify.mjs --email: 이메일 알림
```

**자동화 흐름**:

1. **6시간마다**: `check-updates.yml`이 실행되어 Claude Code의 공식 Changelog를 확인합니다
2. **새 버전 감지**: `.version` 파일과 비교하여 새로운 버전이 있으면 `translate.yml`을 트리거합니다
3. **번역**: Google Cloud Translation API를 사용하여 새로운 내용을 한국어로 번역합니다
4. **커밋**: 번역된 내용을 `data/changelog-translated.json`에 저장하고 자동으로 커밋합니다
5. **배포**: 커밋이 push되면 `build-deploy.yml`이 실행되어 HTML 사이트를 생성하고 GitHub Pages에 배포합니다
6. **알림**: 배포 완료 후 `notify.yml`이 실행되어 Telegram 및 이메일로 알림을 보냅니다

## 비용

모든 서비스의 무료 티어를 활용하여 **완전히 무료**로 운영할 수 있습니다.

| 서비스 | 무료 한도 | 예상 사용량 (월) | 예상 비용 |
|--------|-----------|------------------|-----------|
| **GitHub Actions** | 2,000분/월 (Public repo) | ~50분 (6시간마다 체크, 번역 5-10분) | $0 |
| **GitHub Pages** | 100GB 트래픽/월 | ~1GB (정적 사이트, 소규모 트래픽) | $0 |
| **Google Cloud Translation API** | 500,000자/월 | ~10,000자 (새 버전당 약 2,000자) | $0 |
| **Telegram Bot API** | 무제한 | 무제한 (월 4-8회 알림) | $0 |
| **Resend** | 3,000건/월 | ~10건 (월 4-8회 알림) | $0 |
| **합계** | - | - | **$0/월** |

**참고 사항**:

- Claude Code는 월 1-2회 정도 업데이트되므로 모든 무료 한도 내에서 충분히 운영 가능합니다
- Google Translation API는 초과 시 자동 과금되므로, 예산 알림을 설정하는 것을 권장합니다
- GitHub Actions는 Private 저장소에서 2,000분 제한이 있으므로 Public 저장소 사용을 권장합니다

## FAQ

### 번역 품질은 어떤가요?

Google Cloud Translation API v2를 사용하여 번역하므로 일반적인 Google 번역과 동일한 품질입니다. 기술 용어나 코드 블록은 원문 그대로 보존하여 정확성을 유지합니다.

### 새 버전 감지 주기를 변경할 수 있나요?

네, `.github/workflows/check-updates.yml` 파일의 `schedule` 부분을 수정하면 됩니다:

```yaml
schedule:
  - cron: '0 */6 * * *'  # 6시간마다 → 원하는 주기로 변경
```

예시:
- `0 */12 * * *`: 12시간마다
- `0 0 * * *`: 매일 자정
- `0 9,18 * * *`: 매일 오전 9시, 오후 6시

### 알림을 끄고 싶다면?

특정 알림 방법을 비활성화하려면:

1. **Telegram만 끄기**: `.github/workflows/notify.yml`에서 `notify-telegram` job을 삭제하거나 주석 처리합니다
2. **이메일만 끄기**: `.github/workflows/notify.yml`에서 `notify-email` job을 삭제하거나 주석 처리합니다
3. **모든 알림 끄기**: `.github/workflows/notify.yml` 파일 전체를 삭제합니다

또는 해당 Secret을 삭제하면 워크플로우가 자동으로 스킵됩니다.

### 번역 API 키 없이 사용할 수 있나요?

네, 로컬에서 Mock 모드로 테스트할 수 있습니다:

```bash
node scripts/translate.mjs --mock
```

Mock 모드에서는 실제 번역 대신 `[KO] 원문` 형식으로 표시하여 워크플로우를 테스트할 수 있습니다.

그러나 GitHub Actions에서 자동 번역을 사용하려면 Google Translation API 키가 필수입니다.

### 커스텀 도메인을 사용할 수 있나요?

네, GitHub Pages는 커스텀 도메인을 지원합니다:

1. 도메인의 DNS 설정에서 CNAME 레코드를 추가합니다:
   ```
   www.yourdomain.com -> yourusername.github.io
   ```

2. GitHub 저장소의 **Settings** > **Pages**에서 **Custom domain**에 도메인을 입력합니다

3. **Enforce HTTPS**를 체크합니다

자세한 내용은 [GitHub Pages 공식 문서](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site)를 참고하세요.

### 다른 Changelog도 번역할 수 있나요?

네, `scripts/fetch-changelog.mjs`의 URL만 변경하면 다른 프로젝트의 Changelog도 번역할 수 있습니다:

```javascript
const CHANGELOG_URL = 'https://example.com/other-project/CHANGELOG.md';
```

단, Changelog 형식이 다르면 `parse-changelog.mjs`의 파싱 로직을 수정해야 할 수 있습니다.

### 번역 결과를 수동으로 수정할 수 있나요?

네, `data/changelog-translated.json` 파일을 직접 편집할 수 있습니다. 하지만 다음 자동 번역 시 덮어씌워질 수 있으므로, 수정 사항을 유지하려면 번역 스크립트를 수정하거나 번역 후 후처리 스크립트를 추가해야 합니다.

## 라이선스

MIT License

Copyright (c) 2025

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

---

**참고**: 본 프로젝트는 Anthropic의 공식 프로젝트가 아니며, 커뮤니티에서 운영하는 비공식 번역 서비스입니다.
