# `my11-subagent` 서브에이전트 연구 웹 애플리케이션 구현 계획

Cloudflare Workers, Durable Objects (SQLite 기반), Vercel AI SDK (`ai`), Cloudflare AI SDK (`@cloudflare/ai-chat`), Cloudflare Agents SDK (`agents`), 및 `@cf/zai-org/glm-4.7-flash` 모델을 활용하여 멀티 서브에이전트 기반 리서치 시스템 `my11-subagent`를 구축합니다.

---

## 1. 개요 및 요구사항

- **목적**: 사용자가 연구 주제를 입력하면, Orchestrator 에이전트가 3가지 연구 관점(Query)으로 분할하고, 각각 3명의 Researcher 서브에이전트에게 할당하여 병렬 웹 리서치(DuckDuckGo search / page read)를 수행하도록 합니다.
- **실시간 상태 공유 (`RpcTarget`)**: `ProgressReporter` (inheriting `RpcTarget` from `"cloudflare:workers"`)를 사용하여 서브에이전트가 자신의 연구 진행 상황을 Orchestrator의 `activity` 상태로 즉시 보고하고, 연결된 React 클라이언트 프론트엔드에 실시간 바인딩되어 시각화됩니다.
- **결과 취합 & AI 요약**: 서브에이전트들이 3~5개의 구조화된 사실(Finding)을 도출하면 Orchestrator가 이를 수집하여 사용자에게 종합 분석 보고서 및 팩트 카드로 출력합니다.
- **영속성**: Durable Objects 내부 SQLite를 바탕으로 대화/연구 기록 및 에이전트 상태가 자동 저장 및 복원됩니다.

---

## 2. 프로젝트 구조 (File & Directory Structure)

```
my11-subagent/
├── package.json
├── vite.config.ts
├── wrangler.jsonc
├── index.html
├── tsconfig.json
├── tsconfig.app.json
├── tsconfig.node.json
├── tsconfig.worker.json
├── docs/
│   ├── 01_implementation_plan.md
│   ├── 04_walkthrough.md
│   └── 05_dev_spec.md
├── src/
│   ├── main.tsx
│   ├── index.css
│   └── App.tsx
└── worker/
    └── index.ts
```

---

## 3. 주요 구성 요소 상세 계획

### A. Worker Backend (`worker/index.ts`)
- **Orchestrator (`AIChatAgent<Env, OrchestratorState>`)**:
  - 상태(`OrchestratorState`): `status` ("idle" | "planning" | "researching" | "completed"), `plan` (쿼리 목록), `findings` (연구원별 발견 팩트), `activity` (연구원별 실시간 작업 로그).
  - `@callable() async research(query: string)`:
    1. `@cf/zai-org/glm-4.7-flash` 모델을 사용하여 주제를 3개의 검색 쿼리로 분할.
    2. `Promise.all`로 `Researcher` 서브에이전트 스텁 3개를 생성.
    3. `ProgressReporter` (`RpcTarget`) 객체를 생성하여 서브에이전트에 전달.
    4. 각 서브에이전트의 `research(query, reporter)` 실행 후 결과 `findings`를 취합하여 상태 업데이트.
  - `onChatMessage`: 일반 채팅 요청 시 자동으로 `research` 수행 및 결과 응답 스트리밍.

- **Researcher (`Agent<Env>`)**:
  - `makeCloudflare()`로 Cloudflare REST/BrowserRendering SDK 연동.
  - `searchWeb` (DuckDuckGo 쿼리) 및 `readPage` (URL 마크다운 변환) 도구를 활용하여 웹 조사 수행.
  - `progressReporter.report(...)` 호출로 부모 Orchestrator의 `activity` 실시간 갱신.
  - `FindingSchema` (topic, keyFindings 3~5개) 기반 구조화된 데이터 반환.

- **ProgressReporter (`RpcTarget`)**:
  - `father: Orchestrator`, `childName: string` 지칭.
  - `report(activity: string)`: `father.setState(...)`로 부모 에이전트 상태 업데이트.

### B. Wrangler 설정 (`wrangler.jsonc`)
- Durable Objects binding: `Orchestrator`, `Researcher`
- SQLite migrations 설정: `new_sqlite_classes: ["Orchestrator", "Researcher"]`
- AI binding (`AI`), nodejs_compat 플래그 설정.

### C. Frontend UI (`src/App.tsx`, `src/index.css`)
- **디자인 컨셉**: 모던 다크 글로우 & 글래스모피즘 룩 (Deep Dark slate background, Indigo/Purple/Cyan 어센트, 펄스 애니메이션 배지).
- **구성 요소를 담은 스크린 레이아웃**:
  1. **상단 헤더**: 에이전트 정보 및 시스템 상태 (`idle`, `planning`, `researching`, `completed`), 대화/상태 초기화 버튼.
  2. **연구 요청 입력바**: 연구할 쿼리/주제 입력.
  3. **실시간 연구 파이프라인 대시보드**:
     - 1단계: **Orchestrator 플래닝**: 분할된 3가지 연구 관점(Sub-queries).
     - 2단계: **서브 연구원 실시간 작업 카드 (`RpcTarget` 진행 상황)**: 각 Researcher가 수행 중인 검색/읽기 액션 로깅.
     - 3단계: **연구 결과 카드 (Findings Grid)**: 각 연구원의 발견 내용(Topic & Key Facts).
  4. **종합 AI 분석 리포트 화면**: 3명의 서브 연구원 팩트를 요약 종합한 분석 보고서 출력.

---

## 4. 검증 계획 (Verification Plan)

### 빌드 및 타입 검사
- `npm run build` 및 `npx wrangler types` 실행을 통해 프론트엔드 및 워커 타입체크 및 번들링 성공 확인.

### 로컬 개발 서버 실행 및 기능 테스트
- `npm run dev` 실행 후 브라우저 서브에이전트 기능 테스트.
