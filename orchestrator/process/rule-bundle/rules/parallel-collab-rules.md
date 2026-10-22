# Parallel Collab Rules（业务依赖先行 · 隔离按环境选择）

并行用于缩短独立任务的等待，不用于掩盖边界不清。主 agent 是唯一协调者和合并者；框架只定义可验证合同，不绑定某个 Agent 平台或项目。

## 1. 先求业务 DAG 的 ready set

先按 `depends_on` / `step_depends_on` 求业务 DAG 的 ready set，再做 `write_set 推导`。跨仓或文件不相交不代表业务无依赖。

`modules.config.json` 为每个任务声明：

- `write_set`：允许修改的精确仓库相对路径或末尾 `/**` 目录前缀；
- `read_set`：实现依赖且可能被其他任务修改的合同、schema、生成源；
- `exclusive_resources`：数据库 schema、迁移序列、共享测试账号等不能并发使用的逻辑资源；
- 多步骤任务可用同名 `step_*` map 覆盖当前步骤，未声明时回退 module 默认。

`progress.mjs batch --json N` 按稳定队列顺序选择最大可用批次。任意 W/W、W/R 或独占资源冲突都不进入同一批次；无法证明安全就串行。

## 2. 隔离方式自适应

| 任务与环境 | 方式 |
|---|---|
| 只读辅助审计（不领取/推进队列） | `shared` |
| 写任务，宿主已给每个 agent 独立 Git checkout/workspace | `branch` |
| 写任务，本机 agent 会共享同一目录 | `worktree` |
| 路径不明、语义冲突、高爆炸半径或任务过小 | `serial` |

**分支本身不隔离文件系统。** 多个 agent 若共享一个 checkout，切不同分支仍会争用工作目录和 Git index；此时必须用 worktree 或串行。宿主若已给每个 agent 独立 checkout，额外 worktree 没有收益，短分支即可。

**worktree 也不能消除语义冲突。** 两个任务读写同一合同、共用同一数据库迁移流或共享运行资源，即使物理目录分开也必须串行。

`batch` 对 writer 只返回 `auto`，不采信项目里的静态隔离提示。主 agent 创建/取得真实 workspace 后运行 `parallel-isolation.mjs select`；脚本验证 branch/worktree 是否真的独立、工作区是否干净，并再次检查当前步骤的 W/W、W/R 与资源冲突。自报“已隔离”不算证据。

## 3. 主会话领取并派发

只有主 agent 写 `BACKLOG.md`、`progress.json`、Manifest、Decision、review event 与 ledger。写代理不得修改控制面。

主 agent 用 `progress.mjs claim` 写入完整执行 lease：agent、`isolation_kind`、`workspace_root`、`branch`、`base_sha`、`wave_id`、`merge_index`。领取受项目状态锁保护；缺字段的并行 lease fail-closed。随后用 `context-compile.mjs` 生成绑定当前 step、读写边界、验证命令和执行环境的 Task Packet。

主 agent 使用宿主原生的 sub-agent 并行能力派发；脚手架不硬编码某个供应商的启动命令。宿主没有并行 API 或不能证明独立 workspace 时自动串行。

每个写代理只做一个 task/step，基于同一 `base_sha`，只改自己的 `write_set`，运行聚焦验证并交付一个未 push 的候选 commit。只读代理只是辅助证据源，不领取或完成 autonomous progress step。受阻两次即停并回报，不在原地改措辞重试。

## 4. 主会话串行合并

barrier 后、第一次合并前，主 agent 对同一 base 的全部候选运行 `parallel-isolation.mjs validate-candidate`：候选必须来自 lease 指定分支、只有一个非 merge commit、diff 完全落在当前步骤 `write_set`，且不得触碰控制面。验证期间 integration HEAD 离开 `base_sha` 则整波失效。

同一波次的 `base_sha` 必须一致且 `merge_index` 不得重复。候选按该顺序串行落地，不按完成先后抢跑；每合一个都重新运行该任务 verify 与 reconcile，再由 `progress done` 复核 integration HEAD 的直接 diff 仍在当前步骤边界内。红灯只退回该候选，不能污染 canonical 分支。

## 速查

1. `progress.mjs batch --json N` 选无冲突 ready set。
2. 准备真实 workspace，`parallel-isolation.mjs select` 证明隔离。
3. 主 agent 写完整 lease，编译 Task Packet，再用宿主能力并行派发。
4. `validate-candidate` 拒收越界、错分支、多 commit、旧基线和控制面改动。
5. 主 agent 按固定顺序逐个合并、逐个复验、最后统一推进状态。
