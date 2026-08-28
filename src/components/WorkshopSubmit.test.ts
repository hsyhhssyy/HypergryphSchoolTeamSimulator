import { describe, expect, it } from 'vitest';
import type { Difference } from '@shared/types';
import { computeContainTransform, toNativeCoords } from '@/utils/hitDetection';
import {
  MAX_IMAGE_BYTES,
  MAX_SOURCE_IMAGE_BYTES,
  firstWorkshopErrorField,
  isHeicImageFile,
  normalizeRect,
  tapToNativeCoords,
  validateImageFile,
  validateWorkshopForm,
  workshopCompletion,
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

function file(size: number, mime: string, name = 'img.png'): File {
  return new File([new Uint8Array(size)], name, { type: mime });
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

describe('tapToNativeCoords (task 27b — entrance-animation-skew fix)', () => {
  // 800×600 natural image; final display box 320×240 at (20, 80) — contain
  // scale 0.4, zero letterbox. The `pop` entrance animation scales the card to
  // 0.85 mid-flight: the box read then is 272×204 centered on the same point
  // (44, 98). The visual center is (180, 200) in BOTH frames.
  const NATURAL_W = 800;
  const NATURAL_H = 600;
  const FINAL_RECT = { left: 20, top: 80, width: 320, height: 240 };
  const MID_ANIMATION_RECT = { left: 44, top: 98, width: 272, height: 204 };
  const CENTER_TAP = { clientX: 180, clientY: 200 };

  it('maps a tap on the FINAL box to native coords (400, 300)', () => {
    const native = tapToNativeCoords(CENTER_TAP.clientX, CENTER_TAP.clientY, FINAL_RECT, NATURAL_W, NATURAL_H);
    expect(native).not.toBeNull();
    expect(native!.x).toBeCloseTo(400, 6);
    expect(native!.y).toBeCloseTo(300, 6);
  });

  it('maps a tap DURING the entrance animation (scaled box) to the same native center — uniform scale cancels', () => {
    // The whole card is uniformly scaled mid-pop; recomputing the transform
    // from the SAME (scaled) rect makes the tap math frame-agnostic.
    const native = tapToNativeCoords(CENTER_TAP.clientX, CENTER_TAP.clientY, MID_ANIMATION_RECT, NATURAL_W, NATURAL_H);
    expect(native).not.toBeNull();
    expect(native!.x).toBeCloseTo(400, 6);
    expect(native!.y).toBeCloseTo(300, 6);
  });

  it('reproduces the F3 bug via the OLD stale-transform path (~470, 353) — proving the fresh recompute is required', () => {
    // Old code: syncGeometry() ran mid-animation → stored transform computed
    // from the 0.85-scaled box (scale 0.34); the tap then used the FULL box
    // with that stale transform → native coords overshoot by 1/0.85.
    const stale = computeContainTransform(NATURAL_W, NATURAL_H, MID_ANIMATION_RECT.width, MID_ANIMATION_RECT.height);
    const broken = toNativeCoords(CENTER_TAP.clientX, CENTER_TAP.clientY, FINAL_RECT, stale);
    expect(broken.x).toBeCloseTo(400 / 0.85, 5);
    expect(broken.y).toBeCloseTo(300 / 0.85, 5);
    expect(broken.x).not.toBeCloseTo(400, 1);
  });

  it('returns null for a not-yet-laid-out box (guard parity with syncGeometry)', () => {
    expect(tapToNativeCoords(10, 10, { left: 0, top: 0, width: 0, height: 0 }, NATURAL_W, NATURAL_H)).toBeNull();
    expect(tapToNativeCoords(10, 10, FINAL_RECT, 0, 0)).toBeNull();
  });
});

describe('validateImageFile', () => {
  it('accepts raster mimes within the 5MB cap', () => {
    expect(validateImageFile(file(1024, 'image/jpeg'))).toBeNull();
    expect(validateImageFile(file(1024, 'image/png'))).toBeNull();
    expect(validateImageFile(file(1024, 'image/webp'))).toBeNull();
  });

  it('allows 5MB+ phone originals so the processing pipeline can compress them', () => {
    expect(validateImageFile(file(MAX_IMAGE_BYTES, 'image/jpeg', 'large.jpg'))).toBeNull();
    expect(validateImageFile(file(MAX_IMAGE_BYTES + 1, 'image/png'))).toBeNull();
  });

  it('rejects exceptionally large source files before mobile decoding', () => {
    expect(validateImageFile(file(MAX_SOURCE_IMAGE_BYTES + 1, 'image/jpeg', 'huge.jpg'))).toContain('40MB');
  });

  it('accepts and identifies HEIC/HEIF by MIME or extension', () => {
    expect(validateImageFile(file(1024, 'image/heic', 'phone.heic'))).toBeNull();
    expect(validateImageFile(file(1024, '', 'phone.HEIF'))).toBeNull();
    expect(isHeicImageFile(file(1024, 'image/heif', 'phone.bin'))).toBe(true);
    expect(isHeicImageFile(file(1024, '', 'phone.HEIC'))).toBe(true);
  });

  it('rejects SVG (stored-XSS defense, mirrors server whitelist)', () => {
    expect(validateImageFile(file(100, 'image/svg+xml'))).toContain('JPEG');
  });
});

describe('workshop validation UX helpers', () => {
  it('finds the first error in visual page order, not object insertion order', () => {
    expect(firstWorkshopErrorField({ differences: 'missing', imageA: 'missing' })).toBe('imageA');
    expect(firstWorkshopErrorField({ imageB: 'missing', authorName: 'missing' })).toBe('authorName');
    expect(firstWorkshopErrorField({})).toBeNull();
  });

  it('derives the three checklist groups from current values', () => {
    expect(workshopCompletion(VALID)).toEqual({ basicInfo: true, images: true, differences: true });
    expect(workshopCompletion({ ...VALID, title: '', imageBName: null, differences: [] })).toEqual({
      basicInfo: false,
      images: false,
      differences: false,
    });
  });

  it('marks a single image complete in find-area mode', () => {
    expect(workshopCompletion({ ...VALID, mode: 'find_area', imageBName: null }).images).toBe(true);
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
