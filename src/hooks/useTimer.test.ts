import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTimer } from './useTimer';

/**
 * Minimal renderHook built on preact's own `render` + `act` (both ship with
 * preact — no testing-library dependency, no jsdom). The probe component
 * renders `null`, so preact's diff never creates DOM element nodes; the
 * container only needs the handful of fields the diff reads (`__k`,
 * `namespaceURI`, `childNodes`, `firstChild`). `document` is stubbed to a
 * bare object because preact's `render` compares `container == document`.
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
    // The cast is the whole DOM shim: preact only touches fields the
    // mini-container provides for a null-rendering tree.
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

describe('useTimer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('document', {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('start() begins the countdown and creates exactly one interval', () => {
    // Given: a fresh 3s timer, not running. When: start().
    const { result } = renderHook(() => useTimer({ initialSeconds: 3 }));
    expect(result.current.timeLeft).toBe(3);
    expect(result.current.isRunning).toBe(false);
    expect(vi.getTimerCount()).toBe(0);

    act(() => {
      result.current.start();
    });

    // Then: running with one interval registered.
    expect(result.current.isRunning).toBe(true);
    expect(vi.getTimerCount()).toBe(1);
  });

  it('decrements timeLeft by 1 per second and reports every tick to onTick', () => {
    // Given: a 3s timer with an onTick spy. When: two 1s ticks.
    const ticks: number[] = [];
    const { result } = renderHook(() =>
      useTimer({ initialSeconds: 3, onTick: (remaining) => ticks.push(remaining) }),
    );
    act(() => {
      result.current.start();
    });

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.timeLeft).toBe(2);
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    // Then: 3→2→1 with remaining seconds reported on each tick.
    expect(result.current.timeLeft).toBe(1);
    expect(ticks).toEqual([2, 1]);
  });

  it('supports an accelerated countdown without creating extra intervals', () => {
    const { result } = renderHook(() => useTimer({ initialSeconds: 6, speed: 1.5 }));
    act(() => {
      result.current.start();
    });
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(result.current.timeLeft).toBe(3);
    expect(vi.getTimerCount()).toBe(1);
  });

  it('walks 3→2→1→0 and fires onTimeUp exactly once', () => {
    // Given: a 3s timer. When: 3s elapse.
    const onTimeUp = vi.fn();
    const { result } = renderHook(() => useTimer({ initialSeconds: 3, onTimeUp }));
    act(() => {
      result.current.start();
    });

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    // Then: 0 left, stopped, onTimeUp once, interval gone — and nothing
    // fires again even if time keeps advancing.
    expect(result.current.timeLeft).toBe(0);
    expect(result.current.isRunning).toBe(false);
    expect(onTimeUp).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(onTimeUp).toHaveBeenCalledTimes(1);
  });

  it('pause() stops the countdown and clears the interval', () => {
    // Given: a running 5s timer, 2s elapsed. When: pause().
    const { result } = renderHook(() => useTimer({ initialSeconds: 5 }));
    act(() => {
      result.current.start();
    });
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(result.current.timeLeft).toBe(3);

    act(() => {
      result.current.pause();
    });

    // Then: timeLeft frozen and no interval left ticking.
    expect(result.current.isRunning).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(result.current.timeLeft).toBe(3);
  });

  it('deductTime(5) reduces timeLeft by 5 and clamps at 0', () => {
    // Given: a 10s timer. When: deduct 5, then deduct 99.
    const { result } = renderHook(() => useTimer({ initialSeconds: 10 }));

    act(() => {
      result.current.deductTime(5);
    });
    expect(result.current.timeLeft).toBe(5);
    act(() => {
      result.current.deductTime(99);
    });

    // Then: 5, then clamped to 0 (never negative).
    expect(result.current.timeLeft).toBe(0);
  });

  it('a fatal penalty (deductTime past 0 while running) fires onTimeUp once', () => {
    // Given: a running 3s timer. When: a wrong-click penalty larger than
    // the remaining time.
    const onTimeUp = vi.fn();
    const { result } = renderHook(() => useTimer({ initialSeconds: 3, onTimeUp }));
    act(() => {
      result.current.start();
    });

    act(() => {
      result.current.deductTime(5);
    });

    // Then: clock exhausted → stopped + onTimeUp exactly once, no later
    // double-fire from a queued tick.
    expect(result.current.timeLeft).toBe(0);
    expect(result.current.isRunning).toBe(false);
    expect(onTimeUp).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(onTimeUp).toHaveBeenCalledTimes(1);
  });

  it('addTime(s) increases timeLeft', () => {
    // Given: a 10s timer. When: addTime(5).
    const { result } = renderHook(() => useTimer({ initialSeconds: 10 }));
    act(() => {
      result.current.addTime(5);
    });

    // Then: 15s remain.
    expect(result.current.timeLeft).toBe(15);
  });

  it('addTime(s) never exceeds maxSeconds', () => {
    const { result } = renderHook(() =>
      useTimer({ initialSeconds: 118, maxSeconds: 120 }),
    );
    act(() => {
      result.current.addTime(10);
    });
    expect(result.current.timeLeft).toBe(120);
  });

  it('reset() restores initialSeconds and stops the timer', () => {
    // Given: a running 3s timer, 2s elapsed. When: reset().
    const { result } = renderHook(() => useTimer({ initialSeconds: 3 }));
    act(() => {
      result.current.start();
    });
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(result.current.timeLeft).toBe(1);

    act(() => {
      result.current.reset();
    });

    // Then: back to 3s, stopped, no interval.
    expect(result.current.timeLeft).toBe(3);
    expect(result.current.isRunning).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('reset(seconds) restores a custom duration', () => {
    // Given: a 3s timer. When: reset(20) (todo 13 resets per-question).
    const { result } = renderHook(() => useTimer({ initialSeconds: 3 }));
    act(() => {
      result.current.reset(20);
    });

    // Then: 20s restored.
    expect(result.current.timeLeft).toBe(20);
  });

  it('unmount clears the interval — no leaked timers', () => {
    // Given: a mounted, running timer. When: the host unmounts.
    const { result, unmount } = renderHook(() => useTimer({ initialSeconds: 30 }));
    act(() => {
      result.current.start();
    });
    expect(vi.getTimerCount()).toBe(1);

    unmount();

    // Then: the interval is gone.
    expect(vi.getTimerCount()).toBe(0);
  });

  it('calling start() twice does not create duplicate intervals', () => {
    // Given: a 10s timer. When: start() is called twice in a row.
    const { result } = renderHook(() => useTimer({ initialSeconds: 10 }));
    act(() => {
      result.current.start();
    });
    act(() => {
      result.current.start();
    });

    // Then: exactly ONE interval exists, and it still ticks once per second.
    expect(vi.getTimerCount()).toBe(1);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.timeLeft).toBe(9);
  });

  it('start() after time-up restarts the countdown from initialSeconds', () => {
    // Given: a 2s timer that ran out. When: start() is called again.
    const onTimeUp = vi.fn();
    const { result } = renderHook(() => useTimer({ initialSeconds: 2, onTimeUp }));
    act(() => {
      result.current.start();
    });
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(result.current.timeLeft).toBe(0);

    act(() => {
      result.current.start();
    });

    // Then: a fresh full countdown, without a second onTimeUp.
    expect(result.current.timeLeft).toBe(2);
    expect(result.current.isRunning).toBe(true);
    expect(onTimeUp).toHaveBeenCalledTimes(1);
  });
});
