# 🏆 실시간 퀴즈쇼 워크플로우 (my12-hw2workflow) 웍스루 (Walkthrough)

Cloudflare Workflows와 Cloudflare Agents SDK(Durable Objects)를 활용하여 내구성이 보장되는 5라운드 실시간 AI 퀴즈쇼 애플리케이션 구현을 완료했습니다.

---

## 🎯 완료된 주요 기능

### 1. 결정론적 워크플로우 진행 (`QuizWorkflow`)
- **5개 고정 라운드 실행**: `question-1` ~ `question-5`, `grade-1` ~ `grade-5` 고정 단계 이름 사용.
- **LLM 문제 생성 및 재시도**: `step.do("question-N", { retries: { limit: 3, delay: "3 seconds" } })`를 통해 문제 생성.
- **60초 답변 타임아웃 & 조기 마감**: `step.waitForEvent("wait-answer-N", { type: "close-answering-N", timeout: "60 seconds" })` 구현 및 진행자의 `closeAnsweringEarly` 조기 마감 지원.
- **LLM 기반 서술형 유연 채점**: `step.do("grade-N")`에서 오탈자, 유사 표현, 의미 동치성을 고려한 0~100점 채점.
- **최종 결과 수동 승인**: 5라운드 완료 후 `step.waitForApproval()`을 거쳐 진행자가 승인 시 결과가 최종 공개됨.

### 2. 실시간 에이전트 방 관리 (`QuizAgent`)
- **참가자 등록**: `@callable() joinGame(name)`
- **답변 수집**: `@callable() submitAnswer(round, playerId, answerText)`
- **진행자 컨트롤**: `@callable() startQuiz()`, `@callable() closeAnsweringEarly(round)`, `@callable() approveFinalResults()`

### 3. 프리미엄 실시간 UI (React 19 + Tailwind CSS)
- **진행자 전용 대시보드 (`/host`)**: 퀴즈 시작, 60초 답변 창 조기 마감, 실시간 채점 상황 모니터링, 최종 수동 승인
- **참가자 전용 응시 화면 (`/`)**: 닉네임 생성, 실시간 퀴즈 카드, 60초 카운트다운 타이머, 자유 서술형 답변 입력 및 피드백 확인
- **실시간 리더보드 (`Leaderboard.tsx`)**: 1, 2, 3위 메달 아이콘 및 실시간 랭킹 순위표 표출
