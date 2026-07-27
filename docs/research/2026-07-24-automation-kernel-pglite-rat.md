# T-517 Automation Kernel PGlite 可行性 RAT

> 日期：2026-07-24  
> 类型：PLAN 签核前的只读/临时真实驱动验证  
> 结论：PASS（证明底层原语可行，不代表生产 Kernel 已实现）  
> 生产代码改动：无

## 要验证的致命假设

独立评审指出：如果 PGlite/Drizzle 不能原子地创建 occurrence run、推进 `nextRunAt`、独占 claim
并恢复 lease，则 `automation_job/run` 方案根基不成立。该风险半天内可验证，所以不能推迟到 BUILD。

## 验证 1：仓内持久任务基元

命令：

```bash
pnpm --filter @creatoros/backend exec vitest run src/modules/execution/persistent-task.service.test.ts
```

结果：

```text
Test Files  1 passed (1)
Tests       6 passed (6)
Duration    5.01s
```

覆盖的既有语义包括并发 claim 单 winner、heartbeat、checkpoint、控制命令、attempt 上限和 expired
lease recovery。运行时提示当前 shell Node 22 低于仓库要求的 Node 25，但测试进程成功；正式 Gate
仍使用仓库标准 Node 版本。

## 验证 2：最小 AutomationJob/AutomationRun 真实 PGlite spike

使用仓内实际依赖 `@electric-sql/pglite@0.2.17`，仅在内存数据库临时建：

- `automation_job(id,next_run_at)`；
- `automation_run(id,job_id,scheduled_for,status,lease_owner,lease_expires_at,attempt)`；
- unique `(job_id,scheduled_for)`。

测试操作：

1. 两个并发 transaction 对同一个 due job 执行 `SELECT ... FOR UPDATE`；
2. transaction 内 `INSERT ... ON CONFLICT DO NOTHING` 产生 occurrence，并 CAS 推进 `nextRunAt`；
3. 在插入 run、推进 job 后主动抛 `crash-before-commit`；
4. 两个 worker 并发 `UPDATE ... WHERE status='queued' RETURNING` claim 同一 run；
5. 将过期 lease 的 running run 恢复为 queued。

真实输出：

```json
{
  "concurrent": ["r1", "not_due"],
  "afterTick": {
    "runs": 1,
    "next": "2026-07-24 10:01:00+00"
  },
  "rolled": true,
  "afterRollback": {
    "rollback_runs": 0,
    "next": "2026-07-24 10:01:00+00"
  },
  "claimWinners": 1,
  "recovered": {
    "status": "queued",
    "attempt": 1,
    "lease_owner": null
  },
  "ok": true
}
```

## 能证明什么

- PGlite 真实 transaction 可以把 run 创建与 job 时钟推进绑在一起；
- 同一 occurrence 的并发生产只落一条 run；
- commit 前崩溃模型会同时回滚 run 与 `nextRunAt`；
- 条件更新 claim 只有一个 winner；
- lease 过期后可持久恢复，不必依赖内存 Promise。

## 不能证明什么

- 尚未定义的生产 schema、索引、retention 与所有状态转换正确；
- 2,000 jobs / 10,000 runs 的性能目标；
- 多进程/多窗口共享同一 PGlite 目录的可行性；
- 旧三套数据迁移、fence 和故障回退正确；
- 每个业务 handler 的领域幂等与付费副作用 reconciliation 正确。

这些仍分别由 `HARD-AUTO-01/02/03/05/06` 在 CONTRACT/BUILD 中以正式 migration、
integration/security/fault-injection tests 关闭，不能把本 RAT 冒充完成证据。

