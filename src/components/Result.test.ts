import { describe, expect, it } from 'vitest';
import { computeAccuracy, isRatableQuestion } from '@/components/Result';

describe('isRatableQuestion — workshop+approved+user-id gate (todo 21)', () => {
  const workshopApproved = { source: 'workshop', status: 'approved' } as const;

  it('approved workshop question with a user id → true', () => {
    expect(isRatableQuestion(workshopApproved, 'user-1')).toBe(true);
  });

  it('official question → false (never rated)', () => {
    expect(isRatableQuestion({ source: 'official', status: 'approved' }, 'user-1')).toBe(false);
  });

  it('pending workshop question → false', () => {
    expect(isRatableQuestion({ source: 'workshop', status: 'pending' }, 'user-1')).toBe(false);
  });

  it('rejected workshop question → false', () => {
    expect(isRatableQuestion({ source: 'workshop', status: 'rejected' }, 'user-1')).toBe(false);
  });

  it('missing user id → false (no rating without identity)', () => {
    expect(isRatableQuestion(workshopApproved, null)).toBe(false);
  });

  it('no current question → false', () => {
    expect(isRatableQuestion(null, 'user-1')).toBe(false);
  });

  it('null question AND null user id → false', () => {
    expect(isRatableQuestion(null, null)).toBe(false);
  });
});


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
