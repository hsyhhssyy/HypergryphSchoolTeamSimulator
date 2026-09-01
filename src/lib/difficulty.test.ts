import { describe, expect, it } from 'vitest';
import { timerSpeedForCompletedQuestions } from './difficulty';

describe('timerSpeedForCompletedQuestions', () => {
  it.each([
    [0, 1], [4, 1], [5, 1.5], [9, 1.5], [10, 2], [100, 2],
  ])('maps %i completed questions to %sx speed', (completed, speed) => {
    expect(timerSpeedForCompletedQuestions(completed)).toBe(speed);
  });
});
