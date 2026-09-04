# 03. my09-browserUpgrade 개발 및 실행 가이드 (Walkthrough)

본 가이드는 `my09-browserUpgrade` 프로젝트를 로컬 개발 및 클라우드플레어 환경에서 검증하고 구동하는 종합 매뉴얼입니다.

---

## 🚀 1. 실행 및 배포 명령어

### 타입 생성 및 빌드 검증
```bash
cd d:\dev\cloudflare\cloudflare-homework\my09-browserUpgrade
npm run cf-typegen
npm run build
```

### 로컬 개발 서버 구동
```bash
npm run dev
```
- 로컬 URL: `http://localhost:5173/`

### Cloudflare Workers 라이브 배포
```bash
npm run deploy
```
- 라이브 서비스 URL: `https://my09-browser-upgrade.3484.workers.dev`

---

## 🧪 2. 자율 웹 탐색 테스트 시나리오

1. **시나리오 1: `webFetch`로 고속 가격 추출**
   - 질문 예시: `webFetch()로 https://nomadcoders.co/react-masterclass 페이지를 직접 fetch해서 마크다운 텍스트를 읽고 결제 가격 및 수강 혜택을 알려줘.`
   - 동작 방식: 브라우저 렌더링 없이 즉시 HTTP fetch로 `[평생 수강권 결제하기](url)` 및 `월 20,000원` 텍스트를 추출해 1초 만에 응답.

2. **시나리오 2: `readPage` & `followLink` 자율 탐색 및 스크린샷 기록**
   - 질문 예시: `nomadcoders.co 사이트에서 가장 저렴한 강의는 얼마인지 탐색해서 알려줘.`
   - 동작 방식:
     - Step 1: `readPage()`로 시작 페이지 읽기 및 링크 분석.
     - Step 2: `followLink()`로 코스 목록 또는 상세 페이지로 이동하며 스크린샷(`/evidence/<key>`) 저장.
     - Step 3: 수집된 텍스트 및 가격 비교 후 **[최종 정답]**과 증거 타임라인 제시.

3. **라이브 뷰 및 세션 관리**:
   - 우측 패널 **🔴 Live View** 탭에서 1.5초 간격으로 에이전트 Chrome 화면 렌더링 확인.
   - 우측 패널 **📸 Evidence Gallery** 탭에서 Step별 캡처 이미지 확인.
   - 필요 시 상단 **`🔒 Close Browser`** 버튼으로 브라우저 세션 즉시 닫기.
