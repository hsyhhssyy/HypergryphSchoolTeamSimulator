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
const imagePromises = new Map<string, Promise<void>>();

/** Fetch and decode an image before it is inserted into the visible UI. */
export function preloadImage(url: string): Promise<void> {
  const cached = imagePromises.get(url);
  if (cached !== undefined) return cached;

  const promise = new Promise<void>((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      if (typeof image.decode !== 'function') {
        resolve();
        return;
      }
      image.decode().then(resolve, reject);
    };
    image.onerror = () => reject(new Error(`图片加载失败: ${url}`));
    image.src = url;
  }).catch((error: unknown) => {
    imagePromises.delete(url);
    throw error;
  });
  imagePromises.set(url, promise);
  return promise;
}

/** Test-only cache reset. */
export function clearPreloadedImages(): void {
  imagePromises.clear();
}
