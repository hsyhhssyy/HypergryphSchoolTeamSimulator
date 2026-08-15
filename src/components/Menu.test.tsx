import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { renderToString } from 'preact-render-to-string';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Menu } from './Menu';
import { useLongPress } from '@/hooks/useLongPress';
import type { LongPressHandlers } from '@/hooks/useLongPress';

/**
 * Todo 2 (home-title-image-responsive): the menu title is now the
 * 鹰角网络校队 wordmark image instead of the "找不同" text — with the 3s
 * hidden long-press admin entry preserved on the h1.
 *
 * No jsdom in this repo: structure assertions use preact-render-to-string;
 * behavior assertions use the renderHook null-render probe (same pattern as
 * useTimer.test.ts).
 */

/** Shape-only handlers — Menu is presentational and just spreads them. */
const noopHandlers: LongPressHandlers = {
  onPointerDown: () => {},
  onPointerUp: () => {},
  onPointerCancel: () => {},
  onPointerLeave: () => {},
  onContextMenu: () => {},
};

function renderMenuHtml(): string {
  return renderToString(
    <Menu
      onStart={() => {}}
      onOpenWorkshop={() => {}}
      titleLongPress={noopHandlers}
    />,
  );
}

describe('Menu title — wordmark image', () => {
  it('renders the title as an h1 containing an img with alt="鹰角网络校队"', () => {
    const html = renderMenuHtml();

    const h1Block = html.match(/<h1[^>]*>[\s\S]*?<\/h1>/)?.[0];
    expect(h1Block).toBeDefined();
    expect(h1Block).toContain('<img');
    expect(h1Block).toContain('alt="鹰角网络校队"');
  });

  it('renders exactly ONE h1 in the whole menu', () => {
    const html = renderMenuHtml();

    expect(html.match(/<h1/g)).toHaveLength(1);
  });

  it('wraps the img in a picture with the webp source first and png fallback', () => {
    const html = renderMenuHtml();

    expect(html).toContain('<picture>');
    expect(html).toContain('type="image/webp"');
    expect(html).toContain('srcset="/wordmark.webp"');
    expect(html).toContain('src="/wordmark.png"');
    expect(html).toContain('class="menu__title-img"');
    expect(html).toContain('draggable="false"');
    expect(html).toContain('decoding="async"');
  });

  it('drops the old text title but keeps the updated tagline and mode labels', () => {
    const html = renderMenuHtml();

    expect(html).not.toContain('找不同</h1>');
    expect(html).not.toContain('双图找茬');
    expect(html).toContain('找不同 · 区域识别 · 答题小游戏');
    // spot_diff MODE_OPTIONS label is intentionally untouched (todo 2 scope).
    expect(html).toContain('双图对比 · 找出差异');
  });
});

/* --------------------------------------------------------------------------
 * Long-press probe — the renderHook null-render pattern from useTimer.test.ts
 * (preact's own render + act, no testing-library, no jsdom).
 * -------------------------------------------------------------------------- */

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

describe('Menu title long-press — hidden admin entry (App.tsx:38)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('document', {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('exposes the full pointer handler surface to spread on the h1', () => {
    const { result } = renderHook(() => useLongPress(vi.fn()));

    expect(result.current).toEqual(
      expect.objectContaining({
        onPointerDown: expect.any(Function),
        onPointerUp: expect.any(Function),
        onPointerCancel: expect.any(Function),
        onPointerLeave: expect.any(Function),
        onContextMenu: expect.any(Function),
      }),
    );
  });

  it('fires the admin callback after a full 3s hold', () => {
    const adminCallback = vi.fn();
    const { result } = renderHook(() => useLongPress(adminCallback));

    act(() => {
      result.current.onPointerDown({} as PointerEvent);
      vi.advanceTimersByTime(3000);
    });

    expect(adminCallback).toHaveBeenCalledTimes(1);
  });

  it('does NOT fire when released at 2999ms', () => {
    const adminCallback = vi.fn();
    const { result } = renderHook(() => useLongPress(adminCallback));

    act(() => {
      result.current.onPointerDown({} as PointerEvent);
      vi.advanceTimersByTime(2999);
      result.current.onPointerUp();
      vi.advanceTimersByTime(5000);
    });

    expect(adminCallback).not.toHaveBeenCalled();
  });

  it('cancels on pointercancel and pointerleave before the hold completes', () => {
    const adminCallback = vi.fn();
    const { result } = renderHook(() => useLongPress(adminCallback));

    act(() => {
      result.current.onPointerDown({} as PointerEvent);
      vi.advanceTimersByTime(1500);
      result.current.onPointerCancel();
    });
    act(() => {
      result.current.onPointerDown({} as PointerEvent);
      vi.advanceTimersByTime(1500);
      result.current.onPointerLeave();
    });
    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(adminCallback).not.toHaveBeenCalled();
  });

  it('onContextMenu suppresses the native long-press menu', () => {
    const preventDefault = vi.fn();
    const { result } = renderHook(() => useLongPress(vi.fn()));

    act(() => {
      result.current.onContextMenu({ preventDefault } as unknown as Event);
    });

    expect(preventDefault).toHaveBeenCalledTimes(1);
  });

  it('clears the pending timer on unmount — no leaked fires', () => {
    const adminCallback = vi.fn();
    const { result, unmount } = renderHook(() => useLongPress(adminCallback));

    act(() => {
      result.current.onPointerDown({} as PointerEvent);
    });
    expect(vi.getTimerCount()).toBe(1);

    unmount();
    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(adminCallback).not.toHaveBeenCalled();
  });
});
