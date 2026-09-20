# T-1009 HTML 到 PNG/PDF 的用户导出链路

## 用户可见行为

对话里的已登记 HTML 产物有“导出原文件”“导出 PNG”“导出 PDF”三个选项。PNG/PDF 由桌面本机的受控浏览器从当前版本的静态页面生成；用户在原生面板选择保存位置。取消面板不会显示保存成功。预览仍显示隔离后的 HTML，原文件导出仍返回登记时的原字节。

```mermaid
flowchart LR
  A[点击 HTML 产物的 PNG/PDF] --> B[会话与账号核实]
  B --> C[任务、产物版本与原字节哈希回读]
  C --> D[相对 PNG 同任务回读并安全内联]
  D --> E[离线 Chromium 生成真实字节]
  E --> F[响应 MIME、大小、哈希与源哈希]
  F --> G[客户端复核并打开原生保存面板]
```

## 实现边界

- `GET /api/v1/workbench-preview/{taskId}/{artifactId}/{version}?format=png|pdf` 先执行既有 loopback、session、账号和后端产物读取校验。仅已登记 `text/html` 可转换；原 HTML 限 4 MiB，生成文件限 20 MiB。无效 UTF-8 返回 422，非 HTML 返回 415，版本/归属错误返回 404，浏览器运行时缺失返回 503，渲染并发超限返回 429；不会返回占位文件。
- 转换使用预览同一套 HTML 清理和相对 PNG 回读。只接受同账号、同任务正式登记且哈希有效的相对 PNG，最多 12 张、图片总原始字节最多 2 MiB。外部链接、脚本、文件地址及失效图片不会进入渲染。渲染端口同时最多执行 2 个 Chromium；启动、页面加载和输出分别有超时上限。
- 成功响应的 `Content-Type`、`X-Workbench-Mime`、`X-Workbench-Hash`、`X-Workbench-Size`、`X-Workbench-Filename` 对应实际 PNG/PDF 字节，`X-Workbench-Source-Hash` 对应已登记的 HTML 原版本。默认预览与 `format=raw` 原有行为保留。
- 客户端只访问当前产物的同源路径，核对来源哈希、响应格式、大小、字节 SHA-256 和文件签名，20 MiB 以上流式拒绝；之后才调用既有 `export_workbench_artifact` 原生命令。卡片连点只发起一次导出，卸载或账号/版本切换会取消在途读取并忽略旧回执。原生文件面板打开后无法由网页 AbortSignal 强制关闭；此时全局只允许一个保存面板，切换账号不会把旧回执显示在新卡片。

## 当场验证

- `pnpm --dir frontend exec vitest run 'src/app/api/v1/workbench-preview/[taskId]/[artifactId]/[version]/route.test.ts' src/features/copilot/workbench-artifact-card.test.tsx src/features/copilot/workbench-artifact-export.test.ts src/server/workbench-artifact-render.test.ts --retry=0`：4 文件、24/24 通过。真实 PGlite 登记和本地对象存储贯通 HTTP 端口；Chromium 输出 PNG 像素与可解析 PDF；核对 PNG/PDF 元数据、原文件保真、跨账号拒绝、无效编码、运行时缺失及并发预算。
- `pnpm --dir frontend exec tsc --noEmit --pretty false`、上述文件的定向 ESLint：通过；`git diff --check` 在提交前复核。
- LED-047 助手、弹层导航、详情和慢轮询回归：8 文件、157/157 通过。
- `CREATOROS_DESKTOP=1 pnpm --dir frontend build`：本地 Next standalone 构建通过，动态预览 route 列入产物；构建有既有 NFT 全项目追踪警告。生成的路由 NFT 列出 `jsdom` 与 `@playwright/test`，standalone 中有 `jsdom` 包与 Playwright 包目录。单独检查 standalone 时，`@playwright/test` 的入口未完整落盘；现有 `frontend/scripts/desktop/build-sidecar.mjs` 的 `bundlePlaywright()` 会补拷完整 Playwright 闭包，但本次没有运行桌面打包脚本，故不能把 standalone 构建当作安装包运行证据。
- `node orchestrator/process/boundary-scan.mjs` 仍失败：`live-chat-session.ts` 的 `@ai-sdk/react` 与 `ai` 两条 R2 导入已存在于起点 `11901acd`，本次未触及该文件，也未新增本写集违规。全局门卫不能写成通过。

## 待安装版验收

Mac/Windows 安装版的 CfT 路径、原生保存对话框取消/覆盖、实际文件打开及升级保留仍待 T-1013 真机验证。本工作树未打包、安装或发布。
