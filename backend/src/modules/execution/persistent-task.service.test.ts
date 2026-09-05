import { describe, expect, it } from "vitest";

import { createDb, executionTasks, eq } from "@creatoros/backend";
import type { RequestContext } from "@creatoros/contract";
import {
  createPersistentTaskService,
  type PersistentTaskService,
} from "./persistent-task.service";

const ctxA: RequestContext = {
  userId: "user-a",
  accountId: "account-a",
  requestId: "request-a",
  source: "user",
};
const ctxB: RequestContext = {
  userId: "user-a",
  accountId: "account-b",
  requestId: "request-b",
  source: "user",
};

function fixture(
  now = "2026-07-23T12:00:00.000Z",
): {
  clock: { value: string };
  nextId: (prefix: string) => string;
} {
  let serial = 0;
  const clock = { value: now };
  return {
    clock,
    nextId: (prefix) => `${prefix}-${++serial}`,
  };
}

async function enqueue(
  service: PersistentTaskService,
  ctx: RequestContext = ctxA,
  suffix = "one",
) {
  return service.enqueue(ctx, {
    kind: "source_sync",
    ownerType: "source",
    ownerId: `source-${suffix}`,
    idempotencyKey: `sync-${suffix}`,
    payload: { page: 1, sourceId: `source-${suffix}` },
    priority: 10,
    maxAttempts: 2,
  });
}

describe("T-482 持久执行任务状态机", () => {
  it("T-517:同一个 scheduled_job 同时至多一个活跃 automation_sync", async () => {
    const { db, client } = await createDb();
    const f = fixture();
    const service = createPersistentTaskService(db, {
      now: () => f.clock.value,
      nextId: f.nextId,
    });
    try {
      await service.enqueue(ctxA, {
        kind: "automation_sync",
        ownerType: "scheduled_job",
        ownerId: "job-one",
        idempotencyKey: "job-one:tick-one",
        payload: { handler: "scheduled_collection" },
      });
      await expect(
        service.enqueue(ctxA, {
          kind: "automation_sync",
          ownerType: "scheduled_job",
          ownerId: "job-one",
          idempotencyKey: "job-one:tick-two",
          payload: { handler: "scheduled_collection" },
        }),
      ).rejects.toMatchObject({ name: "ConflictError" });
    } finally {
      await client.close();
    }
  });

  it("同账号幂等创建复用任务，幂等键同名但请求不同会拒绝", async () => {
    const { db, client } = await createDb();
    const f = fixture();
    const service = createPersistentTaskService(db, {
      now: () => f.clock.value,
      nextId: f.nextId,
    });
    try {
      const first = await enqueue(service);
      const same = await enqueue(service);
      expect(same.id).toBe(first.id);

      await expect(
        service.enqueue(ctxA, {
          kind: "source_sync",
          ownerType: "source",
          ownerId: "source-one",
          idempotencyKey: "sync-one",
          payload: { page: 2 },
        }),
      ).rejects.toMatchObject({ name: "ConflictError" });
    } finally {
      await client.close();
    }
  });

  it("并发 claim 只能有一个 worker 获得同一任务", async () => {
    const { db, client } = await createDb();
    const f = fixture();
    const service = createPersistentTaskService(db, {
      now: () => f.clock.value,
      nextId: f.nextId,
    });
    try {
      const task = await enqueue(service);
      const claims = await Promise.all([
        service.claimNext({ workerId: "worker-a", leaseSeconds: 30 }),
        service.claimNext({ workerId: "worker-b", leaseSeconds: 30 }),
      ]);
      const won = claims.filter((claim) => claim !== null);
      expect(won).toHaveLength(1);
      expect(won[0]?.task.id).toBe(task.id);
      expect(won[0]?.task.attempt).toBe(1);
    } finally {
      await client.close();
    }
  });

  it("租约持有者可心跳和保存 checkpoint，旧 attempt 与其他 worker 均被拒绝", async () => {
    const { db, client } = await createDb();
    const f = fixture();
    const service = createPersistentTaskService(db, {
      now: () => f.clock.value,
      nextId: f.nextId,
    });
    try {
      await enqueue(service);
      const claim = await service.claimNext({
        workerId: "worker-a",
        leaseSeconds: 30,
      });
      expect(claim).not.toBeNull();
      if (!claim) throw new Error("expected claim");

      f.clock.value = "2026-07-23T12:00:10.000Z";
      const heartbeat = await service.heartbeat({
        taskId: claim.task.id,
        workerId: "worker-a",
        attempt: claim.task.attempt,
        leaseSeconds: 30,
      });
      expect(heartbeat.heartbeatAt).toBe(f.clock.value);

      const saved = await service.saveCheckpoint({
        taskId: claim.task.id,
        workerId: "worker-a",
        attempt: claim.task.attempt,
        checkpoint: { cursor: "page-2" },
      });
      expect(saved.checkpoint).toEqual({ cursor: "page-2" });

      await expect(
        service.heartbeat({
          taskId: claim.task.id,
          workerId: "worker-b",
          attempt: claim.task.attempt,
          leaseSeconds: 30,
        }),
      ).rejects.toMatchObject({ name: "ConflictError" });
      await expect(
        service.saveCheckpoint({
          taskId: claim.task.id,
          workerId: "worker-a",
          attempt: 0,
          checkpoint: {},
        }),
      ).rejects.toMatchObject({ name: "ConflictError" });
    } finally {
      await client.close();
    }
  });

  it("暂停、恢复、取消与重试只允许合法迁移", async () => {
    const { db, client } = await createDb();
    const f = fixture();
    const service = createPersistentTaskService(db, {
      now: () => f.clock.value,
      nextId: f.nextId,
    });
    try {
      const task = await enqueue(service);
      const claim = await service.claimNext({
        workerId: "worker-a",
        leaseSeconds: 30,
      });
      if (!claim) throw new Error("expected claim");

      const [pauseRequested] = await service.command(ctxA, {
        taskIds: [task.id],
        command: "pause",
        idempotencyKey: "pause-1",
      });
      expect(pauseRequested?.status).toBe("pause_requested");

      const paused = await service.acknowledgeControl({
        taskId: task.id,
        workerId: "worker-a",
        attempt: claim.task.attempt,
      });
      expect(paused.status).toBe("paused");

      const [resumed] = await service.command(ctxA, {
        taskIds: [task.id],
        command: "resume",
        idempotencyKey: "resume-1",
      });
      expect(resumed?.status).toBe("queued");

      const [cancelled] = await service.command(ctxA, {
        taskIds: [task.id],
        command: "cancel",
        idempotencyKey: "cancel-1",
      });
      expect(cancelled?.status).toBe("cancelled");
      await expect(
        service.command(ctxA, {
          taskIds: [task.id],
          command: "retry",
          idempotencyKey: "retry-invalid",
        }),
      ).rejects.toMatchObject({ name: "ConflictError" });

      const failedTask = await enqueue(service, ctxA, "failed");
      const failedClaim = await service.claimNext({
        workerId: "worker-a",
        leaseSeconds: 30,
      });
      if (!failedClaim || failedClaim.task.id !== failedTask.id) {
        throw new Error("expected failed task claim");
      }
      const failed = await service.finish({
        taskId: failedTask.id,
        workerId: "worker-a",
        attempt: failedClaim.task.attempt,
        status: "failed",
        errorCode: "UPSTREAM_TIMEOUT",
        errorMessage: "上游超时",
      });
      expect(failed).toMatchObject({
        status: "failed",
        errorCode: "UPSTREAM_TIMEOUT",
        errorMessage: "上游超时",
      });
      const [retried] = await service.command(ctxA, {
        taskIds: [failedTask.id],
        command: "retry",
        idempotencyKey: "retry-1",
      });
      expect(retried?.status).toBe("queued");
    } finally {
      await client.close();
    }
  });

  it("批量命令先校验全部归属，混入跨账号任务时零写入", async () => {
    const { db, client } = await createDb();
    const f = fixture();
    const service = createPersistentTaskService(db, {
      now: () => f.clock.value,
      nextId: f.nextId,
    });
    try {
      const owned = await enqueue(service, ctxA, "owned");
      const foreign = await enqueue(service, ctxB, "foreign");

      await expect(
        service.command(ctxA, {
          taskIds: [owned.id, foreign.id],
          command: "cancel",
          idempotencyKey: "cancel-mixed",
        }),
      ).rejects.toMatchObject({ name: "OwnershipError" });

      expect((await service.get(ctxA, owned.id)).status).toBe("queued");
      expect((await service.get(ctxB, foreign.id)).status).toBe("queued");
    } finally {
      await client.close();
    }
  });

  it("启动恢复按重试预算重新入队，耗尽预算则失败", async () => {
    const { db, client } = await createDb();
    const f = fixture();
    const service = createPersistentTaskService(db, {
      now: () => f.clock.value,
      nextId: f.nextId,
    });
    try {
      const requeue = await enqueue(service, ctxA, "requeue");
      await service.claimNext({ workerId: "worker-a", leaseSeconds: 10 });

      const exhausted = await service.enqueue(ctxA, {
        kind: "transcribe",
        ownerType: "item",
        ownerId: "item-exhausted",
        idempotencyKey: "transcribe-exhausted",
        payload: {},
        maxAttempts: 1,
      });
      await service.claimNext({
        workerId: "worker-b",
        kinds: ["transcribe"],
        leaseSeconds: 10,
      });

      f.clock.value = "2026-07-23T12:00:11.000Z";
      const report = await service.recoverExpiredLeases();
      expect(report).toEqual({ requeued: 1, failed: 1, paused: 0, cancelled: 0, unknownResult: 0 });
      expect((await service.get(ctxA, requeue.id)).status).toBe("queued");
      expect((await service.get(ctxA, exhausted.id)).status).toBe("failed");

      const [row] = await db
        .select()
        .from(executionTasks)
        .where(eq(executionTasks.id, exhausted.id));
      expect(row?.lastErrorCode).toBe("LEASE_EXPIRED");
    } finally {
      await client.close();
    }
  });
});
