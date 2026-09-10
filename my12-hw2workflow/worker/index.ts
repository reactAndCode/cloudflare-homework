import { Agent, callable, routeAgentRequest } from "agents";
import {
  AgentWorkflow,
  type AgentWorkflowEvent,
  type AgentWorkflowStep,
} from "agents/workflows";
import type {
  GradeResult,
  LeaderboardEntry,
  QuestionItem,
  QuizState,
  PlayerInfo,
  AnswerRecord,
} from "./types";

type Params = {
  hostRole?: string;
};

type FinalApprovalMetaData = {
  approvedBy: string;
  notes?: string;
};

const QUIZ_TOPICS = [
  "우주와 자연과학",
  "세계 역사와 문화",
  "음식과 유명 요리",
  "IT 및 최신 기술",
  "상식 및 재밌는 퀴즈",
];

// LLM 헬퍼 함수: 문제 생성
async function generateQuizQuestion(
  env: Env,
  round: number
): Promise<QuestionItem> {
  const topic = QUIZ_TOPICS[(round - 1) % QUIZ_TOPICS.length];
  const prompt = `You are a quiz master creating a fun, interactive Korean trivia question.
Create 1 engaging trivia question for Round ${round} on the topic "${topic}".
Provide a clear question, a short hint, and a reference answer in Korean.

Respond strictly in valid raw JSON format as follows without any markdown formatting or code blocks:
{
  "question": "질문 내용",
  "hint": "힌트 내용",
  "referenceAnswer": "기준 정답"
}`;

  try {
    if (env.AI) {
      const response: any = await env.AI.run(
        "@cf/meta/llama-3.1-8b-instruct",
        {
          messages: [
            {
              role: "system",
              content: "You output only valid raw JSON without markdown syntax.",
            },
            { role: "user", content: prompt },
          ],
        }
      );
      const text =
        typeof response === "string" ? response : response?.response || "";
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          round,
          topic,
          question: parsed.question || `라운드 ${round} 퀴즈`,
          hint: parsed.hint || "힌트를 참고하여 답변하세요",
          referenceAnswer: parsed.referenceAnswer || "정답",
        };
      }
    }
  } catch (e) {
    console.error("LLM Question generation failed, fallback used:", e);
  }

  // Fallback questions if LLM is unavailable in local offline mode
  const fallbacks: Record<number, QuestionItem> = {
    1: {
      round: 1,
      topic: "우주와 자연과학",
      question: "태양계에서 가장 크기가 큰 행성은 무엇일까요?",
      hint: "목...으로 시작하는 행성입니다.",
      referenceAnswer: "목성",
    },
    2: {
      round: 2,
      topic: "세계 역사와 문화",
      question: "프랑스의 수도이자 에펠탑이 있는 도시는 어디일까요?",
      hint: "파...로 시작합니다.",
      referenceAnswer: "파리",
    },
    3: {
      round: 3,
      topic: "음식과 유명 요리",
      question: "도우 위에 토마토 소스와 치즈를 얹어 오븐에 구워내는 이탈리아 대표 음식은?",
      hint: "🍕 형태의 음식입니다.",
      referenceAnswer: "피자",
    },
    4: {
      round: 4,
      topic: "IT 및 최신 기술",
      question: "웹 브라우저에서 동적인 기능을 구현할 때 주로 사용되는 프로그래밍 언어는?",
      hint: "자바...로 시작하는 언어입니다.",
      referenceAnswer: "자바스크립트",
    },
    5: {
      round: 5,
      topic: "상식 및 재밌는 퀴즈",
      question: "1443년 훈민정음(한글)을 창제하신 조선의 제4대 국왕은 누구일까요?",
      hint: "세...대왕",
      referenceAnswer: "세종대왕",
    },
  };

  return (
    fallbacks[round] || {
      round,
      topic,
      question: `라운드 ${round} 퀴즈 질문입니다.`,
      hint: "정답을 자유롭게 작성해 주세요.",
      referenceAnswer: "정답",
    }
  );
}

// LLM 헬퍼 함수: 자유 서술형 답변 채점
async function gradeUserAnswer(
  env: Env,
  questionItem: QuestionItem,
  userAnswer: string
): Promise<GradeResult> {
  if (!userAnswer || userAnswer.trim() === "") {
    return {
      score: 0,
      feedback: "답변이 제출되지 않았습니다.",
      isCorrect: false,
    };
  }

  const prompt = `You are a fair and lenient Korean Quiz Evaluator.
Compare the user's answer with the reference answer.
Give full or high partial credit for minor typos, spelling mistakes, synonyms, or close Korean phonetic matches.

Question: "${questionItem.question}"
Reference Answer: "${questionItem.referenceAnswer}"
User's Answer: "${userAnswer}"

Grade the user's answer on a scale from 0 to 100:
- 100: Exact match or clear synonym/meaning match.
- 70 ~ 90: Minor typo, spelling mistake, or slightly incomplete but substantially correct.
- 30 ~ 60: Partial concept mentioned but incomplete.
- 0: Completely wrong or irrelevant.

Output strictly in valid raw JSON format without markdown code blocks:
{
  "score": number,
  "feedback": "한 줄 피드백 (한국어)",
  "isCorrect": boolean
}`;

  try {
    if (env.AI) {
      const response: any = await env.AI.run(
        "@cf/meta/llama-3.1-8b-instruct",
        {
          messages: [
            { role: "system", content: "You output only valid raw JSON." },
            { role: "user", content: prompt },
          ],
        }
      );
      const text =
        typeof response === "string" ? response : response?.response || "";
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        const score = typeof parsed.score === "number" ? parsed.score : 0;
        return {
          score,
          feedback:
            parsed.feedback ||
            (score >= 70 ? "정답입니다!" : "아쉽게도 오답입니다."),
          isCorrect:
            typeof parsed.isCorrect === "boolean"
              ? parsed.isCorrect
              : score >= 70,
        };
      }
    }
  } catch (e) {
    console.error("LLM Grading failed, fallback basic comparison used:", e);
  }

  // Basic fallback comparison
  const cleanRef = questionItem.referenceAnswer
    .replace(/\s+/g, "")
    .toLowerCase();
  const cleanUser = userAnswer.replace(/\s+/g, "").toLowerCase();

  if (
    cleanUser === cleanRef ||
    cleanUser.includes(cleanRef) ||
    cleanRef.includes(cleanUser)
  ) {
    return {
      score: 100,
      feedback: "정답입니다!",
      isCorrect: true,
    };
  }

  return {
    score: 0,
    feedback: "아쉽게도 오답입니다.",
    isCorrect: false,
  };
}

export class QuizWorkflow extends AgentWorkflow<QuizAgent, Params> {
  async run(_event: AgentWorkflowEvent<Params>, step: AgentWorkflowStep) {
    // 퀴즈 시작 상태 초기화
    await step.updateAgentState({
      status: "in_progress",
      currentRound: 1,
      roundStage: "question",
      isAnsweringOpen: false,
      answeringEndsAt: null,
      finalApproved: false,
    });

    const TOTAL_ROUNDS = 5;

    for (let round = 1; round <= TOTAL_ROUNDS; round++) {
      // 1. 문제 생성 단계 (question-1 ~ question-5)
      const questionItem = await step.do(
        `question-${round}`,
        {
          retries: {
            limit: 3,
            delay: "3 seconds",
            backoff: "constant",
          },
        },
        async () => {
          return await generateQuizQuestion(this.env, round);
        }
      );

      // 답변 창 설정: 60초 후 종료 마감 시각
      const answeringEndsAt = Date.now() + 60 * 1000;
      const currentQuestions = (await this.agent.getQuestions()) || {};

      await step.updateAgentState({
        currentRound: round,
        roundStage: "answering",
        currentQuestion: questionItem,
        questions: {
          ...currentQuestions,
          [round]: questionItem,
        },
        isAnsweringOpen: true,
        answeringEndsAt,
      });

      // 2. 답변 창 수집 대기 (60초 타임아웃 또는 sendEvent 조기 닫기)
      try {
        await step.waitForEvent(`wait-answer-${round}`, {
          type: `close-answering-${round}`,
          timeout: "60 seconds",
        });
      } catch {
        // 60초 타임아웃 만료 시 자연스럽게 진행
      }

      // 답변 창 닫기
      await step.updateAgentState({
        isAnsweringOpen: false,
        answeringEndsAt: null,
        roundStage: "grading",
      });

      // 3. 채점 단계 (grade-1 ~ grade-5)
      const currentAnswers = (await this.agent.getAnswers())[round] || {};
      const currentPlayers = await this.agent.getPlayers();

      const roundGrades = await step.do(`grade-${round}`, async () => {
        const grades: Record<string, GradeResult> = {};
        for (const playerId of Object.keys(currentPlayers)) {
          const ansRecord = currentAnswers[playerId];
          const userText = ansRecord ? ansRecord.answerText : "";
          const result = await gradeUserAnswer(
            this.env,
            questionItem,
            userText
          );
          grades[playerId] = result;
        }
        return grades;
      });

      // 라운드 채점 결과 적용 및 순위표 갱신
      await this.agent.applyRoundGradesAndCalculateLeaderboard(
        round,
        roundGrades
      );

      await step.updateAgentState({
        roundStage: "leaderboard",
      });

      // 라운드 간 지연 (3초)
      if (round < TOTAL_ROUNDS) {
        await step.sleep(`break-${round}`, "3 seconds");
      }
    }

    // 4. 5라운드 완료 후 진행자 최종 승인 대기 (waitForApproval)
    await step.updateAgentState({
      status: "awaiting_approval",
      roundStage: "awaiting_approval",
    });

    try {
      await this.waitForApproval<FinalApprovalMetaData>(step, {
        timeout: "24 hours",
      });

      await step.updateAgentState({
        status: "completed",
        roundStage: "finished",
        finalApproved: true,
      });
    } catch {
      await step.updateAgentState({
        status: "completed",
        roundStage: "finished",
        finalApproved: false,
      });
    }

    step.reportComplete({ status: "Quiz workflow completed successfully" });
  }
}

export class QuizAgent extends Agent<Env, QuizState> {
  initialState: QuizState = {
    status: "idle",
    currentRound: 0,
    roundStage: "idle",
    currentQuestion: null,
    questions: {},
    players: {},
    answers: {},
    grades: {},
    leaderboard: [],
    isAnsweringOpen: false,
    answeringEndsAt: null,
    finalApproved: false,
    workflowId: null,
  };

  async onWorkflowComplete(
    workflowName: string,
    workflowId: string,
    result?: unknown
  ) {
    console.log(
      `[QuizAgent] Workflow ${workflowName} (${workflowId}) completed:`,
      result
    );
  }

  @callable()
  async getState() {
    return this.state;
  }

  @callable()
  async getQuestions() {
    return this.state.questions || {};
  }

  @callable()
  async getAnswers() {
    return this.state.answers || {};
  }

  @callable()
  async getPlayers() {
    return this.state.players || {};
  }

  @callable()
  async joinGame(playerName: string) {
    const name =
      playerName.trim() || `참가자_${Math.floor(Math.random() * 1000)}`;
    const playerId = `player_${Date.now()}_${Math.random()
      .toString(36)
      .substring(2, 6)}`;

    const newPlayers: Record<string, PlayerInfo> = {
      ...this.state.players,
      [playerId]: {
        id: playerId,
        name,
        score: 0,
      },
    };

    const updatedLeaderboard: LeaderboardEntry[] = Object.values(newPlayers)
      .sort((a, b) => b.score - a.score)
      .map((p, index) => ({
        playerId: p.id,
        name: p.name,
        score: p.score,
        rank: index + 1,
      }));

    this.setState({
      ...this.state,
      players: newPlayers,
      leaderboard: updatedLeaderboard,
    });

    return { playerId, name, state: this.state };
  }

  @callable()
  async startQuiz() {
    const workflowId = await this.runWorkflow("QUIZ_WORKFLOW", {});
    this.setState({
      ...this.state,
      workflowId,
      status: "in_progress",
      currentRound: 1,
      roundStage: "question",
    });
    return { workflowId };
  }

  @callable()
  async submitAnswer(round: number, playerId: string, answerText: string) {
    if (!this.state.isAnsweringOpen || this.state.currentRound !== round) {
      return {
        success: false,
        reason: "현재 라운드의 답변 제출 시간이 아닙니다.",
      };
    }

    const player = this.state.players[playerId];
    if (!player) {
      return { success: false, reason: "존재하지 않는 참가자입니다." };
    }

    const roundAnswers: Record<string, AnswerRecord> =
      this.state.answers[round] || {};
    const newRoundAnswers: Record<string, AnswerRecord> = {
      ...roundAnswers,
      [playerId]: {
        playerId,
        playerName: player.name,
        answerText: answerText.trim(),
        submittedAt: Date.now(),
      },
    };

    this.setState({
      ...this.state,
      answers: {
        ...this.state.answers,
        [round]: newRoundAnswers,
      },
    });

    return { success: true };
  }

  @callable()
  async closeAnsweringEarly(round: number) {
    if (this.state.workflowId) {
      try {
        await (this as any).sendWorkflowEvent(
          this.state.workflowId,
          `close-answering-${round}`,
          { timestamp: Date.now() }
        );
      } catch (e) {
        console.error("sendWorkflowEvent error:", e);
      }

      this.setState({
        ...this.state,
        isAnsweringOpen: false,
        answeringEndsAt: null,
        roundStage: "grading",
      });

      return { success: true, state: this.state };
    }
    return { success: false };
  }

  @callable()
  async approveFinalResults() {
    if (
      this.state.status === "awaiting_approval" ||
      this.state.roundStage === "awaiting_approval" ||
      this.state.currentRound >= 5
    ) {
      if (this.state.workflowId) {
        try {
          await this.approveWorkflow(this.state.workflowId, {
            reason: "Final results approved by host",
            metadata: {
              approvedBy: "Host",
              approvedAt: Date.now(),
            },
          });
        } catch (e) {
          console.error("approveWorkflow note:", e);
        }
      }

      this.setState({
        ...this.state,
        status: "completed",
        roundStage: "finished",
        finalApproved: true,
      });

      return { success: true, state: this.state };
    }
    return { success: false, reason: "승인 대기 상태가 아닙니다." };
  }

  @callable()
  async resetQuiz() {
    const resetPlayers: Record<string, PlayerInfo> = {};
    for (const [id, p] of Object.entries(this.state.players || {})) {
      resetPlayers[id] = { ...p, score: 0 };
    }

    const resetLeaderboard: LeaderboardEntry[] = Object.values(
      resetPlayers
    ).map((p, idx) => ({
      playerId: p.id,
      name: p.name,
      score: 0,
      rank: idx + 1,
    }));

    this.setState({
      status: "idle",
      currentRound: 0,
      roundStage: "idle",
      currentQuestion: null,
      questions: {},
      players: resetPlayers,
      answers: {},
      grades: {},
      leaderboard: resetLeaderboard,
      isAnsweringOpen: false,
      answeringEndsAt: null,
      finalApproved: false,
      workflowId: null,
    });

    return { success: true, state: this.state };
  }

  async applyRoundGradesAndCalculateLeaderboard(
    round: number,
    roundGrades: Record<string, GradeResult>
  ) {
    const updatedPlayers: Record<string, PlayerInfo> = { ...this.state.players };

    for (const [playerId, grade] of Object.entries(roundGrades)) {
      if (updatedPlayers[playerId]) {
        updatedPlayers[playerId] = {
          ...updatedPlayers[playerId],
          score: updatedPlayers[playerId].score + grade.score,
        };
      }
    }

    const leaderboard: LeaderboardEntry[] = Object.values(updatedPlayers)
      .sort((a, b) => b.score - a.score)
      .map((p, idx) => ({
        playerId: p.id,
        name: p.name,
        score: p.score,
        rank: idx + 1,
      }));

    this.setState({
      ...this.state,
      players: updatedPlayers,
      grades: {
        ...this.state.grades,
        [round]: roundGrades,
      },
      leaderboard,
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
