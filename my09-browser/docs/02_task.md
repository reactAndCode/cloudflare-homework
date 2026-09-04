# Task: my09-browser 프로젝트 및 에이전트 개발

- [x] `my09-browser` 디렉토리 구조 및 설정 파일 생성 (`wrangler.jsonc`, `package.json`, `vite.config.ts`, `tsconfig.json` 등) <!-- id: 0 -->
- [x] Backend Worker 구현 (`worker/index.ts`) <!-- id: 1 -->
  - `BrowserAgent` (Durable Object / `AIChatAgent`) 등록
  - `@cf/zai-org/glm-4.7-flash` 모델 및 `createBrowserTools` 연동
  - `routeAgentRequest` 라우팅 설정
- [x] Frontend React 구현 (`src/App.tsx`, `src/main.tsx`, `src/index.css` 등) <!-- id: 2 -->
  - `useAgent` & `useAgentChat` 훅 사용
  - Vercel AI SDK UI tooling approval / output 렌더링 지원 (`renderMessage`)
  - TailwindCSS 디자인 적용
- [x] 의존성 설치 및 TypeScript 타입 검사/빌드 확인 <!-- id: 3 -->
- [x] 결과 검증 및 Walkthrough 아티팩트 생성 <!-- id: 4 -->
