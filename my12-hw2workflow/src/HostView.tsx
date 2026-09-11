import { useState, useEffect } from "react";
import { useAgent } from "agents/react";
import type { QuizState } from "../worker/types";
import { Leaderboard } from "./Leaderboard";
import confetti from "canvas-confetti";
import {
  Play,
  Clock,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Users,
  Award,
  Sparkles,
  Lock,
  RotateCcw,
} from "lucide-react";

export function HostView() {
  const [state, setState] = useState<QuizState>({
    status: "idle",
    currentRound: 0,
    roundStage: "idle",
    currentQuestion: null,
    questions: {},
    players: {},
    answers: {},
    grades: {},
    leaderboard: [],
    isAnsweringOpen: false,
    answeringEndsAt: null,
    finalApproved: false,
    workflowId: null,
  });

  const agent = useAgent<any, QuizState>({
    agent: "QuizAgent",
    name: "default",
    query: { role: "host" },
    onStateUpdate: (newState) => {
      if (newState) {
        setState((prev) => ({
          ...prev,
          status: newState.status ?? prev.status ?? "idle",
          currentRound: newState.currentRound ?? prev.currentRound ?? 0,
          roundStage: newState.roundStage ?? prev.roundStage ?? "idle",
          currentQuestion:
            newState.currentQuestion !== undefined
              ? newState.currentQuestion
              : prev.currentQuestion,
          questions: newState.questions || prev.questions || {},
          players: newState.players || prev.players || {},
          answers: newState.answers || prev.answers || {},
          grades: newState.grades || prev.grades || {},
          leaderboard: newState.leaderboard || prev.leaderboard || [],
          isAnsweringOpen:
            newState.isAnsweringOpen ?? prev.isAnsweringOpen ?? false,
          answeringEndsAt:
            newState.answeringEndsAt !== undefined
              ? newState.answeringEndsAt
              : prev.answeringEndsAt,
          finalApproved: newState.finalApproved ?? prev.finalApproved ?? false,
          workflowId: newState.workflowId ?? prev.workflowId ?? null,
        }));
      }
    },
  });

  // 에이전트 스텁 준비 시 전체 상태 동기화
  useEffect(() => {
    if (agent && agent.stub && typeof agent.stub.getState === "function") {
      agent.stub
        .getState()
        .then((s: any) => {
          if (s) {
            setState((prev) => ({ ...prev, ...s }));
          }
        })
        .catch((err: any) => console.error("상태 동기화 에러:", err));
    }
  }, [agent]);

  // agent.state 실시간 갱신 반응성 보강
  useEffect(() => {
    if (agent && agent.state) {
      setState((prev) => ({ ...prev, ...agent.state }));
    }
  }, [agent?.state]);

  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [actionError, setActionError] = useState<string | null>(null);

  // 카운트다운 타이머 갱신
  useEffect(() => {
    if (!state.answeringEndsAt || !state.isAnsweringOpen) {
      setTimeLeft(0);
      return;
    }

    const interval = setInterval(() => {
      const remaining = Math.max(
        0,
        Math.ceil((state.answeringEndsAt! - Date.now()) / 1000)
      );
      setTimeLeft(remaining);
      if (remaining <= 0) {
        clearInterval(interval);
      }
    }, 500);

    return () => clearInterval(interval);
  }, [state.answeringEndsAt, state.isAnsweringOpen]);

  // 최종 승인 시 축하 이펙트
  useEffect(() => {
    if (state.finalApproved) {
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
      });
    }
  }, [state.finalApproved]);

  const handleStartQuiz = async () => {
    setActionError(null);
    try {
      if (agent && agent.stub) {
        const res = await agent.stub.startQuiz();
        if (res && res.workflowId) {
          const latestState = await agent.stub.getState();
          if (latestState) {
            setState((prev) => ({ ...prev, ...latestState }));
          }
        }
      } else {
        setActionError("서버 에이전트에 아직 연결되지 않았습니다. 잠시 후 다시 시도하세요.");
      }
    } catch (err: any) {
      console.error("퀴즈 시작 실패:", err);
      setActionError(err.message || "퀴즈 시작 처리 도중 에러가 발생했습니다.");
    }
  };

  const handleCloseAnswering = async () => {
    setActionError(null);
    try {
      if (agent && agent.stub) {
        const res = await agent.stub.closeAnsweringEarly(state.currentRound);
        if (res && res.state) {
          setState((prev) => ({ ...prev, ...res.state }));
        }
      }
    } catch (err: any) {
      console.error("답변 창 조기 마감 실패:", err);
      setActionError(err.message || "답변 마감 처리 도중 에러가 발생했습니다.");
    }
  };

  const handleApproveFinal = async () => {
    setActionError(null);
    try {
      if (agent && agent.stub) {
        const res = await agent.stub.approveFinalResults();
        if (res && res.state) {
          setState((prev) => ({ ...prev, ...res.state }));
        } else if (res && !res.success) {
          setActionError(res.reason || "최종 승인 처리에 실패했습니다.");
        }
      }
    } catch (err: any) {
      console.error("최종 승인 실패:", err);
      setActionError(err.message || "최종 승인 처리 도중 에러가 발생했습니다.");
    }
  };

  const handleResetQuiz = async () => {
    setActionError(null);
    try {
      if (agent && agent.stub) {
        const res = await agent.stub.resetQuiz();
        if (res && res.state) {
          setState((prev) => ({ ...prev, ...res.state }));
        }
      }
    } catch (err: any) {
      console.error("퀴즈 리셋 실패:", err);
      setActionError(err.message || "퀴즈 리셋 처리 도중 에러가 발생했습니다.");
    }
  };

  const currentAnswers = state.answers || {};
  const currentGrades = state.grades || {};
  const playersMap = state.players || {};

  const currentRoundAnswers = currentAnswers[state.currentRound] || {};
  const currentRoundGrades = currentGrades[state.currentRound] || {};

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* 상단 진행자 대시보드 헤더 */}
        <header className="bg-slate-900/90 backdrop-blur-md rounded-2xl border border-slate-800 p-6 shadow-2xl flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl shadow-lg shadow-indigo-500/20 text-white">
              <Sparkles className="w-7 h-7" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold font-mono bg-purple-500/20 text-purple-300 border border-purple-500/30 px-2.5 py-0.5 rounded-full">
                  HOST CONTROLLER
                </span>
                <span className="text-xs text-slate-400">
                  Workflow ID: {state.workflowId || "대기 중"}
                </span>
              </div>
              <h1 className="text-2xl font-extrabold tracking-tight text-white mt-1">
                🎮 실시간 퀴즈쇼 진행자 대시보드
              </h1>
            </div>
          </div>

          {/* 메인 상태 액션 버튼 */}
          <div className="flex items-center gap-3">
            {state.status === "idle" && (
              <button
                type="button"
                onClick={handleStartQuiz}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-bold text-base shadow-lg shadow-emerald-500/25 hover:from-emerald-400 hover:to-teal-500 transition-all hover:scale-105 active:scale-95 cursor-pointer"
              >
                <Play className="w-5 h-5 fill-current" />
                퀴즈쇼 시작하기 (5개 라운드)
              </button>
            )}

            {state.status === "in_progress" && state.isAnsweringOpen && (
              <button
                type="button"
                onClick={handleCloseAnswering}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-600 text-white font-bold text-sm shadow-lg shadow-amber-600/20 hover:bg-amber-500 transition-all hover:scale-105 active:scale-95 cursor-pointer"
              >
                <Clock className="w-4 h-4" />
                답변 창 조기 마감하기
              </button>
            )}

            {(state.status === "awaiting_approval" || state.roundStage === "awaiting_approval") && !state.finalApproved && (
              <button
                type="button"
                onClick={handleApproveFinal}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 text-white font-extrabold text-base shadow-xl shadow-amber-500/30 hover:from-amber-400 hover:to-orange-500 transition-all hover:scale-105 animate-pulse cursor-pointer"
              >
                <Award className="w-5 h-5" />
                최종 결과 승인 및 공개하기 (waitForApproval)
              </button>
            )}

            {(state.status === "completed" || state.finalApproved || state.status === "awaiting_approval") && (
              <button
                type="button"
                onClick={handleResetQuiz}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm shadow-lg shadow-indigo-600/20 transition-all hover:scale-105 active:scale-95 cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
                새 퀴즈쇼 다시 열기 (Reset)
              </button>
            )}

            {state.finalApproved && (
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-bold text-sm">
                <CheckCircle2 className="w-4 h-4" /> 최종 승인 및 완료됨
              </div>
            )}
          </div>
        </header>

        {/* 액션 오류 메시지 알림 바 */}
        {actionError && (
          <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-4 flex items-center justify-between text-rose-300 text-sm">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
              <span>{actionError}</span>
            </div>
            <button
              onClick={() => setActionError(null)}
              className="text-xs text-rose-400 underline hover:text-rose-200"
            >
              닫기
            </button>
          </div>
        )}

        {/* 상태 요약 바 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-slate-900/60 rounded-xl border border-slate-800 p-4">
            <span className="text-xs text-slate-400 font-medium">현재 단계</span>
            <div className="text-lg font-extrabold text-indigo-400 mt-1 capitalize">
              {state.status === "idle" && "대기 중"}
              {state.status === "in_progress" && `라운드 ${state.currentRound || 1} / 5`}
              {state.status === "awaiting_approval" && "최종 승인 대기"}
              {state.status === "completed" && "퀴즈 종료"}
            </div>
          </div>

          <div className="bg-slate-900/60 rounded-xl border border-slate-800 p-4">
            <span className="text-xs text-slate-400 font-medium">라운드 세부 진행</span>
            <div className="text-lg font-bold text-slate-200 mt-1 capitalize">
              {state.roundStage === "idle" && "준비 중"}
              {state.roundStage === "question" && "문제 생성 중..."}
              {state.roundStage === "answering" && "답변 수집 중 (60초)"}
              {state.roundStage === "grading" && "LLM 채점 진행 중..."}
              {state.roundStage === "leaderboard" && "순위표 갱신됨"}
              {state.roundStage === "awaiting_approval" && "승인 대기 중"}
              {state.roundStage === "finished" && "최종 결과 게재 완료"}
            </div>
          </div>

          <div className="bg-slate-900/60 rounded-xl border border-slate-800 p-4">
            <span className="text-xs text-slate-400 font-medium">답변 제한시간</span>
            <div className="text-lg font-mono font-extrabold text-amber-400 mt-1 flex items-center gap-1.5">
              <Clock className="w-4 h-4" />
              {state.isAnsweringOpen ? `${timeLeft} 초` : "닫힘"}
            </div>
          </div>

          <div className="bg-slate-900/60 rounded-xl border border-slate-800 p-4">
            <span className="text-xs text-slate-400 font-medium">참가자 수</span>
            <div className="text-lg font-mono font-extrabold text-cyan-400 mt-1 flex items-center gap-1.5">
              <Users className="w-4 h-4" />
              {Object.keys(playersMap).length} 명
            </div>
          </div>
        </div>

        {/* 대시보드 메인 영역 */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* 왼쪽 2열: 현재 질문 및 참가자 답변 / 채점 현황 */}
          <div className="lg:col-span-2 space-y-6">
            {/* 현재 질문 카드 */}
            <div className="bg-slate-900/80 backdrop-blur-md rounded-2xl border border-slate-800 p-6 shadow-xl relative overflow-hidden">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-3 py-1 rounded-full">
                  ROUND {state.currentRound || 1} • {state.currentQuestion?.topic || "주제 대기중"}
                </span>
                {state.isAnsweringOpen && (
                  <span className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-3 py-1 rounded-full animate-pulse">
                    <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                    답변 수집 중
                  </span>
                )}
              </div>

              {state.currentQuestion ? (
                <div className="space-y-3">
                  <h2 className="text-xl font-bold text-white leading-relaxed">
                    {state.currentQuestion.question}
                  </h2>
                  <div className="flex items-start gap-2 bg-slate-800/60 p-3 rounded-xl border border-slate-700/50 text-sm text-slate-300">
                    <HelpCircle className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-semibold text-purple-300">힌트: </span>
                      {state.currentQuestion.hint}
                    </div>
                  </div>
                  <div className="flex items-start gap-2 bg-indigo-950/40 p-3 rounded-xl border border-indigo-800/40 text-sm text-indigo-200">
                    <Lock className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-semibold text-indigo-300">기준 정답: </span>
                      {state.currentQuestion.referenceAnswer}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="py-10 text-center text-slate-500">
                  퀴즈가 시작되면 문제가 생성됩니다.
                </div>
              )}
            </div>

            {/* 참가자 답변 및 LLM 채점 현황 */}
            <div className="bg-slate-900/80 backdrop-blur-md rounded-2xl border border-slate-800 p-6 shadow-xl">
              <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                <Users className="w-5 h-5 text-indigo-400" />
                라운드 {state.currentRound || 1} 제출된 답변 & LLM 채점 결과
              </h3>

              {Object.keys(playersMap).length === 0 ? (
                <div className="py-6 text-center text-slate-500 text-sm">
                  아직 방에 입장한 플레이어가 없습니다.
                </div>
              ) : (
                <div className="space-y-3">
                  {Object.values(playersMap).map((player) => {
                    const ansRecord = currentRoundAnswers[player.id];
                    const gradeResult = currentRoundGrades[player.id];

                    return (
                      <div
                        key={player.id}
                        className="bg-slate-800/50 border border-slate-700/60 rounded-xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-3"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-white text-base">
                              {player.name}
                            </span>
                            {ansRecord ? (
                              <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                                제출 완료
                              </span>
                            ) : (
                              <span className="text-[10px] font-bold text-slate-400 bg-slate-700/50 px-2 py-0.5 rounded-full">
                                미제출
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-slate-300 font-mono bg-slate-900/60 px-3 py-1.5 rounded-lg border border-slate-800 inline-block">
                            답변: "{ansRecord?.answerText || "N/A"}"
                          </p>
                        </div>

                        {/* 채점 결과 표시 */}
                        {gradeResult ? (
                          <div className="text-right bg-slate-900/80 p-2.5 rounded-xl border border-slate-700/80 w-full md:w-auto">
                            <div className="flex items-center justify-end gap-1.5">
                              {gradeResult.isCorrect ? (
                                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                              ) : (
                                <AlertCircle className="w-4 h-4 text-rose-400" />
                              )}
                              <span className="font-mono text-base font-extrabold text-amber-400">
                                +{gradeResult.score}점
                              </span>
                            </div>
                            <p className="text-xs text-slate-400 mt-0.5">
                              {gradeResult.feedback}
                            </p>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-500 italic">
                            채점 대기 중...
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* 오른쪽 1열: 실시간 순위표 */}
          <div>
            <Leaderboard entries={state.leaderboard || []} />
          </div>
        </div>
      </div>
    </div>
  );
}
