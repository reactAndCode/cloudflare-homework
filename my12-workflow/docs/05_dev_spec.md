# 🍕 Cloudflare Workflows & Agents 피자 주문 시스템 개발 명세서 (05_dev_spec.md)

이 문서는 Cloudflare Workflows와 Cloudflare Agents SDK를 활용하여 구현된 피자 주문 및 주방 처리 상태 관리 시스템의 상세 명세서입니다.

---

## 1. 프로젝트 개요 (Overview)

본 시스템은 Cloudflare Workers의 **Durable Objects (Agents)**와 내구성 있는 비동기 워크플로우를 처리하는 **Cloudflare Workflows**를 결합하여 제작된 실시간 피자 주문 관리 애플리케이션입니다.

- **주요 목적**: 주문 수락/거부, 카드 결제 재시도, 대기 시간(Sleep), 주방 조리 및 배달 상태 변경 등 시간이 오래 걸리거나 비동기 휴먼-인-더-루프(Human-in-the-loop) 처리가 필요한 작업을 내구성 높은 워크플로우로 구현합니다.
- **주요 기술 스택**:
  - **Runtime & Hosting**: Cloudflare Workers
  - **State Management & Communication**: Cloudflare Agents SDK (Durable Objects 기반 실시간 상태 동기화 및 `@callable` RPC 지원)
  - **Workflow Engine**: Cloudflare Workflows (`AgentWorkflow`)
  - **Frontend**: React 19, Vite, Tailwind CSS v4

---

## 2. 시스템 아키텍처 & 데이터 흐름 (Architecture & Data Flow)

```
[ Frontend (React Client) ]
     │  ▲
     │  │  WebSockets / RPC (`useAgent`)
     ▼  │
[ RestaurantAgent (Durable Object Agent) ]
     │  ▲
     │  │  State Update & Event Signals
     ▼  │
[ PizzaWorkflow (Cloudflare Workflow) ]
     │
     ├── Step 1: awaiting-approval (30초 대기 / 휴먼-인-더-루프)
     ├── Step 2: charge (카드 결제 - 실패 시 최대 10회 재시도)
     ├── Step 3: preparing (10초 Sleep)
     ├── Step 4: baking (10초 Sleep)
     ├── Step 5: delivering (10초 Sleep)
     └── Step 6: delivered (완료) / rejected (오류 또는 거절 발생 시)
```

---

## 3. 데이터 모델 & 타입 정의 (`worker/types.ts`)

### 3.1 `Stage` (주문 진행 단계)
주문이 진행되는 상태의 유니온 타입입니다.
- `pending`: 주문 생성 초기 상태
- `awaiting-approval`: 주방 승인 대기 상태
- `paying`: 카드 결제 시도 중 상태
- `preparing`: 재료 준비 중 상태
- `baking`: 피자 굽는 중 상태
- `delivering`: 배달 중 상태
- `delivered`: 배달 완료 상태
- `rejected`: 승인 거절 또는 결제/타임아웃 실패 상태

### 3.2 `Order` (주문 객체)
```typescript
export type Order = {
  orderId: string;         // 주문 및 워크플로우 고유 ID
  stage: Stage;            // 현재 주문 단계
  etaMinutes?: number;     // 예상 소요 시간 (분 단위)
  note?: string;           // 주방 승인 시 고객에게 보낼 메모
  chargeAttempts?: number; // 카드 결제 시도 횟수
};
```

### 3.3 `State` (Agent의 전체 상태)
```typescript
export type State = {
  orders: Record<string, Order>; // orderId를 키로 갖는 주문 목록
};
```

---

## 4. 백엔드 함수 & 클래스 명세 (`worker/index.ts`)

### 4.1 `PizzaWorkflow` 클래스
`AgentWorkflow<RestaurantAgent, Params>`를 상속받아 피자 주문 수명주기를 제어하는 오케스트레이션 클래스입니다.

#### 1) `run(_event: AgentWorkflowEvent<Params>, step: AgentWorkflowStep)`
워크플로우 진입점이자 메인 실행 로직입니다.

- **상태 업데이트 헬퍼 (`updateState`)**:
  - `step.updateAgentState`를 사용하여 Durable Object 에이전트의 `orders` 상태를 패치 단위로 즉시 동기화합니다.

- **진행 단계 및 동작 상세**:
  1. **주방 승인 대기 (`awaiting-approval`)**:
     - `step.waitForApproval({ timeout: "30 seconds" })`를 실행합니다.
     - 30초 동안 `approveWorkflow` 또는 `rejectWorkflow` 이벤트를 대기합니다.
     - 타임아웃 발생 시 예외가 발생되어 `catch` 블록의 `rejected` 단계로 이동합니다.
  2. **승인 정보 처리 및 결제 단계 설정 (`paying`)**:
     - 승인 데이터(`eta`, `note`)를 주문 상태에 업데이트합니다.
  3. **카드 결제 실행 (`charge`)**:
     - `step.do("charge", { retries: { limit: 10, delay: "5 seconds", backoff: "constant" } }, ...)`
     - 80% 확률로 "Card declined" 에러가 고의로 발생되도록 설계되어 있습니다.
     - 최대 10회 재시도(5초 간격)하며, 10회 모두 실패하면 예외를 던져 `rejected`로 이동합니다. 성공 시 결제 완료 시각을 반환합니다.
  4. **단계별 지연 처리 (Sleep)**:
     - `preparing` (10초 대기) ➔ `baking` (10초 대기) ➔ `delivering` (10초 대기) ➔ `delivered` (배달 완료)
  5. **오류 처리 (`catch`)**:
     - 타임아웃, 결제 실패, 거절 등 어떠한 예외 발생 시에도 주문 상태를 `rejected`로 변경하고 실행을 종료합니다.
  6. **완료 리포트**:
     - `step.reportComplete()`를 통해 완료 신호를 전달합니다.

---

### 4.2 `RestaurantAgent` 클래스
`Agent<Env, State>`를 상속받은 Durable Object 실시간 에이전트 클래스입니다.

#### 1) `onWorkflowComplete(workflowName, workflowId, result)`
- 워크플로우가 최종적으로 끝났을 때 호스트 로그를 남깁니다.

#### 2) `@callable() placeOrder()`
- **역할**: 주문자가 새로운 피자 주문을 생성할 때 호출되는 RPC 메서드입니다.
- **동작**:
  1. `this.runWorkflow("PIZZA_WORKFLOW", {})`를 통해 새 워크플로우 인스턴스를 실행하고 생성된 `orderId`를 받습니다.
  2. `this.setState()`를 호출하여 local state에 `pending` 단계의 새 주문을 추가합니다.

#### 3) `getOrders()`
- **역할**: 에이전트가 관리하는 현재 전체 주문 목록(`this.state.orders`)을 반환합니다.

#### 4) `@callable() approveOrder(orderId: string, eta: number, note: string)`
- **역할**: 주방(Owner)에서 특정 주문을 승인할 때 호출됩니다.
- **동작**: `this.approveWorkflow(orderId, { reason, metadata: { eta, note } })`를 호출하여 워크플로우의 `waitForApproval` 대기 상태를 해제합니다.

#### 5) `@callable() rejectOrder(orderId: string)`
- **역할**: 주방(Owner)에서 특정 주문을 거절할 때 호출됩니다.
- **동작**: `this.rejectWorkflow(orderId)`를 호출하여 워크플로우를 거부 처리합니다.

---

### 4.3 HTTP Fetch Handler
```typescript
export default {
  async fetch(request, env) {
    return (
      (await routeAgentRequest(request, env)) ??
      new Response("Not found", { status: 404 })
    );
  },
} satisfies ExportedHandler<Env>;
```
- 클라이언트로부터 들어오는 웹소켓 및 HTTP Agent RPC 요청을 `routeAgentRequest`에 전달하여 적절한 `RestaurantAgent` Durable Object 인스턴스로 라우팅합니다.

---

## 5. 프론트엔드 컴포넌트 명세 (`src/`)

### 5.1 `App.tsx`
- URL 라우팅을 수행합니다.
- `location.pathname.startsWith("/owner")` 여부에 따라 주방 컴포넌트(`<Owner />`) 또는 고객 컴포넌트(`<Eater />`)를 렌더링합니다.

### 5.2 `Eater.tsx` (고객 전용 화면)
- `useAgent({ agent: "RestaurantAgent", query: { role: "eater" }, onStateUpdate: setState })` 훅을 통해 실시간 주문 상태를 업데이트 받습니다.
- **Order Pizza 버튼**: 클릭 시 `agent.stub.placeOrder()`를 호출하여 주문을 생성합니다.
- **주문 리스트 뷰**:
  - `orderId` 및 단계별 상태 배지(`pending`, `awaiting-approval`, `paying`, `preparing` 등) 표시
  - 결제 시도 횟수(`chargeAttempts`), 예상 완료 시간(`etaMinutes`), 주방 메시지(`note`) 실시간 표출

### 5.3 `Owner.tsx` (주방 전용 화면 - `/owner`)
- `useAgent({ agent: "RestaurantAgent", query: { role: "owner" }, onStateUpdate: setState })` 훅 사용
- **Pending 섹션**:
  - `awaiting-approval` 상태의 주문 카드만 필터링하여 노출
  - ETA(분) 입력 필드 및 메모(선택사항) 입력 폼 제공
  - **Approve 버튼**: `agent.stub.approveOrder(orderId, eta, note)` 호출
  - **Reject 버튼**: `agent.stub.rejectOrder(orderId)` 호출
- **All 섹션**: 모든 주문의 최신 상태를 모니터링 리스트로 표출

---

## 6. 테스트 스토리 & 시나리오 (Test Story Scenarios)

### 🎬 시나리오 1: 정상적인 주문 수락 및 배달 완료 흐름 (Happy Path)
1. **[고객]** `http://localhost:5173/` 접속 후 **"Order Pizza"** 버튼 클릭.
2. **[시스템]** 주문 생성 (`stage: "pending"`) ➔ 워크플로우 진입 ➔ 주방 승인 대기 (`stage: "awaiting-approval"`).
3. **[주방]** 별도 탭에서 `http://localhost:5173/owner` 접속 ➔ **Pending** 항목에 새로 들어온 주문 확인.
4. **[주방]** ETA 15분, 메모 "맛있게 만들어 드릴게요" 입력 후 **"Approve"** 클릭.
5. **[시스템]** 워크플로우가 승인 이벤트를 받고 결제 단계로 진입 (`stage: "paying"`).
6. **[시스템]** 결제 시도 (실패 시 무작위 재시도) ➔ 결제 성공 ➔ `preparing` (10초) ➔ `baking` (10초) ➔ `delivering` (10초) 순차 진행.
7. **[고객 & 주방]** 30초 후 실시간 화면에서 주문 상태가 **`✅ delivered`** 로 변경되는 것 확인.

---

### 🎬 시나리오 2: 주방에서 주문을 거절하는 흐름 (Kitchen Rejection)
1. **[고객]** **"Order Pizza"** 버튼 클릭 ➔ 주문 대기 상태 진입 (`stage: "awaiting-approval"`).
2. **[주방]** `/owner` 화면에서 해당 주문 카드의 **"Reject"** 버튼 클릭.
3. **[시스템]** 워크플로우가 거절 이벤트를 수신 ➔ `catch` 블록으로 이동 ➔ 상태를 `stage: "rejected"` 로 업데이트.
4. **[고객 & 주방]** 주문 상태 배지가 **`❌ rejected`** 로 변경됨을 확인.

---

### 🎬 시나리오 3: 카드 결제 연속 실패 시 거절 처리 흐름 (Payment Failures & Retry Limit)
1. **[고객]** **"Order Pizza"** 버튼 클릭.
2. **[주방]** `/owner` 화면에서 **"Approve"** 클릭.
3. **[시스템]** `charge` 단계 진입 (`stage: "paying"`).
4. **[시스템]** 80% 확률로 카드 승인이 거절되며 5초 간격으로 최대 10회까지 재시도함. (고객 화면에 `Attempt 1…`, `Attempt 2…` 실시간 표시).
5. **[시스템]** 만약 10회 연속으로 결제가 모두 실패할 경우, 워크플로우 에러가 발생하여 `stage: "rejected"` 로 변경됨.

---

### 🎬 시나리오 4: 주방 승인 타임아웃 흐름 (Approval Timeout)
1. **[고객]** **"Order Pizza"** 버튼 클릭 ➔ 주문 대기 상태 진입 (`stage: "awaiting-approval"`).
2. **[주방]** 30초 동안 아무런 조치(Approve/Reject)도 취하지 않고 방치.
3. **[시스템]** `waitForApproval`에 설정된 `30 seconds` 타임아웃 만료로 인해 워크플로우가 예외 발생 ➔ `catch` 블록 진입.
4. **[고객 & 주방]** 30초 후 주문 상태가 자동 **`❌ rejected`** 로 변경되는 것을 확인.
