import { describe, expect, it } from 'vitest';
import type { Difference } from '@shared/types';
import {
  computeContainTransform,
  findHitDifference,
  isPointInCircle,
  isPointInRect,
  toDisplayCoords,
  toNativeCoords,
} from './hitDetection';

describe('isPointInCircle', () => {
  it('returns true for a point inside the radius', () => {
    expect(isPointInCircle(5, 5, 0, 0, 10)).toBe(true);
  });

  it('returns false for a point outside the radius', () => {
    expect(isPointInCircle(15, 15, 0, 0, 10)).toBe(false);
  });

  it('returns true on the exact boundary (inclusive, squared distance)', () => {
    expect(isPointInCircle(10, 0, 0, 0, 10)).toBe(true);
    expect(isPointInCircle(0, 10, 0, 0, 10)).toBe(true);
  });
});

describe('isPointInRect', () => {
  it('returns true for a point inside the rect', () => {
    expect(isPointInRect(5, 5, 0, 0, 10, 10)).toBe(true);
  });

  it('returns false for a point outside the rect', () => {
    expect(isPointInRect(15, 15, 0, 0, 10, 10)).toBe(false);
  });

  it('returns true on the exact edge (AABB inclusive)', () => {
    expect(isPointInRect(10, 10, 0, 0, 10, 10)).toBe(true);
    expect(isPointInRect(0, 0, 0, 0, 10, 10)).toBe(true);
  });
});

describe('computeContainTransform', () => {
  it('letterboxes vertically when the image is width-constrained', () => {
    // 800×600 image in a 375×600 element: scale=min(375/800, 600/600)=0.46875,
    // offsetY=(600−600·0.46875)/2=159.375, offsetX=0.
    expect(computeContainTransform(800, 600, 375, 600)).toEqual({
      scale: 0.46875,
      offsetX: 0,
      offsetY: 159.375,
    });
  });

  it('letterboxes horizontally when the image is height-constrained', () => {
    // 600×800 image in a 600×375 element: mirror of the previous case.
    expect(computeContainTransform(600, 800, 600, 375)).toEqual({
      scale: 0.46875,
      offsetX: 159.375,
      offsetY: 0,
    });
  });
});

describe('toNativeCoords / toDisplayCoords', () => {
  it('converts client coords to native coords, subtracting rect.left/top', () => {
    const transform = computeContainTransform(800, 600, 800, 600); // scale 1, no offsets
    expect(toNativeCoords(500, 350, { left: 100, top: 50 }, transform)).toEqual({
      x: 400,
      y: 300,
    });
  });

  it('round-trips: toDisplayCoords(toNativeCoords(p)) ≈ p (rect at origin)', () => {
    const transform = computeContainTransform(800, 600, 375, 600);
    const rect = { left: 0, top: 0 };
    const client = { x: 200, y: 400 };
    const native = toNativeCoords(client.x, client.y, rect, transform);
    const back = toDisplayCoords(native.x, native.y, transform);
    expect(back.x).toBeCloseTo(client.x, 9);
    expect(back.y).toBeCloseTo(client.y, 9);
  });

  it('maps native coords into the letterboxed element (display coords)', () => {
    const transform = computeContainTransform(800, 600, 375, 600);
    // Native origin lands at the top of the vertical letterbox.
    expect(toDisplayCoords(0, 0, transform)).toEqual({ x: 0, y: 159.375 });
    // Native center: 400·0.46875=187.5, 300·0.46875+159.375=300.
    expect(toDisplayCoords(400, 300, transform)).toEqual({ x: 187.5, y: 300 });
  });
});

describe('findHitDifference', () => {
  const differences: Difference[] = [
    { type: 'circle', x: 100, y: 100, radius: 30 },
    { type: 'rect', x: 300, y: 200, width: 40, height: 40 },
  ];

  it('returns the index of the first hit difference', () => {
    expect(findHitDifference({ x: 105, y: 95 }, differences, [])).toBe(0);
  });

  it('dispatches on difference.type and hits rect differences', () => {
    expect(findHitDifference({ x: 320, y: 230 }, differences, [])).toBe(1);
  });

  it('skips foundIndices and returns the first unfound hit', () => {
    expect(findHitDifference({ x: 105, y: 95 }, differences, [0])).toBe(-1);
    // Overlapping differences: index 0 found → next unfound hit is 1.
    const overlapping: Difference[] = [
      { type: 'circle', x: 10, y: 10, radius: 50 },
      { type: 'circle', x: 10, y: 10, radius: 50 },
    ];
    expect(findHitDifference({ x: 10, y: 10 }, overlapping, [0])).toBe(1);
  });

  it('returns -1 when tapping the letterbox (native coords outside the image)', () => {
    // 800×600 image in 375×600 element → vertical letterbox of 159.375px top.
    const transform = computeContainTransform(800, 600, 375, 600);
    const native = toNativeCoords(187.5, 20, { left: 0, top: 0 }, transform);
    expect(native.y).toBeLessThan(0);
    expect(findHitDifference(native, differences, [])).toBe(-1);
  });

  it('returns -1 for NaN coordinates (malformed input, no throw)', () => {
    expect(findHitDifference({ x: Number.NaN, y: 100 }, differences, [])).toBe(-1);
  });

  it('returns -1 for an unknown difference type (malformed runtime data, no throw)', () => {
    // Differences arrive as parsed JSON, so the compile-time type is not a
    // runtime guarantee — simulate a malformed entry.
    const malformed = [
      { type: 'triangle', x: 0, y: 0, radius: 10 },
    ] as unknown as Difference[];
    expect(findHitDifference({ x: 0, y: 0 }, malformed, [])).toBe(-1);
  });
});
