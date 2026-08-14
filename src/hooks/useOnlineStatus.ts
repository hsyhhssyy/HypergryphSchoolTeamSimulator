/**
 * Offline detection (todo 24) — a single boolean the App renders the
 * "网络连接已断开" banner from.
 *
 * Contract:
 * - Initial value from `navigator.onLine` (guarded — not every runtime
 *   exposes it; default ONLINE so a non-browser env never shows a banner).
 * - Subscribes to the window `online`/`offline` events (the spec event pair
 *   that `navigator.onLine` tracks).
 * - Listener cleanup on unmount — no leaked handlers after App unmounts.
 *
 * The hook itself holds no timers and no state beyond the boolean, so a
 * Preact render stays cheap; the banner is a real signal (the user is
 * offline and every fetch will fail), not decoration.
 */
import { useEffect, useState } from 'preact/hooks';

function isOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine;
}

export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(isOnline);

  useEffect(() => {
    const handleOnline = (): void => setOnline(true);
    const handleOffline = (): void => setOnline(false);

    // `window` may be absent in non-browser test runtimes — subscribe only
    // when the event target actually exists.
    if (typeof window !== 'undefined') {
      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);
      return () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      };
    }
    return undefined;
  }, []);

  return online;
}
