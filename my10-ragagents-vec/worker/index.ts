import { AIChatAgent } from "@cloudflare/ai-chat";
import { getAgentByName, routeAgentRequest } from "agents";
import {
  convertToModelMessages,
  embed,
  embedMany,
  isLoopFinished,
  streamText,
  tool,
  type StreamTextOnFinishCallback,
  type ToolSet,
} from "ai";
import { createWorkersAI } from "workers-ai-provider";
import { z } from "zod";

export interface DocumentInfo {
  id: string;
  name: string;
  chunksCount: number;
  uploadedAt: string;
}

export interface ChunkRecord {
  id: string;
  source: string;
  text: string;
  created_at?: number;
}

export interface QaRecord {
  id: string;
  question: string;
  answer: string;
  chunk_ids: string;
  created_at: string;
}

export class RAGAgent extends AIChatAgent<Env> {
  // 0. Durable Object 시작 시 SQLite 테이블 초기화
  onStart() {
    // 1) 청크 저장 테이블: id (UUID), 출처 파일명, 원본 청크 텍스트, 생성일시
    void this.sql`
      CREATE TABLE IF NOT EXISTS chunks (
        id TEXT PRIMARY KEY,
        source TEXT NOT NULL,
        text TEXT NOT NULL,
        created_at INTEGER
      );
    `;

    // 2) 질문과 답변(Q&A) 및 참조된 청크 ID 기록 테이블 (향후 recall 및 분석용)
    void this.sql`
      CREATE TABLE IF NOT EXISTS qa_history (
        id TEXT PRIMARY KEY,
        question TEXT NOT NULL,
        answer TEXT NOT NULL,
        chunk_ids TEXT,
        created_at TEXT NOT NULL
      );
    `;

    console.log("[RAGAgent] SQLite tables initialized: 'chunks', 'qa_history'");
  }

  // 1. PDF를 마크다운으로 변환 (Cloudflare Workers AI toMarkdown)
  async convert(fileName: string, buffer: ArrayBuffer, fileType: string): Promise<string> {
    const result = await this.env.AI.toMarkdown({
      name: fileName,
      blob: new Blob([buffer], { type: fileType || "application/pdf" }),
    });

    if (result.format === "error") {
      throw new Error(`마크다운 변환 실패: ${result.error}`);
    }
    return result.data;
  }

  // 2. 마크다운 텍스트 청킹 (단락 및 적정 크기 분할)
  chunkMarkdown(markdown: string, maxChunkSize = 600, overlap = 100): string[] {
    const paragraphs = markdown.split(/\n{2,}/);
    const chunks: string[] = [];
    let currentChunk = "";

    for (const paragraph of paragraphs) {
      const trimmed = paragraph.trim();
      if (!trimmed) continue;

      if ((currentChunk + "\n\n" + trimmed).length <= maxChunkSize) {
        currentChunk = currentChunk ? currentChunk + "\n\n" + trimmed : trimmed;
      } else {
        if (currentChunk) {
          chunks.push(currentChunk);
        }
        if (trimmed.length > maxChunkSize) {
          const sentences = trimmed.split(/(?<=[.!?\n])\s+/);
          let subChunk = "";
          for (const sentence of sentences) {
            if ((subChunk + " " + sentence).length <= maxChunkSize) {
              subChunk = subChunk ? subChunk + " " + sentence : sentence;
            } else {
              if (subChunk) chunks.push(subChunk);
              subChunk = sentence.slice(0, maxChunkSize);
            }
          }
          if (subChunk) {
            currentChunk = subChunk;
          } else {
            currentChunk = "";
          }
        } else {
          const words = currentChunk.split(" ");
          const overlapText = words.slice(-Math.min(words.length, Math.floor(overlap / 10))).join(" ");
          currentChunk = overlapText ? overlapText + "\n\n" + trimmed : trimmed;
        }
      }
    }

    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }

    return chunks.length > 0 ? chunks : [markdown.slice(0, maxChunkSize)];
  }

  // 임베딩 모델 인스턴스 반환 헬퍼
  embedder() {
    const workersAi = createWorkersAI({ binding: this.env.AI });
    return workersAi.textEmbeddingModel("@cf/baai/bge-base-en-v1.5");
  }

  // 3. 청크 임베딩 생성 (BGE-base 모델, 768 차원)
  async embedChunks(chunks: string[]): Promise<number[][]> {
    const { embeddings } = await embedMany({
      model: this.embedder(),
      values: chunks,
    });
    return embeddings;
  }

  // 4. PDF 인제스트: 변환 -> 청킹 -> 임베딩 -> SQLite chunks 테이블 저장 & Vectorize upsert
  async ingestPdf(buffer: ArrayBuffer, fileName: string, fileType: string) {
    console.log(`[RAGAgent] Ingesting PDF: ${fileName} (${buffer.byteLength} bytes)`);

    // 1단계: 마크다운 변환
    const markdown = await this.convert(fileName, buffer, fileType);
    console.log(`[RAGAgent] Converted to markdown (${markdown.length} chars)`);

    // 2단계: 청킹
    const chunks = this.chunkMarkdown(markdown);
    console.log(`[RAGAgent] Generated ${chunks.length} chunks`);

    if (chunks.length === 0) {
      throw new Error("문서에서 추출할 수 있는 텍스트가 없습니다.");
    }

    // 3단계: 임베딩
    const embeddings = await this.embedChunks(chunks);

    // 4단계: SQLite에 청크 텍스트를 저장하고, 동일한 UUID로 Vectorize 벡터 구성
    const createdAt = Date.now();
    const vectors = chunks.map((chunk, index) => {
      const id = crypto.randomUUID();

      // SQLite chunks 테이블에 원본 텍스트 및 메타데이터 영구 저장
      void this.sql`
        INSERT INTO chunks (id, source, text, created_at)
        VALUES (${id}, ${fileName}, ${chunk}, ${createdAt})
      `;

      return {
        id,
        values: embeddings[index],
        metadata: {
          source: fileName,
          chunkIndex: index,
          totalChunks: chunks.length,
        },
      };
    });

    // Vectorize에 배치(Batch Size: 50) 단위로 upsert
    const BATCH_SIZE = 50;
    for (let i = 0; i < vectors.length; i += BATCH_SIZE) {
      const batch = vectors.slice(i, i + BATCH_SIZE);
      await this.env.VECTORIZE.upsert(batch);
    }
    console.log(`[RAGAgent] Upserted ${vectors.length} vectors to Vectorize linked with SQLite`);

    // 5단계: 문서 메타데이터 등록 (DO 스토리지)
    const existingDocs = (await this.ctx.storage.get<DocumentInfo[]>("documents")) || [];
    const newDoc: DocumentInfo = {
      id: `doc_${createdAt}`,
      name: fileName,
      chunksCount: chunks.length,
      uploadedAt: new Date().toISOString(),
    };
    await this.ctx.storage.put("documents", [newDoc, ...existingDocs]);

    return {
      success: true,
      fileName,
      chunksCount: chunks.length,
      markdownSnippet: markdown.slice(0, 300),
    };
  }

  // 5. 문서 목록 조회 RPC
  async getDocuments(): Promise<DocumentInfo[]> {
    return (await this.ctx.storage.get<DocumentInfo[]>("documents")) || [];
  }

  // 6. 문서 목록 초기화 RPC
  async clearDocuments(): Promise<void> {
    await this.ctx.storage.delete("documents");
    void this.sql`DELETE FROM chunks`;
    void this.sql`DELETE FROM qa_history`;
  }

  // 7. SQLite 청크 목록 조회 RPC (디버깅 / Recall 확인용)
  async getChunks(source?: string, limit = 50): Promise<ChunkRecord[]> {
    if (source) {
      return [...this.sql<ChunkRecord>`SELECT id, source, text, created_at FROM chunks WHERE source = ${source} LIMIT ${limit}`];
    }
    return [...this.sql<ChunkRecord>`SELECT id, source, text, created_at FROM chunks ORDER BY created_at DESC LIMIT ${limit}`];
  }

  // 8. SQLite Q&A 기록 조회 RPC (향후 recall용)
  async getQaHistory(limit = 20): Promise<QaRecord[]> {
    return [...this.sql<QaRecord>`SELECT id, question, answer, chunk_ids, created_at FROM qa_history ORDER BY created_at DESC LIMIT ${limit}`];
  }

  // 9. RAG 기반 AI 채팅 (onChatMessage)
  async onChatMessage(
    _onFinish: StreamTextOnFinishCallback<ToolSet>,
    options?: { abortSignal?: AbortSignal }
  ) {
    const workersAi = createWorkersAI({ binding: this.env.AI });

    // 사용자의 가장 최근 질문 추출
    const userMessages = this.messages.filter((m) => m.role === "user");
    const latestUserMessage = userMessages[userMessages.length - 1];
    let queryText = "";
    if (latestUserMessage) {
      for (const part of latestUserMessage.parts) {
        if (part.type === "text") {
          queryText += part.text + " ";
        }
      }
    }
    queryText = queryText.trim();

    // RAG 검색 recall 도구 정의
    const tools = {
      recall: tool({
        description:
          "Search ingested documents for chunks relevant to a query. Call this before answering questions about previously-saved content.",
        inputSchema: z.object({
          query: z.string().meta({ description: "What to look up." }),
        }),
        execute: async ({ query }: { query: string }) => {
          console.log(`[RAGAgent] recall tool called with query: "${query}"`);
          const { embedding } = await embed({
            model: this.embedder(),
            value: query,
          });
          const { matches } = await this.env.VECTORIZE.query(embedding, {
            topK: 5,
          });
          return matches.map((match) => {
            const [result] = this
              .sql<ChunkRecord>`SELECT * FROM chunks WHERE id = ${match.id}`;
            return result;
          });
        },
      }),
    };

    const systemPrompt = `당신은 업로드된 PDF 문서를 바탕으로 사용자의 질문에 정확하고 친절하게 답변하는 지능형 RAG AI 어시스턴트입니다.

[답변 지침]
1. 사용자가 문서 내용이나 저장된 지식에 대해 질문하면 반드시 \`recall\` 도구를 호출하여 관련 지식 조각들을 검색하세요.
2. 검색된 조각들의 내용을 핵심 근거로 삼아 한국어로 자연스럽고 정확하게 답변하세요.
3. 답변 시 참고한 문서 출처(파일명 등)를 명시하세요.
4. 질문과 관련된 내용이 검색 결과에 없거나 불확실한 경우, 거짓으로 지어내지 말고 "제공해주신 문서에서 해당 내용을 찾을 수 없습니다"라고 솔직하게 답변하세요.
5. 마크다운(제목, 글머리 기호, 코드 블록, 볼드체 등)을 사용하여 구조화된 보기 편한 형식으로 응답하세요.
`;

    const result = streamText({
      model: workersAi("@cf/qwen/qwen3.8-27b"),
      system: systemPrompt,
      messages: await convertToModelMessages(this.messages),
      tools: tools as ToolSet,
      abortSignal: options?.abortSignal,
      stopWhen: isLoopFinished(),
      onFinish: async (event) => {
        // 답변 완료 시 질문과 답변을 SQLite qa_history 테이블에 영구 저장 (향후 recall용)
        try {
          if (queryText && event.text) {
            const qaId = `qa_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
            void this.sql`
              INSERT INTO qa_history (id, question, answer, chunk_ids, created_at)
              VALUES (${qaId}, ${queryText}, ${event.text}, '[]', ${new Date().toISOString()})
            `;
            console.log(`[RAGAgent] Saved Q&A log to SQLite: ${qaId}`);
          }
        } catch (logErr) {
          console.error("[RAGAgent] Failed to log Q&A to SQLite:", logErr);
        }

        if (_onFinish) {
          await _onFinish(event);
        }
      },
    });

    return result.toUIMessageStreamResponse();
  }
}

// Worker Fetch 핸들러
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // 1. PDF 업로드 및 벡터화 엔드포인트
    if (url.pathname === "/api/upload" && request.method === "POST") {
      try {
        const formData = await request.formData();
        const file = formData.get("file");

        if (!file || !(file instanceof File)) {
          return Response.json({ error: "PDF 파일이 첨부되지 않았습니다." }, { status: 400 });
        }

        const arrayBuffer = await file.arrayBuffer();

        // R2 버킷에 원본 PDF 저장
        const r2Key = `uploads/${Date.now()}_${file.name}`;
        await env.FILES.put(r2Key, arrayBuffer, {
          httpMetadata: { contentType: file.type || "application/pdf" },
        });

        // Durable Object RAGAgent 가져오기 및 인제스트 수행
        const agent = await getAgentByName<Env, RAGAgent>(
          env.RAGAgent as unknown as DurableObjectNamespace<RAGAgent>,
          "default"
        );
        const ingestResult = await agent.ingestPdf(arrayBuffer, file.name, file.type);

        return Response.json({
          success: true,
          message: "문서가 성공적으로 변환 및 벡터라이즈(SQLite & Vectorize)되었습니다.",
          data: { ...ingestResult, r2Key },
        });
      } catch (err: any) {
        console.error("Upload handler error:", err);
        return Response.json(
          { error: err.message || "문서 처리 중 오류가 발생했습니다." },
          { status: 500 }
        );
      }
    }

    // 2. 인덱싱된 문서 목록 조회 엔드포인트
    if (url.pathname === "/api/documents" && request.method === "GET") {
      try {
        const agent = await getAgentByName<Env, RAGAgent>(
          env.RAGAgent as unknown as DurableObjectNamespace<RAGAgent>,
          "default"
        );
        const docs = await agent.getDocuments();
        return Response.json({ documents: docs });
      } catch (err: any) {
        return Response.json({ error: err.message }, { status: 500 });
      }
    }

    // 3. SQLite에 저장된 청크 목록 조회 엔드포인트 (Recall 디버깅/조회용)
    if (url.pathname === "/api/chunks" && request.method === "GET") {
      try {
        const source = url.searchParams.get("source") || undefined;
        const agent = await getAgentByName<Env, RAGAgent>(
          env.RAGAgent as unknown as DurableObjectNamespace<RAGAgent>,
          "default"
        );
        const chunks = await agent.getChunks(source);
        return Response.json({ chunks, count: chunks.length });
      } catch (err: any) {
        return Response.json({ error: err.message }, { status: 500 });
      }
    }

    // 4. SQLite에 저장된 질문/답변 기록 조회 엔드포인트 (Recall 디버깅/조회용)
    if (url.pathname === "/api/qa-history" && request.method === "GET") {
      try {
        const agent = await getAgentByName<Env, RAGAgent>(
          env.RAGAgent as unknown as DurableObjectNamespace<RAGAgent>,
          "default"
        );
        const history = await agent.getQaHistory();
        return Response.json({ history, count: history.length });
      } catch (err: any) {
        return Response.json({ error: err.message }, { status: 500 });
      }
    }

    // 5. Agent 라우팅 (WebSocket / HTTP 통신)
    return (
      (await routeAgentRequest(request, env)) ??
      new Response("Not Found", { status: 404 })
    );
  },
} satisfies ExportedHandler<Env>;