import { useState, useEffect } from "react";
import { useAgentChat } from "@cloudflare/ai-chat/react";
import { useAgent } from "agents/react";
import { getToolName, isToolUIPart, type UIMessage } from "ai";

const AGENT_OPTIONS = { agent: "BrowserAgent" } as const;

// 추천 예시 질문 목록 (webFetch & readPage 툴 선택형)
const PRESET_QUESTIONS = [
  {
    label: "⚡ webFetch로 빠른 가격 검색",
    prompt: "webFetch()로 https://nomadcoders.co/react-masterclass 페이지를 직접 fetch해서 마크다운 텍스트를 읽고 평생 수강권/할부 가격과 혜택을 알려줘.",
  },
  {
    label: "📖 readPage로 브율 탐색 (가장 저렴한 강의)",
    prompt: "readPage()와 followLink()를 사용해 https://nomadcoders.co 사이트에 접속 후 가장 저렴한 강의 가격과 강의명을 탐색해서 알려줘.",
  },
  {
    label: "🌐 툴 자유 선택 (사이드프로젝트 최신글)",
    prompt: "webFetch() 또는 readPage() 중 원하는 툴을 선택해 https://nomadcoders.co 사이트 커뮤니티의 최신 게시글 제목과 작성자를 알려줘.",
  },
];

function App() {
  const agent = useAgent(AGENT_OPTIONS);
  const [activeRightTab, setActiveRightTab] = useState<"live" | "evidence">("live");
  const [liveImageTimestamp, setLiveImageTimestamp] = useState<number>(Date.now());

  const {
    messages,
    sendMessage,
    clearHistory,
    status,
    stop,
    addToolApprovalResponse,
  } = useAgentChat({ agent });

  // Live View 1.5초마다 갱신 처리
  useEffect(() => {
    const interval = setInterval(() => {
      setLiveImageTimestamp(Date.now());
    }, 1500);
    return () => clearInterval(interval);
  }, []);

  const handleSubmit = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const message = formData.get("input") as string;
    if (!message?.trim()) return;

    sendMessage({ text: message });
    e.currentTarget.reset();
  };

  const handlePresetClick = (promptText: string) => {
    sendMessage({ text: promptText });
  };

  const handleCloseBrowser = () => {
    sendMessage({ text: "현재 열려있는 브라우저 세션을 종료해줘" });
  };

  // 메시지에서 모든 증거 스크린샷 (/evidence/<key>) 추출
  const collectedEvidences: { key: string; url: string; step: number }[] = [];
  let stepCounter = 1;
  messages.forEach((msg: UIMessage) => {
    msg.parts.forEach((part: any) => {
      if (isToolUIPart(part) && part.state === "output-available" && part.output) {
        const out = part.output as any;
        if (out?.evidenceUrl) {
          collectedEvidences.push({
            key: out.evidenceKey || `step-${stepCounter}`,
            url: out.evidenceUrl,
            step: stepCounter++,
          });
        }
      }
    });
  });

  function renderMessage(msg: UIMessage) {
    return msg.parts.map((part: any, i: number) => {
      if (part.type === "text") {
        return (
          <p key={i} className="whitespace-pre-wrap leading-relaxed text-sm">
            {part.text}
          </p>
        );
      }

      if (part.type === "reasoning") {
        return (
          <div key={i} className="my-1 rounded border border-indigo-100 bg-indigo-50/60 p-2 text-xs text-indigo-800">
            <span className="font-semibold">🧠 추론 (Thinking):</span> {part.text}
          </div>
        );
      }

      if (isToolUIPart(part)) {
        const toolName = getToolName(part);

        if ("approval" in part && part.state === "approval-requested") {
          return (
            <div key={i} className="my-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 shadow-xs">
              <div className="flex items-center gap-1.5 font-semibold">
                <span>⚠️ 도구 실행 승인 요청:</span>
                <code className="rounded bg-amber-200/70 px-1.5 py-0.5 font-mono text-[11px]">{toolName}</code>
              </div>
              {"input" in part && part.input != null && (
                <pre className="mt-2 max-h-32 overflow-x-auto rounded bg-amber-100/60 p-2 font-mono text-[11px]">
                  {JSON.stringify(part.input, null, 2)}
                </pre>
              )}
              <div className="mt-2.5 flex gap-2">
                <button
                  className="rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white shadow-xs hover:bg-emerald-700 cursor-pointer"
                  onClick={() => addToolApprovalResponse({ id: part.approval.id, approved: true })}
                >
                  승인 (Approve)
                </button>
                <button
                  className="rounded-md bg-rose-600 px-2.5 py-1 text-xs font-medium text-white shadow-xs hover:bg-rose-700 cursor-pointer"
                  onClick={() => addToolApprovalResponse({ id: part.approval.id, approved: false })}
                >
                  거절 (Reject)
                </button>
              </div>
            </div>
          );
        }

        const output = part.output as any;

        return (
          <div key={i} className="my-2 rounded-lg border border-slate-200 bg-slate-50/80 p-2.5 text-xs shadow-2xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="rounded bg-slate-900 px-2 py-0.5 font-mono text-[11px] font-semibold text-white">
                  {toolName}
                </span>
                <span className="text-slate-500 font-medium">{part.state}</span>
              </div>
            </div>

            {"input" in part && part.input != null && (
              <pre className="mt-1.5 max-h-28 overflow-x-auto rounded bg-white p-2 font-mono text-[11px] text-slate-600 border border-slate-200">
                {JSON.stringify(part.input, null, 2)}
              </pre>
            )}

            {part.state === "output-available" && output && (
              <div className="mt-2">
                <pre className="max-h-36 overflow-x-auto rounded bg-slate-900 p-2 font-mono text-[11px] text-slate-200">
                  {JSON.stringify(output, null, 2)}
                </pre>
                {output.evidenceUrl && (
                  <div className="mt-2 rounded border border-slate-200 overflow-hidden bg-black/5">
                    <div className="bg-slate-100 px-2 py-1 text-[10px] text-slate-500 font-mono flex items-center justify-between border-b border-slate-200">
                      <span>📸 증거 스크린샷: {output.evidenceUrl}</span>
                      <a href={output.evidenceUrl} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline">원본보기 ↗</a>
                    </div>
                    <img src={output.evidenceUrl} alt="Step Evidence" className="w-full h-auto object-cover max-h-60" />
                  </div>
                )}
              </div>
            )}
          </div>
        );
      }
      return null;
    });
  }

  return (
    <div className="flex h-screen flex-col bg-slate-100 font-sans text-slate-900">
      {/* 상단 네비게이션 헤더 */}
      <header className="shrink-0 border-b border-slate-200 bg-white px-4 py-2.5">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white font-bold text-base shadow-sm">
              🌐
            </div>
            <div>
              <h1 className="text-sm font-bold text-slate-900 tracking-tight">
                Autonomous Agent (webFetch & readPage 툴 선택 가능)
              </h1>
              <p className="text-[10px] text-slate-500">⚡ webFetch() • 📖 readPage() • 🔗 followLink() • 📸 screenshot()</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-1 max-w-xl gap-2">
            <input
              name="input"
              placeholder="질문 입력 (예: readPage로 nomadcoders.co 에서 가장 저렴한 강의 찾아줘)"
              autoComplete="off"
              className="flex-1 rounded-full border border-slate-200 bg-slate-50 px-4 py-1.5 text-xs outline-none focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-100 transition"
            />
            <button
              type="submit"
              className="rounded-full bg-indigo-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 transition cursor-pointer shadow-xs"
            >
              탐색 시작
            </button>
          </form>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={handleCloseBrowser}
              className="flex items-center gap-1 rounded-md bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 border border-amber-200 hover:bg-amber-100 transition cursor-pointer"
            >
              <span>🔒 Close Browser</span>
            </button>
            <button
              onClick={() => clearHistory()}
              className="rounded-md px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 transition cursor-pointer"
            >
              🧹 Clear
            </button>
            <button
              onClick={() => stop()}
              className="rounded-md px-2 py-1 text-xs text-rose-600 hover:bg-rose-50 transition cursor-pointer"
            >
              🛑 Stop
            </button>
            <span className="text-[11px] font-mono text-slate-400 border-l border-slate-200 pl-2">
              {status}
            </span>
          </div>
        </div>
      </header>

      {/* 메인 2열 분할 레이아웃 */}
      <div className="flex flex-1 overflow-hidden max-w-7xl w-full mx-auto p-3 gap-3">
        {/* 왼쪽 1열: 챗 메시지 및 자율 탐색 대화 패널 */}
        <div className="flex flex-1 flex-col rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden">
          {/* 퀴즈 예시 프롬프트 칩 */}
          <div className="border-b border-slate-100 bg-slate-50/60 p-2.5">
            <div className="mb-1.5 text-[11px] font-semibold text-slate-700 flex items-center gap-1">
              <span>⚡ 추천 질문 예시 (webFetch & readPage 선택 탐색):</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {PRESET_QUESTIONS.map((item, idx) => (
                <button
                  key={idx}
                  onClick={() => handlePresetClick(item.prompt)}
                  className="rounded-md bg-white px-2.5 py-1 text-[11px] font-medium text-indigo-700 border border-indigo-100 hover:bg-indigo-600 hover:text-white transition cursor-pointer shadow-2xs"
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {/* 대화 메시지 영역 */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {messages.length === 0 && (
              <div className="flex h-full min-h-[350px] flex-col items-center justify-center text-center text-slate-400">
                <div className="text-3xl mb-1.5">🌐</div>
                <p className="text-xs font-medium">webFetch() 또는 readPage()를 선택하여 탐색을 요청해 보세요.</p>
                <p className="text-[11px] text-slate-400 mt-1">
                  질문 내용에 따라 AI 모델이 두 도구 중 가장 적합한 도구를 자유롭게 선택하여 자율 탐색합니다.
                </p>
              </div>
            )}

            {messages.map((message: UIMessage) => {
              const isUser = message.role === "user";
              return (
                <div key={message.id} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[92%] rounded-xl px-3.5 py-2.5 ${
                      isUser
                        ? "bg-slate-900 text-white"
                        : "border border-slate-200 bg-slate-50/60 text-slate-900 shadow-2xs"
                    }`}
                  >
                    {renderMessage(message)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 오른쪽 2열: Live View Chrome 탭 & 증거 타임라인 패널 */}
        <div className="flex w-[480px] shrink-0 flex-col rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden">
          {/* 탭 네비게이션 */}
          <div className="flex border-b border-slate-200 bg-slate-50 px-2 pt-2 gap-1">
            <button
              onClick={() => setActiveRightTab("live")}
              className={`flex items-center gap-1.5 rounded-t-lg px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
                activeRightTab === "live"
                  ? "bg-white text-indigo-700 border-t border-x border-slate-200 shadow-2xs"
                  : "text-slate-500 hover:text-slate-900"
              }`}
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
              </span>
              <span>Live View (Chrome Tab)</span>
            </button>
            <button
              onClick={() => setActiveRightTab("evidence")}
              className={`flex items-center gap-1.5 rounded-t-lg px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
                activeRightTab === "evidence"
                  ? "bg-white text-indigo-700 border-t border-x border-slate-200 shadow-2xs"
                  : "text-slate-500 hover:text-slate-900"
              }`}
            >
              <span>📸 Evidence Gallery ({collectedEvidences.length})</span>
            </button>
          </div>

          {/* 탭 1: Live View 패널 */}
          {activeRightTab === "live" && (
            <div className="flex flex-1 flex-col p-3 bg-slate-900 overflow-y-auto">
              <div className="mb-2 flex items-center justify-between text-[11px] text-slate-300 font-mono border-b border-slate-800 pb-1.5">
                <span>🔴 Live Agent Chrome Window Stream</span>
                <span>Auto-refresh 1.5s</span>
              </div>
              <div className="relative flex-1 rounded border border-slate-700 overflow-hidden bg-black flex items-center justify-center min-h-[300px]">
                <img
                  src={`/live-view/image?t=${liveImageTimestamp}`}
                  alt="Agent Chrome Live View"
                  className="w-full h-full object-contain"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = "none";
                  }}
                  onLoad={(e) => {
                    (e.target as HTMLElement).style.display = "block";
                  }}
                />
              </div>
            </div>
          )}

          {/* 탭 2: Evidence Gallery 패널 */}
          {activeRightTab === "evidence" && (
            <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-slate-50">
              <div className="text-xs font-semibold text-slate-700 border-b border-slate-200 pb-1 flex items-center justify-between">
                <span>📸 수집된 증거 스크린샷 타임라인</span>
                <span className="text-[10px] text-slate-400">총 {collectedEvidences.length}개 저장됨</span>
              </div>

              {collectedEvidences.length === 0 ? (
                <div className="flex h-48 flex-col items-center justify-center text-center text-xs text-slate-400">
                  <p>아직 수집된 스크린샷 증거가 없습니다.</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">followLink() 및 screenshot() 호출 시 여기에 기록됩니다.</p>
                </div>
              ) : (
                collectedEvidences.map((ev, idx) => (
                  <div key={idx} className="rounded-lg border border-slate-200 bg-white p-2 shadow-2xs">
                    <div className="mb-1 flex items-center justify-between text-[11px]">
                      <span className="font-bold text-indigo-700">Step {ev.step}</span>
                      <a href={ev.url} target="_blank" rel="noreferrer" className="text-[10px] font-mono text-slate-500 hover:text-indigo-600 underline">
                        {ev.url} ↗
                      </a>
                    </div>
                    <img src={ev.url} alt={`Evidence Step ${ev.step}`} className="w-full h-auto rounded border border-slate-100 object-cover" />
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
