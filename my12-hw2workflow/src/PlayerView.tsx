import { useState, useEffect } from "react";
import { useAgent } from "agents/react";
import type { QuizState } from "../worker/types";
import { Leaderboard } from "./Leaderboard";
import {
  Send,
  Clock,
  Sparkles,
  Award,
  HelpCircle,
  CheckCircle2,
  AlertCircle,
  Smile,
  Zap,
  UserPlus,
} from "lucide-react";

export function PlayerView() {
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
    query: { role: "player" },
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

  const [nameInput, setNameInput] = useState("");
  const [playerId, setPlayerId] = useState<string | null>(() => {
    return localStorage.getItem("quiz_player_id");
  });
  const [playerName, setPlayerName] = useState<string | null>(() => {
    return localStorage.getItem("quiz_player_name");
  });

  const [answerText, setAnswerText] = useState("");
  const [submittedAnswer, setSubmittedAnswer] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [submitMessage, setSubmitMessage] = useState<string | null>(null);

  // 60초 타이머
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

  // 라운드가 바뀌면 제출 상태 초기화
  useEffect(() => {
    setAnswerText("");
    setSubmittedAnswer(null);
    setSubmitMessage(null);
  }, [state.currentRound]);

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nameInput.trim()) return;

    try {
      if (agent && agent.stub) {
        const res = await agent.stub.joinGame(nameInput.trim());
        if (res && res.playerId) {
          setPlayerId(res.playerId);
          setPlayerName(res.name);
          localStorage.setItem("quiz_player_id", res.playerId);
          localStorage.setItem("quiz_player_name", res.name);
          if (res.state) {
            setState((prev) => ({ ...prev, ...res.state }));
          }
        }
      }
    } catch (err) {
      console.error("참가 실패:", err);
    }
  };

  const handleSwitchPlayer = () => {
    localStorage.removeItem("quiz_player_id");
    localStorage.removeItem("quiz_player_name");
    setPlayerId(null);
    setPlayerName(null);
    setNameInput("");
  };

  const handleSubmitAnswer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!playerId || !answerText.trim() || !state.isAnsweringOpen) return;

    try {
      if (agent && agent.stub) {
        const res = await agent.stub.submitAnswer(
          state.currentRound,
          playerId,
          answerText.trim()
        );

        if (res.success) {
          setSubmittedAnswer(answerText.trim());
          setSubmitMessage("답변이 성공적으로 제출되었습니다!");
        } else {
          setSubmitMessage(res.reason || "제출에 실패했습니다.");
        }
      }
    } catch (err: any) {
      console.error("답변 제출 오류:", err);
      setSubmitMessage("답변 제출 도중 에러가 발생했습니다.");
    }
  };

  const playersMap = state.players || {};
  const gradesMap = state.grades || {};
  const myPlayerInfo = playerId ? playersMap[playerId] : null;
  const currentRoundGrades = gradesMap[state.currentRound] || {};
  const myGrade = playerId ? currentRoundGrades[playerId] : null;

  // 닉네임 입력창 (참가 전)
  if (!playerId || !playerName) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
        <div className="bg-slate-900/90 backdrop-blur-md rounded-3xl border border-slate-800 p-8 max-w-md w-full shadow-2xl space-y-6">
          <div className="text-center space-y-3">
            <div className="inline-flex p-4 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl text-white shadow-lg shadow-indigo-500/30">
              <Sparkles className="w-10 h-10 animate-bounce" />
            </div>
            <h1 className="text-2xl font-extrabold text-white tracking-tight">
              실시간 AI 퀴즈쇼 입장
            </h1>
            <p className="text-sm text-slate-400">
              닉네임을 입력하고 퀴즈쇼 방에 입장하세요!
            </p>

            {/* 현재 퀴즈쇼 상태 알림 뱃지 */}
            {state.status === "in_progress" && (
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-bold animate-pulse">
                <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                현재 라운드 {state.currentRound || 1} 퀴즈쇼가 진행 중입니다!
              </div>
            )}
          </div>

          <form onSubmit={handleJoin} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                플레이어 닉네임
              </label>
              <input
                type="text"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                placeholder="예: 퀴즈왕길동"
                required
                className="w-full bg-slate-800/80 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
              />
            </div>

            <button
              type="submit"
              className="w-full bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-400 hover:to-purple-500 text-white font-bold py-3.5 px-4 rounded-xl shadow-lg shadow-indigo-500/25 transition-all hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2 cursor-pointer"
            >
              <Smile className="w-5 h-5" /> 퀴즈쇼 참여하기
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* 참가자 프로필 헤더 */}
        <header className="bg-slate-900/90 backdrop-blur-md rounded-2xl border border-slate-800 p-5 shadow-xl flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-indigo-500/10 rounded-xl border border-indigo-500/20 text-indigo-400">
              <Zap className="w-6 h-6" />
            </div>
            <div>
              <div className="text-xs text-slate-400">참가자 프로필</div>
              <div className="text-lg font-extrabold text-white flex items-center gap-2">
                {playerName}
                <span className="text-xs font-mono bg-slate-800 text-slate-300 px-2 py-0.5 rounded-full border border-slate-700">
                  ID: {playerId.slice(-4)}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={handleSwitchPlayer}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-indigo-300 hover:text-white text-xs font-bold rounded-xl border border-slate-700 hover:border-indigo-500/50 transition-all cursor-pointer shadow-sm"
              title="다른 닉네임으로 새로 참가하기"
            >
              <UserPlus className="w-3.5 h-3.5 text-indigo-400" />
              신규 참가자 추가 / 변경
            </button>

            <div className="text-right">
              <div className="text-xs text-slate-400">내 총점</div>
              <div className="text-xl font-mono font-extrabold text-amber-400 flex items-center gap-1 justify-end">
                <Award className="w-5 h-5" />
                {myPlayerInfo?.score || 0} 점
              </div>
            </div>
          </div>
        </header>

        {/* 대기 상태 화면 */}
        {state.status === "idle" && (
          <div className="bg-slate-900/80 backdrop-blur-md rounded-3xl border border-slate-800 p-10 text-center shadow-xl space-y-4">
            <div className="inline-flex p-4 bg-purple-500/10 text-purple-400 rounded-2xl border border-purple-500/20">
              <Clock className="w-8 h-8 animate-spin" />
            </div>
            <h2 className="text-xl font-bold text-white">
              진행자가 퀴즈를 시작하기를 기다리는 중입니다...
            </h2>
            <p className="text-slate-400 text-sm">
              잠시 후 5개의 라운드로 구성된 AI 퀴즈쇼가 개막됩니다!
            </p>
          </div>
        )}

        {/* 퀴즈 진행 중 메인 카드 */}
        {state.status === "in_progress" && (
          <div className="space-y-6">
            {/* 문제 카드 */}
            <div className="bg-slate-900/90 backdrop-blur-md rounded-3xl border border-slate-800 p-6 md:p-8 shadow-2xl space-y-6 relative overflow-hidden">
              <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                <span className="text-sm font-extrabold text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-3.5 py-1 rounded-full">
                  ROUND {state.currentRound || 1} / 5 • {state.currentQuestion?.topic || "주제 대기중"}
                </span>

                <div className="flex items-center gap-2 text-amber-400 font-mono font-extrabold text-base bg-amber-500/10 border border-amber-500/20 px-4 py-1 rounded-full">
                  <Clock className="w-4 h-4 animate-pulse" />
                  {state.isAnsweringOpen ? `${timeLeft}초 남음` : "시간 종료"}
                </div>
              </div>

              {state.currentQuestion ? (
                <div className="space-y-4">
                  <h2 className="text-2xl md:text-3xl font-extrabold text-white leading-tight">
                    {state.currentQuestion.question}
                  </h2>

                  <div className="flex items-start gap-2.5 bg-slate-800/60 p-4 rounded-2xl border border-slate-700/50 text-sm text-slate-300">
                    <HelpCircle className="w-5 h-5 text-purple-400 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold text-purple-300">힌트: </span>
                      {state.currentQuestion.hint}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="py-8 text-center text-slate-500">
                  문제 생성 중...
                </div>
              )}

              {/* 자유 서술형 답변 제출 폼 */}
              {state.isAnsweringOpen && !submittedAnswer ? (
                <form onSubmit={handleSubmitAnswer} className="space-y-4 pt-2">
                  <div>
                    <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                      내 답변 입력 (자유 서술형 - 유사어/철자 오차 고려 채점)
                    </label>
                    <input
                      type="text"
                      value={answerText}
                      onChange={(e) => setAnswerText(e.target.value)}
                      placeholder="정답을 자유롭게 입력하세요..."
                      required
                      className="w-full bg-slate-800 border border-slate-700 rounded-2xl px-5 py-4 text-white text-lg placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all shadow-inner"
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-400 hover:to-purple-500 text-white font-extrabold text-lg py-4 px-6 rounded-2xl shadow-xl shadow-indigo-500/25 transition-all hover:scale-[1.01] active:scale-[0.99] flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Send className="w-5 h-5" /> 답변 제출하기
                  </button>
                </form>
              ) : (
                <div className="bg-slate-800/80 rounded-2xl p-5 border border-slate-700 text-center space-y-2">
                  {submittedAnswer ? (
                    <div className="space-y-1">
                      <div className="flex items-center justify-center gap-2 text-emerald-400 font-bold text-base">
                        <CheckCircle2 className="w-5 h-5" /> 답변이 제출되었습니다!
                      </div>
                      <p className="text-slate-300 font-mono text-sm">
                        내 제출 답변: "{submittedAnswer}"
                      </p>
                    </div>
                  ) : (
                    <p className="text-slate-400 text-sm">
                      현재 라운드의 답변 제출이 마감되었습니다. 채점 결과를 기다리세요!
                    </p>
                  )}
                  {submitMessage && (
                    <p className="text-xs text-indigo-300 font-medium">{submitMessage}</p>
                  )}
                </div>
              )}

              {/* LLM 채점 결과 표시 */}
              {myGrade && (
                <div className="mt-4 p-5 rounded-2xl bg-indigo-950/60 border border-indigo-500/30 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-indigo-300 uppercase tracking-wider">
                      라운드 {state.currentRound} LLM 채점 결과
                    </span>
                    <span className="font-mono font-extrabold text-amber-400 text-lg">
                      +{myGrade.score} 점
                    </span>
                  </div>
                  <div className="flex items-start gap-2 text-sm text-slate-200">
                    {myGrade.isCorrect ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                    )}
                    <div>
                      <p className="font-bold text-white">{myGrade.feedback}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* 순위표 */}
            <Leaderboard entries={state.leaderboard || []} currentPlayerId={playerId} />
          </div>
        )}

        {/* 퀴즈 종료 및 최종 승인 뷰 */}
        {(state.status === "awaiting_approval" || state.status === "completed") && (
          <div className="bg-slate-900/90 backdrop-blur-md rounded-3xl border border-slate-800 p-8 shadow-2xl text-center space-y-6">
            <div className="inline-flex p-5 bg-gradient-to-br from-amber-500 to-orange-600 rounded-3xl text-white shadow-xl shadow-amber-500/20">
              <Award className="w-12 h-12" />
            </div>

            <div className="space-y-2">
              <h2 className="text-3xl font-extrabold text-white">
                🎉 퀴즈쇼가 모두 종료되었습니다!
              </h2>
              <p className="text-slate-400 text-base">
                {state.finalApproved
                  ? "진행자의 최종 승인을 거쳐 결과가 확정 게시되었습니다."
                  : "진행자의 최종 승인을 기다리고 있습니다."}
              </p>
            </div>

            <Leaderboard entries={state.leaderboard || []} currentPlayerId={playerId} />
          </div>
        )}
      </div>
    </div>
  );
}
