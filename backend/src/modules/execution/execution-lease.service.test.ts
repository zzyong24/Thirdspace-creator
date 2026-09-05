import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, eq, executionTasks, type Db } from "@creatoros/backend";
import { createPersistentTaskService } from "./persistent-task.service";
import { createExecutionLeaseService } from "./execution-lease.service";

const ctx = {userId: "lease-user", accountId: "lease-account", requestId: "test", source: "user" as const};
describe("T-915 持久执行租约", () => {
  let db: Db;
  let close: () => Promise<void>;
  beforeAll(async () => {const connection = await createDb(); db = connection.db; close = () => connection.client.close();});
  afterAll(async () => close?.());
  async function fixture(id: string) {
    const clock = {stamp: "2026-09-05T00:00:00.000Z"};
    const tasks = createPersistentTaskService(db, {now: () => clock.stamp});
    const task = await tasks.enqueue(ctx, {kind: "source_sync", ownerType: "source", ownerId: id, idempotencyKey: id, payload: {}});
    const claim = await tasks.claimTask({taskId: task.id, workerId: "worker", leaseSeconds: 10});
    if (!claim) throw new Error("claim missing");
    const lease = createExecutionLeaseService(db, {now: () => clock.stamp});
    const ref = {executionTaskId: task.id, attempt: claim.lease.attempt, fenceToken: claim.lease.fenceToken};
    return {clock, tasks, task, lease, ref};
  }
  it("同一次事务内从任务恢复归属并校验随机fence，旧fence不能执行写入", async () => {
    const f = await fixture("fence");
    expect(f.ref.fenceToken).toEqual(expect.any(String));
    await f.lease.withLease(f.ref, "admission", async ({tx, task, context}) => {
      expect(context).toMatchObject({userId: ctx.userId, accountId: ctx.accountId});
      await tx.update(executionTasks).set({checkpoint: {receipt: "real"}}).where(eq(executionTasks.id, task.id));
    });
    let invoked = false;
    await expect(f.lease.withLease({...f.ref, fenceToken: "stale"}, "admission", async () => {invoked = true;})).rejects.toMatchObject({name: "ConflictError"});
    expect(invoked).toBe(false);
  });
  it("暂停或取消后拒绝新动作，但保留同租约已执行动作的结算入口", async () => {
    const f = await fixture("control");
    await f.tasks.command(ctx, {taskIds: [f.task.id], command: "pause", idempotencyKey: "pause"});
    await expect(f.lease.withLease(f.ref, "admission", async () => {})).rejects.toMatchObject({name: "ConflictError"});
    await expect(f.lease.withLease(f.ref, "settlement", async () => "receipt")).resolves.toBe("receipt");
    await f.tasks.acknowledgeControl({taskId: f.task.id, workerId: "worker", attempt: f.ref.attempt});
    await expect(f.lease.withLease(f.ref, "admission", async () => {})).rejects.toMatchObject({name: "ConflictError"});
    await f.tasks.command(ctx, {taskIds: [f.task.id], command: "resume", idempotencyKey: "resume"});
    const fresh = await f.tasks.claimTask({taskId: f.task.id, workerId: "worker"});
    expect(fresh?.lease.fenceToken).not.toBe(f.ref.fenceToken);
    await expect(f.lease.withLease(f.ref, "settlement", async () => {})).rejects.toMatchObject({name: "ConflictError"});
  });
  it("到期租约在回收前也不能启动新调用", async () => {
    const f = await fixture("expired"); f.clock.stamp = "2026-09-05T00:00:11.000Z";
    await expect(f.lease.withLease(f.ref, "admission", async () => {})).rejects.toMatchObject({name: "ConflictError"});
  });
  it("旧心跳不能复活已经到期的租约", async () => {
    const f = await fixture("expired-heartbeat"); f.clock.stamp = "2026-09-05T00:00:11.000Z";
    await expect(f.tasks.heartbeat({taskId: f.task.id, workerId: "worker", attempt: f.ref.attempt})).rejects.toMatchObject({name: "ConflictError"});
  });
});
