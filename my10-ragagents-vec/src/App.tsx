import { useAgentChat } from "@cloudflare/ai-chat/react";
import { useAgent } from "agents/react";
import { getToolName, isToolUIPart, type UIMessage } from "ai";
import {
  AlertCircle,
  Bot,
  CheckCircle2,
  Database,
  FileText,
  FileUp,
  Layers,
  Loader2,
  RefreshCw,
  Send,
  Sparkles,
  StopCircle,
  Trash2,
  User,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface DocumentInfo {
  id: string;
  name: string;
  chunksCount: number;
  uploadedAt: string;
}

interface UploadStatus {
  step: "uploading" | "converting" | "vectorizing" | "completed" | "error";
  message: string;
  fileName?: string;
  chunksCount?: number;
}

export default function App() {
  const [uploadStatus, setUploadStatus] = useState<UploadStatus | null>(null);
  const [documents, setDocuments] = useState<DocumentInfo[]>([]);
  const [isDocsOpen, setIsDocsOpen] = useState(false);
  const [inputMessage, setInputMessage] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const agent = useAgent({ agent: "RAGAgent" });

  const {
    messages,
    sendMessage,
    clearHistory,
    status,
    stop,
    addToolApprovalResponse,
  } = useAgentChat({ agent });

  // 문서 목록 불러오기
  const fetchDocuments = async () => {
    try {
      const res = await fetch("/api/documents");
      if (res.ok) {
        const data = await res.json();
        setDocuments(data.documents || []);
      }
    } catch (err) {
      console.error("문서 목록 조회 실패:", err);
    }
  };

  useEffect(() => {
    fetchDocuments();
  }, []);

  // 메시지 수신 시 하단 자동 스크롤
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, uploadStatus]);

  // 파일 업로드 핸들러
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== "application/pdf" && !file.name.endsWith(".pdf")) {
      setUploadStatus({
        step: "error",
        message: "PDF 형식의 파일만 업로드할 수 있습니다.",
      });
      return;
    }

    try {
      setUploadStatus({
        step: "uploading",
        message: "PDF 파일을 서버 및 R2 스토리지로 전송하는 중...",
        fileName: file.name,
      });

      const fd = new FormData();
      fd.append("file", file);

      setUploadStatus({
        step: "converting",
        message: "Workers AI를 통해 PDF를 Markdown으로 변환 및 분석 중...",
        fileName: file.name,
      });

      const res = await fetch("/api/upload", {
        method: "POST",
        body: fd,
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || "파일 인덱싱에 실패했습니다.");
      }

      setUploadStatus({
        step: "completed",
        message: `완료! 총 ${data.data.chunksCount}개 청크로 분할되어 Vectorize에 인덱싱되었습니다.`,
        fileName: file.name,
        chunksCount: data.data.chunksCount,
      });

      fetchDocuments();
    } catch (err: any) {
      setUploadStatus({
        step: "error",
        message: err.message || "문서 인덱싱 처리 중 오류가 발생했습니다.",
        fileName: file.name,
      });
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim() || status === "submitted" || status === "streaming") return;

    sendMessage({ text: inputMessage.trim() });
    setInputMessage("");
  };

  const handleQuickPrompt = (promptText: string) => {
    if (status === "submitted" || status === "streaming") return;
    sendMessage({ text: promptText });
  };

  function renderMessage(msg: UIMessage) {
    return msg.parts.map((part, i) => {
      if (part.type === "text") {
        return (
          <div key={i} className="text-[14px] leading-relaxed whitespace-pre-wrap">
            {part.text}
          </div>
        );
      }
      if (part.type === "reasoning") {
        return (
          <div key={i} className="mt-1 text-xs italic text-zinc-400 border-l-2 border-zinc-700 pl-2">
            💭 {part.text}
          </div>
        );
      }
      if (isToolUIPart(part)) {
        if ("approval" in part && part.state === "approval-requested") {
          return (
            <div
              key={i}
              className="my-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-200"
            >
              <div className="font-semibold flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4 text-amber-400" />
                {getToolName(part)} 실행을 승인하시겠습니까?
              </div>
              {"input" in part && part.input != null && (
                <pre className="mt-2 p-2 rounded bg-black/40 text-zinc-300 overflow-x-auto text-[11px]">
                  {JSON.stringify(part.input, null, 2)}
                </pre>
              )}
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-medium transition"
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
                  className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-medium transition"
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

        return (
          <div
            key={i}
            className="my-2 rounded-xl border border-zinc-800 bg-zinc-900/60 p-3 text-xs"
          >
            <div className="flex items-center gap-2">
              <span className="rounded bg-zinc-800 px-2 py-0.5 font-mono text-[10px] text-zinc-300">
                {getToolName(part)}
              </span>
              <span className="text-zinc-500">{part.state}</span>
            </div>
            {"output" in part && part.output != null && (
              <pre className="mt-2 max-h-40 overflow-y-auto rounded bg-black/30 p-2 text-zinc-400 text-[11px]">
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
    <div className="flex min-h-screen flex-col bg-zinc-950 text-zinc-100">
      {/* 1. 글로벌 헤더 */}
      <header className="sticky top-0 z-20 border-b border-zinc-800/80 bg-zinc-950/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-indigo-600 via-purple-600 to-pink-500 shadow-md shadow-indigo-500/20">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-semibold tracking-tight text-zinc-100">
                  Cloudflare RAG Agent
                </h1>
                <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400 border border-emerald-500/20">
                  Vectorize Active
                </span>
              </div>
              <p className="text-xs text-zinc-400 hidden sm:block">
                PDF to Markdown · Workers AI Embeddings · Durable Objects
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* 문서 관리 버튼 */}
            <button
              onClick={() => setIsDocsOpen(!isDocsOpen)}
              className="flex items-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-900/80 px-3 py-1.5 text-xs font-medium text-zinc-300 transition hover:border-zinc-700 hover:bg-zinc-800 hover:text-white"
            >
              <Database className="h-3.5 w-3.5 text-indigo-400" />
              <span>문서 목록</span>
              <span className="rounded-full bg-indigo-500/20 px-1.5 py-0.2 text-[10px] text-indigo-300 font-mono">
                {documents.length}
              </span>
            </button>

            {/* 대화 초기화 버튼 */}
            <button
              onClick={clearHistory}
              title="대화 지우기"
              className="flex items-center gap-1 rounded-xl border border-zinc-800/80 bg-zinc-900/50 p-2 text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-200"
            >
              <Trash2 className="h-4 w-4" />
            </button>

            {/* 스트리밍 중단 버튼 */}
            {status === "streaming" && (
              <button
                onClick={stop}
                className="flex items-center gap-1.5 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-400 transition hover:bg-rose-500/20"
              >
                <StopCircle className="h-3.5 w-3.5" />
                <span>중단</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* 2. 등록된 문서 드롭다운 패널 (토글) */}
      {isDocsOpen && (
        <div className="border-b border-zinc-800 bg-zinc-900/70 p-4 transition">
          <div className="mx-auto max-w-5xl">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 text-xs font-medium text-zinc-300">
                <Layers className="h-4 w-4 text-indigo-400" />
                <span>인덱싱된 PDF 문서 목록 ({documents.length})</span>
              </div>
              <button
                onClick={fetchDocuments}
                className="flex items-center gap-1 text-[11px] text-zinc-400 hover:text-zinc-200"
              >
                <RefreshCw className="h-3 w-3" />
                새로고침
              </button>
            </div>

            {documents.length === 0 ? (
              <p className="text-xs text-zinc-500 py-2">
                아직 인덱싱된 문서가 없습니다. 아래 업로더에서 PDF 문서를 등록해보세요.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                {documents.map((doc) => (
                  <div
                    key={doc.id}
                    className="flex items-start gap-2.5 rounded-xl border border-zinc-800 bg-zinc-950/60 p-3 text-xs"
                  >
                    <FileText className="h-4 w-4 shrink-0 text-indigo-400 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-zinc-200 truncate" title={doc.name}>
                        {doc.name}
                      </div>
                      <div className="text-[11px] text-zinc-400 mt-1 flex items-center justify-between">
                        <span>{doc.chunksCount}개 청크</span>
                        <span>{new Date(doc.uploadedAt).toLocaleTimeString()}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 3. 메인 콘텐츠 영역 */}
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col px-4 py-6">
        {/* PDF 업로드 배너 영역 */}
        <section className="mb-6 rounded-2xl border border-zinc-800/80 bg-gradient-to-b from-zinc-900/60 to-zinc-950/80 p-4 sm:p-5 shadow-lg shadow-black/20">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
                <FileUp className="h-4 w-4 text-indigo-400" />
                <span>PDF 문서 업로드 및 Vectorize 벡터화</span>
              </div>
              <p className="text-xs text-zinc-400 mt-1">
                PDF를 업로드하면 Workers AI가 Markdown으로 변환 후 청크 단위로 임베딩하여 Vectorize 인덱스에 실시간 저장합니다.
              </p>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf,.pdf"
                onChange={handleFileChange}
                disabled={uploadStatus?.step === "uploading" || uploadStatus?.step === "converting" || uploadStatus?.step === "vectorizing"}
                className="hidden"
                id="pdf-upload"
              />
              <label
                htmlFor="pdf-upload"
                className={`inline-flex items-center gap-2 cursor-pointer rounded-xl px-4 py-2.5 text-xs font-medium transition shadow-md ${
                  uploadStatus?.step === "uploading" || uploadStatus?.step === "converting"
                    ? "bg-zinc-800 text-zinc-500 cursor-not-allowed"
                    : "bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/20"
                }`}
              >
                <FileUp className="h-4 w-4" />
                <span>PDF 파일 선택</span>
              </label>
            </div>
          </div>

          {/* 업로드 상태 표시 바 */}
          {uploadStatus && (
            <div
              className={`mt-4 flex items-center gap-2.5 rounded-xl border p-3 text-xs transition ${
                uploadStatus.step === "completed"
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                  : uploadStatus.step === "error"
                  ? "border-rose-500/30 bg-rose-500/10 text-rose-300"
                  : "border-indigo-500/30 bg-indigo-500/10 text-indigo-300"
              }`}
            >
              {uploadStatus.step === "completed" ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
              ) : uploadStatus.step === "error" ? (
                <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
              ) : (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-indigo-400" />
              )}
              <div className="flex-1">
                {uploadStatus.fileName && (
                  <span className="font-semibold mr-1.5">[{uploadStatus.fileName}]</span>
                )}
                <span>{uploadStatus.message}</span>
              </div>
            </div>
          )}
        </section>

        {/* 대화 메시지 피드 */}
        <section className="flex-1 space-y-4 pb-28">
          {messages.length === 0 && (
            <div className="flex min-h-[35vh] flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-800/80 p-8 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 mb-3">
                <Bot className="h-6 w-6" />
              </div>
              <h2 className="text-base font-semibold text-zinc-200">
                PDF 문서에 대해 무엇이든 질문하세요
              </h2>
              <p className="mt-1 text-xs text-zinc-400 max-w-sm">
                업로드된 PDF 문서를 바탕으로 Cloudflare Vectorize 유사도 검색과 Workers AI가 연계되어 정확한 답변을 제공합니다.
              </p>

              {/* 추천 질문 칩 */}
              <div className="mt-6 flex flex-wrap justify-center gap-2">
                {[
                  "업로드된 문서의 핵심 내용을 요약해줘",
                  "이 문서의 주요 결론이나 시사점은 무엇인가요?",
                  "문서에 언급된 주요 데이터와 수치를 알려줘",
                ].map((prompt, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleQuickPrompt(prompt)}
                    className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-3.5 py-2 text-xs text-zinc-300 transition hover:border-indigo-500/50 hover:bg-zinc-800 hover:text-white"
                  >
                    💬 {prompt}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((message) => {
            const isUser = message.role === "user";
            return (
              <div
                key={message.id}
                className={`flex gap-3 ${isUser ? "justify-end" : "justify-start"}`}
              >
                {!isUser && (
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-zinc-800 text-indigo-400 border border-zinc-700/60 mt-1">
                    <Bot className="h-4 w-4" />
                  </div>
                )}
                <div
                  className={`relative max-w-[85%] rounded-2xl px-4 py-3 shadow-md ${
                    isUser
                      ? "bg-gradient-to-r from-indigo-600 to-indigo-700 text-white rounded-tr-none shadow-indigo-600/10"
                      : "border border-zinc-800/80 bg-zinc-900/90 text-zinc-200 rounded-tl-none"
                  }`}
                >
                  {renderMessage(message)}
                </div>
                {isUser && (
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white mt-1 shadow-md shadow-indigo-600/20">
                    <User className="h-4 w-4" />
                  </div>
                )}
              </div>
            );
          })}

          {/* 스트리밍 중 표시 */}
          {status === "streaming" && (
            <div className="flex items-center gap-2 text-xs text-indigo-400 pl-11">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span>Vectorize 검색 컨텍스트 분석 및 답변 생성 중...</span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </section>
      </main>

      {/* 4. 고정 하단 입력 바 */}
      <div className="fixed bottom-0 left-0 right-0 z-20 border-t border-zinc-800/80 bg-zinc-950/80 backdrop-blur-md">
        <div className="mx-auto max-w-4xl px-4 py-3 sm:px-6">
          <form onSubmit={handleSubmit} className="relative flex items-center gap-2">
            <input
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              placeholder="문서 내용에 대해 질문하세요... (예: 이 문서의 결론은?)"
              disabled={status === "streaming"}
              className="flex-1 rounded-2xl border border-zinc-800 bg-zinc-900/90 px-4 py-3 text-sm text-zinc-100 placeholder-zinc-500 outline-none transition focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={!inputMessage.trim() || status === "streaming"}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-md shadow-indigo-600/20 transition hover:bg-indigo-500 disabled:opacity-40 disabled:hover:bg-indigo-600"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
          <div className="mt-1.5 flex items-center justify-between text-[11px] text-zinc-500 px-1">
            <span>Powered by Cloudflare Workers AI, Vectorize & Durable Objects</span>
            <span>상태: {status}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
