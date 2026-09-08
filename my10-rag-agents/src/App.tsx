import { useAgentChat } from "@cloudflare/ai-chat/react";
import { useAgent } from "agents/react";
import { getToolName, isToolUIPart, type UIMessage } from "ai";
import { useRef, useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface UploadedDocument {
  id: string;
  originalName: string;
  storageFileName: string;
  markdown: string;
  uploadedAt: string;
  size: number;
}

export default function App() {
  const [ingesting, setIngesting] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"preview" | "raw">("preview");
  const [copied, setCopied] = useState(false);
  const [documents, setDocuments] = useState<UploadedDocument[]>([]);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  const agent = useAgent({ agent: "RAGAgent" });

  const {
    messages,
    sendMessage,
    clearHistory,
    status,
    stop,
    addToolApprovalResponse,
  } = useAgentChat({ agent });

  // 새 메시지 수신 시 하단 스크롤
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleUploadFile = async (file: File) => {
    setIngesting(file.name);
    setUploadError(null);

    const fd = new FormData();
    fd.append("file", file);

    try {
      const res = await fetch("/api/upload", {
        method: "POST",
        body: fd,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `업로드 실패: ${res.statusText}`);
      }

      const data = await res.json();
      const newDoc: UploadedDocument = {
        id: data.fileName,
        originalName: data.originalName,
        storageFileName: data.fileName,
        markdown: data.markdown || "",
        uploadedAt: new Date().toLocaleTimeString("ko-KR"),
        size: data.size,
      };

      setDocuments((prev) => [newDoc, ...prev]);
      setSelectedDocId(newDoc.id);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setUploadError(msg);
    } finally {
      setIngesting(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    handleUploadFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleUploadFile(file);
    }
  };

  const handleSubmit = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);
    const message = formData.get("input") as string;
    if (!message?.trim() || status === "submitted" || status === "streaming") return;

    sendMessage({
      role: "user",
      parts: [{ type: "text", text: message.trim() }],
    });
    form.reset();
  };

  const currentDoc = documents.find((d) => d.id === selectedDocId) || documents[0];

  const handleCopyMarkdown = () => {
    if (!currentDoc?.markdown) return;
    navigator.clipboard.writeText(currentDoc.markdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  function renderMessage(msg: UIMessage) {
    return msg.parts.map((part, i) => {
      if (part.type === "text") {
        return (
          <div key={i} className="prose prose-sm dark:prose-invert max-w-none break-words">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {part.text}
            </ReactMarkdown>
          </div>
        );
      }
      if (part.type === "reasoning") {
        return (
          <p key={i} className="text-xs italic text-zinc-400 bg-zinc-800/40 p-2 rounded my-1 border-l-2 border-amber-500">
            {part.text}
          </p>
        );
      }
      if (isToolUIPart(part)) {
        if ("approval" in part && part.state === "approval-requested") {
          return (
            <div
              key={i}
              className="text-xs bg-amber-950/40 border border-amber-500/40 p-3 rounded-lg my-2"
            >
              <div className="font-semibold text-amber-300">
                도구 승인 요청: {getToolName(part)}
              </div>
              {"input" in part && part.input != null && (
                <pre className="mt-1.5 p-2 bg-zinc-900/80 rounded text-[11px] overflow-x-auto text-zinc-300">
                  {JSON.stringify(part.input, null, 2)}
                </pre>
              )}
              <div className="mt-2.5 flex gap-2">
                <button
                  className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-medium transition"
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
                  className="px-3 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded text-xs font-medium transition"
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

        if (part.state === "output-denied") {
          return (
            <div
              key={i}
              className="text-xs bg-rose-950/40 border border-rose-500/30 text-rose-300 p-2 rounded my-1"
            >
              <strong>{getToolName(part)}</strong> — 거부됨
            </div>
          );
        }

        return (
          <div
            key={i}
            className="mt-2 rounded-lg border border-zinc-700 bg-zinc-900/60 p-2.5 text-xs font-mono"
          >
            <div className="flex items-center justify-between text-zinc-400">
              <span className="rounded bg-zinc-800 px-2 py-0.5 text-[11px] text-zinc-200">
                도구: {getToolName(part)}
              </span>
              <span className="text-[10px] uppercase text-zinc-500">{part.state}</span>
            </div>
            {"output" in part && part.output != null && (
              <pre className="mt-2 max-h-40 overflow-y-auto rounded bg-zinc-950 p-2 text-[11px] text-zinc-300">
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
    <div className="flex h-screen flex-col bg-zinc-950 text-zinc-100 font-sans antialiased overflow-hidden">
      {/* 상단 네비게이션 헤더 */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-zinc-800/80 bg-zinc-900/70 px-5 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-tr from-orange-500 to-amber-500 text-white shadow-md shadow-orange-500/20">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-wide text-zinc-100 flex items-center gap-2">
              Cloudflare DO + AI RAG Agent
              <span className="rounded bg-orange-500/10 px-1.5 py-0.5 text-[10px] font-medium text-orange-400 border border-orange-500/20">
                R2 & toMarkdown
              </span>
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* 파일 업로드 버튼 */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.txt,.md,application/pdf"
            onChange={handleFileChange}
            className="hidden"
            id="file-upload"
          />
          <label
            htmlFor="file-upload"
            className={`cursor-pointer inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow transition-all ${
              ingesting ? "opacity-50 pointer-events-none" : ""
            }`}
          >
            {ingesting ? (
              <>
                <svg className="animate-spin h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span>변환 중…</span>
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                <span>PDF 파일 업로드</span>
              </>
            )}
          </label>

          <button
            onClick={clearHistory}
            title="대화 지우기"
            className="rounded-lg border border-zinc-800 bg-zinc-900/80 px-2.5 py-1.5 text-xs font-medium text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-200"
          >
            초기화
          </button>
          {status === "streaming" && (
            <button
              onClick={stop}
              className="rounded-lg bg-rose-500/20 border border-rose-500/30 px-2.5 py-1.5 text-xs font-medium text-rose-300 transition hover:bg-rose-500/30"
            >
              중단
            </button>
          )}

          <div className="flex items-center gap-1.5 pl-2 text-xs text-zinc-400">
            <span
              className={`h-2 w-2 rounded-full ${
                status === "streaming"
                  ? "bg-emerald-400 animate-ping"
                  : "bg-zinc-500"
              }`}
            />
            <span className="capitalize">{status}</span>
          </div>
        </div>
      </header>

      {/* 메인 2분할 뷰: 왼쪽은 마크다운 뷰어, 오른쪽은 AI 챗 */}
      <div className="flex flex-1 overflow-hidden">
        {/* 왼쪽: R2 업로드 파일 및 마크다운 뷰어 영역 */}
        <section className="flex flex-1 flex-col border-r border-zinc-800/80 bg-zinc-900/30 overflow-hidden">
          {/* 서브 헤더 (문서 탭 및 제어 버튼) */}
          <div className="flex h-11 shrink-0 items-center justify-between border-b border-zinc-800/80 bg-zinc-900/40 px-4">
            <div className="flex items-center gap-2 overflow-x-auto">
              <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                문서 뷰어
              </span>
              {documents.length > 0 && (
                <div className="flex items-center gap-1.5 ml-2">
                  {documents.map((doc) => (
                    <button
                      key={doc.id}
                      onClick={() => setSelectedDocId(doc.id)}
                      className={`max-w-[140px] truncate rounded px-2 py-0.5 text-xs transition ${
                        (selectedDocId || documents[0].id) === doc.id
                          ? "bg-orange-500/20 text-orange-300 border border-orange-500/30"
                          : "text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200"
                      }`}
                    >
                      📄 {doc.originalName}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {currentDoc && (
              <div className="flex items-center gap-2">
                <div className="flex rounded-md bg-zinc-800/80 p-0.5 text-xs">
                  <button
                    onClick={() => setActiveTab("preview")}
                    className={`rounded px-2 py-0.5 transition ${
                      activeTab === "preview"
                        ? "bg-zinc-700 text-white"
                        : "text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    마크다운 뷰
                  </button>
                  <button
                    onClick={() => setActiveTab("raw")}
                    className={`rounded px-2 py-0.5 transition ${
                      activeTab === "raw"
                        ? "bg-zinc-700 text-white"
                        : "text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    RAW 원본
                  </button>
                </div>
                <button
                  onClick={handleCopyMarkdown}
                  className="rounded border border-zinc-700/80 bg-zinc-800/60 px-2 py-0.5 text-xs text-zinc-300 transition hover:bg-zinc-700"
                >
                  {copied ? "✓ 복사됨" : "마크다운 복사"}
                </button>
              </div>
            )}
          </div>

          {/* 에러 메시지 알림 */}
          {uploadError && (
            <div className="m-3 p-3 rounded-lg bg-rose-950/50 border border-rose-500/40 text-rose-300 text-xs flex justify-between items-center">
              <span>⚠️ {uploadError}</span>
              <button onClick={() => setUploadError(null)} className="hover:text-white">✕</button>
            </div>
          )}

          {/* 마크다운 본문 뷰어 또는 업로드 드래그앤드롭 존 */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragOver(true);
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={handleDrop}
            className={`flex-1 overflow-y-auto p-6 transition-colors ${
              isDragOver ? "bg-orange-500/5 border-2 border-dashed border-orange-500" : ""
            }`}
          >
            {currentDoc ? (
              <div className="mx-auto max-w-3xl">
                <div className="mb-4 pb-3 border-b border-zinc-800 flex justify-between items-center text-xs text-zinc-400">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-zinc-200">{currentDoc.originalName}</span>
                    <span>•</span>
                    <span>{(currentDoc.size / 1024).toFixed(1)} KB</span>
                    <span>•</span>
                    <span>업로드: {currentDoc.uploadedAt}</span>
                  </div>
                  <span className="rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 font-mono text-[10px]">
                    R2 저장 완료
                  </span>
                </div>

                {activeTab === "preview" ? (
                  <div className="prose prose-invert prose-zinc max-w-none text-zinc-200 leading-relaxed">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {currentDoc.markdown}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <pre className="p-4 rounded-lg bg-zinc-900 border border-zinc-800 font-mono text-xs text-zinc-300 overflow-x-auto whitespace-pre-wrap leading-normal">
                    {currentDoc.markdown}
                  </pre>
                )}
              </div>
            ) : (
              <div className="flex h-full flex-col items-center justify-center text-center p-8">
                <div className="h-16 w-16 mb-4 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-500">
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                </div>
                <h3 className="text-sm font-semibold text-zinc-300">
                  PDF 또는 문서 파일을 업로드해주세요
                </h3>
                <p className="mt-1 max-w-sm text-xs text-zinc-500">
                  파일을 이곳에 드래그하거나 상단의 업로드 버튼을 누르면, Cloudflare R2에 저장된 후 Workers AI를 통해 즉시 Markdown으로 변환되어 표시됩니다.
                </p>
                <label
                  htmlFor="file-upload"
                  className="mt-4 cursor-pointer inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-zinc-700 transition"
                >
                  파일 찾아보기
                </label>
              </div>
            )}
          </div>
        </section>

        {/* 오른쪽: AI Chat Agents 질의응답 (RAG) */}
        <section className="flex flex-1 flex-col bg-zinc-950 overflow-hidden">
          {/* 챗 헤더 */}
          <div className="flex h-11 shrink-0 items-center justify-between border-b border-zinc-800/80 bg-zinc-900/20 px-4">
            <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
              <span>💬</span> AI Chat Agent 대화
            </span>
            <span className="text-[11px] text-zinc-500">
              Durable Object 기반 RAG
            </span>
          </div>

          {/* 대화 메시지 영역 */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center text-center p-6 text-zinc-500">
                <div className="h-12 w-12 rounded-full bg-zinc-900 flex items-center justify-center mb-3">
                  🤖
                </div>
                <p className="text-xs font-medium text-zinc-400">
                  PDF 문서를 업로드하고 궁금한 점을 질문해보세요.
                </p>
                <p className="text-[11px] text-zinc-600 mt-1">
                  예: "이 문서의 핵심 요약을 3줄로 정리해줘"
                </p>
              </div>
            ) : (
              messages.map((message: UIMessage) => {
                const isUser = message.role === "user";
                return (
                  <div
                    key={message.id}
                    className={`flex ${isUser ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[88%] rounded-2xl px-4 py-3 text-xs leading-relaxed shadow-sm ${
                        isUser
                          ? "bg-orange-600 text-white rounded-br-none"
                          : "border border-zinc-800 bg-zinc-900/90 text-zinc-200 rounded-bl-none"
                      }`}
                    >
                      {renderMessage(message)}
                    </div>
                  </div>
                );
              })
            )}
            <div ref={chatBottomRef} />
          </div>

          {/* 입력창 영역 */}
          <div className="border-t border-zinc-800/80 bg-zinc-900/40 p-3">
            <form onSubmit={handleSubmit} className="flex gap-2">
              <input
                name="input"
                placeholder={
                  status === "streaming"
                    ? "답변 생성 중입니다..."
                    : "문서에 대해 질문하세요... (Enter로 전송)"
                }
                autoComplete="off"
                disabled={status === "streaming"}
                className="flex-1 rounded-xl border border-zinc-800 bg-zinc-900/80 px-4 py-2.5 text-xs text-zinc-100 placeholder-zinc-500 outline-none transition focus:border-orange-500 focus:bg-zinc-900 disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={status === "streaming"}
                className="rounded-xl bg-orange-500 hover:bg-orange-600 disabled:opacity-50 px-4 py-2.5 text-xs font-semibold text-white shadow transition-all flex items-center gap-1"
              >
                <span>전송</span>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </button>
            </form>
          </div>
        </section>
      </div>
    </div>
  );
}
