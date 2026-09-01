import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Question } from '@shared/types';
import { loadRandomGameQuestions } from './questions';

function question(id: string, mode: Question['mode']): Question {
  return {
    id,
    mode,
    title: id,
    description: 'description',
    imageA: `${id}-a.png`,
    ...(mode === 'spot_diff' ? { imageB: `${id}-b.png` } : {}),
    differences: [{ type: 'circle', x: 1, y: 1, radius: 1 }],
    showCount: true,
    source: 'official',
    status: 'approved',
    likes: 0,
    dislikes: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('loadRandomGameQuestions', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('抽取整个题库，因此结果可以混合不同模式', async () => {
    const bank = [
      question('spot-1', 'spot_diff'),
      question('area-1', 'find_area'),
      question('spot-2', 'spot_diff'),
    ];
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => bank,
    }));
    vi.spyOn(Math, 'random').mockReturnValue(0);

    const result = await loadRandomGameQuestions(3);

    expect(result.questions).toHaveLength(3);
    expect(new Set(result.questions.map(({ mode }) => mode))).toEqual(
      new Set(['spot_diff', 'find_area']),
    );
  });
});