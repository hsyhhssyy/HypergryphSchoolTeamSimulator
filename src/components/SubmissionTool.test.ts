import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import {
  buildSubmissionZip,
  centeredRect,
  createSubmissionDraft,
  normalizeRect,
  validateSubmissionDraft,
  type SubmissionDraft,
} from './SubmissionTool';
import type { AdjustableImage } from './ImageAdjustDialog';

function image(name: string, bytes: string): AdjustableImage {
  const file = new File([bytes], name, { type: 'image/png' });
  return {
    originalFile: file,
    originalUrl: `blob:${name}`,
    file,
    dataUrl: `blob:${name}`,
    width: 800,
    height: 600,
    originalWidth: 800,
    originalHeight: 600,
  };
}

function completeDraft(title: string, mode: SubmissionDraft['mode']): SubmissionDraft {
  return {
    ...createSubmissionDraft(),
    mode,
    title,
    description: '测试说明',
    imageA: image(`${title}-a.png`, `a-${title}`),
    imageB: mode === 'spot_diff' ? image(`${title}-b.png`, `b-${title}`) : null,
    differences: [{ type: 'circle', x: 100, y: 120, radius: 30 }],
  };
}

describe('multi-question submission validation', () => {
  it('requires both images only for spot diff', () => {
    const draft = completeDraft('题目', 'spot_diff');
    expect(validateSubmissionDraft(draft)).toEqual({});
    expect(validateSubmissionDraft({ ...draft, imageB: null }).imageB).toBeDefined();
    expect(validateSubmissionDraft({ ...draft, mode: 'find_area', imageB: null })).toEqual({});
  });

  it('normalizes reverse rectangle drags', () => {
    expect(normalizeRect({ x: 200, y: 160 }, { x: 80, y: 40 })).toEqual({
      type: 'rect', x: 80, y: 40, width: 120, height: 120,
    });
  });

  it('creates a fixed-size rectangle centered on a tap and keeps it in bounds', () => {
    expect(centeredRect({ x: 400, y: 300 }, 800, 600)).toEqual({
      type: 'rect', x: 350, y: 250, width: 100, height: 100,
    });
    expect(centeredRect({ x: 10, y: 590 }, 800, 600)).toEqual({
      type: 'rect', x: 0, y: 500, width: 100, height: 100,
    });
  });
});

describe('ZIP export', () => {
  it('packs multiple questions, processed images and metadata', async () => {
    const bytes = await buildSubmissionZip([
      completeDraft('第一题', 'spot_diff'),
      completeDraft('第二题', 'find_area'),
    ], '测试作者');
    const files = unzipSync(bytes);
    const manifest = JSON.parse(strFromU8(files['submission.json']!)) as {
      authorName: string;
      questions: Array<{ mode: string; imageA: string; imageB?: string }>;
    };
    expect(manifest.authorName).toBe('测试作者');
    expect(manifest.questions).toHaveLength(2);
    expect(manifest.questions.map((question) => question.mode)).toEqual(['spot_diff', 'find_area']);
    expect(manifest.questions[0]?.imageB).toMatch(/^questions\//);
    expect(manifest.questions[1]?.imageB).toBeUndefined();
    expect(Object.keys(files).filter((name) => /\.(png|jpg|webp)$/.test(name))).toHaveLength(3);
    expect(strFromU8(files['README.txt']!)).toContain('GitHub Issue');
  });
});
