# Implementation Plan - my09-browser 개발

`my09-auditweb` 프로젝트를 기반으로 Cloudflare Workers, Durable Objects, `@cf/zai-org/glm-4.7-flash` 모델 및 `agents/browser/ai` 도구를 사용하는 웹 브라우징 에이전트 프로젝트(`my09-browser`)를 새로 작성합니다.

## User Requirements & Tech Stack

- **Frontend**: React, TailwindCSS, Vite
- **Backend**: Cloudflare Workers, Durable Objects (SQLite 기반), Vercel AI SDK (`ai`), Cloudflare AI SDK (`@cloudflare/ai-chat`), Cloudflare Agents SDK (`agents`)
- **AI Model**: `@cf/zai-org/glm-4.7-flash`
- **Database (Persistence)**: Durable Objects 내 SQLite (채팅 기록 자동 저장)

## Proposed Changes

### 1. `my09-browser` 디렉토리 및 프로젝트 기반 구성
- 위치: `d:\dev\cloudflare\cloudflare-homework\my09-browser`
- `package.json`: 의존성 정의 (`@cloudflare/ai-chat`, `agents`, `ai`, `workers-ai-provider`, `react`, `tailwindcss`, `@tailwindcss/vite`, `vite`, `wrangler` 등)
- `wrangler.jsonc`:
  - `name`: `my09-browser`
  - `main`: `worker/index.ts`
  - `browser`: `{ "binding": "BROWSER" }`
  - `worker_loaders`: `[{ "binding": "LOADER" }]`
  - `ai`: `{ "binding": "AI", "remote": true }`
  - `durable_objects`: `BrowserAgent` 바인딩 정의
  - `migrations`: `BrowserAgent` SQLite 클래스 정의
- `vite.config.ts`, `tsconfig.json`, `tsconfig.app.json`, `tsconfig.worker.json`, `index.html` 설정

### 2. Backend 구현 (`worker/index.ts`)
- `@cloudflare/ai-chat`의 `AIChatAgent`를 상속받은 `BrowserAgent` 정의
- `onChatMessage`:
  - `createWorkersAI({ binding: this.env.AI })`
  - `createBrowserTools({ browser: this.env.BROWSER, loader: this.env.LOADER })`
  - `streamText` 실행 (`model: workersAi("@cf/zai-org/glm-4.7-flash")`, `system: "You can browse the web and inspect pages."`, `tools: { ...browserTools }`, `stopWhen: isLoopFinished()`)
  - `result.toUIMessageStreamResponse()` 반환
- `export default` 에 `routeAgentRequest(request, env)` 연동

### 3. Frontend 구현 (`src/App.tsx`, `src/main.tsx`, `src/index.css`)
- `useAgentChat` 및 `useAgent` (`agents/ai-react`, `agents/react`) 사용
- Vercel AI SDK UI 메시지 렌더링 (`renderMessage`: text, reasoning, tool approval, output-denied, output-available 등)
- 사용자 제출 헤더 및 인터랙티브 UI 제공

## Verification Plan

### Automated / Build Verification
1. `npm install` 실행
2. `npm run build` 또는 `npx tsc --noEmit`을 통한 타입 검사 및 빌드 검증

### Manual Verification
1. `App.tsx` 및 `worker/index.ts` 코드 완성도 체크
