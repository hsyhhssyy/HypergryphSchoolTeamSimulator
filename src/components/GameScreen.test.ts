import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyRoundTimerPhase,
  QUESTION_TIME_LIMIT,
  ROUND_END_DELAY_MS,
  usePreloadNextQuestion,
  useRoundEndAutoAdvance,
  useWrongClickCooldown,
  WRONG_COOLDOWN_MS,
} from '@/components/GameScreen';
import { useTimer } from '@/hooks/useTimer';
import type { GameAction } from '@/hooks/useGameState';
import type { GameState, Question } from '@shared/types';

/**
 * Same null-render probe as useTimer.test.ts (todo 9 pattern): preact's own
 * `render` + `act` with a mini container — no testing-library, no jsdom.
 */

interface MiniDomNode {
  childNodes: MiniDomNode[];
  firstChild: MiniDomNode | null;
}

function createContainer(): MiniDomNode {
  const children: MiniDomNode[] = [];
  const container: MiniDomNode = {
    childNodes: children,
    firstChild: null,
  };
  Object.defineProperty(container, 'firstChild', {
    get: () => children[0] ?? null,
  });
  return container;
}

interface RenderHookResult<T> {
  result: { current: T };
  unmount: () => void;
}

function renderHook<T>(useHook: () => T): RenderHookResult<T> {
  const container = createContainer();
  let latest!: T;
  function Probe() {
    latest = useHook();
    return null;
  }
  act(() => {
    render(h(Probe, null), container as unknown as Element);
  });
  return {
    result: {
      get current() {
        return latest;
      },
    },
    unmount: () => {
      act(() => {
        render(null, container as unknown as Element);
      });
    },
  };
}

/** Stub dispatch that records every action. */
function createDispatchSpy() {
  const actions: GameAction[] = [];
  const dispatch = (action: GameAction): void => {
    actions.push(action);
  };
  return { actions, dispatch };
}

describe('applyRoundTimerPhase — todo 13 timer discipline', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('document', {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('entering playing: resets to the per-question limit and starts the clock', () => {
    // Given: a fresh timer with a DIFFERENT default. When: phase becomes
    // 'playing' (START_GAME / NEXT_ROUND both land here).
    const { result } = renderHook(() => useTimer({ initialSeconds: 99 }));
    act(() => {
      applyRoundTimerPhase('playing', result.current, QUESTION_TIME_LIMIT);
    });

    // Then: timeLeft restored to the round limit and the clock is running.
    expect(result.current.timeLeft).toBe(QUESTION_TIME_LIMIT);
    expect(result.current.isRunning).toBe(true);
    expect(vi.getTimerCount()).toBe(1);
  });

  it('leaving playing (round_end): pauses the clock — no ticking through the interstitial', () => {
    const { result } = renderHook(() => useTimer({ initialSeconds: 99 }));
    act(() => {
      applyRoundTimerPhase('playing', result.current, QUESTION_TIME_LIMIT);
    });
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(result.current.timeLeft).toBe(QUESTION_TIME_LIMIT - 3);

    // When: phase leaves 'playing' (found==total or TIME_UP → round_end).
    act(() => {
      applyRoundTimerPhase('round_end', result.current, QUESTION_TIME_LIMIT);
    });

    // Then: paused, and time frozen while the 1500ms interstitial runs.
    expect(result.current.isRunning).toBe(false);
    act(() => {
      vi.advanceTimersByTime(ROUND_END_DELAY_MS + 5000);
    });
    expect(result.current.timeLeft).toBe(QUESTION_TIME_LIMIT - 3);
  });

  it('re-entering playing (NEXT_ROUND): resets, never inherits leftover time', () => {
    const { result } = renderHook(() => useTimer({ initialSeconds: 99 }));
    act(() => {
      applyRoundTimerPhase('playing', result.current, QUESTION_TIME_LIMIT);
    });
    act(() => {
      vi.advanceTimersByTime(10000);
    });
    expect(result.current.timeLeft).toBe(QUESTION_TIME_LIMIT - 10);

    // When: round_end then back to playing (auto-advance).
    act(() => {
      applyRoundTimerPhase('round_end', result.current, QUESTION_TIME_LIMIT);
    });
    act(() => {
      applyRoundTimerPhase('playing', result.current, QUESTION_TIME_LIMIT);
    });

    // Then: a fresh full clock — the previous round's 10s are gone.
    expect(result.current.timeLeft).toBe(QUESTION_TIME_LIMIT);
    expect(result.current.isRunning).toBe(true);
  });
});

describe('useRoundEndAutoAdvance — 1500ms interstitial → NEXT_ROUND', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('document', {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('dispatches NEXT_ROUND ~1500ms after round_end, exactly once', () => {
    const { actions, dispatch } = createDispatchSpy();
    const { result } = renderHook(() => {
      useRoundEndAutoAdvance('round_end', dispatch);
      return { actions };
    });
    expect(actions).toEqual([]);

    act(() => {
      vi.advanceTimersByTime(ROUND_END_DELAY_MS - 100);
    });
    expect(actions).toEqual([]);
    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(actions).toEqual([{ type: 'NEXT_ROUND' }]);
    act(() => {
      vi.advanceTimersByTime(ROUND_END_DELAY_MS * 3);
    });
    expect(actions).toEqual([{ type: 'NEXT_ROUND' }]);
    void result;
  });

  it('does not dispatch while playing, and unmount mid-interstitial cancels the timeout', () => {
    const { actions, dispatch } = createDispatchSpy();
    const playing = renderHook(() => {
      useRoundEndAutoAdvance('playing', dispatch);
      return { actions };
    });
    act(() => {
      vi.advanceTimersByTime(ROUND_END_DELAY_MS * 2);
    });
    expect(actions).toEqual([]);
    playing.unmount();

    const { unmount } = renderHook(() => {
      useRoundEndAutoAdvance('round_end', dispatch);
      return { actions };
    });
    act(() => {
      vi.advanceTimersByTime(ROUND_END_DELAY_MS - 200);
    });
    unmount();
    act(() => {
      vi.advanceTimersByTime(ROUND_END_DELAY_MS * 2);
    });
    expect(actions).toEqual([]);
  });
});

describe('useWrongClickCooldown — component-level 800ms window', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('document', {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('trigger() arms the cooldown and releases it after 800ms', () => {
    const { result } = renderHook(() => useWrongClickCooldown());
    expect(result.current.cooldown).toBe(false);

    act(() => {
      result.current.trigger();
    });
    expect(result.current.cooldown).toBe(true);

    act(() => {
      vi.advanceTimersByTime(WRONG_COOLDOWN_MS - 1);
    });
    expect(result.current.cooldown).toBe(true);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.cooldown).toBe(false);
  });

  it('a second trigger re-arms the full window (rapid misses stay blocked)', () => {
    const { result } = renderHook(() => useWrongClickCooldown());
    act(() => {
      result.current.trigger();
    });
    act(() => {
      vi.advanceTimersByTime(400);
    });
    act(() => {
      result.current.trigger();
    });

    // Second trigger at t=400 → release at t=400+800=1200.
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(result.current.cooldown).toBe(true);
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(result.current.cooldown).toBe(false);
  });

  it('unmount clears the pending timeout — no state flip after unmount', () => {
    const { result, unmount } = renderHook(() => useWrongClickCooldown());
    act(() => {
      result.current.trigger();
    });
    expect(vi.getTimerCount()).toBe(1);

    unmount();
    expect(vi.getTimerCount()).toBe(0);
    act(() => {
      vi.advanceTimersByTime(WRONG_COOLDOWN_MS * 2);
    });
    expect(result.current.cooldown).toBe(true);
  });
});

describe('usePreloadNextQuestion — todo 23: ONLY the next question, exactly once per advance', () => {
  interface FakeImage {
    src: string;
  }

  const created: FakeImage[] = [];

  function FakeImage(this: FakeImage): void {
    this.src = '';
    created.push(this);
  }

  function makeQuestion(id: string, imageB?: string): Question {
    return {
      id,
      mode: 'spot_diff',
      title: `Q ${id}`,
      description: 'desc',
      imageA: `img-${id}-a.png`,
      imageB,
      differences: [{ type: 'circle', x: 10, y: 10, radius: 5 }],
      showCount: true,
      source: 'official',
      status: 'approved',
      likes: 0,
      dislikes: 0,
      createdAt: '2026-01-01T00:00:00Z',
    };
  }

  function makeState(questions: Question[], questionIndex: number): GameState {
    return {
      phase: 'playing',
      mode: 'spot_diff',
      source: 'official',
      questions,
      questionIndex,
      currentQuestion: questions[questionIndex] ?? null,
      foundIndices: [],
      totalFound: 0,
      score: 0,
      wrongCount: 0,
      timeLeft: 0,
    };
  }

  beforeEach(() => {
    created.length = 0;
    vi.stubGlobal('Image', FakeImage);
    vi.stubGlobal('document', {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('preloads exactly the NEXT question images — never the whole set', () => {
    const questions = [makeQuestion('1', 'b1'), makeQuestion('2', 'b2'), makeQuestion('3')];
    const container = createContainer();
    let state: GameState = makeState(questions, 0);

    function Probe() {
      usePreloadNextQuestion(state);
      return null;
    }

    // Round 1 active → preload q2's imageA + imageB (2 fetches, not 6).
    act(() => {
      render(h(Probe, null), container as unknown as Element);
    });
    expect(created).toHaveLength(2);
    expect(created.map((i) => i.src)).toEqual([
      '/img-2-a.png',
      '/b2',
    ]);

    // Round 1 still active (unrelated re-render, e.g. score) → NO new fetches.
    state = { ...state, score: 100 };
    act(() => {
      render(h(Probe, null), container as unknown as Element);
    });
    expect(created).toHaveLength(2);

    // Advance to q2 → exactly ONE more batch (q3 imageA only — no imageB).
    state = makeState(questions, 1);
    act(() => {
      render(h(Probe, null), container as unknown as Element);
    });
    expect(created).toHaveLength(3);
    expect(created[2]?.src).toBe('/img-3-a.png');

    // Last question → nothing after it, no preload.
    state = makeState(questions, 2);
    act(() => {
      render(h(Probe, null), container as unknown as Element);
    });
    expect(created).toHaveLength(3);
  });

  it('no-op with zero questions (menu / empty level)', () => {
    const container = createContainer();
    const state: GameState = makeState([], 0);
    function Probe() {
      usePreloadNextQuestion(state);
      return null;
    }
    act(() => {
      render(h(Probe, null), container as unknown as Element);
    });
    expect(created).toHaveLength(0);
  });
});
