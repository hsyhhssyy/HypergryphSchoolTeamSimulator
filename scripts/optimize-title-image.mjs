#!/usr/bin/env node
/**
 * Title-image asset optimizer — Task 1 (home-title-image-responsive plan).
 *
 * One-shot converter that turns the original design PNG
 * (public/鹰角网络校队-字标.png, ~2.4 MB) into two web-optimized,
 * ASCII-named committed assets:
 *
 *   - public/wordmark.webp  (1240px wide, WebP q82 — alpha preserved)
 *   - public/wordmark.png   (1280px wide, palette PNG q90 — alpha preserved)
 *
 * NOTE on the webp width: the plan originally specified width 1600 @ q82,
 * but that yields 274 KB — over the plan-wide hard cap of 200 KB
 * (`wordmark.webp < 204800` is an acceptance criterion in todos 1 and 8).
 * Per todo 8's remedy ("re-run optimizer at lower quality"), the encoder
 * params are adjusted: quality stays 82 (lossless-to-human-eyes for this
 * wordmark) and width drops to 1240, which lands at ~191 KB — still ~2x the
 * largest display width (min(640px, 60vw) from todo 4), i.e. retina-sharp.
 *
 * The original PNG is never modified or referenced by app code; it stays an
 * untracked design artifact. Run from anywhere: paths resolve relative to
 * this repo via fileURLToPath(import.meta.url).
 *
 * Usage: node scripts/optimize-title-image.mjs
 * Output: public/wordmark.webp, public/wordmark.png
 */
import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const INPUT = join(ROOT, 'public', '鹰角网络校队-字标.png');

const TARGETS = [
  { out: 'public/wordmark.webp', width: 1240, encode: (img) => img.webp({ quality: 82 }) },
  { out: 'public/wordmark.png', width: 1280, encode: (img) => img.png({ palette: true, compressionLevel: 9, quality: 90 }) },
];

/** Magic-byte fingerprint check: WebP = RIFF....WEBP, PNG = \x89PNG. */
function verifyMagic(out) {
  const bytes = readFileSync(join(ROOT, out));
  const isWebp =
    bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
    bytes.subarray(8, 12).toString('ascii') === 'WEBP';
  const isPng = bytes.subarray(0, 4).toString('hex') === '89504e47';
  if (!isWebp && !isPng) {
    throw new Error(`${out}: magic bytes match neither WebP nor PNG`);
  }
  return isWebp ? 'webp' : 'png';
}

if (!existsSync(INPUT)) {
  process.stderr.write(
    `error: input not found: ${INPUT}\n` +
      'Run once from the repo containing public/鹰角网络校队-字标.png. No output written.\n',
  );
  process.exitCode = 1;
} else {
  // Verify the input is a readable image before writing any output.
  await sharp(INPUT).metadata();

  for (const { out, width, encode } of TARGETS) {
    const file = join(ROOT, out);
    const info = await encode(sharp(INPUT).resize({ width })).toFile(file);
    verifyMagic(out);
    const kb = (info.size / 1024).toFixed(0);
    console.log(`wrote ${out} (${kb} KB, ${info.width}px wide)`);
  }

  // Never leave a partial set: if any target failed, clean up what we wrote.
  for (const { out } of TARGETS) {
    const file = join(ROOT, out);
    if (!existsSync(file)) {
      process.stderr.write(`error: ${out} was not produced; removing partial outputs\n`);
      for (const { out: other } of TARGETS) {
        const f = join(ROOT, other);
        if (existsSync(f)) unlinkSync(f);
      }
      process.exitCode = 1;
      break;
    }
  }
}
