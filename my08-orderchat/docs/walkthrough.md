# 음식 주문 컨시어지 (my08-orderchat) Walkthrough

`my08-orderchat` 음식 주문 컨시어지 봇의 구축이 성공적으로 완료되었습니다! 🚀
기존 `my06-aichat`을 바탕으로 에이전트 도구, 프롬프트, 그리고 보안 기능이 완벽하게 커스텀되었습니다.

## 🛠 주요 구현 내역

### 1. 주문 에이전트 클래스 생성
- **파일:** `worker/index.ts`
- 기존 `PotatoChatAgent`를 **`OrderConciergeAgent`**로 개편했습니다.
- 클래스 내부에 `this.cart` 배열을 상태로 들고 있게 하여, 장바구니에 아이템을 누적하여 담을 수 있게 만들었습니다.
- 시스템 프롬프트(System Prompt)에 **음식 주문 비서**로서의 역할을 꼼꼼하게 부여했습니다.

### 2. 주문/조회 도구(Tools) 연동
- **파일:** `worker/tools.ts`
- Zod 스키마를 사용하여 에이전트가 호출할 4가지 핵심 도구를 만들었습니다.
  - `getMenu`: 피자, 라지 페퍼로니, 타코, 비빔밥 등의 메뉴를 반환합니다.
  - `addToCart`: 장바구니(`cart` 상태 배열)에 요리를 추가합니다.
  - `viewCart`: 현재 장바구니에 담긴 목록과 총액을 계산해 줍니다.
  - `placeOrder`: 결제를 진행합니다. `needsApproval: () => true`로 설정되어 항상 승인을 받아야만 결제할 수 있습니다.

### 3. 클라이언트 기능 연동 및 UI 수정
- **파일:** `src/App.tsx`
- **위치 조회 (`getLocation`)**: 서버가 아닌 브라우저 내장 GPS API(`navigator.geolocation`)를 사용하여 위치를 가져옵니다. 
- **앱 UI 변경**: 타이틀을 "🍔 주문 컨시어지 챗"으로 변경하고 `OrderConciergeAgent`에 맞게 연결했습니다.

### 4. 보안 (카드 번호 필터링)
- **파일:** `worker/index.ts`
- `sanitizeMessageForPersistence` 메서드를 사용하여 대화를 데이터베이스(SQLite)에 저장하기 직전, `1234-5678-1234-5678` 같은 14~16자리 가상 카드번호 패턴이 감지되면 자동으로 `****-****-****-****`로 마스킹 처리되게 했습니다.

## ✅ 빌드 검증 결과
- TypeScript 컴파일과 Vite 빌드(`npm install && npm run build`)가 아무런 에러(0 vulnerabilities, 0 errors) 없이 1초 만에 깔끔하게 성공했습니다!

## 🚀 어떻게 실행하나요?
새로 만들어진 `my08-orderchat` 디렉토리로 이동하여 개발 서버를 실행해 보세요!
```bash
cd c:\work\mydev\cloudflare\my08-orderchat
npm run dev
```

브라우저에서 `http://localhost:5173/`을 열고 아래와 같이 채팅을 시도해보세요:
> **User**: 라지 페퍼로니 하나 주문할게요.
> **Claw**: [getMenu] [addToCart("라지 페퍼로니")] 담았습니다! 어디로 보내드릴까요?
> **User**: 내 위치 주변 매장으로요.
> **Claw**: [getLocation] (권한 팝업) 총액은 23,000원입니다. 주문할까요? [Approve]
> **User**: 내 카드번호는 1111-2222-3333-4444 야. (새로고침 시 SQLite에서 마스킹 확인)
