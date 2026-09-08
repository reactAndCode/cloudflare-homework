# 나만의 세컨드브레인(Second Brain) RAG 에이전트 구축 계획서 (`my10-raghomework`)

`my10-ragagents-vec` 프로젝트를 기반으로, 웹 URL을 입력하면 Cloudflare 브라우저 렌더링 마크다운 API를 통해 본문을 800자 단위로 분할하여 Vectorize(벡터)와 Durable Objects SQLite(텍스트)에 ID로 연계 저장하고, `recall(question)` 및 `listSources()` 도구를 통해 출처 URL과 함께 근거 기반 답변을 제공하는 세컨드브레인 AI 에이전트를 구축합니다.

---

## User Review Required

> [!IMPORTANT]
> **신규 Vectorize 인덱스 생성 (`second-brain-index`)**  
> 세컨드 브레인 전용으로 768차원 코사인 메트릭 인덱스를 신규 생성합니다:  
> `npx wrangler vectorize create second-brain-index --preset=@cf/baai/bge-base-en-v1.5`

> [!NOTE]
> **Cloudflare Browser Rendering 마크다운 API 연동**  
> 사용자의 Cloudflare Account ID(`2575ea02a46b2ff95d7107bfd8319428`) 및 Worker의 `browser: { binding: "MYBROWSER" }` 바인딩을 통해 웹페이지의 자바스크립트 렌더링 후 마크다운 추출을 수행합니다. 필요 시 REST API 및 `Accept: text/markdown` 방식의 다중 폴백을 지원합니다.

---

## Proposed Changes

### 1. 프로젝트 디렉토리 생성 및 환경 설정 (`my10-raghomework`)

#### [NEW] [package.json](file:///d:/dev/cloudflare/cloudflare-homework/my10-raghomework/package.json)
- `agents` (`^0.22.0`), `@cloudflare/ai-chat` (`^0.7.0`), `ai` (`^6.0.182`), `workers-ai-provider`, `lucide-react`, `@babel/plugin-proposal-decorators` 등 필수 의존성 구성

#### [NEW] [wrangler.jsonc](file:///d:/dev/cloudflare/cloudflare-homework/my10-raghomework/wrangler.jsonc)
- `name`: `"second-brain-agent"`
- `ai`: `{ "binding": "AI", "remote": true }`
- `browser`: `{ "binding": "MYBROWSER" }`
- `vectorize`: `[{ "binding": "VECTORIZE", "index_name": "second-brain-index", "remote": true }]`
- `durable_objects`: `[{ "class_name": "SecondBrainAgent", "name": "SecondBrainAgent" }]`
- `migrations`: `[{ "tag": "1", "new_sqlite_classes": ["SecondBrainAgent"] }]`

---

### 2. 백엔드 Worker 및 SecondBrainAgent 구현 ([worker/index.ts](file:///d:/dev/cloudflare/cloudflare-homework/my10-raghomework/worker/index.ts))

#### [NEW] [worker/index.ts](file:///d:/dev/cloudflare/cloudflare-homework/my10-raghomework/worker/index.ts)
- **SQLite 테이블 정의 (`onStart`)**:
  - `chunks`: `(id TEXT PRIMARY KEY, url TEXT NOT NULL, title TEXT, text TEXT NOT NULL, created_at INTEGER)`
  - `sources`: `(url TEXT PRIMARY KEY, title TEXT, chunks_count INTEGER, created_at TEXT)`
  - `qa_history`: `(id TEXT PRIMARY KEY, question TEXT, answer TEXT, sources TEXT, created_at TEXT)`
- **URL 마크다운 변환 및 인제스트 (`ingestUrl(url)`)**:
  1. Cloudflare Browser Rendering API를 호출하여 URL을 마크다운으로 변환
  2. 단락 및 문맥을 고려하여 약 800자 단위로 청킹
  3. Workers AI `@cf/baai/bge-base-en-v1.5`로 청크 일괄 임베딩 (`embedMany`)
  4. 청크마다 `crypto.randomUUID()`를 생성하여:
     - SQLite `chunks` 테이블에 `(id, url, title, text, created_at)` 저장
     - Vectorize 인덱스에 동일한 `id`로 `{ id, values: embeddings[i], metadata: { url, title } }` upsert
  5. SQLite `sources` 테이블에 출처 URL, 제목, 청크 개수 등록
- **에이전트 도구 (ToolSet)**:
  - **`recall(question: string)`**:
    - 사용자의 질문을 임베딩
    - Vectorize `query({ topK: 5 })` 유사 벡터 검색
    - 검색된 `id`들로 `this.sql`에서 원본 텍스트 및 출처 URL을 SELECT하여 반환
  - **`listSources()`**:
    - `this.sql`의 `sources` 테이블을 조회하여 기억하고 있는 모든 웹페이지 URL, 제목, 저장 일시 목록 반환
- **시스템 프롬프트 및 대화 핸들러 (`onChatMessage`)**:
  - 모델: `@cf/qwen/qwen3.8-27b`
  - 도구 연동: `tools: { recall, listSources }`
  - 프롬프트 지침: "당신은 사용자의 지식을 기억하는 세컨드 브레인입니다. 질문에 답할 때 반드시 `recall` 도구로 지식을 검색하고, 조각 내용을 근거로 답변하되 항상 출처 URL을 밝히세요."
  - 채팅 메시지에 `http://` 또는 `https://` URL이 포함된 경우 자동으로 해당 웹페이지를 스크랩하여 브레인에 저장하고 안내
- **Worker Fetch 라우터**:
  - `POST /api/ingest-url`: URL 수신 ➜ 스크랩 ➜ 임베딩 ➜ Vectorize & SQLite 저장
  - `GET /api/sources`: 저장된 웹페이지 목록 조회
  - `GET /api/chunks`: 특정 URL 또는 전체 청크 조회
  - `routeAgentRequest(request, env)`: 에이전트 실시간 연결

---

### 3. 프론트엔드 UI 구현 ([src/App.tsx](file:///d:/dev/cloudflare/cloudflare-homework/my10-raghomework/src/App.tsx), [src/index.css](file:///d:/dev/cloudflare/cloudflare-homework/my10-raghomework/src/index.css))

#### [NEW] [src/App.tsx](file:///d:/dev/cloudflare/cloudflare-homework/my10-raghomework/src/App.tsx)
- **세컨드 브레인 전용 모던 UI**:
  - 상단 대시보드: 기억된 웹사이트 수, 총 청크 수, Vectorize 연결 상태
  - URL 빠른 수집 바: "새로운 지식 웹페이지 URL 추가" 입력 및 1클릭 브레인 저장
  - 지식 보관소(서랍 패널): 저장된 URL 목록 카드, 원본 웹사이트 링크 열기, 청크 개수 확인, SQLite 조각 뷰어
  - 대화 피드: 질문 입력 시 AI의 `recall` 도구 호출 과정(어떤 출처 URL을 검색했는지) 및 인용 출처 표시

---

## Verification Plan

### Automated Tests / Builds
- `npm run build`: `my10-raghomework` 프로젝트의 타입 검사 및 Vite 빌드 성공 검증
- `npx wrangler vectorize info second-brain-index`: 원격 인덱스 및 벡터 저장 상태 확인

### Manual Verification
- 브라우저 서브에이전트 및 API 호출을 통한 검증:
  1. `POST /api/ingest-url`로 공식 문서(예: `https://developers.cloudflare.com/vectorize/get-started/`) 전달 시 마크다운 변환 및 Vectorize/SQLite 저장 확인
  2. 채팅창에서 저장된 내용에 대해 질문 시 `recall` 도구가 호출되고 출처 URL과 함께 답변이 스트리밍되는지 확인
  3. `listSources()` 호출 및 UI 지식 보관소 목록 표시 확인
