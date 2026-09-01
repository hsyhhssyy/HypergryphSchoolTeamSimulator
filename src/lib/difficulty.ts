export const QUESTIONS_PER_SPEED_LEVEL = 5;
export const SPEED_STEP = 0.5;
export const MAX_TIMER_SPEED = 2;

/** 100% for questions 1–5, 150% for 6–10, then capped at 200%. */
export function timerSpeedForCompletedQuestions(completedQuestions: number): number {
  return Math.min(
    MAX_TIMER_SPEED,
    1 + Math.floor(completedQuestions / QUESTIONS_PER_SPEED_LEVEL) * SPEED_STEP,
  );
}
