# 🧠 Cloudflare Think Framework 기반 AI 에이전트 개발 명세서 (05_dev_spec.md)

이 문서는 `my13-thinkframe` 프로젝트에 구현된 Cloudflare Workers, Durable Objects (SQLite), Cloudflare Agents SDK, Vercel AI SDK (`ai`), 그리고 `@cloudflare/think` 프레임워크 기반 자율 AI 에이전트 시스템의 상세 기술 명세서와 트러블슈팅 기록입니다.

---

## 1. 프로젝트 개요 (Overview)

본 프로젝트는 Cloudflare의 차세대 서버리스 기술 스택과 `@cloudflare/think` 프레임워크를 활용하여 구축된 **자율형 인텔리전트 에이전트 시스템**입니다.
에이전트는 사용자와의 실시간 스트리밍 대화뿐만 아니라, **가상 워크스페이스 파일 조작**, **장기 기억(Memory) 및 영혼(Soul) 페르소나 컨텍스트 유지**, **R2 기반 스킬 레퍼런스 조회**, **런타임 동적 확장(Extension Tools) 로딩 및 도구 실행**을 자율적으로 수행합니다.

### 주요 핵심 기능
1. **자율 에이전트 루프 (Autonomous Agentic Loop)**:
   - 복합적인 요구사항에 대해 모델이 도구 실행(Tool Execution)을 반복하고 결과를 관찰하여 최종 응답을 완성.
2. **가상 파일 시스템 (Workspace Virtual Filesystem)**:
   - Durable Object의 스토리지 기반 가상 워크스페이스 지원 (`glob`, `readFile`, `writeFile` 등).
   - 파일 추가/변경 시 프론트엔드 워크스페이스 탐색기(Workspace Explorer)에 실시간 자동 동기화.
3. **세션 컨텍스트 체이닝 (Session Contexts)**:
   - `soul`: 에이전트의 성격/페르소나 정의 (도움이 되지만 살짝 풍자적인 톤).
   - `memory`: 대화 간 지속되는 사용자 관련 메모리 (최대 10,000 토큰).
   - `skills`: Cloudflare R2 버킷(`nomadclaw-skills`)에 저장된 온디맨드 레퍼런스 문서 자동 주입.
4. **런타임 확장 도구 (Dynamic Extensions)**:
   - LLM이 자바스크립트 소스 코드를 작성하여 런타임에 동적으로 새로운 도구를 로드하고 호출할 수 있는 메커니즘 제공 (`WorkerLoader` 바인딩).
5. **Human-in-the-loop 도구 승인 UI**:
   - 승인이 필요한 도구 호출 발생 시 클라이언트 UI에서 Approve / Reject 인터랙션 지원.
6. **내부 사고 과정(Reasoning/Thinking) 정제 필터링**:
   - 모델의 내부 추론(혼잣말/사고 과정)은 채팅창에 노출되지 않도록 필터링하고 최종 정제된 대화만 사용자에게 제공.

### 주요 기술 스택
| 구분 | 기술 / 라이브러리 | 용도 |
| :--- | :--- | :--- |
| **Runtime & Host** | Cloudflare Workers | 서버리스 런타임 및 HTTP 요청 라우팅 |
| **Stateful Agent** | Cloudflare Agents SDK (`agents` `^0.12.4`) | Durable Object 기반 상태 관리, RPC, WebSocket 연결 |
| **Agent Framework** | `@cloudflare/think` (`^0.5.3`) | ThinkAgent 추상 클래스, Workspace, 세션 컨텍스트, 확장 도구 관리 |
| **AI SDK & Model** | Vercel AI SDK (`ai` `^6.0.182`), `workers-ai-provider` (`^3.1.14`) | 모델 추론, 도구 정의, 스트리밍 |
| **LLM Engine** | Cloudflare Workers AI (`@cf/zai-org/glm-4.7-flash`) | Workers Free 플랜 호환 고성능 Tool-calling & 멀티턴 대화 모델 |
| **Storage & Loader** | Cloudflare R2 (`nomadclaw-skills`), Worker Loader (`LOADER`) | 에이전트 스킬 문서 저장소 및 동적 확장 샌드박스 실행 |
| **Frontend** | React 19, Vite 8, Tailwind CSS v4, `@cloudflare/ai-chat` | 반응형 채팅 UI, 워크스페이스 탐색기, 도구 승인 인터페이스 |

---

## 2. 시스템 아키텍처 (Architecture)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           React Client (Vite)                              │
│  - useAgent<AgentState>: WebSocket 실시간 상태 및 RPC 연결                   │
│  - useAgentChat: 실시간 스트리밍 대화, 중단(Stop), 히스토리 초기화, 도구 승인  │
│  - Workspace Explorer: 파일 목록 실시간 시각화 및 클릭 시 내용 읽기         │
│  - Reasoning Filter: 내부 생각(Reasoning/Thinking) 숨김 처리                 │
└──────────────────────┬───────────────────────────────▲──────────────────────┘
                       │ WebSocket / HTTP RPC          │ State Sync
                       ▼                               │
┌─────────────────────────────────────────────────────────────────────────────┐
│                  Cloudflare Workers (ThinkAgent Durable Object)              │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │ ThinkAgent extends Think<Env, State>                                  │  │
│  │  - initialState: { files: [] }                                        │  │
│  │  - onStart() / onChatResponse(): refreshFiles() 및 세션 프롬프트 동기화│  │
│  │  - getModel(): Workers AI (@cf/zai-org/glm-4.7-flash)                 │  │
│  │  - getTools(): getWeather, createExtensionTools                      │  │
│  │  - @callable readWorkspaceFile(path): RPC 파일 내용 반환              │  │
│  │  - configureSession(session): soul, memory, skills 컨텍스트 체이닝     │  │
│  └───────────────────────────────────┬───────────────────────────────────┘  │
└──────────────────────────────────────┼──────────────────────────────────────┘
         │                             │                             │
         ▼                             ▼                             ▼
┌──────────────────┐         ┌──────────────────┐         ┌──────────────────┐
│ Workers AI       │         │ Cloudflare R2    │         │ Worker Loader    │
│ (@cf/zai-org/    │         │ (nomadclaw-      │         │ (LOADER Binding) │
│ glm-4.7-flash)   │         │ skills 버킷)     │         │ 동적 JS 실행     │
└──────────────────┘         └──────────────────┘         └──────────────────┘
```

---

## 3. 데이터 구조 및 타입 정의

### 3.1 상태 타입 (`State`)
Durable Object 내부 상태로 유지되며 클라이언트로 실시간 브로드캐스팅되는 타입입니다.

```typescript
type FileEntry = {
  path: string;                // 워크스페이스 상대 파일 경로 (예: "notes.txt")
  type: "file" | "directory";  // 파일 또는 디렉터리 구분
  size: number;                // 파일 크기 (bytes)
  updatedAt: number;           // 최종 수정 타임스탬프 (ms)
};

type State = {
  files: FileEntry[];          // 가상 워크스페이스에 생성된 파일 목록
};
```

### 3.2 클라이언트 RPC 스텁 인터페이스 (`AgentStub`)
클라이언트에서 `@callable()`로 선언된 에이전트 메서드를 호출하기 위한 타입입니다.

```typescript
type AgentStub = {
  readWorkspaceFile: (path: string) => Promise<string | null>;
};
```

---

## 4. 백엔드 구현 상세 (`worker/index.ts`)

### 4.1 `ThinkAgent` 클래스
`@cloudflare/think`의 `Think<Env, State>`를 상속받아 Durable Object로 동작합니다.

```typescript
export class ThinkAgent extends Think<Env, State> {
  extensionLoader = this.env.LOADER;

  initialState: State = {
    files: [],
  };

  async onStart() {
    await this.refreshFiles();
  }

  async onChatResponse() {
    await this.refreshFiles();
    await this.session.refreshSystemPrompt();
  }
  ...
}
```

- **`extensionLoader = this.env.LOADER`**:
  `wrangler.jsonc`에 선언된 `worker_loaders` 바인딩을 주입하여 동적 확장 모듈을 안전하게 격리된 환경에서 실행합니다.
- **`onStart()`**:
  에이전트 인스턴스가 깨어날 때 `refreshFiles()`를 실행하여 기존 가상 워크스페이스의 파일 상태를 초기화합니다.
- **`onChatResponse()`**:
  채팅 턴이 완료된 직후 실행됩니다. 모델이 도구를 통해 파일을 생성하거나 수정했을 수 있으므로 파일 목록을 갱신하고, 세션 프롬프트(`refreshSystemPrompt()`)를 재동기화합니다.

### 4.2 `refreshFiles()` 함수
```typescript
async refreshFiles() {
  const all = await this.workspace.glob("**/*");
  this.setState({
    files: all.map((file) => ({
      type: file.type === "directory" ? "directory" : "file",
      path: file.path,
      size: file.size,
      updatedAt: file.updatedAt,
    })),
  });
}
```
- `this.workspace`: `@cloudflare/think` 프레임워크가 제공하는 가상 워크스페이스 인스턴스.
- `glob("**/*")`을 통해 전체 파일 및 디렉터리 메타데이터를 비동기 탐색한 후 `this.setState()`를 통해 연결된 모든 클라이언트에 상태를 즉시 전파합니다.

### 4.3 `getModel()` 함수
```typescript
getModel(): LanguageModel {
  const workersAI = createWorkersAI({ binding: this.env.AI });
  return workersAI("@cf/zai-org/glm-4.7-flash");
}
```
- Cloudflare Workers AI 원격 바인딩(`this.env.AI`)을 기반으로 `workers-ai-provider`를 초기화합니다.
- **선정 모델**: `@cf/zai-org/glm-4.7-flash`
  - Workers Free 플랜에서 추가 요금 및 제한 없이 즉시 사용 가능.
  - 고품질의 도구 호출(Tool Calling/Function Calling) 및 한글/영어 추론 지원.

### 4.4 `getTools()` 함수
```typescript
getTools() {
  return {
    getWeather: tool({
      description: "Get weather",
      inputSchema: z.object({
        city: z.string().meta({ description: "Name fo the city." }),
      }),
      execute: ({ city }) => `${city}의 날씨는 맑고 화창합니다.`,
    }),
    ...(this.extensionManager
      ? createExtensionTools({ manager: this.extensionManager })
      : {}),
  };
}
```
- **기본 도구 (`getWeather`)**: 도시명을 받아 날씨를 안내하는 데모 도구.
- **확장 관리 도구 (`createExtensionTools`)**:
  - `this.extensionManager`가 초기화되어 있는 경우 `load_extension`, `list_extensions` 도구를 AI 모델에 노출합니다.
  - 모델이 필요 시 자바스크립트 코드를 직접 생성하여 새로운 도구를 런타임에 장착할 수 있습니다.

### 4.5 `@callable()` 데코레이터와 클라이언트 RPC 메커니즘

```typescript
@callable()
async readWorkspaceFile(path: string) {
  return await this.workspace.readFile(path);
}
```

#### 1) `@callable()` 데코레이터의 개념 및 정의
- **Cloudflare Agents SDK (`agents`)**에서 제공하는 메서드 데코레이터입니다.
- **Durable Object(ThinkAgent)의 특정 메서드를 클라이언트(웹 브라우저 등)에서 원격 프로시저 호출(RPC: Remote Procedure Call)할 수 있는 공개 엔드포인트로 노출**시키는 역할을 합니다.

#### 2) 왜 필요한가? (보안 및 접근 제어 화이트리스트)
- `ThinkAgent` 클래스 내부에는 `onStart()`, `onChatResponse()`, `refreshFiles()`, `getModel()`, `getTools()` 등 서버 내부 동작과 AI 추론을 제어하는 다양한 내부 메서드가 존재합니다.
- 만약 클래스의 모든 메서드가 외부에 무조건 노출된다면, 악의적인 클라이언트가 내부 상태나 초기화 로직을 임의로 실행할 수 있는 심각한 보안 취약점이 발생합니다.
- `@callable()`을 붙인 메서드만 **"이 메서드는 클라이언트에서 원격 호출을 허용한다"**는 명시적 화이트리스트(Whitelist)로 등록되어 안전한 접근 제어가 이루어집니다.

#### 3) 동작 방식 (RPC: Remote Procedure Call)
별도의 REST API 라우트(예: `POST /api/files/read`)나 `fetch` 요청/응답 파싱 코드 없이, **마치 로컬 비동기 함수를 호출하듯** 서버 메서드를 실행합니다.

1. **서버 측 선언 ([worker/index.ts](file:///d:/dev/cloudflare/cloudflare-homework/my13-thinkframe/worker/index.ts#L64-L67))**:
   ```typescript
   @callable()
   async readWorkspaceFile(path: string) {
     return await this.workspace.readFile(path);
   }
   ```
2. **클라이언트 측 호출 ([src/App.tsx](file:///d:/dev/cloudflare/cloudflare-homework/my13-thinkframe/src/App.tsx#L35-L37))**:
   ```typescript
   // useAgent 훅을 통해 연결된 stub 객체 사용
   const stub = agent.stub as AgentStub;
   const content = await stub.readWorkspaceFile(path);
   ```
3. **내부 통신 흐름**:
   - 클라이언트에서 `stub.readWorkspaceFile(path)`를 실행하면, Agents SDK가 인자(`path`)를 JSON 직렬화하여 현재 연결된 WebSocket(또는 HTTP POST) 메시지로 서버에 전송합니다.
   - 서버의 Durable Object 인스턴스가 요청을 받아 해당 메서드를 실행하고, 결과값(`string | null`)을 다시 클라이언트로 반환하여 `await` 프라미스를 해결합니다.

#### 4) 주요 이점
- **보일러플레이트 제거**: 엔드포인트 URL 라우팅, HTTP 헤더, 직렬화/역직렬화, 에러 처리 보일러플레이트 코드 불필요.
- **타입 안전성(Type Safety)**: TypeScript 인터페이스(`AgentStub`)를 통해 메서드 이름, 매개변수 타입, 반환값 타입을 컴파일 타임에 완벽히 검증 가능.
- **단일 소켓 채널 활용**: 이미 연결된 실시간 WebSocket 채널을 재활용하므로 추가적인 HTTP 핸드셰이크 오버헤드가 없음.


### 4.6 `configureSession()` 세션 체이닝
```typescript
configureSession(session: Session) {
  return session
    .withContext("soul", {
      provider: {
        async get() {
          return `당신은 매우 유용하고 지적이면서도, 살짝 유쾌하고 위트 있는 풍자 감각을 지닌 AI 어시스턴트입니다.
[필수 규칙]
1. 모든 답변은 반드시 자연스럽고 유창한 한국어(Korean)로 작성하세요.
2. 사용자가 영어 등 다른 언어로 질문하더라도, 번역을 명시적으로 요구받지 않는 한 한국어로 친절하게 답변하세요.`;
        },
      },
    })
    .withContext("memory", {
      description: "Things to remember about the user across convos.",
      maxTokens: 10_000,
    })
    .withContext("skills", {
      description: "Reference documents on demand.",
      provider: new R2SkillProvider(this.env.SKILLS, { prefix: "skills/" }),
    });
}
```
- `soul`: 에이전트의 성격과 말투를 지정하는 컨텍스트 주입. 기본적으로 유쾌한 위트를 유지하면서 **모든 응답을 한국어로 작성하도록 필수 규칙을 강제**합니다.
- `memory`: 대화가 거듭되어도 사용자에 대해 기억할 수 있는 메모리 슬롯.
- `skills`: `R2SkillProvider`를 통해 Cloudflare R2 버킷(`nomadclaw-skills`) 내 `skills/` 접두어를 가진 문서들을 모델이 필요할 때 참조 문서로 탐색하도록 지원.

### 4.7 엔드포인트 핸들러 (`fetch`) 및 자동 디스패치 메커니즘

```typescript
export default {
  async fetch(request, env) {
    return (
      (await routeAgentRequest(request, env)) ??
      new Response("Not found", { status: 404 })
    );
  },
} satisfies ExportedHandler<Env>;
```

#### 1) 전체 자동 디스패치 흐름 요약

```
[클라이언트 요청]
  GET /agents/think-agent/default (WebSocket Upgrade 또는 HTTP RPC)
            │
            ▼
[Worker fetch 핸들러]
  routeAgentRequest(request, env)
            │
            ├─① URL 경로 파싱: 에이전트명("think-agent"), 방이름("default") 추출
            ├─② env 바인딩 탐색: env.ThinkAgent (Durable Object 네임스페이스) 매핑
            ├─③ 인스턴스 ID 조회: env.ThinkAgent.idFromName("default")
            ▼
[ThinkAgent Durable Object 싱글톤 인스턴스]
  stub.fetch(request) 호출 ──► 웹소켓 연결 수립, 상태 동기화 및 RPC 실행!
```

#### 2) 세부 디스패치 동작 단계

1. **클라이언트가 보내는 표준 URL 규격 (`/agents/...`)**:
   - 프론트엔드(`src/App.tsx`)에서 `useAgent({ agent: "ThinkAgent" })`를 호출하면 내부적으로 다음 규격의 URL로 WebSocket/HTTP 연결을 시도합니다:
     ```http
     ws://localhost:5173/agents/think-agent/default
     ```
   - 접두사: `/agents/`
   - 에이전트 식별자: `think-agent` (클래스명 `ThinkAgent`를 kebab-case로 자동 변환)
   - 인스턴스(룸) 식별자: 별도 지정이 없으면 기본값인 `default`

2. **`env` 환경 바인딩 자동 매핑**:
   - `wrangler.jsonc`에 선언된 바인딩 정보:
     ```jsonc
     "durable_objects": {
       "bindings": [{ "class_name": "ThinkAgent", "name": "ThinkAgent" }]
     }
     ```
   - Cloudflare Workers 런타임이 기동되면 `env.ThinkAgent`라는 Durable Object 네임스페이스 바인딩이 주입됩니다.
   - `routeAgentRequest`는 `env` 객체를 스캔하여 URL에서 추출한 `think-agent`와 일치하는 바인딩(`env.ThinkAgent`)을 자동으로 매핑합니다.

3. **고유 인스턴스 ID 조회 및 요청 포워딩 (`idFromName`)**:
   - Cloudflare Durable Object는 고유 이름마다 전 세계에 단 하나만 존재하는 싱글톤 인스턴스를 보장합니다.
   - `routeAgentRequest`는 내부적으로 다음과 같이 인스턴스를 획득하고 요청을 넘겨줍니다:
     ```typescript
     // 1. 방 이름("default")으로 고유 DO ID 생성/조회
     const id = env.ThinkAgent.idFromName("default");

     // 2. 해당 ID를 가진 ThinkAgent 인스턴스의 원격 핸들러(Stub) 획득
     const agentStub = env.ThinkAgent.get(id);

     // 3. 클라이언트 요청(WebSocket Upgrade 등)을 해당 인스턴스로 그대로 포워딩
     return await agentStub.fetch(request);
     ```

4. **미매칭 요청 처리 (404 Fallback)**:
   - 들어온 요청 URL이 `/agents/...` 패턴이 아니거나 해당하는 에이전트 바인딩이 없는 경우 `routeAgentRequest`는 `null`을 반환합니다.
   - 그 결과 `?? new Response("Not found", { status: 404 })`에 의해 안전하게 404 에러 응답을 반환합니다.


---

## 5. 프론트엔드 구현 상세 (`src/App.tsx`)

### 5.1 에이전트 연결 및 상태 동기화
```typescript
const [agentState, setAgentState] = useState<AgentState>({ files: [] });

const agent = useAgent<AgentState>({
  agent: "ThinkAgent",
  onStateUpdate: setAgentState,
});
```
- `useAgent<AgentState>`: WebSocket을 통해 Workers의 `ThinkAgent`와 상시 연결을 유지하고, `onStateUpdate` 콜백을 통해 워크스페이스 파일 목록 변경 사항을 실시간 반영합니다.

### 5.2 대화 및 도구 승인 제어 (`useAgentChat`)
```typescript
const {
  messages,
  sendMessage,
  clearHistory,
  status,
  stop,
  addToolApprovalResponse,
} = useAgentChat({ agent });
```
- `sendMessage`: 사용자 텍스트 전송.
- `clearHistory`: 대화 기록 초기화.
- `stop`: AI 생성 스트리밍 중단.
- `addToolApprovalResponse`: Human-in-the-loop 도구 승인 응답 (`approved: true | false`).

### 5.3 내부 리즈닝/사고 과정 필터링 (`renderMessage`)
AI SDK의 `UIMessage` 파트 중 내부 생각(`reasoning`)이나 `<think>` 태그를 화면에 노출하지 않도록 구현되었습니다.

```typescript
function renderMessage(msg: UIMessage) {
  return msg.parts.map((part, i) => {
    // 1. 내부 사고/추론 과정은 화면에 표시하지 않음
    if (part.type === "reasoning") {
      return null;
    }

    // 2. 텍스트 스트림 내 혼잣말 태그 (<think>...</think>) 정제
    if (part.type === "text") {
      const cleaned = part.text
        .replace(/<think>[\s\S]*?<\/think>/g, "")
        .replace(/<\/?think>/g, "")
        .trim();
      if (!cleaned) return null;
      return (
        <p key={i} className="whitespace-pre-wrap leading-relaxed">
          {cleaned}
        </p>
      );
    }

    // 3. 도구 실행 및 승인 인터페이스 렌더링
    if (isToolUIPart(part)) {
      ...
    }
    return null;
  });
}
```
또한, 메시지 목록 렌더링 시 사고 과정만 생성 중인 단계에서 빈 말풍선이 깜빡이지 않도록 유효 컨텐츠가 있는 경우에만 메시지 박스를 렌더링합니다:
```typescript
{messages.map((message) => {
  const isUser = message.role === "user";
  const rendered = renderMessage(message);
  const hasContent = rendered.some(
    (part) => part !== null && part !== undefined
  );
  if (!hasContent && !isUser) return null;

  return (
    <div key={message.id} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div className={...}>{rendered}</div>
    </div>
  );
})}
```

### 5.4 워크스페이스 파일 탐색기 & 뷰어
```typescript
const handleFileClick = async (path: string) => {
  setLoadingFile(true);
  setOpenFile({ path, content: null });
  const stub = agent.stub as AgentStub;
  const content = await stub.readWorkspaceFile(path);
  setOpenFile({ path, content });
  setLoadingFile(false);
};
```
- 워크스페이스 목록에 노출된 파일을 클릭하면 `agent.stub.readWorkspaceFile(path)` RPC를 호출하여 파일 본문을 뷰어 모달에 렌더링합니다.

---

## 6. 인프라 및 환경 설정

### 6.1 `wrangler.jsonc` 설정
```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "think-framework",
  "main": "worker/index.ts",
  "compatibility_date": "2026-05-18",
  "assets": {
    "not_found_handling": "single-page-application"
  },
  "observability": {
    "enabled": true
  },
  "upload_source_maps": true,
  "compatibility_flags": ["nodejs_compat"],
  "ai": {
    "binding": "AI",
    "remote": true
  },
  "durable_objects": {
    "bindings": [
      {
        "class_name": "ThinkAgent",
        "name": "ThinkAgent"
      }
    ]
  },
  "migrations": [
    {
      "tag": "1",
      "new_sqlite_classes": ["ThinkAgent"]
    }
  ],
  "r2_buckets": [
    { "binding": "SKILLS", "bucket_name": "nomadclaw-skills", "remote": true }
  ],
  "worker_loaders": [{ "binding": "LOADER" }]
}
```
- `compatibility_flags`: `["nodejs_compat"]` 적용으로 Node.js 표준 모듈 호환.
- `ai.remote = true`: 로컬 개발 시 원격 Workers AI 리소스에 안전하게 바인딩.
- `durable_objects` & `migrations`: SQLite 기반 내장 저장소를 가진 `ThinkAgent` 클래스 등록.
- `r2_buckets`: `nomadclaw-skills` R2 버킷 원격 바인딩.
- `worker_loaders`: 동적 코드 확장을 위한 `LOADER` 바인딩.

### 6.2 `package.json` 스크립트
```json
"scripts": {
  "dev": "cross-env NODE_TLS_REJECT_UNAUTHORIZED=0 vite",
  "build": "tsc -b && vite build",
  "lint": "eslint .",
  "preview": "npm run build && vite preview",
  "deploy": "npm run build && wrangler deploy",
  "cf-typegen": "wrangler types"
}
```
- `cross-env NODE_TLS_REJECT_UNAUTHORIZED=0`: Windows 환경 및 개발망 프록시 환경에서 Cloudflare 원격 API 연결 시 발생하는 자체 서명 인증서 오류를 방지.

---

## 7. 사용 방법 및 가이드 (Usage Guide)

### 7.1 로컬 개발 서버 실행
```bash
# 1. 의존성 패키지 설치
npm install

# 2. 로컬 개발 서버 기동
npm run dev
```
- 브라우저에서 `http://localhost:5173/` 접속.
- 원격 바인딩(Workers AI, R2 버킷)이 Cloudflare 계정과 자동으로 프록시 연결됩니다.

### 7.2 대화 및 페르소나 테스트
- 입력창에 질문을 입력하고 `Send`를 누릅니다.
- `soul` 컨텍스트에 정의된 *"You are very helpful but a bit sarcastic"* 페르소나에 맞추어 풍자적이고 유쾌한 어조의 답변이 실시간 스트리밍됩니다.
- 내부 추론 과정(Reasoning)은 숨겨지며 최종 대화만 출력됩니다.

### 7.3 도구 호출 테스트
- **날씨 도구 테스트**: *"서울 날씨 어때?"* 라고 질문하면 `getWeather` 도구를 호출하고 그 결과를 바탕으로 답변합니다.

---

## 8. 트러블슈팅 내역 (Troubleshooting History)

| 번호 | 이슈 현상 | 근본 원인 | 해결 방법 |
| :---: | :--- | :--- | :--- |
| **1** | `error TS2344: Type 'unknown' does not satisfy the constraint '{ readonly state: AgentState; }'` in `src/App.tsx` | `useAgent` 훅에 2개의 제네릭 타입 파라미터(`useAgent<unknown, AgentState>`)를 전달했으나, 첫 번째 인자는 `{ state: State }` 제약을 만족하는 클래스여야 함 | 단일 타입 파라미터 `useAgent<AgentState>`로 수정하여 `UseAgentOptions<State>` 오버로드와 일치시킴 |
| **2** | `error TS2322: Type 'ExtensionManager \| undefined' is not assignable to type 'ExtensionManager'` in `worker/index.ts` | `Think` 클래스에서 `extensionManager`가 `undefined`일 수 있어 strict null check 시 타입 불일치 발생 | `this.extensionManager ? createExtensionTools({ manager: this.extensionManager }) : {}` 방어적 삼항 연산자로 안전하게 전개 |
| **3** | `R2 bucket 'nomadclaw-skills' not found. Verify the bucket exists in your account [code: 10085]` | `wrangler.jsonc`에 원격 바인딩으로 설정된 `nomadclaw-skills` 버킷이 사용자 Cloudflare 계정에 존재하지 않아 dev preview 세션 연결 실패 | `npx wrangler r2 bucket create nomadclaw-skills` 명령어로 사용자 계정에 동일한 이름의 R2 버킷 생성 완료 |
| **4** | `InferenceUpstreamError [AiError]: 5035: Model @cf/moonshotai/kimi-k2.6 is not available on the Workers Free plan` | 원본 코드에 하드코딩된 Moonshot Kimi 모델은 **Workers Paid Plan 전용**으로, 무료 플랜 계정에서 추론 API 권한 없음 | Workers Free 플랜에서 완벽 지원되고 Tool Calling 성능이 우수한 `@cf/zai-org/glm-4.7-flash` 모델로 교체 |
| **5** | AI 모델의 내부 혼잣말 / 사고 과정(Reasoning)이 채팅창에 그대로 노출되는 현상 | AI SDK에서 reasoning 파트를 `<p className="text-xs italic text-zinc-500">{part.text}</p>`로 렌더링하고 있었음 | `renderMessage`에서 `part.type === 'reasoning'`을 숨김(`return null`) 처리하고, 텍스트 내 `<think>` 태그 정제 로직 및 빈 말풍선 렌더링 방지 로직 적용 |
| **6** | Windows 환경에서 Vite dev 실행 시 TLS / SSL 경고 및 인증서 체인 오류 발생 가능성 | Windows 환경에서 원격 Cloudflare 프록시 연결 시 Node.js의 기본 TLS 검증 이슈 발생 | `cross-env` 의존성을 추가하고 `dev` 스크립트를 `cross-env NODE_TLS_REJECT_UNAUTHORIZED=0 vite`로 수정하여 플랫폼 간 안정성 확보 |
