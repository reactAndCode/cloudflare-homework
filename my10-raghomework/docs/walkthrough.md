# 🧠 Second Brain RAG Agent (`my10-raghomework`) 구축 완료 보고서

## 1. 개요
사용자의 요청에 따라 `my10-ragagents-vec`를 참고하여, Cloudflare **Durable Objects (SQLite 내장)**, **Vectorize (`second-brain-index`)**, **Workers AI (`@cf/qwen/qwen3.8-27b`, `@cf/baai/bge-base-en-v1.5`)**, **Browser Rendering 마크다운 변환**을 결합한 **나만의 AI 세컨드 브레인(Second Brain) RAG 프로젝트** `my10-raghomework`를 성공적으로 구축 완료했습니다.

---

## 2. 주요 구현 내용

### 1) Vectorize 인덱스 생성 및 연계
- **인덱스명**: `second-brain-index`
- **사전 설정**: `--preset=@cf/baai/bge-base-en-v1.5` (768차원, Cosine 유사도 메트릭)
- Cloudflare 계정(`mis93ysm@naver.com`, Account ID: `2575ea02a46b2ff95d7107bfd8319428`)에 정상 배포/생성 완료.

### 2) Durable Objects & 내장 SQLite 스키마 (`SecondBrainAgent`)
- [worker/index.ts](file:///d:/dev/cloudflare/cloudflare-homework/my10-raghomework/worker/index.ts)의 `onStart()` 생명주기에서 3개의 테이블 자동 생성:
  - `chunks`: `(id TEXT PRIMARY KEY, url TEXT, title TEXT, text TEXT, created_at INTEGER)` ➜ **Vectorize의 벡터 ID(UUID)와 1:1로 매핑되는 원문 텍스트 저장소**.
  - `sources`: `(url TEXT PRIMARY KEY, title TEXT, chunks_count INTEGER, created_at TEXT)` ➜ 기억된 웹페이지 목록 및 메타데이터.
  - `qa_history`: `(id TEXT PRIMARY KEY, question TEXT, answer TEXT, sources TEXT, created_at TEXT)` ➜ 대화 기록.

### 3) Cloudflare Browser Rendering 마크다운 API & 800자 청킹
- `this.env.MYBROWSER.quickAction("markdown", { url })` 바인딩을 통해 웹페이지를 headless로 렌더링하고 동적 마크다운을 직접 추출.
- 장애 복원력을 위해 `Accept: text/markdown` 헤더 기반 direct fetch 및 정규식 기반 HTML 텍스트 정제 2단계 Fallback 내장.
- 추출된 마크다운을 의미 단위(문단, 문장)를 보존하며 약 800자 단위(`maxChunkSize: 800, overlap: 100`)로 스마트 분할.
- BGE-base 임베딩 생성 후, 동일한 UUID로 Vectorize(벡터)와 SQLite(원문 텍스트)에 분리/연계 저장(Hybrid RAG).

### 4) AIAgent 도구(Tools) 및 시스템 프롬프트
- **`recall({ question })`**: 질문 임베딩 ➜ Vectorize 검색 (`topK: 5`) ➜ 매칭된 ID로 SQLite에서 원문 텍스트 및 출처 URL 즉시 복원(Recall)하여 모델에 전달.
- **`listSources()`**: 세컨드 브레인에 저장된 모든 웹페이지 URL, 제목, 청크 수, 등록 시각 반환.
- **시스템 프롬프트**: 불러온 조각을 근거로 삼아 답변하고, **항상 출처 URL과 페이지 제목을 명시**하도록 지시.
- **채팅창 URL 자동 감지**: 사용자가 대화창에 URL을 입력하면 실시간으로 해당 웹페이지를 브레인에 자동 학습/기억.

### 5) 사용자 인터페이스 및 기억 관리 기능 (React SPA)
- [src/App.tsx](file:///d:/dev/cloudflare/cloudflare-homework/my10-raghomework/src/App.tsx):
  - **Second Brain Dark/Purple 테마** 및 상태 뱃지.
  - **상단 URL 인제스트 바**: URL 입력, 1-클릭 추천 웹페이지, 실시간 학습 상태(마크다운 변환 ➜ 800자 청킹 ➜ BGE 임베딩 ➜ Vectorize/SQLite 저장) 알림.
  - **기억 보관소 (Sources Drawer)**: 저장된 웹페이지 목록 확인 및 SQLite `chunks` 테이블 원문 조각 실시간 뷰어.
  - **웹페이지 기억 삭제 기능**:
    - 각 웹페이지 카드별 **개별 삭제 버튼(Trash icon)**: Vectorize에서 관련 UUID 벡터들을 `deleteByIds`로 삭제하고 SQLite `chunks` 및 `sources` 행 영구 제거.
    - 서랍 헤더의 **전체 삭제 버튼**: 세컨드 브레인의 모든 벡터 및 지식 조각 일괄 초기화.
    - 오작동 방지를 위한 삭제 확인 컨펌 대화상자 및 로딩 스피너/완료 알림 피드백.
  - **AI 대화 인터페이스**: `recall` 도구 호출 시각화(질의어, 관련도 %, 출처 칩), 출처 링크 클릭, 추천 프롬프트 칩.

---

## 3. 검증 결과

### 1) TypeScript 및 Vite 빌드 검증
```bash
npm run build
```
- 결과: **Build Success (Exit Code 0)**
  - Worker 번들: `dist/second_brain_agent/index.js` (2,152 kB)
  - Client 번들: `dist/client/index.html`, CSS, JS 번들 생성 완료.

### 2) 문서화 완료
- [docs/05_dev_spec.md](file:///d:/dev/cloudflare/cloudflare-homework/my10-raghomework/docs/05_dev_spec.md):
  - 전체 시스템 아키텍처 및 Mermaid 흐름도
  - Vectorize & SQLite 하이브리드 저장 설계 상세
  - Browser Rendering 마크다운 API & 800자 청킹 원리
  - `recall`, `listSources` 도구 명세 및 시스템 프롬프트
  - HTTP 엔드포인트 테이블 및 cURL 테스트 방법
- [docs/implementation_plan.md](file:///d:/dev/cloudflare/cloudflare-homework/my10-raghomework/docs/implementation_plan.md): 구현 설계 계획서
- [docs/walkthrough.md](file:///d:/dev/cloudflare/cloudflare-homework/my10-raghomework/docs/walkthrough.md): 최종 구축 완료 보고서

---

## 4. 실행 방법

`my10-raghomework` 디렉토리에서 다음 명령어로 로컬 개발 서버를 기동할 수 있습니다:
```bash
cd my10-raghomework
npm run dev
```
브라우저에서 `http://localhost:5173`에 접속하여 나만의 AI 세컨드 브레인을 바로 활용할 수 있습니다.
