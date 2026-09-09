import { useState } from "react";
import { useAgent } from "agents/react";
import type { Finding, OrchestratorState } from "../worker";

export default function App() {
  const [topicInput, setTopicInput] = useState(
    "Cloudflare Workers & Durable Objects 2026 최신 기술 동향 및 AI 에이전트 연동 패턴"
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const agent = useAgent<OrchestratorState>({
    agent: "Orchestrator",
  });

  const state: OrchestratorState = agent.state || { status: "idle" };

  const handleStartResearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!topicInput.trim() || isSubmitting) return;

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      await agent.call("research", [topicInput]);
    } catch (err: any) {
      console.error("Research error:", err);
      setErrorMsg(err?.message || "서브에이전트 연구 진행 중 오류가 발생했습니다.");
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
        plan: undefined,
        findings: undefined,
        activity: undefined,
        summary: undefined,
      });
    }
  };

  const statusBadge = () => {
    switch (state.status) {
      case "planning":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-950/80 text-amber-300 border border-amber-800/60 animate-pulse">
            <span className="h-2 w-2 rounded-full bg-amber-400 animate-ping" />
            Orchestrator 플래닝 중 (쿼리 3개 분할)
          </span>
        );
      case "researching":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-950/80 text-indigo-300 border border-indigo-800/60 animate-pulse">
            <span className="h-2 w-2 rounded-full bg-indigo-400 animate-ping" />
            서브 연구원 3명 동시 탐색 중 (RpcTarget 리포팅)
          </span>
        );
      case "completed":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-950/80 text-emerald-300 border border-emerald-800/60">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            연구 분석 완료
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
            <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-indigo-600 via-purple-600 to-pink-500 flex items-center justify-center shadow-lg shadow-indigo-500/25">
              <span className="text-xl">🤖</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold tracking-tight text-white">
                  AI Sub-Agent Orchestration Engine
                </h1>
                <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-800/60">
                  glm-4.7-flash
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Cloudflare Workers DO + RpcTarget 실시간 병렬 서브에이전트 연구 시스템
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {statusBadge()}
            <button
              type="button"
              onClick={handleReset}
              className="text-xs text-slate-400 hover:text-white px-3 py-1.5 rounded-lg border border-slate-800 hover:bg-slate-800/60 transition"
            >
              초기화
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-6xl w-full mx-auto p-4 md:p-6 space-y-6">
        {/* Research Prompt Input Form */}
        <section className="glass-card rounded-2xl p-6 border border-slate-700/60 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 -mt-12 -mr-12 w-48 h-48 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
          
          <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2 mb-2">
            <span>🔬</span> 심층 탐구 연구 주제 설정
          </h2>
          <p className="text-xs text-slate-400 mb-4">
            오케스트레이터(Orchestrator)가 연구 주제를 분석하여 3가지 세부 관점으로 분할한 후, 3명의 서브 연구원(Researcher Sub-agents)에게 독립 병렬 수집을 지시합니다.
          </p>

          <form onSubmit={handleStartResearch} className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="text"
                value={topicInput}
                onChange={(e) => setTopicInput(e.target.value)}
                placeholder="연구하고 싶은 주제나 기술 질문을 입력하세요..."
                disabled={isSubmitting || state.status === "planning" || state.status === "researching"}
                className="flex-1 rounded-xl bg-slate-950/80 border border-slate-700/80 px-4 py-3 text-sm text-slate-100 placeholder-slate-500 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-50 transition"
              />
              <button
                type="submit"
                disabled={isSubmitting || state.status === "planning" || state.status === "researching"}
                className="px-6 py-3 rounded-xl bg-gradient-to-r from-indigo-500 via-indigo-600 to-purple-600 hover:brightness-110 active:scale-95 text-white font-semibold text-sm shadow-lg shadow-indigo-500/25 disabled:opacity-50 transition shrink-0 flex items-center justify-center gap-2"
              >
                {isSubmitting || state.status === "planning" || state.status === "researching" ? (
                  <>
                    <span className="animate-spin text-lg">🌀</span>
                    <span>연구 진행 중...</span>
                  </>
                ) : (
                  <>
                    <span>🚀</span>
                    <span>서브에이전트 연구 개시</span>
                  </>
                )}
              </button>
            </div>

            {/* Quick Preset Buttons */}
            <div className="flex flex-wrap items-center gap-2 pt-2">
              <span className="text-xs text-slate-400 font-medium">추천 서브연구 샘플:</span>
              {[
                "Cloudflare Workers & DO 2026 최신 기술 동향",
                "Web Browser AI Agent 실행 및 Puppeteer 자동화",
                "React 19 Server Components와 Vite 6 통합 패턴",
              ].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => handlePresetSelect(preset)}
                  className="text-xs px-3 py-1.5 rounded-lg bg-slate-900/60 hover:bg-indigo-950/80 border border-slate-800 hover:border-indigo-500/50 text-slate-300 hover:text-indigo-200 transition"
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

        {/* Step 1: Orchestrator Research Angles / Plan */}
        {(state.plan || state.status === "planning" || state.status === "researching" || state.status === "completed") && (
          <section className="glass-card rounded-2xl p-6 border border-slate-700/60 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-indigo-400 uppercase tracking-wider flex items-center gap-2">
                <span>🎯</span> 1단계: Orchestrator 쿼리 분할 계획 (3 angles)
              </h3>
              {state.status === "planning" && (
                <span className="text-xs text-amber-400 animate-pulse">
                  AI 분할 계획 생성 중...
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {state.plan && state.plan.length > 0 ? (
                state.plan.map((queryAngle, idx) => (
                  <div
                    key={idx}
                    className="p-4 rounded-xl bg-slate-900/80 border border-indigo-950 hover:border-indigo-800/60 transition"
                  >
                    <div className="flex items-center gap-2 text-xs font-semibold text-indigo-300 mb-2">
                      <span className="h-5 w-5 rounded-full bg-indigo-950 text-indigo-400 border border-indigo-800/80 flex items-center justify-center font-mono">
                        {idx + 1}
                      </span>
                      <span>연구 관점 #{idx + 1}</span>
                    </div>
                    <p className="text-xs text-slate-200 font-mono leading-relaxed bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/60">
                      "{queryAngle}"
                    </p>
                  </div>
                ))
              ) : (
                <div className="col-span-3 text-center py-6 text-xs text-slate-500 italic">
                  Orchestrator가 연구 주제를 3개의 탐색 쿼리로 세분화하고 있습니다...
                </div>
              )}
            </div>
          </section>
        )}

        {/* Step 2: RpcTarget Live Activity Dashboard for 3 Researcher Sub-Agents */}
        {(state.status === "researching" || state.activity || state.findings) && (
          <section className="glass-card rounded-2xl p-6 border border-slate-700/60 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-purple-400 uppercase tracking-wider flex items-center gap-2">
                <span>🛰️</span> 2단계: 서브 연구원(Researcher Sub-Agents) 실시간 RpcTarget 모니터링
              </h3>
              <span className="text-[11px] font-mono text-slate-400">
                RpcTarget progress reporting active
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[0, 1, 2].map((index) => {
                const childId = `researcher-${index}`;
                const activeLog = state.activity?.[childId];
                const hasFinding = state.findings && state.findings[index];

                return (
                  <div
                    key={childId}
                    className={`p-4 rounded-xl border transition ${
                      hasFinding
                        ? "bg-slate-900/90 border-emerald-900/60"
                        : activeLog
                        ? "bg-indigo-950/30 border-indigo-700/60 animate-pulse"
                        : "bg-slate-950/60 border-slate-800"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-bold text-slate-200 flex items-center gap-2">
                        <span className="text-base">🕵️‍♂️</span>
                        Researcher-{index + 1}
                      </span>
                      {hasFinding ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-950 text-emerald-400 border border-emerald-800">
                          수집 완료
                        </span>
                      ) : activeLog ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-950 text-indigo-300 border border-indigo-800">
                          작업 진행 중
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-900 text-slate-500 border border-slate-800">
                          대기
                        </span>
                      )}
                    </div>

                    {/* Query assigned */}
                    {state.plan && state.plan[index] && (
                      <div className="text-[11px] text-slate-400 mb-2 truncate">
                        <span className="text-slate-500">할당 쿼리:</span> {state.plan[index]}
                      </div>
                    )}

                    {/* Progress log via RpcTarget */}
                    <div className="min-h-[54px] rounded-lg bg-slate-950 p-2.5 border border-slate-800/80 text-[11px] font-mono text-slate-300 flex items-center gap-2">
                      {activeLog ? (
                        <>
                          <span className="text-indigo-400 animate-spin">⚡</span>
                          <span className="leading-snug">{activeLog}</span>
                        </>
                      ) : hasFinding ? (
                        <span className="text-emerald-400">
                          ✓ 팩트 데이터 추출 및 전달 완료
                        </span>
                      ) : (
                        <span className="text-slate-600 italic">연구원 준비 중...</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Step 3: Structued Findings Cards */}
        {state.findings && state.findings.length > 0 && (
          <section className="glass-card rounded-2xl p-6 border border-slate-700/60 shadow-xl space-y-4">
            <h3 className="text-sm font-bold text-cyan-400 uppercase tracking-wider flex items-center gap-2">
              <span>📋</span> 3단계: 서브 연구원별 구조화된 팩트 카탈로그 (Findings)
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {state.findings.map((finding: Finding, idx: number) => (
                <div
                  key={idx}
                  className="rounded-xl glass-card p-4 border border-slate-700/80 flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center gap-2 mb-2 pb-2 border-b border-slate-800">
                      <span className="text-xs font-semibold px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800/60 font-mono">
                        Researcher-{idx + 1}
                      </span>
                      <h4 className="text-xs font-bold text-slate-100 truncate">
                        {finding.topic || `연구 주제 #${idx + 1}`}
                      </h4>
                    </div>

                    <ul className="space-y-2 mt-3">
                      {finding.keyFindings?.map((fact: string, fIdx: number) => (
                        <li key={fIdx} className="text-xs text-slate-300 flex items-start gap-2">
                          <span className="text-cyan-400 shrink-0 font-bold">•</span>
                          <span className="leading-relaxed">{fact}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="mt-4 pt-2 border-t border-slate-800/60 text-[10px] text-slate-500 font-mono text-right">
                    {finding.keyFindings?.length || 0}개의 검증된 팩트 도출
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Step 4: Final Synthesized AI Summary Report */}
        {state.summary && (
          <section className="glass-card rounded-2xl p-6 border border-indigo-500/40 shadow-2xl space-y-4 bg-gradient-to-b from-indigo-950/30 to-slate-900/60">
            <div className="flex items-center justify-between pb-3 border-b border-indigo-900/50">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <span>📊</span> 최종 연구 종합 분석 보고서 (Orchestrator Aggregated Report)
              </h3>
              <span className="text-xs px-3 py-1 rounded-full bg-indigo-900/60 text-indigo-200 border border-indigo-700/60">
                AI Synthesis Complete
              </span>
            </div>

            <div className="prose prose-invert max-w-none text-sm text-slate-200 leading-relaxed whitespace-pre-wrap bg-slate-950/70 p-5 rounded-xl border border-indigo-900/40 font-['Plus_Jakarta_Sans']">
              {state.summary}
            </div>
          </section>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/80 glass-panel py-4 px-6 text-center text-xs text-slate-500">
        Cloudflare Workers & Durable Objects Multi-Agent Research Project • my11-subagent
      </footer>
    </div>
  );
}
