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

题库清单位于 [`public/questions/questions.json`](public/questions/questions.json)，图片也存放在 `public/questions/`。新增题目时，将图片放入该目录、在 JSON 中添加题目，并使用图片原始像素坐标填写答案区域。

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

ZIP 生成后，前往中文「题目投稿」Issue，将 ZIP 拖入对应字段即可。图片处理和打包都在浏览器本地完成，不会上传到其他服务器。

## GitHub Pages

推送到 `main` 后，[`deploy-pages.yml`](.github/workflows/deploy-pages.yml) 会自动测试、构建并发布 `dist/`。首次启用时，请在仓库 Settings → Pages → Build and deployment 中将 Source 设为 **GitHub Actions**。
