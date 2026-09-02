# Cloudflare AI Chat Module 분석 (my06_aichat)

본 문서는 `my06-aichat` 모듈의 주요 아키텍처와 구현 상세 내역을 분석한 문서입니다. 이 애플리케이션은 Cloudflare Workers의 `AIChatAgent`와 React(Vite) 기반의 프론트엔드를 결합하여 풍부한 Tool Call(함수 호출) 기능을 지원하는 대화형 AI 챗봇입니다.

## 1. 개요 (Architecture Overview)
- **프론트엔드**: React, TailwindCSS, `agents/ai-react` 훅을 사용한 실시간 UI
- **백엔드**: Cloudflare Workers, `@cloudflare/ai-chat`의 `AIChatAgent` 활용
- **AI 모델**: Cloudflare Workers AI Provider를 통한 `glm-4.7-flash` 모델 사용
- **특징**: 클라이언트 사이드 도구 실행, 서버 사이드 도구 실행, 사용자 승인(Approval) 요청 처리, 메시지 필터링(Sanitization)

---

## 2. 모듈별 상세 분석

### 2.1 Backend: AI Agent (`worker/index.ts`)
- **`PotatoChatAgent` 클래스**: `AIChatAgent`를 상속받아 구현되었습니다.
- **스트림 처리**: `streamText` 함수를 사용하여 LLM의 응답을 스트리밍 형태로 클라이언트에 전송합니다.
- **도구(Tools) 바인딩**: `getWeather`, `getLocation`, `getTickets`, `buyPlaneTicket` 4가지 도구를 모델에 제공합니다.
- **메시지 새니타이징 (필터링)**:
  - `sanitizeMessageForPersistence` 메서드를 오버라이드하여, 영구 저장소에 메시지가 저장되기 전에 텍스트를 검사합니다.
  - 사용자가 "food"라는 단어를 입력하면 "❌ stop eating u fat ❌"로 강제 변환하여 저장하는 유머러스한 제약이 포함되어 있습니다.

### 2.2 Tools (도구 정의) (`worker/tools.ts`)
Vercel의 AI SDK (`ai` 패키지)와 `zod`를 활용해 도구를 스키마와 함께 정의했습니다.

1. **`getWeather`**: 도시 이름을 받아 하드코딩된 날씨 문자열을 반환하는 서버 사이드 단순 도구입니다.
2. **`getLocation`**: 입력 스키마가 없는 도구로, **서버가 아닌 클라이언트(브라우저)에서 실행**되도록 설계되었습니다.
3. **`getTickets`**: 출발지와 도착지 공항 코드를 받아 비행기 티켓 목록(가격, 시간 등)의 배열을 반환합니다.
4. **`buyPlaneTicket`**: 
   - 티켓 코드와 가격을 받아 구매 처리를 합니다.
   - **`needsApproval` 조건**: 티켓 가격이 $200를 초과하면 AI가 스스로 결정하지 못하고 **사용자의 명시적 승인을 요청**하도록 로직이 구현되어 있습니다.

### 2.3 Frontend: React UI (`src/App.tsx`)
- **Agent 연결**: `useAgent`와 `useAgentChat` 훅을 통해 `PotatoChatAgent`와 통신합니다.
- **클라이언트 측 도구 실행 (Client-side Tool Execution)**:
  - `onToolCall` 콜백을 통해 AI가 `getLocation` 도구를 호출할 경우, 브라우저의 `navigator.geolocation.getCurrentPosition` API를 사용해 사용자의 실제 위치(위도, 경도)를 받아와서 AI에게 다시 전달합니다.
- **다양한 UI 렌더링**:
  - `part.type === "reasoning"`: AI의 사고 과정(추론)을 회색의 작은 이탤릭체로 렌더링합니다.
  - **Tool Call UI**: 
    - 도구가 실행 중이거나 완료되었을 때 입력(input)과 출력(output) 값을 JSON 형태로 예쁘게 화면에 표시합니다.
    - **승인 대기(approval-requested)**: `buyPlaneTicket` 실행 시 가격이 $200를 초과하여 승인이 필요할 때, 사용자에게 Approve/Reject 버튼을 띄우고 `addToolApprovalResponse`를 호출하여 결정을 서버로 다시 보냅니다.
    - **거절됨(output-denied)**: 사용자가 승인을 거절했을 경우 붉은색 경고 박스로 처리합니다.

### 2.4 의존성 (`package.json`)
- `@cloudflare/ai-chat`, `agents`: Cloudflare의 AI 에이전트 생성 및 연결 SDK
- `ai`, `zod`: Vercel AI SDK 코어 및 타입 스키마 유효성 검사
- `workers-ai-provider`: Cloudflare의 AI 모델(glm-4.7-flash)을 호출하기 위한 어댑터
- `@tailwindcss/vite`, `tailwindcss`: 유틸리티 퍼스트 CSS를 통한 빠른 UI 디자인 구성

---

## 3. 핵심 동작 흐름 정리
1. 사용자가 브라우저에서 채팅을 입력합니다.
2. Cloudflare Worker의 `PotatoChatAgent`가 입력을 받아 모델(`glm-4.7-flash`)에 전달합니다.
3. 모델이 답변을 생성하다가 외부 데이터나 액션이 필요하면 설정된 Tools 중 하나를 호출(Call)합니다.
4. 해당 도구가:
   - 서버 사이드 도구(`getWeather`, `getTickets`)면 즉시 Worker에서 실행 후 결과를 모델에 반환합니다.
   - 클라이언트 사이드 도구(`getLocation`)면 React 앱으로 제어권이 넘어와 브라우저 위치 API를 호출한 후 다시 Worker로 응답을 넘깁니다.
   - 승인 필요 도구(`buyPlaneTicket`, 가격 > 200)면 React 앱에 승인 요청 창을 띄우고 사용자가 승인할 때까지 실행을 대기합니다.
5. 최종적으로 모델이 모든 데이터를 조합하여 사용자에게 텍스트 답변을 렌더링합니다. 텍스트 중 금칙어("food")는 필터링되어 DB에 저장됩니다.

---

## 4. 트러블슈팅 및 변경 내역 (Troubleshooting & Updates)

초기 빌드(`tsc -b && vite build`) 과정에서 발생했던 타입스크립트 및 패키지 호환성 에러를 해결하기 위해 다음과 같은 코드 수정이 진행되었습니다.

### 4.1 패키지 버전 호환성 해결
- **문제**: Vite 환경 빌드 중 `@cloudflare/ai-chat` 내부에서 `agents` 패키지의 특정 함수(`createChatFiberSnapshot` 등)를 찾지 못하는 에러 발생.
- **해결**: `agents` 패키지 버전을 구버전(`^0.12.4`)에서 **`^0.22.0`**으로 업그레이드하여 호환성 문제를 해결했습니다.

### 4.2 Backend (`worker/index.ts`) 타입 및 문법 에러 수정
- **ESM 모듈 해석 확장자 추가**: `NodeNext` 환경 규격에 맞춰 로컬 임포트 경로를 `"./tools"`에서 `"./tools.js"`로 변경했습니다.
- **`Env` 인터페이스 추가**: `this.env.AI` 바인딩을 인식할 수 있도록 누락된 `Env` 타입 선언을 추가했습니다.
- **비동기 라우팅 수정**: `routeAgentRequest`가 Promise를 반환하므로, `fetch` 메서드를 `async`로 변경하고 `await`를 추가하여 정상적으로 응답을 처리하도록 수정했습니다.
- **Optional Chaining 적용**: `options.abortSignal` 참조 시 런타임 에러를 방지하기 위해 `options?.abortSignal`로 수정했습니다.

### 4.3 Frontend (`src/App.tsx`) 임포트 에러 수정
- **문제**: `agents/ai-react` 모듈에 `useAgentChat`이 존재하지 않아 타입 추론(any) 에러가 연쇄적으로 발생.
- **해결**: 최신 SDK 구조에 맞게 `useAgentChat`의 임포트 경로를 **`@cloudflare/ai-chat/react`**로 올바르게 수정하여 연쇄적인 타입 에러들을 완전히 해결했습니다.


이 애플리케이션을 직접 실행해 보고, 구현된 기능들이 정상적으로 동작하는지 확인해 볼 수 있는 **실행 방법과 테스트용 유저 스토리(시나리오)**를 정리해 드립니다!

🚀 1. 앱 실행 방법
터미널에서 아래 명령어를 입력하여 로컬 개발 서버를 실행합니다.

bash
npm run dev
명령어를 실행하면 보통 브라우저에서 http://localhost:5173 (또는 8787)로 접속할 수 있는 주소가 나타납니다. 해당 주소로 접속하면 "🥔 Potato Chat" 화면이 열립니다.

🧪 2. 기능 테스트를 위한 유저 스토리 (User Stories)
채팅창에 아래의 시나리오대로 질문을 입력해 보며, AI가 올바른 도구(Tool)를 호출하는지 확인해 보세요!

📍 유저 스토리 1: 클라이언트 도구(Client-side Tool) 테스트 📍📍📍📍📍📍
목적: AI가 브라우저의 GPS 위치 정보를 정상적으로 가져오는지 확인합니다.

사용자 입력 (예시): "내 현재 위치가 어디야?" 또는 "Where am I right now?"
기대 결과:
AI가 사용자 위치를 파악하기 위해 getLocation 도구를 호출합니다.
웹 브라우저 상단에 "위치 권한 허용" 알림창이 뜹니다. (권한을 '허용'해주세요)
UI에 getLocation 도구 실행 내역(위도/경도 JSON)이 예쁘게 표시됩니다.
AI가 해당 위치 데이터를 기반으로 "당신은 현재 OOO에 있습니다."라고 대답합니다.

🌤️ 유저 스토리 2: 일반 서버 도구(Server-side Tool) 테스트 🌤️🌤️🌤️🌤️
목적: AI가 서버 쪽에 정의된 함수를 백그라운드에서 조용히 실행하고 결과를 가져오는지 확인합니다.

사용자 입력 (예시): "도쿄의 날씨는 어때?"
기대 결과:
AI가 getWeather 도구를 호출합니다 (입력값: {"city": "도쿄"}).
서버에서 정해진 날씨 정보를 반환합니다. (현재 코드상 무조건 sunny로 응답하도록 되어 있습니다)
AI가 "도쿄의 날씨는 맑습니다(sunny)."라고 답변합니다.

✈️ 유저 스토리 3: 사용자 승인(Human-in-the-loop) 도구 테스트✈️✈️✈️✈️✈️✈️
목적: $200 이상의 결제가 발생할 때, AI가 임의로 결제하지 않고 사용자에게 Approve(승인) 버튼을 띄우는지 확인합니다.

사용자 입력 (예시): "인천(ICN)에서 런던(LHR)으로 가는 비행기 티켓 아무거나 하나 바로 구매해 줘."
기대 결과:
먼저 비행기 편을 찾기 위해 getTickets를 호출합니다.
그중 가격이 $200가 넘는 티켓을 골라 buyPlaneTicket 도구를 호출합니다.
가격이 $200가 넘기 때문에 즉시 구매되지 않고, 채팅창 화면에 노란색 박스와 함께 [Approve] / [Reject] 버튼이 나타납니다.
[Reject]를 누를 경우: 붉은색 경고 박스로 상태가 변하며, AI가 "결제가 취소되었습니다."라고 대답합니다.
[Approve]를 누를 경우: 도구 실행이 승인되어 티켓 구매 완료 메시지가 나타납니다.

🍔 유저 스토리 4: 메시지 필터링(Sanitization) 테스트 🍔🍔🍔🍔🍔🍔🍔🍔🍔
목적: 사용자가 특정 단어를 입력했을 때, 서버가 이를 감지하고 강제로 금칙어 텍스트로 치환하는지 확인합니다.

사용자 입력 (예시): "I want to eat some good food!" (반드시 food 라는 단어를 포함)
기대 결과:
사용자가 보낸 채팅 말풍선의 내용이 food 대신 ❌ stop eating u fat ❌로 강제로 바뀌어서 화면에 나타납니다. (예: "I want to eat some good ❌ stop eating u fat ❌!")
AI 역시 변환된 문맥을 바탕으로 대답을 이어갑니다.
지금 바로 npm run dev를 띄워두고 이 네 가지 스토리를 직접 실험해 보세요! 결과가 아주 재밌게 나올 것입니다. 😆


모델 :  
model: workersAi("@cf/zai-org/glm-4.7-flash"),   // 넘길게 나옴
model: workersAi("@cf/meta/llama-3.1-8b-instruct-fast"),  //한글이 좀 이상함
 model: workersAi("@cf/qwen/qwen3.8-27b"), //그나마 젤 나음