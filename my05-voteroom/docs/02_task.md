# 실시간 투표방 구현 작업 목록

- `[x]` 1. `agents` 패키지 설치
- `[x]` 2. `wrangler.jsonc`에 Durable Objects 및 SQLite 바인딩 설정
- `[x]` 3. `src/index.ts`에 `VoteRoom` Agent 구현 및 라우팅 추가
  - `[x]` 상태 모델 정의
  - `[x]` `onConnect` 인증 및 관전자(readonly) 처리
  - `[x]` `@callable` 메서드 (`vote`, `addOption`, `reset`, `closePoll`) 구현
  - `[x]` `this.sql`을 사용한 투표 기록
  - `[x]` `this.schedule`을 사용한 마감 예약
- `[x]` 4. 빌드 및 로컬 테스트 (Verification)
- `[x]` 5. 루트 경로(`/`) 접속 시 테스트용 HTML 페이지 렌더링 및 `/ws` WebSocket 라우팅 처리
- `[x]` 6. 테스트용 HTML 페이지 UI 디자인 개선 (파스텔톤, Jua 폰트 적용 등 귀여운 테마)
- `[x]` 7. 관리자용 투표 결과 상세 조회 페이지(`/admin`) 및 `getLogs` API 추가
- `[x]` 8. 관리자 페이지 WebSocket 응답(배열 Payload) 파싱 버그 수정 및 에러 처리 강화
