# Program Orchestration Rules（多项目产品总控）

## 何时启用

一条用户旅程跨越两个或更多独立版本、独立部署或独立 `BACKLOG` 的项目时，必须启用 program
控制面。多个仓库的文件天然不相交；这只能降低代码冲突，不能证明业务独立或产品完成。

## 唯一真值

| 关注点 | 唯一权威 |
|---|---|
| 旅程的用户目标、角色和业务步骤 | `docs/journeys/FLOW-*.md` |
| 步骤归属、业务依赖和跨项目验证命令 | `orchestrator/program/program.config.json` |
| 本轮实际部署集合 | `orchestrator/program/release-set.json` |
| 非 fixture 逐步观测 | `orchestrator/program/receipts/<journey>.json` |
| 最近一次执行日志 | `orchestrator/program/executions/<journey>.json`，只由 `program-gate.mjs` 写 |

不创建 `PROGRAM_SPEC.md`、`PROGRAM_BACKLOG.md` 或可手改的父旅程完成状态。父旅程状态由 gate
每次根据当前文件、证据和部署集合现场推导，避免第四份状态漂移。

## 执行顺序

1. 在一个协调项目运行 `tools/init-program.sh`，登记所有参与项目。
2. 先把 FLOW 步骤组成业务 `depends_on` DAG。共享契约、权威状态迁移和测试实体协议作为
   wave-0；只有依赖已满足的 ready set 能开工。
   跨父旅程的依赖只有在上游旅程取得且仍保持当前 `program-gate GO` 时才算满足；本地任务
   `✅`、合并成功或单仓部署绿色都不等价于依赖满足。
3. ready set 内再按 `rules/parallel-collab-rules.md` 排除 W/W、W/R 与独占资源冲突；有冲突就串行，
   不同 ready set 不能因文件不相交而抢跑。只读任务可共享；写任务只有在宿主已提供真实独立
   checkout 时才用 branch，否则用 worktree。并行 writer 只交一个未 push 的 candidate commit，
   不写控制面；主 agent 按固定顺序验证和整合。
4. 每个项目的任务只证明本项目实现完成。主 agent 汇总准确 deployed commit、URL 和非敏感
   实体引用，生成 receipt 后运行：
   `node orchestrator/process/program-gate.mjs --execute <journey-id>`。
5. 配置、FLOW、receipt、evidence 或 release set 任一变化都会使旧 execution 失效。命令失败会
   先覆盖旧 PASS，再留下 FAIL；不能沿用上轮绿色。
6. `--execute` 和 SHIP 时的 `--audit` 都从 release set 指定 commit 创建临时检出并运行命令；
   audit 会 fresh rerun，execution JSON 只是日志，手改它不能取得 GO。本地 HEAD 可以继续开发，
   但未部署代码不能替线上 commit 洗绿。

## 完成权

- 项目 owner 和实现 agent 只能宣布“本项目子任务完成”。
- 由 program 协调项目指定的主 integrator 是唯一父级完成声明者，且只能在
  `program-gate` 输出当前 `GO` 后宣布“父旅程完成”。
- 用户只确认产品方向、重大风险和最终发布，不承担逐仓、逐页串行测试。
- 没有 program GO 时，即使所有仓库的单元测试、CI、部署 smoke 都绿，产品仍是 `NO-GO`。

## 安全边界

- `release-set.json` 只保存 commit、部署 URL 和时间；账号、token、密码不进入控制面。
- receipt 只保存 opaque 实体引用和证据路径，不保存客户原文或完整敏感标识。
- execution 只保存命令、cwd 与输出的 hash/bytes 摘要，以及仓库内相对 cwd；不保存原始
  command/stdout/stderr。
- `program_completion_required=true` 是 coordinator 的持久绊线；删除 `program.config.json` 只会
  得到 `NO-GO`，不能让 reconcile 跳过父旅程。
- `orchestrator/program`、`executions` 目录及 execution 文件都必须位于项目内，不接受 symlink。
- `program-gate` 不替代各项目测试；它证明这些局部实现组成了同一条真实用户旅程。

## 常见错误

| 说法 | 实际 |
|---|---|
| “三个仓库都绿，所以产品完成” | 只证明三个局部；没有同一 release set 上的父旅程证据。 |
| “仓库文件不相交，可以同时做所有步骤” | `write_set` 不认识业务因果；先求 DAG ready set。 |
| “让用户上线后自己点一遍” | 用户又成了集成测试员；agent 应执行跨项目命令并产机械回执。 |
| “写一份集成报告就够了” | 报告可自报 PASS；完成权必须属于可重复执行的 gate。 |
