# `my11-subagent` 개발 상세 사양서 및 테스트 가이드 (Dev Spec & Testing Guide)

## 1. 프로젝트 개요 (Overview)

`my11-subagent`는 Cloudflare Workers 및 Durable Objects 환경에서 **오케스트레이터(Orchestrator) AI 에이전트**와 **3명의 서브 연구원(Researcher Sub-Agents)**이 상호 협력하여 사용자의 심층 연구 주제를 병렬 탐색하고 분석하는 AI 에이전트 오케스트레이션 애플리케이션입니다.

- **프로젝트 명**: `my11-subagent`
- **기반 프로젝트**: `my09-auditweb`
- **핵심 특징**:
  - `cloudflare:workers` 패키지의 `RpcTarget`을 상속받은 `ProgressReporter` 클래스를 도입하여 서브에이전트가 수행 중인 실시간 웹 검색/페이지 분석 현황을 부모 Durable Object 상태(`activity`)에 스트리밍 업데이트.
  - `@cf/zai-org/glm-4.7-flash` 최신 LLM 모델을 활용하여 빠른 응답성과 정밀한 구조화 데이터(`FindingSchema`) 추출.
  - Durable Objects 내 SQLite 영속성 엔진을 통한 대화 및 에이전트 상태 자동 보존.

---

## 2. 기술 스택 (Tech Stack)

| 구분 | 기술 / 라이브러리 | 용도 |
| :--- | :--- | :--- |
| **Frontend** | React 19, TailwindCSS v4 (`@tailwindcss/vite`), Vite 8 | 모던 다크 글래스모피즘 인터페이스 및 대시보드 |
| **Agent SDK** | `agents` (`^0.22.0`), `@cloudflare/ai-chat` (`^0.7.0`) | Durable Object 기반 멀티 에이전트 생성 및 챗 라우팅 |
| **AI SDK & Model** | Vercel AI SDK (`ai` `^6.0.182`), `workers-ai-provider` (`^3.1.14`), `@cf/zai-org/glm-4.7-flash` | LLM 구조화 텍스트/JSON 렌더링 및 도구 연동 |
| **Backend / DO** | Cloudflare Workers, Durable Objects (SQLite), `cloudflare:workers` (`RpcTarget`) | 오케스트레이션, 실시간 RPC 상태 공유 및 서브에이전트 관리 |
| **External API** | `cloudflare` (`^4.2.0`) SDK | Cloudflare Browser Rendering 마크다운 생성 (`browserRendering.markdown.create`) |

---

## 3. 에이전트 아키텍처 및 역할 정의 (Architecture)

```
                       ┌─────────────────────────┐
                       │  React Client Frontend  │
                       │   (useAgent Hook)       │
                       └───────────┬─────────────┘
                                   │ WebSocket / RPC
                                   ▼
                       ┌─────────────────────────┐
                       │      Orchestrator       │
                       │  (AIChatAgent DO Class) │
                       └────┬────────────────┬───┘
                            │                │
            ┌───────────────┼────────────────┴───────────────┐
            │               │                                │
            ▼               ▼                                ▼
   ┌────────────────┐ ┌────────────────┐           ┌────────────────┐
   │  Researcher-0  │ │  Researcher-1  │   ...     │  Researcher-2  │
   │   (Agent DO)   │ │   (Agent DO)   │           │   (Agent DO)   │
   └───────┬────────┘ └───────┬────────┘           └───────┬────────┘
           │                  │                            │
           └──────────────────┼────────────────────────────┘
                              │ RpcTarget ProgressReporter
                              ▼
                   father.setState({ activity })
```

### 3.1. Orchestrator Class (`worker/index.ts`)
- **상속**: `AIChatAgent<Env, OrchestratorState>`
- **역할**: 
  1. 클라이언트 요청(주제)을 받아 3가지 검색 관점(Queries)으로 분할(Planning).
  2. `this.subAgent(Researcher, 'researcher-i')` 메서드로 3명의 서브에이전트를 동시 스폰.
  3. `ProgressReporter` RPC 개체를 서브에이전트에 주입하여 진행 상태를 수집.
  4. 최종 도출된 팩트(Findings)를 수집하여 `@cf/zai-org/glm-4.7-flash` 모델로 한국어 종합 연구 보고서 작성.

### 3.2. Researcher Class (`worker/index.ts`)
- **상속**: `Agent<Env>`
- **역할**:
  1. `searchWeb` 도구를 통해 DuckDuckGo 쿼리를 수행하거나 웹 마크다운 결과 수집.
  2. `readPage` 도구를 통해 타겟 URL 본문 분석.
  3. `FindingSchema` Zod 스키마로 핵심 팩트(Topic 및 3~5개 keyFindings) 반환.

### 3.3. ProgressReporter Class (`worker/index.ts`)
- **상속**: `RpcTarget` (from `"cloudflare:workers"`)
- **역할**:
  - 서브에이전트가 도구(Tool)를 실행할 때마다 `report(activity: string)` 메서드를 호출.
  - 부모 `Orchestrator`의 `setState(...)`를 트리거하여 `activity` 객체 갱신 -> 연결된 모든 React 클라이언트에 Real-time WebSocket으로 브로드캐스트.

---

## 4. 상세 수행 로직 (Logic Flow)

1. **사용자 요청 단계**: 사용자가 연구 주제(예: "Cloudflare Workers & DO 2026 최신 기술 동향")를 입력 후 [서브에이전트 연구 개시] 클릭.
2. **1단계 (Planning)**:
   - `Orchestrator.research(query)` 호출.
   - LLM이 3개의 검색 키워드(Queries) 반환 -> `state.plan` 업데이트.
3. **2단계 (Parallel Research & RpcTarget Progress)**:
   - `Promise.all`로 `researcher-0`, `researcher-1`, `researcher-2` 스텁 생성 및 각 쿼리 전달.
   - 각 `Researcher`가 웹 탐색 시 `progressReporter.report("DuckDuckGo 검색 중: ...")` 또는 `progressReporter.report("웹 페이지 렌더링 중: ...")` 호출.
   - 클라이언트 화면의 서브 연구원 카드가 펄스 효과와 함께 실시간 로깅 표시.
4. **3단계 (Structured Findings Generation)**:
   - 각 `Researcher`가 수집 데이터를 기반으로 `FindingSchema` JSON 구조체 도출 -> `state.findings`에 3개 카드가 그리드로 렌더링.
5. **4단계 (Final Summary Synthesis)**:
   - `Orchestrator`가 3개 Findings를 종합하여 LLM에 최종 보고서 작성 요청.
   - `state.summary` 및 `state.status = "completed"` 설정 후 최종 대시보드 출력.

---

## 5. 테스트 및 검증 가이드 (Testing Instructions)

### 5.1. 사전 준비사항
- Node.js (v18 이상)
- Cloudflare 계정 및 `wrangler` CLI 설치 완료

### 5.2. 개발 서버 구동 (Local Dev Server)
```bash
# 1. my11-subagent 디렉터리로 이동
cd my11-subagent

# 2. 의존성 설치 (필요시)
npm install

# 3. 로컬 Vite & Cloudflare Workers 렌더링 서버 실행
npm run dev
```
- 브라우저에서 `http://localhost:5173` 접속.

### 5.3. 기능 테스트 시나리오
1. **기본 템플릿 테스트**:
   - 화면 하단의 3가지 추천 템플릿 버튼 중 하나를 클릭.
   - 1단계 카드에 3개 쿼리가 렌더링되는지 확인.
   - 2단계 카드에서 `Researcher-1`, `Researcher-2`, `Researcher-3`의 실시간 `RpcTarget` 로그 메시지가 갱신되는지 확인.
   - 3단계 카드에 도출된 팩트 카탈로그(Key Findings)가 표시되는지 확인.
   - 4단계에 종합 분석 보고서가 한국어로 출력되는지 확인.
2. **상태 초기화 테스트**:
   - 상단 헤더의 [초기화] 버튼을 클릭하여 모든 연구 단계 및 로그가 초기 상태(`idle`)로 리셋되는지 확인.

### 5.4. 빌드 및 타입 검증 (Production Build Test)
```bash
npm run build
```
- TypeScript 타입 검사 (`tsc -b`) 및 Vite 생산 번들링이 에러 없이 종료되는지 확인.
