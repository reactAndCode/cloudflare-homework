import React from "react";
import type { LeaderboardEntry } from "../worker/types";
import { Trophy, Medal, Award, UserCheck } from "lucide-react";

interface LeaderboardProps {
  entries: LeaderboardEntry[];
  currentPlayerId?: string;
}

export const Leaderboard: React.FC<LeaderboardProps> = ({
  entries,
  currentPlayerId,
}) => {
  return (
    <div className="bg-slate-900/80 backdrop-blur-md rounded-2xl p-6 border border-slate-800 shadow-xl">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2.5">
          <div className="p-2.5 bg-amber-500/10 rounded-xl border border-amber-500/20 text-amber-400">
            <Trophy className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white tracking-tight">
              실시간 순위표
            </h3>
            <p className="text-xs text-slate-400">
              총 {entries.length}명의 참가자
            </p>
          </div>
        </div>
      </div>

      {entries.length === 0 ? (
        <div className="py-8 text-center text-slate-500 text-sm">
          아직 참가한 플레이어가 없습니다.
        </div>
      ) : (
        <div className="space-y-2.5">
          {entries.map((entry) => {
            const isSelf = entry.playerId === currentPlayerId;
            return (
              <div
                key={entry.playerId}
                className={`flex items-center justify-between p-3.5 rounded-xl transition-all duration-200 ${
                  isSelf
                    ? "bg-indigo-600/20 border border-indigo-500/50 shadow-lg shadow-indigo-500/10"
                    : "bg-slate-800/50 border border-slate-700/50 hover:bg-slate-800/80"
                }`}
              >
                <div className="flex items-center gap-3">
                  {/* 순위 아이콘/배지 */}
                  <div className="w-8 h-8 flex items-center justify-center rounded-lg text-sm font-extrabold">
                    {entry.rank === 1 && (
                      <span className="text-amber-400 flex items-center justify-center">
                        <Medal className="w-6 h-6 text-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.5)]" />
                      </span>
                    )}
                    {entry.rank === 2 && (
                      <span className="text-slate-300 flex items-center justify-center">
                        <Medal className="w-6 h-6 text-slate-300" />
                      </span>
                    )}
                    {entry.rank === 3 && (
                      <span className="text-amber-700 flex items-center justify-center">
                        <Award className="w-6 h-6 text-amber-700" />
                      </span>
                    )}
                    {entry.rank > 3 && (
                      <span className="text-slate-400 font-mono">
                        #{entry.rank}
                      </span>
                    )}
                  </div>

                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-white text-sm">
                        {entry.name}
                      </span>
                      {isSelf && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-2 py-0.5 rounded-full">
                          <UserCheck className="w-3 h-3" /> 나
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="text-right">
                  <span className="font-mono text-base font-extrabold text-amber-400">
                    {entry.score}
                  </span>
                  <span className="text-xs text-slate-400 ml-1">점</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
