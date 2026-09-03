클라우드플레어 듀라블오브젝트 ai agent sdk와 react typescript를 사용해줘

음식 주문 컨시어지(비서)를 만들어줘. 
폴더는 my08-orderchat 만들고 그아래로 프로젝트 관련 파일을을 만들어줘
기존에 몇번 했던 my06-aichat 참고해도 돼

메뉴를 읽고, 장바구니를 채우고, 지금 어디에 있는지 알아내고, 총액을 승인받은 뒤에야 주문을 넣는 에이전트입니다.

메뉴는 마음대로 정하세요(피자, 타코, 비빔밥). Worker 안에 직접 적어두면 됩니다.

도구 네 가지를 연결하세요:

서버 도구 — getMenu(), addToCart(item), viewCart(). 각각 tool()과 Zod inputSchema로 정의합니다. 
에이전트 루프가 이들을 이어서 호출합니다(stopWhen: isLoopFinished()).

클라이언트 도구 — getLocation()은 브라우저에서 실행됩니다(서버 execute가 없음). 
사용자의 좌표를 반환해서 에이전트가 가까운 매장을 고르거나 배달 주소를 정할 수 있게 합니다.

승인 도구 — placeOrder()는 실행 전 승인이 필요합니다. 
장바구니 총액을 보여주고, 사용자가 Approve를 누를 때까지 "결제"를 기다립니다.

저장 시 정제 — sanitizeMessageForPersistence로 카드 번호처럼 생긴 문자열을 메시지 저장 전에 가립니다. 
대화 기록이 정보 유출 통로가 되지 않게 합니다.      

아래처럼 샘플 텍스트형태로 진행하도록 해줘

User: 라지 페퍼로니 하나 주문할게요.
Claw: [getMenu] [addToCart("라지 페퍼로니")] 담았습니다! 어디로 보내드릴까요?
Claw: [getLocation] 확인했습니다. 가장 가까운 매장이 2km 거리에 있네요.
Claw: 총액은 18,000원입니다. 주문할까요? [Approve] [Reject]
User: [Approve]
Claw: [placeOrder] 주문이 확정되었습니다! 🍕

///////////////////////////////////////////////////
Food-Ordering Concierge
오늘의 강의: 모두를 위한 OpenClaw: From #4.4 to #4.7
오늘의 과제: 아래 두 개의 과제를 각 지시사항에 따라 수행합니다.
제출기간:
과제 1. 익일 오전 6시까지
과제 2. 3일(72시간!). 목요일 오전 6시까지
과제1.
말만 하는 챗봇은 재미가 없습니다. 에이전트에게 도구를 주어 실제로 일을 시켜봅시다. 음식 주문 컨시어지(비서)를 만드세요. 메뉴를 읽고, 장바구니를 채우고, 지금 어디에 있는지 알아내고, 총액을 승인받은 뒤에야 주문을 넣는 에이전트입니다.
메뉴는 마음대로 정하세요(피자, 타코, 비빔밥). Worker 안에 직접 적어두면 됩니다.
도구 강의에서 배운 네 가지를 연결하세요:
서버 도구 — getMenu(), addToCart(item), viewCart(). 각각 tool()과 Zod inputSchema로 정의합니다. 에이전트 루프가 이들을 이어서 호출합니다(stopWhen: isLoopFinished()).
클라이언트 도구 — getLocation()은 브라우저에서 실행됩니다(서버 execute가 없음). 사용자의 좌표를 반환해서 에이전트가 가까운 매장을 고르거나 배달 주소를 정할 수 있게 합니다.
승인 도구 — placeOrder()는 실행 전 승인이 필요합니다. 장바구니 총액을 보여주고, 사용자가 Approve를 누를 때까지 "결제"를 기다립니다.
저장 시 정제 — sanitizeMessageForPersistence로 카드 번호처럼 생긴 문자열을 메시지 저장 전에 가립니다. 대화 기록이 정보 유출 통로가 되지 않게 합니다.
요구사항
Zod inputSchema를 갖춘 서버 도구 3개 이상 (getMenu, addToCart, viewCart)
서버 execute가 없고 브라우저에서 해결되는 클라이언트 도구 1개 (getLocation)
승인 뒤에서 대기하는 placeOrder() — 사용자가 승인하기 전에는 실행될 수 없습니다.
sanitizeMessageForPersistence가 저장 전에 카드 번호 형태의 문자열을 가립니다.
에이전트 루프가 끝날 때까지 도구를 실행합니다 (stopWhen: isLoopFinished()).
예시 상호작용
User: 라지 페퍼로니 하나 주문할게요.
Claw: [getMenu] [addToCart("라지 페퍼로니")] 담았습니다! 어디로 보내드릴까요?
Claw: [getLocation] 확인했습니다. 가장 가까운 매장이 2km 거리에 있네요.
Claw: 총액은 18,000원입니다. 주문할까요? [Approve] [Reject]
User: [Approve]
Claw: [placeOrder] 주문이 확정되었습니다! 🍕
테스트 방법
메뉴를 하나 주문하고, 에이전트가 getMenu → addToCart를 이어서 호출하는지 확인합니다.
getLocation이 실행될 때 브라우저가 위치 권한을 요청합니다.
승인을 누르기 전까지 placeOrder가 실행되지 않습니다.
가짜 카드 번호를 붙여넣고 새로고침하면, 기록에 [REDACTED]로 남아 있습니다.

/////////////////////////////////////////////////////