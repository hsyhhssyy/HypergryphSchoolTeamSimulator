# 鹰角网络校队

一个完全静态的移动端图片答题小游戏，支持「找不同」和「区域识别」。每局开始时随机分配一种玩法，题目与图片全部随仓库发布，不依赖 API、数据库或对象存储。

## 本地运行

```bash
npm install
npm run dev
```

生产构建：

```bash
npm test
npm run build
```

构建产物位于 `dist/`，可部署到任意静态文件托管服务。

## 本地题库

每道题目独立存放在 `public/questions/items/<题目 ID>/`，目录内的 `question.json` 是题目清单，图片也必须放在同一目录。例如：

```text
public/questions/items/local-spot-1/
├── question.json
├── a.svg
└── b.svg
```

`public/questions/questions.json` 是构建产物，不应手工修改或提交。运行 `npm run dev` 或 `npm run build` 时会扫描所有独立题目、校验清单、图片和答案坐标，再自动生成聚合列表。也可以单独运行：

```bash
npm run questions:check  # 只校验
npm run questions:build  # 校验并生成聚合列表
```

投稿 PR 只需新增自己的题目目录，因此不同投稿可以按任意顺序合并。题目 ID 和目录名必须一致，图片路径应使用 `questions/items/<题目 ID>/...`。

`spot_diff` 需要 `imageA` 和 `imageB`；`find_area` 只需要 `imageA`。

## 投稿工具

主页的「投稿题目」会打开引导弹窗。投稿工具也可通过站点地址后的 `#/submit` 直接进入，例如：

```text
https://<用户名>.github.io/HypergryphSchoolTeamSimulator/#/submit
```

工具支持：

- 一次新增、切换、复制和删除多道题目；
- JPEG、PNG、WebP、HEIC 图片导入；
- 图片裁切、缩放、左右旋转，以及找不同图片 B 的叠加校准；
- 点击创建圆形答案区域、拖动创建矩形答案区域；
- 在浏览器本地生成包含 `submission.json`、图片与说明的 ZIP。

ZIP 生成后，前往中文「题目投稿」Issue，将 ZIP 拖入对应字段并提交即可。图片处理和打包都在浏览器本地完成，不会上传到其他服务器。

[`import-submission.yml`](.github/workflows/import-submission.yml) 会在 Issue 创建后自动：

- 立即回复一条“投稿处理中”占位评论，后续始终更新同一条评论；
- 下载并安全解包 ZIP，限制文件数量、单文件和总体积；
- 校验题目清单、真实图片格式、图片尺寸和答案坐标；
- 为每道题建立独立目录，并创建或更新 `submission/issue-<编号>` PR；
- 生成带答案编号的标注图；
- 在原 Issue 中发布审核预览：标注图默认展开，投稿原图和坐标默认折叠。

修改投稿 Issue 会重新处理 ZIP 并更新同一条预览评论。PR 合并后，Issue 预览会显示收录版本；未合并直接关闭时，自动化会把预览改为未收录、添加“审核未通过”标签并关闭 Issue。仓库需要在 Settings → Actions → General → Workflow permissions 中启用 **Read and write permissions**，并允许 GitHub Actions 创建 Pull Request。

## GitHub Pages

Pull Request 合并后，[`release-merged-pr.yml`](.github/workflows/release-merged-pr.yml) 会读取最大的 `vX.Y.Z.N` 标签，将最后一段递增并创建新标签。例如上一个版本是 `v1.2.3.7`，新版本就是 `v1.2.3.8`；仓库没有版本标签时从 `v0.0.0.1` 开始。随后会调用 [`deploy-pages.yml`](.github/workflows/deploy-pages.yml)，自动测试、聚合题库、构建并发布 `dist/`。

仍然可以手动推送符合 `v数字.数字.数字.数字` 格式的标签来触发发布。首次启用时，请在仓库 Settings → Pages → Build and deployment 中将 Source 设为 **GitHub Actions**，并确保 Settings → Actions → General 中允许 Actions 创建和推送标签。

```bash
git tag v1.0.0.0
git push origin v1.0.0.0
```
