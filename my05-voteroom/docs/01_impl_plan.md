# Cloudflare Agents SDK 기반 실시간 투표방(VoteRoom) 구현 계획

이 문서는 새로운 Cloudflare Agents SDK를 사용하여 실시간 투표방(`VoteRoom`)을 구축하기 위한 아키텍처 및 구현 단계를 설명합니다. 이 애플리케이션은 상태 관리를 위해 Durable Objects를 사용하고, 영구적인 로그를 위해 내장 SQLite(`this.sql`), 실시간 동기화를 위해 WebSocket을 활용합니다.

## User Review Required

> [!IMPORTANT]
> - **패키지 설치:** 최신 Cloudflare Agents SDK를 사용하기 위해 `npm install agents` 명령을 실행해야 합니다.
> - **인증 (방 토큰):** 요구 사항에 "유효한 방 토큰이 없는 연결은 받지 않습니다"라고 되어 있습니다. 특정 토큰 형식이 지정되지 않았으므로, 예시로 단순한 문자열 비교(예: URL 파라미터로 `?token=secret-token` 확인)를 사용할 예정입니다. 별도의 인증 로직이 필요하시다면 알려주세요.
> - **테이블 스키마:** `this.sql`을 사용해 `votes_log` 테이블을 생성하며, 투표방이 처음 초기화될 때 테이블이 생성되도록 구성할 예정입니다.

## Open Questions

> [!CAUTION]
> 1. **방 토큰(Room Token)**: `token`을 어떤 방식으로 검증하고 싶으신가요? 고정된 환경 변수(Secret)값과 비교할까요, 아니면 비어 있지 않은 아무 문자열이나 임시로 허용할까요?
> 2. **초기 질문 및 선택지**: 투표방의 질문과 선택지를 클라이언트에서 `@callable` 메서드로 동적으로 생성하도록 할까요? 아니면 코드 내에 "가장 좋아하는 프로그래밍 언어는?"과 같은 기본값을 미리 설정해 둘까요?

## Proposed Changes

### `package.json`

- `agents` 패키지 의존성을 추가합니다 (`npm install agents`).
- Cloudflare Agents SDK는 표준 TC39 데코레이터를 사용하므로 `tsconfig.json`에서 `experimentalDecorators` 설정이 꺼져 있는지(또는 충돌하지 않는지) 확인합니다.

---

### `wrangler.jsonc`

- Agent 클래스를 위한 Durable Objects 바인딩을 추가합니다.
- 내장 데이터베이스 사용을 위해 `sqlite: true` 속성을 추가합니다.
- 필요 시 마이그레이션 구성을 설정합니다.

#### [MODIFY] [wrangler.jsonc](file:///c:/work/mydev/cloudflare/my05-voteroom/wrangler.jsonc)

---

### Application Logic

#### [MODIFY] [src/index.ts](file:///c:/work/mydev/cloudflare/my05-voteroom/src/index.ts)

1. **상태(State) 인터페이스 정의**:
   ```typescript
   interface State {
     question: string;
     options: { id: string; label: string; votes: number }[];
     closed: boolean;
   }
   ```
2. **`VoteRoom` Agent 클래스**:
   - `Agent<Env, State>`를 확장합니다.
   - **`onConnect(connection, ctx)`**:
     - 요청 URL(`ctx.request.url`)에서 `token`과 `readonly` 쿼리 파라미터를 추출합니다.
     - `token`이 없거나 유효하지 않으면 연결을 거부(Reject)합니다.
     - `ctx.request.cf.city`를 통해 사용자의 도시 정보를 추출하고, 나중에 사용할 수 있도록 메모리에 저장해 둡니다.
     - `readonly=true`인 경우, 클라이언트가 투표(`vote()`)를 호출할 때 거부되도록 설정합니다. (Agents SDK의 `shouldConnectionBeReadonly` 훅이나 커스텀 로직을 사용)
   - **`@callable() vote(optionId)`**:
     - 투표방이 닫혔는지(`this.state.closed`) 먼저 확인합니다.
     - 읽기 전용 관전자인지 확인 후, 권한이 없다면 에러를 반환합니다.
     - `this.state.options`에서 해당 선택지의 득표 수를 1 증가시킵니다.
     - `this.sql`을 사용해 SQLite에 로그를 기록합니다: `INSERT INTO votes_log (option_id, city, created_at) VALUES (...)`.
     - 득표 수 변경 사항은 Agents SDK에 의해 연결된 모든 클라이언트에게 자동으로 브로드캐스트(동기화)됩니다.
   - **`@callable() addOption(label)`**: 상태 객체에 새로운 선택지를 추가합니다.
   - **`@callable() reset()`**: 모든 선택지의 득표 수를 0으로 초기화합니다.
   - **`@callable() closePoll()`**: `this.state.closed = true`로 변경하여 이후의 투표 호출을 거부합니다.
   - **스케줄링(Scheduling)**: 
     - 예를 들어 `scheduleClose(closesAt)` 메서드를 두어 `this.schedule(closesAt, "closePoll")`를 호출하게 하여, 지정된 시간에 자동으로 투표가 종료되도록 설정합니다.
3. **Fetch 핸들러 (라우팅)**:
   - 클라이언트의 WebSocket 연결 요청을 `env.VOTE_ROOM.get(env.VOTE_ROOM.idFromName(방이름))`을 통해 해당 `VoteRoom` 인스턴스로 라우팅합니다.

## Verification Plan

### Automated Tests
- 없음 (실 창 WebSocket 통신은 수동 테스트에 의존합니다).

### Manual Verification
1. 브라우저 탭을 여러 개 열어 투표방의 WebSocket 엔드포인트에 접속합니다.
2. 한 탭에서 투표를 진행했을 때, 다른 모든 탭에서 득표 수가 즉시 업데이트되는지 확인합니다.
3. `?readonly=true` 파라미터로 접속한 관전자가 `vote()` 호출 시 정상적으로 거부되는지 확인합니다.
4. `token` 파라미터 없이 접속 시 즉시 연결이 종료되는지 확인합니다.
5. Cloudflare 대시보드나 로그를 통해 SQLite에 투표자 도시와 시간이 제대로 기록되는지 확인합니다.
