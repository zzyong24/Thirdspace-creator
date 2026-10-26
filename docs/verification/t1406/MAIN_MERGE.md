# T-1406 合并准备与发布流程保全

2026-10-26 用户明确要求将最新修复“合并到main”。从 `ba2e74c1676793f425544344fbafa30fe6e7210a` 建立专用合并分支，产品修复来源为 `3ff74c163d8e713767bad7110ca8d73a2611d5a6`；保全既有工作文件及历史制品。

## 合并范围核对

- 新获取的 main 为 `3a110457ac4c9cb0c2d1289bb427a95f652c38eb`。原定位修复 PR #9 已合并，旧流程修复 PR #10 仍打开。
- PR #10 的后续提交 `c28cc1a8` 与本分支的 `9cbb1487` stable patch-id 都是 `98592632c5f061c237ee13f8e8b113224aa7aa8e`，八个改动文件 blob 一致，保留了后续选题任务复用及搜索测试类型修正。
- 独立审阅发现 T-1404 曾在专用候选构建分支临时替换 `desktop-release.yml`，删除原正式双端发布编排且硬锁该分支。合并准备将该文件完整恢复到此次 main 原 blob，保留正式 macOS / Windows / tag 发布能力；不修改 Verify，不放宽任何守卫，不自动发版。
- `flow-package-*` 及公开签名仍按历史精确 branch/run/source/artifact 校验，仅作原候选构建追溯，不将新 main 源码冒充旧签名制品。

## 既有验证与限制

八项安装功能限定复验、资料补充的真实模型链路、prepare `40222238320`、package `40224265925` 及 12,817 个运行文件的校验各有独立真实证据。后续 2026-10-26 同构建重装成功，不等于重新执行全功能验收。

整体 Windows 验收仍为 PARTIAL；原 poststart 严格数据快照 FAIL 保留，两个原项目仅 updatedAt 不同原因未定，凭据内容未验。既有 quick reconcile 27 errors / 18 warnings、task packet 缺 binding 及旧全量 CI 欠账不改成通过。当前 context-compile 再次因 T-1406 缺 task binding 失败，依 AGENTS fallback 已读 BACKLOG 与引用 SPEC，不伪造任务包。

合并准备仅调整发布编排保全与文档；产品源文件字节必须与 ba2 完全一致。合并前针对实际新 PR 获取当场检查及评审状态。最终远端 merge SHA 与结果另据实际 GitHub 回执记录，本文不预填“已合并”或“全绿”。

本轮已实际执行：Node 25.9.0 `node --test tools/windows-closure-rat/flow-package-binding.test.mjs tools/windows-closure-rat/signed-sidecar-capsule.test.mjs`，41 项中 39 PASS / 2 按平台 SKIP / 0 FAIL。正式 workflow 的文件 blob 为 `c120595338a17266dbd96f99ea204fd8ad367dea`，与 fresh main 完全相等。独立有限扫描读取完整变更 blob，未发现私钥 PEM 或 GitHub 令牌字面量；仅为限定模式检查，不作完备密钥证明。
