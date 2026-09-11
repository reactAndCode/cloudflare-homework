# 🧠 Cloudflare Workflows & Agents 실시간 AI 퀴즈쇼 개발 명세서 (05_dev_spec.md)

이 문서는 `my12-hw2workflow` 프로젝트에 구현된 Cloudflare Workflows 및 Cloudflare Agents SDK 기반 실시간 AI 퀴즈쇼 시스템의 상세 기술 명세서와 트러블슈팅 기록입니다.

---

## 1. 프로젝트 개요 (Overview)

본 프로젝트는 **Cloudflare Workflows**의 내구성(Durability) 및 결정론적 실행(`step.do`) 특성을 활용하여, 서버가 중간에 종료되거나 재시작되어도 퀴즈 진행 순서, 문제, 채점 상태를 손실하지 않는 실시간 AI 퀴즈쇼 웹 애플리케이션입니다.

- **주요 목적**:
  - LLM을 활용한 고정 5개 라운드 퀴즈 문제 자동 생성
  - 60초 제한 시간이 있는 실시간 답변 수집 및 진행자의 조기 마감
  - 자유 서술형 답변에 대한 LLM 기반 오탈자/유사어 감안 유연 채점
  - 실시간 순위표(Leaderboard) 유지 관리
  - 5라운드 종료 후 진행자의 수동 최종 결과 승인 (`waitForApproval`)
  - 새 퀴즈쇼 리셋 및 재시작 기능 지원 (`resetQuiz`)
  - **신규 참가자 추가 및 사용자 전환 기능 제공 (`handleSwitchPlayer`)**

- **주요 기술 스택**:
  - **Runtime & Hosting**: Cloudflare Workers
  - **State Management & RPC**: Cloudflare Agents SDK (`QuizAgent` Durable Object)
  - **Workflow Engine**: Cloudflare Workflows (`QuizWorkflow`)
  - **AI Engine**: Cloudflare Workers AI (`@cf/meta/llama-3.1-8b-instruct`)
  - **Frontend**: React 19, Vite, Tailwind CSS v4, Lucide Icons, Canvas-Confetti, Cross-env

---

## 2. 시스템 아키텍처 (Architecture)

```
[ Frontend (React Client) ]
  ├── HostView (/host)     ── RPC (`startQuiz`, `closeAnsweringEarly`, `approveFinalResults`, `resetQuiz`) ──┐
  └── PlayerView (/)       ── RPC (`joinGame`, `submitAnswer`, `handleSwitchPlayer`) ──────────────────────┼─► [ QuizAgent (Durable Object) ]
                                                                                                               │       ▲
                                                                                     State Sync & Event Signal │       │ State Update
                                                                                                               ▼       │
                                                                                                    [ QuizWorkflow Engine ]
                                                                                                       ├── Step 1: question-1 (step.do + LLM)
                                                                                                       ├── Step 2: wait-answer-1 (step.waitForEvent 60s)
                                                                                                       ├── Step 3: grade-1 (step.do + LLM 유연채점)
                                                                                                       ├── ... (Round 2 ~ 5 반복)
                                                                                                       └── Step Final: waitForApproval (수동 승인)
```

---

## 3. 데이터 모델 정의 (`worker/types.ts`)

```typescript
export type RoundStage =
  | "idle"
  | "question"
  | "answering"
  | "grading"
  | "leaderboard"
  | "awaiting_approval"
  | "finished";

export type QuestionItem = {
  round: number;
  topic: string;
  question: string;
  hint: string;
  referenceAnswer: string;
};

export type PlayerInfo = {
  id: string;
  name: string;
  score: number;
};

export type AnswerRecord = {
  playerId: string;
  playerName: string;
  answerText: string;
  submittedAt: number;
};

export type GradeResult = {
  score: number; // 0 ~ 100점
  feedback: string;
  isCorrect: boolean;
};

export type LeaderboardEntry = {
  playerId: string;
  name: string;
  score: number;
  rank: number;
};

export type QuizState = {
  status: "idle" | "in_progress" | "awaiting_approval" | "completed";
  currentRound: number; // 1 ~ 5
  roundStage: RoundStage;
  currentQuestion: QuestionItem | null;
  questions: Record<number, QuestionItem>;
  players: Record<string, PlayerInfo>;
  answers: Record<number, Record<string, AnswerRecord>>;
  grades: Record<number, Record<string, GradeResult>>;
  leaderboard: LeaderboardEntry[];
  isAnsweringOpen: boolean;
  answeringEndsAt: number | null;
  finalApproved: boolean;
  workflowId: string | null;
};
```

---

## 4. 백엔드 함수 & 클래스 명세 (`worker/index.ts`)

### 4.1 `QuizWorkflow` 클래스
`AgentWorkflow<QuizAgent, Params>`를 상속받아 5라운드 퀴즈 수명주기를 제어하는 오케스트레이션 클래스입니다.

---

### 4.2 `QuizAgent` 클래스
`Agent<Env, QuizState>`를 상속받은 Durable Object 실시간 방 에이전트입니다.

- `@callable() joinGame(playerName)`: 새로운 참가자 등록 및 순위표 초기 배치
- `@callable() startQuiz()`: `runWorkflow("QUIZ_WORKFLOW", {})` 실행 및 ID 저장
- `@callable() submitAnswer(round, playerId, answerText)`: 현재 라운드 답변 수집
- `@callable() closeAnsweringEarly(round)`: `sendWorkflowEvent`를 통해 60초 답변 창 즉시 닫기
- `@callable() approveFinalResults()`: `approveWorkflow`를 통해 최종 결과 수동 승인 및 즉시 반응
- `@callable() resetQuiz()`: 기존 참가자 목록 및 순위표를 보존하면서 점수 및 퀴즈 상태를 `idle`로 초기화하여 새 퀴즈쇼를 열 수 있도록 재설정
- `@callable() getState()`: 전체 상태 객체 직렬화 반환 RPC
- `@callable() getQuestions()`, `@callable() getAnswers()`, `@callable() getPlayers()`: RPC 데이터 접근 조회

---

## 5. 프론트엔드 컴포넌트 명세 (`src/`)

- **`App.tsx`**: Navigation 헤더 및 `/host` vs `/` 뷰 분기
- **`HostView.tsx`**: 진행자 컨트롤러 (퀴즈 시작, 60초 조기 닫기, 실시간 채점 상황 관람, 최종 승인, 새 퀴즈쇼 리셋 및 다시 열기)
- **`PlayerView.tsx`**: 참가자 응시 화면 (닉네임 설정, 퀴즈 문제 카드, 60초 카운트다운 타이머, 서술형 답변 제출, 점수 & LLM 피드백 확인, **신규 참가자 추가/변경 버튼**)
- **`Leaderboard.tsx`**: 1, 2, 3위 메달 아이콘 및 실시간 랭킹 순위표 컴포넌트

---

## 6. 내구성 (Durability) 작동 매커니즘

1. **`step.do`를 통한 메모이제이션 (Memoization)**:
   - `question-1` ~ `question-5` 및 `grade-1` ~ `grade-5` 단계의 모든 결과는 Cloudflare Workflows의 비휘발성 스토리지에 자동 저장됩니다.
2. **서버 재시작 안정성**:
   - 라운드 진행 중 `wrangler` 또는 서버가 강제 종료되어도, 재시작 시 이미 실행된 `step.do` 블록은 재실행되지 않고 기존에 저장된 결과를 즉시 불러옵니다.
   - 따라서 퀴즈 질문이 바뀌거나 순서가 섞이지 않으며, 점수 및 상태가 완벽히 보존됩니다.

---

## 7. 상세 트러블슈팅 및 기능 개발 기록

### 🐛 트러블슈팅 1 ~ 10 (이전 내역 보존)
*(상세 내용은 이전 명세 참조)*

---

### ✨ 기능 추가 11: 신규 참가자 추가 및 플레이어 스위칭 기능 (`handleSwitchPlayer`)
- **요구 사항**: 참가자 화면에서 동일 브라우저를 통해 다수의 닉네임 참가자를 등록/교체하여 테스트할 수 있는 기능 추가.
- **해결 방안**:
  1. `PlayerView.tsx` 상단 프로필 헤더 영역에 **"👤 신규 참가자 추가 / 변경"** 버튼을 배치.
  2. 클릭 시 `localStorage`의 기존 세션(`quiz_player_id`, `quiz_player_name`)을 초기화하고 `handleSwitchPlayer`를 실행하여 닉네임 입력 참여 화면으로 자연스럽게 전환.

---

### 🐛 트러블슈팅 12: Workflows `Workflow instance has invalid id` 해결
- **문제 현상**: 진행자 화면에서 퀴즈 시작 버튼(`startQuiz`) 클릭 시 `WorkflowError: Workflow instance has invalid id at WorkflowBinding.create` 발생.
- **원인 분석**:
  - `agents` SDK의 `runWorkflow` 기본 동작은 인스턴스 ID가 전달되지 않을 경우 `nanoid()`를 사용합니다.
  - Miniflare 및 Cloudflare Workflows의 인스턴스 ID 검증 정규식은 `^[a-zA-Z0-9_][a-zA-Z0-9-_]*$`(최대 100자)이며 하이픈(`-`)으로 시작할 수 없습니다.
  - `nanoid()`는 `A-Za-z0-9_-` 문자셋을 사용하므로 첫 문자가 `-`가 되거나 특수문자 배치에 따라 검증에 실패할 수 있습니다.
- **해결 방안**:
  - [worker/index.ts](file:///d:/dev/cloudflare/cloudflare-homework/my12-hw2workflow/worker/index.ts)의 `startQuiz`에서 `this.runWorkflow("QUIZ_WORKFLOW", {}, { id: workflowInstanceId })` 옵션을 명시적으로 전달.
  - `workflowInstanceId`는 `quiz_${Date.now()}_${crypto.randomUUID().replace(/-/g, "").substring(0, 8)}` 패턴을 적용하여 영문 소문자(`q`)로 안전하게 시작하고 100자 이내의 고유 규격 ID를 보장.

---

### 🐛 트러블슈팅 13: 워크플로우 상태 오버라이트 방지 (`mergeAgentState`) 및 실시간 동기화 보강
- **문제 현상**: 참가자 화면이 `idle` 대기 상태("진행자가 퀴즈를 시작하기를 기다리는 중입니다...")에서 라운드 문제 화면으로 전환되지 않음.
- **원인 분석**:
  - `QuizWorkflow.run`에서 `step.updateAgentState`를 호출하면 내부적으로 `_workflow_updateState("set", state)`가 실행되어 기존의 `players`, `leaderboard` 등 전체 상태 필드가 누락되고 오버라이트됨.
  - 또한 이후 단계에서 `status` 필드를 명시하지 않아 상태가 유실되는 문제 발생.
- **해결 방안**:
  1. [worker/index.ts](file:///d:/dev/cloudflare/cloudflare-homework/my12-hw2workflow/worker/index.ts) 내 `QuizWorkflow`의 모든 `step.updateAgentState`를 `step.mergeAgentState`로 교체하여 기존 참가자 목록 및 상태를 완벽히 보존.
  2. [PlayerView.tsx](file:///d:/dev/cloudflare/cloudflare-homework/my12-hw2workflow/src/PlayerView.tsx) 및 [HostView.tsx](file:///d:/dev/cloudflare/cloudflare-homework/my12-hw2workflow/src/HostView.tsx)에 `agent.state` 실시간 갱신 리액티브 `useEffect` 훅을 보강.
