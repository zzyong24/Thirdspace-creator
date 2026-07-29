# T-599 BUILD wave

> 任务：T-599
> 基线：`e48051db`
> 运行环境：共享工作树，不创建 commit；主 Agent 是唯一 integrator
> 合并顺序：Wave 0 契约 → Lane A 后端 → Lane B 项目/日历 UI → Lane C 发布中心 UI → Root
> composition/dashboard → 全量验证

## Write-set 推导

| Lane | 目标 | write_set | 与其他 lane |
|---|---|---|---|
| A | 共享 contract、calendar schema/repository/service、`0061` migration 与定向测试 | `contract/src/**`、`contract/tests/**`、`backend/src/schema/content-calendar.ts`、`backend/src/modules/content-calendar/**`、`backend/drizzle/0061_project_schedule_calendar.sql` | 不碰 frontend 与 migration journal |
| B | 项目行排期控件、日历只读收口、`/calendar` 跳转与组件测试 | `frontend/src/features/projects/**`、`frontend/src/features/content-calendar/**`、`frontend/src/app/(creator)/calendar/page.tsx`、对应 feature/route tests | 不碰 server composition、publishing center、dashboard |
| C | 发布中心删除重复库存、日历 70/30 主从布局与组件测试 | `frontend/src/features/publishing-center/**` | 不碰 content-calendar、dashboard、server composition |
| Root | user timezone / projects / publishing / analytics batch ports、`persistence-client.ts`、Dashboard DTO/投影/UI、migration journal、E2E/视觉证据与控制面 | 所有未分配的 T-599 路径 | 串行接收 A/B/C 后集成 |

共享聚合文件 `frontend/src/server/persistence-client.ts`、`backend/src/modules/query-services/**`、
`backend/drizzle/meta/_journal.json`、控制面全部 hoist 给 Root，避免 T-600 与并行 lane 覆盖。

## Done 判据

Lane A：

```bash
pnpm --filter @creatoros/contract typecheck
pnpm --filter @creatoros/contract test
pnpm --filter @creatoros/backend exec vitest run \
  src/modules/content-calendar/content-calendar.contract.test.ts \
  src/modules/content-calendar/content-calendar.repository.integration.test.ts \
  src/modules/content-calendar/content-calendar.service.test.ts
```

Lane B/C：

```bash
pnpm --filter creatoros-frontend exec vitest run <lane test files>
pnpm --filter creatoros-frontend typecheck
```

汇合：

```bash
pnpm --filter @creatoros/backend typecheck
pnpm --filter @creatoros/backend test
pnpm --filter creatoros-frontend verify
pnpm --filter creatoros-frontend exec playwright test --project=e2e \
  tests/e2e/projects.spec.ts tests/e2e/publishing-center.spec.ts
node orchestrator/process/boundary-scan.mjs
node orchestrator/process/orphan-scan.mjs
node orchestrator/process/reconcile.mjs
```

同一障碍失败两次立即停下并汇报；不得改写或清理不在 T-599 write_set 的并发脏文件。
