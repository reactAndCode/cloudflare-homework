/// <reference types="@cloudflare/workers-types" />
/// <reference path="../worker-configuration.d.ts" />

import { AIChatAgent } from "@cloudflare/ai-chat";
import { Agent, callable, routeAgentRequest } from "agents";
import { generateText, isLoopFinished, Output } from "ai";
import { RpcTarget } from "cloudflare:workers";
import { createWorkersAI } from "workers-ai-provider";
import z from "zod";

// Zod Schema for Structured Argument by Debater Sub-Agent
const DebateArgumentSchema = z.object({
  stance: z.string().meta({
    description: "주장하는 입장 (예: 민초 찬성 / 민초 반대, 부먹 / 찍먹 등)",
  }),
  opening: z.string().meta({
    description: "모두발언 (상대를 압도할 강렬한 논리적 서론)",
  }),
  arguments: z
    .array(
      z.object({
        point: z.string().meta({ description: "핵심 논거 요약 (1문장)" }),
        reasoning: z.string().meta({ description: "논거에 대한 세부 설명 및 당위성" }),
      })
    )
    .length(3)
    .meta({
      description: "정확히 3개의 논거 목록",
    }),
  closing: z.string().meta({
    description: "마무리 발언 (결론 및 최종 강조)",
  }),
});

export type DebateArgument = z.infer<typeof DebateArgumentSchema>;

export type DebateState = {
  status: "idle" | "analyzing" | "debating" | "judging" | "completed";
  topic?: string;
  proLabel?: string;
  conLabel?: string;
  activity?: Record<string, string>; // childAgentId -> activity string
  proArgument?: DebateArgument;
  conArgument?: DebateArgument;
  winner?: string;
  verdict?: string;
};

// RpcTarget for live progress reporting from Sub-Agent to Orchestrator
class ProgressReporter extends RpcTarget {
  father: DebateOrchestrator;
  childName: string;

  constructor(father: DebateOrchestrator, childName: string) {
    super();
    this.father = father;
    this.childName = childName;
  }

  report(activity: string) {
    this.father.setState({
      ...this.father.state,
      activity: {
        ...this.father.state.activity,
        [this.childName]: activity,
      },
    });
  }
}

// Sub-Agent: Debater representing one specific stance
export class DebaterAgent extends Agent<Env> {
  async prepareArgument(
    topic: string,
    stanceRole: string,
    progressReporter: ProgressReporter
  ): Promise<DebateArgument> {
    const workersAi = createWorkersAI({ binding: (this.env as any).AI });

    // Step 1: Report initialization
    progressReporter.report(`[${stanceRole}] 모두발언 작성 중...`);

    // Simulate step notification for live UI updates
    progressReporter.report(`[${stanceRole}] 논거 1/3 준비 중...`);
    
    // We prompt the AI to create structured argument
    progressReporter.report(`[${stanceRole}] 논거 2/3 준비 중...`);

    progressReporter.report(`[${stanceRole}] 논거 3/3 및 마무리 발언 작성 중...`);

    const { output } = await generateText({
      model: workersAi("@cf/zai-org/glm-4.7-flash"),
      prompt: `당신은 "${topic}" 주제에 대해 "${stanceRole}" 입장을 철저히 대변하는 전문 토론자입니다.
상대방의 입장을 완전히 압도할 수 있도록 가장 설득력 있고 명확한 주장을 펼쳐야 합니다.

다음 요구사항을 정확히 준수하여 한국어로 작성하세요:
1. stance: 당신이 맡은 입장 명칭 (${stanceRole})
2. opening: 모두발언 (입장 표명 및 강력한 서론)
3. arguments: 정확히 3개의 논거 (point와 reasoning)
4. closing: 마무리 발언

상대방과 맥락이 분리되어 있으므로 오직 당신의 입장 (${stanceRole})만을 최고의 논리로 변호하세요.`,
      stopWhen: isLoopFinished(),
      output: Output.object({
        schema: DebateArgumentSchema,
      }),
    });

    progressReporter.report(`[${stanceRole}] 입론 및 3개 논거 준비 완료!`);

    return output;
  }
}

// Parent Orchestrator & Judge Agent
export class DebateOrchestrator extends AIChatAgent<Env, DebateState> {
  initialState: DebateState = {
    status: "idle",
  };

  @callable()
  async startDebate(topic: string) {
    this.setState({
      status: "analyzing",
      topic,
      proLabel: undefined,
      conLabel: undefined,
      activity: {},
      proArgument: undefined,
      conArgument: undefined,
      winner: undefined,
      verdict: undefined,
    });

    const workersAi = createWorkersAI({ binding: (this.env as any).AI });

    // Step 1: Determine Pro and Con stances for the topic
    const {
      output: { proLabel, conLabel },
    } = await generateText({
      model: workersAi("@cf/zai-org/glm-4.7-flash"),
      output: Output.object({
        schema: z.object({
          proLabel: z.string().meta({ description: "찬성 또는 A측 입장 (예: 민초단, 부먹파)" }),
          conLabel: z.string().meta({ description: "반대 또는 B측 입장 (예: 반민초단, 찍먹파)" }),
        }),
      }),
      prompt: `다음 주제에 대하여 서로 대립하는 두 토론 입장(찬성/반대 또는 A측/B측)의 라벨 명칭을 짧게 한글로 정해지세요:
주제: "${topic}"`,
    });

    this.setState({
      ...this.state,
      proLabel,
      conLabel,
      status: "debating",
    });

    // Step 2: Dispatch 2 parallel sub-agents (DebaterAgent) in isolated contexts
    const [proResult, conResult] = await Promise.all([
      (async () => {
        const stubAgent = await this.subAgent(DebaterAgent, "debater-pro");
        const reporter = new ProgressReporter(this, "pro");
        return await stubAgent.prepareArgument(topic, proLabel, reporter);
      })(),
      (async () => {
        const stubAgent = await this.subAgent(DebaterAgent, "debater-con");
        const reporter = new ProgressReporter(this, "con");
        return await stubAgent.prepareArgument(topic, conLabel, reporter);
      })(),
    ]);

    this.setState({
      ...this.state,
      proArgument: proResult,
      conArgument: conResult,
      status: "judging",
    });

    // Step 3: Judge evaluates both structured arguments and makes a final decision
    const judgePrompt = `당신은 엄격하고 공정한 AI 토론 심판입니다.
주제: "${topic}"

[${proLabel} 측의 주장]
- 모두발언: ${proResult.opening}
- 논거 1: ${proResult.arguments[0]?.point} - ${proResult.arguments[0]?.reasoning}
- 논거 2: ${proResult.arguments[1]?.point} - ${proResult.arguments[1]?.reasoning}
- 논거 3: ${proResult.arguments[2]?.point} - ${proResult.arguments[2]?.reasoning}
- 마무리발언: ${proResult.closing}

[${conLabel} 측의 주장]
- 모두발언: ${conResult.opening}
- 논거 1: ${conResult.arguments[0]?.point} - ${conResult.arguments[0]?.reasoning}
- 논거 2: ${conResult.arguments[1]?.point} - ${conResult.arguments[1]?.reasoning}
- 논거 3: ${conResult.arguments[2]?.point} - ${conResult.arguments[2]?.reasoning}
- 마무리발언: ${conResult.closing}

양쪽 주장을 면밀히 비교하여:
1. 최종 승자(Winner)를 "${proLabel}" 또는 "${conLabel}" 중 정확히 1개로 결정하세요.
2. 어떤 논거가 판정에 결정적이었는지, 상대의 어떤 반론이나 허점을 이겨냈는지 구체적으로 밝히는 판정문을 작성하세요.`;

    const { output: judgeOutput } = await generateText({
      model: workersAi("@cf/zai-org/glm-4.7-flash"),
      output: Output.object({
        schema: z.object({
          winner: z.string().meta({ description: "승자의 입장 라벨명 (예: 민초단)" }),
          verdict: z.string().meta({ description: "승리 이유 및 결정적 논거를 밝히는 판정 총평" }),
        }),
      }),
      prompt: judgePrompt,
    });

    this.setState({
      ...this.state,
      winner: judgeOutput.winner,
      verdict: judgeOutput.verdict,
      status: "completed",
    });

    return {
      proArgument: proResult,
      conArgument: conResult,
      winner: judgeOutput.winner,
      verdict: judgeOutput.verdict,
    };
  }
}

export default {
  async fetch(request: Request, env: Env) {
    return (
      (await routeAgentRequest(request, env)) ??
      new Response(null, { status: 404 })
    );
  },
} satisfies ExportedHandler<Env>;
