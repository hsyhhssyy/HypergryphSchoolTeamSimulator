/**
 * responsive-layout E2E — todo 7 (home-title-image-responsive).
 * Playwright Chromium, desktop 1280×800, MOUSE ONLY (chromium-desktop
 * project; see playwright.config.ts scoping).
 *
 * Asserts the todo-2/3/4 layout contract at the DESKTOP viewport:
 *   (a) menu title wordmark image (alt + real decode + document title);
 *   (b) spot_diff panels SIDE-BY-SIDE (panel[1].x > panel[0].x + a computed
 *       two-track grid);
 *   (c) tapping panel index 1 (the RIGHT panel) on a known seed difference
 *       registers the hit (green markers + score) — proves the SECOND
 *       panel's hit detection at the desktop layout;
 *   (d) find_area stays single-column (`.game-panels--single` + computed
 *       gridTemplateColumns resolves to ONE track);
 *   (e) mobile portrait stacks — implemented HERE as a per-test
 *       `test.use({ viewport: 375×812, hasTouch, isMobile })` override
 *       (MUST DO option (i)) so a `--project=chromium-desktop` run alone
 *       still covers the stacked geometry; the chromium-mobile suite
 *       additionally asserts stacking in its scenario 2. Option (i) chosen
 *       over (ii)-only because the plan lists (e) under this spec AND the
 *       per-test override keeps both project runs green without adding a
 *       touch dependency to the mouse-driven scenarios.
 *
 * Determinism strategy (inherited from the h5-spot-diff-game suite — see its
 * header): picsum.photos route-mocked with locally generated REAL PNGs
 * (800×600), taps computed at runtime from the laid-out <img> box + natural
 * dims + the SAME `computeContainTransform` math as src/utils/hitDetection.ts
 * against the known seed differences (image-NATIVE pixels). The contain
 * math, seed tables, PNG generator, and interaction helpers are MIRRORED
 * here on purpose — importing from the h5 spec would REGISTER its 11 tests
 * in this project (a spec file's top-level `test()` calls run on import).
 *
 * Run: seed local D1 first (see playwright.config.ts header), then
 *      npx playwright test --project=chromium-desktop
 */
import { test, expect, type Page, type Locator } from '@playwright/test';
import { deflateSync } from 'node:zlib';

// ————————— tiny real-PNG generator (mirror of h5-spot-diff-game.spec.ts) ———

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

function generatePng(width: number, height: number, variant = 0): Buffer {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
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

const PNG_800x600 = generatePng(800, 600, 0);

// ————————— contain-transform math + seed data (mirror of the h5 spec) ———————

interface Point {
  x: number;
  y: number;
}

interface ContainTransform {
  scale: number;
  offsetX: number;
  offsetY: number;
}

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

function toDisplayPoint(nativeX: number, nativeY: number, t: ContainTransform): Point {
  return { x: nativeX * t.scale + t.offsetX, y: nativeY * t.scale + t.offsetY };
}

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

// ————————————————————— device-agnostic helpers (mirror) ——————————————————————

async function hasTouch(page: Page): Promise<boolean> {
  return page.evaluate(() => navigator.maxTouchPoints > 0);
}

async function tapAt(page: Page, x: number, y: number): Promise<void> {
  if (await hasTouch(page)) await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
}

async function tapLocator(page: Page, locator: Locator): Promise<void> {
  if (await hasTouch(page)) await locator.tap();
  else await locator.click();
}

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

async function currentTitle(page: Page): Promise<string> {
  const title = await page.getByTestId('question-title').textContent();
  if (title === null || title.trim() === '') throw new Error('question-title is empty');
  return title.trim();
}

async function hudScore(page: Page): Promise<number> {
  const text = await page.getByTestId('hud-score').textContent();
  const match = /得分\s*(\d+)/.exec(text ?? '');
  if (match === null) throw new Error(`cannot parse hud score from: ${text}`);
  return Number(match[1]);
}

async function startGame(
  page: Page,
  modeLabel: '找不同' | '区域识别',
  sourceLabel: '仅官方题目' | '包含创意工坊',
): Promise<void> {
  await page.goto('/');
  await expect(page.locator('.menu')).toBeVisible();
  const modeCard = page.locator('.mode-card', { hasText: modeLabel });
  await tapLocator(page, modeCard);
  await expect(modeCard).toHaveAttribute('aria-pressed', 'true');
  const sourceOption = page.locator('.source-toggle__option', { hasText: sourceLabel });
  await tapLocator(page, sourceOption);
  await expect(sourceOption).toHaveAttribute('aria-pressed', 'true');
  await Promise.all([
    page.waitForRequest((r) => r.url().includes('/api/questions?')),
    tapLocator(page, page.locator('.menu__start')),
  ]);
  await expect(page.locator('.hud')).toBeVisible();
}

// —————————————————————————————— fixtures / specs —————————————————————————————

test.beforeEach(async ({ context }) => {
  await context.route('https://picsum.photos/**', (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: PNG_800x600 }),
  );
});

test.describe('responsive-layout (chromium-desktop, 1280×800, mouse)', () => {
  test('a. menu title wordmark: visible, correct alt, real decode, document title', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.locator('.menu')).toBeVisible();

    const titleImg = page.locator('.menu__title-img');
    await expect(titleImg).toBeVisible();
    await expect(titleImg).toHaveAttribute('alt', '鹰角网络校队');
    // Real decode, not just markup: the WebP/png wordmark must actually load.
    await expect
      .poll(() => titleImg.evaluate((el) => (el as HTMLImageElement).naturalWidth), {
        timeout: 15_000,
      })
      .toBeGreaterThan(0);
    await expect(page).toHaveTitle('鹰角网络校队 · 答题小游戏');
  });

  test('b. spot_diff desktop: panels SIDE-BY-SIDE (panel[1].x > panel[0].x, two grid tracks)', async ({
    page,
  }) => {
    await startGame(page, '找不同', '仅官方题目');
    const panels = page.locator('.game-panels > .image-panel');
    await expect(panels).toHaveCount(2);

    const imgs = page.locator('.game-panels img.image-panel-img');
    for (let i = 0; i < 2; i++) await loadedImageBox(imgs.nth(i));

    const b0 = await panels.nth(0).boundingBox();
    const b1 = await panels.nth(1).boundingBox();
    expect(b0, 'panel 0 has a box').not.toBeNull();
    expect(b1, 'panel 1 has a box').not.toBeNull();
    expect(b1!.x, 'desktop: right panel sits to the RIGHT of the left panel').toBeGreaterThan(
      b0!.x,
    );
    expect(Math.abs(b1!.y - b0!.y), 'desktop: panels share the same row y').toBeLessThan(2);
    // Real geometry, not just the boxes: the computed grid has TWO tracks.
    const tracks = await page
      .locator('.game-panels')
      .evaluate((el) => getComputedStyle(el).gridTemplateColumns);
    expect(tracks.split(/\s+/).filter(Boolean).length, 'computed grid has 2 tracks').toBe(2);
  });

  test('c. desktop: tapping the RIGHT panel (index 1) registers the seed difference', async ({
    page,
  }) => {
    await startGame(page, '找不同', '仅官方题目');
    const title = await currentTitle(page);
    const diffs = OFFICIAL_SPOT_DIFF[title]!;
    expect(await hudScore(page)).toBe(0);

    // Native seed coord tapped on the SECOND panel — mouse-driven (hasTouch
    // is false here, tapAt dispatches page.mouse.click).
    await tapNativePoint(page, 1, diffCenter(diffs[0]!));
    await expect(page.locator('.image-panel-marker')).toHaveCount(2);
    await expect(page.getByTestId('hud-score')).toHaveText('得分 100');
    expect(await hudScore(page)).toBe(100);
  });

  test('d. find_area desktop: single column (--single modifier + one computed track)', async ({
    page,
  }) => {
    await startGame(page, '区域识别', '仅官方题目');
    await expect(page.locator('.game-panels--single')).toHaveCount(1);
    await expect(page.locator('.game-panels > .image-panel')).toHaveCount(1);
    const tracks = await page
      .locator('.game-panels')
      .evaluate((el) => getComputedStyle(el).gridTemplateColumns);
    expect(tracks.split(/\s+/).filter(Boolean).length, 'computed grid has exactly 1 track').toBe(1);
  });

  // Mobile stacked geometry — MUST DO option (i): a per-test viewport/touch
  // override INSIDE this spec (runs under chromium-desktop) so a desktop
  // project run alone still proves the stacked mobile contract. The
  // chromium-mobile suite asserts the same stacking in its scenario 2.
  test.describe('mobile stacked geometry (per-test 375×812 + touch override)', () => {
    test.use({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });

    test('e. spot_diff portrait: panels STACK vertically (panel[1].y > panel[0].y)', async ({
      page,
    }) => {
      await startGame(page, '找不同', '仅官方题目');
      const panels = page.locator('.game-panels > .image-panel');
      await expect(panels).toHaveCount(2);

      const imgs = page.locator('.game-panels img.image-panel-img');
      for (let i = 0; i < 2; i++) await loadedImageBox(imgs.nth(i));

      const b0 = await panels.nth(0).boundingBox();
      const b1 = await panels.nth(1).boundingBox();
      expect(b0, 'panel 0 has a box').not.toBeNull();
      expect(b1, 'panel 1 has a box').not.toBeNull();
      expect(b1!.y, 'mobile: panel 1 BELOW panel 0').toBeGreaterThan(b0!.y);
      expect(Math.abs(b1!.x - b0!.x), 'mobile: panels share the same column x').toBeLessThan(2);
    });
  });
});
