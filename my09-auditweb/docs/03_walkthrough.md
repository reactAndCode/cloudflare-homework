# [Walkthrough] my09-auditweb SEO 웹 감사 에이전트

`my08-orderchat` 구조를 바탕으로 헤드리스 브라우저(Puppeteer) 연동 및 Qwen 3.8 27B 모델 기반의 **실시간 SEO 웹 감사 AI 에이전트 (`my09-auditweb`)** 생성을 완료하였습니다.

---

## 🛠️ 생성된 주요 구조 및 파일

```
my09-auditweb/
├── package.json               # dependencies (@cloudflare/puppeteer, @cloudflare/ai-chat, agents, ai, workers-ai-provider)
├── wrangler.jsonc             # BROWSER binding, AI binding, SeoAuditAgent (Durable Object) 설정
├── worker-configuration.d.ts  # Cloudflare 바인딩 자동 생성 타입
├── worker/
│   ├── index.ts               # SeoAuditAgent (Durable Object) & @cf/qwen/qwen3.8-27b 연동
│   └── tools.ts               # auditSeo(url) 도구 구현 (Puppeteer 8개 검사 & 스크린샷 & 100점 만점 계산)
└── src/
    ├── index.css              # Glassmorphism & 다크 테마 디자인 시스템 (Tailwind v4)
    ├── main.tsx               # Entry point
    └── App.tsx                # SEO 감사 전용 대시보드 UI (점수 뱃지, 체크리스트, 스크린샷 모달)
```

---

## 🔍 auditSeo 도구 8가지 검사 항목

`puppeteer.launch(env.BROWSER)`로 실제 웹페이지를 렌더링한 후 DOM을 정밀 분석합니다. (항목당 12.5점, 100점 만점)

1. **`<title>` 태그**: 존재 유무 및 길이 (10~60자)
2. **`<meta name="description">`**: 존재 유무 및 길이 (50~160자)
3. **`<h1>` 태그**: 정확히 1개 존재하는가
4. **`<img>` 태그**: 모든 이미지의 `alt` 속성 존재 유무
5. **Open Graph 태그**: `<meta property="og:title">`과 `<meta property="og:image">` 모두 존재
6. **Canonical 링크**: `<link rel="canonical">` 지정 존재 유무
7. **Viewport 메타 태그**: `<meta name="viewport">` 반응형 속성 존재 유무
8. **HTML 언어 속성**: `<html>` 태그 `lang` 속성 존재 유무

---

## 🎨 UI 및 기능 특징

- **실시간 스크린샷 미리보기**: Puppeteer가 찍은 페이지 캡처 이미지를 렌더링 카드 및 팝업 모달로 확대 가능.
- **점수 시각화**: 통과 점수에 따라 Emerald(80+), Amber(50~79), Rose(<50) 그라데이션 뱃지 표시.
- **샘플 사이트 칩 (Quick Presets)**: 클릭 한 번으로 Cloudflare, Wikipedia 등의 SEO를 즉시 테스트 가능.
- **LLM 리포트 제시**: Qwen3.8-27b 모델이 점수 요약, 실패 원인 분석, 조치 가이드(HTML 코드 예시)를 제시.

---

## 🏃 실행 명령어

```bash
# 로컬 개발 서버 실행
npm run dev

# 프로덕션 빌드 (완료 검증됨)
npm run build
```
