import { describe, expect, it } from 'vitest';
import type { Difference } from '@shared/types';
import type { ContainTransform } from '@/utils/hitDetection';
import {
  differenceMarkerStyle,
  exceedsTapMoveThreshold,
  TAP_MOVE_THRESHOLD_PX,
} from '@/components/ImagePanel';

/**
 * Marker-position math tests (todo 12 acceptance): an 800×600 image displayed
 * at 375px width → scale = min(375/800, 600/600) = 0.46875, offsetY = 159.375
 * (width-constrained, vertical letterbox) — same fixture as todo 7.
 */
const transform: ContainTransform = { scale: 0.46875, offsetX: 0, offsetY: 159.375 };

describe('differenceMarkerStyle', () => {
  it('circle: position = toDisplayCoords(x−radius, y−radius), size = 2·radius·scale, 50%', () => {
    const circle: Difference = { type: 'circle', x: 100, y: 100, radius: 20 };
    const style = differenceMarkerStyle(circle, transform);
    expect(style).not.toBeNull();
    expect(style?.left).toBeCloseTo((100 - 20) * 0.46875, 9);
    expect(style?.top).toBeCloseTo((100 - 20) * 0.46875 + 159.375, 9);
    expect(style?.width).toBeCloseTo(2 * 20 * 0.46875, 9);
    expect(style?.height).toBeCloseTo(2 * 20 * 0.46875, 9);
    expect(style?.borderRadius).toBe('50%');
  });

  it('rect: position = toDisplayCoords(x, y), size = width·scale × height·scale, 8px', () => {
    const rect: Difference = { type: 'rect', x: 300, y: 150, width: 40, height: 30 };
    const style = differenceMarkerStyle(rect, transform);
    expect(style).not.toBeNull();
    expect(style?.left).toBeCloseTo(300 * 0.46875, 9);
    expect(style?.top).toBeCloseTo(150 * 0.46875 + 159.375, 9);
    expect(style?.width).toBeCloseTo(40 * 0.46875, 9);
    expect(style?.height).toBeCloseTo(30 * 0.46875, 9);
    expect(style?.borderRadius).toBe('8px');
  });

  it('marker left/top matches toDisplayCoords of its top-left corner (within 1px)', () => {
    const circle: Difference = { type: 'circle', x: 100, y: 100, radius: 25 };
    const style = differenceMarkerStyle(circle, transform);
    const display = { x: (100 - 25) * 0.46875, y: (100 - 25) * 0.46875 + 159.375 };
    expect(Math.abs((style?.left ?? 0) - display.x)).toBeLessThanOrEqual(1);
    expect(Math.abs((style?.top ?? 0) - display.y)).toBeLessThanOrEqual(1);
  });

  it('letterbox offset shifts the marker down but width-constrained x stays exact', () => {
    const rect: Difference = { type: 'rect', x: 0, y: 0, width: 100, height: 100 };
    const style = differenceMarkerStyle(rect, transform);
    expect(style?.left).toBe(0);
    expect(style?.top).toBeCloseTo(159.375, 9);
  });

  it('malformed runtime data returns null (never throws)', () => {
    const bogus = { type: 'triangle' } as unknown as Difference;
    expect(differenceMarkerStyle(bogus, transform)).toBeNull();
  });
});

describe('touch gesture classification', () => {
  it('keeps small finger jitter as a tap', () => {
    expect(exceedsTapMoveThreshold(100, 100, 105, 104)).toBe(false);
  });

  it('cancels judging once movement reaches the display-pixel threshold', () => {
    // 6² + 8² = 10²: the exact boundary is already a swipe/gesture.
    expect(exceedsTapMoveThreshold(100, 100, 106, 108)).toBe(true);
    expect(TAP_MOVE_THRESHOLD_PX).toBe(10);
  });

  it('classifies a vertical swipe as movement even if it later returns', () => {
    expect(exceedsTapMoveThreshold(100, 300, 100, 250)).toBe(true);
  });
});
