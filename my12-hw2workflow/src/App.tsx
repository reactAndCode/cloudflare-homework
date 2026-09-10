import { useState, useEffect } from "react";
import { HostView } from "./HostView";
import { PlayerView } from "./PlayerView";
import { Sparkles, User, Monitor } from "lucide-react";

export default function App() {
  const [isHost, setIsHost] = useState<boolean>(() => {
    return window.location.pathname.startsWith("/host");
  });

  useEffect(() => {
    const handlePopState = () => {
      setIsHost(window.location.pathname.startsWith("/host"));
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const navigateTo = (path: string) => {
    window.history.pushState({}, "", path);
    setIsHost(path.startsWith("/host"));
  };

  return (
    <div className="min-h-screen bg-slate-950 font-sans text-slate-100 flex flex-col">
      {/* 상단 통합 네비게이션 헤더 */}
      <nav className="bg-slate-900/90 backdrop-blur-md border-b border-slate-800 sticky top-0 z-50 px-4 py-3">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div
            onClick={() => navigateTo("/")}
            className="flex items-center gap-2.5 cursor-pointer group"
          >
            <div className="p-2 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl text-white shadow-md shadow-indigo-500/20 group-hover:scale-105 transition-all">
              <Sparkles className="w-5 h-5" />
            </div>
            <span className="font-extrabold text-lg tracking-tight text-white group-hover:text-indigo-300 transition-colors">
              QuizFlow Live
            </span>
          </div>

          <div className="flex items-center gap-1 bg-slate-800/80 p-1 rounded-xl border border-slate-700/60">
            <button
              type="button"
              onClick={() => navigateTo("/")}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                !isHost
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-500/20"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <User className="w-3.5 h-3.5" />
              참가자 화면 (Player)
            </button>
            <button
              type="button"
              onClick={() => navigateTo("/host")}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                isHost
                  ? "bg-purple-600 text-white shadow-md shadow-purple-500/20"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Monitor className="w-3.5 h-3.5" />
              진행자 화면 (Host)
            </button>
          </div>
        </div>
      </nav>

      {/* 메인 화면 영역 */}
      <main className="flex-1">
        {isHost ? <HostView /> : <PlayerView />}
      </main>
    </div>
  );
}
