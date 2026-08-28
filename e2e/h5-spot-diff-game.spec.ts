/**
 * h5-spot-diff-game E2E — todo 28. Playwright Chromium, mobile 375×812.
 *
 * Covers the full game flow across both modes, the end-to-end workshop
 * auto-approve loop (NO admin step), and the BGM player (no autoplay before
 * the first gesture).
 *
 * Todo 7 (home-title-image-responsive): all interaction helpers are
 * DEVICE-AGNOSTIC (hasTouch detected at runtime → touchscreen.tap/locator.tap
 * on touch contexts, mouse.click/locator.click elsewhere). This spec itself
 * only runs on the chromium-mobile project (see playwright.config.ts), where
 * the spot_diff panels are STACKED (todo 3); the desktop side-by-side layout
 * is asserted in e2e/responsive-layout.spec.ts.
 *
 * Determinism strategy (inherited from todo 27 QA):
 *  - Official seed images are external picsum.photos URLs. They are
 *    route-mocked here with locally GENERATED real PNGs (800×600, zlib-built
 *    IHDR/IDAT/IEND) so image naturalWidth/Height are exactly known and the
 *    suite never depends on slow external network.
 *  - NO pixel coordinates are hardcoded: every tap is computed at runtime
 *    from the laid-out <img> box (`getBoundingClientRect` via boundingBox)
 *    + naturalWidth/Height + the SAME `computeContainTransform` math as
 *    src/utils/hitDetection.ts, applied to the known seed differences (which
 *    are stored in image-NATIVE pixels).
 *  - RANDOM() ordering is neutralized by keying expected differences off the
 *    live `question-title` DOM text, never off question order.
 *  - The workshop loop (scenarios 9+10, serial) filters the REAL
 *    /api/questions response for the freshly submitted title — proving the
 *    submission is auto-approved and in the public pool — then plays it.
 *  - Every question fixture has a UNIQUE image URL (picsum seed per question;
 *    UUID R2 keys per submission) — no shared-src remount/stale-geometry trap.
 *
 * Run: seed local D1 first (see playwright.config.ts header), then
 *      npx playwright test e2e/h5-spot-diff-game.spec.ts
 */
import { test, expect, type Page, type Locator } from '@playwright/test';
import { deflateSync } from 'node:zlib';

// ——————————————————————————— tiny real-PNG generator ————————————————————

/** Lazily-built CRC32 table (PNG chunk checksums). */
let crcTable: Uint32Array | null = null;
function crc32(buf: Buffer): number {
  crcTable ??= (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
    return table;
  })();
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crc]);
}

/**
 * Generate a REAL decodable PNG (8-bit RGB). ImagePanel measures
 * naturalWidth on load — an arbitrary buffer would yield 0 and silently kill
 * tap geometry (todo 14 QA lesson), so this builds a proper
 * signature+IHDR+IDAT(zlib)+IEND file. `variant` shifts the pixel gradient so
 * two files can differ in bytes (distinct fixtures, same dims).
 */
function generatePng(width: number, height: number, variant = 0): Buffer {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: truecolor RGB
  // rows: filter byte 0 + RGB gradient (x-driven, variant-shifted)
  const row = Buffer.alloc(1 + width * 3);
  for (let x = 0; x < width; x++) {
    row[1 + x * 3] = (x * 7 + variant * 53) % 256;
    row[2 + x * 3] = (x * 13 + variant * 97) % 256;
    row[3 + x * 3] = (x * 29 + variant * 149) % 256;
  }
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Deterministic high-entropy PNG used to prove >5 MiB phone originals compress. */
function generateLargePng(width: number, height: number): Buffer {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const raw = Buffer.alloc((1 + width * 3) * height);
  let value = 0x12345678;
  for (let y = 0; y < height; y++) {
    const rowStart = y * (1 + width * 3);
    raw[rowStart] = 0;
    for (let x = 0; x < width * 3; x++) {
      value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
      raw[rowStart + 1 + x] = value >>> 24;
    }
  }
  return Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw, { level: 1 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

/** The 800×600 fixtures — same dims as every official seed image. */
const PNG_800x600 = generatePng(800, 600, 0);
const PNG_800x600_VARIANT = generatePng(800, 600, 7);
/** Portrait fixture: forces the phone page to scroll around the game image. */
const PNG_800x1600 = generatePng(800, 1600, 11);
const PNG_200x1920 = generatePng(200, 1920, 13);

// ————————————— contain-transform math (mirror of src/utils/hitDetection) ————

interface Point {
  x: number;
  y: number;
}

interface ContainTransform {
  scale: number;
  offsetX: number;
  offsetY: number;
}

/** object-fit: contain letterbox transform — same formula as the app. */
function computeContainTransform(
  naturalW: number,
  naturalH: number,
  elementW: number,
  elementH: number,
): ContainTransform {
  const scale = Math.min(elementW / naturalW, elementH / naturalH);
  return {
    scale,
    offsetX: (elementW - naturalW * scale) / 2,
    offsetY: (elementH - naturalH * scale) / 2,
  };
}

/** Native → element-relative display point (the app's toDisplayCoords). */
function toDisplayPoint(nativeX: number, nativeY: number, t: ContainTransform): Point {
  return { x: nativeX * t.scale + t.offsetX, y: nativeY * t.scale + t.offsetY };
}

// ——————————————— seed data (native 800×600 px, from the SQL seed) —————————

type SeedDifference =
  | { type: 'circle'; x: number; y: number; radius: number }
  | { type: 'rect'; x: number; y: number; width: number; height: number };

const circle = (x: number, y: number, radius: number): SeedDifference => ({
  type: 'circle',
  x,
  y,
  radius,
});
const rect = (x: number, y: number, width: number, height: number): SeedDifference => ({
  type: 'rect',
  x,
  y,
  width,
  height,
});

/** Keyed by the seed title (asserted live from the DOM — RANDOM() order-proof). */
const OFFICIAL_SPOT_DIFF: Record<string, SeedDifference[]> = {
  '找不同：海边小镇': [circle(150, 120, 30), circle(420, 300, 25), rect(600, 450, 50, 40)],
  '找不同：森林小屋': [rect(100, 200, 60, 45), circle(350, 150, 35), circle(650, 250, 28)],
  '找不同：城市夜景': [circle(250, 350, 40), rect(500, 120, 70, 50)],
};

const OFFICIAL_FIND_AREA: Record<string, SeedDifference[]> = {
  '区域识别：果园采摘': [circle(200, 300, 40), circle(550, 420, 45)],
  '区域识别：星空探索': [circle(120, 450, 35), rect(400, 250, 50, 50), circle(650, 500, 30)],
};

function diffCenter(d: SeedDifference): Point {
  return d.type === 'circle'
    ? { x: d.x, y: d.y }
    : { x: d.x + d.width / 2, y: d.y + d.height / 2 };
}

/**
 * A native point guaranteed outside every difference of every official
 * question AND clear of the panel's rounded corners (the corners are clipped
 * by border-radius + overflow:hidden — a tap there falls through to the
 * container instead of the overlay; learned the hard way in the first run).
 */
const SAFE_NATIVE_POINT: Point = { x: 400, y: 520 };

// —————————————————————————————— page helpers ——————————————————————————————

/**
 * Device-agnostic tap dispatch (todo 7). `page.touchscreen.tap` throws on
 * non-touch contexts and `locator.tap()` throws on non-touch pages — detect
 * touch at runtime (`navigator.maxTouchPoints` is >0 under Playwright's
 * `hasTouch:true` emulation, 0 on the desktop project) and route through the
 * matching transport. Evaluated per call so per-test `test.use({ hasTouch })`
 * overrides are honored.
 */
async function hasTouch(page: Page): Promise<boolean> {
  return page.evaluate(() => navigator.maxTouchPoints > 0);
}

/** Tap a VIEWPORT coordinate — touchscreen.tap on touch contexts, mouse elsewhere. */
async function tapAt(page: Page, x: number, y: number): Promise<void> {
  if (await hasTouch(page)) await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
}

/**
 * Tap a locator — `locator.tap()` on touch contexts; `locator.click()` on
 * mouse contexts (click also auto-scrolls + waits for actionability, which is
 * exactly what a below-fold desktop tap needs).
 */
async function tapLocator(page: Page, locator: Locator): Promise<void> {
  if (await hasTouch(page)) await locator.tap();
  else await locator.click();
}

/** Wait for a game-panel image to load, then return its box + natural dims. */
async function loadedImageBox(img: Locator): Promise<{
  box: { x: number; y: number; width: number; height: number };
  naturalW: number;
  naturalH: number;
}> {
  await expect
    .poll(() => img.evaluate((el) => (el as HTMLImageElement).naturalWidth), {
      timeout: 15_000,
    })
    .toBeGreaterThan(0);
  const box = await img.boundingBox();
  if (box === null) throw new Error('image panel <img> has no bounding box');
  const dims = await img.evaluate((el) => ({
    w: (el as HTMLImageElement).naturalWidth,
    h: (el as HTMLImageElement).naturalHeight,
  }));
  return { box, naturalW: dims.w, naturalH: dims.h };
}

/**
 * Tap a NATIVE coordinate on panel `panelIndex` (0 = first panel, 1 = second).
 * Computed at runtime: img box + natural dims → contain transform → display
 * point → device-agnostic `tapAt`. No hardcoded pixels anywhere.
 *
 * Todo 7 (Metis gap): the mobile layout STACKS the two panels — panel 1 can
 * sit below the fold. Wait for the image to decode, then
 * `scrollIntoViewIfNeeded()` BEFORE measuring, so the viewport-relative box
 * (and the tap derived from it) is valid. The game-screen entrance is
 * fade-only (`screen-fade`, opacity — no transform), so the bounding box is
 * stable and this never blocks on a running animation.
 */
async function tapNativePoint(page: Page, panelIndex: number, native: Point): Promise<void> {
  const img = page
    .locator('.game-panels > .image-panel')
    .nth(panelIndex)
    .locator('img.image-panel-img');
  await expect
    .poll(() => img.evaluate((el) => (el as HTMLImageElement).naturalWidth), {
      timeout: 15_000,
    })
    .toBeGreaterThan(0);
  await img.scrollIntoViewIfNeeded();
  const { box, naturalW, naturalH } = await loadedImageBox(img);
  const t = computeContainTransform(naturalW, naturalH, box.width, box.height);
  const display = toDisplayPoint(native.x, native.y, t);
  await tapAt(page, box.x + display.x, box.y + display.y);
}

/** Read the current question title from the DOM. */
async function currentTitle(page: Page): Promise<string> {
  const title = await page.getByTestId('question-title').textContent();
  if (title === null || title.trim() === '') throw new Error('question-title is empty');
  return title.trim();
}

/** Parse the numeric score out of the HUD chip ("得分 N"). */
async function hudScore(page: Page): Promise<number> {
  const text = await page.getByTestId('hud-score').textContent();
  const match = /得分\s*(\d+)/.exec(text ?? '');
  if (match === null) throw new Error(`cannot parse hud score from: ${text}`);
  return Number(match[1]);
}

/**
 * Menu → pick source → tap a mode command to launch directly. Returns
 * the /api/questions request URL (asserted by scenario 1) and waits for HUD.
 */
async function startGame(
  page: Page,
  modeLabel: '找不同' | '区域识别',
  sourceLabel: '仅官方题目' | '包含创意工坊',
): Promise<string> {
  await page.goto('/');
  await expect(page.locator('.menu')).toBeVisible();
  const sourceOption = page.locator('.source-toggle__option', { hasText: sourceLabel });
  await tapLocator(page, sourceOption);
  await expect(sourceOption).toHaveAttribute('aria-pressed', 'true');
  const modeCard = page.locator('.mode-card--entry', { hasText: modeLabel });
  const [request] = await Promise.all([
    page.waitForRequest((r) => r.url().includes('/api/questions?')),
    tapLocator(page, modeCard),
  ]);
  await expect(page.locator('.hud')).toBeVisible();
  return request.url();
}

/**
 * Play rounds to completion: for every question, tap each of its differences
 * (native coords from the seed table keyed by the live title), assert the
 * round_end interstitial, and stop once the result screen appears.
 */
async function playGameToResult(
  page: Page,
  table: Record<string, SeedDifference[]>,
  panelCount: number,
): Promise<void> {
  const playedTitles = new Set<string>();
  for (;;) {
    const title = await currentTitle(page);
    expect(playedTitles.has(title), `question played twice: ${title}`).toBe(false);
    playedTitles.add(title);
    const diffs = table[title];
    expect(diffs, `unknown question title: ${title}`).toBeDefined();

    for (let i = 0; i < diffs.length; i++) {
      await tapNativePoint(page, 0, diffCenter(diffs[i]!));
      // All but the last tap leave the round playing: markers appear on EVERY
      // panel (2 for spot_diff, 1 for find_area) for each found difference.
      if (i < diffs.length - 1) {
        await expect(page.locator('.image-panel-marker')).toHaveCount(panelCount * (i + 1));
      }
    }
    await expect(page.locator('.round-end')).toBeVisible();
    // Interstitial auto-advances after ~1500ms (ROUND_END_DELAY_MS).
    await page.waitForFunction(() => document.querySelector('.round-end') === null, null, {
      timeout: 5_000,
    });
    if ((await page.locator('.result-screen').count()) > 0) return;
  }
}

// —————————————————————————— workshop submission helper ————————————————————

/**
 * Fill + submit the workshop form through the REAL UI (scenario 9). Uploads
 * locally generated PNGs, authors ONE circle difference by tapping the center
 * of the editor, submits, and asserts the success toast. Returns the title
 * and the authored difference center in NATIVE pixels (editor tap → native
 * via the same contain math the app uses).
 */
async function submitWorkshopViaUI(
  page: Page,
  opts: { title: string; description: string; author: string },
): Promise<{ title: string; native: Point }> {
  await page.goto('/');
  await tapLocator(page, page.locator('.menu__workshop'));
  await expect(page.locator('.workshop-screen')).toBeVisible();

  await page.fill('#workshop-title', opts.title);
  await page.fill('#workshop-desc', opts.description);
  await page.fill('#workshop-author', opts.author);

  // Two file inputs: image A (benchmark) + image B (spot_diff default mode).
  await page
    .locator('.workshop-upload__input')
    .nth(0)
    .setInputFiles({ name: 'a.png', mimeType: 'image/png', buffer: PNG_800x600 });
  await expect(page.getByRole('dialog', { name: '裁切图片 A' })).toBeVisible();
  await tapLocator(page, page.getByRole('button', { name: '应用裁切' }));
  await expect(page.getByRole('dialog', { name: '裁切图片 A' })).toHaveCount(0);
  await page
    .locator('.workshop-upload__input')
    .nth(1)
    .setInputFiles({ name: 'b.png', mimeType: 'image/png', buffer: PNG_800x600_VARIANT });
  await expect(page.getByRole('dialog', { name: '裁切与校准图片 B' })).toBeVisible();
  await tapLocator(page, page.getByRole('button', { name: '应用校准' }));
  await expect(page.getByRole('dialog', { name: '裁切与校准图片 B' })).toHaveCount(0);

  // Editor appears once image A loads; geometry is set on onLoad.
  const editorImg = page.locator('.workshop-editor__img');
  await expect
    .poll(() => editorImg.evaluate((el) => (el as HTMLImageElement).naturalWidth), {
      timeout: 15_000,
    })
    .toBeGreaterThan(0);

  // The .workshop-editor card enters with a 350ms `pop` animation (scale
  // 0.85→1). Measuring the overlay mid-animation yields a SCALED box, but
  // click({position}) waits for actionability (animation settles) and then
  // resolves the element-relative center against the SETTLED box — the
  // pointerdown would land off-center and the app would faithfully store the
  // off-center point (task 28b race). Wait for the entrance animation to
  // COMPLETE before measuring/clicking so the center is the TRUE center.
  await page.waitForFunction(() => {
    const el = document.querySelector('.workshop-editor');
    const anims = el?.getAnimations() ?? [];
    return anims.length === 0 || anims.every((a) => a.playState === 'finished');
  });

  // Author ONE circle difference at the editor CENTER (element-relative
  // click, auto-scrolls — page.mouse.click would not). The overlay box equals
  // the img box, so the display center maps to the native image center.
  const overlay = page.locator('.workshop-editor__overlay');
  const box = await overlay.boundingBox();
  if (box === null) throw new Error('workshop editor overlay has no bounding box');
  await overlay.click({ position: { x: box.width / 2, y: box.height / 2 } });
  await expect(page.locator('.workshop-diff-item')).toHaveCount(1);

  await tapLocator(page, page.locator('.workshop-form__submit'));
  const toast = page.locator('.toast--success');
  await expect(toast).toBeVisible();
  await expect(toast).toContainText('投稿成功');

  // The native point = image center (the editor img is the same 800×600 PNG;
  // the app stores the tap in native pixels, rounded to 0.1).
  const imgDims = await editorImg.evaluate((el) => ({
    w: (el as HTMLImageElement).naturalWidth,
    h: (el as HTMLImageElement).naturalHeight,
  }));
  const imgBox = await editorImg.boundingBox();
  if (imgBox === null) throw new Error('editor <img> has no bounding box');
  const t = computeContainTransform(imgDims.w, imgDims.h, imgBox.width, imgBox.height);
  // INVERSE contain transform: the display center (element-relative) → native
  // pixels — exactly what the app's toNativeCoords does with the tap.
  const native = {
    x: (imgBox.width / 2 - t.offsetX) / t.scale,
    y: (imgBox.height / 2 - t.offsetY) / t.scale,
  };
  return { title: opts.title, native };
}

// ————————————————————————————— fixtures / state ———————————————————————————

/** Shared between the serial workshop scenarios (9 → 10). */
let workshopSubmission: { title: string; native: Point } | null = null;

/** Mock picsum.photos (official placeholder images) with a local 800×600 PNG. */
test.beforeEach(async ({ context }) => {
  await context.route('https://picsum.photos/**', (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: PNG_800x600 }),
  );
});

// —————————————————————————————— the 11 scenarios ———————————————————————————

test.describe('h5-spot-diff-game full E2E', () => {
  test('1. menu → select source → tap 找不同 directly starts a spot_diff game', async ({
    page,
  }) => {
    const requestUrl = await startGame(page, '找不同', '仅官方题目');
    expect(requestUrl).toContain('mode=spot_diff');
    expect(requestUrl).toContain('source=official');
    expect(requestUrl).toContain('count=5');
    await expect(page.locator('.game-screen')).toBeVisible();
  });

  test('1b. source switch recolors direct entries; rapid double click sends one request', async ({
    page,
    context,
  }) => {
    let requestCount = 0;
    let requestUrl = '';
    await context.route('**/api/questions?**', async (route) => {
      requestCount += 1;
      requestUrl = route.request().url();
      await new Promise((resolve) => setTimeout(resolve, 200));
      await route.fulfill({
        json: [
          {
            id: 'direct-launch-test',
            mode: 'find_area',
            title: '直接开始测试',
            description: '点击图中目标区域。',
            imageA: 'https://picsum.photos/seed/direct-launch-test/800/600',
            differences: [{ type: 'circle', x: 200, y: 200, radius: 40 }],
            showCount: true,
            source: 'workshop',
            authorName: 'E2E',
            status: 'approved',
            likes: 0,
            dislikes: 0,
            createdAt: new Date().toISOString(),
          },
        ],
      });
    });

    await page.goto('/');
    const entry = page.locator('.mode-card--entry', { hasText: '区域识别' });
    const officialBackground = await entry.evaluate((el) => getComputedStyle(el).backgroundImage);
    const mixed = page.locator('.source-toggle__option--mixed');
    await tapLocator(page, mixed);
    await expect(mixed).toHaveAttribute('aria-pressed', 'true');
    const mixedBackground = await entry.evaluate((el) => getComputedStyle(el).backgroundImage);
    expect(mixedBackground).not.toBe(officialBackground);

    // Two synchronous DOM clicks exercise the pre-render race window.
    await entry.evaluate((el) => {
      (el as HTMLButtonElement).click();
      (el as HTMLButtonElement).click();
    });
    await expect(page.locator('.hud')).toBeVisible();
    expect(requestCount).toBe(1);
    expect(requestUrl).toContain('mode=find_area');
    expect(requestUrl).toContain('source=mixed');
  });

  test('2. GameScreen renders two images stacked vertically (mobile) + HUD', async ({
    page,
  }) => {
    await startGame(page, '找不同', '仅官方题目');
    // Two panels (direct children of .game-panels — each ImagePanel renders a
    // nested .image-panel wrapper, so a descendant count would be 4).
    await expect(page.locator('.game-panels > .image-panel')).toHaveCount(2);
    await expect(page.getByTestId('hud-score')).toBeVisible();
    await expect(page.getByTestId('time-left')).toBeVisible();
    await expect(page.getByTestId('hud-found')).toBeVisible();
    // Both images actually loaded with the mocked 800×600 PNG dims.
    const imgs = page.locator('.game-panels img.image-panel-img');
    await expect(imgs).toHaveCount(2);
    for (let i = 0; i < 2; i++) {
      const { naturalW, naturalH } = await loadedImageBox(imgs.nth(i));
      expect(naturalW).toBe(800);
      expect(naturalH).toBe(600);
    }
    // Mobile portrait (375×812) → the two spot_diff panels STACK vertically
    // (todo 3: `grid-template-columns: 1fr` below 900px — the desktop
    // side-by-side layout lives in responsive-layout.spec.ts). Assert the
    // REAL computed geometry, not just element counts: panel 1 sits BELOW
    // panel 0 in the same single grid track (x aligned, y increasing).
    const panels = page.locator('.game-panels > .image-panel');
    const b0 = await panels.nth(0).boundingBox();
    const b1 = await panels.nth(1).boundingBox();
    expect(b0, 'panel 0 has a box').not.toBeNull();
    expect(b1, 'panel 1 has a box').not.toBeNull();
    expect(b1!.y, 'stacked: panel 1 below panel 0').toBeGreaterThan(b0!.y);
    expect(Math.abs(b1!.x - b0!.x), 'stacked: panels share the same column x').toBeLessThan(2);
  });

  test('3. tapping a correct difference draws green circles + score +1', async ({ page }) => {
    await startGame(page, '找不同', '仅官方题目');
    const title = await currentTitle(page);
    const diffs = OFFICIAL_SPOT_DIFF[title]!;
    expect(await hudScore(page)).toBe(0);

    await tapNativePoint(page, 0, diffCenter(diffs[0]!));
    // Green marker on BOTH panels for the shared found index.
    await expect(page.locator('.image-panel-marker')).toHaveCount(2);
    await expect(page.getByTestId('hud-score')).toHaveText('得分 1');
    expect(await hudScore(page)).toBe(1);
  });

  test('4. tapping a wrong spot shows the red ✕ and subtracts 10 seconds', async ({ page }) => {
    await startGame(page, '找不同', '仅官方题目');
    const title = await currentTitle(page);
    const diffs = OFFICIAL_SPOT_DIFF[title]!;

    // A wrong tap never changes the correct-position score.
    await tapNativePoint(page, 0, diffCenter(diffs[0]!));
    await expect(page.locator('.image-panel-marker')).toHaveCount(2);

    await tapNativePoint(page, 0, SAFE_NATIVE_POINT);
    // Viewport-fixed error card makes the time penalty readable.
    await expect(page.locator('.wrong-mark')).toBeVisible();
    await expect(page.locator('.wrong-mark')).toContainText('点错啦');
    await expect(page.locator('.wrong-mark')).toContainText('−10 秒');
    await expect(page.getByTestId('hud-score')).toHaveText('得分 1');
    expect(await hudScore(page)).toBe(1);

    // The strengthened feedback holds long enough to read, then dismisses.
    await page.waitForTimeout(900);
    await expect(page.locator('.wrong-mark')).toBeVisible();
    await page.waitForTimeout(700);
    await expect(page.locator('.wrong-mark')).toHaveCount(0);
  });

  test('5. finding all differences → 本关完成 → result screen after the last question', async ({
    page,
  }) => {
    await startGame(page, '找不同', '仅官方题目');
    await playGameToResult(page, OFFICIAL_SPOT_DIFF, 2);
    await expect(page.getByTestId('result-score')).toBeVisible();
    await expect(page.getByTestId('result-accuracy')).toHaveText('准确率 100%');
    // Zero wrong taps → zero missed differences.
    await expect(page.locator('[data-testid="result-item-missed"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="result-item-found"]').first()).toBeVisible();
  });

  test('6. 再来一局 returns to the menu', async ({ page }) => {
    await startGame(page, '区域识别', '仅官方题目');
    await playGameToResult(page, OFFICIAL_FIND_AREA, 1);
    await expect(page.getByTestId('result-score')).toBeVisible();

    await tapLocator(page, page.getByTestId('result-replay'));
    await expect(page.locator('.menu')).toBeVisible();
    await expect(page.locator('.mode-card')).toHaveCount(2);
    // Modes are direct commands; source resets to the official default.
    await expect(page.locator('.menu__start')).toHaveCount(0);
    await expect(page.locator('.source-toggle__option--official')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.locator('.mode-card--entry')).toHaveCount(2);
  });

  test('7. find_area mode renders a single image + title/description', async ({ page }) => {
    await startGame(page, '区域识别', '仅官方题目');
    await expect(page.locator('.game-panels--single')).toHaveCount(1);
    await expect(page.locator('.game-panels > .image-panel')).toHaveCount(1);
    await expect(page.locator('.game-panels img.image-panel-img')).toHaveCount(1);

    const title = await currentTitle(page);
    expect(Object.keys(OFFICIAL_FIND_AREA)).toContain(title);
    const description = await page.getByTestId('question-description').textContent();
    expect(description !== null && description.trim().length > 0).toBe(true);
  });

  test('8. find_area: tapping a zone draws the green circle + score +1', async ({ page }) => {
    await startGame(page, '区域识别', '仅官方题目');
    const title = await currentTitle(page);
    const diffs = OFFICIAL_FIND_AREA[title]!;
    expect(await hudScore(page)).toBe(0);

    await tapNativePoint(page, 0, diffCenter(diffs[0]!));
    await expect(page.locator('.image-panel-marker')).toHaveCount(1);
    await expect(page.getByTestId('hud-score')).toHaveText('得分 1');
  });

  test('8b. touch swipe scrolls a tall image without judging; a post-scroll tap stays accurate', async ({
    page,
    context,
  }) => {
    const target: Point = { x: 400, y: 1200 };
    await context.route('https://touch-scroll.test/**', (route) =>
      route.fulfill({ status: 200, contentType: 'image/png', body: PNG_800x1600 }),
    );
    await context.route('**/api/questions?**', (route) =>
      route.fulfill({
        json: [
          {
            id: 'touch-scroll-regression',
            mode: 'find_area',
            title: '触屏滚动回归测试',
            description: '上滑只滚动，轻点才作答。',
            imageA: 'https://touch-scroll.test/tall.png',
            differences: [{ type: 'circle', ...target, radius: 40 }],
            showCount: true,
            source: 'official',
            authorName: 'E2E',
            status: 'approved',
            likes: 0,
            dislikes: 0,
            createdAt: new Date().toISOString(),
          },
        ],
      }),
    );

    await startGame(page, '区域识别', '仅官方题目');
    const img = page.locator('.game-panels img.image-panel-img');
    const { naturalW, naturalH } = await loadedImageBox(img);
    expect({ naturalW, naturalH }).toEqual({ naturalW: 800, naturalH: 1600 });

    const overlay = page.locator('.image-panel-overlay');
    await expect(overlay).toHaveCSS('touch-action', 'pan-y pinch-zoom');
    await page.evaluate(() => window.scrollTo(0, 0));
    const box = await overlay.boundingBox();
    if (box === null) throw new Error('touch overlay has no bounding box');

    // Send a trusted touch stream through Chromium's gesture recognizer. It
    // must pan the document and must not call onHit/onMiss on release.
    const cdp = await context.newCDPSession(page);
    const x = box.x + box.width / 2;
    const startY = Math.min(box.y + box.height * 0.75, 720);
    const beforeScrollY = await page.evaluate(() => window.scrollY);
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x, y: startY, id: 1, radiusX: 2, radiusY: 2, force: 1 }],
    });
    for (const delta of [30, 70, 120, 180]) {
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [
          { x, y: startY - delta, id: 1, radiusX: 2, radiusY: 2, force: 1 },
        ],
      });
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });

    await expect
      .poll(() => page.evaluate(() => window.scrollY))
      .toBeGreaterThan(beforeScrollY + 20);
    await expect(page.getByTestId('hud-score')).toHaveText('得分 0');
    await expect(page.locator('.wrong-mark')).toHaveCount(0);
    await expect(page.locator('.image-panel-marker')).toHaveCount(0);

    // This measurement happens after scrolling. ImagePanel must likewise use
    // the live viewport rect (scroll does not trigger ResizeObserver).
    await tapNativePoint(page, 0, target);
    await expect(page.locator('.image-panel-marker')).toHaveCount(1);
    await expect.poll(() => hudScore(page)).toBe(1);
  });

  test('8c. mobile crop handles support an exact 200×1920 → 200×100 crop', async ({ page }) => {
    await page.goto('/');
    await tapLocator(page, page.locator('.menu__workshop'));
    await page.locator('.workshop-upload__input').nth(0).setInputFiles({
      name: 'strip.png',
      mimeType: 'image/png',
      buffer: PNG_200x1920,
    });
    const dialog = page.getByRole('dialog', { name: '裁切图片 A' });
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('.image-adjust__handle')).toHaveCount(4);
    await dialog.getByLabel('宽').fill('200');
    await dialog.getByLabel('高').fill('100');
    await tapLocator(page, dialog.getByRole('button', { name: '应用裁切' }));
    const editorImage = page.locator('.workshop-editor__img');
    await expect.poll(() => editorImage.evaluate((node) => ({
      width: (node as HTMLImageElement).naturalWidth,
      height: (node as HTMLImageElement).naturalHeight,
    }))).toEqual({ width: 200, height: 100 });
  });

  test('8d. workshop invalid submit stays actionable, summarizes gaps, and focuses the first error', async ({ page }) => {
    let requests = 0;
    await page.route('**/api/workshop', async (route) => {
      requests += 1;
      await route.fulfill({ status: 201, json: { id: 'should-not-submit' } });
    });
    await page.goto('/');
    await tapLocator(page, page.locator('.menu__workshop'));

    const submit = page.locator('.workshop-form__submit');
    await expect(submit).toBeEnabled();
    await expect(page.locator('.workshop-readiness__item')).toHaveCount(3);
    await expect(page.locator('.workshop-readiness__item--complete')).toHaveCount(0);
    await expect(page.getByText('JPEG、PNG、WebP 和 iPhone HEIC')).toBeVisible();
    for (const label of ['题目标题', '题目描述', '昵称', '图片 A（基准图）', '图片 B（对照图）']) {
      await expect(page.locator('.field__label', { hasText: label }).getByText('必填', { exact: true })).toBeVisible();
    }

    await submit.scrollIntoViewIfNeeded();
    await tapLocator(page, submit);
    expect(requests).toBe(0);
    await expect(page.locator('.toast--error')).toContainText('还有 3 组内容未完成');
    await expect(page.locator('#workshop-title')).toBeFocused();
    await expect.poll(async () => {
      const box = await page.locator('#workshop-title').boundingBox();
      return box !== null && box.y >= 0 && box.y + box.height <= 812;
    }).toBe(true);

    await page.fill('#workshop-title', '测试题');
    await page.fill('#workshop-desc', '找出不同');
    await page.fill('#workshop-author', '小明');
    await page.locator('#workshop-author').blur();
    await expect(page.locator('.workshop-readiness__item--complete')).toHaveCount(1);
    await expect(submit).toBeEnabled();
  });

  test('8e. >5MiB PNG is optimized before state and remains safe when crop is cancelled', async ({ page }) => {
    const largePng = generateLargePng(1400, 1400);
    expect(largePng.byteLength).toBeGreaterThan(5 * 1024 * 1024);
    let submittedBody: Buffer | null = null;
    await page.route('**/api/workshop', async (route) => {
      submittedBody = route.request().postDataBuffer();
      await route.fulfill({ status: 201, json: { id: 'compressed-e2e' } });
    });

    await page.goto('/');
    await tapLocator(page, page.locator('.menu__workshop'));
    await tapLocator(page, page.locator('.mode-card', { hasText: '区域识别' }));
    await page.fill('#workshop-title', '大图压缩测试');
    await page.fill('#workshop-desc', '验证手机大图自动处理');
    await page.fill('#workshop-author', '测试员');
    await page.locator('#workshop-image-a').setInputFiles({
      name: 'large.png',
      mimeType: 'image/png',
      buffer: largePng,
    });
    const dialog = page.getByRole('dialog', { name: '裁切图片 A' });
    await expect(dialog).toBeVisible({ timeout: 30_000 });
    await tapLocator(page, dialog.getByRole('button', { name: '取消' }));
    await expect(page.locator('.workshop-upload__status')).toContainText('已自动优化');

    const overlay = page.locator('.workshop-editor__overlay');
    await expect(overlay).toBeVisible();
    await overlay.click({ position: { x: 100, y: 100 } });
    await tapLocator(page, page.locator('.workshop-form__submit'));
    await expect(page.locator('.toast--success')).toContainText('投稿成功');
    expect(submittedBody).not.toBeNull();
    // 4.8 MiB image target leaves room for multipart fields under 5 MiB.
    expect(submittedBody!.byteLength).toBeLessThan(5 * 1024 * 1024);
    const multipartHead = submittedBody!.subarray(0, Math.min(submittedBody!.length, 4096)).toString('latin1');
    expect(multipartHead).toContain('name="mode"');
  });

  test.describe.serial('workshop loop (auto-approve, no admin step)', () => {
    test('9. workshop submit: fill form + upload images → success toast', async ({ page }) => {
      const title = `E2E 提交 ${Date.now()}`;
      workshopSubmission = await submitWorkshopViaUI(page, {
        title,
        description: '找出两张图中的不同之处，点击即可。',
        author: 'E2E测试员',
      });
      // Re-assign through the shared slot only after the toast confirms 201.
      expect(workshopSubmission.title).toBe(title);
    });

    test('10. submitted question is auto-approved and immediately playable (end-to-end)', async ({
      page,
      context,
      request,
    }) => {
      test.info().annotations.push({
        type: 'end-to-end',
        description: 'workshop submit → auto-approve → appears in game pool → playable',
      });
      // Fallback for running this scenario in isolation: submit via the real
      // API (same backend/R2/D1 path) so the loop remains self-sufficient.
      if (workshopSubmission === null) {
        const response = await request.post('http://localhost:8080/api/workshop', {
          multipart: {
            mode: 'spot_diff',
            title: 'E2E 独立提交',
            description: '找出两张图中的不同之处。',
            differences: JSON.stringify([{ type: 'circle', x: 400, y: 300, radius: 30 }]),
            show_count: 'true',
            author_name: 'E2E测试员',
            author_id: 'e2e-fallback-user',
            image_a: { name: 'a.png', mimeType: 'image/png', buffer: PNG_800x600 },
            image_b: { name: 'b.png', mimeType: 'image/png', buffer: PNG_800x600_VARIANT },
          },
        });
        expect(response.ok()).toBe(true);
        const body = (await response.json()) as { id: string; status: string };
        expect(body.status).toBe('approved'); // auto-approve — NO admin step
        workshopSubmission = {
          title: 'E2E 独立提交',
          native: { x: 400, y: 300 },
        };
      }

      const submitted = workshopSubmission;

      // Fresh page → menu (scenario 9 left the app on the workshop screen;
      // each test gets its own context, so the "back to menu" step is the
      // fresh load — the submission itself lives in D1/R2, not the DOM).
      await page.goto('/');
      await expect(page.locator('.menu')).toBeVisible();

      // Prove the submission is in the PUBLIC pool straight from the real
      // backend (request fixture is not subject to page routing) — the
      // auto-approve, NO-admin-step proof. count=100 neutralizes RANDOM()
      // (far above the total spot_diff count).
      const poolResponse = await request.get(
        'http://localhost:8080/api/questions?mode=spot_diff&source=mixed&count=100',
      );
      expect(poolResponse.ok()).toBe(true);
      const pool = (await poolResponse.json()) as Array<{ title: string }>;
      const approvedCopy = pool.filter((q) => q.title === submitted.title);
      expect(
        approvedCopy.length,
        'submitted question missing from the auto-approved pool',
      ).toBeGreaterThan(0);

      // Hand the app ONLY the freshly submitted question (deterministic play
      // regardless of RANDOM() order) — everything else stays real.
      await context.route('**/api/questions?**', (route) =>
        route.fulfill({ json: approvedCopy }),
      );

      // 包含创意工坊 + same mode (spot_diff) → start a NEW game.
      await tapLocator(page, page.locator('.source-toggle__option', { hasText: '包含创意工坊' }));
      await tapLocator(page, page.locator('.mode-card--entry', { hasText: '找不同' }));

      await expect(page.getByTestId('question-title')).toHaveText(submitted.title);

      // Its approved images load through the REAL no-D1 public image route (R2).
      const imgs = page.locator('.game-panels img.image-panel-img');
      await expect(imgs).toHaveCount(2);
      for (let i = 0; i < 2; i++) {
        await expect(imgs.nth(i)).toHaveAttribute('src', /\/public-images\/approved\//);
        const { naturalW, naturalH } = await loadedImageBox(imgs.nth(i));
        expect(naturalW).toBe(800);
        expect(naturalH).toBe(600);
      }

      // PLAYABLE: tap the authored difference → green markers + score.
      await tapNativePoint(page, 0, submitted.native);
      await expect(page.locator('.image-panel-marker')).toHaveCount(2);
      expect(await hudScore(page)).toBe(1);

      // Single-question round → 本关完成 → result.
      await expect(page.locator('.round-end')).toBeVisible();
      await expect(page.getByTestId('result-score')).toBeVisible({ timeout: 10_000 });
    });
  });

  test('11. BGM: collapsed player visible; NO autoplay before gesture; tap play → playing', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.locator('.menu')).toBeVisible();

    const toggle = page.locator('.bgm-player__toggle');
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-label', '打开音乐面板');

    // NO autoplay: the single <audio> element is paused before ANY gesture.
    const pausedOnLoad = await page.evaluate(() => document.querySelector('audio')?.paused ?? true);
    expect(pausedOnLoad).toBe(true);

    await tapLocator(page, toggle);
    await expect(page.locator('.bgm-player__panel')).toBeVisible();
    // Expanding the panel must not start playback either.
    const pausedAfterExpand = await page.evaluate(
      () => document.querySelector('audio')?.paused ?? true,
    );
    expect(pausedAfterExpand).toBe(true);

    await tapLocator(page, page.locator('.bgm-player__btn--main'));
    // Real playback state, not just UI text (misleading-success probe).
    await expect
      .poll(() => page.evaluate(() => !(document.querySelector('audio')?.paused ?? true)), {
        timeout: 5_000,
      })
      .toBe(true);
    await expect(toggle).toHaveClass(/is-playing/);

    // Pause still works — the loop stays under user control.
    await tapLocator(page, page.locator('.bgm-player__btn--main'));
    await expect
      .poll(() => page.evaluate(() => document.querySelector('audio')?.paused ?? true))
      .toBe(true);
  });
});
