import { useEffect, useRef } from 'preact/hooks';

/**
 * Handlers to spread onto an element — the pointer-based long-press gesture.
 * Pointer events cover mouse + touch uniformly; pointerleave cancels so a
 * finger that slides off the element never fires; contextmenu is suppressed
 * so mobile browsers do not flash the native long-press menu during the hold.
 */
export interface LongPressHandlers {
  onPointerDown: (e: PointerEvent) => void;
  onPointerUp: () => void;
  onPointerCancel: () => void;
  onPointerLeave: () => void;
  onContextMenu: (e: Event) => void;
}

/**
 * Hidden-gesture trigger (todo 22): fires `callback` after the pointer stays
 * down for `ms` (default 3s). Any release/cancel/leave before then cancels.
 */
export function useLongPress(callback: () => void, ms = 3000): LongPressHandlers {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  });

  useEffect(
    () => () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    },
    [],
  );

  const clear = (): void => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  return {
    onPointerDown: () => {
      clear();
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        callbackRef.current();
      }, ms);
    },
    onPointerUp: clear,
    onPointerCancel: clear,
    onPointerLeave: clear,
    onContextMenu: (e) => e.preventDefault(),
  };
}
