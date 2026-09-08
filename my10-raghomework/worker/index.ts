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

export interface ChunkRecord {
  id: string;
  url: string;
  title: string;
  text: string;
  created_at: number;
}

export interface SourceRecord {
  url: string;
  title: string;
  chunks_count: number;
  created_at: string;
}

export interface QaRecord {
  id: string;
  question: string;
  answer: string;
  sources: string;
  created_at: string;
}

export class SecondBrainAgent extends AIChatAgent<Env> {
  // 0. 생명주기: Durable Object 구동 시 내장 SQLite 테이블 초기화
  onStart() {
    // 1) 지식 조각(Chunks) 테이블: id (UUID), 출처 URL, 웹페이지 제목, 원문 텍스트, 생성일시
    void this.sql`
      CREATE TABLE IF NOT EXISTS chunks (
        id TEXT PRIMARY KEY,
        url TEXT NOT NULL,
        title TEXT,
        text TEXT NOT NULL,
        created_at INTEGER
      );
    `;

    // 2) 출처(Sources) 테이블: URL, 웹페이지 제목, 총 청크 수, 등록 일시
    void this.sql`
      CREATE TABLE IF NOT EXISTS sources (
        url TEXT PRIMARY KEY,
        title TEXT,
        chunks_count INTEGER,
        created_at TEXT NOT NULL
      );
    `;

    // 3) 질문/답변(QA History) 테이블
    void this.sql`
      CREATE TABLE IF NOT EXISTS qa_history (
        id TEXT PRIMARY KEY,
        question TEXT NOT NULL,
        answer TEXT NOT NULL,
        sources TEXT,
        created_at TEXT NOT NULL
      );
    `;

    console.log("[SecondBrainAgent] SQLite tables initialized: 'chunks', 'sources', 'qa_history'");
  }

  // 1. Cloudflare Browser Rendering API를 이용한 웹페이지 마크다운 변환
  async fetchMarkdownFromUrl(url: string): Promise<{ markdown: string; title: string }> {
    console.log(`[SecondBrainAgent] Fetching markdown for URL via Cloudflare Browser Run: ${url}`);

    // 방법 A: Cloudflare Worker BrowserRun 바인딩 quickAction("markdown")
    try {
      if (this.env.MYBROWSER) {
        const res = await this.env.MYBROWSER.quickAction("markdown", { url });
        if (res.ok) {
          const data = (await res.json()) as any;
          if (data.success && data.result) {
            console.log(`[SecondBrainAgent] BrowserRun quickAction succeeded (${data.result.length} chars)`);
            return {
              markdown: data.result,
              title: data.meta?.title || new URL(url).hostname,
            };
          }
        }
      }
    } catch (browserErr) {
      console.warn("[SecondBrainAgent] BrowserRun quickAction error, trying fallback:", browserErr);
    }

    // 방법 B: Markdown for Agents 헤더(Accept: text/markdown) 직접 fetch
    try {
      const res = await fetch(url, {
        headers: {
          "Accept": "text/markdown, text/html;q=0.9, */*;q=0.8",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
      });

      if (res.ok) {
        const contentType = res.headers.get("content-type") || "";
        const bodyText = await res.text();

        // 마크다운 응답인 경우
        if (contentType.includes("markdown")) {
          return { markdown: bodyText, title: new URL(url).hostname };
        }

        // HTML인 경우: 제목 추출 및 텍스트 정제
        const titleMatch = bodyText.match(/<title[^>]*>([^<]+)<\/title>/i);
        const title = titleMatch ? titleMatch[1].trim() : new URL(url).hostname;

        const cleanText = bodyText
          .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
          .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
          .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, "")
          .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, "")
          .replace(/<[^>]+>/g, "\n")
          .replace(/&nbsp;/gi, " ")
          .replace(/&amp;/gi, "&")
          .replace(/&lt;/gi, "<")
          .replace(/&gt;/gi, ">")
          .replace(/\n{3,}/g, "\n\n")
          .trim();

        if (cleanText.length > 50) {
          return { markdown: cleanText, title };
        }
      }
    } catch (fallbackErr) {
      console.error("[SecondBrainAgent] Fallback fetch failed:", fallbackErr);
    }

    throw new Error(`URL (${url})에서 마크다운 본문을 추출할 수 없습니다.`);
  }

  // 2. 텍스트를 약 800자 단위로 스마트 청킹
  chunkMarkdown(markdown: string, maxChunkSize = 800, overlap = 100): string[] {
    const paragraphs = markdown.split(/\n{2,}/);
    const chunks: string[] = [];
    let currentChunk = "";

    for (const paragraph of paragraphs) {
      const trimmed = paragraph.trim();
      if (!trimmed) continue;

      if ((currentChunk + "\n\n" + trimmed).length <= maxChunkSize) {
        currentChunk = currentChunk ? currentChunk + "\n\n" + trimmed : trimmed;
      } else {
        if (currentChunk) chunks.push(currentChunk);

        if (trimmed.length > maxChunkSize) {
          const sentences = trimmed.split(/(?<=[.!?\n])\s+/);
          let subChunk = "";
          for (const s of sentences) {
            if ((subChunk + " " + s).length <= maxChunkSize) {
              subChunk = subChunk ? subChunk + " " + s : s;
            } else {
              if (subChunk) chunks.push(subChunk);
              subChunk = s.slice(0, maxChunkSize);
            }
          }
          currentChunk = subChunk;
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

  // 3. 청크 임베딩 생성 (BGE-base 768차원)
  async embedChunks(chunks: string[]): Promise<number[][]> {
    const workersAi = createWorkersAI({ binding: this.env.AI });
    const { embeddings } = await embedMany({
      model: workersAi.textEmbeddingModel("@cf/baai/bge-base-en-v1.5"),
      values: chunks,
    });
    return embeddings;
  }

  // 4. URL 인제스트: 마크다운 변환 ➜ 800자 청킹 ➜ 임베딩 ➜ SQLite 텍스트 & Vectorize 벡터 연계 저장
  async ingestUrl(url: string, customTitle?: string) {
    console.log(`[SecondBrainAgent] Ingesting URL: ${url}`);

    // 1) 마크다운 변환
    const { markdown, title } = await this.fetchMarkdownFromUrl(url);
    const finalTitle = customTitle || title || url;

    // 2) 800자 단위 청킹
    const chunks = this.chunkMarkdown(markdown, 800, 100);
    if (chunks.length === 0) {
      throw new Error("웹페이지에서 추출할 수 있는 텍스트가 없습니다.");
    }

    // 3) 임베딩 생성
    const embeddings = await this.embedChunks(chunks);

    // 4) SQLite chunks 테이블 저장 및 Vectorize upsert
    const createdAt = Date.now();
    const vectors = chunks.map((chunk, index) => {
      const id = crypto.randomUUID();

      // SQLite에 원문 텍스트 저장
      void this.sql`
        INSERT INTO chunks (id, url, title, text, created_at)
        VALUES (${id}, ${url}, ${finalTitle}, ${chunk}, ${createdAt})
      `;

      // 동일한 ID로 Vectorize 벡터 객체 구성
      return {
        id,
        values: embeddings[index],
        metadata: {
          source: url,
          title: finalTitle,
          chunkIndex: index,
          totalChunks: chunks.length,
        },
      };
    });

    // Vectorize에 배치 upsert
    const BATCH_SIZE = 50;
    for (let i = 0; i < vectors.length; i += BATCH_SIZE) {
      const batch = vectors.slice(i, i + BATCH_SIZE);
      await this.env.VECTORIZE.upsert(batch);
    }

    // sources 테이블에 등록
    void this.sql`
      INSERT OR REPLACE INTO sources (url, title, chunks_count, created_at)
      VALUES (${url}, ${finalTitle}, ${chunks.length}, ${new Date().toISOString()})
    `;

    console.log(`[SecondBrainAgent] Successfully ingested ${url} into Second Brain (${chunks.length} chunks)`);

    return {
      success: true,
      url,
      title: finalTitle,
      chunksCount: chunks.length,
      snippet: markdown.slice(0, 300),
    };
  }

  // 5. recall 도구 실행 함수: 질문 임베딩 ➜ Vectorize 검색 (topK: 5) ➜ SQLite 텍스트 recall
  async recallChunks(question: string) {
    console.log(`[SecondBrainAgent] recall tool called for question: "${question}"`);
    const workersAi = createWorkersAI({ binding: this.env.AI });

    // 질문 임베딩
    const { embedding } = await embed({
      model: workersAi.textEmbeddingModel("@cf/baai/bge-base-en-v1.5"),
      value: question,
    });

    // Vectorize topK: 5 유사도 검색
    const matches = await this.env.VECTORIZE.query(embedding, {
      topK: 5,
      returnMetadata: "all",
    });

    const results: { id: string; url: string; title: string; text: string; score: number }[] = [];

    for (const m of matches.matches) {
      // 매칭된 벡터 ID로 SQLite chunks 테이블에서 원본 텍스트 Recall
      const rows = [
        ...this.sql<ChunkRecord>`SELECT id, url, title, text, created_at FROM chunks WHERE id = ${m.id}`,
      ];
      if (rows.length > 0) {
        const row = rows[0];
        results.push({
          id: row.id,
          url: row.url,
          title: row.title || row.url,
          text: row.text,
          score: m.score,
        });
      }
    }

    return {
      totalFound: results.length,
      retrievedPieces: results.map((r, i) => ({
        pieceIndex: i + 1,
        sourceUrl: r.url,
        title: r.title,
        relevanceScore: `${(r.score * 100).toFixed(1)}%`,
        text: r.text,
      })),
    };
  }

  // 6. listSources 도구 실행 함수: 저장된 모든 URL 및 제목 반환
  async listAllSources(): Promise<SourceRecord[]> {
    return [...this.sql<SourceRecord>`SELECT url, title, chunks_count, created_at FROM sources ORDER BY created_at DESC`];
  }

  // 7. 특정 URL 또는 전체 청크 조회
  async getChunks(url?: string, limit = 50): Promise<ChunkRecord[]> {
    if (url) {
      return [...this.sql<ChunkRecord>`SELECT id, url, title, text, created_at FROM chunks WHERE url = ${url} LIMIT ${limit}`];
    }
    return [...this.sql<ChunkRecord>`SELECT id, url, title, text, created_at FROM chunks ORDER BY created_at DESC LIMIT ${limit}`];
  }

  // 8. 기억된 웹페이지 및 관련 벡터/청크 삭제 (deleteSource)
  async deleteSource(url: string): Promise<{ success: boolean; deletedChunks: number }> {
    console.log(`[SecondBrainAgent] Deleting source and all associated chunks for: ${url}`);

    // 1) 해당 URL의 모든 chunk id 조회
    const rows = [...this.sql<{ id: string }>`SELECT id FROM chunks WHERE url = ${url}`];
    const ids = rows.map((r) => r.id);

    // 2) Vectorize에서 해당 ID 벡터 일괄 삭제
    if (ids.length > 0) {
      try {
        const BATCH_SIZE = 100;
        for (let i = 0; i < ids.length; i += BATCH_SIZE) {
          const batch = ids.slice(i, i + BATCH_SIZE);
          await this.env.VECTORIZE.deleteByIds(batch);
        }
        console.log(`[SecondBrainAgent] Successfully deleted ${ids.length} vectors from Vectorize`);
      } catch (vecErr) {
        console.warn("[SecondBrainAgent] Vectorize deleteByIds warning:", vecErr);
      }
    }

    // 3) SQLite chunks 및 sources 테이블에서 삭제
    void this.sql`DELETE FROM chunks WHERE url = ${url}`;
    void this.sql`DELETE FROM sources WHERE url = ${url}`;

    return {
      success: true,
      deletedChunks: ids.length,
    };
  }

  // 9. 전체 기억 초기화 (clearAllSources)
  async clearAllSources(): Promise<{ success: boolean; deletedChunks: number }> {
    console.log(`[SecondBrainAgent] Clearing all sources and chunks from Second Brain`);

    const rows = [...this.sql<{ id: string }>`SELECT id FROM chunks`];
    const ids = rows.map((r) => r.id);

    if (ids.length > 0) {
      try {
        const BATCH_SIZE = 100;
        for (let i = 0; i < ids.length; i += BATCH_SIZE) {
          const batch = ids.slice(i, i + BATCH_SIZE);
          await this.env.VECTORIZE.deleteByIds(batch);
        }
      } catch (vecErr) {
        console.warn("[SecondBrainAgent] Vectorize deleteByIds warning:", vecErr);
      }
    }

    void this.sql`DELETE FROM chunks`;
    void this.sql`DELETE FROM sources`;

    return {
      success: true,
      deletedChunks: ids.length,
    };
  }

  // 8. Q&A 기록 조회
  async getQaHistory(limit = 20): Promise<QaRecord[]> {
    return [...this.sql<QaRecord>`SELECT id, question, answer, sources, created_at FROM qa_history ORDER BY created_at DESC LIMIT ${limit}`];
  }

  // 9. RAG 기반 AI 채팅 (onChatMessage)
  async onChatMessage(
    _onFinish: StreamTextOnFinishCallback<ToolSet>,
    options?: { abortSignal?: AbortSignal }
  ) {
    const workersAi = createWorkersAI({ binding: this.env.AI });

    // 사용자의 가장 최근 메시지 확인
    const userMessages = this.messages.filter((m) => m.role === "user");
    const latestUserMessage = userMessages[userMessages.length - 1];
    let latestText = "";
    if (latestUserMessage) {
      for (const part of latestUserMessage.parts) {
        if (part.type === "text") {
          latestText += part.text + " ";
        }
      }
    }
    latestText = latestText.trim();

    // 사용자가 메시지에 URL을 직접 입력한 경우 자동 수집(인제스트) 처리
    let autoIngestPrompt = "";
    const urlMatch = latestText.match(/https?:\/\/[^\s]+/i);
    if (urlMatch) {
      const targetUrl = urlMatch[0].replace(/[),.]+$/, "");
      try {
        const ingestRes = await this.ingestUrl(targetUrl);
        autoIngestPrompt = `\n[실시간 알림]: 사용자가 방금 입력한 URL (${targetUrl})의 웹페이지를 세컨드 브레인에 성공적으로 저장했습니다 (제목: "${ingestRes.title}", 총 ${ingestRes.chunksCount}개 조각). 사용자에게 해당 웹페이지가 브레인에 안전하게 기억되었음을 먼저 기쁘게 알려주세요.`;
      } catch (err: any) {
        autoIngestPrompt = `\n[실시간 알림]: URL (${targetUrl}) 저장 중 오류가 발생했습니다: ${err.message}`;
      }
    }

    // 모델에 제공할 도구(Tools) 정의
    const tools = {
      recall: tool({
        description:
          "세컨드 브레인(Vectorize & SQLite)에 저장된 웹페이지 지식 조각들을 검색하여 가져옵니다. 사용자가 특정 지식, 문서, 웹페이지 내용에 대해 질문할 때 반드시 이 도구를 호출하세요.",
        inputSchema: z.object({
          question: z.string().describe("검색할 질문 또는 키워드"),
        }),
        execute: async ({ question }: { question: string }) => {
          return await this.recallChunks(question);
        },
      }),
      listSources: tool({
        description:
          "세컨드 브레인에 현재 저장되어 기억하고 있는 모든 웹페이지 URL과 제목, 등록 시각 목록을 반환합니다. 사용자가 어떤 문서/웹페이지가 저장되어 있는지 묻거나 기억 목록을 요청할 때 호출하세요.",
        inputSchema: z.object({}),
        execute: async () => {
          const sources = await this.listAllSources();
          return {
            totalSources: sources.length,
            sources,
          };
        },
      }),
    };

    const systemPrompt = `당신은 사용자가 저장한 웹페이지들을 기억하고 지식을 연결해주는 개인용 '세컨드 브레인(Second Brain)' AI 어시스턴트입니다.

[원칙과 행동 지침]
1. 사용자가 웹페이지 내용이나 지식에 대해 물어보면 **반드시 \`recall\` 도구를 호출**하여 세컨드 브레인에 저장된 조각 텍스트를 검색하세요.
2. 불러온 조각 내용을 가장 중요한 근거로 삼아 답변을 구성하세요.
3. **[필수] 답변 시 항상 근거가 된 출처 URL과 페이지 제목을 명확히 밝히세요.** (예: 출처: [Cloudflare Workers 공식문서](https://...))
4. 사용자가 어떤 웹페이지들이 저장되어 있는지 알고 싶어 하면 **\`listSources\` 도구를 호출**하여 목록을 안내하세요.
5. 저장된 지식 조각에 없는 내용이거나 알 수 없는 경우, 지어내지 말고 "세컨드 브레인에 아직 해당 내용에 대한 웹페이지가 저장되어 있지 않습니다"라고 정직하게 안내하고, 관련 URL을 채팅창에 입력해주면 기억하겠다고 제안하세요.
6. 모든 답변은 마크다운 문법(제목, 글머리 기호, 볼드체, 링크)을 사용하여 읽기 편하게 한국어로 작성하세요.
${autoIngestPrompt}
`;

    const result = streamText({
      model: workersAi("@cf/qwen/qwen3.8-27b"),
      system: systemPrompt,
      messages: await convertToModelMessages(this.messages),
      tools: tools as ToolSet,
      abortSignal: options?.abortSignal,
      stopWhen: isLoopFinished(),
      onFinish: async (event) => {
        if (_onFinish) {
          await _onFinish(event);
        }
      },
    });

    return result.toUIMessageStreamResponse();
  }
}

// Worker Fetch 라우터
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // 1. 웹페이지 URL 직접 인제스트 API
    if (url.pathname === "/api/ingest-url" && request.method === "POST") {
      try {
        const body = (await request.json()) as { url: string; title?: string };
        if (!body.url || !body.url.startsWith("http")) {
          return Response.json({ error: "올바른 HTTP/HTTPS URL을 입력해주세요." }, { status: 400 });
        }

        const agent = await getAgentByName<Env, SecondBrainAgent>(
          env.SecondBrainAgent as unknown as DurableObjectNamespace<SecondBrainAgent>,
          "default"
        );

        const result = await agent.ingestUrl(body.url, body.title);
        return Response.json({
          success: true,
          message: "웹페이지가 성공적으로 세컨드 브레인에 기억되었습니다.",
          data: result,
        });
      } catch (err: any) {
        console.error("Ingest URL error:", err);
        return Response.json(
          { error: err.message || "URL 인제스트 중 오류가 발생했습니다." },
          { status: 500 }
        );
      }
    }

    // 2. 저장된 웹페이지 목록 조회 API
    if (url.pathname === "/api/sources" && request.method === "GET") {
      try {
        const agent = await getAgentByName<Env, SecondBrainAgent>(
          env.SecondBrainAgent as unknown as DurableObjectNamespace<SecondBrainAgent>,
          "default"
        );
        const sources = await agent.listAllSources();
        return Response.json({ sources, count: sources.length });
      } catch (err: any) {
        return Response.json({ error: err.message }, { status: 500 });
      }
    }

    // 2-1. 기억된 웹페이지 삭제 API (단일 삭제 또는 전체 초기화)
    if (url.pathname === "/api/sources" && request.method === "DELETE") {
      try {
        let targetUrl = url.searchParams.get("url");
        let isClearAll = false;

        if (!targetUrl) {
          try {
            const body = (await request.json()) as { url?: string; all?: boolean };
            if (body.all) isClearAll = true;
            if (body.url) targetUrl = body.url;
          } catch {}
        }

        const agent = await getAgentByName<Env, SecondBrainAgent>(
          env.SecondBrainAgent as unknown as DurableObjectNamespace<SecondBrainAgent>,
          "default"
        );

        if (isClearAll) {
          const result = await agent.clearAllSources();
          return Response.json({
            success: true,
            message: "세컨드 브레인의 모든 기억이 초기화되었습니다.",
            data: result,
          });
        }

        if (!targetUrl) {
          return Response.json({ error: "삭제할 웹페이지 URL이 지정되지 않았습니다." }, { status: 400 });
        }

        const result = await agent.deleteSource(targetUrl);
        return Response.json({
          success: true,
          message: `웹페이지 (${targetUrl}) 및 연관된 ${result.deletedChunks}개 벡터/청크가 성공적으로 삭제되었습니다.`,
          data: result,
        });
      } catch (err: any) {
        console.error("Delete source error:", err);
        return Response.json({ error: err.message || "삭제 중 오류가 발생했습니다." }, { status: 500 });
      }
    }

    // 3. 청크 목록 조회 API
    if (url.pathname === "/api/chunks" && request.method === "GET") {
      try {
        const sourceUrl = url.searchParams.get("url") || undefined;
        const agent = await getAgentByName<Env, SecondBrainAgent>(
          env.SecondBrainAgent as unknown as DurableObjectNamespace<SecondBrainAgent>,
          "default"
        );
        const chunks = await agent.getChunks(sourceUrl);
        return Response.json({ chunks, count: chunks.length });
      } catch (err: any) {
        return Response.json({ error: err.message }, { status: 500 });
      }
    }

    // 4. 에이전트 라우팅 (WebSocket / HTTP SSE)
    return (
      (await routeAgentRequest(request, env)) ??
      new Response("Not Found", { status: 404 })
    );
  },
} satisfies ExportedHandler<Env>;
