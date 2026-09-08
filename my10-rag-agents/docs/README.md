# Cloudflare RAG Agent 문서 관리 및 AI 대화 시스템

Cloudflare Workers, Durable Objects, Cloudflare R2 버킷 및 Workers AI를 통합하여 PDF 등 문서를 업로드하고 Markdown으로 변환하여 열람 및 질의응답을 수행하는 풀스택 애플리케이션입니다.

---

## 1. 아키텍처 개요

1. **Frontend (React 19 + Vite + Tailwind CSS v4)**
   - 파일 업로드 존 (드래그 앤 드롭 및 파일 탐색기)
   - 변환된 마크다운 문서 뷰어 (Gfm 서식 렌더링 및 RAW 원본 뷰, 클립보드 복사 지원)
   - Cloudflare Agent WebSocket 기반 실시간 AI 채팅창 (`@cloudflare/ai-chat/react`, `useAgentChat`)

2. **Backend (Cloudflare Workers + ExportedHandler)**
   - `/api/upload`: 첨부파일을 받아 R2 버킷(`FILES`)에 원본 및 변환된 `.md` 파일 저장
   - `getAgentByName(env.RAGAgent, "default")`: RAGAgent Durable Object와 통신
   - `routeAgentRequest(request, env)`: Agent WebSocket 및 HTTP 라우팅 자동 처리

3. **Durable Objects (`RAGAgent extends AIChatAgent`)**
   - `ingestPdf`: Workers AI의 `this.env.AI.toMarkdown()` API를 통해 PDF 문서를 마크다운으로 실시간 변환
   - `saveMessages`: 변환된 마크다운을 대화 히스토리에 기록하여 사용자와 에이전트 모두에게 컨텍스트 제공
   - `onChatMessage`: `@cf/meta/llama-3.1-8b-instruct` 모델을 사용해 업로드된 문서 기반 한국어 스트리밍 답변 생성

4. **Storage (Cloudflare R2)**
   - 버킷명: `rag-agents-bucket`
   - 원본 PDF/문서 파일 및 변환된 `.md` 마크다운 파일 보관

---

## 2. 주요 구성 파일

- [`worker/index.ts`](file:///c:/work/mydev/cloudflare/my10-rag-agents/worker/index.ts): `RAGAgent` Durable Object 클래스 및 `/api/upload` Worker 핸들러
- [`src/App.tsx`](file:///c:/work/mydev/cloudflare/my10-rag-agents/src/App.tsx): 마크다운 뷰어와 RAG 챗봇 인터페이스 통합 UI
- [`wrangler.jsonc`](file:///c:/work/mydev/cloudflare/my10-rag-agents/wrangler.jsonc): R2 버킷, Durable Objects, AI 바인딩 및 마이그레이션 설정
- [`vite.config.ts`](file:///c:/work/mydev/cloudflare/my10-rag-agents/vite.config.ts): Cloudflare Vite 플러그인, Agents 플러그인, Tailwind CSS 플러그인 설정

---

## 3. 실행 및 빌드 명령어

### 개발 서버 실행
```bash
npm run dev
```
- 로컬 개발 서버가 `http://localhost:5173`에서 실행되며, Cloudflare 원격 리소스(AI, R2, DO)와 실시간으로 프록시 연동됩니다.

### 프로덕션 빌드
```bash
npm run build
```
- Worker와 React Client 번들을 동시에 빌드 및 타입 검사를 수행합니다.

### 배포
```bash
npm run deploy
```
- Cloudflare 계정으로 Worker 및 자산을 배포합니다.
