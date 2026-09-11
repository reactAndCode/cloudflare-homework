import { Session, Think } from "@cloudflare/think";
import { createExtensionTools } from "@cloudflare/think/tools/extensions";
import { callable, routeAgentRequest } from "agents";
import { R2SkillProvider } from "agents/experimental/memory/session";
import { tool, type LanguageModel } from "ai";
import { createWorkersAI } from "workers-ai-provider";
import z from "zod";

type State = {
  files: {
    path: string;
    type: "file" | "directory";
    size: number;
    updatedAt: number;
  }[];
};

export class ThinkAgent extends Think<Env, State> {
  extensionLoader = this.env.LOADER;

  initialState: State = {
    files: [],
  };

  async onStart() {
    await this.refreshFiles();
    await this.session.refreshSystemPrompt();
  }

  async onChatResponse() {
    await this.refreshFiles();
    await this.session.refreshSystemPrompt();
  }

  async refreshFiles() {
    const all = await this.workspace.glob("**/*");
    this.setState({
      files: all.map((file) => ({
        type: file.type === "directory" ? "directory" : "file",
        path: file.path,
        size: file.size,
        updatedAt: file.updatedAt,
      })),
    });
  }

  getModel(): LanguageModel {
    const workersAI = createWorkersAI({ binding: this.env.AI });
    return workersAI("@cf/zai-org/glm-4.7-flash");
  }

  getTools() {
    return {
      getWeather: tool({
        description: "Get weather",
        inputSchema: z.object({
          city: z.string().meta({ description: "Name fo the city." }),
        }),
        execute: ({ city }) => `${city}의 날씨는 맑고 화창합니다.`,
      }),
      ...(this.extensionManager
        ? createExtensionTools({ manager: this.extensionManager })
        : {}),
    };
  }

  @callable()
  async readWorkspaceFile(path: string) {
    return await this.workspace.readFile(path);
  }

  configureSession(session: Session) {
    return session
      .withContext("soul", {
        provider: {
          async get() {
            return `당신은 매우 유용하고 지적이면서도, 살짝 유쾌하고 위트 있는 풍자 감각을 지닌 AI 어시스턴트입니다.
[필수 규칙]
1. 모든 답변은 반드시 자연스럽고 유창한 한국어(Korean)로 작성하세요.
2. 사용자가 영어 등 다른 언어로 질문하더라도, 번역을 명시적으로 요구받지 않는 한 한국어로 친절하게 답변하세요.`;
          },
        },
      })
      .withContext("memory", {
        description: "Things to remember about the user across convos.",
        maxTokens: 10_000,
      })
      .withContext("skills", {
        description: "Reference documents on demand.",
        provider: new R2SkillProvider(this.env.SKILLS, { prefix: "skills/" }),
      });
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
