# Debate Arena (my11-hwsubagent) 개발 상세 명세서 (05_dev_spec.md)

---

## 1. 프로젝트 개요 (Overview)

**my11-hwsubagent (Debate Arena - 논쟁의 장)** 프로젝트는 Cloudflare Workers, Durable Objects (SQLite 기반), Cloudflare Agents SDK, Vercel AI SDK (`ai`), 그리고 Cloudflare Workers AI의 `@cf/zai-org/glm-4.7-flash` LLM 모델을 활용하여 구축된 **실시간 멀티 서브에이전트 토론 및 심판 시스템**입니다.

사용자가 흥미로운 찬반 주제(예: "민초 찬성인가 반대인가?", "탕수육 부먹 대 찍먹?", "깻잎논쟁, 잡아줘도 되는가?")를 던지면:
1. 부모 에이전트(`DebateOrchestrator`)가 두 입장을 대변하는 자식 서브 에이전트 2개(`DebaterAgent`)를 분리된 독립 맥락(Isolated Context)에서 생성하고 동시에 실행합니다.
2. 각 서브 에이전트는 `RpcTarget` 콜백(`ProgressReporter`)을 사용해 부모 에이전트에 자신의 작업 상태("모두발언 작성 중...", "논거 2/3 준비 중..." 등)를 실시간 리포팅합니다.
3. 각 대변인은 Vercel AI SDK `generateText`의 `Output.object`와 Zod 스키마를 이용하여 **정확히 3개의 논거**가 포함된 구조화된 주장(Structured JSON)을 작성하여 반환합니다.
4. 두 입론이 모두 도착하면 부모 에이전트가 **AI 심판(Judge)**으로 전환되어 두 구조화된 주장을 면밀히 비교 평가하고, 승자를 결정함과 동시에 승리에 결정적이었던 논거 분석을 밝히는 판정문을 출력합니다.

---

## 2. 기술 스택 (Tech Stack)

| 구분 | 기술 / 라이브러리 | 설명 |
| :--- | :--- | :--- |
| **Frontend** | React 19, TailwindCSS v4, Vite | 사용자 인터페이스, Glassmorphism 테마, 실시간 상태 바인딩 |
| **Backend** | Cloudflare Workers, Durable Objects | 서버리스 컴퓨팅 및 SQLite 기반 지속적 에이전트 상태 관리 |
| **Agent Framework** | `agents` (`@cloudflare/ai-chat`) | Cloudflare Agents SDK 기반 멀티 에이전트 오케스트레이션 |
| **AI Integration** | `ai` (Vercel AI SDK), `workers-ai-provider` | `generateText`, `Output.object`, Zod 스키마 구조화 출력 연동 |
| **AI Model** | `@cf/zai-org/glm-4.7-flash` | Cloudflare Workers AI 원격 바인딩 모델 |
| **RPC Communication**| `cloudflare:workers` (`RpcTarget`) | 서브 에이전트 -> 부모 에이전트 실시간 진행 상황 알림 동기화 |
| **Language** | TypeScript (ES2022) | 전체 코드베이스 100% Type-safe 작성 |

---

## 3. 본 프로젝트 상세 요구사항 (Detailed Requirements)

### 3.1 토론 주제 및 입장 정의 (Topic & Stance Resolution)
- 사용자가 질문을 던지면 부모 에이전트(`DebateOrchestrator`)가 주제를 파악하여 찬성/반대 또는 A측/B측 입장의 라벨명(`proLabel`, `conLabel`)을 자동으로 도출합니다.
- 예시:
  - "민초, 찬성인가 반대인가?" ➡️ `proLabel`: "민초단", `conLabel`: "반민초단"
  - "탕수육, 부먹 대 찍먹?" ➡️ `proLabel`: "부먹파", `conLabel`: "찍먹파"

### 3.2 분리된 맥락에서의 자식 서브에이전트 동시 실행 (Parallel Sub-Agents Execution)
- 부모 에이전트는 `this.subAgent(DebaterAgent, 'debater-pro')`와 `this.subAgent(DebaterAgent, 'debater-con')` 스텁을 각각 생성합니다.
- 두 서브 에이전트는 `Promise.all`로 **병렬 동시 실행**되며, 서로 맥락이 분리되어 있으므로 상대방의 논거를 사전 조율하거나 참조할 수 없습니다.

### 3.3 RpcTarget 기반 실시간 작업 진행 상황 알림 (Live Progress Reporting)
- `RpcTarget` 클래스를 상속한 `ProgressReporter`를 자식 에이전트에 전달합니다.
- 자식 에이전트는 작성 단계별로 `progressReporter.report(status)`를 호출합니다:
  - `"모두발언 작성 중..."`
  - `"논거 1/3 준비 중..."`
  - `"논거 2/3 준비 중..."`
  - `"논거 3/3 및 마무리 발언 작성 중..."`
- 부모 에이전트는 `this.setState`를 통해 자신의 `state.activity`를 업데이트하고, 이는 UI의 WebSocket/State Sync를 통해 사용자 화면에 실시간 갱신됩니다.

### 3.4 구조화된 주장 반환 (Structured Argument Output)
- 각 서브 에이전트는 Vercel AI SDK의 `generateText` 함수에 `Output.object`와 Zod 스키마를 적용합니다.
- Zod 스키마 제약조건:
  - `stance`: string (입장 명칭)
  - `opening`: string (입장 표명 모두발언)
  - `arguments`: 정확히 3개의 `{ point: string, reasoning: string }` 객체 배열 (`.length(3)`)
  - `closing`: string (마무리 발언)

### 3.5 AI 심판 판정 및 승자 발표 (Judge Verdict & Winner Announcement)
- 두 대변인의 3개씩 총 6개 논거가 모두 수신되면 부모 에이전트가 심판(Judge)으로 동작합니다.
- 두 주장을 비교하여 승자(`winner`)를 명확히 선정하고, 승리에 결정적이었던 논거와 상대의 약점을 이겨낸 배경을 설명하는 판정문(`verdict`)을 출력합니다.

---

## 4. 구현 내역 상세 설명 (Implementation Architecture)

### 4.1 Backend (`worker/index.ts`)

#### 1) Zod 스키마 정의 (`DebateArgumentSchema`)
```typescript
const DebateArgumentSchema = z.object({
  stance: z.string().meta({ description: "주장하는 입장 명칭" }),
  opening: z.string().meta({ description: "모두발언 (시작 입장을 강렬하고 설득력 있게 표현)" }),
  arguments: z
    .array(
      z.object({
        point: z.string().meta({ description: "핵심 논거 요약 (1문장)" }),
        reasoning: z.string().meta({ description: "논거 세부 설명 및 당위성" }),
      })
    )
    .length(3)
    .meta({ description: "정확히 3개의 논거 목록" }),
  closing: z.string().meta({ description: "마무리 발언 (결론 및 최종 강조)" }),
});
```

#### 2) `ProgressReporter` (RpcTarget)
```typescript
class ProgressReporter extends RpcTarget {
  father: DebateOrchestrator;
  childName: string;

  constructor(father: DebateOrchestrator, childName: string) {
    super();
    this.father = father;
    this.childName = childName;
  }

  report(activity: string) {
    this.father.setState({
      ...this.father.state,
      activity: {
        ...this.father.state.activity,
        [this.childName]: activity,
      },
    });
  }
}
```
*บทบาท*: Cloudflare Workers RPC(Remote Procedure Call) 기법을 활용하여 자식 Durable Object 에이전트에서 부모 Durable Object 에이전트의 `setState`를 즉시 직접 호출함으로써 실시간 진행 상황을 동기화합니다.

#### 3) `DebaterAgent` (자식 서브 에이전트)
- `Agent<Env>`를 상속하는 Durable Object 클래스.
- `prepareArgument(topic, stanceRole, progressReporter)` 메서드를 보유하며, AI 호출 전후로 `progressReporter.report(...)`를 호출해 부모에게 작업 현황을 알리고 `@cf/zai-org/glm-4.7-flash` 모델로 구조화된 3개 논거 JSON을 리턴합니다.

#### 4) `DebateOrchestrator` (부모 & 심판 에이전트)
- `AIChatAgent<Env, DebateState>`를 상속하는 Durable Object 클래스 (SQLite 자동 영속성 제공).
- `@callable() async startDebate(topic: string)` 메서드:
  - 1단계: LLM으로 `proLabel`, `conLabel` 도출
  - 2단계: `Promise.all`로 `debater-pro` 및 `debater-con` 서브에이전트 병렬 호출
  - 3단계: 두 주장을 심판 Prompt로 입력하여 승자(`winner`) 및 판정문(`verdict`) 생성

---

### 4.2 Frontend (`src/App.tsx`)

- `useAgent<DebateState>({ agent: "DebateOrchestrator" })` 훅을 이용해 부모 에이전트와 실시간 양방향 WebSocket/State 통신 수행.
- UI 4대 컴포넌트 구역:
  1. **Topic Form**: 입력창 + 3개 핫 템플릿 버튼 ("민초 찬반", "탕수육 부먹 찍먹", "깻잎논쟁")
  2. **RpcTarget Live Activity Monitor**: 양 측 대변인의 작업 상태 실시간 스피너 & 펄스 카드
  3. **Dual Structured Arguments View**: 찬성측 vs 반대측 모두발언, 3개 논거(Point & Reasoning), 마무리발언 Side-by-Side 카드로 비교
  4. **Judge Verdict Section**: 승자 뱃지 배너 및 심판 종합 판정 총평 출력

---

## 5. 테스트 및 실행 방법 (How to Test & Run)

### 5.1 사전 준비 사항 (Prerequisites)
- Node.js (v18+ 또는 v20+)
- Cloudflare 계정 및 Wrangler CLI가 설치되어 있어야 합니다.

### 5.2 의존성 설치 및 타입 생성
`my11-hwsubagent` 프로젝트 디렉토리에서 다음 명령어를 실행합니다:

```bash
# 1. 프로젝트 이동
cd c:\work\myDev\cloudy\cloudflare-homework\my11-hwsubagent

# 2. 의존성 패키지 설치
npm install

# 3. Cloudflare Worker Env 및 Durable Object 타입 자동 생성
npx wrangler types
```

### 5.3 프로덕션 빌드 검증 (Build Verification)
```bash
npm run build
```
- TypeScript 검사(`tsc -b`) 및 Vite 빌드가 성공하여 `dist/` 디렉토리에 클라이언트 및 워커 번들이 생성되는지 확인합니다.

### 5.4 로컬 개발 서버 가동 및 테스트 (Local Dev Server)
```bash
npm run dev
```
1. 브라우저에서 `http://localhost:5173` (또는 Vite 출력 URL)에 접속합니다.
2. 상단 주제 입력창에 `"민초, 찬성인가 반대인가?"`를 선택하거나 입력 후 **[서브에이전트 토론 시작]** 버튼을 클릭합니다.

### 5.5 수동 시나리오 검증 항목 (Manual Test Verification Checklist)

| 검증 항목 | 기대 동작 |
| :--- | :--- |
| **1. 주제 분석** | 버튼 클릭 시 상단 상태가 `주제 분석 및 찬반 구도 설정 중`으로 변경되며, 라벨(예: "민초단" vs "반민초단")이 자동 생성됨 |
| **2. 실시간 RpcTarget** | 양측 대변인 카드가 활성화되며 `"모두발언 작성 중..."`, `"논거 1/3 준비 중..."`, `"논거 2/3 준비 중..."` 등의 진행 상태가 실시간 동기화되어 표기됨 |
| **3. 구조화 주장 (3개 논거)** | 양측 카드에 모두발언, **정확히 3개의 논거**(Point 및 Reasoning), 마무리발언이 깔끔하게 Side-by-Side 비교 렌더링됨 |
| **4. AI 심판 판정** | 상단 상태가 `AI 심판 최종 비교 판정 중...`으로 변경된 후, 최종 승자(Winner) 뱃지와 승리 이유를 담은 상세 판정문이 출력됨 |
| **5. SQLite 저장 & 초기화** | [초기화] 버튼 클릭 시 상태가 초기화되며 새로운 논쟁 주제("탕수육, 부먹 대 찍먹?")를 연속해서 실행할 수 있음 |
