import { useAgentChat } from "agents/ai-react";
import { useAgent } from "agents/react";
import { getToolName, isToolUIPart, type UIMessage } from "ai";
import {
  Activity,
  Bot,
  Calendar,
  Dumbbell,
  FileText,
  Flame,
  Folder,
  Send,
  Sparkles,
  StopCircle,
  Trash2,
  X,
} from "lucide-react";
import { useState } from "react";

type FileEntry = {
  path: string;
  type: "file" | "directory";
  size: number;
  updatedAt: number;
};

type AgentState = { files: FileEntry[] };

type AgentStub = {
  readWorkspaceFile: (path: string) => Promise<string | null>;
};

function App() {
  const [agentState, setAgentState] = useState<AgentState>({ files: [] });
  const [openFile, setOpenFile] = useState<{
    path: string;
    content: string | null;
  } | null>(null);
  const [loadingFile, setLoadingFile] = useState(false);

  // 고정 인스턴스 이름("coach-main")을 사용하여 새 브라우저 탭/창에서도 동일한 세션 메모리와 워크스페이스가 유지됨
  const agent = useAgent<AgentState>({
    agent: "CoachAgent",
    name: "coach-main",
    onStateUpdate: setAgentState,
  });

  const handleFileClick = async (path: string) => {
    setLoadingFile(true);
    setOpenFile({ path, content: null });
    const stub = agent.stub as AgentStub;
    const content = await stub.readWorkspaceFile(path);
    setOpenFile({ path, content });
    setLoadingFile(false);
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  const {
    messages,
    sendMessage,
    clearHistory,
    status,
    stop,
    addToolApprovalResponse,
  } = useAgentChat({ agent });

  const handleSubmit = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const message = formData.get("input") as string;
    if (!message?.trim()) return;
    sendMessage({ text: message });
    e.currentTarget.reset();
  };

  function renderMessage(msg: UIMessage) {
    return msg.parts.map((part, i) => {
      // 1. 내부 사고/추론 과정은 화면에 노출하지 않음
      if (part.type === "reasoning") {
        return null;
      }

      // 2. 텍스트 파트 렌더링 (<think> 태그 정제)
      if (part.type === "text") {
        const cleaned = part.text
          .replace(/<think>[\s\S]*?<\/think>/g, "")
          .replace(/<\/?think>/g, "")
          .trim();
        if (!cleaned) return null;
        return (
          <p key={i} className="whitespace-pre-wrap leading-relaxed text-sm">
            {cleaned}
          </p>
        );
      }

      // 3. 도구 실행 및 중간 과정 숨김 (승인 요청 건만 노출하고 output-available 등 모든 중간 과정 숨김)
      if (isToolUIPart(part)) {
        if ("approval" in part && part.state === "approval-requested") {
          return (
            <div
              key={i}
              className="my-2 rounded-xl border border-amber-500/40 bg-amber-950/30 p-3 text-xs text-amber-200"
            >
              <div className="flex items-center gap-2 font-semibold text-amber-300">
                <Sparkles className="h-4 w-4" />
                <span>도구 실행 승인 요청: {getToolName(part)}</span>
              </div>
              {"input" in part && part.input != null && (
                <pre className="mt-2 max-h-32 overflow-x-auto rounded bg-black/40 p-2 font-mono text-[11px] text-zinc-300">
                  {JSON.stringify(part.input, null, 2)}
                </pre>
              )}
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  className="rounded-lg bg-emerald-600 px-3 py-1 font-medium text-white transition hover:bg-emerald-500"
                  onClick={() =>
                    addToolApprovalResponse({
                      id: part.approval.id,
                      approved: true,
                    })
                  }
                >
                  승인 (Approve)
                </button>
                <button
                  type="button"
                  className="rounded-lg bg-red-600/80 px-3 py-1 font-medium text-white transition hover:bg-red-500"
                  onClick={() =>
                    addToolApprovalResponse({
                      id: part.approval.id,
                      approved: false,
                    })
                  }
                >
                  거절 (Reject)
                </button>
              </div>
            </div>
          );
        }

        // output-available, running 등 모든 중간 실행 과정은 UI에 노출하지 않음
        return null;
      }
      return null;
    });
  }


  return (
    <div className="flex min-h-screen flex-col bg-zinc-950 text-zinc-100">
      {/* 탑 네비게이션 헤더 */}
      <header className="sticky top-0 z-20 border-b border-zinc-800/80 bg-zinc-900/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-700 text-white shadow-lg shadow-emerald-500/20">
              <Dumbbell className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold tracking-tight text-white">
                  CoachAgent 피트니스 코치
                </h1>
                <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-400 border border-emerald-500/30">
                  Think Framework
                </span>
              </div>
              <p className="text-xs text-zinc-400">
                Durable Object Memory • R2 Skills • Workspace VFS • Dynamic 1RM Tools
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="hidden sm:flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-1 text-xs text-zinc-400">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="font-mono text-[11px]">
                {status || "Connected"}
              </span>
            </div>
            <button
              type="button"
              onClick={clearHistory}
              className="flex items-center gap-1 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-400 transition hover:bg-zinc-800 hover:text-white"
              title="대화 기록 초기화"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">대화 초기화</span>
            </button>
            {status === "streaming" && (
              <button
                type="button"
                onClick={stop}
                className="flex items-center gap-1 rounded-lg bg-red-600/80 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-red-500"
              >
                <StopCircle className="h-3.5 w-3.5" />
                <span>중지</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* 메인 2단 대시보드 레이아웃 */}
      <div className="mx-auto grid w-full max-w-7xl flex-1 grid-cols-1 gap-6 p-4 sm:p-6 lg:grid-cols-12">
        {/* 좌측 사이드바: 가상 워크스페이스 & 피트니스 컨텍스트 위젯 */}
        <aside className="space-y-4 lg:col-span-4">
          {/* 가상 워크스페이스 파일 탐색기 */}
          <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/60 p-4 shadow-xl backdrop-blur">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-semibold text-zinc-200">
                <Folder className="h-4 w-4 text-emerald-400" />
                <span>훈련 워크스페이스 (Workspace)</span>
              </div>
              <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs font-mono text-emerald-400">
                {agentState.files.length}개 파일
              </span>
            </div>
            <p className="mt-1 text-[11px] text-zinc-400">
              운동 기록(logs/) 및 훈련 계획(plan.md)이 실시간 저장됩니다.
            </p>

            {/* 파일 리스트 */}
            <div className="mt-3 max-h-72 space-y-1 overflow-y-auto pr-1">
              {agentState.files.length === 0 ? (
                <div className="rounded-xl border border-dashed border-zinc-800 p-4 text-center text-xs text-zinc-500">
                  <p>아직 생성된 훈련 파일이 없습니다.</p>
                  <p className="mt-1 text-[10px] text-zinc-600">
                    운동을 보고하면 코치가 로그 파일을 자동 작성합니다.
                  </p>
                </div>
              ) : (
                <ul className="space-y-1">
                  {agentState.files.map((file) => {
                    const isLog = file.path.startsWith("logs/");
                    const isPlan = file.path.includes("plan");
                    return (
                      <li key={file.path}>
                        <button
                          type="button"
                          onClick={() => handleFileClick(file.path)}
                          disabled={file.type === "directory"}
                          className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs transition ${
                            isLog
                              ? "border-emerald-500/20 bg-emerald-950/20 text-emerald-200 hover:bg-emerald-950/40"
                              : isPlan
                              ? "border-teal-500/20 bg-teal-950/20 text-teal-200 hover:bg-teal-950/40"
                              : "border-zinc-800/80 bg-zinc-950/40 text-zinc-300 hover:bg-zinc-800/50"
                          } disabled:opacity-60`}
                        >
                          {file.type === "directory" ? (
                            <Folder className="h-3.5 w-3.5 text-zinc-500 shrink-0" />
                          ) : isLog ? (
                            <Calendar className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                          ) : isPlan ? (
                            <Flame className="h-3.5 w-3.5 text-teal-400 shrink-0" />
                          ) : (
                            <FileText className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
                          )}
                          <span className="flex-1 truncate font-mono text-[11px]">
                            {file.path}
                          </span>
                          {file.type === "file" && (
                            <span className="shrink-0 font-mono text-[10px] text-zinc-500">
                              {formatSize(file.size)}
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {/* 열린 파일 뷰어 */}
            {openFile && (
              <div className="mt-3 rounded-xl border border-emerald-500/30 bg-zinc-950/90 p-3 shadow-inner">
                <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                  <span className="truncate font-mono text-xs font-semibold text-emerald-400">
                    📄 {openFile.path}
                  </span>
                  <button
                    type="button"
                    onClick={() => setOpenFile(null)}
                    className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-white"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                {loadingFile ? (
                  <p className="mt-2 text-xs text-zinc-500 animate-pulse">
                    파일을 읽어오는 중…
                  </p>
                ) : openFile.content === null ? (
                  <p className="mt-2 text-xs text-zinc-500">
                    내용이 비어 있거나 읽을 수 없습니다.
                  </p>
                ) : (
                  <pre className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-zinc-300">
                    {openFile.content}
                  </pre>
                )}
              </div>
            )}
          </section>

          {/* 피트니스 코칭 기능 안내 위젯 */}
          <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/60 p-4 shadow-xl backdrop-blur">
            <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">
              <Activity className="h-3.5 w-3.5 text-emerald-400" />
              <span>코치 핵심 기능 & 테스트 가이드</span>
            </h3>
            <div className="mt-3 space-y-2.5 text-xs text-zinc-300">
              <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-2.5">
                <p className="font-semibold text-emerald-400">
                  1. 훈련 기록 & 로그 관리
                </p>
                <p className="mt-0.5 text-[11px] text-zinc-400">
                  "오늘 스쿼트 80kg 5회 5세트 했어" 보고 시 `logs/&lt;date&gt;.md` 생성 및 `plan.md` 갱신
                </p>
              </div>

              <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-2.5">
                <p className="font-semibold text-teal-400">
                  2. 지속 세션 메모리 (Memory)
                </p>
                <p className="mt-0.5 text-[11px] text-zinc-400">
                  체중, 무릎 부상, 5km 목표 등록 시 새 탭/창에서도 영구 기억 유지
                </p>
              </div>

              <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-2.5">
                <p className="font-semibold text-cyan-400">
                  3. R2 온디맨드 스킬 가이드 (Skills)
                </p>
                <p className="mt-0.5 text-[11px] text-zinc-400">
                  "스쿼트 자세 알려줘" 질문 시 R2 스킬 로드 후 답변 및 언로드
                </p>
              </div>

              <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-2.5">
                <p className="font-semibold text-amber-400">
                  4. 런타임 1RM 확장 도구 (Extension)
                </p>
                <p className="mt-0.5 text-[11px] text-zinc-400">
                  1RM 계산기 도구 생성 요청 후 "80kg 5회 1RM은?" 질의 시 93kg 계산
                </p>
              </div>
            </div>
          </section>
        </aside>

        {/* 우측 메인 영역: 실시간 대화창 */}
        <main className="flex flex-col rounded-2xl border border-zinc-800/80 bg-zinc-900/60 shadow-2xl backdrop-blur lg:col-span-8 overflow-hidden h-[calc(100vh-6rem)]">
          {/* 채팅 메시지 스크롤 영역 */}
          <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
            {messages.length === 0 ? (
              <div className="flex h-full min-h-[50vh] flex-col items-center justify-center text-center text-zinc-500">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-zinc-900 border border-zinc-800 text-emerald-400 mb-3 shadow-inner">
                  <Bot className="h-8 w-8" />
                </div>
                <h3 className="text-sm font-semibold text-zinc-300">
                  안녕하세요! 전담 피트니스 코치입니다.
                </h3>
                <p className="mt-1 max-w-sm text-xs text-zinc-400">
                  오늘 진행한 운동을 알려주시거나, 신체 정보 및 목표를 공유해 주시면 맞춤형 코칭을 시작합니다.
                </p>
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      sendMessage({
                        text: "오늘 스쿼트 했어. 80kg으로 5회씩 5세트 했어",
                      })
                    }
                    className="rounded-full border border-zinc-800 bg-zinc-900/80 px-3 py-1.5 text-xs text-zinc-300 hover:border-emerald-500/40 hover:text-emerald-300 transition"
                  >
                    "오늘 스쿼트 했어. 80kg으로 5회씩 5세트 했어"
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      sendMessage({
                        text: "내 체중은 75kg이고 무릎 부상이 있어. 목표는 5km 완주야.",
                      })
                    }
                    className="rounded-full border border-zinc-800 bg-zinc-900/80 px-3 py-1.5 text-xs text-zinc-300 hover:border-emerald-500/40 hover:text-emerald-300 transition"
                  >
                    "체중 75kg, 무릎 부상, 5km 목표"
                  </button>
                </div>
              </div>
            ) : (
              messages.map((message) => {
                const isUser = message.role === "user";
                const rendered = renderMessage(message);
                const hasContent = rendered.some(
                  (part) => part !== null && part !== undefined
                );
                if (!hasContent && !isUser) return null;

                return (
                  <div
                    key={message.id}
                    className={`flex gap-3 ${
                      isUser ? "justify-end" : "justify-start"
                    }`}
                  >
                    {!isUser && (
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-600 to-teal-800 text-white shadow">
                        <Dumbbell className="h-4 w-4" />
                      </div>
                    )}
                    <div
                      className={`max-w-[85%] rounded-2xl px-4 py-3 shadow-md ${
                        isUser
                          ? "bg-emerald-600 text-white rounded-tr-none"
                          : "border border-zinc-800 bg-zinc-900/90 text-zinc-100 rounded-tl-none"
                      }`}
                    >
                      {rendered}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* 퀵 테스트 프롬프트 칩 (상시 노출) */}
          <div className="flex items-center gap-2 overflow-x-auto border-t border-zinc-800/60 bg-zinc-950/40 px-4 py-2 text-xs">
            <span className="shrink-0 text-[11px] font-semibold text-zinc-500">
              ⚡ 퀵 질문:
            </span>
            {[
              {
                label: "1. 스쿼트 운동 보고",
                text: "오늘 스쿼트 했어. 80kg으로 5회씩 5세트 했어",
              },
              { label: "1-2. 이번 주 로그 조회", text: "이번 주에 무엇을 했지?" },
              {
                label: "2. 체중/부상/5km 등록",
                text: "내 체중은 75kg이고 무릎 부상이 있어. 목표는 5km 완주야.",
              },
              {
                label: "2-2. 내일 운동 계획 (기억 확인)",
                text: "내일의 운동 계획을 알려줘",
              },
              {
                label: "3. 스쿼트 가이드 (R2 로드/언로드)",
                text: "스쿼트 자세 알려줘",
              },
              {
                label: "4. 1RM 계산기 만들기 (런타임 확장)",
                text: "1회 최대 중량(1RM) 계산기를 만들어줘",
              },
              {
                label: "4-2. 80kg 5회 1RM 계산",
                text: "80kg으로 5회 들면 내 1RM이 얼마야?",
              },
            ].map((chip) => (
              <button
                key={chip.label}
                type="button"
                onClick={() => sendMessage({ text: chip.text })}
                className="shrink-0 rounded-full border border-zinc-800 bg-zinc-900/90 px-2.5 py-1 text-[11px] text-zinc-300 hover:border-emerald-500/50 hover:bg-emerald-950/30 hover:text-emerald-300 transition"
              >
                {chip.label}
              </button>
            ))}
          </div>

          {/* 하단 입력 폼 */}
          <div className="border-t border-zinc-800/80 bg-zinc-900/90 p-4">
            <form onSubmit={handleSubmit} className="flex gap-2">
              <input
                name="input"
                placeholder="코치에게 운동을 보고하거나 질문을 입력하세요... (예: 오늘 스쿼트 80kg 5회 5세트 했어)"
                autoComplete="off"
                className="flex-1 rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm text-zinc-100 placeholder-zinc-500 outline-none transition focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
              />
              <button
                type="submit"
                className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-500/20 transition hover:from-emerald-400 hover:to-teal-500 disabled:opacity-50"
              >
                <Send className="h-4 w-4" />
                <span className="hidden sm:inline">전송</span>
              </button>
            </form>
          </div>
        </main>
      </div>
    </div>
  );
}

export default App;
