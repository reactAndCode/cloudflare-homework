# 05. Cloudflare Durable Objects + Vectorize 기반 PDF RAG 개발 상세 내역서 (Dev Spec)

## 1. 개요 (Overview)

본 문서는 `my10-ragagents-vec` 프로젝트의 시스템 아키텍처, Cloudflare 인프라 바인딩 구성, 백엔드/프론트엔드 함수별 상세 명세, SQLite-Vectorize 연계 구조, 테스트 시나리오 및 트러블슈팅 내역을 상세히 기록한 개발 내역서입니다.

이 시스템은 사용자가 업로드한 PDF 문서를 Cloudflare Workers AI의 `toMarkdown` 서비스를 통해 마크다운으로 자동 변환하고, 이를 최적의 청크로 분할하여 **Durable Object 내장 SQLite (`chunks` 테이블)**에 원본 텍스트를 저장함과 동시에 동일한 고유 ID(UUID)로 **Cloudflare Vectorize**에 벡터 임베딩을 인덱싱합니다. 

이후 사용자가 자연어로 질문하면:
1. 질문 텍스트를 임베딩하여 Vectorize에서 유사도 검색(Top-4)을 수행하고,
2. 반환된 벡터 ID를 통해 **SQLite에서 원본 청크 텍스트를 직접 Recall(역조회)**합니다.
3. Recall된 문서 컨텍스트를 주입하여 LLM이 근거 기반의 정확한 답변을 스트리밍하며,
4. 답변 완료 시 질문과 최종 답변, 그리고 참조된 청크 ID 목록을 **SQLite `qa_history` 테이블**에 영구 저장하여 향후 분석 및 재검색(Recall)에 활용할 수 있도록 구현되었습니다.

---

## 2. 시스템 아키텍처 및 RAG 파이프라인

```mermaid
flowchart TD
    subgraph Client["React Frontend (App.tsx)"]
        UI["UI / PDF Uploader & Chat"]
        UAC["useAgentChat & useAgent Hook"]
    end

    subgraph Worker["Cloudflare Worker (worker/index.ts)"]
        FetchRouter["Worker Fetch Handler\n(/api/upload, /api/documents, /api/chunks, /api/qa-history)"]
        DO["RAGAgent (Durable Object)"]
    end

    subgraph CF_Infra["Cloudflare Cloud Infrastructure"]
        R2[("R2 Bucket (FILES)\nrag-agents-bucket")]
        AI_MD["Workers AI: toMarkdown\n(Document Conversion)"]
        AI_EMBED["Workers AI: BGE-base-en-v1.5\n(Embedding Model)"]
        AI_LLM["Workers AI: Qwen3.8-27b\n(Chat LLM)"]
        VEC[("Vectorize Index (VECTORIZE)\nclaw-rag-index (768d, cosine)")]
        DO_SQLite[("DO SQLite Database\n- chunks table (id, source, text)\n- qa_history table (id, q, a, chunk_ids)")]
    end

    %% Upload Pipeline
    UI -->|1. POST /api/upload (PDF)| FetchRouter
    FetchRouter -->|2. 원본 PDF 보관| R2
    FetchRouter -->|3. ingestPdf() 호출| DO
    DO -->|4. toMarkdown() 변환| AI_MD
    AI_MD -->|Markdown 텍스트 반환| DO
    DO -->|5. chunkMarkdown() 청킹| DO
    DO -->|6. embedChunks() 임베딩| AI_EMBED
    AI_EMBED -->|768차원 벡터 배열| DO
    DO -->|7. INSERT INTO chunks (id, source, text)| DO_SQLite
    DO -->|8. upsert() 벡터 저장 (id, vector)| VEC
    FetchRouter -->|9. 성공 JSON 응답| UI

    %% Chat RAG Pipeline
    UAC <-->|WebSocket / HTTP SSE| DO
    DO -->|1. 질문 임베딩 생성| AI_EMBED
    DO -->|2. query() 유사 벡터 ID 검색| VEC
    VEC -->|3. 매칭된 vector id 목록 반환| DO
    DO -->|4. SELECT * FROM chunks WHERE id = match.id (Recall!)| DO_SQLite
    DO_SQLite -->|5. 원본 청크 텍스트 반환| DO
    DO -->|6. 컨텍스트 주입 + streamText| AI_LLM
    AI_LLM -->|7. 실시간 스트리밍 토큰 반환| UAC
    DO -->|8. onFinish: Q&A 및 chunk_ids 기록| DO_SQLite
```

---

## 3. 기술 스택 및 의존성 라이브러리

| 분류 | 기술 / 라이브러리 | 버전 | 주요 역할 및 특징 |
|---|---|---|---|
| **Runtime** | Cloudflare Workers & Durable Objects | `workerd` 1.20260907 | 엣지 서버리스 런타임 및 상태 유지형 분산 객체 (내장 SQLite 제공) |
| **Vite Plugin** | `@cloudflare/vite-plugin` | `^1.37.1` | Vite 개발 서버와 Cloudflare 원격 리소스 자동 연동 |
| **Agent SDK** | `agents` | `^0.22.0` | Cloudflare 공식 Durable Objects Agent 프레임워크 (`this.sql` 태그 템플릿 지원) |
| **Chat SDK** | `@cloudflare/ai-chat` | `^0.7.0` | Agent 기반 실시간 대화 및 UI 스트리밍 어댑터 |
| **AI SDK** | `ai` (Vercel AI SDK) | `^6.0.182` | `streamText`, `embed`, `embedMany` 등 표준 AI 파이프라인 |
| **AI Provider** | `workers-ai-provider` | `^3.1.14` | Cloudflare Workers AI 바인딩을 AI SDK 모델로 연결 |
| **Babel Plugin** | `@babel/plugin-proposal-decorators` | `^8.0.2` | `agents/vite` 플러그인의 DO 데코레이터 빌드 트랜스파일러 |
| **Database** | Durable Objects SQLite | 내장 | 원본 청크(`chunks`) 및 질문/답변 이력(`qa_history`) 저장 |
| **Vector DB** | Cloudflare Vectorize | 768d / cosine | `@cf/baai/bge-base-en-v1.5` 임베딩 벡터 인덱싱 및 유사도 검색 |
| **Storage** | Cloudflare R2 | S3 호환 | 업로드된 원본 PDF 파일 아카이빙 |
| **Frontend** | React, TypeScript, Vite | `19.2.5` / `6.0.2` / `8.2.2` | 고성능 SPA 클라이언트 |
| **Styling** | TailwindCSS v4 | `^4.3.0` | `@tailwindcss/vite` 기반 모던 다크 테마 디자인 |
| **Icons** | `lucide-react` | `^1.16.0` | 대시보드 및 업로드/채팅 시각 피드백 아이콘 |

---

## 4. SQLite 테이블 스키마 및 Vectorize 연계 사양

Durable Object 초기화(`onStart()`) 시 내장 SQLite 데이터베이스에 두 개의 핵심 테이블이 자동 생성됩니다.

### 4.1. `chunks` 테이블 (청크 원본 데이터)
벡터 임베딩된 각 청크의 원본 텍스트를 보관하며, Vectorize의 `id`와 1:1로 매핑됩니다.

```sql
CREATE TABLE IF NOT EXISTS chunks (
  id TEXT PRIMARY KEY,      -- UUID (Vectorize vector id와 동일)
  source TEXT NOT NULL,     -- 파일명 (예: sample.pdf)
  text TEXT NOT NULL,       -- 청크 원본 텍스트 내용
  created_at INTEGER        -- 생성 타임스탬프 (Unix epoch ms)
);
```

### 4.2. `qa_history` 테이블 (질문/답변 및 참조 청크 Recall 기록)
사용자의 질문, AI의 답변, 그리고 답변 생성 시 근거로 사용된 청크 ID 목록을 보관합니다.

```sql
CREATE TABLE IF NOT EXISTS qa_history (
  id TEXT PRIMARY KEY,       -- Q&A 고유 ID (예: qa_1741400000000_abc12345)
  question TEXT NOT NULL,    -- 사용자 질문 텍스트
  answer TEXT NOT NULL,      -- AI 모델이 생성한 최종 답변
  chunk_ids TEXT,            -- 참조된 청크 UUID 배열 (JSON 문자열: ["uuid-1", "uuid-2"])
  created_at TEXT NOT NULL   -- ISO 8601 일시
);
```

### 4.3. Vectorize와 SQLite 간의 ID 연계 메커니즘
1. **임베딩 생성 시**: 청크마다 `const id = crypto.randomUUID()`를 생성
2. **SQLite 저장**: `INSERT INTO chunks (id, source, text) VALUES (${id}, ${fileName}, ${chunk})`
3. **Vectorize 저장**: `{ id, values: embeddings[index], metadata: { source: fileName } }`
   - *이점: Vectorize 메타데이터의 10KiB 크기 제한을 우회하고, 긴 텍스트 원본은 Durable Object의 초고속 로컬 SQLite에 안전하게 격리 보관*
4. **검색 및 Recall 시**: Vectorize가 반환한 `match.id`를 조건으로 `SELECT id, source, text FROM chunks WHERE id = ${match.id}` 실행하여 원본 청크 텍스트를 정확하게 복원

---

## 5. 소스 코드 함수별 상세 설명 (Source Code Analysis)

### 5.1. 백엔드 Worker 및 Agent (`worker/index.ts`)

#### [인터페이스] `DocumentInfo`, `ChunkRecord`, `QaRecord`
```typescript
export interface DocumentInfo {
  id: string;          // 문서 ID
  name: string;        // 파일명
  chunksCount: number; // 청크 개수
  uploadedAt: string;  // 업로드 일시
}

export interface ChunkRecord {
  id: string;          // 청크 UUID
  source: string;      // 출처 파일명
  text: string;        // 원본 텍스트
  created_at?: number; // 생성 일시
}

export interface QaRecord {
  id: string;          // Q&A 로그 ID
  question: string;    // 질문 내용
  answer: string;      // 답변 내용
  chunk_ids: string;   // 참조된 청크 ID JSON 배열
  created_at: string;  // 생성 일시
}
```

#### [클래스] `RAGAgent extends AIChatAgent<Env>`

---

#### 1. `onStart()`
- **역할**: Durable Object가 인스턴스화되거나 활성화될 때 가장 먼저 실행되는 생명주기 훅입니다.
- **동작**:
  - `this.sql` 태그 템플릿을 사용하여 `chunks` 테이블과 `qa_history` 테이블이 없으면 자동 생성합니다.

---

#### 2. `convert(fileName: string, buffer: ArrayBuffer, fileType: string): Promise<string>`
- **역할**: 바이너리 형태의 PDF 문서를 Cloudflare Workers AI의 `toMarkdown` 엔진을 호출하여 마크다운 텍스트로 변환합니다.
- **동작**: `this.env.AI.toMarkdown({ name, blob })`을 호출하고 `result.format === "error"` 검증 후 텍스트를 반환합니다.

---

#### 3. `chunkMarkdown(markdown: string, maxChunkSize = 600, overlap = 100): string[]`
- **역할**: 마크다운 텍스트를 의미 단위(단락 `\n{2,}`, 문장 부호)로 분할하고 문맥 유지를 위해 오버랩을 적용하여 최적의 청크 배열로 나눕니다.

---

#### 4. `embedder()` / `embedChunks(chunks: string[]): Promise<number[][]>`
- **역할**: `@cf/baai/bge-base-en-v1.5` 텍스트 임베딩 모델 인스턴스를 반환하고, 청크 배열에 대해 일괄 임베딩(`embedMany`)을 생성합니다.
- **코드**:
  ```typescript
  embedder() {
    const workersAi = createWorkersAI({ binding: this.env.AI });
    return workersAi.textEmbeddingModel("@cf/baai/bge-base-en-v1.5");
  }
  ```

---

#### 5. `ingestPdf(buffer: ArrayBuffer, fileName: string, fileType: string)`
- **역할**: PDF 수신부터 변환, 청킹, 임베딩, SQLite 저장 및 Vectorize 인덱싱까지 수행하는 일괄 파이프라인 함수입니다.
- **핵심 연계 로직**:
  ```typescript
  const vectors = chunks.map((chunk, index) => {
    const id = crypto.randomUUID();

    // 1) SQLite chunks 테이블에 원본 텍스트 저장
    void this.sql`
      INSERT INTO chunks (id, source, text, created_at)
      VALUES (${id}, ${fileName}, ${chunk}, ${createdAt})
    `;

    // 2) 동일한 UUID로 Vectorize 벡터 객체 구성
    return {
      id,
      values: embeddings[index],
      metadata: { source: fileName, chunkIndex: index, totalChunks: chunks.length },
    };
  });

  // 3) Vectorize에 50개 단위 배치 upsert
  await this.env.VECTORIZE.upsert(batch);
  ```

---

#### 6. `getChunks(source?: string, limit = 50)` / `getQaHistory(limit = 20)`
- **역할**: SQLite에 영구 저장된 청크 목록 또는 과거 질문/답변 이력을 조회하는 RPC 메소드입니다.

---

#### 7. `onChatMessage(_onFinish, options)` & `recall` 도구
- **역할**: LLM 모델이 동적으로 검색 쿼리를 생성하여 **`recall` 도구**를 호출하고, Vectorize 검색 후 **SQLite 청크를 복원**하여 답변을 구성합니다.
- **`recall` 도구 명세**:
  ```typescript
  const tools = {
    recall: tool({
      description:
        "Search ingested documents for chunks relevant to a query. Call this before answering questions about previously-saved content.",
      inputSchema: z.object({
        query: z.string().meta({ description: "What to look up." }),
      }),
      execute: async ({ query }: { query: string }) => {
        const { embedding } = await embed({
          model: this.embedder(),
          value: query,
        });
        const { matches } = await this.env.VECTORIZE.query(embedding, {
          topK: 5,
        });
        return matches.map((match) => {
          const [result] = this
            .sql<ChunkRecord>`SELECT * FROM chunks WHERE id = ${match.id}`;
          return result;
        });
      },
    }),
  };
  ```

---

#### [Worker Fetch 라우터] `export default { async fetch(request, env) }`
- **`POST /api/upload`**: PDF 멀티파트 수신 ➜ R2 보관 ➜ DO 에이전트 `ingestPdf()` 실행
- **`GET /api/documents`**: 인덱싱된 문서 목록 조회
- **`GET /api/chunks`**: SQLite에 저장된 청크 목록 조회 (파라미터: `?source=파일명`)
- **`GET /api/qa-history`**: SQLite에 저장된 Q&A 이력 및 참조 청크 ID 목록 조회
- **기타 요청**: `routeAgentRequest(request, env)`를 통한 WebSocket 및 SSE 실시간 라우팅

---

## 6. 테스트 시나리오 및 검증 가이드 (Test Guide)

### 6.1. 개발 서버 실행
```bash
cd my10-ragagents-vec
npm run dev
```
- 브라우저에서 `http://localhost:5173`으로 접속합니다.

---

### 6.2. 기능별 테스트 시나리오

#### 시나리오 1: PDF 업로드 및 SQLite & Vectorize 동기화 확인
1. 브라우저에서 **[PDF 파일 선택]** 버튼을 눌러 문서를 업로드합니다.
2. 상태 바에 *"완료! 총 N개 청크로 분할되어 Vectorize에 인덱싱되었습니다."*가 표시되는지 확인합니다.
3. 브라우저 새 탭 또는 curl을 통해 SQLite에 청크가 들어갔는지 확인합니다:
   ```bash
   curl http://localhost:5173/api/chunks
   ```
   - 반환된 JSON의 `chunks` 배열에 `id` (UUID), `source`, `text`가 정상 포함되어 있는지 확인합니다.

#### 시나리오 2: 문서 기반 자연어 질의 및 SQLite 청크 Recall 확인
1. 채팅창에 업로드한 PDF 내용에 관한 질문을 입력합니다. (예: *"이 문서의 주요 목적은 무엇인가요?"*)
2. **확인 사항**:
   - AI가 응답을 스트리밍하며, 응답 내용에 문서 원본의 단락 내용이 정확하게 반영되는지 확인합니다.
   - 백엔드 콘솔 로그에 다음과 같은 로그가 찍히는지 확인합니다:
     ```
     [RAGAgent] Saved Q&A log to SQLite: qa_..., chunks: ["<UUID>"]
     ```

#### 시나리오 3: Q&A 이력 및 참조 청크 Recall 추적 확인
1. 브라우저 또는 터미널에서 Q&A 이력 API를 호출합니다:
   ```bash
   curl http://localhost:5173/api/qa-history
   ```
2. **확인 사항**:
   - `question`: 방금 입력한 질문
   - `answer`: AI 어시스턴트가 생성한 답변
   - `chunk_ids`: 해당 답변을 만들 때 Vectorize에서 검색되어 SQLite에서 Recall된 청크의 UUID 목록
   이 정상적으로 기록되어 있는지 확인합니다.

#### 시나리오 4: 할루시네이션(거짓 답변) 방지 테스트
1. 문서에 전혀 없는 질문(예: *"조선시대 세종대왕의 훈민정음 창제 연도는?"*)을 입력합니다.
2. AI가 지어내지 않고 *"제공해주신 문서에서 해당 내용을 찾을 수 없습니다"*라고 정직하게 응답하는지 확인합니다.

---

## 7. 주요 트러블슈팅 및 기술 노트 (Technical Notes)

### ① Vectorize 메타데이터 크기 한계 극복 (Hybrid SQLite Pattern)
- Cloudflare Vectorize는 각 벡터당 메타데이터 크기 제한(10KiB)이 존재합니다.
- 대용량 텍스트나 여러 단락을 메타데이터에 직접 넣으면 인덱싱 실패 위험이 있습니다.
- 따라서 **Vectorize에는 벡터와 출처 정보만 최소한으로 보관하고, 원본 텍스트 본문은 Durable Object의 초고속 로컬 SQLite `chunks` 테이블에 보관한 뒤 UUID로 Recall하는 하이브리드 패턴**을 적용하여 안정성과 성능을 극대화했습니다.

### ② 질문/답변 이력 영구 기록을 통한 피드백 루프 (QA History)
- `qa_history` 테이블에 질문과 답변, 그리고 답변 생성에 사용된 `chunk_ids`를 함께 보관함으로써, 향후 검색 정확도 평가, 사용자 피드백 반영, 또는 이전 대화 컨텍스트 재조회(Recall)에 유연하게 대응할 수 있도록 설계했습니다.
