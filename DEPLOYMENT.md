# GitHub Pages 部署

本项目是纯静态站点：浏览器只读取构建后的 JavaScript、CSS，以及 `public/` 中的题库与图片，不需要 Worker、数据库、对象存储、密钥或环境变量。

1. 在 GitHub 仓库的 **Settings → Pages** 中将 Source 设为 **GitHub Actions**。
2. 推送到 `main`，或在 Actions 页面手动运行 **Deploy GitHub Pages**。
3. 工作流会执行 `npm ci`、`npm test`、`npm run build` 并发布 `dist/`。

本地用 `npm run build` 验证；预览可使用 `npm run preview -- --port 4173`。
