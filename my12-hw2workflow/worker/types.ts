export type RoundStage =
  | "idle"
  | "question"
  | "answering"
  | "grading"
  | "leaderboard"
  | "awaiting_approval"
  | "finished";

export type QuestionItem = {
  round: number;
  topic: string;
  question: string;
  hint: string;
  referenceAnswer: string;
};

export type PlayerInfo = {
  id: string;
  name: string;
  score: number;
};

export type AnswerRecord = {
  playerId: string;
  playerName: string;
  answerText: string;
  submittedAt: number;
};

export type GradeResult = {
  score: number; // 0 ~ 100
  feedback: string;
  isCorrect: boolean;
};

export type LeaderboardEntry = {
  playerId: string;
  name: string;
  score: number;
  rank: number;
};

export type QuizState = {
  status: "idle" | "in_progress" | "awaiting_approval" | "completed";
  currentRound: number; // 1 ~ 5
  roundStage: RoundStage;
  currentQuestion: QuestionItem | null;
  questions: Record<number, QuestionItem>;
  players: Record<string, PlayerInfo>;
  answers: Record<number, Record<string, AnswerRecord>>;
  grades: Record<number, Record<string, GradeResult>>;
  leaderboard: LeaderboardEntry[];
  isAnsweringOpen: boolean;
  answeringEndsAt: number | null; // epoch timestamp ms
  finalApproved: boolean;
  workflowId: string | null;
};
