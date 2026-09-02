# Food Ordering Concierge Agent (my08-orderchat) Implementation Plan

이 계획은 `my06-aichat`의 구조를 기반으로 새로운 `my08-orderchat` 폴더를 생성하고 음식 주문 컨시어지 챗봇을 구현하는 방법에 대해 설명합니다.

## User Review Required
> [!IMPORTANT]
> 장바구니 상태(Cart)는 현재 에이전트 클래스의 메모리 변수로 저장하도록 설계되었습니다. (새로운 세션이 시작되면 초기화됨) 만약 데이터베이스(SQLite)에 영구 저장해야 한다면 설계 변경이 필요합니다. 메모리로 유지하는 방식이 괜찮으신지 확인 부탁드립니다.

## Open Questions
- 피자, 타코, 비빔밥 외에 특별히 추가하고 싶은 메뉴나 가격이 있으신가요? (기본 가격은 임의로 설정할 예정입니다)
- 카드 번호 필터링 외에 주소나 전화번호도 마스킹(필터링) 처리할 필요가 있을까요?

## Proposed Changes

### 1. 프로젝트 스캐폴딩 및 설정 (Scaffolding & Config)
`my06-aichat`를 복사하여 `my08-orderchat`을 생성합니다.

#### [MODIFY] package.json
- 프로젝트 이름을 `my08-orderchat`으로 변경합니다.
- `agents`, `@cloudflare/ai-chat` 등 필요한 최신 의존성이 잘 설정되어 있는지 확인합니다.

#### [MODIFY] wrangler.jsonc
- 프로젝트 이름 및 Durable Object 바인딩 클래스 이름을 `PotatoChatAgent`에서 `OrderConciergeAgent`로 변경합니다.
- 마이그레이션 및 SQLite 설정을 새로운 클래스 이름에 맞게 수정합니다.

---

### 2. Backend (Cloudflare Workers AI & Agent)

#### [NEW] worker/tools.ts
새로운 음식 주문용 도구(Tool)들을 Zod 스키마와 함께 정의합니다.
- `getMenu`: 제공 가능한 메뉴(피자, 타코, 비빔밥)와 가격 반환
- `addToCart(item)`: 사용자의 장바구니에 아이템 추가 (Agent 내부 상태 변경을 위해 콜백 형태로 설계)
- `viewCart()`: 현재 장바구니에 담긴 내역과 총액 반환
- `getLocation`: 클라이언트 사이드 도구로 정의 (입력/실행 없음)
- `placeOrder`: 최종 결제 도구. `needsApproval` 옵션을 설정하여 사용자가 UI에서 승인(Approve)해야만 주문 확정

#### [NEW] worker/index.ts
`OrderConciergeAgent` 클래스를 구현합니다.
- 클래스 내부에 `cart` 배열을 두어 장바구니 상태를 관리합니다.
- `onChatMessage`에서 위 도구들을 모델(`@cf/qwen/qwen3.8-27b`)에 바인딩합니다.
- `sanitizeMessageForPersistence` 메서드를 오버라이드하여 정규식을 통해 14~16자리 숫자(카드번호)를 `****-****-****-****` 등으로 가립니다.

---

### 3. Frontend (React UI)

#### [NEW] src/App.tsx
- `useAgent({ agent: "OrderConciergeAgent" })` 훅을 사용하여 새로운 에이전트에 연결합니다.
- `onToolCall` 콜백을 구현하여 `getLocation` 도구가 호출될 때 브라우저의 `navigator.geolocation` API를 사용하여 위치 좌표를 반환하도록 합니다.
- 기존의 승인(Approve/Reject) UI를 활용하여 `placeOrder` 호출 시 장바구니 총액이 담긴 결제 승인 창을 띄웁니다.
- 제목 및 스타일링을 배달 앱 콘셉트("🍔 주문 컨시어지 챗")에 맞게 수정합니다.

## Verification Plan
### Automated Tests
- `npm run build`를 실행하여 타입스크립트 및 Vite 번들링 에러가 없는지 확인합니다.

### Manual Verification
- `npm run dev`로 개발 서버를 실행한 후 다음 시나리오를 직접 테스트합니다.
  1. "메뉴 알려줘" -> `getMenu` 호출 확인
  2. "비빔밥이랑 피자 장바구니에 담아줘" -> `addToCart` 반복 호출 확인
  3. "장바구니 확인해줘" -> `viewCart` 호출 확인
  4. "내 위치 주변 매장으로 배달해줘" -> `getLocation` 브라우저 승인 및 위치 획득 확인
  5. "주문할게" -> `placeOrder` 승인(Approve) 요청 버튼이 뜨는지 확인
  6. "내 카드번호는 1234-5678-1234-5678이야" -> SQLite에 저장된 메시지가 `****`로 마스킹되는지 확인 (새로고침 후 필터링된 메시지가 그대로 뜨는지 확인)
