/**
 * preload — todo 23. Background image preloading.
 *
 * Fires an `Image()` fetch so the browser warms the HTTP cache BEFORE the
 * element is ever rendered — the next round's panels then paint from cache
 * with no visible skeleton delay.
 *
 * Contract (plan todo 23): callers MUST preload only the NEXT question's
 * images (GameScreen's usePreloadNextQuestion), never the whole level set.
 */
export function preloadImage(url: string): void {
  // A detached Image still triggers a real network fetch in every browser;
  // the reference is dropped after this call (the fetch is owned by the
  // browser's cache, not by the element).
  const image = new Image();
  image.src = url;
}
