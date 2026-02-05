<div align="center">

# >_ ChangeLog.kr

**AI 도구 업데이트, 한국어로**

[![GitHub Pages](https://img.shields.io/badge/GitHub%20Pages-Live-00D9FF?style=for-the-badge&logo=github)](https://gongpyung.github.io/changelog-kr)
[![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)](LICENSE)

[사이트 바로가기](https://gongpyung.github.io/changelog-kr) · [기능 요청](https://github.com/gongpyung/changelog-kr/issues)

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

| 서비스 | 카테고리 | 상태 |
|--------|----------|------|
| **Claude Code** | 코딩 어시스턴트 | ✅ 지원 중 |
| Cursor | 코딩 어시스턴트 | 🔜 준비 중 |
| Windsurf | 코딩 어시스턴트 | 🔜 준비 중 |
| GitHub Copilot | 코딩 어시스턴트 | 📋 예정 |
| ChatGPT | 범용 AI | 📋 예정 |
| Gemini | 범용 AI | 📋 예정 |
| Perplexity | 범용 AI | 📋 예정 |

> 💡 새로운 서비스 추가를 원하시면 [Issue](https://github.com/gongpyung/changelog-kr/issues)를 열어주세요!

---

## ✨ 주요 기능

<table>
<tr>
<td width="50%">

### 🌙 다크 모드
Neon Terminal 테마로 눈의 피로를 줄여줍니다.

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

### 🔔 알림 지원
Telegram, Email로 새 버전 알림

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

---

## 📁 프로젝트 구조

```
changelog-kr/
├── 📂 data/
│   ├── services.json              # 서비스 메타데이터
│   └── services/
│       └── claude-code/
│           └── translations/      # 버전별 번역 JSON
├── 📂 scripts/
│   ├── build-site.mjs             # 사이트 빌드
│   ├── fetch-changelog.mjs        # Changelog 다운로드
│   ├── parse-changelog.mjs        # Markdown 파싱
│   └── translate.mjs              # AI 번역
├── 📂 site/
│   ├── index.html                 # 메인 페이지
│   └── assets/
│       ├── app.js                 # 클라이언트 앱
│       ├── style.css              # Neon Terminal 테마
│       └── favicon.svg            # 파비콘
├── 📂 templates/
│   └── index.html.template        # HTML 템플릿
└── 📂 .github/workflows/          # GitHub Actions
```

---

## 🔧 기술 스택

| 영역 | 기술 |
|------|------|
| **Frontend** | Vanilla JS, Tailwind CSS |
| **Design** | Neon Terminal Theme |
| **Translation** | Google Cloud Translation API |
| **Hosting** | GitHub Pages |
| **Automation** | GitHub Actions |
| **Notifications** | Telegram Bot, Resend (Email) |

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
