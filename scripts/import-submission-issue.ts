import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { strFromU8, unzipSync } from 'fflate';
import sharp from 'sharp';
import { z } from 'zod';
import { differencesSchema, questionModeSchema, questionSchema, type Difference } from '../shared/types.ts';

const MAX_ZIP_BYTES = 80 * 1024 * 1024;
const MAX_EXPANDED_BYTES = 200 * 1024 * 1024;
const MAX_FILE_BYTES = 45 * 1024 * 1024;
const MAX_FILES = 60;
const MARKER = '<!-- submission-preview -->';

const submittedQuestionSchema = z.object({
  mode: questionModeSchema,
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(200),
  imageA: z.string().min(1),
  imageB: z.string().min(1).optional(),
  differences: differencesSchema,
  showCount: z.boolean(),
});

const submissionSchema = z.object({
  formatVersion: z.literal(1),
  authorName: z.string().trim().min(2).max(20),
  questions: z.array(submittedQuestionSchema).min(1).max(20),
});

interface IssueEvent {
  issue: { number: number; body: string | null; created_at: string };
  repository: { full_name: string };
}

function fail(message: string): never { throw new Error(`投稿处理失败：${message}`); }

function safeZipPath(value: string): string {
  const normalized = value.replaceAll('\\', '/');
  if (normalized.includes('\0') || normalized.startsWith('/') || normalized.split('/').some((part) => part === '..' || part === '')) {
    fail(`ZIP 包含不安全路径：${value}`);
  }
  return normalized;
}

function attachmentUrl(body: string): URL {
  const candidates = [...body.matchAll(/https:\/\/[^\s)>]+/g)].map((match) => match[0]!.replace(/[.,]+$/, ''));
  const candidate = candidates.find((value) => /\.zip(?:\?|$)/i.test(value));
  if (candidate === undefined) fail('Issue 中没有找到 .zip 附件链接');
  const url = new URL(candidate);
  const allowed = url.hostname === 'github.com' || url.hostname.endsWith('.githubusercontent.com');
  if (!allowed || url.protocol !== 'https:') fail(`不允许的附件地址：${url.hostname}`);
  return url;
}

async function download(url: URL, token: string): Promise<Uint8Array> {
  const response = await fetch(url, {
    redirect: 'follow',
    headers: { Accept: 'application/octet-stream', Authorization: `Bearer ${token}`, 'User-Agent': 'submission-import-action' },
  });
  if (!response.ok) fail(`附件下载失败（HTTP ${response.status}）`);
  const declared = Number(response.headers.get('content-length') ?? 0);
  if (declared > MAX_ZIP_BYTES) fail(`ZIP 超过 ${MAX_ZIP_BYTES / 1024 / 1024}MB`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > MAX_ZIP_BYTES) fail(`ZIP 超过 ${MAX_ZIP_BYTES / 1024 / 1024}MB`);
  return bytes;
}

function extract(bytes: Uint8Array): Record<string, Uint8Array> {
  let count = 0;
  let expanded = 0;
  const files = unzipSync(bytes, {
    filter(info) {
      safeZipPath(info.name);
      count += 1;
      expanded += info.originalSize;
      if (count > MAX_FILES) fail(`ZIP 文件数量超过 ${MAX_FILES}`);
      if (info.originalSize > MAX_FILE_BYTES) fail(`文件 ${info.name} 解压后过大`);
      if (expanded > MAX_EXPANDED_BYTES) fail('ZIP 解压后总体积过大');
      return !info.name.endsWith('/');
    },
  });
  const result: Record<string, Uint8Array> = Object.create(null) as Record<string, Uint8Array>;
  let actualSize = 0;
  for (const [unsafeName, data] of Object.entries(files)) {
    const name = safeZipPath(unsafeName);
    if (result[name] !== undefined) fail(`ZIP 路径规范化后重复：${name}`);
    actualSize += data.byteLength;
    if (data.byteLength > MAX_FILE_BYTES || actualSize > MAX_EXPANDED_BYTES) fail('ZIP 实际解压体积超过限制');
    result[name] = data;
  }
  return result;
}

function markdown(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('|', '\\|');
}

function overlaySvg(width: number, height: number, differences: readonly Difference[]): Buffer {
  const stroke = Math.max(4, Math.round(Math.min(width, height) / 150));
  const labelRadius = Math.max(15, Math.round(Math.min(width, height) / 32));
  const shapes = differences.map((difference, index) => {
    const number = index + 1;
    const shape = difference.type === 'circle'
      ? `<circle cx="${difference.x}" cy="${difference.y}" r="${difference.radius}"/>`
      : `<rect x="${difference.x}" y="${difference.y}" width="${difference.width}" height="${difference.height}" rx="${stroke}"/>`;
    const x = difference.type === 'circle' ? difference.x : difference.x + difference.width / 2;
    const y = difference.type === 'circle' ? difference.y : difference.y + difference.height / 2;
    return `${shape}<circle class="label" cx="${x}" cy="${y}" r="${labelRadius}"/><text x="${x}" y="${y}" dy=".36em">${number}</text>`;
  }).join('');
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><style>circle:not(.label),rect{fill:#ff2d5538;stroke:#fff;stroke-width:${stroke * 3};paint-order:stroke;vector-effect:non-scaling-stroke}circle:not(.label),rect{stroke:#ff2d55;stroke-width:${stroke}}.label{fill:#ff2d55;stroke:#fff;stroke-width:${stroke}}text{fill:#fff;font:700 ${labelRadius * 1.25}px sans-serif;text-anchor:middle}</style>${shapes}</svg>`);
}

async function checkedImage(data: Uint8Array, label: string): Promise<{ extension: string; width: number; height: number }> {
  const metadata = await sharp(data).metadata().catch(() => fail(`${label} 不是有效图片`));
  if (!['jpeg', 'png', 'webp'].includes(metadata.format ?? '')) fail(`${label} 仅允许 JPEG、PNG 或 WebP`);
  if (metadata.width === undefined || metadata.height === undefined) fail(`无法读取 ${label} 的尺寸`);
  if (metadata.width > 12000 || metadata.height > 12000 || metadata.width * metadata.height > 50_000_000) fail(`${label} 像素尺寸过大`);
  const extension = metadata.format === 'jpeg' ? 'jpg' : metadata.format!;
  return { extension, width: metadata.width, height: metadata.height };
}

function assertBounds(differences: readonly Difference[], width: number, height: number, id: string): void {
  for (const difference of differences) {
    const inside = difference.type === 'circle'
      ? difference.x - difference.radius >= 0 && difference.y - difference.radius >= 0 && difference.x + difference.radius <= width && difference.y + difference.radius <= height
      : difference.x + difference.width <= width && difference.y + difference.height <= height;
    if (!inside) fail(`${id} 的答案区域超出图片边界`);
  }
}

async function main(): Promise<void> {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  const token = process.env.GITHUB_TOKEN;
  if (eventPath === undefined) fail('缺少 GitHub 事件环境变量');
  const event = JSON.parse(await readFile(eventPath, 'utf8')) as IssueEvent;
  const issue = event.issue.number;
  const localZip = process.env.SUBMISSION_ZIP_PATH;
  const zipBytes = localZip === undefined
    ? await download(attachmentUrl(event.issue.body ?? ''), token ?? fail('缺少 GitHub 令牌'))
    : new Uint8Array(await readFile(localZip));
  if (zipBytes.byteLength > MAX_ZIP_BYTES) fail(`ZIP 超过 ${MAX_ZIP_BYTES / 1024 / 1024}MB`);
  const files = extract(zipBytes);
  const manifestBytes = files['submission.json'];
  if (manifestBytes === undefined) fail('ZIP 根目录缺少 submission.json');
  let rawManifest: unknown;
  try { rawManifest = JSON.parse(strFromU8(manifestBytes)); } catch { fail('submission.json 不是有效 JSON'); }
  const parsed = submissionSchema.safeParse(rawManifest);
  if (!parsed.success) fail(parsed.error.issues.map((item) => `${item.path.join('.')}: ${item.message}`).join('；'));

  const root = path.resolve(import.meta.dirname, '..');
  const previewDirectory = path.join(root, `.github/submission-previews/issue-${issue}`);
  await rm(previewDirectory, { recursive: true, force: true });
  await mkdir(previewDirectory, { recursive: true });
  const sections: string[] = [];

  for (const [index, submitted] of parsed.data.questions.entries()) {
    const id = `submission-${issue}-${String(index + 1).padStart(2, '0')}`;
    if (submitted.mode === 'spot_diff' && submitted.imageB === undefined) fail(`${id} 缺少图片 B`);
    if (submitted.mode === 'find_area' && submitted.imageB !== undefined) fail(`${id} 不应包含图片 B`);
    const imageAData = files[safeZipPath(submitted.imageA)];
    const imageBData = submitted.imageB === undefined ? undefined : files[safeZipPath(submitted.imageB)];
    if (imageAData === undefined) fail(`${id} 找不到图片 A`);
    if (submitted.imageB !== undefined && imageBData === undefined) fail(`${id} 找不到图片 B`);

    const imageA = await checkedImage(imageAData, `${id} 图片 A`);
    const imageB = imageBData === undefined ? undefined : await checkedImage(imageBData, `${id} 图片 B`);
    if (imageB !== undefined && (imageA.width !== imageB.width || imageA.height !== imageB.height)) fail(`${id} 的 A、B 图片尺寸不一致`);
    assertBounds(submitted.differences, imageA.width, imageA.height, id);

    const itemDirectory = path.join(root, `public/questions/items/${id}`);
    await rm(itemDirectory, { recursive: true, force: true });
    await mkdir(itemDirectory, { recursive: true });
    const imageAName = `a.${imageA.extension}`;
    const imageBName = imageB === undefined ? undefined : `b.${imageB.extension}`;
    await writeFile(path.join(itemDirectory, imageAName), imageAData);
    if (imageBData !== undefined && imageBName !== undefined) await writeFile(path.join(itemDirectory, imageBName), imageBData);

    const question = questionSchema.parse({
      id, mode: submitted.mode, title: submitted.title, description: submitted.description,
      imageA: `questions/items/${id}/${imageAName}`,
      ...(imageBName === undefined ? {} : { imageB: `questions/items/${id}/${imageBName}` }),
      differences: submitted.differences, showCount: submitted.showCount, source: 'workshop',
      authorName: parsed.data.authorName, status: 'approved', likes: 0, dislikes: 0, createdAt: event.issue.created_at,
    });
    await writeFile(path.join(itemDirectory, 'question.json'), `${JSON.stringify(question, null, 2)}\n`);

    const annotatedA = `q-${String(index + 1).padStart(2, '0')}-annotated-a.webp`;
    await sharp(imageAData).composite([{ input: overlaySvg(imageA.width, imageA.height, submitted.differences) }]).webp({ quality: 86 }).toFile(path.join(previewDirectory, annotatedA));
    let annotatedB: string | undefined;
    if (imageBData !== undefined) {
      annotatedB = `q-${String(index + 1).padStart(2, '0')}-annotated-b.webp`;
      await sharp(imageBData).composite([{ input: overlaySvg(imageA.width, imageA.height, submitted.differences) }]).webp({ quality: 86 }).toFile(path.join(previewDirectory, annotatedB));
    }

    const rawBase = `https://raw.githubusercontent.com/${event.repository.full_name}/__COMMIT_SHA__`;
    const itemBase = `${rawBase}/public/questions/items/${id}`;
    const previewBase = `${rawBase}/.github/submission-previews/issue-${issue}`;
    const annotations = annotatedB === undefined
      ? `![答案标注图](${previewBase}/${annotatedA})`
      : `| 图片 A | 图片 B |\n|---|---|\n| ![答案标注图 A](${previewBase}/${annotatedA}) | ![答案标注图 B](${previewBase}/${annotatedB}) |`;
    const originals = imageBName === undefined
      ? `![原图 A](${itemBase}/${imageAName})`
      : `| 图片 A | 图片 B |\n|---|---|\n| ![原图 A](${itemBase}/${imageAName}) | ![原图 B](${itemBase}/${imageBName}) |`;
    const coordinates = submitted.differences.map((difference, answerIndex) => `| ${answerIndex + 1} | ${difference.type === 'circle' ? '圆形' : '矩形'} | \`${Object.entries(difference).filter(([key]) => key !== 'type').map(([key, value]) => `${key}=${value}`).join(', ')}\` |`).join('\n');
    sections.push(`## ${index + 1}. ${markdown(submitted.title)}\n\n${markdown(submitted.description)}\n\n模式：${submitted.mode === 'spot_diff' ? '找不同' : '区域识别'} · 答案数量：${submitted.differences.length} · ID：\`${id}\`\n\n### 答案标注\n\n${annotations}\n\n<details>\n<summary>展开查看投稿原图</summary>\n\n${originals}\n\n</details>\n\n<details>\n<summary>展开查看答案坐标</summary>\n\n| 编号 | 类型 | 坐标 |\n|---:|---|---|\n${coordinates}\n\n</details>`);
  }

  const preview = `${MARKER}\n# 投稿预览\n\n✅ ZIP 解包和校验通过\n\n投稿者：${markdown(parsed.data.authorName)} · 共 ${parsed.data.questions.length} 道题 · 自动生成 PR：#__PR_NUMBER__\n\n## 审核操作\n\n- **审核通过**：合并 PR #__PR_NUMBER__。题目会被收录，Issue 将自动关闭并显示发布版本。\n- **审核拒绝**：关闭 PR #__PR_NUMBER__，不要合并。Issue 将标记为“审核未通过”并自动关闭。\n- 请不要只关闭本 Issue；题目是否收录以关联 PR 的合并状态为准。\n\n${sections.join('\n\n---\n\n')}\n\n---\n\n当前状态：🟡 等待审核`;
  await writeFile(path.join(root, '.github/submission-preview.md'), preview);
  process.stdout.write(`已处理 Issue #${issue}：${parsed.data.questions.length} 道题\n`);
}

await main();
