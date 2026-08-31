import { readFile } from 'node:fs/promises';
import process from 'node:process';

const marker = '<!-- submission-preview -->';
const [issueNumber, pullNumber, commitSha] = process.argv.slice(2);
const token = process.env.GITHUB_TOKEN;
const repository = process.env.GITHUB_REPOSITORY;
if (issueNumber === undefined || pullNumber === undefined || commitSha === undefined || token === undefined || repository === undefined) {
  throw new Error('Usage: publish-submission-preview.ts ISSUE PR SHA');
}
const body = (await readFile('.github/submission-preview.md', 'utf8'))
  .replaceAll('__PR_NUMBER__', pullNumber)
  .replaceAll('__COMMIT_SHA__', commitSha);
const headers = { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json', 'User-Agent': 'submission-preview-action' };
const base = `https://api.github.com/repos/${repository}`;
const commentsResponse = await fetch(`${base}/issues/${issueNumber}/comments?per_page=100`, { headers });
if (!commentsResponse.ok) throw new Error(`Cannot list comments: HTTP ${commentsResponse.status}`);
const comments = await commentsResponse.json() as Array<{ id: number; body: string }>;
const existing = comments.find((comment) => comment.body.includes(marker));
const url = existing === undefined ? `${base}/issues/${issueNumber}/comments` : `${base}/issues/comments/${existing.id}`;
const response = await fetch(url, { method: existing === undefined ? 'POST' : 'PATCH', headers, body: JSON.stringify({ body }) });
if (!response.ok) throw new Error(`Cannot publish preview: HTTP ${response.status} ${await response.text()}`);
process.stdout.write(`${existing === undefined ? '已发布' : '已更新'} Issue #${issueNumber} 投稿预览\n`);
