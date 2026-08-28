import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearPreloadedImages, preloadImage } from '@/utils/preload';

/**
 * preloadImage (todo 23): a detached `new Image().src = url` must start a
 * real browser fetch. Node has no Image constructor — stub it with a class
 * that records instances, then assert the URL landed on `src` (the exact
 * assignment that triggers the browser's fetch).
 */

interface FakeImage {
  src: string;
  onload: (() => void) | null;
  onerror: (() => void) | null;
  decode: () => Promise<void>;
}

const created: FakeImage[] = [];

function FakeImage(this: FakeImage): void {
  this.src = '';
  this.onload = null;
  this.onerror = null;
  this.decode = () => Promise.resolve();
  created.push(this);
}

describe('preloadImage', () => {
  beforeEach(() => {
    created.length = 0;
    clearPreloadedImages();
    vi.stubGlobal('Image', FakeImage);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('creates exactly one Image and assigns the URL to src (browser starts fetching)', () => {
    preloadImage('https://example.com/images/q1-a.png');
    expect(created).toHaveLength(1);
    expect(created[0]?.src).toBe('https://example.com/images/q1-a.png');
  });

  it('passes the resolved URL through verbatim — no encoding or rewriting', () => {
    const url = 'http://localhost:8080/images/space%20key.png';
    preloadImage(url);
    expect(created).toHaveLength(1);
    expect(created[0]?.src).toBe(url);
  });

  it('does not resolve until the detached image has loaded and decoded', async () => {
    const promise = preloadImage('https://example.com/images/decode.png');
    let ready = false;
    void promise.then(() => { ready = true; });
    await Promise.resolve();
    expect(ready).toBe(false);

    created[0]?.onload?.();
    await promise;
    expect(ready).toBe(true);
  });
});
