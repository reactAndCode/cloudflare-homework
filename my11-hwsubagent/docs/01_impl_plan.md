# Debate Arena (my11-hwsubagent) 서브에이전트 논쟁 시스템 개발 계획

Cloudflare Workers, Durable Objects(SQLite 기반), Workers AI (`@cf/zai-org/glm-4.7-flash`), Agents SDK (`agents`, `@cloudflare/ai-chat`) 및 Vercel AI SDK (`ai`)를 사용하여 서브에이전트 기반 **Debate Arena (논쟁의 장)** 프로젝트(`my11-hwsubagent`)를 개발합니다.

## User Requirements & Tech Stack
- **Folder**: `my11-hwsubagent`
- **Frontend**: React 19, TailwindCSS, Vite
- **Backend**: Cloudflare Workers, Durable Objects (SQLite), Vercel AI SDK (`ai`), Cloudflare Agents SDK (`agents`), `@cloudflare/ai-chat`
- **AI Model**: `@cf/zai-org/glm-4.7-flash`
- **핵심 기능**:
  1. 질문 입력(예: "민초 찬성인가 반대인가?", "탕수육 부먹 대 찍먹?", "깻잎논쟁?")
  2. 부모 에이전트(`DebateOrchestrator`)가 주제를 받아 2개의 서브 에이전트(`DebaterAgent`: 찬성/반대 또는 A/B)를 생성 후 **독립된 맥락**에서 동시에 실행 (`Promise.all`).
  3. 서브 에이전트는 `generateText`와 `Output.object`를 사용해 Zod 스키마 `{ stance, opening, arguments: [{ point, reasoning }], closing }` 형태로 구조화된 주장을 반환하며, **논거(arguments)는 정확히 3개** 포함.
  4. 각 대변인은 `RpcTarget` 콜백(`ProgressReporter`)으로 부모 에이전트에 진행 상황을 실시간 전송 (예: "모두발언 작성 중...", "논거 2/3 준비 중..."). 부모 에이전트는 이를 State에 저장하여 UI에 실시간 반영.
  5. 양쪽 서브 에이전트의 주장이 완료되면 부모 에이전트가 심판(Judge) 역할을 수행하여 승자를 판정하고 결정적 논거를 제시하는 판정문을 스트리밍 및 채팅 기록(SQLite 저장)으로 출력.

---

## Proposed Changes

### Project Initialization & Setup (`my11-hwsubagent`)

#### [NEW] package.json
- 의존성 구성: `agents`, `@cloudflare/ai-chat`, `ai`, `workers-ai-provider`, `zod`, `react`, `react-dom`, `tailwindcss`, `@tailwindcss/vite`, `vite`, `wrangler` 등

#### [NEW] wrangler.jsonc
- Durable Objects binding: `DebateOrchestrator`, `DebaterAgent`
- AI binding (`AI`, remote: true)
- SQLite Migration v1 설정

#### [NEW] vite.config.ts, tsconfig.json, index.html
- React + Vite + TailwindCSS v4 빌드 설정

---

### Backend Logic (`worker/index.ts`)

#### [NEW] worker/index.ts
- **Zod 스키마**: `DebateStanceSchema`
  - `stance`: string (입장 명칭)
  - `opening`: string (모두 발언)
  - `arguments`: 3개의 `{ point: string, reasoning: string }` 객체 배열
  - `closing`: string (마무리 발언)
- **`ProgressReporter` (RpcTarget)**:
  - 서브 에이전트가 부모 `DebateOrchestrator`의 `setState`를 호출하여 진행 단계 리포팅.
- **`DebaterAgent` (Agent<Env>)**:
  - `prepareArgument(topic, stanceRole, progressReporter)` 메서드 구현.
  - 진행 단계별로 RpcTarget 알림 전송 ("모두발언 구상 중...", "논거 1/3 구성 중...", "마무리 발언 정리 중...").
  - `generateText` with `Output.object`를 통해 `@cf/zai-org/glm-4.7-flash` 모델로 정확히 3개 논거가 담긴 Structured JSON 생성.
- **`DebateOrchestrator` (AIChatAgent<Env, DebateState>)**:
  - `startDebate(topic: string)` callable 메서드.
  - 1단계: 주제 파악 및 찬/반(또는 A/B) 라벨 설정.
  - 2단계: `this.subAgent(DebaterAgent, 'debater-pro')`, `this.subAgent(DebaterAgent, 'debater-con')` 스텁 생성 및 `Promise.all` 동시 호출.
  - 3단계: 두 구조화된 주장이 도착하면 두 주장을 심판 Prompt로 입력하여 승자 및 결정적 이유 판정 text streaming / result generation.
  - 4단계: 상태 업데이트 및 Chat history SQLite 저장.

---

### Frontend UI (`src/App.tsx`, `src/index.css`)

#### [NEW] src/App.tsx
- `useAgent<DebateState>` 사용.
- **주제 입력 폼 & 템플릿 버튼** ("민초 찬성 vs 반대", "탕수육 부먹 vs 찍먹", "깻잎논쟁").
- **실시간 프로그레스 모니터링 카드**: RpcTarget을 통해 수신한 양측 대변인 서브 에이전트의 현재 작업 단계 실시간 표시.
- **양측 주장 비교 카드**:
  - 찬성측 vs 반대측 Card 레이아웃.
  - 모두발언, 3가지 핵심 논거 (Point & Reasoning), 마무리발언 깔끔하게 렌더링.
- **심판(Judge) 판정 뷰**:
  - 최종 승자(Winner) 강조 뱃지.
  - 결정적 논거 분석 및 판정문 최종 결과 표시.

---

## Verification Plan

### Automated Build & Typecheck
- `my11-hwsubagent` 디렉토리에서 `npm install` 후 `npm run build` 실행하여 TypeScript 및 Vite/Cloudflare build 오류가 없는지 검증.

### Manual Verification
- `npm run dev` 실행 (또는 wrangler local environment)을 통해 dev 서버 가동.
- UI에서 "민초, 찬성인가 반대인가?" 입력 후 대결 개시.
- 양쪽 서브에이전트가 실시간 RpcTarget 리포팅을 통해 진행 상태를 갱신하는지 확인.
- 양측 주장 카드에 3개의 논거가 정상 구조화되어 나타나는지 확인.
- 최종 심판 판정 및 승자 결정이 제대로 출력되는지 확인.
