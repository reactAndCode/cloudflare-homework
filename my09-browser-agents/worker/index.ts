import { AIChatAgent } from "@cloudflare/ai-chat";
import { routeAgentRequest } from "agents";
import {
  convertToModelMessages,
  isLoopFinished,
  streamText,
  type StreamTextOnFinishCallback,
  type ToolSet,
} from "ai";
import { createWorkersAI } from "workers-ai-provider";
import { createBrowserTools } from "./tools.js";

export class BrowserAgent extends AIChatAgent<Env> {
  async onChatMessage(
    _onFinish: StreamTextOnFinishCallback<ToolSet>,
    options?: { abortSignal?: AbortSignal },
  ) {
    const workersAi = createWorkersAI({
      binding: this.env.AI,
    });

    const tools = createBrowserTools();

    const result = streamText({
      model: workersAi("@cf/qwen/qwen3.8-27b"),
      system: `당신은 웹 탐색 및 브라우저 제어 전문 AI 비서(Browser Agent)입니다.
- 웹 페이지 정보나 내용 조회가 필요하면 browseUrl 도구를 사용하세요.
- 검색이 필요하면 searchWeb 도구를 사용하세요.
- 브라우저 탐색, 스크린샷, 페이지 액션 등이 필요하면 executeBrowserAction 도구를 사용하세요. (이 작업은 사용자 승인이 필요합니다)
- 내부 생각이나 추론(Reasoning)을 텍스트로 노출하지 마시고, 모든 최종 답변은 반드시 친절하고 자연스러운 한국어로만 작성하세요.`,
      messages: await convertToModelMessages(this.messages),
      tools: tools as ToolSet,
      abortSignal: options?.abortSignal,
      stopWhen: isLoopFinished(),
    });

    return result.toUIMessageStreamResponse();
  }
}

export default {
  async fetch(request, env) {
    return (
      (await routeAgentRequest(request, env)) ??
      new Response("Not found", { status: 404 })
    );
  },
} satisfies ExportedHandler<Env>;
