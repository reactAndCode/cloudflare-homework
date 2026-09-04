# my09-auditweb 🔍

Cloudflare Workers, Durable Objects, Puppeteer 브라우저 렌더링, 그리고 Qwen3.8-27b LLM 모델을 활용한 **실시간 AI SEO 웹 감사 에이전트**입니다.

## 🚀 주요 기능
- **브라우저 제어 (Puppeteer)**: Cloudflare Browser Rendering API (`env.BROWSER`)를 통해 사용자가 입력한 웹사이트에 실제 헤드리스 브라우저로 접속합니다.
- **8가지 핵심 SEO 점검**:
  1. `<title>` 존재 여부 및 길이 (10~60자)
  2. `<meta name="description">` 존재 여부 및 길이 (50~160자)
  3. `<h1>` 태그 개수 (정확히 1개)
  4. 모든 `<img>` 태그의 `alt` 속성 존재 유무
  5. Open Graph Meta 태그 (`og:title`, `og:image`) 존재 유무
  6. `<link rel="canonical">` 대표 URL 지정 유무
  7. `<meta name="viewport">` 모바일 반응형 지정 유무
  8. `<html>` 태그 `lang` 언어 속성 유무
- **실시간 렌더링 스크린샷 캡처**: 감사 시점의 웹페이지 화면을 이미지 스크린샷으로 자동 저장 및 시각화.
- **AI 종합 점수 및 가이드 리포트**: `@cf/qwen/qwen3.8-27b` 모델이 통과/실패 항목 분석 및 실패 항목별 개별 수정 HTML 코드 가이드를 생성.
- **대화 및 데이터 지속성**: Durable Object 내 SQLite를 통해 에이전트 단위 대화 히스토리를 유지.

## 🛠️ 기술 스택
- **Frontend**: React 19, TailwindCSS v4, Vite, `@cloudflare/ai-chat`
- **Backend**: Cloudflare Workers, Durable Objects (`AIChatAgent`), `@cloudflare/puppeteer`
- **AI Engine**: Vercel AI SDK (`ai`), `workers-ai-provider`, `@cf/qwen/qwen3.8-27b`

## 🏃 실행 및 테스트
```bash
# 디펜던시 설치
npm install

# 타입 생성
npm run cf-typegen

# 로컬 개발 서버 실행
npm run dev
```
