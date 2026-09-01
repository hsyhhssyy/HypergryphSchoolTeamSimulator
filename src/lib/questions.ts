import type { Question, QuestionMode } from '@shared/types';

const QUESTION_BANK_URL = `${import.meta.env.BASE_URL}questions/questions.json`;

function shuffle<T>(items: readonly T[]): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [result[index], result[target]] = [result[target]!, result[index]!];
  }
  return result;
}

export interface RandomGameQuestions {
  mode: QuestionMode;
  questions: Question[];
}

export async function loadRandomGameQuestions(count = Number.POSITIVE_INFINITY): Promise<RandomGameQuestions> {
  const response = await fetch(QUESTION_BANK_URL);
  if (!response.ok) throw new Error(`题库加载失败（HTTP ${response.status}）`);
  const bank = (await response.json()) as Question[];
  const questions = shuffle(bank).slice(0, count);
  return { mode: questions[0]?.mode ?? 'spot_diff', questions };
}

export function resolveQuestionAsset(value: string): string {
  if (/^(?:https?:|data:|blob:)/.test(value)) return value;
  return `${import.meta.env.BASE_URL}${value.replace(/^\//, '')}`;
}
