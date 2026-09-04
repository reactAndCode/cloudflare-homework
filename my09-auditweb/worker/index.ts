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
import { createAuditTools } from "./tools.js";

export class SeoAuditAgent extends AIChatAgent<Env> {
  async onChatMessage(
    _onFinish: StreamTextOnFinishCallback<ToolSet>,
    options?: { abortSignal?: AbortSignal },
  ) {
    const workersAi = createWorkersAI({
      binding: this.env.AI,
    });

    const tools = createAuditTools(this.env);

    const result = streamText({
      model: workersAi("@cf/qwen/qwen3.8-27b"),
      system: `당신은 실제 브라우저 제어 능력을 가진 전문 SEO(검색엔진 최적화) 웹 감사 에이전트입니다.
사용자가 검사할 웹사이트 URL을 제공하거나 검사를 요청하면, 반드시 \`auditSeo\` 도구를 호출하여 페이지를 접속하고 DOM 상태를 체크하세요.

[감사 보고서 작성 규칙]
1. 📊 **종합 점수**: 100점 만점 중 획득 점수와 통과/실패 항목 수 요약 (예: 87.5점 / 8개 중 7개 통과)
2. ❌ **실패 항목 분석**: 검사 실패(Fail) 항목들에 대해 발견된 실제 값과 원인을 정확히 설명
3. 🛠️ **실패 항목 수정 가이드**: 각 실패한 항목을 개발자가 즉시 적용할 수 있도록 구체적인 HTML 코드 예시와 함께 가이드 제시
4. 💡 **SEO 총평 및 추가 제언**: 해당 사이트의 SEO 상태에 대한 총평과 접근성/성능 측면 추가 권장사항 제공

모든 답변은 정돈되고 가독성 높은 마크다운 형식으로 친절하게 작성하세요.`,
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
      new Response(null, { status: 404 })
    );
  },
} satisfies ExportedHandler<Env>;
