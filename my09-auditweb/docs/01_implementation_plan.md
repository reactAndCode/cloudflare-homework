# [Implementation Plan] my09-auditweb SEO 감사 에이전트

`my08-orderchat` 프로젝트를 기반으로, 브라우저 자동화(Cloudflare Browser Rendering / Puppeteer)와 LLM(`@cf/qwen/qwen3.8-27b`)을 결합한 웹사이트 SEO 감사 에이전트를 구축합니다.

## 1. 개요 및 세부 요구사항

- **목적**: URL을 제공받아 실제 헤드리스 브라우저로 접속하고 8가지 핵심 SEO 항목을 정밀 검사 후 스크린샷과 함께 종합 감사 리포트를 생성.
- **Frontend**: React, TailwindCSS v4, Vite, `@cloudflare/ai-chat/react`, `agents/react`
- **Backend**: Cloudflare Workers, Durable Objects (`AIChatAgent`), Vercel AI SDK (`ai`), `workers-ai-provider`, `@cloudflare/puppeteer`
- **AI Model**: `@cf/qwen/qwen3.8-27b`
- **검사 항목 (8가지, 항목당 12.5점)**:
  1. `<title>` 존재 여부 및 길이 (10~60자)
  2. `<meta name="description">` 존재 여부 및 길이 (50~160자)
  3. `<h1>` 태그가 정확히 1개 존재하는가
  4. 모든 `<img>` 태그에 `alt` 속성이 있는가
  5. `<meta property="og:title">`과 `<meta property="og:image">`가 모두 존재하는가
  6. `<link rel="canonical">`이 존재하는가
  7. `<meta name="viewport">`가 존재하는가
  8. `<html>` 태그에 `lang` 속성이 있는가

---

## 2. 모듈별 파일 설계

### 2.1 설정 파일 (`package.json`, `wrangler.jsonc`, `vite.config.ts`, `tsconfig.json`)
- **`package.json`**: `@cloudflare/puppeteer`, `@cloudflare/ai-chat`, `agents`, `ai`, `workers-ai-provider`, `zod`, `react`, `react-dom`, `@tailwindcss/vite`, `tailwindcss` 포함
- **`wrangler.jsonc`**:
  - `name`: `"my09-auditweb"`
  - `browser`: `{ "binding": "BROWSER" }`
  - `ai`: `{ "binding": "AI", "remote": true }`
  - `durable_objects`: `SeoAuditAgent`
  - `migrations`: `SeoAuditAgent`
- **`worker-configuration.d.ts`**: TypeScript 타입 정의 (`BROWSER: Fetcher`, `AI: any`, `SeoAuditAgent: DurableObjectNamespace`)

### 2.2 Worker 백엔드 (`worker/tools.ts`, `worker/index.ts`)
- **`worker/tools.ts`**:
  - `auditSeo(url)` 도구 정의 (`tool` from `ai`)
  - `puppeteer.launch(env.BROWSER)`로 헤드리스 브라우저 시작
  - `page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 })`
  - `page.evaluate(...)` 내에서 DOM을 조회하여 8개 SEO 규칙 검사
  - `page.screenshot({ encoding: 'base64', type: 'jpeg', quality: 60 })` 로 스크린샷 캡처
  - 점수 계산: `passCount * 12.5`
  - 도구 리턴 값: `{ score, checks: [...], screenshot: "data:image/jpeg;base64,...", url }`
- **`worker/index.ts`**:
  - `SeoAuditAgent` 클래스 (`AIChatAgent<Env>` 상속)
  - `onChatMessage`: `@cf/qwen/qwen3.8-27b` 모델 사용
  - 전문적인 SEO 시스템 프롬프트 탑재

### 2.3 프론트엔드 (`src/App.tsx`, `src/index.css`)
- **UI 구성**:
  - SEO 감사 대시보드 헤더 & 입력창 & 샘플 URL 버튼
  - 채팅 메시지 영역 (사용자 / 에이전트 대화)
  - `auditSeo` 도구 실행 결과 렌더링 카드:
    - 점수 뱃지 (0~100점, 색상별 구분: 80점 이상 초록, 50~79점 주황, 50점 미만 빨강)
    - 8개 검사 항목 통과/실패 체크리스트 UI
    - 캡처된 페이지 스크린샷 미리보기 모달/카드
  - AI LLM이 제공하는 정밀 가이드 마크다운 렌더링

---

## 3. 진행 단계

1. **파일 구성**: `my09-auditweb` 디렉터리에 `package.json`, `wrangler.jsonc`, `tsconfig*.json`, `vite.config.ts`, `index.html` 생성
2. **백엔드 구현**: `worker/tools.ts`, `worker/index.ts`, `worker-configuration.d.ts` 작성
3. **프론트엔드 구현**: `src/index.css`, `src/main.tsx`, `src/App.tsx` 작성
4. **검증**: `npm run build` 또는 TypeScript 타입 체크 수행
