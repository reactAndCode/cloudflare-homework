# 03. 음식 주문 컨시어지 (my08-orderchat) 개발 상세 내역서 (Dev Spec)

## 1. 개요 (Overview)
본 문서는 `my06-aichat`을 기반으로 구축된 `my08-orderchat` (음식 주문 컨시어지 봇)의 시스템 구조, 도구 사양, 구현 내역 및 테스트 방법을 기술합니다.
이 봇은 사용자의 메시지를 이해하고, 메뉴 안내부터 장바구니 관리, 사용자 위치 파악, 결제 승인 요청까지 자동화된 대화형 인터페이스를 제공합니다.

---

## 2. 기술 스택 및 주요 컴포넌트
- **Frontend**: React, TailwindCSS, Vite
- **Backend**: Cloudflare Workers, Durable Objects, Vercel AI SDK (`ai`), Cloudflare AI SDK (`@cloudflare/ai-chat`)
- **AI Model**: `@cf/qwen/qwen3.8-27b` (한국어 처리에 탁월하며, 도구(Tool) 호출 및 스트리밍 성능이 뛰어남)
- **Database (Persistence)**: SQLite in Durable Objects (에이전트별 채팅 기록 저장)

---

## 3. 구현 상세 내역 (Implementation Details)

### 3.1. 에이전트 클래스 (`OrderConciergeAgent`)
- **역할**: 음식 주문을 전담하는 비서. 사용자의 인텐트(의도)에 맞게 적절한 도구를 엮어서 호출(Chain of tools).
- **장바구니 상태 관리 (`this.cart`)**:
  - Durable Object 런타임 메모리(클래스 인스턴스 변수)를 활용하여 세션이 유지되는 동안 `cart` 배열에 사용자가 선택한 아이템을 저장합니다.
- **메시지 보안 정제 (`sanitizeMessageForPersistence`)**:
  - 보안을 위해 정규 표현식(`/\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g`)을 사용하여 영구 저장(SQLite) 전 16자리 카드 번호를 `****-****-****-****`로 치환합니다.
  - UI 상에서는 사용자가 쓴 원본 메시지가 즉시 보이지만, 서버에 기록되거나 새로고침 시 불러오는 메시지는 마스킹 처리된 상태로 유지됩니다.

### 3.2. 도구 (Tools) 명세서 (`worker/tools.ts`)
에이전트가 자율적으로 판단하여 호출하는 4가지 도구가 정의되어 있습니다.

| 도구명 | 실행 위치 | 역할 | 파라미터(Input) | 결과(Output) |
|---|---|---|---|---|
| **`getMenu`** | Server | 현재 주문 가능한 음식 메뉴와 가격 목록 반환 | 없음 | `items: [{name, price}, ...]` |
| **`addToCart`** | Server | 장바구니(`cart` 상태)에 아이템 추가 및 저장 | `item` (메뉴명), `price` (가격) | 성공 메시지 |
| **`viewCart`** | Server | 현재 장바구니에 담긴 내역과 총 결제 금액 반환 | 없음 | `items`, `totalPrice` |
| **`getLocation`** | **Client** | 브라우저 GPS를 통해 사용자의 위도/경도 반환 | 없음 | `latitude`, `longitude` (UI 단에서 반환) |
| **`placeOrder`** | Server (승인) | 최종 결제 및 주문 확정 처리. (`needsApproval` 적용) | `totalPrice` | 성공 메시지 및 장바구니 초기화 |

---

## 4. 테스트 시나리오 및 방법 (Test Cases)

개발 서버(`npm run dev`)를 실행하고 `http://localhost:5173` 에 접속하여 아래 순서대로 자연스럽게 대화해 보세요.

### 📝 테스트 스토리보드
1. **메뉴 안내 테스트**
   - **사용자**: "배고픈데 메뉴 뭐 있어?"
   - **기대 결과**: AI가 `getMenu`를 호출하여 피자, 페퍼로니, 타코, 비빔밥 등을 가격과 함께 안내합니다.

2. **장바구니 추가 테스트**
   - **사용자**: "라지 페퍼로니 1개랑 타코 1개 주문할게."
   - **기대 결과**: AI가 `addToCart` 도구를 2번 호출하거나 연달아 실행한 뒤, 장바구니에 잘 담았다고 응답합니다.

3. **장바구니 조회 테스트**
   - **사용자**: "지금까지 담은 거 총 얼마야?"
   - **기대 결과**: AI가 `viewCart` 도구를 호출하여 35,000원(23,000 + 12,000)이라고 정확하게 답변합니다.

4. **클라이언트 도구 (위치 정보) 테스트**
   - **사용자**: "내 위치에서 제일 가까운 매장으로 배달해줘."
   - **기대 결과**: 브라우저 상단에 GPS 권한 팝업이 뜨고(허용 클릭), 채팅창에 위도/경도 좌표가 찍힙니다. AI가 좌표를 인식하고 알겠다고 답합니다.

5. **결제 승인(Human-in-the-loop) 테스트**
   - **사용자**: "이제 이걸로 주문 완료해줘."
   - **기대 결과**: 즉시 결제되지 않고 화면에 노란색 바탕의 `[Approve]` / `[Reject]` 버튼이 뜹니다. `[Approve]`를 클릭해야만 AI가 "주문이 완료되었습니다" 라고 확정합니다.

6. **보안(마스킹) 테스트**
   - **사용자**: "결제할 내 카드번호는 1234-1234-1234-1234 야."
   - **기대 결과**: 화면상에는 일단 평문으로 나오지만, 키보드 `F5`(새로고침)를 눌러 SQLite에서 과거 채팅 기록을 다시 불러오면 `****-****-****-****`로 마스킹되어 있습니다.

---

## 5. 향후 개선점 (Future Improvements)

1. **영구적인 장바구니(Cart) 저장소 구축**
   - 현재 장바구니(`this.cart`)는 Durable Object의 런타임 메모리에만 존재하여 컨테이너가 재시작되면 날아갑니다. Cloudflare DO의 `this.state.storage` 또는 SQLite를 통해 장바구니 내역을 영구적으로 직렬화하여 저장하도록 개선이 필요합니다.

2. **멀티모달 (이미지 기반 주문)**
   - `Qwen` 비전 모델 또는 Llama Vision 모델을 연결하여 사용자가 음식 사진을 올리면 메뉴를 자동으로 인식하고 장바구니에 담아주는 기능을 추가할 수 있습니다.

3. **결제 모듈(PG) 연동**
   - `placeOrder`의 단순 승인 버튼을 넘어, Stripe 또는 Toss Payments의 결제 위젯을 `App.tsx`의 커스텀 UI 블록(ToolUI)으로 띄워서 실제 결제가 이루어지게 확장할 수 있습니다.

4. **스트리밍 한글 처리 안정성 지속 모니터링**
   - 현재는 Qwen 모델을 사용하여 "유유명명" 처럼 글자가 깨지는 증상이 없지만, Vercel AI SDK 업데이트에 따라 렌더링 청크(Chunk) 방식이 변할 수 있으므로 지속적인 디버깅이 권장됩니다.


## 6. UI 개선 사항 (UI Improvements)
- **JSON 덩어리 삭제**: `getMenu output-available` 뒤에 길게 따라붙던 JSON 데이터 출력 UI를 숨김 처리했습니다.
- **생각(Reasoning) 숨김**: "The user is asking..." 처럼 AI가 속으로 혼잣말하던 영어 텍스트를 완전히 숨겼습니다.
- **깔끔한 뱃지 처리**: AI가 도구를 호출하면 작고 예쁜 `[getMenu]` 형태의 인라인 뱃지만 표시되도록 변경했습니다.

---

## 7. 소스 코드 함수별 상세 설명 (Source Code Analysis)

### 7.1. 프론트엔드: `src/App.tsx`
React 기반의 채팅 UI 컴포넌트입니다.

- **`useAgentChat({ agent, onToolCall })`**
  - **역할**: Cloudflare AI SDK에서 제공하는 훅(Hook)으로, 에이전트와의 WebSocket/스트리밍 연결 및 메시지 상태를 관리합니다.
  - **`onToolCall` 콜백**: 서버가 아닌 **클라이언트(브라우저)에서 실행되어야 할 도구**를 가로챕니다. 이 코드에서는 `getLocation` 도구 호출을 감지하면 `navigator.geolocation.getCurrentPosition()`을 실행하여 브라우저 GPS 위도/경도를 서버로 넘겨줍니다.

- **`renderMessage(msg: UIMessage)`**
  - **역할**: AI와 사용자가 주고받는 메시지(채팅 말풍선)를 화면에 그리는 함수입니다.
  - **`part.type === "reasoning"` 숨김**: AI의 내부 추론 텍스트를 UI에서 보이지 않게(`return null`) 차단했습니다.
  - **도구 호출 인라인 뱃지화**: 기존에는 도구가 실행될 때 거대한 JSON 텍스트 블록이 렌더링되었으나, `part.state === "output-available"` 등을 가리고 단순히 `<span className="...">[도구이름]</span>` 형태의 깔끔한 뱃지로 그리도록 최적화했습니다.
  - **결제 승인창 (Approve/Reject)**: `part.state === "approval-requested"` 상태일 때 노란색 경고창과 함께 승인/거절 버튼을 띄우고, `addToolApprovalResponse`를 통해 서버에 사용자의 결정을 전송합니다.

### 7.2. 백엔드 에이전트: `worker/index.ts`
Durable Object 기반으로 동작하며, 사용자마다 독립적인 채팅 세션을 유지하는 핵심 에이전트 클래스입니다.

- **`OrderConciergeAgent` (클래스)**
  - **역할**: `AIChatAgent`를 상속받은 음식 주문 전담 비서 컨테이너입니다.
  - **`this.cart = []`**: 클래스 인스턴스 내부에 장바구니 배열을 선언하여, 세션이 살아있는 동안 주문 내역을 메모리에 누적 저장합니다.

- **`onChatMessage(onFinish, options)`**
  - **역할**: 사용자의 새 메시지가 도착할 때마다 호출되는 함수입니다.
  - **`createTools()` 호출**: 에이전트 상태인 `this.cart`를 조작할 수 있도록 팩토리 패턴으로 도구들을 생성하여 주입합니다.
  - **`streamText(...)`**: Vercel AI SDK를 호출합니다. 강력한 한국어 모델(`@cf/qwen/qwen3.8-27b`)을 지정하고, "당신은 음식 주문 비서입니다..." 라는 커스텀 시스템 프롬프트(System Prompt)를 설정합니다.

- **`sanitizeMessageForPersistence(message)`**
  - **역할**: 채팅 내용이 SQLite 데이터베이스에 영구 저장되기 **직전**에 메시지를 가로채어 정제(Sanitize)하는 보안 함수입니다.
  - **동작**: `replace(/\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g, "****-****-****-****")` 정규식을 활용해 신용카드 번호 패턴이 감지되면 마스킹 처리하여 DB 유출을 방지합니다.

### 7.3. 백엔드 도구: `worker/tools.ts`
AI가 스스로 필요하다고 판단할 때 호출하는 기능(함수)들의 집합입니다.

- **`createTools(cart, addToCartCallback, clearCartCallback)`**
  - **역할**: 에이전트 클래스의 상태(`cart`)에 접근하기 위해 클로저(Closure)를 활용한 도구 생성 팩토리 함수입니다.

- **`getMenu` (도구)**
  - **역할**: `execute` 함수가 고정된 피자, 타코 등의 음식 메뉴 객체 배열을 즉시 반환합니다.

- **`addToCart` (도구)**
  - **역할**: 사용자가 음식을 주문하면 호출됩니다. `execute` 내부에서 `addToCartCallback`을 실행하여 에이전트의 `this.cart` 배열에 실제 데이터를 집어넣습니다.

- **`viewCart` (도구)**
  - **역할**: 장바구니 확인 요청 시, 현재 `cart` 배열을 순회(`reduce`)하여 총 결제 금액(`totalPrice`)을 계산한 뒤 AI에게 반환합니다.

- **`getLocation` (도구)**
  - **역할**: 껍데기(Input Schema)만 서버에 선언되어 있습니다. `execute` 로직이 없으며, 호출 시 클라이언트(`App.tsx`의 `onToolCall`)로 제어권이 넘어가 브라우저 GPS를 받아오게 됩니다.

- **`placeOrder` (도구)**
  - **역할**: 최종 주문 결제 도구입니다.
  - **`needsApproval: () => true`**: 이 속성 때문에 함수가 즉시 실행되지 않고 대기 상태로 빠지며, 프론트엔드로 승인 요청 신호(`approval-requested`)를 보냅니다. 사용자가 승인하면 비로소 `execute`가 실행되며 장바구니를 비웁니다(`clearCartCallback`).