# T-1049 网页集成实现记录

日期：2026-10-03  
工作树：`/Users/zyongzhu/.codex/worktrees/user-diagnostics/Thirdspace-creator`  
分支：`codex/user-diagnostics`

## 本次实现

- 把 Doocs/md 固定提交 `a7c17fc4cda92e3c13aa7e24f06615cfa4219b31` 构建进 `frontend/public/reference-editors/doocs-md/`，用 opaque-origin sandbox iframe 和 CreatorOS 消息桥接入文章编辑。上游未修改源码归档、CreatorOS 差异补丁与 WTFPL 许可一并保存在同目录的 `sources/`。
- 在文章 section 中保存 H1–H6 层级；`articleDocument.nativeLayout` 保存固定上游版本对应的主题配置与自定义样式，带严格 schema 和大小限制。
- 文章正文锚定现有 section ID，拒绝正文中的 Markdown 图片、外链/相对图片与非 CreatorOS 图片 URL；素材通过账号内精确 asset/file ID 读取。导出从正式版本读回正文和图片，生成包含相对图片路径及版本清单的 HTML + ZIP。
- 草稿与待确认保存请求只写本标签页 `sessionStorage`。已实现未确认旧请求的幂等重放、精确版本读回及 current 并发检查；恢复旧回执时保留新编辑内容。

## 已运行检查

- Doocs/md 固定提交嵌入构建：通过（Vite 7,314 modules；产物 CSP 检查通过）。
- `pnpm --dir contract typecheck`：通过。
- `pnpm --dir frontend exec tsc --noEmit`：通过。
- `pnpm --dir frontend exec vitest run src/features/article/doocs-markdown.test.ts src/features/article/article-workbench.test.tsx`：2 个文件、22 项通过。
- `pnpm --dir contract exec vitest run tests/modules/articles.test.ts`：3 项通过。
- `pnpm --dir backend exec vitest run src/modules/articles/articles.integration.test.ts src/modules/articles/articles.worker.integration.test.ts`：2 个文件、31 项通过。
- LED-047 指定回归：8 个文件、159 项通过。
- `node orchestrator/process/orphan-scan.mjs`：0 errors、100 warnings。
- `node orchestrator/process/pmem.mjs sync`：通过（项目记忆同步、codegraph 刷新）。
- `node orchestrator/process/reconcile.mjs`：未通过，35 errors / 1 warning。门卫、自主执行、orphan scan 和资产完整性检查通过；阻断项是全局 boundary 回归、19 条过期/待审历史 review receipt、LED-003/006/007/008/009/014/017/018/020/024/028/038/040/042/046 lesson recurrence；另有 BACKLOG 超长行 warning。全局问题沿用现有根因任务 T-916，Copilot boundary 由 T-1026 跟踪；本任务未修改规则、基线或历史 receipt。
- 运行 URL `http://127.0.0.1:4318/` 首页返回 HTTP 200；`/reference-editors/doocs-md/index.html` 返回 HTTP 200。

## 未通过或未完成

- Contract 全量 `pnpm --dir contract test` 有 3 个失败：`chat-worker.test.ts` 的 `cover.generate` 拒绝名单、`modules/assets.test.ts` 的历史 Asset fixture 缺 `sourceUrl`、`registry.test.ts` 的既有端点清单与当前注册表不一致；其余 48 个文件、283 项通过。
- Backend 全量 `tsc --noEmit` 仍失败，输出含多模块既存类型错误；文章候选与跨模块测试 fixture 还有若干对象未提供新增 `headingLevel`。本次文章集成测试通过，类型错误未全部收敛。
- `boundary-scan` 检出 2 条相对当前基线新增项，均在共享 worktree 既有改动 `frontend/src/features/copilot/live-chat-session.ts` 中（`@ai-sdk/react`、`ai`）；不是本次 T-1049 文件。未调整规则或基线。
- 正式工作库启动被既有迁移安全门阻断：发现 `rubrics`、`rubric_versions`、`search_documents`、`knowledge_items` 有缺少 `account_id` 的存量行；未触碰或重置该库。当前 URL 使用 `/tmp/t1049-user-acceptance/db` 与 `/tmp/t1049-user-acceptance/media` 作为空白隔离运行时，本机开发降级密钥仅用于本地验收。
- 用户视觉与交互验收仍待用户本人进行：Doocs 主题/移动预览、刷新/并发冲突恢复、HTML + ZIP 解压图片，以及 900×600 / 1440×900 下布局；T-1049 acceptance 未标通过。

实现步骤已由 progress controller 标记完成；验收步骤保持待验，未调用 `taskctl complete`。
