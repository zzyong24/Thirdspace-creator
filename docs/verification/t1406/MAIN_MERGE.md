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

初次合并准备仅调整发布编排保全与文档，产品源码与 ba2 完全一致；后述 CI 补正只追加测试夹具改动，运行时代码、契约和迁移 SQL 字节保持一致。合并前针对实际新 PR 获取当场检查及评审状态。最终远端 merge SHA 与结果另据实际 GitHub 回执记录，本文不预填“已合并”或“全绿”。

本轮已实际执行：Node 25.9.0 `node --test tools/windows-closure-rat/flow-package-binding.test.mjs tools/windows-closure-rat/signed-sidecar-capsule.test.mjs`，41 项中 39 PASS / 2 按平台 SKIP / 0 FAIL。正式 workflow 的文件 blob 为 `c120595338a17266dbd96f99ea204fd8ad367dea`，与 fresh main 完全相等。独立有限扫描读取完整变更 blob，未发现私钥 PEM 或 GitHub 令牌字面量；仅为限定模式检查，不作完备密钥证明。

## 首轮 PR CI 与关联测试补正

PR #11 / head `d7ce0f34` 的 Verify run `40262049759` 实际结束为 23 个检查成功、6 个检查失败。已逐份读取六个失败分片的真实日志，新增失败共 12 例：历史迁移库存漏登记 0141、知识模块仍期待旧 13 个操作，以及旧审核 Worker 夹具没有合法 group 上下文；不能归入原 104 条环境已知失败。

测试修正保留全部生产逻辑、迁移 SQL、权限/归属门、历史 SQL 摘要与冻结/重放断言，不修改 `.github`、known-failures、分类器或原超时；显式补齐 115 项库存/0141、保留 104/111/114 旧前缀；知识库采用完整 15 项明确操作表；审核夹具沿公共账号/成员列表取得真实 group，而非伪造 ID 或直接写库。

已发生的限定回归（批次重叠，不累计为完整套件）：

- frontend legacy 文件：Windows 真实 4/4 PASS，89.26 秒，原旧 producer、Worker、冻结、结算与重放均执行。此前四轮因 Windows 夹具前置失败/拒绝的记录保留。最终只用隔离进程环境的 `TAPE=-`、精确同版本 Pi core alias 及 Git `core.autocrlf=false`，旧 104 个 SQL 与固定 Git blob 104/104 完全相同，未改测试查找、归档命令或守卫。
- backend legacy-source / convergence：先实际三例红测，补正后三例限定 PASS；两整文件实际 42 PASS / 17 原 PG 前置失败，原分类器判新失败 0、运行异常 0，Vitest exit1 保留，不能称 59 项全通过。
- backend scheduled：目标一例 PASS；整文件 15 PASS / 2 原 PG 前置失败，原分类器新失败 0。
- backend unified intake：两例实际红测后两例 PASS，整文件 9/9 PASS，旧业务、时钟和重启幂等守卫保留。
- frontend knowledge registry：整文件 3/3 PASS，29.41 秒，真实持久化无 ctx 拒绝、空库及 create/list 往返均执行。
- frontend 审核 Worker：合法账号/成员绑定后的整文件 3/3 PASS，54.77 秒，本地 HTTP 请求次数 1/1/2、真实子进程、冻结原文、原版报告及私有规则 ID 命中均成立；既有 backend 审稿规则/冻结组隔离 6/6 PASS。frontend 完整 `tsc --noEmit` exit0，修改文件 lint 0 errors / 0 warnings。未据此宣称重新 typegen、构建或真实供应商验收。

上述均用 Node 25、新私有 HOME/DB/auth 目录和受控本地 HTTP；不使用用户原数据库、真实模型凭据或真实平台操作。各测试改动已有独立源码审阅，源码审阅不代替执行结果。新一轮 PR CI 和最终合并状态仍以当场远端回执为准。
