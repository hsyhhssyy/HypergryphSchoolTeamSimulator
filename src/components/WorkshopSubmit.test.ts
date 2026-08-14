import { describe, expect, it } from 'vitest';
import type { Difference } from '@shared/types';
import {
  MAX_IMAGE_BYTES,
  normalizeRect,
  validateImageFile,
  validateWorkshopForm,
  type WorkshopFormValues,
} from '@/components/WorkshopSubmit';

const VALID: WorkshopFormValues = {
  mode: 'spot_diff',
  title: '测试题',
  description: '找出不同',
  authorName: '小明',
  imageAName: 'a.png',
  imageBName: 'b.png',
  differences: [{ type: 'circle', x: 10, y: 10, radius: 5 }],
};

function file(size: number, mime: string): File {
  return new File([new Uint8Array(size)], 'img.png', { type: mime });
}

describe('normalizeRect', () => {
  it('orders an arbitrary drag from top-left to bottom-right', () => {
    const rect = normalizeRect({ x: 300, y: 200 }, { x: 100, y: 50 });
    expect(rect).toEqual({ x: 100, y: 50, width: 200, height: 150 });
  });

  it('normalizes the reverse drag direction identically', () => {
    const rect = normalizeRect({ x: 100, y: 50 }, { x: 300, y: 200 });
    expect(rect).toEqual({ x: 100, y: 50, width: 200, height: 150 });
  });

  it('floors degenerate width/height at 1 so rect.width > 0 AND height > 0 (server rule)', () => {
    const horizontal = normalizeRect({ x: 10, y: 10 }, { x: 50, y: 10 });
    expect(horizontal.height).toBe(1);
    expect(horizontal.width).toBe(40);
    const vertical = normalizeRect({ x: 10, y: 10 }, { x: 10, y: 50 });
    expect(vertical.width).toBe(1);
    expect(vertical.height).toBe(40);
  });
});

describe('validateImageFile', () => {
  it('accepts raster mimes within the 5MB cap', () => {
    expect(validateImageFile(file(1024, 'image/jpeg'))).toBeNull();
    expect(validateImageFile(file(1024, 'image/png'))).toBeNull();
    expect(validateImageFile(file(1024, 'image/webp'))).toBeNull();
  });

  it('rejects >5MB uploads client-side', () => {
    expect(validateImageFile(file(MAX_IMAGE_BYTES + 1, 'image/png'))).toContain('5MB');
  });

  it('rejects SVG (stored-XSS defense, mirrors server whitelist)', () => {
    expect(validateImageFile(file(100, 'image/svg+xml'))).toContain('JPEG');
  });
});

describe('validateWorkshopForm', () => {
  it('returns no errors for a complete valid form', () => {
    expect(validateWorkshopForm(VALID)).toEqual({});
  });

  it('blocks submission with 0 differences (inline error, no API call)', () => {
    const errors = validateWorkshopForm({ ...VALID, differences: [] });
    expect(errors.differences).toBeDefined();
  });

  it('blocks empty description (题目描述 is REQUIRED)', () => {
    expect(validateWorkshopForm({ ...VALID, description: '   ' }).description).toBeDefined();
  });

  it('blocks author_name outside 2-20 chars (trimmed)', () => {
    expect(validateWorkshopForm({ ...VALID, authorName: 'A' }).authorName).toBeDefined();
    expect(validateWorkshopForm({ ...VALID, authorName: '  ' }).authorName).toBeDefined();
    expect(validateWorkshopForm({ ...VALID, authorName: 'x'.repeat(21) }).authorName).toBeDefined();
    expect(validateWorkshopForm({ ...VALID, authorName: '  张三  ' })).toEqual({});
  });

  it('requires image_a in every mode', () => {
    const errors = validateWorkshopForm({ ...VALID, imageAName: null, mode: 'find_area' });
    expect(errors.imageA).toBeDefined();
    expect(errors.imageB).toBeUndefined();
  });

  it('requires image_b ONLY for spot_diff', () => {
    const errors = validateWorkshopForm({ ...VALID, imageBName: null });
    expect(errors.imageB).toBeDefined();
    const findArea = validateWorkshopForm({
      ...VALID,
      mode: 'find_area',
      imageBName: null,
    });
    expect(findArea.imageB).toBeUndefined();
    expect(findArea.imageA).toBeUndefined();
  });

  it('blocks empty/overlong title', () => {
    expect(validateWorkshopForm({ ...VALID, title: '' }).title).toBeDefined();
    expect(validateWorkshopForm({ ...VALID, title: 'x'.repeat(201) }).title).toBeDefined();
  });

  it('accepts malformed runtime Difference objects unchanged (server re-validates)', () => {
    const bogus = { type: 'circle', x: 10, y: 10, radius: 0 } as unknown as Difference;
    expect(validateWorkshopForm({ ...VALID, differences: [bogus] })).toEqual({});
  });
});
