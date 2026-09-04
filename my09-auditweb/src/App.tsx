import { useState } from "react";
import { useAgentChat } from "@cloudflare/ai-chat/react";
import { useAgent } from "agents/react";
import { getToolName, isToolUIPart, type UIMessage } from "ai";

interface SeoCheckItem {
  id: string;
  name: string;
  passed: boolean;
  foundValue: string;
  recommendation: string;
}

interface SeoAuditResult {
  url: string;
  score?: number;
  passedCount?: number;
  totalCount?: number;
  checks?: SeoCheckItem[];
  screenshot?: string;
  error?: boolean;
  message?: string;
}

function App() {
  const agent = useAgent({ agent: "SeoAuditAgent" });
  const [activeScreenshot, setActiveScreenshot] = useState<string | null>(null);

  const {
    messages,
    sendMessage,
    clearHistory,
    status,
    stop,
  } = useAgentChat({
    agent,
  });

  const handleSubmit = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const message = formData.get("input") as string;
    if (!message?.trim()) return;
    sendMessage({ text: message });
    e.currentTarget.reset();
  };

  const handleQuickAudit = (url: string) => {
    sendMessage({ text: `${url} 페이지의 SEO 상태를 감사(Audit)해줘.` });
  };

  function renderAuditCard(result: SeoAuditResult) {
    if (result.error) {
      return (
        <div className="my-3 p-4 rounded-xl bg-rose-950/40 border border-rose-800/60 text-rose-200 text-sm">
          <div className="flex items-center gap-2 font-semibold text-rose-400">
            <span>⚠️</span> 웹사이트 방문 실패
          </div>
          <p className="mt-1 text-xs text-rose-300/80">{result.message}</p>
        </div>
      );
    }

    const score = result.score ?? 0;
    const isHigh = score >= 80;
    const isMid = score >= 50 && score < 80;

    const scoreGradient = isHigh
      ? "from-emerald-500 to-teal-400"
      : isMid
      ? "from-amber-500 to-yellow-400"
      : "from-rose-500 to-pink-500";

    const badgeBg = isHigh
      ? "bg-emerald-950/60 border-emerald-500/40 text-emerald-400"
      : isMid
      ? "bg-amber-950/60 border-amber-500/40 text-amber-400"
      : "bg-rose-950/60 border-rose-500/40 text-rose-400";

    return (
      <div className="my-4 rounded-2xl glass-card p-5 border border-slate-700/60 shadow-2xl">
        {/* Header Summary */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-700/60 pb-4">
          <div>
            <span className="text-[11px] font-semibold tracking-wider text-indigo-400 uppercase">
              SEO Audit Report
            </span>
            <h3 className="text-base font-bold text-slate-100 truncate max-w-md mt-0.5">
              {result.url}
            </h3>
          </div>

          <div className="flex items-center gap-3">
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border ${badgeBg}`}>
              <span className={`text-2xl font-black bg-gradient-to-r ${scoreGradient} bg-clip-text text-transparent`}>
                {score}
              </span>
              <span className="text-xs font-semibold">/ 100점</span>
            </div>
            <div className="text-xs text-slate-400 text-right">
              <div className="font-semibold text-slate-200">
                {result.passedCount} / {result.totalCount} 항목 통과
              </div>
              <div className="text-[10px] text-slate-400">항목당 12.5점</div>
            </div>
          </div>
        </div>

        {/* 8 SEO Checks Grid */}
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-2.5">
          {result.checks?.map((check) => (
            <div
              key={check.id}
              className={`p-3 rounded-xl border text-xs transition ${
                check.passed
                  ? "bg-slate-900/60 border-emerald-900/40 hover:border-emerald-700/60"
                  : "bg-rose-950/20 border-rose-900/40 hover:border-rose-700/60"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <span className="font-medium text-slate-200 flex items-center gap-1.5">
                  <span className={check.passed ? "text-emerald-400" : "text-rose-400"}>
                    {check.passed ? "✓" : "✕"}
                  </span>
                  {check.name}
                </span>
                <span
                  className={`shrink-0 px-2 py-0.5 rounded text-[10px] font-semibold ${
                    check.passed
                      ? "bg-emerald-950 text-emerald-400 border border-emerald-800/60"
                      : "bg-rose-950 text-rose-400 border border-rose-800/60"
                  }`}
                >
                  {check.passed ? "PASS" : "FAIL"}
                </span>
              </div>
              <div className="mt-1.5 text-[11px] text-slate-400 font-mono bg-slate-950/60 p-1.5 rounded border border-slate-800/50 truncate">
                {check.foundValue}
              </div>
            </div>
          ))}
        </div>

        {/* Screenshot Preview */}
        {result.screenshot && (
          <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between">
            <span className="text-xs text-slate-400 flex items-center gap-1.5">
              <span>📸</span> 브라우저 렌더링 스크린샷
            </span>
            <button
              type="button"
              onClick={() => setActiveScreenshot(result.screenshot!)}
              className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 transition flex items-center gap-1 bg-indigo-950/60 hover:bg-indigo-900/60 px-3 py-1 rounded-lg border border-indigo-800/50"
            >
              스크린샷 크게 보기 ↗
            </button>
          </div>
        )}
      </div>
    );
  }

  function renderMessage(msg: UIMessage) {
    return msg.parts.map((part, i) => {
      if (part.type === "text") {
        return (
          <div key={i} className="whitespace-pre-wrap leading-relaxed text-sm">
            {part.text}
          </div>
        );
      }

      if (isToolUIPart(part)) {
        if (part.state === "output-available") {
          const output = part.output as SeoAuditResult;
          if (output && typeof output === "object" && "checks" in output) {
            return <div key={i}>{renderAuditCard(output)}</div>;
          }
        }

        return (
          <div
            key={i}
            className="my-2 inline-flex items-center gap-2 text-xs font-mono bg-indigo-950/40 text-indigo-300 px-3 py-1.5 rounded-lg border border-indigo-800/40 shadow-sm"
          >
            <span className="animate-spin text-indigo-400">🌐</span>
            <span>[{getToolName(part)}] 실행 중... (Puppeteer 브라우저 렌더링)</span>
          </div>
        );
      }
      return null;
    });
  }

  const isWorking = status === "streaming" || status === "submitted";

  return (
    <div className="flex min-h-screen flex-col bg-[#090d16] text-slate-100 selection:bg-indigo-500 selection:text-white">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-slate-800/80 glass-panel">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-4 py-3.5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 shadow-lg shadow-indigo-500/20">
              <span className="text-xl">🔍</span>
            </div>
            <div>
              <h1 className="text-base font-bold tracking-tight text-white flex items-center gap-2">
                SEO Audit Agent
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-indigo-950 text-indigo-300 border border-indigo-800/60">
                  qwen3.8-27b
                </span>
              </h1>
              <p className="text-xs text-slate-400">
                실제 브라우저(Puppeteer) 연동 AI 웹 SEO 감사 에이전트
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Status indicator */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900/80 border border-slate-800 text-xs text-slate-300">
              <span
                className={`h-2 w-2 rounded-full ${
                  isWorking
                    ? "bg-amber-400 animate-ping"
                    : "bg-emerald-400 shadow-sm shadow-emerald-400"
                }`}
              />
              <span className="font-mono text-[11px]">{status}</span>
            </div>

            <button
              onClick={clearHistory}
              title="대화 기록 초기화"
              className="rounded-lg px-3 py-1.5 text-xs text-slate-400 transition hover:bg-slate-800 hover:text-slate-200 border border-slate-800"
            >
              Clear
            </button>

            {isWorking && (
              <button
                onClick={stop}
                className="rounded-lg px-3 py-1.5 text-xs font-semibold text-rose-400 transition hover:bg-rose-950/60 border border-rose-900/60"
              >
                Stop
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Chat Area */}
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col px-4 py-6 pb-32">
        {/* Quick Presets */}
        {messages.length === 0 && (
          <div className="my-auto flex flex-col items-center justify-center text-center py-12">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-950/60 border border-indigo-800/50 text-3xl mb-4 shadow-xl shadow-indigo-500/10">
              🌐
            </div>
            <h2 className="text-xl font-bold text-slate-100">
              웹사이트 URL을 입력하여 SEO 감사를 시작하세요
            </h2>
            <p className="mt-2 max-w-md text-sm text-slate-400 leading-relaxed">
              에이전트가 Puppeteer 브라우저로 페이지를 정밀 방문하여 타이틀, Meta 태그, Open Graph, Canonical, 반응형 Viewport 등 8개 핵심 SEO 항목을 검사합니다.
            </p>

            <div className="mt-8 flex flex-wrap items-center justify-center gap-2 max-w-lg">
              <span className="text-xs text-slate-500 w-full mb-1">
                빠른 테스트용 샘플 사이트:
              </span>
              {[
                { name: "Nomad Coders", url: "https://nomadcoders.co/" },
                { name: "Cloudflare", url: "https://cloudflare.com" },
                { name: "Example.com", url: "https://example.com" },
              ].map((site) => (
                <button
                  key={site.url}
                  onClick={() => handleQuickAudit(site.url)}
                  className="px-3.5 py-2 rounded-xl glass-card hover:bg-indigo-950/60 hover:border-indigo-500/50 text-xs font-medium text-slate-300 hover:text-indigo-200 transition shadow-sm"
                >
                  🔍 {site.name} 감사하기
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Message Stream */}
        <div className="space-y-6">
          {messages.map((message) => {
            const isUser = message.role === "user";
            return (
              <div
                key={message.id}
                className={`flex ${isUser ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[90%] md:max-w-[85%] rounded-2xl px-5 py-3.5 ${
                    isUser
                      ? "bg-gradient-to-r from-indigo-600 to-indigo-700 text-white shadow-lg shadow-indigo-600/20"
                      : "glass-card text-slate-100 shadow-lg"
                  }`}
                >
                  {!isUser && (
                    <div className="flex items-center gap-2 mb-2 text-xs font-semibold text-indigo-400 border-b border-slate-800/80 pb-2">
                      <span>🤖 SEO Audit Agent</span>
                    </div>
                  )}
                  {renderMessage(message)}
                </div>
              </div>
            );
          })}
        </div>
      </main>

      {/* Input Bar */}
      <footer className="fixed bottom-0 left-0 right-0 z-20 border-t border-slate-800/80 glass-panel p-4">
        <div className="mx-auto max-w-4xl">
          <form onSubmit={handleSubmit} className="flex items-center gap-3">
            <div className="relative flex-1">
              <input
                name="input"
                defaultValue="https://nomadcoders.co/"
                placeholder="검사할 웹사이트 URL 입력 (예: https://example.com)"
                autoComplete="off"
                disabled={isWorking}
                className="w-full rounded-xl border border-slate-700/80 bg-slate-900/90 px-4 py-3.5 text-sm text-slate-100 placeholder-slate-500 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-50"
              />
            </div>
            <button
              type="submit"
              disabled={isWorking}
              className="rounded-xl bg-gradient-to-r from-indigo-500 via-indigo-600 to-purple-600 px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 transition hover:brightness-110 active:scale-95 disabled:opacity-50"
            >
              {isWorking ? "감사 진행 중..." : "SEO 감사 시작"}
            </button>
          </form>
        </div>
      </footer>

      {/* Screenshot Modal */}
      {activeScreenshot && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
          <div className="relative max-w-4xl w-full glass-panel rounded-2xl overflow-hidden border border-slate-700 shadow-2xl">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-900/80">
              <h4 className="text-sm font-bold text-slate-200">
                📸 브라우저 렌더링 캡처 스크린샷
              </h4>
              <button
                onClick={() => setActiveScreenshot(null)}
                className="text-slate-400 hover:text-white text-sm font-bold px-2 py-1 rounded-lg hover:bg-slate-800"
              >
                닫기 ✕
              </button>
            </div>
            <div className="p-4 max-h-[80vh] overflow-auto custom-scrollbar flex justify-center bg-slate-950">
              <img
                src={activeScreenshot}
                alt="Audit Page Screenshot"
                className="rounded-lg border border-slate-800 shadow-xl max-w-full"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
