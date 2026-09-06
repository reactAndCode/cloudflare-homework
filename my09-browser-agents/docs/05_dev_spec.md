# 05. AI 브라우저 에이전트 (my09-browser-agents) 개발 명세 및 분석 보고서 (Dev Spec)

## 1. 개요 (Overview)

본 문서는 `my09-browser-agents` 프로젝트의 아키텍처, Cloudflare 플랫폼 바인딩(Workers, Durable Objects, Workers AI, Browser Rendering), 소스 코드 구조, 빌드/실행 시 발생한 오류 원인과 해결 내역, 그리고 향후 브라우저 자동화 확장을 위한 테스트 스토리를 상세히 기술합니다.

이 프로젝트는 Cloudflare Agents SDK(`@cloudflare/ai-chat`, `agents`)를 기반으로 하여, 브라우저 자동화(`Browser Rendering / Puppeteer`) 및 대화형 AI 기능을 결합한 차세대 자율형 웹 탐색 에이전트(Web Browsing Agent)를 구축하기 위한 풀스택 프로젝트입니다.

---

## 2. 기술 스택 및 환경 구성

### 2.1. 프론트엔드 (Client)
- **Framework**: React 19 (`react@^19.2.5`, `react-dom@^19.2.5`)
- **Build Tool**: Vite 8 (`vite@^8.0.10`)
- **Styling**: TailwindCSS v4 (`@tailwindcss/vite`, `tailwindcss@^4.3.0`)
- **Agent SDK**:
  - `@cloudflare/ai-chat/react`: 실시간 채팅 세션 훅(`useAgentChat`)
  - `agents/react`: Durable Object 기반 에이전트 연결 훅(`useAgent`)
  - `ai`: Vercel AI SDK UI 타입 및 도구 파트 유틸리티(`UIMessage`, `isToolUIPart`, `getToolName`)

### 2.2. 백엔드 (Cloudflare Worker & Durable Objects)
- **Runtime**: Cloudflare Workers (`compatibility_date: 2026-05-15`, `nodejs_compat`)
- **Agent Framework**:
  - `@cloudflare/ai-chat`: 채팅 에이전트 베이스 클래스(`AIChatAgent`)
  - `agents@0.22.0`: Durable Object 에이전트 라우팅(`routeAgentRequest`) 및 세션 관리
- **State & Storage**: Durable Objects + SQLite 내장 스토리지 (에이전트별 세션 상태 및 채팅 로그 영구 저장)
- **Bundler & Plugins**:
  - `@cloudflare/vite-plugin@^1.37.0`: Vite 기반 Cloudflare Worker 빌드 및 Dev 환경 통합
  - `agents/vite`: Agents 데코레이터 및 런타임 변환 플러그인
  - `@babel/plugin-proposal-decorators`: 데코레이터 트랜스파일링 지원

### 2.3. Cloudflare 바인딩 사양 (`wrangler.jsonc`)
| 바인딩 명 | 타입 | 목적 |
|---|---|---|
| **`AI`** | Workers AI | Cloudflare 인프라에서 실행되는 LLM 추론 엔진 연동 |
| **`BrowserAgent`** | Durable Objects | 사용자/세션별 격리된 상태 및 영구 저장소를 갖는 에이전트 컨테이너 |
| **`BROWSER`** | Browser Rendering | Headless Chromium 브라우저 세션 제어(Puppeteer / CDP) |
| **`LOADER`** | Worker Loaders | 동적 워커 로딩 및 격리 런타임 제어 지원 |

---

## 3. 발생했던 오류 분석 및 해결 내역 (Troubleshooting)

프로젝트 생성 직후 발생했던 빌드 및 실행 오류의 원인과 조치 내역은 다음과 같습니다.

### 3.1. [빌드 오류 1] `worker/index.ts` 비동기 반환 타입 불일치 (TS2322)
- **증상**: `npm run build` 시 `tsc -b` 단계에서 컴파일 에러 발생
  ```text
  worker/index.ts(7,3): error TS2322: Type '(request: Request, env: Env) => Promise<Response | null>' 
  is not assignable to type 'ExportedHandlerFetchHandler<Env, unknown, unknown>'.
  ```
- **원인**: `routeAgentRequest(request, env)`는 `Promise<Response | null>`를 반환하는 비동기 함수입니다. 기존 코드에서 `await` 없이 `routeAgentRequest(request, env) ?? new Response(...)`를 사용하여 `Promise` 객체 자체에 nullish 병합 연산자가 적용되었고, 결과적으로 `null`이 포함된 미해결 Promise가 반환되어 타입 에러가 발생했습니다.
- **해결 조치**: `fetch` 핸들러를 `async`로 변경하고 `await`를 적용하여 항상 유효한 `Response`가 반환되도록 수정했습니다.
  ```typescript
  export default {
    async fetch(request, env) {
      return (
        (await routeAgentRequest(request, env)) ??
        new Response("Not found", { status: 404 })
      );
    },
  } satisfies ExportedHandler<Env>;
  ```

### 3.2. [빌드 오류 2] `agents` 패키지 버전 불일치로 인한 누락 Export 에러
- **증상**: `vite build` 중 `@cloudflare/ai-chat` 번들링 단계에서 누락된 export 에러 발생
  ```text
  [MISSING_EXPORT] "createChatFiberSnapshot" is not exported by "node_modules/agents/dist/chat/index.js".
  [MISSING_EXPORT] "unwrapChatFiberSnapshot" is not exported by "node_modules/agents/dist/chat/index.js".
  [MISSING_EXPORT] "wrapChatFiberSnapshot" is not exported by "node_modules/agents/dist/chat/index.js".
  ```
- **원인**: `package.json`에 지정된 `agents`의 구버전(`^0.12.4`)에는 스냅샷 직렬화 함수들이 포함되어 있지 않았으나, 의존 중인 `@cloudflare/ai-chat@^0.7.0`은 해당 함수들을 필수적으로 참조하여 발생했습니다.
- **해결 조치**: `agents` 패키지를 최신 안정 버전인 `^0.22.0`으로 업그레이드 설치하여 export 시그니처를 일치시켰습니다.

### 3.3. [빌드 오류 3] `@rolldown/plugin-babel` 데코레이터 플러그인 누락
- **증상**: Vite 빌드 중 Babel 플러그인 로드 실패
  ```text
  [plugin @rolldown/plugin-babel] Cannot find package '@babel/plugin-proposal-decorators' imported from ...\babel-virtual-resolve-base.js
  ```
- **원인**: `agents/vite` 플러그인이 데코레이터 처리를 위해 가상 베이스 경로에서 Babel 플러그인을 동적으로 import하려 했으나, 최상위 `node_modules`에 직접 등록되어 있지 않아 모듈 해석에 실패했습니다.
- **해결 조치**: `npm install -D @babel/plugin-proposal-decorators`를 실행하여 프로젝트 최상위 의존성으로 명시적 추가했습니다.

### 3.4. [실행 분석] `npm run dev` 시 원격 세션(Remote Proxy Session) 요구 사항
- **증상**: 비대화형 환경에서 `npm run dev` 실행 시 다음 에러 발생
  ```text
  ⎔ Establishing remote connection...
  Error: Failed to start the remote proxy session. 
  In a non-interactive environment, it's necessary to set a CLOUDFLARE_API_TOKEN environment variable for wrangler to work.
  ```
- **원인 분석**:
  1. `wrangler.jsonc`에 선언된 `ai` (`Workers AI`) 및 `browser` (`Browser Rendering`) 바인딩은 로컬 시뮬레이터가 제공되지 않는 클라우드 전용 리소스입니다.
  2. 따라서 `@cloudflare/vite-plugin`은 로컬 개발 시에도 Cloudflare 클라우드 인프라의 실제 AI 및 브라우저 세션을 연동하는 **Remote Proxy Session**을 자동으로 시작합니다.
  3. 현재 터미널이 비대화형(Non-interactive)이거나 기존 Wrangler 로그인 토큰이 만료되었을 때, `CLOUDFLARE_API_TOKEN` 환경변수가 주어지지 않으면 원격 인증에 실패하여 서버가 중단됩니다.
- **해결 및 실행 방법**:
  1. **방법 A (권장 - 대화형 로그인)**:
     ```bash
     npx wrangler login
     npm run dev
     ```
     브라우저가 열리면 Cloudflare 계정을 승인하여 토큰을 갱신합니다.
  2. **방법 B (API 토큰 환경변수 등록)**:
     - Cloudflare 대시보드에서 `Workers AI: Read`, `Browser Rendering: Edit` 권한이 있는 API 토큰 발급
     - 프로젝트 루트에 `.dev.vars` 파일을 생성하거나 터미널 세션에 등록:
       ```env
       CLOUDFLARE_API_TOKEN=your_cloudflare_api_token_here
       ```

### 3.5. [런타임 오류] `onChatMessage` 미구현 (채팅 메시지 수신 시 서버 예외 발생)
- **증상**: `npm run dev` 실행 후 브라우저(http://localhost:5173/)에서 메시지를 보냈을 때 터미널에 다음 에러 발생
  ```text
  Error on server: Error: received a chat message, override onChatMessage and return a Response to send to the client
      at BrowserAgent.onChatMessage (C:/work/mydev/cloudflare/my09-browser-agents/node_modules/@cloudflare/ai-chat/dist/index.js:1018:9)
  ```
- **원인**: `AIChatAgent` 베이스 클래스는 `onChatMessage` 메서드를 필수로 오버라이드하도록 설계되어 있습니다. 기존 `BrowserAgent` 클래스가 비어 있는 템플릿 상태(`class BrowserAgent extends AIChatAgent<Env> {}`)였기 때문에, 사용자의 새 메시지가 들어왔을 때 기본 예외가 발생했습니다.
- **해결 조치**:
  1. `worker/tools.ts`에 브라우저 및 웹 탐색 도구(`browseUrl`, `searchWeb`, `executeBrowserAction`)를 구현했습니다.
  2. `worker/index.ts`의 `BrowserAgent` 클래스에 `onChatMessage`를 오버라이드하여 `Workers AI (@cf/qwen/qwen3.8-27b)` 모델과 도구 세트를 바인딩하고 `result.toUIMessageStreamResponse()`를 반환하도록 완성했습니다.

---

## 4. 소스 코드 상세 분석 (Code Architecture)

### 4.1. 백엔드 Worker 및 도구 명세 (`worker/index.ts`, `worker/tools.ts`)

#### 1) `worker/index.ts` (에이전트 컨트롤러)
```typescript
export class BrowserAgent extends AIChatAgent<Env> {
  async onChatMessage(
    _onFinish: StreamTextOnFinishCallback<ToolSet>,
    options?: { abortSignal?: AbortSignal },
  ) {
    const workersAi = createWorkersAI({ binding: this.env.AI });
    const tools = createBrowserTools();

    const result = streamText({
      model: workersAi("@cf/qwen/qwen3.8-27b"),
      system: `당신은 웹 탐색 및 브라우저 제어 전문 AI 비서(Browser Agent)입니다...`,
      messages: await convertToModelMessages(this.messages),
      tools: tools as ToolSet,
      abortSignal: options?.abortSignal,
      stopWhen: isLoopFinished(),
    });

    return result.toUIMessageStreamResponse();
  }
}
```

#### 2) `worker/tools.ts` (브라우저 도구 명세)
| 도구명 | 실행 방식 | 설명 | 주요 파라미터 | 승인(Approval) 필요 여부 |
|---|---|---|---|---|
| **`browseUrl`** | 서버 직접 실행 | 웹페이지 URL의 HTML을 가져와 텍스트를 추출 | `url` (웹사이트 주소) | X (즉시 실행) |
| **`searchWeb`** | 서버 직접 실행 | 웹 검색을 수행하여 연관 결과 및 스니펫 반환 | `query` (검색 키워드) | X (즉시 실행) |
| **`executeBrowserAction`** | 사용자 승인 후 실행 | 브라우저 이동, 스크린샷, 폼 제출 등 브라우저 제어 | `action`, `targetUrl`, `reason` | **O (`needsApproval: true`)** |


### 4.2. 프론트엔드 UI 컴포넌트 (`src/App.tsx`)
1. **에이전트 연결 및 상태 관리**:
   - `useAgent({ agent: "BrowserAgent" })`: 백엔드의 `BrowserAgent` Durable Object와 양방향 통신 채널을 수립합니다.
   - `useAgentChat({ agent })`: 메시지 배열(`messages`), 전송 함수(`sendMessage`), 대화 초기화(`clearHistory`), 중단(`stop`), 도구 승인 콜백(`addToolApprovalResponse`) 등을 반환합니다.
2. **도구 승인 (Human-in-the-loop) 워크플로우**:
   - 브라우저 제어(결제 버튼 클릭, 특정 URL 이동 등)는 민감한 작업일 수 있으므로 `part.state === "approval-requested"` 상태를 감지하여 UI에 노란색 경고 카드와 `[Approve]` / `[Reject]` 버튼을 렌더링합니다.
   - 사용자가 버튼을 클릭하면 `addToolApprovalResponse({ id, approved })`를 호출하여 실행 여부를 결정합니다.
3. **메시지 렌더링 파이프라인 (`renderMessage`)**:
   - `text`: 마크다운 텍스트 표시
   - `reasoning`: AI 모델의 내부 영어 생각/추론 과정은 화면에 불필요하게 노출되지 않도록 **완전 숨김 처리(`return null;`)**
   - `tool-invocation / tool-result`: 도구 이름, 입력 JSON, 출력 결과를 코드 블록으로 시각화

### 4.3. 설정 파일 (`wrangler.jsonc`, `vite.config.ts`)
- **`wrangler.jsonc`**:
  - `browser: { binding: "BROWSER" }`: Cloudflare Browser Rendering 인스턴스를 주입
  - `ai: { binding: "AI" }`: Workers AI 모델 인퍼런스 바인딩
  - `durable_objects`: `BrowserAgent` 클래스를 SQLite 활성화 상태로 바인딩
- **`vite.config.ts`**:
  - `plugins: [agents(), react(), tailwindcss(), cloudflare()]` 순서로 로드되어, Vite 개발 서버와 Cloudflare 워커 런타임, Tailwind CSS v4 스타일링 시스템을 완벽하게 통합합니다.

---

## 5. 테스트 스토리보드 (Test Stories)

### Story 1: 정적 타입 분석 및 프로덕션 빌드 검증
- **목적**: TypeScript 컴파일과 Vite 번들링이 에러 없이 완결되는지 확인
- **절차**:
  1. `npm run build` 실행
- **검증 기준**:
  - `tsc -b`가 0개의 오류로 통과할 것.
  - `vite build` 결과 `dist/my09_browser_agents/index.js` 및 `dist/client/index.html`이 정상 생성될 것.
  - [현재 상태: ✅ 통과 완료]

### Story 2: 로컬 개발 환경 기동 및 토큰 연동 테스트
- **목적**: `@cloudflare/vite-plugin`의 원격 프록시 세션 정상 수립 확인
- **절차**:
  1. `npx wrangler login` 또는 `CLOUDFLARE_API_TOKEN` 환경변수 설정
  2. `npm run dev` 실행
  3. 터미널에 `Local: http://localhost:5173` 링크 출력 확인
- **검증 기준**:
  - 원격 프록시 세션이 에러 없이 연결되고 브라우저에서 챗 화면이 열려야 함.

### Story 3: 기본 대화 및 상태 지속성(Persistence) 테스트
- **목적**: Durable Object SQLite를 통한 메시지 히스토리 유지 확인
- **절차**:
  1. 브라우저에서 `http://localhost:5173` 접속
  2. "안녕하세요! 당신은 어떤 작업을 할 수 있나요?" 전송
  3. AI의 응답 수신 확인
  4. 웹 브라우저 새로고침(F5) 수행
- **검증 기준**:
  - 새로고침 후에도 이전 대화 메시지 기록이 그대로 복원되어 화면에 표시되어야 함.

### Story 4: 도구 승인(Human-in-the-loop) 인터랙션 테스트
- **목적**: 승인이 필요한 도구 호출 시 UI 반응 및 제어 검증
- **절차**:
  1. 향후 브라우저 도구(예: `openPage`, `clickButton` 등 `needsApproval: true` 적용 도구) 호출 유도
  2. 채팅창에 노란색 승인 요청 블록(`Approve <ToolName>?`)이 나타나는지 확인
  3. `[Approve]` 클릭 시 정상 실행, `[Reject]` 클릭 시 `Rejected` 상태 전환 확인
- **검증 기준**:
  - 사용자의 인터랙션 전까지 도구 실행이 대기 상태를 유지해야 함.

### Story 5: 브라우저 렌더링 세션(Browser Rendering) 확장 테스트 (향후 기능)
- **목적**: `env.BROWSER`를 활용한 웹 스크래핑 및 스크린샷 캡처 검증
- **절차**:
  1. `worker/index.ts`에 Puppeteer를 활용한 `takeScreenshot({ url })` 도구 추가
  2. 사용자 메시지로 "cloudflare.com 사이트 스크린샷 찍어줘" 요청
- **검증 기준**:
  - Cloudflare Browser Rendering 인스턴스가 기동되고, 캡처된 결과가 Base64 또는 이미지 데이터로 UI에 렌더링되어야 함.

---

## 6. 결론 및 권장 개발 방향

현재 `my09-browser-agents` 프로젝트는:
1. **빌드 오류 완전 해결**: TypeScript 컴파일 및 Vite 번들링이 100% 정상 작동하는 안정된 상태입니다.
2. **최신 패키지 정합성 확보**: `agents@0.22.0` 및 `@babel/plugin-proposal-decorators`를 통해 Cloudflare 최신 Agents 생태계와 호환됩니다.
3. **개발 실행 준비 완료**: `npx wrangler login` 또는 `CLOUDFLARE_API_TOKEN` 설정을 통해 원격 브라우저 및 AI 인프라와 즉시 연결하여 개발을 진행할 수 있습니다.
