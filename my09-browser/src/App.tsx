import { useAgentChat } from "@cloudflare/ai-chat/react";
import { useAgent } from "agents/react";
import { getToolName, isToolUIPart, type UIMessage } from "ai";

const AGENT_OPTIONS = { agent: "BrowserAgent" } as const;

function App() {
  console.log(`[3-0] [App Component] 🎨 App 렌더링 호출됨`);
  const agent = useAgent(AGENT_OPTIONS);

  const {
    messages,
    sendMessage,
    clearHistory,
    status,
    stop,
    addToolApprovalResponse,
  } = useAgentChat({ agent });

  console.log(`[3-1] [App State] 현재 Agent 상태 status: "${status}", 보관된 메시지 수: ${messages.length}개`);

  const handleSubmit = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const message = formData.get("input") as string;
    if (!message?.trim()) return;

    console.log(`[3-2] [App handleSubmit] 🚀 폼 제출 이벤트 발생! 입력된 텍스트: "${message}"`);
    console.log(`[3-3] [App handleSubmit] 📤 백엔드로 sendMessage({ text }) 호출`);
    sendMessage({ text: message });
    e.currentTarget.reset();
  };

  const handleCloseBrowser = () => {
    console.log(`[3-6] [App handleCloseBrowser] 🔒 상단 'Close Browser' 버튼 클릭`);
    sendMessage({ text: "현재 열려있는 브라우저 세션을 종료해줘" });
  };

  function renderMessage(msg: UIMessage) {
    console.log(
      `[4-1] [App renderMessage] ✉️ 메시지 ID: ${msg.id}, 역할: ${msg.role}, 조각(parts) 개수: ${msg.parts.length}`
    );

    return msg.parts.map((part, i) => {
      if (part.type === "text") {
        console.log(`[4-2] [App renderMessage] 📄 [text part] 렌더링: "${part.text.slice(0, 30)}..."`);
        return (
          <p key={i} className="whitespace-pre-wrap leading-relaxed">
            {part.text}
          </p>
        );
      }

      if (part.type === "reasoning") {
        console.log(`[4-3] [App renderMessage] 🧠 [reasoning part] 렌더링`);
        return (
          <p key={i} className="text-xs italic text-zinc-500">
            {part.text}
          </p>
        );
      }

      if (isToolUIPart(part)) {
        const toolName = getToolName(part);
        console.log(`[4-4] [App renderMessage] 🛠️ [tool part] 렌더링 - 도구명: "${toolName}", 상태: "${part.state}"`);

        if ("approval" in part && part.state === "approval-requested") {
          console.log(`[4-5] [App renderMessage] ⚠️ 도구 실행 승인 요청 카드 렌더링 - id: ${part.approval.id}`);
          return (
            <div
              key={i}
              className="text-sm bg-yellow-50 border border-yellow-300 p-2 rounded my-1 text-zinc-800"
            >
              <div>
                <strong>Approve {toolName}?</strong>
              </div>
              {"input" in part && part.input != null && (
                <pre className="mt-1 font-mono text-xs overflow-x-auto">
                  {JSON.stringify(part.input, null, 2)}
                </pre>
              )}
              <div className="mt-2 flex gap-2">
                <button
                  className="px-3 py-1 bg-green-500 hover:bg-green-600 text-white rounded text-xs font-medium transition cursor-pointer"
                  onClick={() => {
                    console.log(`[4-6] [App Approve Click] ✅ 승인 버튼 클릭 - id: ${part.approval.id}`);
                    addToolApprovalResponse({
                      id: part.approval.id,
                      approved: true,
                    });
                  }}
                >
                  Approve
                </button>
                <button
                  className="px-3 py-1 bg-red-500 hover:bg-red-600 text-white rounded text-xs font-medium transition cursor-pointer"
                  onClick={() => {
                    console.log(`[4-7] [App Reject Click] ❌ 거절 버튼 클릭 - id: ${part.approval.id}`);
                    addToolApprovalResponse({
                      id: part.approval.id,
                      approved: false,
                    });
                  }}
                >
                  Reject
                </button>
              </div>
            </div>
          );
        }

        if (part.state === "output-denied") {
          return (
            <div
              key={i}
              className="text-sm bg-red-50 border border-red-300 p-2 rounded my-1 text-red-700"
            >
              <strong>{toolName}</strong> — Rejected
            </div>
          );
        }

        return (
          <div
            key={i}
            className="mt-2 rounded-md border border-zinc-200 bg-zinc-50 p-2 text-xs"
          >
            <div className="flex items-center gap-2">
              <span className="rounded bg-zinc-900 px-1.5 py-0.5 font-mono text-[10px] text-white">
                {toolName}
              </span>
              <span className="text-zinc-500">{part.state}</span>
            </div>
            {"input" in part && part.input != null && (
              <pre className="mt-1 overflow-x-auto font-mono text-zinc-600">
                {JSON.stringify(part.input, null, 2)}
              </pre>
            )}
            {part.state === "output-available" && (
              <pre className="mt-1 overflow-x-auto font-mono text-zinc-600">
                {JSON.stringify(part.output, null, 2)}
              </pre>
            )}
          </div>
        );
      }
      return null;
    });
  }

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 text-zinc-900">
      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <h1 className="shrink-0 text-sm font-semibold tracking-tight">
            🌐 Browser Agent
          </h1>

          <form onSubmit={handleSubmit} className="flex flex-1 gap-2">
            <input
              name="input"
              placeholder="Type a message..."
              autoComplete="off"
              className="flex-1 rounded-full border border-zinc-200 bg-zinc-50 px-4 py-2 text-sm outline-none transition focus:border-zinc-400 focus:bg-white"
            />
            <button
              type="submit"
              className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 cursor-pointer"
            >
              Send
            </button>
          </form>
          <button
            onClick={handleCloseBrowser}
            className="shrink-0 rounded-md bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100 transition cursor-pointer border border-amber-200"
            title="현재 열려있는 브라우저 세션 종료"
          >
            🔒 Close Browser
          </button>
          <button
            onClick={() => {
              console.log(`[3-4] [App clearHistory] 🧹 대화 내역 초기화 실행`);
              clearHistory();
            }}
            className="shrink-0 rounded-md px-2 py-1 text-xs text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900 cursor-pointer"
          >
            Clear
          </button>
          <button
            onClick={() => {
              console.log(`[3-5] [App stop] 🛑 AI 생성 중단 실행`);
              stop();
            }}
            className="shrink-0 rounded-md px-2 py-1 text-xs text-red-500 transition hover:bg-red-100 hover:text-red-900 cursor-pointer"
          >
            Stop
          </button>
          <span className="shrink-0 text-xs text-zinc-400 font-mono">{status}</span>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 py-6 pb-24">
        <div className="flex-1 space-y-4">
          {messages.length === 0 && (
            <div className="flex h-full min-h-[40vh] items-center justify-center text-sm text-zinc-400">
              Say something to get started.
            </div>
          )}
          {messages.map((message: UIMessage) => {
            const isUser = message.role === "user";
            return (
              <div
                key={message.id}
                className={`flex ${isUser ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
                    isUser
                      ? "bg-zinc-900 text-white"
                      : "border border-zinc-200 bg-white text-zinc-900 shadow-xs"
                  }`}
                >
                  {renderMessage(message)}
                </div>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}

export default App;
