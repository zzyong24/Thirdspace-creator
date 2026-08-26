# Parallel runtime（宿主派发 · 主会话串行整合）

完整判据见 `rules/parallel-collab-rules.md`。`run.sh` 默认保持串行；只有具备原生 sub-agent 并行能力的主会话才能开启波次，脚手架不绑定供应商进程协议。

## 波次

```text
业务 DAG ready set
→ progress.mjs batch --json N（当前 step 的 W/W + W/R + exclusive resource）
→ 准备独立 workspace
→ parallel-isolation.mjs select
→ 主会话 claim + context-compile
→ 宿主原生 fan-out
→ barrier
→ barrier 后、首次合并前验证全部 candidate
→ 按 merge_index 串行合并；每次 verify + reconcile
→ 主会话推进 progress/board
```

## 隔离

- 只读辅助审计共享目录，但不领取/推进自治队列。
- 宿主已提供每 agent 独立 checkout：短分支即可。
- 本地写代理共享目录：每个任务一个 worktree。
- 分支/worktree 都不能覆盖读写依赖或共享资源冲突；冲突任务串行。

worker 不写 BACKLOG、progress、Manifest、Decision、review event、ledger 或其他控制面，只交付一个 task-local 候选 commit，禁止 push。主会话是唯一 lease writer 和 integrator。

## 合并

所有候选绑定同一 `base_sha`，`merge_index` 唯一。主会话在 integration HEAD 仍等于 base 时先验证整批，再按固定顺序一次合一个；每次合入后 verify、reconcile、`progress done` 都必须绿。
