import { AIChatAgent } from "@cloudflare/ai-chat";
import { getAgentByName, routeAgentRequest } from "agents";
import { createWorkersAI } from "workers-ai-provider";
import { streamText, convertToModelMessages } from "ai";

export class RAGAgent extends AIChatAgent<Env> {
  async ingestPdf(buffer: ArrayBuffer, fileName: string, fileType: string): Promise<string> {
    const result = await this.env.AI.toMarkdown({
      name: fileName,
      blob: new Blob([buffer], { type: fileType }),
    });

    if ("error" in result) {
      throw new Error(`문서 마크다운 변환 실패: ${result.error}`);
    }

    const markdownContent = result.data;

    // 변환된 마크다운을 Durable Object 대화 히스토리에 기록 (클라이언트 실시간 스트림 반영 및 LLM 컨텍스트 전달)
    await this.saveMessages((messages) => [
      ...messages,
      {
        id: crypto.randomUUID(),
        role: "assistant",
        parts: [
          {
            type: "text",
            text: `📄 **[${fileName}]** 문서가 R2에 성공적으로 업로드되고 마크다운으로 변환되었습니다.\n\n---\n\n${markdownContent}`,
          },
        ],
      },
    ]);

    return markdownContent;
  }

  async onChatMessage() {
    const workersai = createWorkersAI({ binding: this.env.AI });

    const result = streamText({
      model: workersai("@cf/meta/llama-3.1-8b-instruct"),
      system:
        "당신은 사용자가 업로드한 문서(PDF, 텍스트 등)를 기반으로 성실하게 답변하는 RAG 어시스턴트입니다. 업로드된 문서 내용을 바탕으로 사용자 질문에 한국어로 명확하고 친절하게 답변하세요.",
      messages: await convertToModelMessages(this.messages),
    });

    return result.toUIMessageStreamResponse();
  }
}

export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);

    // PDF 및 첨부파일 R2 업로드 및 마크다운 변환 엔드포인트
    if (url.pathname === "/api/upload" && request.method === "POST") {
      try {
        const formData = await request.formData();
        const file = formData.get("file") as File | null;
        if (!file) {
          return new Response(JSON.stringify({ error: "업로드할 파일이 전달되지 않았습니다." }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }

        const buffer = await file.arrayBuffer();
        const timestamp = Date.now();
        const storageFileName = `${timestamp}-${file.name}`;

        // 1. R2 버킷에 원본 파일 업로드
        await env.FILES.put(storageFileName, buffer, {
          httpMetadata: {
            contentType: file.type || "application/octet-stream",
          },
          customMetadata: {
            originalName: file.name,
            uploadedAt: new Date().toISOString(),
          },
        });

        // 2. RAGAgent Durable Object 인스턴스 획득
        const stub = await getAgentByName(env.RAGAgent, "default");

        // 3. toMarkdown을 통해 마크다운으로 변환 및 에이전트에 등록
        const markdown = await stub.ingestPdf(buffer, file.name, file.type || "application/pdf");

        // 4. R2에 변환된 마크다운 텍스트도 보관 (.md)
        await env.FILES.put(`${storageFileName}.md`, markdown, {
          httpMetadata: {
            contentType: "text/markdown; charset=utf-8",
          },
        });

        return new Response(
          JSON.stringify({
            success: true,
            fileName: storageFileName,
            originalName: file.name,
            size: file.size,
            markdown,
          }),
          {
            headers: { "Content-Type": "application/json" },
          }
        );
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return new Response(JSON.stringify({ error: message }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    // 업로드된 파일 목록 조회 API
    if (url.pathname === "/api/files" && request.method === "GET") {
      try {
        const listed = await env.FILES.list({ limit: 50 });
        const files = listed.objects.map((obj) => ({
          key: obj.key,
          size: obj.size,
          uploaded: obj.uploaded,
          httpMetadata: obj.httpMetadata,
          customMetadata: obj.customMetadata,
        }));
        return new Response(JSON.stringify({ files }), {
          headers: { "Content-Type": "application/json" },
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return new Response(JSON.stringify({ error: message }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    const agentResponse = await routeAgentRequest(request, env);
    if (agentResponse) return agentResponse;

    return new Response("Not Found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;