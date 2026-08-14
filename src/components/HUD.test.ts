import { describe, expect, it } from 'vitest';
import { foundLabel, timerBarPercent } from '@/components/HUD';

describe('timerBarPercent — width = timeLeft/totalTime, clamped, never NaN', () => {
  it('full time → 100%', () => {
    expect(timerBarPercent(60, 60)).toBe(100);
  });

  it('half time → 50%', () => {
    expect(timerBarPercent(30, 60)).toBe(50);
  });

  it('clamps above 100 (overshoot)', () => {
    expect(timerBarPercent(75, 60)).toBe(100);
  });

  it('timeLeft 0 → 0%', () => {
    expect(timerBarPercent(0, 60)).toBe(0);
  });

  it('totalTime 0 → 0% (never NaN)', () => {
    expect(timerBarPercent(30, 0)).toBe(0);
    expect(Number.isNaN(timerBarPercent(30, 0))).toBe(false);
  });

  it('negative timeLeft → 0% (never NaN)', () => {
    expect(timerBarPercent(-5, 60)).toBe(0);
  });
});

describe('foundLabel — show_count governs the HUD ONLY', () => {
  it('showCount=true shows the numbered N/M label', () => {
    expect(foundLabel(2, 5, true)).toBe('2/5 已找到');
  });

  it('showCount=false shows the unnumbered hint — NO number leaks', () => {
    const label = foundLabel(2, 5, false);
    expect(label).toBe('还有差异未找到');
    expect(label).not.toContain('2');
    expect(label).not.toContain('5');
    expect(label).not.toContain('/');
  });

  it('showCount=false still shows the hint at 0 found (never a number)', () => {
    expect(foundLabel(0, 5, false)).toBe('还有差异未找到');
  });
});
