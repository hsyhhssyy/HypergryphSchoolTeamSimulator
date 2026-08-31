import { mkdir, readFile, readdir, rename, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import sharp from 'sharp';
import { questionSchema, type Difference, type Question } from '../shared/types.ts';

const root = path.resolve(import.meta.dirname, '..');
const itemsDirectory = path.join(root, 'public/questions/items');
const outputFile = path.join(root, 'public/questions/questions.json');
const publicDirectory = path.join(root, 'public');
const checkOnly = process.argv.includes('--check');

function fail(message: string): never {
  throw new Error(`题库校验失败：${message}`);
}

function resolvePublicAsset(assetPath: string): string {
  if (path.isAbsolute(assetPath) || assetPath.includes('\\')) fail(`资源路径不安全：${assetPath}`);
  const resolved = path.resolve(publicDirectory, assetPath);
  if (!resolved.startsWith(`${publicDirectory}${path.sep}`)) fail(`资源路径越界：${assetPath}`);
  return resolved;
}

async function assertRegularFile(filePath: string, label: string): Promise<void> {
  let fileStat;
  try {
    fileStat = await stat(filePath);
  } catch {
    fail(`${label} 不存在：${path.relative(root, filePath)}`);
  }
  if (!fileStat.isFile()) fail(`${label} 不是普通文件：${path.relative(root, filePath)}`);
}

function assertDifferenceInBounds(difference: Difference, width: number, height: number, id: string): void {
  const valid = difference.type === 'circle'
    ? difference.x - difference.radius >= 0 && difference.y - difference.radius >= 0
      && difference.x + difference.radius <= width && difference.y + difference.radius <= height
    : difference.x + difference.width <= width && difference.y + difference.height <= height;
  if (!valid) fail(`${id} 的答案区域超出图片 A 边界（${width}×${height}）`);
}

async function validateAssets(question: Question, directoryName: string): Promise<void> {
  const expectedPrefix = `questions/items/${directoryName}/`;
  if (!question.imageA.startsWith(expectedPrefix) || (question.imageB !== undefined && !question.imageB.startsWith(expectedPrefix))) {
    fail(`${question.id} 的图片必须位于自己的目录 ${expectedPrefix}`);
  }
  if (question.mode === 'spot_diff' && question.imageB === undefined) fail(`${question.id} 是找不同题目但缺少 imageB`);
  if (question.mode === 'find_area' && question.imageB !== undefined) fail(`${question.id} 是区域识别题目但包含 imageB`);

  const imageAPath = resolvePublicAsset(question.imageA);
  await assertRegularFile(imageAPath, `${question.id} 的 imageA`);
  if (question.imageB !== undefined) await assertRegularFile(resolvePublicAsset(question.imageB), `${question.id} 的 imageB`);

  const metadata = await sharp(imageAPath).metadata();
  if (metadata.width === undefined || metadata.height === undefined) fail(`无法读取 ${question.id} 的图片尺寸`);
  for (const difference of question.differences) {
    assertDifferenceInBounds(difference, metadata.width, metadata.height, question.id);
  }
}

async function loadQuestions(): Promise<Question[]> {
  const entries = await readdir(itemsDirectory, { withFileTypes: true });
  const directories = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  if (directories.length === 0) fail('没有找到任何题目目录');

  const questions: Question[] = [];
  const ids = new Set<string>();
  for (const directoryName of directories) {
    const manifestPath = path.join(itemsDirectory, directoryName, 'question.json');
    await assertRegularFile(manifestPath, `${directoryName} 的清单`);
    let raw: unknown;
    try {
      raw = JSON.parse(await readFile(manifestPath, 'utf8'));
    } catch (error) {
      fail(`${path.relative(root, manifestPath)} 不是有效 JSON：${String(error)}`);
    }
    const parsed = questionSchema.safeParse(raw);
    if (!parsed.success) fail(`${path.relative(root, manifestPath)}：${parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('；')}`);
    const question = parsed.data;
    if (question.id !== directoryName) fail(`目录 ${directoryName} 与题目 ID ${question.id} 不一致`);
    if (ids.has(question.id)) fail(`题目 ID 重复：${question.id}`);
    if (question.status !== 'approved') fail(`${question.id} 尚未 approved，不应进入正式题库`);
    ids.add(question.id);
    await validateAssets(question, directoryName);
    questions.push(question);
  }
  return questions.sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id));
}

async function main(): Promise<void> {
  const questions = await loadQuestions();
  const output = `${JSON.stringify(questions, null, 2)}\n`;
  if (checkOnly) {
    process.stdout.write(`题库校验通过：${questions.length} 道题目\n`);
    return;
  }
  await mkdir(path.dirname(outputFile), { recursive: true });
  const temporaryFile = `${outputFile}.${process.pid}.tmp`;
  await writeFile(temporaryFile, output, 'utf8');
  try {
    await rename(temporaryFile, outputFile);
  } catch (error) {
    await unlink(temporaryFile).catch(() => undefined);
    throw error;
  }
  process.stdout.write(`已生成 ${path.relative(root, outputFile)}：${questions.length} 道题目\n`);
}

await main();
