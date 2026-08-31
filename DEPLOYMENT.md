# GitHub Pages 部署

本项目是纯静态站点：浏览器只读取构建后的 JavaScript、CSS，以及 `public/` 中的题库与图片，不需要 Worker、数据库、对象存储、密钥或环境变量。

1. 在 GitHub 仓库的 **Settings → Pages** 中将 Source 设为 **GitHub Actions**。
2. 创建并推送四段数字版本标签，例如 `git tag v1.0.0.0 && git push origin v1.0.0.0`。
3. 工作流会执行 `npm ci`、`npm test`、`npm run build` 并发布 `dist/`。

只有严格匹配 `^v[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$` 的标签允许继续执行；普通分支推送不会触发 CI。

本地用 `npm run build` 验证；预览可使用 `npm run preview -- --port 4173`。
