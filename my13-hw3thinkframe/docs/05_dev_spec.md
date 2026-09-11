# 🏋️‍♂️ Cloudflare Think Framework 기반 AI 피트니스 코치 개발 명세서 (05_dev_spec.md)

이 문서는 `my13-hw3thinkframe` 프로젝트에 구현된 Cloudflare Workers, Durable Objects (SQLite), Cloudflare Agents SDK, Vercel AI SDK (`ai`), `@cloudflare/think` 프레임워크 및 R2 스킬 저장소를 결합한 **개인 AI 피트니스 코치 (`CoachAgent`)**의 상세 기술 명세서와 4대 핵심 기능 테스트 검증 기록입니다.

---

## 1. 프로젝트 개요 (Overview)

본 프로젝트는 Cloudflare의 차세대 서버리스 아키텍처와 `@cloudflare/think` 프레임워크를 활용하여, 운동 훈련 기록 관리, 신체/부상 정보의 장기 기억 보존, R2 기반 온디맨드 운동 가이드 참조, 런타임 동적 1RM 계산기 확장 기능을 자율적으로 수행하는 **AI 개인 피트니스 코칭 시스템**입니다.

### 주요 핵심 기능
1. **가상 워크스페이스 훈련 기록 (VFS & Workspace Tools)**:
   - 사용자가 운동 수행을 보고하면 내장된 파일 조작 도구를 활용하여 `logs/<YYYY-MM-DD>.md` 파일을 자동 생성/기록하고, `plan.md` 훈련 계획을 지속 업데이트합니다.
   - 과거 운동 기록 질의 시 `logs/` 디렉터리의 실제 마크다운 파일을 검색/열람하여 정확한 훈련 내역을 요약 답변합니다.
2. **세션 지속형 메모리 (Persistent Memory Context)**:
   - 체중, 무릎 부상, 5km 완주 목표 등 사용자의 민감한 신체 지표 및 운동 목표를 Durable Object의 SQLite 세션 메모리에 영구 저장합니다.
   - 브라우저를 닫거나 새로고침하여 새 세션이 시작되어도 이전에 저장된 부상 정보 및 목표를 기억하여 맞춤형 플랜을 제공합니다.
3. **R2 온디맨드 스킬 가이드 (R2SkillProvider)**:
   - Cloudflare R2 버킷(`nomadclaw-skills`)의 `skills/` 디렉터리에 사전 업로드된 전문 운동 가이드(`squat_guide.md`, `benchpress_guide.md`, `running_5km_guide.md`, `deadlift_guide.md`)를 관리합니다.
   - 자세 질문이 들어오면 `load_context` 도구로 필요한 가이드만 즉시 불러와 답변하고, 답변이 끝나면 `unload_context`로 컨텍스트를 회수하여 토큰을 절약합니다.
4. **런타임 동적 도구 확장 (Dynamic Extension Tools)**:
   - 코치에게 사전에 정의되지 않은 계산 기능(예: 1RM 계산기)이 필요해지면, `load_extension` 도구를 통해 Epley 공식 기반의 1RM 계산기 자바스크립트 모듈을 런타임에 즉시 작성하고 활성화합니다.
   - 80kg 5회 운동 시 공식($1RM = 80 \times (1 + 5/30) \approx 93.3\text{kg}$)에 따라 약 93kg의 최대 중량을 도구 호출을 통해 산출합니다.
5. **사고 과정(Reasoning) 필터링 & 모던 스포츠 대시보드 UI**:
   - 모델의 내부 추론(Thinking/Reasoning) 파트는 깔끔히 숨김 처리하고 최종 정제된 대화만 출력합니다.
   - 실시간 워크스페이스 파일 탐색기, 마크다운 뷰어, 퀵 테스트 프롬프트 칩을 제공합니다.

---

## 2. 시스템 아키텍처 (Architecture)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       React 19 + Vite Dashboard (Client)                   │
│  - useAgent<AgentState>: Durable Object 고정 룸("coach-main") WebSocket 연결 │
│  - useAgentChat: 실시간 스트리밍 대화, 중단(Stop), 대화 초기화, 도구 승인 UI  │
│  - VFS Explorer: logs/ 및 plan.md 실시간 탐색 & @callable 파일 본문 뷰어     │
│  - Quick Test Chips: 4대 핵심 검증 시나리오 1-클릭 실행 바                    │
└──────────────────────┬───────────────────────────────▲──────────────────────┘
                       │ WebSocket / HTTP RPC          │ State Sync (files[])
                       ▼                               │
┌─────────────────────────────────────────────────────────────────────────────┐
│                 Cloudflare Workers (CoachAgent Durable Object)              │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │ CoachAgent extends Think<Env, State>                                  │  │
│  │  - getModel(): Workers AI (@cf/zai-org/glm-4.7-flash)                 │  │
│  │  - workspace: 가상 파일 시스템 (logs/*.md, plan.md)                   │  │
│  │  - configureSession():                                                │  │
│  │      ├─ soul: 한국어 피트니스 코치 페르소나 및 자율 도구 행동 수칙      │  │
│  │      ├─ memory: 신체 지표/무릎 부상/5km 목표 (SQLite 영구 보존)       │  │
│  │      └─ skills: R2SkillProvider (nomadclaw-skills/skills/)           │  │
│  │  - getTools(): createExtensionTools (런타임 load_extension)           │  │
│  │  - @callable readWorkspaceFile(path): VFS 파일 읽기 RPC               │  │
│  └───────────────────────────────────┬───────────────────────────────────┘  │
└──────────────────────────────────────┼──────────────────────────────────────┘
         │                             │                             │
         ▼                             ▼                             ▼
┌──────────────────┐         ┌──────────────────┐         ┌──────────────────┐
│ Workers AI       │         │ Cloudflare R2    │         │ Worker Loader    │
│ (@cf/zai-org/    │         │ (nomadclaw-      │         │ (LOADER Binding) │
│ glm-4.7-flash)   │         │ skills 버킷)     │         │ 1RM 계산기 샌드박스│
└──────────────────┘         └──────────────────┘         └──────────────────┘
```

---

## 3. 백엔드 구현 상세 (`worker/index.ts`)

### 3.1 `CoachAgent` 클래스 정의
```typescript
export class CoachAgent extends Think<Env, State> {
  extensionLoader = this.env.LOADER;

  initialState: State = {
    files: [],
  };

  async onStart() {
    await this.refreshFiles();
    await this.session.refreshSystemPrompt();
  }

  async onChatResponse() {
    await this.refreshFiles();
    await this.session.refreshSystemPrompt();
  }
  ...
}
```

### 3.2 모델 및 도구 바인딩
- **`getModel()`**:
  ```typescript
  getModel(): LanguageModel {
    const workersAI = createWorkersAI({ binding: this.env.AI });
    return workersAI("@cf/zai-org/glm-4.7-flash");
  }
  ```
- **`getTools()`**:
  ```typescript
  getTools() {
    return {
      ...(this.extensionManager
        ? createExtensionTools({ manager: this.extensionManager })
        : {}),
    };
  }
  ```
  > `Think` 프레임워크는 `this.workspace`의 가상 파일 도구(`read`, `write`, `edit`, `list`, `find`, `grep`, `delete`)를 매 턴마다 자동으로 모델에 병합하여 주입합니다.

### 3.3 세션 컨텍스트 체이닝 (`configureSession`)
```typescript
configureSession(session: Session) {
  return session
    .withContext("soul", {
      provider: {
        async get() {
          const today = new Date().toISOString().slice(0, 10);
          return `당신은 사용자의 건강과 목표 달성을 전담하는 전문적이고 꼼꼼한 AI 개인 피트니스 코치(CoachAgent)입니다.
오늘 날짜는 ${today} 입니다.

[핵심 행동 수칙]
1. 언어: 모든 답변은 반드시 전문적이고 격려 넘치는 한국어(Korean)로 유창하게 작성하세요.
2. 워크스페이스 운동 기록 (Workspace File Tools):
   - 사용자가 운동을 보고하면 logs/${today}.md 파일에 운동 종목, 중량, 횟수, 세트 수를 기록하고 plan.md를 갱신하세요.
   - 과거 운동 내역을 물어보면 logs/ 디렉터리의 기록을 읽어 요약 답변하세요.
3. 신체 정보 및 목표 기억 (Memory Context):
   - 체중, 부상(무릎 부상), 운동 목표(5km 완주)를 알려주면 memory에 기록하고 향후 계획에 반영하세요.
4. R2 전문 스킬 가이드 활용 (Skills Context):
   - 스쿼트 등 자세 질문 시 load_context로 R2 스킬(squat_guide)을 로드하여 답변하고 즉시 unload_context로 언로드하세요.
5. 런타임 확장 도구 등록 (Extension Tools):
   - 1RM 계산기 등 필요한 계산기가 없으면 load_extension으로 작성/등록하고 Epley 공식으로 산출하세요.`;
        },
      },
    })
    .withContext("memory", {
      description: "User body metrics, physical injuries, workout preferences, and fitness goals.",
      maxTokens: 10_000,
    })
    .withContext("skills", {
      description: "Reference exercise and workout guides on demand.",
      provider: new R2SkillProvider(this.env.SKILLS, { prefix: "skills/" }),
    });
}
```

---

## 4. 프론트엔드 구현 상세 (`src/App.tsx`)

### 4.1 고정 인스턴스 룸 연결 (`coach-main`)
```typescript
const agent = useAgent<AgentState>({
  agent: "CoachAgent",
  name: "coach-main",
  onStateUpdate: setAgentState,
});
```
- 인스턴스 이름 `name: "coach-main"`을 지정함으로써 사용자가 브라우저를 새로고침하거나 새 탭에서 접속해도 동일한 Durable Object에 접속되어 메모리, 운동 로그, 훈련 계획이 그대로 유지됩니다.

### 4.2 내부 리즈닝/사고 과정 및 중간 도구 상태(output-available) 은폐 필터링
```typescript
function renderMessage(msg: UIMessage) {
  return msg.parts.map((part, i) => {
    // 1. 모델의 내부 생각/추론(Reasoning) 파트는 화면에 표시하지 않음
    if (part.type === "reasoning") {
      return null;
    }

    // 2. 텍스트 내 <think> 태그 정제 및 최종 텍스트만 출력
    if (part.type === "text") {
      const cleaned = part.text
        .replace(/<think>[\s\S]*?<\/think>/g, "")
        .replace(/<\/?think>/g, "")
        .trim();
      if (!cleaned) return null;
      return <p key={i} className="whitespace-pre-wrap leading-relaxed text-sm">{cleaned}</p>;
    }

    // 3. 도구 실행 중간 과정(output-available, running, list, write 등) 완전 은폐
    if (isToolUIPart(part)) {
      if ("approval" in part && part.state === "approval-requested") {
        return <ToolApprovalCard ... />;
      }
      // output-available 등 모든 중간 과정은 UI에 노출하지 않고 최종 답변만 표시
      return null;
    }
    return null;
  });
}
```
- **중간 도구 상자 숨김**: `write`, `list`, `load_context`, `load_extension` 등 백엔드에서 활발히 실행되는 도구 중간 상태(`output-available`)를 화면에서 완전히 숨겨 사용자에게는 깔끔한 최종 답변만 전달합니다.
- **최대 20줄 이내의 간결성 규칙**: 백엔드 `soul` 프롬프트에 `답변은 핵심만 간단하고 명료하게 요약하여 작성하고, 최대 20줄을 초과하지 마세요` 지침을 추가하여 군더더기 없는 명쾌한 답변을 보장합니다.

---

## 5. 4대 핵심 기능 테스트 검증 결과 (Verification Results)

### [테스트 1] 운동 보고 및 가상 워크스페이스 로그/계획 갱신
- **질의**: `"오늘 스쿼트 했어. 80kg으로 5회씩 5세트 했어"`
- **동작**:
  - 모델이 `write` 도구를 호출하여 `/logs/2026-09-11.md` 파일 생성 (스쿼트 80kg 5회 5세트 기록).
  - 모델이 `plan.md` 파일을 최신 훈련 계획으로 갱신.
- **후속 질의**: `"이번 주에 무엇을 했지?"`
- **검증 결과**:
  - 코치가 `list` 및 `read` 도구로 `logs/` 디렉터리의 오늘 기록을 탐색/조회하여 *"오늘 진행하신 바벨 백 스쿼트 80kg 5회씩 5세트 기록이 잘 저장되어 있습니다"* 라고 정확히 파악하여 답변 성공.

---

### [테스트 2] 세션 메모리 보존 (신체 정보, 무릎 부상, 5km 완주 목표)
- **질의**: `"내 체중은 75kg이고 무릎 부상이 있어. 목표는 5km 완주야."`
- **동작**:
  - 코치가 `set_context` 도구를 호출하여 세션 메모리에 체중 75kg, 무릎 부상, 5km 완주 목표를 저장 (`Memory Usage: 1% (94/10000 tokens)`).
- **새 브라우저 세션 시뮬레이션**:
  - 페이지 새로고침 후 세션 재접속.
- **후속 질의**: `"내일의 운동 계획을 알려줘"`
- **검증 결과**:
  - 코치가 새 세션에서도 기억을 유지하여 *"무릎 부상을 보호하면서 5km 완주 목표를 달성할 수 있도록 관절 충격을 줄이는 저충격 유산소 및 상체/코어 보강 훈련 플랜"*을 수립하여 제안 성공.

---

### [테스트 3] R2 스킬 가이드 온디맨드 로드 및 언로드
- **질의**: `"스쿼트 자세 알려줘"`
- **동작**:
  - 코치가 `load_context` 도구를 호출하여 R2 버킷의 `squat_guide` 스킬을 온디맨드 로드 (`{"label": "skills", "key": "squat_guide"}`).
  - 스쿼트 가이드 문서의 발 각도, 힙 힌지, 패러럴 깊이, 무릎 정렬 수칙을 인용하여 상세 답변 작성.
  - 답변 완료 후 컨텍스트를 회수하기 위해 `unload_context` 도구를 호출하여 스킬 언로드 수행.
- **검증 결과**:
  - R2 스킬의 동적 로드 및 언로드가 완벽하게 이루어짐을 확인.

---

### [테스트 4] 런타임 1RM 계산기 확장 도구 제작 및 계산
- **질의 1**: `"1회 최대 중량(1RM) 계산기를 만들어줘"`
- **동작**:
  - 코치가 `load_extension` 도구를 실행하여 Epley 공식을 사용하는 런타임 계산기 도구(`1rm_calculator_calculate_1rm`)를 Worker Loader 샌드박스에 동적 등록.
- **질의 2**: `"80kg으로 5회 들면 내 1RM이 얼마야?"`
- **동작**:
  - 방금 생성된 런타임 도구를 직접 실행하여 계산 수행:
    $$\text{1RM} = 80 \times \left(1 + \frac{5}{30}\right) = 80 \times 1.1667 \approx 93.33\text{kg}$$
- **검증 결과**:
  - 코치가 계산기 도구의 결과값을 확인하고 **약 93kg**이라고 정확하게 답변 산출 성공.

---

## 6. 가상 워크스페이스(VFS) 파일의 물리 저장 경로 및 직접 확인 방법

### 6.1 `logs/2026-09-11.md` 파일은 내 컴퓨터 어디에 있는가?
- `@cloudflare/think` 프레임워크의 `this.workspace`는 일반 윈도우 OS 파일 탐색기에 별도의 `.md` 텍스트 파일로 생성되는 것이 아니라, **Cloudflare Workers Durable Object(`CoachAgent`)의 내장 SQLite 데이터베이스 내부의 `cf_workspace_default` 테이블 레코드**로 저장/관리됩니다.
- 로컬 개발 환경(`wrangler dev` / `vite`)에서 이 SQLite 데이터베이스의 실제 내 컴퓨터 하드디스크 경로는 다음과 같습니다:

```text
D:\dev\cloudflare\cloudflare-homework\my13-hw3thinkframe\.wrangler\state\v3\do\my13-hw3thinkframe-CoachAgent\3da1659cfc8d937a03d26a8f45e50d58842f4096fe7030d12035bdb09af8984a.sqlite
```
> **참고**: `.wrangler` 디렉터리는 기본적으로 숨김 속성일 수 있으므로, 윈도우 탐색기 주소창에 위 경로를 직접 붙여넣거나 "숨김 파일 및 폴더 표시"를 활성화하면 바로 확인하실 수 있습니다.

### 6.2 실제 저장된 파일 내용 확인 방법 (3가지)

#### 방법 1: 웹 대시보드 UI에서 클릭 열람 (가장 간편)
- 브라우저(`http://localhost:5174/`) 좌측의 **"훈련 워크스페이스"** 목록에서 `logs/2026-09-11.md` 버튼을 클릭하면, 클라이언트 RPC(`agent.stub.readWorkspaceFile`)가 실행되어 SQLite 내부 본문을 뷰어 화면에 즉시 마크다운으로 표시합니다.

#### 방법 2: 터미널에서 Node.js 명령어로 직접 SQLite 본문 조회
프로젝트 디렉터리 터미널에서 아래 명령어를 실행하면 SQLite DB에 실제로 저장된 `logs/2026-09-11.md` 파일의 텍스트가 콘솔에 그대로 출력됩니다:
```bash
node --eval "const { DatabaseSync } = require('node:sqlite'); const db = new DatabaseSync('D:/dev/cloudflare/cloudflare-homework/my13-hw3thinkframe/.wrangler/state/v3/do/my13-hw3thinkframe-CoachAgent/3da1659cfc8d937a03d26a8f45e50d58842f4096fe7030d12035bdb09af8984a.sqlite'); console.log(db.prepare('SELECT content FROM cf_workspace_default WHERE path = \'/logs/2026-09-11.md\'').get().content);"
```

#### 방법 3: SQLite 테이블 전체 파일 목록 및 본문 일괄 덤프
```bash
node --eval "const { DatabaseSync } = require('node:sqlite'); const db = new DatabaseSync('D:/dev/cloudflare/cloudflare-homework/my13-hw3thinkframe/.wrangler/state/v3/do/my13-hw3thinkframe-CoachAgent/3da1659cfc8d937a03d26a8f45e50d58842f4096fe7030d12035bdb09af8984a.sqlite'); console.log(JSON.stringify(db.prepare('SELECT path, size, content FROM cf_workspace_default').all(), null, 2));"
```
- 결과: `/`, `/logs`, `/logs/2026-09-11.md`, `/plan.md` 등이 테이블 안에 보관되어 있음을 직접 확인 가능.

---

## 7. 최근 변경 내역 (Recent Updates)

1. **중간 도구 실행 과정(`output-available` 등) 및 추론 과정(Reasoning) 완전 은폐**:
   - `src/App.tsx`의 `renderMessage` 함수에서 `isToolUIPart(part)` 중 수동 승인 요청(`approval-requested`)을 제외한 모든 도구 중간 상태(`output-available`, `running`, 파라미터 JSON 등)를 화면에서 숨김(`return null`) 처리.
   - 모델의 내부 추론(`part.type === "reasoning"`) 및 `<think>` 태그 정제.
2. **답변 길이 20줄 이내 간결성 지침 강화**:
   - `worker/index.ts`의 `soul` 컨텍스트에 `답변은 핵심만 최대한 간단하고 명료하게 요약하여 작성하고, 최대 20줄을 절대 넘지 마세요` 규칙 추가.
3. **문서 동기화**:
   - `docs/05_dev_spec.md`, `docs/implementation_plan.md`, `docs/tasks.md`, `docs/walkthrough.md`, `docs/screenshots/` 저장 완료.

---

## 8. 결론

`my13-hw3thinkframe`는 Cloudflare Workers 환경에서 `@cloudflare/think` 프레임워크의 4대 핵심 축인 **가상 파일 시스템(Workspace)**, **영구 메모리(Memory)**, **온디맨드 스킬(Skills)**, **런타임 확장(Extensions)**을 완전하게 통합 구현한 성공적인 레퍼런스 프로젝트입니다.

