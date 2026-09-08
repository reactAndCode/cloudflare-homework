# Cloudflare Durable Objects 및 Vectorize 기반 PDF RAG 시스템 구축 및 개발 환경 정비 계획

`my10-ragagents-vec` 프로젝트에서 PDF를 업로드하여 마크다운으로 변환하고, 이를 임베딩하여 Cloudflare Vectorize에 저장한 후 RAG(검색 증강 생성) 기반 AI 채팅을 수행할 수 있도록 시스템을 완성하고 `npm run dev` 구동 환경을 조정합니다.

## User Review Required

> [!IMPORTANT]
> **Vectorize 인덱스 생성 필요**  
> Cloudflare 계정 확인 결과 `claw-rag-index` Vectorize 인덱스가 아직 생성되어 있지 않습니다.  
> 패키지 설정과 함께 `npx wrangler vectorize create claw-rag-index --preset=@cf/baai/bge-base-en-v1.5` 명령을 실행하여 원격 인덱스를 생성해야 합니다.

> [!NOTE]
> **패키지 버전 불일치 수정 (`agents`)**  
> 현재 `package.json`의 `"agents": "^0.12.4"`가 `@cloudflare/ai-chat`(`^0.7.0`)과 호환되지 않아 Vite 구동 시 `createChatFiberSnapshot` 누락 오류가 발생합니다. 이를 `"agents": "^0.22.0"`으로 업데이트합니다.

---

## Proposed Changes

### 1. 패키지 의존성 및 설정 (`package.json`)

#### [MODIFY] [package.json](file:///d:/dev/cloudflare/cloudflare-homework/my10-ragagents-vec/package.json)
- `"agents"` 버전을 `^0.12.4`에서 `^0.22.0`으로 업데이트하여 `@cloudflare/ai-chat` 빌드 호환성 확보
- 모던하고 깔끔한 UI를 위해 `lucide-react` 의존성 추가
- `npm install` 실행

---

### 2. Cloudflare 인프라 리소스 구성

- `npx wrangler vectorize create claw-rag-index --preset=@cf/baai/bge-base-en-v1.5` 실행하여 벡터 검색 인덱스 생성
- `npm run cf-typegen` 재실행하여 최신 타입 정의 동기화

---

### 3. 백엔드 Worker 및 Agent 구현 (`worker/index.ts`)

#### [MODIFY] [worker/index.ts](file:///d:/dev/cloudflare/cloudflare-homework/my10-ragagents-vec/worker/index.ts)
- **Worker Fetch 핸들러 추가 (`export default`)**:
  - `/api/upload` 엔드포인트: PDF multipart 업로드를 수신하여 R2(`env.FILES`)에 저장하고 Durable Object(`RAGAgent`)의 `ingestPdf`를 트리거하여 인덱싱 수행
  - `/api/documents` 등 문서 상태/목록 확인 엔드포인트 지원
  - `routeAgentRequest(request, env)` 연동으로 Agent WebSocket/HTTP 통신 처리
- **`RAGAgent` 기능 완성**:
  - `convert(fileName, buffer, fileType)`: `env.AI.toMarkdown`으로 PDF 문서를 마크다운으로 자동 변환
  - `chunkMarkdown(markdown)`: 마크다운 텍스트를 의미 있는 단위(단락, 제목 기준)로 슬라이싱 및 청킹
  - `embedChunks(chunks)`: Workers AI `@cf/baai/bge-base-en-v1.5` 임베딩 모델로 벡터 생성
  - `ingestPdf(...)`: 변환 -> 청킹 -> 임베딩 -> `env.VECTORIZE.upsert`로 벡터 및 원본 텍스트 메타데이터 저장
  - `onChatMessage(...)`: 사용자가 질문을 전송하면,
    1. 질문 텍스트를 임베딩
    2. `env.VECTORIZE.query`로 상위 관련 청크 검색
    3. 검색된 문서 컨텍스트를 프롬프트에 주입하여 LLM(`@cf/meta/llama-3.1-8b-instruct` 또는 `@cf/qwen/qwen3.8-27b`)으로 답변 스트리밍

---

### 4. 프론트엔드 UI 개선 (`src/App.tsx`, `src/index.css`)

#### [MODIFY] [src/App.tsx](file:///d:/dev/cloudflare/cloudflare-homework/my10-ragagents-vec/src/App.tsx)
- PDF 파일 업로드 상태(업로드 중, 마크다운 변환 중, 벡터라이즈 완료, 에러 등)를 시각적으로 명확하게 표시
- 업로드된 문서 목록 및 인덱싱 상태 배지 표시
- RAG 검색 컨텍스트 기반 답변 시 출처(인용) 확인 기능
- 깔끔하고 미려한 디자인(다크/모던 톤, 부드러운 트랜지션, 반응형 헤더/사이드 패널) 적용

---

## Verification Plan

### Automated Tests / Builds
- `npm run build`: TypeScript 타입 체크 및 Vite 빌드 성공 검증 (`tsc -b && vite build`)
- `npm run dev`: 개발 서버 정상 실행 및 workerd 원격 바인딩 연결 검증

### Manual Verification
- 브라우저 서브에이전트 또는 로컬 테스트를 통해:
  1. Vite 개발 서버(`http://localhost:5173`) 접속 확인
  2. PDF 파일 업로드 시 `/api/upload`를 통한 마크다운 변환 및 Vectorize 저장 정상 작동 확인
  3. 채팅창에 문서 내용에 대한 질문 입력 시 RAG 검색 기반 스트리밍 답변 동작 확인
