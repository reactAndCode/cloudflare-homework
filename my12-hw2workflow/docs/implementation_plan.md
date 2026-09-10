# 🎮 실시간 퀴즈쇼 워크플로우 (my12-hw2workflow) 구현 계획서

Cloudflare Workflows와 Cloudflare Agents SDK(Durable Objects)를 활용하여, 서버가 재시작되어도 상태와 퀴즈 순서가 유지되는 실시간 퀴즈쇼 웹 애플리케이션을 구축합니다.

---

## 1. 개요 및 배경 (Overview)

본 프로젝트는 Cloudflare Workflows의 내구성(Durability) 및 결정론적 실행(`step.do`) 특성을 활용하여 퀴즈 진행자 역할을 수행하는 워크플로우를 구현합니다.
- **LLM 문제 생성을 통한 5개 고정 라운드 진행** (`question-1` ~ `question-5`)
- **실시간 답변 창 (60초 타임아웃 `waitForEvent`)** 및 진행자의 조기 닫기 기능 (`sendEvent`)
- **LLM 기반의 자유 서술형 답변 유연 채점** (`grade-1` ~ `grade-5`)
- **실시간 순위표(Leaderboard) 관리 및 라운드별 갱신**
- **최종 결과 게시 전 수동 승인 대기 (`waitForApproval`)**
- **서버/Wrangler 재시작 시에도 퀴즈 진행 위치 및 채점 결과 완벽 보존 (Durability)**

---

## 2. 주요 구성 요소

### 바인딩 및 환경 설정
- **Durable Object**: `QuizAgent`
- **Workflow**: `quiz-workflow` (binding: `QUIZ_WORKFLOW`, class: `QuizWorkflow`)
- **Workers AI Binding**: `env.AI` (`@cf/meta/llama-3.1-8b-instruct`)

### 백엔드 
- `worker/types.ts`: `QuizState`, `QuestionItem`, `GradeResult`, `LeaderboardEntry`, `PlayerInfo`, `AnswerRecord`
- `worker/index.ts`: `QuizWorkflow`, `QuizAgent`, LLM 문제생성/채점 헬퍼

### 프론트엔드
- `src/App.tsx`: Navigation & View Switcher (`/host` vs `/`)
- `src/HostView.tsx`: 진행자 전용 조종판
- `src/PlayerView.tsx`: 참가자 응시 화면
- `src/Leaderboard.tsx`: 실시간 순위표
