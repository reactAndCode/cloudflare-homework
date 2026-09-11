# Cloudflare Think Framework 기반 AI 개인 피트니스 코치 (`my13-hw3thinkframe`) 구현 계획

`my13-thinkframe`의 안정화된 기술 스택과 `@cloudflare/think` 프레임워크를 기반으로, 운동 기록을 가상 워크스페이스에 저장하고, 사용자 신체/부상/목표를 메모리에 기억하며, R2에서 전문 운동 가이드를 온디맨드로 조회하고, 런타임에 1RM 계산기를 동적으로 확장하는 **AI 개인 피트니스 코치 (`CoachAgent`)** 시스템을 구축합니다.

---

## User Review Required

> [!IMPORTANT]
> - **AI 모델**: Workers Free 플랜에서 Tool-calling 및 다국어 추론이 안정적인 `@cf/zai-org/glm-4.7-flash`를 기본 모델로 사용합니다.
> - **R2 스킬 버킷**: 이전 단계에서 생성한 Cloudflare 계정의 `nomadclaw-skills` 버킷을 그대로 활용하며, `skills/` 접두어로 스쿼트, 벤치프레스, 5km 달리기 가이드 등 3개 이상의 전문 가이드 문서를 업로드합니다.
> - **메모리 지속성(Persistence)**: Durable Object 인스턴스 이름을 고정값(예: `"coach-main"`)으로 설정하여, 브라우저를 새로고침하거나 새 탭/창을 열어도 신체 정보, 부상, 5km 목표가 영구 보존되도록 구현합니다.

---

## Proposed Changes

### 1. 프로젝트 기반 및 설정 구성

`d:\dev\cloudflare\cloudflare-homework\my13-hw3thinkframe` 디렉터리를 생성하고 기본 프로젝트 파일을 구성합니다.

#### [NEW] [package.json](file:///d:/dev/cloudflare/cloudflare-homework/my13-hw3thinkframe/package.json)
- `@cloudflare/think`, `agents`, `@cloudflare/ai-chat`, `workers-ai-provider`, `ai`, `react`, `lucide-react`, `cross-env` 등 핵심 패키지 정의
- scripts: `"dev": "cross-env NODE_TLS_REJECT_UNAUTHORIZED=0 vite"`, `"build": "tsc -b && vite build"`

#### [NEW] [wrangler.jsonc](file:///d:/dev/cloudflare/cloudflare-homework/my13-hw3thinkframe/wrangler.jsonc)
- Durable Objects SQLite 바인딩: `CoachAgent`
- AI 바인딩: `{ "binding": "AI", "remote": true }`
- R2 버킷 바인딩: `{ "binding": "SKILLS", "bucket_name": "nomadclaw-skills", "remote": true }`
- Worker Loader 바인딩: `{ "binding": "LOADER" }`
- Node.js 호환성 플래그: `["nodejs_compat"]`

#### [NEW] [vite.config.ts](file:///d:/dev/cloudflare/cloudflare-homework/my13-hw3thinkframe/vite.config.ts), tsconfig 파일군
- agents, react, tailwindcss, cloudflare 플러그인 구성

---

### 2. 백엔드 에이전트 구현

#### [NEW] [worker/index.ts](file:///d:/dev/cloudflare/cloudflare-homework/my13-hw3thinkframe/worker/index.ts)
- **`CoachAgent extends Think<Env, State>`**:
  - `extensionLoader = this.env.LOADER;`
  - `initialState: State = { files: [] }`
  - `onStart()` 및 `onChatResponse()`: 파일 목록(`refreshFiles()`) 및 세션 프롬프트(`refreshSystemPrompt()`) 동기화
  - `getModel()`: `@cf/zai-org/glm-4.7-flash` 바인딩 반환
  - `getTools()`:
    - `createExtensionTools({ manager: this.extensionManager })`: 런타임 도구 확장(`load_extension`, `list_extensions`) 지원
    - (Think 내장 `this.workspace` 도구 `read`, `write`, `edit`, `list` 등은 프레임워크에 의해 매 턴 자동 병합)
  - `@callable() readWorkspaceFile(path)`: 클라이언트 UI에서 파일 클릭 시 내용 조회하는 RPC
  - `configureSession(session)`:
    - **`soul`**: 전문적이고 동기부여를 주는 피트니스 코치 페르소나 정의
      - 운동 보고 시 `logs/<YYYY-MM-DD>.md` 파일 생성/추가 및 `plan.md` 갱신 지침
      - 신체 정보/부상/목표 보고 시 `memory` 컨텍스트에 저장 및 유지 지침
      - 운동 자세 질문 시 `load_context`로 R2 스킬(`squat_guide` 등)을 불러와 답변 후 `unload_context`로 정리하는 지침
      - 1RM 계산기 등 도구 필요 시 `load_extension`을 호출하여 런타임 자바스크립트 도구로 등록하는 지침
      - 모든 대화는 친절하고 유창한 한국어로 작성
    - **`memory`**: `description: "User body metrics, injuries, and fitness goals."` (영구 SQLite 세션 메모리)
    - **`skills`**: `new R2SkillProvider(this.env.SKILLS, { prefix: "skills/" })`
  - `fetch` 핸들러: `routeAgentRequest(request, env)` 디스패치

---

### 3. R2 스킬 가이드 문서 작성 및 업로드

`nomadclaw-skills` R2 버킷에 3개 이상의 전문 운동 가이드 문서를 업로드합니다.

#### [NEW] `scratch/skills/squat_guide.md`
- 바벨 백 스쿼트 완벽 가이드: 발 너비, 힙 드라이브, 무릎 정렬, 깊이(Parrellel/Full), 호흡 및 무릎 부상자 주의점

#### [NEW] `scratch/skills/benchpress_guide.md`
- 바벨 벤치프레스 가이드: 그립 너비, 숄더 패킹(견갑 후인하강), 바 궤적(J 커브), 호흡법

#### [NEW] `scratch/skills/running_5km_guide.md`
- 5km 완주 트레이닝 가이드: 인터벌 러닝 플랜, 미드풋 착지법, 케이던스, 무릎 관절 보호 스트레칭

- 업로드 명령어: `npx wrangler r2 object put nomadclaw-skills/skills/<name>.md --file=... --remote`

---

### 4. 프론트엔드 대시보드 UI 구현

#### [NEW] [src/App.tsx](file:///d:/dev/cloudflare/cloudflare-homework/my13-hw3thinkframe/src/App.tsx)
- **에이전트 연결**: `useAgent<AgentState>({ agent: "CoachAgent", name: "coach-main", onStateUpdate })` (새 세션에서도 같은 DO 인스턴스에 연결되어 메모리/로그 유지)
- **실시간 대화 (`useAgentChat`)**: 메시지 스트리밍, 정지(Stop), 기록 초기화(Clear)
- **내부 리즈닝 필터링**: `part.type === "reasoning"` 숨김 처리 및 `<think>` 정제
- **워크스페이스 탐색기**:
  - `logs/` 및 `plan.md` 실시간 파일 트리 표시
  - 파일 클릭 시 `stub.readWorkspaceFile(path)` 호출 및 마크다운 뷰어 제공
- **코칭 대시보드 위젯**:
  - 메모리 등록 상태 (체중, 부상 여부, 5km 목표 등 시각화)
  - 등록된 런타임 확장 도구(1RM 계산기 등) 표시

#### [NEW] [src/index.css](file:///d:/dev/cloudflare/cloudflare-homework/my13-hw3thinkframe/src/index.css)
- Tailwind CSS v4 기반의 세련된 피트니스 코칭 테마 스타일링

---

### 5. 개발 명세서 작성

#### [NEW] [docs/05_dev_spec.md](file:///d:/dev/cloudflare/cloudflare-homework/my13-hw3thinkframe/docs/05_dev_spec.md)
- 시스템 아키텍처, 데이터 모델, 핵심 로직 및 함수 설명, 4대 테스트 시나리오 검증 결과 수록.

---

## Verification Plan

### Automated / Build Verification
- `npm run build`: TypeScript 컴파일 및 Vite 번들링 0 에러 확인

### Manual & Browser Subagent Verification (요구된 4대 테스트)
1. **운동 로그 및 계획 갱신 테스트**:
   - 입력: *"오늘 스쿼트 했어. 80kg으로 5회씩 5세트 했어"*
   - 검증: 가상 워크스페이스에 `logs/2026-09-11.md` 파일이 생성되고 `plan.md`가 갱신되는지 확인.
   - 입력: *"이번 주에 무엇을 했지?"* -> 코치가 방금 저장한 로그 파일을 읽어 답변하는지 확인.
2. **세션 메모리 유지 테스트**:
   - 입력: *"내 체중은 75kg이고 무릎 부상이 있어. 목표는 5km 완주야."*
   - 검증: 브라우저 세션을 새로고침하거나 새 탭을 열어 *"내일의 운동 계획을 알려줘"* 질의 시, 체중/무릎 부상/5km 목표를 모두 기억하여 무릎에 무리가 가지 않는 계획을 제시하는지 확인.
3. **R2 스킬 온디맨드 로드/언로드 테스트**:
   - 입력: *"스쿼트 올바른 자세 가이드 알려줘"*
   - 검증: 모델이 R2의 `squat_guide`를 `load_context`하여 답변하고, 답변 후 `unload_context`를 수행하는지 확인.
4. **런타임 1RM 계산기 확장 도구 테스트**:
   - 입력: *"1회 최대 중량(1RM) 계산기를 만들어줘"*
   - 검증: 모델이 `load_extension` 도구를 호출하여 1RM 계산기 확장을 등록하는지 확인.
   - 입력: *"80kg으로 5회 들면 내 1RM이 얼마야?"*
   - 검증: 등록된 계산기 도구를 호출하여 약 93kg(또는 93.3kg)이라고 정확히 답변하는지 확인.
