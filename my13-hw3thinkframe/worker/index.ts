import { Session, Think } from "@cloudflare/think";
import { createExtensionTools } from "@cloudflare/think/tools/extensions";
import { callable, routeAgentRequest } from "agents";
import { R2SkillProvider } from "agents/experimental/memory/session";
import { type LanguageModel } from "ai";
import { createWorkersAI } from "workers-ai-provider";

type FileEntry = {
  path: string;
  type: "file" | "directory";
  size: number;
  updatedAt: number;
};

type State = {
  files: FileEntry[];
};

export class CoachAgent extends Think<Env, State> {
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
            const today = new Date().toISOString().slice(0, 10);
            return `당신은 사용자의 건강과 목표 달성을 전담하는 전문적이고 꼼꼼한 AI 개인 피트니스 코치(CoachAgent)입니다.
오늘 날짜는 ${today} 입니다.

[핵심 행동 수칙]
1. 언어: 모든 답변은 반드시 전문적이고 격려 넘치는 한국어(Korean)로 유창하게 작성하세요.
2. 워크스페이스 운동 기록 (Workspace File Tools):
   - 사용자가 운동을 보고하면(예: "오늘 스쿼트 했어. 80kg으로 5회씩 5세트 했어"), 내장된 워크스페이스 파일 작성 도구(write 또는 writeFile)를 사용하여 반드시 \`logs/${today}.md\` 파일에 운동 날짜, 종목, 중량, 횟수, 세트 수를 기록하세요. 기존 파일이 있으면 덮어쓰거나 내용을 보강하세요.
   - 동시에 앞으로의 훈련 계획을 담은 \`plan.md\` 파일을 최신 상태로 유지/업데이트하세요.
   - "이번 주에 무엇을 했지?" 등 과거 운동 내역을 물어보면 워크스페이스 파일 읽기 도구(list, read, find)를 사용하여 \`logs/\` 디렉터리의 기록을 읽은 후 요약하여 답변하세요.
3. 신체 정보 및 목표 기억 (Memory Context):
   - 사용자가 체중, 부상(예: 무릎 부상), 운동 목표(예: 5km 달리기) 등을 알려주면, 이 정보를 절대 잊지 마세요.
   - 다음 날 운동 계획이나 조언을 줄 때 사용자의 부상(무릎에 무리가 가지 않는 운동 고려)과 목표(5km 완주)를 철저히 반영하여 계획을 수립하세요.
4. R2 전문 스킬 가이드 활용 (Skills Context):
   - 스쿼트 등 운동 자세나 가이드를 질문받으면 \`load_context\` 도구를 호출하여 R2에 저장된 해당 스킬(예: "squat_guide")을 불러와 숙지한 뒤 전문적으로 답변하세요.
   - 답변을 완료한 후에는 불필요한 컨텍스트 낭비를 줄이기 위해 반드시 \`unload_context\` 도구를 호출하여 스킬을 언로드하세요.
5. 런타임 확장 도구 등록 (Extension Tools):
   - 1회 최대 중량(1RM) 계산기 등 코치에게 없는 새로운 계산기가 필요하다고 요청받으면, \`load_extension\` 도구를 호출하여 런타임 자바스크립트 확장 도구를 작성 및 등록하세요.
   - 1RM 계산 공식은 Epley 공식을 사용하세요: 1RM = weight * (1 + reps / 30) (예: 80kg 5회 -> 80 * (1 + 5/30) = 약 93.3kg ≈ 93kg).
   - 계산기 도구가 등록된 후 1RM 계산 요청이 들어오면 해당 확장 도구를 호출하여 정확히 답변하세요.
6. 답변 길이 및 간결성 (Conciseness):
   - 모든 최종 답변은 핵심만 최대한 간단하고 명료하게 요약하여 작성하세요.
   - 불필요한 장황한 서론이나 사족 없이, 절대로 20줄을 초과하지 마세요. (최대 20줄 이내로 간결히 답변)`;
          },
        },
      })
      .withContext("memory", {
        description:
          "User body metrics, physical injuries, workout preferences, and fitness goals.",
        maxTokens: 10_000,
      })
      .withContext("skills", {
        description: "Reference exercise and workout guides on demand.",
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
