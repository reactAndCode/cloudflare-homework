# 📋 AI 개인 피트니스 코치 (`my13-hw3thinkframe`) 작업 체크리스트 (tasks.md)

이 문서는 `my13-hw3thinkframe` 프로젝트의 단계별 구현 작업 및 테스트 검증 체크리스트입니다.

---

## 1. 프로젝트 셋업 및 인프라 구성
- [x] `my13-hw3thinkframe` 프로젝트 디렉터리 생성
- [x] `package.json` 정의 (`@cloudflare/think`, `agents`, `workers-ai-provider`, `ai`, `react 19`, `lucide-react`, `cross-env`)
- [x] `wrangler.jsonc` 설정 (Durable Object `CoachAgent`, Workers AI, R2 `nomadclaw-skills`, `LOADER` Worker Loader 바인딩)
- [x] `vite.config.ts`, `tsconfig.*`, `eslint.config.js` 구성
- [x] `worker-configuration.d.ts` 타입 정의 생성 (`npx wrangler types`)
- [x] `npm install` 패키지 의존성 설치 완료

---

## 2. Cloudflare R2 스킬 가이드 문서 작성 및 업로드
- [x] `skills/squat_guide.md` (바벨 백 스쿼트 완벽 자세 및 무릎 부상 예방 가이드)
- [x] `skills/benchpress_guide.md` (바벨 벤치프레스 숄더 패킹 및 J-Curve 가이드)
- [x] `skills/running_5km_guide.md` (5km 완주 트레이닝 및 무릎 보호 러닝 가이드)
- [x] `skills/deadlift_guide.md` (컨벤셔널 데드리프트 셋업 5원칙 가이드)
- [x] `wrangler r2 object put` 명령어로 `nomadclaw-skills` 버킷에 4종 원격 업로드 완료

---

## 3. 백엔드 에이전트 구현 (`worker/index.ts`)
- [x] `CoachAgent extends Think<Env, State>` 구현
- [x] `getModel()`: Workers AI `@cf/zai-org/glm-4.7-flash` 모델 바인딩
- [x] `getTools()`: `createExtensionTools({ manager: this.extensionManager })` 등록
- [x] 내장 워크스페이스 도구 (`write`, `read`, `list` 등) 활성화 확인
- [x] `@callable() readWorkspaceFile(path)` 파일 조회 RPC 메서드 구현
- [x] `configureSession(session)`:
  - [x] `soul`: 한국어 피트니스 코치 페르소나 및 자율 도구(VFS, 메모리, R2 스킬, 런타임 확장) 행동 수칙
  - [x] `memory`: 신체 지표/무릎 부상/5km 목표 영구 저장 SQLite 세션 메모리
  - [x] `skills`: `R2SkillProvider(this.env.SKILLS, { prefix: "skills/" })`
- [x] `routeAgentRequest(request, env)` 기반 `fetch` 엔드포인트 핸들러

---

## 4. 프론트엔드 대시보드 UI 구현 (`src/App.tsx`, `src/index.css`)
- [x] 세련된 피트니스 콘솔 다크 테마 스타일링 (`index.css`)
- [x] `useAgent<AgentState>` 고정 인스턴스 `coach-main` 연결 (세션 지속성 보장)
- [x] `useAgentChat` 실시간 대화 스트리밍, 정지, 초기화, 도구 승인 UI
- [x] 모델 내부 추론(`part.type === "reasoning"`, `<think>` 태그) 숨김 필터링
- [x] 가상 워크스페이스 실시간 탐색기 및 인라인 마크다운 뷰어
- [x] 4대 테스트 시나리오 원클릭 **⚡ 퀵 질문 칩** 추가

---

## 5. 빌드 및 4대 핵심 기능 테스트 검증
- [x] `npm run build` TypeScript 컴파일 및 Vite 번들링 0 에러 통과
- [x] **[테스트 1] 훈련 기록 및 워크스페이스 로그/계획 관리**:
  - [x] "오늘 스쿼트 80kg 5회 5세트 했어" 보고 -> `logs/2026-09-11.md` 생성 및 `plan.md` 갱신 확인
  - [x] "이번 주에 무엇을 했지?" 질의 -> 코치가 저장된 로그를 읽어 정확히 요약 답변 확인
- [x] **[테스트 2] 지속 세션 메모리 (새 브라우저 세션 유지)**:
  - [x] "체중 75kg, 무릎 부상, 5km 완주 목표" -> 메모리 등록 확인
  - [x] 페이지 새로고침 후 "내일의 운동 계획을 알려줘" 질의 -> 무릎 부상과 5km 목표를 기억하여 맞춤 계획 답변 확인
- [x] **[테스트 3] R2 스킬 온디맨드 로드 및 언로드**:
  - [x] "스쿼트 자세 알려줘" 질의 -> `load_context`로 R2 `squat_guide` 로드 후 답변 및 `unload_context` 언로드 확인
- [x] **[테스트 4] 런타임 1RM 확장 도구 제작 및 계산**:
  - [x] "1RM 계산기를 만들어줘" -> `load_extension`으로 런타임 도구 등록 확인
  - [x] "80kg으로 5회 들면 내 1RM이 얼마야?" 질의 -> 등록된 도구를 실행하여 약 93kg 계산 확인

---

## 6. 문서화
- [x] `docs/05_dev_spec.md`: 아키텍처, 데이터 모델, 핵심 로직, 4대 테스트 상세 검증 결과
- [x] `docs/implementation_plan.md`: 기술 아키텍처 및 구현 설계서
- [x] `docs/tasks.md`: 작업 체크리스트 (본 문서)
- [x] `docs/walkthrough.md`: 최종 검증 스크린샷 포함 결과 보고서
