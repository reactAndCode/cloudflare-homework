import { AIChatAgent } from "@cloudflare/ai-chat";
import { routeAgentRequest } from "agents";
import { createBrowserRuntime } from "agents/browser/ai";
import { convertToModelMessages, isLoopFinished, streamText, tool } from "ai";
import { createWorkersAI } from "workers-ai-provider";
import { z } from "zod";

export { CodemodeRuntime } from "@cloudflare/codemode";

export class BrowserAgent extends AIChatAgent<Env> {
  async closeBrowserSession() {
    console.log(`[2-6] [BrowserAgent DO] 🔒 closeBrowserSession() 실행됨`);
    const { connector } = createBrowserRuntime({
      ctx: this.ctx,
      browser: this.env.BROWSER,
      loader: this.env.LOADER,
    });
    await connector.closeSession();
    return { success: true, message: "브라우저 세션이 성공적으로 닫혔습니다." };
  }

  async onChatMessage() {
    console.log(
      `[2-1] [BrowserAgent DO onChatMessage] 📩 신규 대화 메시지 수신! (총 보관 메시지: ${this.messages.length}개)`
    );

    const workersAi = createWorkersAI({ binding: this.env.AI });

    console.log(
      `[2-2] [BrowserAgent DO] 🛠️ createBrowserRuntime 생성 (BROWSER & LOADER 바인딩 연동)`
    );
    const { tools: browserTools, connector } = createBrowserRuntime({
      ctx: this.ctx,
      browser: this.env.BROWSER,
      loader: this.env.LOADER,
    });

    // 열렸던 브라우저 세션을 명시적으로 종료/닫는 도구
    const closeBrowserTool = tool({
      description: "현재 열려있는 브라우저 세션을 종료하고 닫습니다.",
      inputSchema: z.object({}),
      execute: async () => {
        console.log(`[2-5] [BrowserAgent DO] 🔒 close_browser 도구 실행: 브라우저 세션을 닫습니다.`);
        await connector.closeSession();
        return { success: true, message: "브라우저 세션이 성공적으로 닫혔습니다." };
      },
    });

    console.log(
      `[2-3] [BrowserAgent DO] 🤖 Workers AI (@cf/qwen/qwen3.8-27b) streamText() 실행 시작`
    );
    try {
      const result = streamText({
        model: workersAi("@cf/qwen/qwen3.8-27b"),
        system:
          "You are a helpful browser automation AI agent. You can browse web pages, inspect content, and close the browser session using close_browser when requested or finished.",
        messages: await convertToModelMessages(this.messages),
        tools: {
          ...browserTools,
          close_browser: closeBrowserTool,
        },
        stopWhen: isLoopFinished(),
      });

      console.log(
        `[2-4] [BrowserAgent DO] 🌊 toUIMessageStreamResponse() 스트림 응답 반환 완료`
      );
      return result.toUIMessageStreamResponse();
    } catch (err: any) {
      console.error(`[BrowserAgent DO Error] ❌ Workers AI 호출 중 에러 발생:`, err?.message || err);
      const fallbackResult = streamText({
        model: workersAi("@cf/qwen/qwen3.8-27b"),
        system: "You are a helpful browser automation AI agent.",
        messages: await convertToModelMessages(this.messages),
      });
      return fallbackResult.toUIMessageStreamResponse();
    }
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    console.log(`[1-1] [Worker fetch] 🌐 수신된 요청 URL: ${request.method} ${url.pathname}`);

    // /agents/ 경로로 시작하는 에이전트 요청만 routeAgentRequest로 처리
    if (url.pathname.startsWith("/agents/")) {
      console.log(`[1-2] [Worker fetch] 🔀 /agents/ 경로 감지 -> routeAgentRequest()에 라우팅 전달`);
      const agentResponse = await routeAgentRequest(request, env);
      if (agentResponse) {
        console.log(`[1-3] [Worker fetch] ✅ Agent 라우팅 성공 응답 생성`);
        return agentResponse;
      }
    }

    const assets = (
      env as unknown as {
        ASSETS?: { fetch: (req: typeof request) => Promise<Response> };
      }
    ).ASSETS;
    if (assets) {
      console.log(`[1-4] [Worker fetch] 📂 정적 자산(ASSETS) 서빙 처리`);
      return await assets.fetch(request);
    }

    return new Response(null, { status: 404 });
  },
} satisfies ExportedHandler<Env>;
