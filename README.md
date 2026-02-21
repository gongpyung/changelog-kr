<div align="center">

# >_ ChangeLog.kr

**AI 도구 업데이트, 한국어로**

[![GitHub Pages](https://img.shields.io/badge/GitHub%20Pages-Live-00D9FF?style=for-the-badge&logo=github)](https://changelog.kr)
[![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)](LICENSE)

[사이트 바로가기](https://changelog.kr) · [기능 요청](https://github.com/gongpyung/changelog-kr/issues)

</div>

---

## 🎯 소개

**ChangeLog.kr**은 AI 도구들의 변경 로그를 **한국어**로 제공하는 서비스입니다.

- 🤖 **모든 AI 도구** - 코딩 어시스턴트부터 범용 AI까지
- 🇰🇷 **자동 한국어 번역** - 영어 원문도 함께 제공
- ⚡ **실시간 업데이트** - 6시간마다 새 버전 확인
- 📱 **반응형 디자인** - 모바일에서도 편하게

---

## 🛠️ 지원 서비스

| 서비스 | 제공사 | 소스 | 상태 |
|--------|--------|------|------|
| **Claude Code** | Anthropic | GitHub Releases | ✅ |
| **Codex CLI** | OpenAI | GitHub Releases | ✅ |
| **Gemini CLI** | Google | GitHub Releases | ✅ |
| **oh-my-claudecode** | Yeachan Heo | GitHub Releases | ✅ |
| **oh-my-opencode** | Yeongyu Kim | GitHub Releases | ✅ |
| **OpenClaw** | OpenClaw | GitHub Releases | ✅ |

> 💡 새로운 서비스 추가를 원하시면 [Issue](https://github.com/gongpyung/changelog-kr/issues)를 열어주세요!

---

## ✨ 주요 기능

<table>
<tr>
<td width="50%">

### 🌙 다크/라이트 모드
Neon Terminal 다크 테마 + 깔끔한 라이트 테마

</td>
<td width="50%">

### 🔍 강력한 검색
버전, 카테고리, 키워드로 빠르게 찾기

</td>
</tr>
<tr>
<td width="50%">

### 📂 카테고리 필터
추가 / 수정 / 개선 / 변경 / 제거

</td>
<td width="50%">

### ✅ 사용자 체크인
로그인 후 확인한 버전을 기록하고 NEW 배지로 미확인 업데이트 파악

</td>
</tr>
</table>

---

## 🚀 빠른 시작

### 로컬에서 실행

```bash
# 저장소 클론
git clone https://github.com/gongpyung/changelog-kr.git
cd changelog-kr

# 사이트 빌드
node scripts/build-site.mjs

# 로컬 서버 실행
cd site && python -m http.server 8080
# 또는: npx serve site
```

브라우저에서 http://localhost:8080 접속

### Supabase 로그인/체크인 기능 설정 (선택)

로그인 및 버전 확인 기록 기능을 로컬에서 사용하려면 `.env` 파일을 생성하세요.
설정하지 않아도 사이트는 정상 동작하며, 로그인/체크인 기능만 비활성화됩니다.

```bash
# .env 파일 생성
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
```

---

## 📁 프로젝트 구조

```
changelog-kr/
├── 📂 data/
│   ├── services.json                # 서비스 설정 (6개 서비스)
│   └── services/
│       ├── claude-code/
│       │   └── translations/*.json  # 버전별 번역
│       ├── codex-cli/
│       ├── gemini-cli/
│       ├── oh-my-claudecode/
│       ├── oh-my-opencode/
│       └── openclaw/
├── 📂 scripts/
│   ├── build-site.mjs               # 사이트 빌드
│   ├── detect-new-versions.mjs      # 새 버전 감지
│   ├── parse-changelog.mjs          # Changelog 파싱
│   └── translate.mjs                # AI 번역 (다중 서비스)
├── 📂 site/                         # 빌드 출력 (정적 사이트)
│   ├── index.html
│   ├── assets/
│   │   ├── app.js                   # 클라이언트 JS (IIFE 패턴)
│   │   ├── supabase-client.js       # Supabase Auth + DB 쿼리
│   │   ├── checkin.js               # 버전 확인 기록 관리
│   │   ├── style.css                # CSS 변수 + Tailwind CDN
│   │   └── favicon.svg
│   └── data/services/               # 서비스별 번역 데이터
├── 📂 supabase/
│   └── schema.sql                   # DB 스키마 (user_checkins + RLS)
├── 📂 templates/
│   └── index.html.template          # HTML 템플릿
├── 📂 tests/                        # 단위 테스트
└── 📂 .github/workflows/            # CI/CD 자동화
```

---

## 🔧 기술 스택

| 영역 | 기술 |
|------|------|
| **Frontend** | Vanilla JS, Tailwind CSS (CDN) |
| **인증/DB** | Supabase (PostgreSQL + Auth, GitHub/Google OAuth) |
| **Design** | Neon Terminal Theme (CSS 변수 + dark/light 모드) |
| **Translation** | OpenAI GPT-4o / Gemini API / Google Translate |
| **Parsing** | Markdown 파서 + GitHub Releases API 파서 |
| **Hosting** | GitHub Pages |
| **CI/CD** | GitHub Actions (6시간 주기 자동 감지/번역/배포) |
| **Testing** | Node.js 내장 테스트 (`node --test`) |

---

## 🤝 기여하기

기여를 환영합니다! 다음과 같은 방법으로 참여할 수 있습니다:

1. 🐛 **버그 리포트** - Issue 열기
2. 💡 **기능 제안** - 새 서비스 추가 요청
3. 🔧 **코드 기여** - Pull Request
4. 📝 **번역 개선** - 오역 수정 제안

---

## 📄 라이선스

MIT License © 2025

---

<div align="center">

**ChangeLog.kr** - AI 도구 업데이트를 한국어로

본 프로젝트는 각 AI 서비스의 공식 프로젝트가 아닌 커뮤니티 운영 서비스입니다.

</div>
