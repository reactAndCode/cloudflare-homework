# Cloudflare Durable Objects + Vectorize 기반 PDF RAG 프로젝트 워크스루

`my10-ragagents-vec` 프로젝트에서 PDF를 업로드하여 마크다운으로 변환하고, 이를 벡터 임베딩하여 Cloudflare Vectorize에 저장한 뒤 AI RAG 챗을 수행할 수 있도록 전체 시스템을 완성하고 `npm run dev` 환경을 성공적으로 정비했습니다.

---

## 1. 주요 해결 및 변경 사항

### ① 의존성 패키지 업그레이드 및 필수 라이브러리 설치
- **`agents` 버전 불일치 해결**: 기존 `"agents": "^0.12.4"`에서 `@cloudflare/ai-chat`이 요구하는 `createChatFiberSnapshot` 등의 export가 누락되어 빌드가 중단되던 문제를 `"agents": "^0.22.0"`으로 업데이트하여 해결했습니다.
- **Babel 플러그인 설치**: `agents/vite` 플러그인의 데코레이터 처리를 위해 `"@babel/plugin-proposal-decorators": "^8.0.2"`를 개발 의존성으로 추가했습니다.
- **UI 아이콘 라이브러리 설치**: 현대적인 인터페이스와 상태 표시를 위해 `lucide-react`를 추가했습니다.

### ② Cloudflare Vectorize 인덱스 생성
- Cloudflare 계정에 `wrangler.jsonc` 바인딩에 지정된 `claw-rag-index`가 미생성 상태였던 점을 파악하고, BGE 임베딩 모델 프리셋에 맞춰 원격 인덱스를 정상 생성했습니다:
  ```bash
  npx wrangler vectorize create claw-rag-index --preset=@cf/baai/bge-base-en-v1.5
  ```
  - **인덱스 사양**: 차원(Dimensions) 768 / 메트릭(Metric) cosine

### ③ 백엔드 Worker 및 RAG Durable Object 구현 (`worker/index.ts`)
- **PDF 마크다운 변환**: Cloudflare Workers AI의 `this.env.AI.toMarkdown()`을 활용하여 업로드된 PDF 바이너리를 마크다운 텍스트로 자동 추출합니다.
- **의미 단위 텍스트 청킹**: 마크다운 단락 및 문장 단위로 텍스트를 적정 크기(약 600자)로 분할하는 스마트 청킹 알고리즘을 적용했습니다.
- **벡터화 및 인덱싱**: Workers AI `@cf/baai/bge-base-en-v1.5` 임베딩 모델을 통해 벡터를 생성하고, `this.env.VECTORIZE.upsert()`를 통해 벡터 인덱스에 메타데이터(원본 텍스트, 파일명, 청크 번호 등)와 함께 저장합니다.
- **RAG 기반 AI 응답 (`onChatMessage`)**: 사용자가 채팅 질문을 입력하면 질문 텍스트를 임베딩하여 Vectorize에서 유사도가 높은 관련 문서 청크(Top 4)를 검색한 후, 컨텍스트를 주입하여 `@cf/meta/llama-3.1-8b-instruct` 모델로 실시간 스트리밍 답변을 생성합니다.
- **Worker Fetch 라우터**:
  - `POST /api/upload`: PDF 수신 -> R2(`env.FILES`) 원본 보관 -> Durable Object 인덱싱 트리거
  - `GET /api/documents`: 인덱싱된 문서 목록 조회
  - `routeAgentRequest(request, env)`: Durable Object 에이전트 웹소켓/HTTP 연결 보장

### ④ 세련된 프론트엔드 UI 구축 (`src/App.tsx`, `src/index.css`)
- **다크 테마 & 현대적 글래스모피즘**: TailwindCSS 기반의 깔끔한 다크/인디고 테마 디자인 적용
- **실시간 업로드 단계 피드백**: 업로드 중 -> 마크다운 변환 중 -> 벡터 인덱싱 완료 상태를 직관적인 배지와 로더로 안내
- **문서 관리 토글 패널**: 현재 인덱싱된 PDF 문서 목록 및 청크 개수를 확인할 수 있는 서랍식 패널 제공
- **대화 및 추천 프롬프트 칩**: 문서 요약, 시사점 질문 등을 원클릭으로 보낼 수 있는 추천 칩 배치

---

## 2. 검증 결과

### 1) 빌드 및 타입 검사 (`npm run build`)
- TypeScript 타입 검사(`tsc -b`) 및 Vite 프로덕션 빌드 모두 경고/에러 없이 정상 완료되었습니다.
  - Worker 번들: `dist/rag_agents/index.js` (2.1MB)
  - Client 번들: `dist/client/assets/index-*.js`

### 2) 개발 서버 구동 (`npm run dev`)
- Vite 개발 서버와 Cloudflare remote 바인딩(AI, Vectorize, R2, Durable Objects)이 정상 연결되었습니다.
  ```
  VITE v8.2.2 ready in 7927 ms
  ➜ Local: http://localhost:5173/
  ```
- `http://localhost:5173/` (200 OK) 및 `GET /api/documents` (`{ documents: [] }`) 정상 응답 확인.

---

## 3. 실행 방법 안내

프로젝트 폴더에서 바로 개발 서버를 띄워 사용하실 수 있습니다:

```bash
cd my10-ragagents-vec
npm run dev
```

브라우저에서 `http://localhost:5173`으로 접속한 뒤:
1. **[PDF 파일 선택]** 버튼을 눌러 PDF 문서를 등록합니다.
2. 마크다운 변환 및 Vectorize 인덱싱이 완료되면,
3. 하단 채팅창 또는 추천 칩을 눌러 문서 내용에 대해 자유롭게 질문하시면 됩니다!
