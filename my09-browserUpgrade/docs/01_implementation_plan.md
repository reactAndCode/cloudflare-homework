# 01. my09-browserUpgrade 자율 웹 탐색 에이전트 구현 계획서

본 문서는 **자율 웹 탐색 AI 에이전트(`my09-browserUpgrade`)**의 구현 계획, 아키텍처 설계, 4대 전용 도구 체계 및 배포 가이드 문서입니다.

---

## 📌 1. 핵심 요구사항 및 개요

- **목표**: 에이전트가 `nomadcoders.co` 등 임의의 웹사이트에 접속하여 시작 URL 및 질문이 주어졌을 때 자율적으로 링크를 탐색하고, 정답 및 이동 경로/증거 스크린샷을 보고하는 Autonomous Web Agent 구축.
- **4대 전용 도구 (Shared Session Tools)**:
  1. ⚡ `webFetch({ url })`: HTTP 직접 요청으로 마크다운 링크 `[text](url)` 및 텍스트 렌더링 없이 고속 추출.
  2. 📖 `readPage({ url? })`: 현재 브라우저 DOM 텍스트 및 링크 목록(`{ text, href }[]`) 반환.
  3. 🔗 `followLink({ href })`: 원하는 링크로 이동하고 새 페이지의 타임스탬프 스크린샷을 `/evidence/<key>`에 기록.
  4. 📸 `screenshot()`: 요청 시 현재 페이지 스크린샷 캡처 및 기록.
- **핵심 탐색 루프**:
  - `webFetch` 또는 `readPage` ➔ 다음 링크 선택 ➔ `followLink` 또는 이동 ➔ 증거 스크린샷 저장 ➔ 최대 5회(Max 5 Steps) 내 반복.
- **관측 및 UI (Observability)**:
  - 🔴 **Live View**: 1.5초 간격으로 Agent Chrome 탭 실시간 관측 스트림 (`/live-view/image`).
  - 📸 **Evidence Gallery**: 각 탐색 Step에서 저장된 `/evidence/<key>` 스크린샷 타임라인 제공.
- **무료 플랜 (Free Plan) 호환**:
  - `worker_loaders` 및 `CodemodeRuntime` 미사용으로 유료 플랜 요구사항 해소 및 R2 In-memory Fallback 처리.

---

## 🛠️ 2. 기술 스택

- **Frontend**: React 19, TailwindCSS 4, Vite 8
- **Backend**: Cloudflare Workers, Durable Objects (`BrowserAgent`), `@cloudflare/ai-chat`, `agents` SDK
- **AI Models**: `@cf/zai-org/glm-4.7-flash` (Primary), `@cf/qwen/qwen3.8-27b` (Fallback)
- **Browser Automation**: `@cloudflare/puppeteer` (`BROWSER`)
- **Persistence**: SQLite in Durable Objects, In-memory Evidence Store (`Map`) & R2 Bucket Fallback
