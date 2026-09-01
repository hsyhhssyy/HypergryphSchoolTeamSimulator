import { describe, expect, it } from 'vitest';
import { h } from 'preact';
import render from 'preact-render-to-string';
import { computeAccuracy } from '@/components/Result';
import { Result } from '@/components/Result';
import { createInitialState } from '@/hooks/useGameState';
import type { Question } from '@shared/types';

describe('computeAccuracy — found / (found + wrong), 0-case → 0, never NaN', () => {
  it('perfect game: 5 found, 0 wrong → 100%', () => {
    expect(computeAccuracy(5, 0)).toBe(100);
  });

  it('mixed game: 7 found, 3 wrong → 70%', () => {
    expect(computeAccuracy(7, 3)).toBe(70);
  });

  it('rounds to the nearest percent: 2 found, 1 wrong → 67%', () => {
    expect(computeAccuracy(2, 1)).toBe(67);
  });

  it('0 found, 0 wrong (no taps at all) → 0, NOT NaN', () => {
    const accuracy = computeAccuracy(0, 0);
    expect(accuracy).toBe(0);
    expect(Number.isNaN(accuracy)).toBe(false);
  });

  it('0 found, 5 wrong → 0%', () => {
    expect(computeAccuracy(0, 5)).toBe(0);
  });

  it('never returns a value outside [0, 100]', () => {
    for (let found = 0; found <= 20; found += 1) {
      for (let wrong = 0; wrong <= 20; wrong += 1) {
        const accuracy = computeAccuracy(found, wrong);
        expect(accuracy).toBeGreaterThanOrEqual(0);
        expect(accuracy).toBeLessThanOrEqual(100);
        expect(Number.isNaN(accuracy)).toBe(false);
      }
    }
  });
});

describe('Result question summary', () => {
  const makeQuestion = (id: string, title: string, differenceCount: number): Question => ({
    id,
    mode: 'spot_diff',
    title,
    description: title,
    imageA: `${id}-a.png`,
    imageB: `${id}-b.png`,
    differences: Array.from({ length: differenceCount }, (_, index) => ({
      type: 'circle' as const,
      x: index,
      y: index,
      radius: 1,
    })),
    showCount: true,
    source: 'official',
    status: 'approved',
    likes: 0,
    dislikes: 0,
    createdAt: '2026-01-01',
  });

  it('shows every attempted question with its found count, not the last-question difference list', () => {
    const first = makeQuestion('q1', '校园午后', 2);
    const second = makeQuestion('q2', '社团活动室', 3);
    const state = {
      ...createInitialState(),
      phase: 'result' as const,
      questions: [first, second],
      questionIndex: 1,
      currentQuestion: second,
      foundIndices: [0],
      totalFound: 3,
      score: 3,
    };

    const html = render(h(Result, { state, dispatch: () => undefined }));

    expect(html).toContain('已回答题目');
    expect(html).toContain('校园午后');
    expect(html).toContain('2 处');
    expect(html).toContain('社团活动室');
    expect(html).toContain('1 处');
    expect(html).not.toContain('差异清单');
    expect(html).not.toContain('圆形区域');
  });

  it('shows the answer area only when the current question was not completed', () => {
    const question = makeQuestion('q1', '未完成题目', 2);
    const failedHtml = render(h(Result, {
      state: {
        ...createInitialState(),
        phase: 'result',
        questions: [question],
        currentQuestion: question,
        foundIndices: [0],
      },
      dispatch: () => undefined,
    }));
    const completedHtml = render(h(Result, {
      state: {
        ...createInitialState(),
        phase: 'result',
        questions: [question],
        currentQuestion: question,
        foundIndices: [0, 1],
      },
      dispatch: () => undefined,
    }));

    expect(failedHtml).toContain('答案区域');
    expect(failedHtml).toContain('已找到');
    expect(failedHtml).toContain('未找到');
    expect(completedHtml).not.toContain('答案区域');
  });
});
