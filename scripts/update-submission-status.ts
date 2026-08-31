import process from "node:process";

const marker = "<!-- submission-preview -->";
const [status, releaseTag] = process.argv.slice(2);
const eventPath = process.env.GITHUB_EVENT_PATH;
const token = process.env.GITHUB_TOKEN;
const repository = process.env.GITHUB_REPOSITORY;
if (
  status === undefined ||
  eventPath === undefined ||
  token === undefined ||
  repository === undefined
) {
  throw new Error(
    "Usage: update-submission-status.ts merged|rejected [release-tag]",
  );
}
const event = JSON.parse(
  await (await import("node:fs/promises")).readFile(eventPath, "utf8"),
) as { pull_request: { body: string | null } };
const match = event.pull_request.body?.match(
  /(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#(\d+)/i,
);
if (match?.[1] === undefined) {
  process.stdout.write("PR 没有关联投稿 Issue，跳过状态更新\n");
  process.exit(0);
}
const issue = match[1];
const headers = {
  Accept: "application/vnd.github+json",
  Authorization: `Bearer ${token}`,
  "X-GitHub-Api-Version": "2022-11-28",
  "Content-Type": "application/json",
  "User-Agent": "submission-status-action",
};
const base = `https://api.github.com/repos/${repository}`;
const listed = await fetch(`${base}/issues/${issue}/comments?per_page=100`, {
  headers,
});
if (!listed.ok) throw new Error(`Cannot list comments: HTTP ${listed.status}`);
const comments = (await listed.json()) as Array<{ id: number; body: string }>;
const comment = comments.find((item) => item.body.includes(marker));
if (comment === undefined) {
  process.stdout.write(`Issue #${issue} 没有投稿预览评论，跳过状态更新\n`);
  process.exit(0);
}
const line =
  status === "merged"
    ? `当前状态：✅ 已审核并收录${releaseTag === undefined ? "" : ` · 版本 \`${releaseTag}\``}`
    : "当前状态：❌ PR 已关闭，投稿未收录";
const body = /当前状态：[^\n]*/.test(comment.body)
  ? comment.body.replace(/当前状态：[^\n]*/, line)
  : `${comment.body}\n\n${line}`;
const updated = await fetch(`${base}/issues/comments/${comment.id}`, {
  method: "PATCH",
  headers,
  body: JSON.stringify({ body }),
});
if (!updated.ok)
  throw new Error(`Cannot update comment: HTTP ${updated.status}`);

const removeLabel = await fetch(
  `${base}/issues/${issue}/labels/${encodeURIComponent("等待审核")}`,
  { method: "DELETE", headers },
);
if (!removeLabel.ok && removeLabel.status !== 404)
  throw new Error(`Cannot remove label: HTTP ${removeLabel.status}`);

if (status === "rejected") {
  const createLabel = await fetch(`${base}/labels`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      name: "审核未通过",
      color: "D73A4A",
      description: "投稿 PR 已关闭且未合并",
    }),
  });
  if (!createLabel.ok && createLabel.status !== 422)
    throw new Error(
      `Cannot create rejection label: HTTP ${createLabel.status}`,
    );
  const addLabel = await fetch(`${base}/issues/${issue}/labels`, {
    method: "POST",
    headers,
    body: JSON.stringify({ labels: ["审核未通过"] }),
  });
  if (!addLabel.ok)
    throw new Error(`Cannot label rejected issue: HTTP ${addLabel.status}`);
  const closeIssue = await fetch(`${base}/issues/${issue}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ state: "closed", state_reason: "not_planned" }),
  });
  if (!closeIssue.ok)
    throw new Error(`Cannot close rejected issue: HTTP ${closeIssue.status}`);
}
process.stdout.write(`已更新 Issue #${issue} 状态\n`);
