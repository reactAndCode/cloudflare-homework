# `my05-agents-react` 프로젝트 분석

본 프로젝트는 Cloudflare의 최신 **Agents SDK(Durable Objects)** 기반 백엔드와 **React** 기반 프론트엔드가 결합된 실시간 채팅 애플리케이션입니다.

## 1. 아키텍처 개요

- **프론트엔드 (Frontend)**: React 19 + Vite
  - 사용자 인터페이스 렌더링 및 `agents/react`의 `useAgent` 훅을 사용해 백엔드와 실시간 양방향 통신 수행
- **백엔드 (Backend)**: Cloudflare Workers + Agents SDK (Durable Objects)
  - `ChattingRoomAgent`라는 하나의 Durable Object가 채팅방의 '상태(State)'와 '데이터베이스(SQLite)'를 관리
- **빌드 및 개발 환경**: `@cloudflare/vite-plugin`
  - Vite 개발 서버 하나로 React 프론트엔드와 Cloudflare Worker 백엔드를 동시에 띄우고(HMR 포함) 통합 개발할 수 있도록 구성되어 있습니다.

## 2. 주요 파일 및 디렉터리 분석

### 2.1 `worker/index.ts` (백엔드 로직)
Cloudflare Durable Objects를 추상화한 `Agent` 클래스를 상속받아 `ChattingRoomAgent`를 정의합니다.

- **SQLite 내장 DB 활용**: `onStart()` 시점에 `messages` 테이블을 생성합니다. Cloudflare DO의 새로운 기능인 내장 SQLite(`this.sql`)를 활용하여 메시지를 영구적으로 저장합니다.
- **실시간 상태 관리 (State)**: `currentlyOnline` (현재 접속자 수) 상태를 관리합니다. 클라이언트가 접속(`onConnect`)하거나 연결을 해제(`onClose`)할 때 `this.setState()`를 호출하며, 이 상태는 연결된 모든 클라이언트에게 즉시 전파됩니다.
- **WebSocket 메시지 처리 (`onMessage`)**: 
  - 클라이언트가 채팅을 보내면 `this.sql`을 사용해 SQLite DB에 기록하고, `this.broadcast()`를 통해 채팅방의 모든 인원에게 뿌려줍니다.
  - 예약된 스케줄러 기능(`this.scheduleEvery`)을 통해 특정 조건(예: 'delete' 메시지) 시 `deleteMessages()` 메서드를 트리거하여 DB를 비우기도 합니다.
- **RPC(Remote Procedure Call) (`@callable`)**: 
  - `@callable() loadHistory()` 메서드를 정의하여, 클라이언트가 HTTP/WebSocket을 거치지 않고도 마치 로컬 함수를 부르듯 서버의 이전 채팅 기록을 DB에서 읽어갈 수 있도록 API를 제공합니다.

### 2.2 `src/App.tsx` (프론트엔드 로직)
React로 작성된 클라이언트 UI 컴포넌트입니다.

- **`useAgent` 훅**: `@cloudflare/agents`에서 제공하는 React 훅으로, `ChattingRoomAgent`와의 WebSocket 연결 및 상태(State) 구독을 한 번에 처리합니다.
- **초기 히스토리 로딩**: `onOpen` 콜백에서 `agent.stub.loadHistory()`를 호출하여 서버의 `@callable` 메서드를 실행, 이전 채팅 내역을 SQLite DB에서 불러와 화면에 렌더링합니다.
- **실시간 이벤트 처리**: `onMessage` 콜백으로 서버에서 브로드캐스트하는 새로운 채팅 메시지를 받아 상태 배열에 추가(`setMessages`)합니다.
- **상태 동기화**: `agent?.state?.currentlyOnline` 처럼 훅에서 제공하는 state 프로퍼티를 통해, 별도 처리 없이도 서버의 실시간 접속자 수를 UI에 바로 반영합니다.

### 2.3 `wrangler.jsonc` (Cloudflare 환경 설정)
- **`durable_objects` & `migrations`**: `ChattingRoomAgent`를 Durable Object 클래스로 바인딩하고, SQLite 지원을 위해 `new_sqlite_classes` 마이그레이션 설정을 추가했습니다(`v1`).
- **`assets`**: `{"not_found_handling": "single-page-application"}` 설정이 되어 있어, 실제 배포(Deploy) 시 React 빌드 결과물(정적 에셋)을 Cloudflare Workers가 호스팅하고 React Router 등 SPA 라우팅이 정상 작동하도록 구성되어 있습니다.

## 3. 핵심 요약 및 시사점

1. **단일 리포지토리(풀스택) 경험**: 과거에는 Worker와 React 프로젝트를 분리해야 했지만, `@cloudflare/vite-plugin`을 통해 하나의 프로젝트 내에서 React 프론트엔드와 Worker 백엔드 코드를 동시에 작성하고 테스트할 수 있습니다.
2. **복잡한 통신 코드 최소화**: REST API나 수동 WebSocket 제어 대신, `useAgent` 훅 하나로 웹소켓 연결, 재연결, 상태(State) 구독, RPC 함수 호출을 모두 선언적으로 깔끔하게 처리하고 있습니다.
3. **영구 저장소 통합**: 별도의 외부 데이터베이스(D1, PostgreSQL 등)를 연결할 필요 없이, 해당 에이전트(채팅방) 전용 내장 SQLite에 채팅 기록을 저장하여 속도와 구조적 응집도를 높였습니다.
