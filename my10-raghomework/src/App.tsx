import { useAgentChat } from "@cloudflare/ai-chat/react";
import { useAgent } from "agents/react";
import { getToolName, isToolUIPart, type UIMessage } from "ai";
import {
  AlertCircle,
  BookOpen,
  Bot,
  Brain,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Compass,
  CornerDownLeft,
  Database,
  ExternalLink,
  Globe,
  HardDrive,
  Layers,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  StopCircle,
  Trash2,
  User,
  X,
  Zap,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface SourceInfo {
  url: string;
  title: string;
  chunks_count: number;
  created_at: string;
}

interface ChunkInfo {
  id: string;
  url: string;
  title: string;
  text: string;
  created_at: number;
}

interface IngestStatus {
  step: "fetching" | "chunking" | "embedding" | "completed" | "error";
  message: string;
  url?: string;
  title?: string;
  chunksCount?: number;
  snippet?: string;
}

export default function App() {
  const [sources, setSources] = useState<SourceInfo[]>([]);
  const [isSourcesOpen, setIsSourcesOpen] = useState(false);
  const [inputUrl, setInputUrl] = useState("");
  const [ingestStatus, setIngestStatus] = useState<IngestStatus | null>(null);
  const [inputMessage, setInputMessage] = useState("");
  const [selectedSourceChunks, setSelectedSourceChunks] = useState<{
    url: string;
    chunks: ChunkInfo[];
  } | null>(null);
  const [loadingChunks, setLoadingChunks] = useState(false);
  const [deletingUrl, setDeletingUrl] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const urlInputRef = useRef<HTMLInputElement>(null);

  // Cloudflare Agents DO 연결
  const agent = useAgent({ agent: "SecondBrainAgent" });

  const {
    messages,
    sendMessage,
    clearHistory,
    status,
    stop,
    addToolApprovalResponse,
  } = useAgentChat({ agent });

  // 세컨드 브레인 저장 출처 목록 조회
  const fetchSources = async () => {
    try {
      const res = await fetch("/api/sources");
      if (res.ok) {
        const data = await res.json();
        setSources(data.sources || []);
      }
    } catch (err) {
      console.error("출처 목록 조회 실패:", err);
    }
  };

  useEffect(() => {
    fetchSources();
  }, []);

  // 메시지 및 상태 업데이트 시 자동 스크롤
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, ingestStatus]);

  // URL 마크다운 변환 및 세컨드브레인 인제스트
  const handleIngestUrl = async (targetUrl?: string) => {
    const urlToProcess = targetUrl || inputUrl.trim();
    if (!urlToProcess) return;

    if (!urlToProcess.startsWith("http://") && !urlToProcess.startsWith("https://")) {
      setIngestStatus({
        step: "error",
        message: "올바른 HTTP 또는 HTTPS 웹페이지 URL을 입력해주세요.",
      });
      return;
    }

    try {
      setIngestStatus({
        step: "fetching",
        message: "Cloudflare Browser Rendering API로 웹페이지를 마크다운으로 변환 중...",
        url: urlToProcess,
      });

      const res = await fetch("/api/ingest-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: urlToProcess }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || "URL 인제스트 처리에 실패했습니다.");
      }

      setIngestStatus({
        step: "completed",
        message: `기억 완료! 총 ${data.data.chunksCount}개 조각으로 분할되어 Vectorize와 SQLite에 저장되었습니다.`,
        url: urlToProcess,
        title: data.data.title,
        chunksCount: data.data.chunksCount,
        snippet: data.data.snippet,
      });

      setInputUrl("");
      fetchSources();
    } catch (err: any) {
      setIngestStatus({
        step: "error",
        message: err.message || "웹페이지를 세컨드 브레인에 저장하는 중 오류가 발생했습니다.",
        url: urlToProcess,
      });
    }
  };

  // 특정 출처의 SQLite 청크 상세 조회
  const handleViewChunks = async (sourceUrl: string) => {
    if (selectedSourceChunks?.url === sourceUrl) {
      setSelectedSourceChunks(null);
      return;
    }

    setLoadingChunks(true);
    try {
      const res = await fetch(`/api/chunks?url=${encodeURIComponent(sourceUrl)}`);
      if (res.ok) {
        const data = await res.json();
        setSelectedSourceChunks({ url: sourceUrl, chunks: data.chunks || [] });
      }
    } catch (err) {
      console.error("청크 상세 조회 실패:", err);
    } finally {
      setLoadingChunks(false);
    }
  };

  // 기억된 웹페이지 삭제 핸들러 (Vectorize 벡터 + SQLite chunks/sources 동시 삭제)
  const handleDeleteSource = async (urlToDelete: string) => {
    if (
      !window.confirm(
        `이 웹페이지와 관련된 모든 기억(Vectorize 벡터 및 SQLite 지식 조각)을 세컨드 브레인에서 삭제하시겠습니까?\n\nURL: ${urlToDelete}`
      )
    ) {
      return;
    }

    setDeletingUrl(urlToDelete);
    try {
      const res = await fetch(`/api/sources?url=${encodeURIComponent(urlToDelete)}`, {
        method: "DELETE",
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || "웹페이지 삭제에 실패했습니다.");
      }

      setSources((prev) => prev.filter((s) => s.url !== urlToDelete));
      if (selectedSourceChunks?.url === urlToDelete) {
        setSelectedSourceChunks(null);
      }

      setIngestStatus({
        step: "completed",
        message: data.message || "웹페이지가 성공적으로 세컨드 브레인에서 삭제되었습니다.",
      });
    } catch (err: any) {
      alert(err.message || "삭제 처리 중 오류가 발생했습니다.");
    } finally {
      setDeletingUrl(null);
    }
  };

  // 전체 기억 초기화 핸들러
  const handleClearAllSources = async () => {
    if (sources.length === 0) return;
    if (
      !window.confirm(
        "정말로 세컨드 브레인에 저장된 모든 웹페이지와 지식 조각을 초기화하시겠습니까?\n이 작업은 되돌릴 수 없습니다."
      )
    ) {
      return;
    }

    setDeletingUrl("__ALL__");
    try {
      const res = await fetch("/api/sources", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || "전체 기억 초기화에 실패했습니다.");
      }

      setSources([]);
      setSelectedSourceChunks(null);

      setIngestStatus({
        step: "completed",
        message: "세컨드 브레인의 모든 기억이 성공적으로 초기화되었습니다.",
      });
    } catch (err: any) {
      alert(err.message || "초기화 처리 중 오류가 발생했습니다.");
    } finally {
      setDeletingUrl(null);
    }
  };

  // 채팅 메시지 전송
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim() || status === "submitted" || status === "streaming") return;

    sendMessage({ text: inputMessage.trim() });
    setInputMessage("");
  };

  // 추천 프롬프트 전송
  const handleQuickPrompt = (promptText: string) => {
    if (status === "submitted" || status === "streaming") return;
    sendMessage({ text: promptText });
  };

  // 도구 및 메시지 파트 렌더러
  function renderMessage(msg: UIMessage) {
    return msg.parts.map((part, i) => {
      if (part.type === "text") {
        return (
          <div key={i} className="text-[14px] leading-relaxed whitespace-pre-wrap font-sans">
            {part.text}
          </div>
        );
      }

      if (part.type === "reasoning") {
        return (
          <div
            key={i}
            className="my-2 rounded-lg border-l-2 border-purple-500/80 bg-purple-950/20 px-3 py-2 text-xs italic text-purple-300/80"
          >
            <div className="flex items-center gap-1.5 font-medium not-italic text-purple-400 mb-1">
              <Sparkles className="w-3.5 h-3.5" />
              <span>추론 과정 (Reasoning)</span>
            </div>
            {part.text}
          </div>
        );
      }

      if (isToolUIPart(part)) {
        const toolName = getToolName(part);

        // 승인 대기 상태
        if ("approval" in part && part.state === "approval-requested") {
          return (
            <div
              key={i}
              className="my-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3.5 text-xs text-amber-200 shadow-sm"
            >
              <div className="font-semibold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-amber-400" />
                <span>[{toolName}] 실행 승인이 필요합니다.</span>
              </div>
              {"input" in part && part.input != null && (
                <pre className="mt-2 p-2 rounded-lg bg-black/40 text-zinc-300 overflow-x-auto text-[11px] font-mono">
                  {JSON.stringify(part.input, null, 2)}
                </pre>
              )}
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-medium transition cursor-pointer"
                  onClick={() =>
                    addToolApprovalResponse({
                      id: part.approval.id,
                      approved: true,
                    })
                  }
                >
                  승인
                </button>
                <button
                  type="button"
                  className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-medium transition cursor-pointer"
                  onClick={() =>
                    addToolApprovalResponse({
                      id: part.approval.id,
                      approved: false,
                    })
                  }
                >
                  거부
                </button>
              </div>
            </div>
          );
        }

        // 도구 실행 카드 렌더링
        const isRecall = toolName === "recall";
        const isListSources = toolName === "listSources";

        return (
          <div
            key={i}
            className={`my-3 rounded-xl border p-3.5 text-xs transition ${
              isRecall
                ? "border-indigo-500/30 bg-indigo-950/20 text-indigo-200"
                : isListSources
                ? "border-emerald-500/30 bg-emerald-950/20 text-emerald-200"
                : "border-zinc-800 bg-zinc-900/60 text-zinc-300"
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {isRecall ? (
                  <Search className="h-4 w-4 text-indigo-400 animate-pulse" />
                ) : isListSources ? (
                  <Layers className="h-4 w-4 text-emerald-400" />
                ) : (
                  <Zap className="h-4 w-4 text-amber-400" />
                )}
                <span className="font-semibold uppercase tracking-wider text-[11px]">
                  {isRecall ? "기억 소환 (Recall)" : isListSources ? "출처 목록 조회 (listSources)" : toolName}
                </span>
              </div>
              <span className="rounded-full bg-zinc-800/80 px-2 py-0.5 font-mono text-[10px] text-zinc-400">
                {part.state}
              </span>
            </div>

            {"input" in part && part.input != null && (
              <div className="mt-2 text-[11px] text-zinc-400">
                <span className="text-zinc-500">질의: </span>
                <span className="text-zinc-200 font-medium">
                  {typeof part.input === "object" && "question" in part.input
                    ? (part.input as any).question
                    : JSON.stringify(part.input)}
                </span>
              </div>
            )}

            {"output" in part && part.output != null && (
              <div className="mt-2 pt-2 border-t border-zinc-800/60">
                {isRecall && (part.output as any).retrievedPieces ? (
                  <div className="space-y-1.5">
                    <div className="text-[11px] font-medium text-indigo-300">
                      🎯 Vectorize 검색 ➜ SQLite 원문 Recall 완료: {(part.output as any).totalFound}개 조각 발견
                    </div>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {(part.output as any).retrievedPieces.map((p: any, idx: number) => (
                        <span
                          key={idx}
                          className="inline-flex items-center gap-1 rounded bg-indigo-900/40 border border-indigo-500/30 px-2 py-0.5 text-[10px] text-indigo-200"
                          title={p.text}
                        >
                          <Globe className="w-2.5 h-2.5" />
                          <span className="max-w-[140px] truncate">{p.title || p.sourceUrl}</span>
                          <span className="text-indigo-400 font-mono">({p.relevanceScore})</span>
                        </span>
                      ))}
                    </div>
                  </div>
                ) : isListSources && (part.output as any).sources ? (
                  <div className="text-[11px] text-emerald-300">
                    📚 기억된 웹페이지 출처: 총 {(part.output as any).totalSources}개 확인됨
                  </div>
                ) : (
                  <pre className="max-h-32 overflow-y-auto rounded bg-black/40 p-2 text-zinc-400 text-[10px] font-mono">
                    {JSON.stringify(part.output, null, 2)}
                  </pre>
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
    <div className="flex min-h-screen flex-col bg-[#0b0c10] text-zinc-100 selection:bg-purple-500/30 selection:text-purple-200">
      {/* 1. 상단 글로벌 헤더 */}
      <header className="sticky top-0 z-30 border-b border-zinc-800/80 bg-[#0b0c10]/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-purple-600 via-indigo-600 to-cyan-500 p-0.5 shadow-lg shadow-purple-500/20">
              <div className="flex h-full w-full items-center justify-center rounded-[10px] bg-[#0f1117]">
                <Brain className="h-5 w-5 text-purple-400 animate-pulse" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold tracking-tight text-zinc-100 flex items-center gap-1.5">
                  Second Brain <span className="text-purple-400">RAG</span>
                </h1>
                <span className="rounded-full bg-purple-500/10 px-2 py-0.5 text-[10px] font-medium text-purple-300 border border-purple-500/20 hidden sm:inline-flex items-center gap-1">
                  <Zap className="w-3 h-3 text-purple-400" />
                  Vectorize & SQLite DO
                </span>
              </div>
              <p className="text-[11px] text-zinc-400">
                Cloudflare Browser Rendering · 800자 청킹 · 세컨드 브레인 기억소
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* 기억 저장소 (Sources) 서랍 토글 */}
            <button
              onClick={() => setIsSourcesOpen(!isSourcesOpen)}
              className="flex items-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-900/80 px-3 py-1.5 text-xs font-medium text-zinc-300 transition hover:border-purple-500/40 hover:bg-zinc-800 hover:text-white cursor-pointer"
            >
              <BookOpen className="h-3.5 w-3.5 text-purple-400" />
              <span className="hidden sm:inline">기억 보관소</span>
              <span className="sm:hidden">출처</span>
              <span className="rounded-full bg-purple-500/20 px-1.5 py-0.2 text-[10px] text-purple-300 font-mono">
                {sources.length}
              </span>
            </button>

            {/* 대화 초기화 */}
            <button
              onClick={clearHistory}
              title="대화 초기화"
              className="flex items-center gap-1 rounded-xl border border-zinc-800/80 bg-zinc-900/50 p-2 text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-200 cursor-pointer"
            >
              <Trash2 className="h-4 w-4" />
            </button>

            {/* 스트리밍 중단 */}
            {status === "streaming" && (
              <button
                onClick={stop}
                className="flex items-center gap-1.5 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-400 transition hover:bg-rose-500/20 cursor-pointer"
              >
                <StopCircle className="h-3.5 w-3.5" />
                <span>중단</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* 2. 기억 보관소 (Sources Drawer 패널) */}
      {isSourcesOpen && (
        <div className="border-b border-zinc-800/90 bg-[#12141c]/95 p-4 sm:p-5 transition shadow-2xl">
          <div className="mx-auto max-w-5xl">
            <div className="flex items-center justify-between mb-3.5">
              <div className="flex items-center gap-2">
                <Database className="h-4 w-4 text-purple-400" />
                <h2 className="text-xs font-semibold text-zinc-200 uppercase tracking-wider">
                  세컨드 브레인에 기억된 웹페이지 ({sources.length})
                </h2>
              </div>
              <div className="flex items-center gap-2">
                {sources.length > 0 && (
                  <button
                    onClick={handleClearAllSources}
                    disabled={deletingUrl === "__ALL__"}
                    className="flex items-center gap-1 rounded-lg border border-rose-500/20 bg-rose-500/10 px-2 py-1 text-[11px] text-rose-400 hover:bg-rose-500/20 hover:text-rose-300 transition cursor-pointer disabled:opacity-50"
                    title="세컨드 브레인 전체 기억 초기화"
                  >
                    {deletingUrl === "__ALL__" ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Trash2 className="h-3 w-3" />
                    )}
                    <span>전체 삭제</span>
                  </button>
                )}
                <button
                  onClick={fetchSources}
                  className="flex items-center gap-1 text-[11px] text-zinc-400 hover:text-zinc-200 cursor-pointer"
                >
                  <RefreshCw className="h-3 w-3" />
                  새로고침
                </button>
                <button
                  onClick={() => setIsSourcesOpen(false)}
                  className="p-1 text-zinc-500 hover:text-zinc-300 cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {sources.length === 0 ? (
              <div className="rounded-xl border border-dashed border-zinc-800 p-6 text-center">
                <Compass className="mx-auto h-8 w-8 text-zinc-600 mb-2" />
                <p className="text-xs text-zinc-400 font-medium">아직 기억된 웹페이지가 없습니다.</p>
                <p className="text-[11px] text-zinc-500 mt-1">
                  아래 URL 입력 바에 웹페이지 주소를 입력하고 '기억하기'를 눌러보세요.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {sources.map((s) => {
                  const isSelected = selectedSourceChunks?.url === s.url;
                  return (
                    <div
                      key={s.url}
                      className={`group rounded-xl border p-3 text-xs transition flex flex-col justify-between ${
                        isSelected
                          ? "border-purple-500/60 bg-purple-950/20"
                          : "border-zinc-800/80 bg-[#0d0e14]/80 hover:border-zinc-700"
                      }`}
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <div className="font-semibold text-zinc-200 line-clamp-1 group-hover:text-purple-300 transition">
                            {s.title || s.url}
                          </div>
                          <div className="flex items-center gap-1 shrink-0 mt-0.5">
                            <a
                              href={s.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1 text-zinc-500 hover:text-purple-400 transition"
                              title="새 창에서 원본 열기"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                            <button
                              type="button"
                              onClick={() => handleDeleteSource(s.url)}
                              disabled={deletingUrl === s.url}
                              className="p-1 text-zinc-500 hover:text-rose-400 transition cursor-pointer disabled:opacity-50"
                              title="이 웹페이지 기억 삭제"
                            >
                              {deletingUrl === s.url ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin text-rose-400" />
                              ) : (
                                <Trash2 className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                        </div>
                        <p className="text-[11px] text-zinc-500 truncate mt-0.5" title={s.url}>
                          {s.url}
                        </p>
                      </div>

                      <div className="mt-3 pt-2.5 border-t border-zinc-800/60 flex items-center justify-between text-[10px] text-zinc-400">
                        <span className="flex items-center gap-1">
                          <Layers className="w-3 h-3 text-purple-400" />
                          <strong className="text-zinc-300">{s.chunks_count}개</strong> 조각
                        </span>
                        <button
                          onClick={() => handleViewChunks(s.url)}
                          className="flex items-center gap-0.5 text-purple-400 hover:text-purple-300 font-medium cursor-pointer"
                        >
                          <span>{isSelected ? "조각 닫기" : "조각 보기"}</span>
                          {isSelected ? (
                            <ChevronDown className="w-3 h-3" />
                          ) : (
                            <ChevronRight className="w-3 h-3" />
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* 선택한 출처의 SQLite 조각 미리보기 */}
            {selectedSourceChunks && (
              <div className="mt-4 rounded-xl border border-purple-500/30 bg-black/40 p-4">
                <div className="flex items-center justify-between mb-3 text-xs">
                  <span className="font-medium text-purple-300 flex items-center gap-1.5">
                    <HardDrive className="w-3.5 h-3.5 text-purple-400" />
                    SQLite chunks 테이블 저장 내역 ({selectedSourceChunks.chunks.length}개 텍스트 조각)
                  </span>
                  <button
                    onClick={() => setSelectedSourceChunks(null)}
                    className="text-zinc-500 hover:text-zinc-300 text-xs cursor-pointer"
                  >
                    닫기
                  </button>
                </div>
                {loadingChunks ? (
                  <div className="flex items-center justify-center py-6 text-zinc-500 gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-purple-400" />
                    <span className="text-xs">청크 데이터 로딩 중...</span>
                  </div>
                ) : (
                  <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
                    {selectedSourceChunks.chunks.map((c, idx) => (
                      <div
                        key={c.id}
                        className="rounded-lg border border-zinc-800/80 bg-zinc-900/60 p-2.5 text-xs text-zinc-300"
                      >
                        <div className="flex items-center justify-between text-[10px] text-zinc-500 mb-1 font-mono">
                          <span>조각 #{idx + 1}</span>
                          <span>ID: {c.id.slice(0, 8)}...</span>
                        </div>
                        <p className="text-[11px] leading-relaxed text-zinc-300 line-clamp-3">
                          {c.text}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 3. 메인 콘텐츠 */}
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col px-4 py-5 sm:py-6">
        {/* 상단 URL 인제스트 영역 */}
        <section className="mb-6 rounded-2xl border border-zinc-800/90 bg-gradient-to-b from-[#141622] to-[#0e1017] p-4 sm:p-5 shadow-xl shadow-black/30">
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-purple-400" />
                <h2 className="text-sm font-semibold text-zinc-100">
                  웹페이지 학습 및 세컨드 브레인 기억하기
                </h2>
              </div>
              <span className="text-[11px] text-zinc-500 hidden sm:inline">
                Cloudflare Markdown API 자동 파싱
              </span>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleIngestUrl();
              }}
              className="flex flex-col sm:flex-row gap-2.5"
            >
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                <input
                  ref={urlInputRef}
                  type="url"
                  placeholder="기억할 웹페이지 URL을 입력하세요 (예: https://developers.cloudflare.com/...)"
                  value={inputUrl}
                  onChange={(e) => setInputUrl(e.target.value)}
                  disabled={ingestStatus?.step === "fetching" || ingestStatus?.step === "chunking"}
                  className="w-full rounded-xl border border-zinc-800 bg-[#0a0b10] pl-10 pr-4 py-2.5 text-xs text-zinc-200 placeholder-zinc-500 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 transition disabled:opacity-50"
                />
              </div>
              <button
                type="submit"
                disabled={!inputUrl.trim() || ingestStatus?.step === "fetching"}
                className="flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 px-5 py-2.5 text-xs font-semibold text-white shadow-md shadow-purple-600/20 hover:from-purple-500 hover:to-indigo-500 transition disabled:opacity-50 cursor-pointer"
              >
                {ingestStatus?.step === "fetching" ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>학습 중...</span>
                  </>
                ) : (
                  <>
                    <Plus className="h-3.5 w-3.5" />
                    <span>브레인에 기억</span>
                  </>
                )}
              </button>
            </form>

            {/* 빠른 추천 URL 버튼들 */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[11px]">
              <span className="text-zinc-500 flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-purple-400" />
                추천 문서:
              </span>
              <button
                type="button"
                onClick={() =>
                  handleIngestUrl("https://developers.cloudflare.com/workers/runtime-apis/bindings/")
                }
                className="rounded-lg border border-zinc-800/80 bg-zinc-900/60 px-2.5 py-1 text-zinc-400 hover:border-purple-500/40 hover:text-purple-300 transition cursor-pointer"
              >
                Cloudflare Bindings
              </button>
              <button
                type="button"
                onClick={() =>
                  handleIngestUrl("https://developers.cloudflare.com/vectorize/get-started/")
                }
                className="rounded-lg border border-zinc-800/80 bg-zinc-900/60 px-2.5 py-1 text-zinc-400 hover:border-purple-500/40 hover:text-purple-300 transition cursor-pointer"
              >
                Vectorize Get Started
              </button>
              <button
                type="button"
                onClick={() =>
                  handleIngestUrl("https://developers.cloudflare.com/durable-objects/")
                }
                className="rounded-lg border border-zinc-800/80 bg-zinc-900/60 px-2.5 py-1 text-zinc-400 hover:border-purple-500/40 hover:text-purple-300 transition cursor-pointer"
              >
                Durable Objects
              </button>
            </div>

            {/* 인제스트 상태 및 완료 알림 */}
            {ingestStatus && (
              <div
                className={`mt-2 rounded-xl border p-3 text-xs transition ${
                  ingestStatus.step === "completed"
                    ? "border-emerald-500/30 bg-emerald-950/20 text-emerald-200"
                    : ingestStatus.step === "error"
                    ? "border-rose-500/30 bg-rose-950/20 text-rose-200"
                    : "border-purple-500/30 bg-purple-950/20 text-purple-200"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {ingestStatus.step === "completed" ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    ) : ingestStatus.step === "error" ? (
                      <AlertCircle className="h-4 w-4 text-rose-400" />
                    ) : (
                      <Loader2 className="h-4 w-4 animate-spin text-purple-400" />
                    )}
                    <span className="font-medium">{ingestStatus.message}</span>
                  </div>
                  <button
                    onClick={() => setIngestStatus(null)}
                    className="text-zinc-500 hover:text-zinc-300 p-0.5 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                {ingestStatus.step === "completed" && (
                  <div className="mt-2 text-[11px] text-zinc-400">
                    <div>
                      <strong className="text-zinc-200">제목:</strong> {ingestStatus.title}
                    </div>
                    {ingestStatus.snippet && (
                      <p className="mt-1 line-clamp-2 italic text-zinc-500 border-l border-zinc-700 pl-2">
                        "{ingestStatus.snippet}..."
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        {/* 대화 영역 카드 */}
        <div className="flex flex-1 flex-col rounded-2xl border border-zinc-800/80 bg-[#0f1118]/80 shadow-2xl backdrop-blur-sm overflow-hidden min-h-[460px]">
          {/* 메시지 리스트 스크롤 영역 */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
            {messages.length === 0 ? (
              <div className="flex h-full min-h-[300px] flex-col items-center justify-center text-center px-4">
                <div className="relative mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-tr from-purple-500/20 to-indigo-500/20 border border-purple-500/30 shadow-inner">
                  <Brain className="h-8 w-8 text-purple-400" />
                </div>
                <h3 className="text-base font-semibold text-zinc-100">
                  나만의 AI 세컨드 브레인에 오신 것을 환영합니다!
                </h3>
                <p className="mt-1.5 max-w-md text-xs text-zinc-400 leading-relaxed">
                  URL을 학습시키면 800자 단위로 분할하여 Vectorize와 SQLite에 안전하게 기억합니다.
                  질문하시면 기억된 조각들을 <code className="text-purple-300 font-mono">recall</code>하여 출처 URL과 함께 정확히 답변해 드립니다.
                </p>

                <div className="mt-6 flex flex-wrap justify-center gap-2 max-w-lg">
                  <button
                    onClick={() => handleQuickPrompt("현재 세컨드 브레인에 저장된 웹페이지 목록을 보여줘")}
                    className="flex items-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-900/80 px-3.5 py-2 text-xs text-zinc-300 hover:border-purple-500/40 hover:bg-zinc-800 hover:text-white transition cursor-pointer"
                  >
                    <BookOpen className="w-3.5 h-3.5 text-purple-400" />
                    <span>저장된 출처 목록 확인하기</span>
                  </button>
                  <button
                    onClick={() => handleQuickPrompt("저장된 웹페이지 중 핵심 내용을 3가지 포인트로 요약해줘")}
                    className="flex items-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-900/80 px-3.5 py-2 text-xs text-zinc-300 hover:border-purple-500/40 hover:bg-zinc-800 hover:text-white transition cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                    <span>기억된 핵심 내용 요약하기</span>
                  </button>
                  <button
                    onClick={() => handleQuickPrompt("Cloudflare Workers의 바인딩(Bindings) 개념에 대해 설명해줘")}
                    className="flex items-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-900/80 px-3.5 py-2 text-xs text-zinc-300 hover:border-purple-500/40 hover:bg-zinc-800 hover:text-white transition cursor-pointer"
                  >
                    <Search className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Cloudflare 바인딩 개념 질문</span>
                  </button>
                </div>
              </div>
            ) : (
              messages.map((m) => {
                const isUser = m.role === "user";
                return (
                  <div
                    key={m.id}
                    className={`flex gap-3.5 ${isUser ? "flex-row-reverse" : "flex-row"}`}
                  >
                    {/* 아바타 */}
                    <div
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-xs font-semibold ${
                        isUser
                          ? "bg-gradient-to-tr from-purple-600 to-indigo-600 text-white shadow-md shadow-purple-600/30"
                          : "bg-zinc-800/90 border border-zinc-700/80 text-purple-400"
                      }`}
                    >
                      {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                    </div>

                    {/* 말풍선 */}
                    <div
                      className={`max-w-[85%] sm:max-w-[78%] rounded-2xl px-4 py-3 shadow-md ${
                        isUser
                          ? "bg-purple-600 text-white rounded-tr-sm"
                          : "border border-zinc-800/90 bg-[#12141d]/90 text-zinc-200 rounded-tl-sm"
                      }`}
                    >
                      {renderMessage(m)}
                    </div>
                  </div>
                );
              })
            )}

            {/* 스트리밍 및 응답 대기 로딩 인디케이터 */}
            {status === "submitted" && (
              <div className="flex items-center gap-2 text-xs text-zinc-500 italic pl-12">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-purple-400" />
                <span>세컨드 브레인이 질문을 분석하고 기억을 검색 중입니다...</span>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* 하단 입력 폼 */}
          <div className="border-t border-zinc-800/80 bg-[#0c0d13]/90 p-3 sm:p-4">
            <form onSubmit={handleSubmit} className="flex items-center gap-2">
              <input
                type="text"
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                placeholder="질문을 입력하거나 URL을 직접 입력해보세요 (예: 이 문서의 주요 내용은?)"
                disabled={status === "submitted" || status === "streaming"}
                className="flex-1 rounded-xl border border-zinc-800 bg-[#08090d] px-4 py-3 text-xs text-zinc-200 placeholder-zinc-500 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 transition disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={!inputMessage.trim() || status === "submitted" || status === "streaming"}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-purple-600 text-white shadow-md shadow-purple-600/30 hover:bg-purple-500 transition disabled:opacity-40 cursor-pointer"
                title="전송"
              >
                <CornerDownLeft className="h-4 w-4" />
              </button>
            </form>
            <div className="mt-2 flex items-center justify-between px-1 text-[10px] text-zinc-500">
              <span>💡 채팅창에 URL을 입력하면 자동으로 브레인에 학습되어 기억됩니다.</span>
              <span>Durable Object · Vectorize 768d</span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
