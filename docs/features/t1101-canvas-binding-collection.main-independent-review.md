# T1101 来源并入 main 独立复核

复核时间：2026-10-09（Asia/Shanghai）。主线：`8428b5042e8a6422358a6573ac48abee34cf2660`；来源：干净 worktree `f97a80da002db91dcdeac464203828dd9268cbd3`；共同基点：`68dfffb3`。

结论：**有限 GO**。T1101 来源产品范围符合其 SPEC，可进入 T1080 的受控主线合并；来源 PASS、截图、任务完成事件和日志只证明 `f97a80d` 这棵树，不能作为合并后 main 的 PASS。主线必须重新建立 T1101 的初审、任务状态和组合验证链。本结论不签 T1101 主线完成、全局 reconcile、安装版、真实模型或真实平台扫码。

## 来源范围与真实性

- T1101 SPEC SHA256：`ab538c5ec2faf1bba8f7b68347c019b679f0dd1924ef52800da52cf2f39af008`；页面规格 SHA256：`5d4895d8a65eea198a917275436137f51bb43fd7f13f775be2c469f43585e37e`；主线/来源产品定位均为 `86bc2c8add6a01ebf5b2ecf9de05d448770ca14a4e0bdbbf376fffc6387e3800`。
- 来源从基点新增/修改 19 个产品路径和 13 个测试路径，集中在画布生成锁与参考图传递、平台绑定、错峰采集、启动装配和 persistence client。没有新增任务系统、模型写库、前端 Cookie 保存或自动采纳。
- 来源独立评审文件 SHA256 `10c499a7afb528f8ded3a8ed9b066642f12f55d75e2cdf19affd0068d9260caf`。源树实际 backend 8文件137 PASS/1 SKIP、frontend 4文件79 PASS、两条浏览器旅程各1 PASS；backend/frontend typecheck、boundary 无新增、semantic 和 orphan 均有通过证据。
- 来源完整 reconcile 实际仍为 45 errors/0 warnings，见 `global-gates.md` SHA256 `23121f040dd0a42ab461122ee3d71f38215a852eb6ed60a63591bd249691609f`。原 `postgres-public-gates.log` 还保留2个失败；后续精确 `postgres-platform-gates` 2 PASS 和 `postgres-canvas-final` 1 PASS/20 SKIP只覆盖对应子集。因此不得概括为来源全绿。
- 来源提交序列完整保留在 Git：`d2385b03`、`0d85adff`、`4b22f48f`、`2de7f7ef`、`f97a80da`。历史证据日志中的空白行会令提交范围 `git diff --check` 报告证据文件尾随空行；这些原始日志不应为洗绿而重写或重哈希。

## 与当前 main 的组合风险

从共同基点分别计算，main 改动52路径、来源改动126路径，交集仅6个控制文件；**产品/测试路径交集为0**。这排除了同文件产品冲突，但不能排除运行时接口、数据库状态、启动顺序和公共 persistence client 的组合风险。

当前 main 对 `f97a80d` 的只读 `git merge-tree --write-tree` 返回冲突，冲突精确为：

1. `BACKLOG.md`
2. `PROJECT.md`
3. `orchestrator/.lessons-stats.json`
4. `orchestrator/DECISION_LOG.md`
5. `orchestrator/events.ndjson`
6. `orchestrator/review-events.ndjson`

旧 `t1101-merge-preview.json` SHA256 `77e251371951a96948a2f4ca1b0c31532c9b31863adc95d34b171d6e30693c30` 基于更早 main，不能替代当前六冲突事实。

## 控制面合并建议

- 完整保留 `f97a80d` 原审计文件与日志的逐字节归档及 Git 可达性；不得把来源 events/review-events 接到当前主链，也不得重算其 hash 伪装连续。
- 当前 main 的 events/review-events 没有 T1101 事件。主线应新增一条 T1101 BACKLOG 记录，从待验/📋开始，链接来源完成证明但不复制来源✅状态。
- 以同一用户授权和当前 SPEC 做 main 上的独立 initial review；该初审 packet 随本报告提供。正式 `reviewctl record` 后再由 `taskctl start` 建立 main 自己的审计链。
- `DECISION_LOG.md` 和 `PROJECT.md` 逐项保留两边事实，不能整文件选 ours/theirs。`.lessons-stats.json` 是生成统计，应在合并后由正式同步/对账流程重建，不能手工拼接两个分支计数。BACKLOG 保留 main 当前任务和 T1101 新待验行。
- 冲突解决产生新的 main 字节与新提交；来源日志 SHA、截图 SHA、事件 hash 均继续指向来源，不改写成合并提交证据。

## 合并后最小必须实跑的公共链

1. 对合并候选重新执行 backend 8文件聚焦回归和 backend typecheck，包含画布生成同节点锁、预约恢复、平台 collector admission、startup bootstrap、真实 owner/group 与调度恢复。
2. 在隔离 PG 环境重新执行 `startup-group-collectors.postgres.integration.test.ts` 的平台锁/画布相关用例；不得用来源中最初 `postgres-public-gates` 的失败或后续过滤子集代替组合验证。
3. 重新执行 frontend 4文件79例、frontend typecheck，以及 account-group、public scheduled collection、public owner recovery；重点覆盖 `persistence-client.ts`、同组账号切换、绑定回执和缓存/迟到响应。
4. 重新执行 creative-canvas 两条浏览器旅程：生成运行锁/重生成确认/精确参考图，以及三平台扫码入口。仍须明确模拟服务，不冒充真实供应商或本人扫码。
5. 执行 boundary、semantic、orphan、LED-047、timeout-policy 及完整 reconcile；保留所有失败并重新归因。来源45项 reconcile 失败不能由主线历史或源分支 PASS 抹除。
6. 核实合并后产品19路径和测试13路径与来源提交的 blob SHA一致，控制冲突只改变主线治理文件；若产品字节因冲突或后续适配改变，必须重做对应独评，不能继续引用本结论。

## 主线初审结论

当前 SPEC 的产品目标、归属边界、恢复行为和验证要求可执行，未发现需要扩大产品范围的阻断。随附 `spec-review-round/v2` initial packet 仅允许 root 在 main 上正式记录初审；只有主线冲突完成、组合测试和对账取得实际结果后，才能判断 T1101 是否完成。
