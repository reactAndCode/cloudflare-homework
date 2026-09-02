import { AIChatAgent } from "@cloudflare/ai-chat";
import { routeAgentRequest } from "agents";
import {
  convertToModelMessages,
  isLoopFinished,
  streamText,
  type StreamTextOnFinishCallback,
  type ToolSet,
  type UIMessage,
} from "ai";
import { createWorkersAI } from "workers-ai-provider";
import { createTools } from "./tools.js";

interface Env {
  AI: any;
}

interface CartItem {
  item: string;
  price: number;
}

export class OrderConciergeAgent extends AIChatAgent<Env> {
  private cart: CartItem[] = [];

  async onChatMessage(
    _onFinish: StreamTextOnFinishCallback<ToolSet>,
    options?: { abortSignal?: AbortSignal },
  ) {
    const workersAi = createWorkersAI({
      binding: this.env.AI,
    });

    const tools = createTools(
      this.cart,
      (item) => this.cart.push(item),
      () => { this.cart = []; }
    );

    const result = streamText({
      model: workersAi("@cf/qwen/qwen3.8-27b"),
      system: `당신은 음식 주문 컨시어지(비서)입니다.
- 메뉴를 묻는 사용자에게 메뉴를 제공하세요. (getMenu)
- 사용자가 주문을 원하면 장바구니에 아이템을 담으세요. (addToCart)
- 장바구니 내용을 확인해야 할 때 장바구니를 조회하세요. (viewCart)
- 배달을 위해 사용자의 위치를 파악하세요. (getLocation)
- 위치, 장바구니 내역이 모두 확인되면 주문을 진행할지 묻고 placeOrder를 호출하세요.
- 모든 답변은 한국어로 친절하게 작성하세요.`,
      messages: await convertToModelMessages(this.messages),
      tools: tools as ToolSet,
      abortSignal: options?.abortSignal,
      stopWhen: isLoopFinished(),
    });

    return result.toUIMessageStreamResponse();
  }

  sanitizeMessageForPersistence(message: UIMessage): UIMessage {
    return {
      ...message,
      parts: message.parts.map((part) => {
        if (part.type === "text") {
          // 가상 카드 번호 마스킹 (예: 1234-5678-1234-5678)
          return {
            ...part,
            text: part.text.replace(/\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g, "****-****-****-****"),
          };
        }
        return part;
      }),
    };
  }
}

export default {
  async fetch(request, env) {
    return (
      (await routeAgentRequest(request, env)) ?? new Response(null, { status: 404 })
    );
  },
} satisfies ExportedHandler<Env>;