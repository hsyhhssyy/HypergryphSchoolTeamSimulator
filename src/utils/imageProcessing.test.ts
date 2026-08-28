import { describe, expect, it } from 'vitest';
import { computeCropRect, outputSizeForCrop } from '@/utils/imageProcessing';

describe('computeCropRect', () => {
  it('center-crops a wide source to the requested aspect', () => {
    expect(computeCropRect(1600, 900, { aspect: 1, zoom: 1, offsetX: 0, offsetY: 0 })).toEqual({
      x: 350,
      y: 0,
      width: 900,
      height: 900,
    });
  });

  it('uses zoom and offsets without moving outside the source', () => {
    const left = computeCropRect(1000, 1000, { aspect: 1, zoom: 2, offsetX: -1, offsetY: -1 });
    const right = computeCropRect(1000, 1000, { aspect: 1, zoom: 2, offsetX: 1, offsetY: 1 });
    expect(left).toEqual({ x: 0, y: 0, width: 500, height: 500 });
    expect(right).toEqual({ x: 500, y: 500, width: 500, height: 500 });
  });

  it('supports aligning a portrait source into a landscape canvas', () => {
    const crop = computeCropRect(800, 1200, { aspect: 4 / 3, zoom: 1, offsetX: 0, offsetY: 0 });
    expect(crop.width / crop.height).toBeCloseTo(4 / 3);
    expect(crop.x).toBe(0);
  });

  it('crops a 200×1920 strip to an exact 200×100 source region at 2:1', () => {
    const crop = computeCropRect(200, 1920, { aspect: 2, zoom: 1, offsetX: 0, offsetY: 0 });
    expect(crop).toEqual({ x: 0, y: 910, width: 200, height: 100 });
  });
});

describe('outputSizeForCrop', () => {
  it('preserves small images and caps large images at the maximum edge', () => {
    expect(outputSizeForCrop({ x: 0, y: 0, width: 800, height: 600 })).toEqual({ width: 800, height: 600 });
    expect(outputSizeForCrop({ x: 0, y: 0, width: 4000, height: 2000 })).toEqual({ width: 1920, height: 960 });
  });
});
