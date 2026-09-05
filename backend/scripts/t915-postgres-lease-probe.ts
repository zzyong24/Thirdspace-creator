import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { aiTasks, createRuntimeDb, eq, executionTasks } from "../src/index";
import { createAiRepository } from "../src/modules/ai/ai.repository";
import { createExecutionAuthorityService } from "../src/modules/execution/execution-authority.service";
import { createExecutionLeaseService } from "../src/modules/execution/execution-lease.service";
import { createPersistentTaskService } from "../src/modules/execution/persistent-task.service";

// 仅向显式提供的临时测试数据库写入，不能使用应用 DATABASE_URL。
const fixture = JSON.parse(readFileSync(process.argv[2]!, "utf8")) as {url: string};
const first = await createRuntimeDb({connectionString: fixture.url});
const second = await createRuntimeDb({connectionString: fixture.url});
const ctx = {userId: `probe-${randomUUID()}`, accountId: "probe-account", requestId: "probe", source: "user" as const};
const stamp = "2026-09-05T00:00:00.000Z";
const tasks = createPersistentTaskService(first.db, {now: () => stamp});
const otherTasks = createPersistentTaskService(second.db, {now: () => stamp});
const results: Record<string, unknown> = {};
const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>(r => {resolve = r;});
  return {promise, resolve};
};
try {
  // 两个独立 pool 并发：新映射与旧领取总共只能有一个赢家。
  const authority = createExecutionAuthorityService(first.db, {now: () => stamp});
  const legacy = createAiRepository(second.db, {userId: ctx.userId, accountId: ctx.accountId, now: () => stamp, nextId: p => `${p}-${randomUUID()}`});
  for (let i = 0; i < 30; i++) {
    const id = `race-${randomUUID()}`;
    await first.db.insert(aiTasks).values({id, userId: ctx.userId, accountId: ctx.accountId, taskType: "script.draft", idempotencyKey: id, requestedAt: stamp});
    const [binding, claim] = await Promise.allSettled([
      authority.bindAiTask(ctx, id),
      legacy.claimAiTaskExecution(id, {workerId: "legacy", leaseToken: randomUUID(), leaseSeconds: 60}),
    ]);
    assert.equal(claim.status, "fulfilled");
    if (claim.status !== "fulfilled") throw claim.reason;
    if (binding.status === "fulfilled") assert.equal(claim.value, null);
    else assert.ok(claim.value, "转交拒绝时，旧领取必须已取得执行权");
  }
  results.mapping_races = 30;

  const task = await tasks.enqueue(ctx, {kind: "source_sync", ownerType: "source", ownerId: randomUUID(), idempotencyKey: randomUUID(), payload: {}});
  const claim = await tasks.claimTask({taskId: task.id, workerId: "worker"});
  assert.ok(claim);
  const ref = {executionTaskId: task.id, attempt: claim.lease.attempt, fenceToken: claim.lease.fenceToken};
  const entered = deferred(); const release = deferred();
  const writer = createExecutionLeaseService(first.db, {now: () => stamp}).withLease(ref, "admission", async ({tx}) => {
    entered.resolve(); await release.promise;
    await tx.update(executionTasks).set({status: "succeeded", leaseOwner: null, leaseExpiresAt: null}).where(eq(executionTasks.id, task.id));
  });
  await entered.promise;
  const control = otherTasks.command(ctx, {taskIds: [task.id], command: "cancel", idempotencyKey: randomUUID()})
    .then(() => ({cancelled: true}), error => ({cancelled: false, error}));
  try {
    let waiting = false;
    for (let i = 0; i < 200; i++) {
      const result = await first.pool.query("SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock' AND query LIKE '%execution_tasks%'");
      if (result.rows[0].count > 0) {waiting = true; break;}
      await new Promise(r => setTimeout(r, 10));
    }
    assert.ok(waiting, "必须真实观察到另一个连接等待行锁");
  } finally {release.resolve();}
  await writer;
  const cancelled = await control;
  assert.equal(cancelled.cancelled, false);
  assert.equal((await tasks.get(ctx, task.id)).status, "succeeded");
  results.cancel_waited_for_commit_and_rejected = true;

  // 返回真实 PostgreSQL 版本与 pool 数，PGlite 不作为本 probe 的替代。
  results.postgres_version = (await first.pool.query("SHOW server_version")).rows[0].server_version;
  results.independent_pools = 2;
  console.log(JSON.stringify({status: "passed", results}, null, 2));
} finally {await first.pool.end(); await second.pool.end();}
