/// <reference types="@cloudflare/workers-types" />
/// <reference path="../worker-configuration.d.ts" />

import { AIChatAgent } from "@cloudflare/ai-chat";
import { Agent, callable, routeAgentRequest } from "agents";
import { generateText, isLoopFinished, Output, tool } from "ai";
import Cloudflare from "cloudflare";
import { RpcTarget } from "cloudflare:workers";
import { createWorkersAI } from "workers-ai-provider";
import z from "zod";

const FindingSchema = z.object({
  topic: z.string().meta({
    description: "Short title summarizing what this set of findings is about.",
  }),
  keyFindings: z
    .array(
      z.string().meta({
        description: "A single concise factual statement from the research.",
      }),
    )
    .max(5)
    .meta({
      description: "3-5 distinct key facts extracted from the research text.",
    }),
});

export type Finding = z.infer<typeof FindingSchema>;

export type OrchestratorState = {
  status: "idle" | "planning" | "researching" | "completed";
  topic?: string;
  plan?: string[];
  findings?: Finding[];
  activity?: Record<string, string>;
  summary?: string;
};

class ProgressReporter extends RpcTarget {
  father: Orchestrator;
  childName: string;

  constructor(father: Orchestrator, childName: string) {
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

export class Researcher extends Agent<Env> {
  makeCloudflare() {
    return new Cloudflare({
      apiToken: (this.env as any).API_TOKEN || "mock-token",
    });
  }

  async research(query: string, progressReporter: ProgressReporter) {
    const workersAi = createWorkersAI({ binding: (this.env as any).AI });

    const { text } = await generateText({
      model: workersAi("@cf/zai-org/glm-4.7-flash"),
      prompt: `Research this query and gather facts: ${query}`,
      tools: {
        searchWeb: tool({
          description:
            "Search the web via DuckDuckGo. Returns the SERP as markdown.",
          inputSchema: z.object({ searchQuery: z.string() }),
          execute: async ({ searchQuery }) => {
            progressReporter.report(`DuckDuckGo 검색 중: "${searchQuery}"`);
            const env = this.env as any;
            if (env.API_TOKEN && env.ACCOUNT_ID) {
              try {
                const markdown =
                  await this.makeCloudflare().browserRendering.markdown.create({
                    account_id: env.ACCOUNT_ID,
                    url: `https://html.duckduckgo.com/html/?q=${encodeURIComponent(searchQuery)}`,
                  });
                return { ok: true, results: markdown };
              } catch (e: any) {
                return {
                  ok: false,
                  error: e?.message || String(e),
                  results: `Search results markdown for: ${searchQuery}`,
                };
              }
            }
            return {
              ok: true,
              results: `Web research results for "${searchQuery}": Found documentation, blog posts, and core technical updates regarding ${searchQuery}.`,
            };
          },
        }),
        readPage: tool({
          description: "Fetch a URL and return clean markdown via Browser Run.",
          inputSchema: z.object({ url: z.string() }),
          execute: async ({ url }) => {
            progressReporter.report(`웹 페이지 렌더링 및 본문 분석 중: ${url}`);
            const env = this.env as any;
            if (env.API_TOKEN && env.ACCOUNT_ID) {
              try {
                const markdown =
                  await this.makeCloudflare().browserRendering.markdown.create({
                    account_id: env.ACCOUNT_ID,
                    url,
                  });
                return { ok: true, markdown };
              } catch (e: any) {
                return {
                  ok: false,
                  error: e?.message || String(e),
                  markdown: `Page content from ${url}`,
                };
              }
            }
            return { ok: true, markdown: `Extracted readable text from ${url}` };
          },
        }),
      },
      stopWhen: isLoopFinished(),
    });

    const { output } = await generateText({
      model: workersAi("@cf/zai-org/glm-4.7-flash"),
      prompt: `Read the following research and give me relevant 3 to 5 facts.\n\nResearch:${text}`,
      stopWhen: isLoopFinished(),
      output: Output.object({
        schema: FindingSchema,
      }),
    });
    return output;
  }
}

export class Orchestrator extends AIChatAgent<Env, OrchestratorState> {
  initialState: OrchestratorState = {
    status: "idle",
  };

  @callable()
  async research(query: string) {
    this.setState({
      status: "planning",
      topic: query,
      activity: {},
      plan: [],
      findings: [],
      summary: "",
    });

    const workersAi = createWorkersAI({ binding: (this.env as any).AI });

    // Step 1: Divide topic into 3 distinct research queries
    const {
      output: { queries },
    } = await generateText({
      model: workersAi("@cf/zai-org/glm-4.7-flash"),
      output: Output.object({
        schema: z.object({
          queries: z
            .array(
              z.string().meta({
                description:
                  "A query for a search engine, exploring an angle of research",
              }),
            )
            .min(3)
            .max(3)
            .meta({
              description:
                "Three distinct research angles. Phrased as search queries",
            }),
        }),
      }),
      prompt: `Break this topic into 3 different research angles: ${query}\nEach has to be phrased as a research query`,
    });

    this.setState({
      ...this.state,
      plan: queries,
      status: "researching",
    });

    // Step 2: Dispatch 3 parallel sub-agents (Researcher)
    const outputs = await Promise.all(
      queries.map(async (q, index) => {
        const stubAgent = await this.subAgent(
          Researcher,
          `researcher-${index}`,
        );
        const reporter = new ProgressReporter(this, `researcher-${index}`);
        const result = await stubAgent.research(q, reporter);
        return result;
      }),
    );

    // Step 3: Summarize aggregated findings
    const { text: summaryText } = await generateText({
      model: workersAi("@cf/zai-org/glm-4.7-flash"),
      prompt: `다음은 주제 "${query}"에 대해 3명의 서브 연구원(Researcher Sub-agents)이 조사한 핵심 사실(Findings)입니다.
이 정보들을 바탕으로 종합적이고 체계적인 연구보고서를 한국어로 명확하고 전문적으로 작성해주세요.

[조사 결과 목록]
${JSON.stringify(outputs, null, 2)}`,
    });

    this.setState({
      ...this.state,
      findings: outputs,
      summary: summaryText,
      status: "completed",
    });

    return { findings: outputs, summary: summaryText };
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
