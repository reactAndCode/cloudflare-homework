# 개발 명세서 (Development Specification)
## 실시간 투표방 (VoteRoom) with Cloudflare Agents SDK

이 문서는 `VoteRoom` 애플리케이션에 대한 구현 명세와 상세한 테스트 방법을 제공합니다.

---

## 1. 개요
Cloudflare Agents SDK를 사용하여 구현된 실시간 투표방입니다.
WebSocket을 통한 실시간 상태 동기화, SQLite를 통한 영구적 기록 저장, 스케줄링 타이머 기능을 포함합니다.

## 2. 주요 아키텍처 및 설정

- **플랫폼**: Cloudflare Workers (Durable Objects)
- **프레임워크**: Cloudflare Agents SDK (`agents`)
- **데이터베이스**: Durable Objects 기반 내장 SQLite (`this.sql`)
- **라우팅**: `env.VOTE_ROOM.idFromName(roomName)`을 사용하여 URL 경로 기준으로 동적 방을 생성 및 접속 라우팅 처리.

### 환경 설정 (`wrangler.jsonc`)
```jsonc
"durable_objects": {
  "bindings": [
    { "name": "VOTE_ROOM", "class_name": "VoteRoom" }
  ]
},
"migrations": [
  { "tag": "v1", "new_sqlite_classes": ["VoteRoom"] }
]
```

---

## 3. 구현 상세 내용 (`src/index.ts`)

### 3.1 상태 (State) 모델
모든 클라이언트가 실시간으로 공유하는 상태는 다음과 같습니다.
- `question`: 투표 질문 텍스트
- `options`: `{ id, label, votes }`의 배열 구조.
- `closed`: 투표 종료 여부를 나타내는 boolean 값.

### 3.2 WebSocket 및 인증 (`onConnect`)
- **인증 토큰**: URL 파라미터로 `?token=secret-token`이 제공되지 않으면 연결 즉시 종료(코드 4000).
- **관전자 모드**: `?readonly=true`로 접근 시 연결 객체를 `isReadonly = true` 모드로 강제 설정.
- **사용자 정보 추출**: `ctx.request.cf.city`를 통해 클라이언트 접속 지역(City) 메타데이터를 저장.

### 3.3 내장 SQLite DB (`this.sql`)
투표 로그를 영구 보존하기 위해 Agent 초기화 단계에서 자동으로 테이블을 생성합니다.
- 테이블명: `votes_log`
- 스키마: `id`, `option_id`, `city`, `created_at`

### 3.4 원격 호출 메서드 (`@callable`)
UI나 클라이언트 측에서 직접 호출 가능한 함수들입니다.
- **`vote(optionId)`**: 투표 상태 `votes`를 1 증가시키고 SQLite `votes_log` 테이블에 기록을 INSERT. 투표 마감 상태(`closed`)일 경우 에러 반환.
- **`addOption(label)`**: 신규 투표 선택지를 상태에 추가.
- **`reset()`**: 모든 항목의 `votes`를 0으로 초기화.
- **`closePoll()`**: 강제로 상태를 `closed = true`로 변경하여 투표 마감.
- **`openPollAndSchedule(durationMs)`**: 투표를 개시함과 동시에, Cloudflare Agents 스케줄링 API (`this.schedule`)를 호출해 지정된 시간(ms) 후 자동으로 `closePoll` 메서드가 실행되도록 예약 설정.
- **`getLogs()`**: SQLite `votes_log` 테이블에서 최신 투표 기록 최대 100건을 조회하여 반환하는 관리자용 메서드입니다.

### 3.5 브라우저 테스트용 HTML 렌더링 (Routing)
순수 웹소켓 연결만으로는 UI 테스트가 어렵기 때문에 `fetch` 라우터에 간단한 HTML을 응답하는 로직을 추가했습니다. (파스텔톤 배경과 Jua 폰트를 적용한 귀여운 UI 테마가 반영되어 있습니다.)
- **`GET /`**: 브라우저로 루트 경로에 접속 시, `renderTestPage()` 함수가 호출되어 채팅/투표 UI 테스트가 가능한 HTML 페이지를 응답합니다. (URL 쿼리 `roomId` 및 `nickname` 반영)
- **`GET /admin`**: 브라우저로 `/admin` 경로에 접속 시, 관리자 전용 HTML 페이지를 응답합니다. SQLite 투표 기록을 표 형태로 조회하고, 결과를 새로고침하거나 초기화할 수 있습니다.
- **`GET /ws`**: HTML 내 자바스크립트 코드에서 요청하는 웹소켓 접속 경로입니다. 쿼리 파라미터를 읽어 해당 투표방 Agent로 연결해줍니다.

---

## 4. 테스트 방법 (Testing Guide)

로컬 서버를 구동한 후 직접 작동 상태를 검증할 수 있습니다.

### 1단계: 로컬 개발 서버 실행
터미널에서 프로젝트 경로로 이동한 뒤, 아래 명령을 입력하여 로컬 워커 런타임을 구동합니다.
```bash
npm run dev
```

### 2단계: 브라우저를 통한 HTML UI 테스트 (권장)
별도의 프론트엔드 프로젝트 구축 없이 크롬 등 웹 브라우저에서 바로 확인할 수 있습니다.
- 브라우저 주소창에 다음 URL을 입력합니다:
  ```text
  http://localhost:8787/?roomId=testroom&nickname=tester
  ```
- 페이지에 접속하면 자동으로 웹소켓(ws) 연결이 맺어지며 화면 하단 로그에 `✅ 연결됨`이 표시됩니다.
- 입력창을 통해 메시지(JSON-RPC 포맷 등)를 보내 서버와의 통신을 테스트할 수 있습니다.

### 3단계: 클라이언트 콘솔 접속 및 순수 WebSocket 테스트
직접 브라우저의 [개발자 도구 (F12) -> Console] 탭에서 간단히 WebSocket 연결을 테스트해 볼 수 있습니다.

**정상 연결 및 실시간 데이터 수신 테스트:**
```javascript
const ws = new WebSocket('ws://localhost:8787/room/testroom?token=secret-token');

ws.addEventListener('message', (event) => {
    // Agents SDK가 내부적으로 전송하는 state 동기화 페이로드 확인
    console.log("서버로부터 메시지 수신:", event.data);
});
ws.addEventListener('open', () => {
    console.log("정상 접속 완료!");
});
```

**인증 실패 테스트:**
토큰 없이 또는 잘못된 토큰으로 접속 시도:
```javascript
const failWs = new WebSocket('ws://localhost:8787/room/testroom?token=wrong-token');
failWs.addEventListener('close', (event) => {
    console.log("연결 실패 코드:", event.code, "이유:", event.reason); 
    // 기대 결과: 코드 4000, Unauthorized
});
```

**RPC 메서드 호출 테스트 (`vote` 등):**
현재 Cloudflare Agents 클라이언트 라이브러리를 사용해 프론트엔드를 구성하지 않은 경우 순수 WebSocket으로 JSON-RPC 형태의 메시지를 보내야 합니다. (이 부분은 프론트엔드 구축 시 `agents` 클라이언트 SDK를 통해 쉽게 함수 호출 형태로 구현됩니다).

예를 들어, 프론트엔드 프로젝트를 따로 생성하여 Agent 클라이언트를 다음과 같이 사용하면 됩니다:
```typescript
// 프론트엔드 클라이언트 측 예시 코드
import { createAgentClient } from 'agents';

const agent = createAgentClient({
  url: 'ws://localhost:8787/room/testroom?token=secret-token'
});

// @callable() 메서드 호출
await agent.vote('opt1');
await agent.addOption('JavaScript');
await agent.openPollAndSchedule(60000); // 60초 뒤 마감 예약
```
