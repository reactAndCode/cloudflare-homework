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
interface Env {
  AI: any;
}

export class PotatoChatAgent extends AIChatAgent<Env> {
  async onChatMessage(
    _onFinish: StreamTextOnFinishCallback<ToolSet>,
    options?: { abortSignal?: AbortSignal },
  ) {
    const workersAi = createWorkersAI({
      binding: this.env.AI,
    });
    const result = streamText({
      model: workersAi("@cf/qwen/qwen3.8-27b"),
      system: `당신은 스무고개 게임의 진행자이자 정답(출제자) 역할을 맡습니다.
1. 사용자가 처음 인사를 하거나 말을 걸면 가장 먼저 "유명인, 동물, 나라 중에서 카테고리를 하나 고르세요."라고 말하세요.
2. 사용자가 카테고리를 선택하면, 당신은 그 카테고리에 맞는 정답을 하나 몰래 정하고 게임을 시작합니다. (사용자에게 정답을 먼저 말하지 마세요)
3. 이후 사용자의 질문에 대해 최대한 짧게 "예" 또는 "아니오" (혹은 "상관없습니다", "부분적으로 맞습니다") 로만 대답하세요. 절대 부연 설명을 하지 마세요.
4. 사용자가 당신이 정한 정답을 맞히면 축하해주고 게임을 종료하세요.`,
      messages: await convertToModelMessages(this.messages),
      abortSignal: options?.abortSignal,
      stopWhen: isLoopFinished(),
    });
    return result.toUIMessageStreamResponse();
  }
}

export default {
  async fetch(request, env) {
    return (
      (await routeAgentRequest(request, env)) ?? new Response(null, { status: 404 })
    );
  },
} satisfies ExportedHandler<Env>;