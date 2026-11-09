export type QuestionAnswer = {
  directory?: string;
  sessionId?: string;
  callId: string;
  skipped?: boolean;
  values?: Record<string, unknown>;
  answer?: string;
};

export interface QuestionPort {
  answer(input: QuestionAnswer): Promise<{ answer: string; skipped: boolean }>;
}

const questionPortKey = Symbol.for("toonflow.questionPort");
const questionHost = globalThis as typeof globalThis & { [questionPortKey]?: QuestionPort };

export function configureQuestionPort(port: QuestionPort) {
  questionHost[questionPortKey] = port;
}

export function questionPort() {
  const port = questionHost[questionPortKey];
  if (!port) throw new Error("尚未配置提问交互能力");
  return port;
}
