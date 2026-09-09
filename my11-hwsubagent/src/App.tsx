import { useState } from "react";
import { useAgent } from "agents/react";
import type { DebateArgument, DebateState } from "../worker";

export default function App() {
  const [topicInput, setTopicInput] = useState("민초, 찬성인가 반대인가?");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const agent = useAgent<DebateState>({
    agent: "DebateOrchestrator",
  });

  const state: DebateState = agent.state || { status: "idle" };

  const handleStartDebate = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!topicInput.trim() || isSubmitting) return;

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      await agent.call("startDebate", [topicInput]);
    } catch (err: any) {
      console.error("Debate execution error:", err);
      setErrorMsg(err?.message || "서브에이전트 토론 진행 중 오류가 발생했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePresetSelect = (preset: string) => {
    setTopicInput(preset);
  };

  const handleReset = () => {
    if (agent.setState) {
      agent.setState({
        status: "idle",
        topic: undefined,
        proLabel: undefined,
        conLabel: undefined,
        activity: undefined,
        proArgument: undefined,
        conArgument: undefined,
        winner: undefined,
        verdict: undefined,
      });
    }
  };

  const statusBadge = () => {
    switch (state.status) {
      case "analyzing":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-950/80 text-amber-300 border border-amber-800/60 animate-pulse">
            <span className="h-2 w-2 rounded-full bg-amber-400 animate-ping" />
            주제 분석 및 찬반 구도 설정 중
          </span>
        );
      case "debating":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-950/80 text-indigo-300 border border-indigo-800/60 animate-pulse">
            <span className="h-2 w-2 rounded-full bg-indigo-400 animate-ping" />
            양측 서브에이전트 3개 논거 준비 중 (RpcTarget 리포팅)
          </span>
        );
      case "judging":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-purple-950/80 text-purple-300 border border-purple-800/60 animate-pulse">
            <span className="h-2 w-2 rounded-full bg-purple-400 animate-ping" />
            AI 심판 최종 비교 판정 중...
          </span>
        );
      case "completed":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-950/80 text-emerald-300 border border-emerald-800/60">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            토론 & 심판 판정 완료
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-slate-900/80 text-slate-400 border border-slate-800">
            <span className="h-2 w-2 rounded-full bg-slate-500" />
            대기 중 (Idle)
          </span>
        );
    }
  };

  return (
    <div className="min-h-screen bg-[#090d16] text-slate-100 flex flex-col font-['Plus_Jakarta_Sans',sans-serif]">
      {/* Header */}
      <header className="sticky top-0 z-30 glass-panel border-b border-slate-800/80 px-4 py-3.5">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-rose-600 via-purple-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-rose-500/25">
              <span className="text-xl">⚔️</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold tracking-tight text-white">
                  AI Debate Arena (논쟁의 장)
                </h1>
                <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-800/60">
                  @cf/zai-org/glm-4.7-flash
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Cloudflare Workers DO + RpcTarget 실시간 병렬 서브에이전트 논쟁 및 심판 판정 시스템
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {statusBadge()}
            <button
              type="button"
              onClick={handleReset}
              className="text-xs text-slate-400 hover:text-white px-3 py-1.5 rounded-lg border border-slate-800 hover:bg-slate-800/60 transition cursor-pointer"
            >
              초기화
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-6xl w-full mx-auto p-4 md:p-6 space-y-6">
        {/* Debate Topic Form */}
        <section className="glass-card rounded-2xl p-6 border border-slate-700/60 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 -mt-12 -mr-12 w-48 h-48 bg-rose-500/10 rounded-full blur-3xl pointer-events-none" />

          <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2 mb-1">
            <span>🔥</span> 논쟁 주제 입력 및 서브에이전트 대결 요청
          </h2>
          <p className="text-xs text-slate-400 mb-4">
            부모 에이전트(Orchestrator)가 각 입장을 대변하는 서브 에이전트 2개를 생성하여 독립된 맥락에서 각 3개의 구체적 논거를 작성하게 한 후 심판 판정을 내립니다.
          </p>

          <form onSubmit={handleStartDebate} className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="text"
                value={topicInput}
                onChange={(e) => setTopicInput(e.target.value)}
                placeholder="예: 민초 찬성인가 반대인가?, 탕수육 부먹 대 찍먹?, 깻잎논쟁?"
                disabled={isSubmitting || state.status !== "idle" && state.status !== "completed"}
                className="flex-1 rounded-xl bg-slate-950/80 border border-slate-700/80 px-4 py-3 text-sm text-slate-100 placeholder-slate-500 outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20 disabled:opacity-50 transition"
              />
              <button
                type="submit"
                disabled={isSubmitting || (state.status !== "idle" && state.status !== "completed")}
                className="px-6 py-3 rounded-xl bg-gradient-to-r from-rose-600 via-purple-600 to-indigo-600 hover:brightness-110 active:scale-95 text-white font-semibold text-sm shadow-lg shadow-rose-500/25 disabled:opacity-50 transition shrink-0 flex items-center justify-center gap-2 cursor-pointer"
              >
                {isSubmitting || state.status === "analyzing" || state.status === "debating" || state.status === "judging" ? (
                  <>
                    <span className="animate-spin text-lg">🌀</span>
                    <span>논쟁 진행 중...</span>
                  </>
                ) : (
                  <>
                    <span>⚔️</span>
                    <span>서브에이전트 토론 시작</span>
                  </>
                )}
              </button>
            </div>

            {/* Quick Preset Buttons */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="text-xs text-slate-400 font-medium">추천 논쟁 주제:</span>
              {[
                "민초, 찬성인가 반대인가?",
                "탕수육, 부먹 대 찍먹?",
                "깻잎논쟁, 잡아줘도 되는가?",
              ].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => handlePresetSelect(preset)}
                  className="text-xs px-3 py-1.5 rounded-lg bg-slate-900/60 hover:bg-rose-950/60 border border-slate-800 hover:border-rose-500/50 text-slate-300 hover:text-rose-200 transition cursor-pointer"
                >
                  {preset}
                </button>
              ))}
            </div>
          </form>

          {errorMsg && (
            <div className="mt-4 p-3 rounded-xl bg-rose-950/40 border border-rose-800/60 text-rose-300 text-xs">
              ⚠️ {errorMsg}
            </div>
          )}
        </section>

        {/* Step 1 & 2: Sub-Agent Live RpcTarget Activity Monitors */}
        {(state.status === "debating" || state.status === "judging" || state.activity || state.proArgument) && (
          <section className="glass-card rounded-2xl p-6 border border-slate-700/60 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-indigo-400 uppercase tracking-wider flex items-center gap-2">
                <span>🛰️</span> 실시간 서브에이전트 작업 진행 현황 (RpcTarget Callbacks)
              </h3>
              <span className="text-[11px] font-mono text-slate-400">
                Independent Context Sub-Agents
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Pro Sub-Agent Status */}
              <div
                className={`p-4 rounded-xl border transition ${
                  state.proArgument
                    ? "bg-slate-900/90 border-blue-800/60"
                    : state.activity?.pro
                    ? "bg-blue-950/30 border-blue-600/60 animate-pulse"
                    : "bg-slate-950/60 border-slate-800"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-blue-300 flex items-center gap-2">
                    <span>🛡️</span> {state.proLabel || "찬성/A측 대변인"} (Sub-Agent Pro)
                  </span>
                  {state.proArgument ? (
                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-950 text-blue-300 border border-blue-800">
                      입론 작성 완료
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-950 text-indigo-300 border border-indigo-800">
                      작업 중
                    </span>
                  )}
                </div>
                <div className="min-h-[44px] rounded-lg bg-slate-950 p-2.5 border border-slate-800/80 text-[11px] font-mono text-slate-300 flex items-center gap-2">
                  <span className="text-blue-400 animate-spin">⚡</span>
                  <span>{state.activity?.pro || "대변인 생성 중..."}</span>
                </div>
              </div>

              {/* Con Sub-Agent Status */}
              <div
                className={`p-4 rounded-xl border transition ${
                  state.conArgument
                    ? "bg-slate-900/90 border-rose-800/60"
                    : state.activity?.con
                    ? "bg-rose-950/30 border-rose-600/60 animate-pulse"
                    : "bg-slate-950/60 border-slate-800"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-rose-300 flex items-center gap-2">
                    <span>⚔️</span> {state.conLabel || "반대/B측 대변인"} (Sub-Agent Con)
                  </span>
                  {state.conArgument ? (
                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-950 text-rose-300 border border-rose-800">
                      입론 작성 완료
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-950 text-indigo-300 border border-indigo-800">
                      작업 중
                    </span>
                  )}
                </div>
                <div className="min-h-[44px] rounded-lg bg-slate-950 p-2.5 border border-slate-800/80 text-[11px] font-mono text-slate-300 flex items-center gap-2">
                  <span className="text-rose-400 animate-spin">⚡</span>
                  <span>{state.activity?.con || "대변인 생성 중..."}</span>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Step 3: Dual Structured Arguments Cards Comparison */}
        {(state.proArgument || state.conArgument) && (
          <section className="glass-card rounded-2xl p-6 border border-slate-700/60 shadow-xl space-y-4">
            <h3 className="text-sm font-bold text-cyan-400 uppercase tracking-wider flex items-center gap-2">
              <span>📋</span> 양측 대변인 구조화 주장 비교 (Structured Debate Output)
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Pro Argument Card */}
              {state.proArgument && (
                <DebateCard
                  sideName={state.proLabel || state.proArgument.stance}
                  argument={state.proArgument}
                  accentColor="blue"
                />
              )}

              {/* Con Argument Card */}
              {state.conArgument && (
                <DebateCard
                  sideName={state.conLabel || state.conArgument.stance}
                  argument={state.conArgument}
                  accentColor="rose"
                />
              )}
            </div>
          </section>
        )}

        {/* Step 4: Final Judge Verdict & Winner Announcement */}
        {(state.verdict || state.winner || state.status === "judging") && (
          <section className="glass-card rounded-2xl p-6 border border-amber-500/50 shadow-2xl space-y-4 bg-gradient-to-b from-amber-950/20 via-purple-950/30 to-slate-900/80">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-amber-900/40">
              <div className="flex items-center gap-2">
                <span className="text-2xl">⚖️</span>
                <div>
                  <h3 className="text-base font-bold text-white">
                    AI 심판 판정 및 최종 결과 (Judge Verdict)
                  </h3>
                  <p className="text-xs text-slate-400">
                    독립된 두 에이전트의 구조화된 논거 6개를 비교 심사하여 결정적 논거 판정
                  </p>
                </div>
              </div>

              {state.winner && (
                <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-gradient-to-r from-amber-500 to-yellow-500 text-slate-950 font-extrabold text-sm shadow-lg shadow-amber-500/20">
                  <span>🏆 승자:</span>
                  <span>{state.winner}</span>
                </div>
              )}
            </div>

            {state.status === "judging" && !state.verdict && (
              <div className="py-8 text-center space-y-2">
                <span className="animate-spin text-3xl inline-block">⚖️</span>
                <p className="text-sm text-purple-300 font-medium">
                  심판이 양측의 논거 3개씩 총 6개의 주장을 심도 깊게 비교 검토 중입니다...
                </p>
              </div>
            )}

            {state.verdict && (
              <div className="space-y-3">
                <div className="text-xs font-semibold text-amber-400 uppercase tracking-wider">
                  📢 판정문 및 승리 결정 논거 분석:
                </div>
                <div className="prose prose-invert max-w-none text-sm text-slate-100 leading-relaxed whitespace-pre-wrap bg-slate-950/80 p-5 rounded-xl border border-amber-900/40 font-['Plus_Jakarta_Sans'] shadow-inner">
                  {state.verdict}
                </div>
              </div>
            )}
          </section>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/80 glass-panel py-4 px-6 text-center text-xs text-slate-500">
        Cloudflare Workers & Durable Objects Sub-Agent Project • my11-hwsubagent
      </footer>
    </div>
  );
}

function DebateCard({
  sideName,
  argument,
  accentColor,
}: {
  sideName: string;
  argument: DebateArgument;
  accentColor: "blue" | "rose";
}) {
  const isBlue = accentColor === "blue";
  const borderClass = isBlue ? "border-blue-900/80" : "border-rose-900/80";
  const bgBadge = isBlue ? "bg-blue-950 text-blue-300 border-blue-800" : "bg-rose-950 text-rose-300 border-rose-800";
  const pointNumBg = isBlue ? "bg-blue-900/80 text-blue-200" : "bg-rose-900/80 text-rose-200";

  return (
    <div className={`rounded-xl glass-card p-5 border ${borderClass} flex flex-col justify-between space-y-4`}>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <span className={`px-2.5 py-1 rounded text-xs font-bold border font-mono ${bgBadge}`}>
            {sideName}
          </span>
          <span className="text-[11px] text-slate-400 font-mono">
            3개 핵심 논거 제출
          </span>
        </div>

        {/* Opening */}
        <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800/80 space-y-1">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
            💬 모두발언 (Opening)
          </span>
          <p className="text-xs text-slate-200 leading-relaxed font-medium italic">
            "{argument.opening}"
          </p>
        </div>

        {/* 3 Arguments */}
        <div className="space-y-2.5">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
            🎯 핵심 논거 (Arguments 3개)
          </span>
          {argument.arguments?.map((arg, idx) => (
            <div key={idx} className="bg-slate-950/80 p-3 rounded-lg border border-slate-800/60 space-y-1">
              <div className="flex items-center gap-2">
                <span className={`h-4 w-4 rounded-full text-[10px] font-bold flex items-center justify-center ${pointNumBg}`}>
                  {idx + 1}
                </span>
                <h4 className="text-xs font-bold text-white">
                  {arg.point}
                </h4>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed pl-6">
                {arg.reasoning}
              </p>
            </div>
          ))}
        </div>

        {/* Closing */}
        <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800/80 space-y-1">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
            🏁 마무리발언 (Closing)
          </span>
          <p className="text-xs text-slate-200 leading-relaxed italic">
            "{argument.closing}"
          </p>
        </div>
      </div>
    </div>
  );
}
