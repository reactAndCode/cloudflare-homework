# my09-auditweb 구축 작업 계획

- [x] **Phase 1: 프로젝트 기초 및 설정 파일 생성** <!-- id: 0 -->
  - [x] `my09-auditweb` 폴더 구조 및 `package.json` 작성 (`@cloudflare/puppeteer`, `@cloudflare/ai-chat`, `agents`, `ai` 등) <!-- id: 1 -->
  - [x] `wrangler.jsonc` 작성 (Browser Rendering binding `BROWSER`, AI, Durable Object `SeoAuditAgent`, SQLite migration) <!-- id: 2 -->
  - [x] TypeScript & Vite 설정 파일 작성 (`vite.config.ts`, `tsconfig.json`, `index.html` 등) <!-- id: 3 -->

- [x] **Phase 2: Cloudflare Worker 백엔드 & auditSeo 도구 구현** <!-- id: 4 -->
  - [x] `worker/tools.ts` 작성: `auditSeo(url)` 도구 구현 (8개 SEO 요소 평가 & 스크린샷 캡처 & 점수 계산) <!-- id: 5 -->
  - [x] `worker/index.ts` 작성: `SeoAuditAgent` (Durable Object) 및 `@cf/qwen/qwen3.8-27b` 모델 연동 <!-- id: 6 -->

- [x] **Phase 3: Frontend UI 구현 (React + TailwindCSS)** <!-- id: 7 -->
  - [x] `src/index.css` & `src/main.tsx` 작성 (디자인 시스템 & Tailwind v4) <!-- id: 8 -->
  - [x] `src/App.tsx` 작성 (SEO 감사 전용 AI 인터페이스, 스크린샷 뷰어, 리포트 시각화 등) <!-- id: 9 -->

- [x] **Phase 4: 검증 및 최종 점검** <!-- id: 10 -->
  - [x] 타입 체크 및 빌드 검증 (`npm run build` 및 `wrangler types` 통과) <!-- id: 11 -->
  - [x] 완성 결과 검토 및 사용자 요약 작성 <!-- id: 12 -->
