import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useOnlineStatus } from './useOnlineStatus';

/**
 * Minimal renderHook built on preact's own `render` + `act` (same shim as
 * useTimer.test.ts — no jsdom, no testing-library). The probe renders null,
 * so preact's diff never creates element nodes. `navigator` and `window`
 * are stubbed globals the hook reads/subscribes on.
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

interface StubWindow {
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
}

let stubWindow: StubWindow;
/** Capture the handler bound to `type` by the last addEventListener call. */
function handlerFor(type: string): () => void {
  const call = stubWindow.addEventListener.mock.calls.find(([t]) => t === type);
  if (call === undefined) throw new Error(`no addEventListener call for "${type}"`);
  return call[1] as () => void;
}

describe('useOnlineStatus', () => {
  beforeEach(() => {
    stubWindow = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    vi.stubGlobal('window', stubWindow);
    vi.stubGlobal('document', {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('starts online when navigator.onLine is true', () => {
    vi.stubGlobal('navigator', { onLine: true });
    const { result } = renderHook(() => useOnlineStatus());
    expect(result.current).toBe(true);
  });

  it('starts offline when navigator.onLine is false', () => {
    vi.stubGlobal('navigator', { onLine: false });
    const { result } = renderHook(() => useOnlineStatus());
    expect(result.current).toBe(false);
  });

  it('subscribes to both online and offline events on mount', () => {
    vi.stubGlobal('navigator', { onLine: true });
    renderHook(() => useOnlineStatus());
    expect(stubWindow.addEventListener).toHaveBeenCalledWith('online', expect.any(Function));
    expect(stubWindow.addEventListener).toHaveBeenCalledWith('offline', expect.any(Function));
  });

  it('flips to false on the offline event and back to true on online (stale-state probe)', () => {
    vi.stubGlobal('navigator', { onLine: true });
    const { result } = renderHook(() => useOnlineStatus());
    expect(result.current).toBe(true);

    // offline event → banner shows
    act(() => handlerFor('offline')());
    expect(result.current).toBe(false);

    // online event → banner dismisses (state must not stay stale)
    act(() => handlerFor('online')());
    expect(result.current).toBe(true);
  });

  it('removes both listeners on unmount (no leak)', () => {
    vi.stubGlobal('navigator', { onLine: true });
    const { unmount } = renderHook(() => useOnlineStatus());
    unmount();
    expect(stubWindow.removeEventListener).toHaveBeenCalledWith(
      'online',
      expect.any(Function),
    );
    expect(stubWindow.removeEventListener).toHaveBeenCalledWith(
      'offline',
      expect.any(Function),
    );
  });
});
