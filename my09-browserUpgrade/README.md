# my09-browserUpgrade (Autonomous Web Browsing AI Agent)

Cloudflare Workers, Durable Objects, Vercel AI SDK, Workers AI 및 4대 전용 도구를 활용한 자율 웹 탐색 AI 에이전트 시스템입니다.

## 🚀 Live Demo
- **배포 URL**: [https://my09-browser-upgrade.3484.workers.dev](https://my09-browser-upgrade.3484.workers.dev)

## 🛠️ Tech Stack & Features
- **Frontend**: React 19, TailwindCSS 4, Vite 8, `@cloudflare/ai-chat/react`, `agents/react`
- **Backend**: Cloudflare Workers, Durable Objects (`BrowserAgent`), `@cloudflare/ai-chat`
- **AI Models**: `@cf/zai-org/glm-4.7-flash` (Primary), `@cf/qwen/qwen3.8-27b` (Fallback)
- **4대 전용 도구 체계**:
  1. ⚡ `webFetch({ url })`: HTML 렌더링 없는 초고속 마크다운/텍스트 추출 및 가격 조회
  2. 📖 `readPage({ url? })`: Headless Chrome 세션 상의 DOM 텍스트 및 링크 수집
  3. 🔗 `followLink({ href })`: 원하는 링크 이동 및 스크린샷 증거 기록 (`/evidence/<key>`)
  4. 📸 `screenshot()`: 요청 시 현재 페이지 캡처
- **Observability (실시간 관측)**:
  - 🔴 **Live View**: 1.5초 간격 Agent Chrome Window 스트림
  - 📸 **Evidence Gallery**: Step별 수집된 증거 스크린샷 타임라인

## 📄 Documentation
상세 설계 및 실행 로직은 `docs/` 폴더 내 문서에서 확인할 수 있습니다.
- [01_implementation_plan.md](./docs/01_implementation_plan.md)
- [02_task.md](./docs/02_task.md)
- [03_walkthrough.md](./docs/03_walkthrough.md)
- [05_로직설명.md](./docs/05_로직설명.md)

## 💻 Commands
```bash
# 개발 서버 구동
npm run dev

# 타입 생성 및 빌드
npm run cf-typegen && npm run build

# Cloudflare Workers 라이브 배포
npm run deploy
```
