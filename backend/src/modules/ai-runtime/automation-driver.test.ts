import { describe, expect, it, vi } from "vitest";

import type { RequestContext } from "@creatoros/contract";
import type {
  PersistentTaskClaim,
  PersistentTaskService,
} from "../execution";
import {
  createAutomationHandlerRegistry,
  runAutomationDriverTick,
  type AutomationDriverJob,
} from "./automation-driver";

const ctx: RequestContext = {
  userId: "user-1",
  accountId: "account-1",
  requestId: "automation-driver",
  source: "ingestion",
};

const dueJob: AutomationDriverJob = {
  id: "job-1",
  accountId: "account-1",
  sourceKind: "self.metrics",
  target: {},
  schedule: "* * * * *",
  enabled: true,
};

function taskFixture() {
  const task = {
    id: "execution-task-1",
    userId: ctx.userId,
    accountId: ctx.accountId!,
    kind: "automation_sync",
    ownerType: "scheduled_job",
    ownerId: dueJob.id,
    status: "running",
    priority: 0,
    idempotencyKey: "scheduled-job:job-1:2026-07-26T09:00:00.000Z",
    checkpoint: null,
    leaseOwner: "automation-worker",
    leaseExpiresAt: "2026-07-26T09:01:00.000Z",
    heartbeatAt: "2026-07-26T09:00:00.000Z",
    attempt: 1,
    maxAttempts: 3,
    errorCode: null,
    errorMessage: null,
    costEstimate: null,
    createdAt: "2026-07-26T09:00:00.000Z",
    updatedAt: "2026-07-26T09:00:00.000Z",
  } as const;
  const claim: PersistentTaskClaim = {
    task,
    payload: {
      handler: "scheduled_collection",
      job: dueJob,
      scheduledFor: "2026-07-26T09:00:00.000Z",
    },
    lease: { workerId: "automation-worker", attempt: 1, fenceToken: "automation-fence" },
  };
  return { task, claim };
}

describe("T-517 automation driver", () => {
  it("registry seal 后不可追加 handler，未知 handler 诚实拒绝", () => {
    const registry = createAutomationHandlerRegistry();
    registry.register("scheduled_collection", async () => undefined);
    registry.seal();

    expect(() =>
      registry.register("scheduled_collection", async () => undefined),
    ).toThrow(/已封闭/);
    expect(() => registry.resolve("arbitrary-script")).toThrow(
      /未注册的自动化 handler/,
    );
  });

  it("单次 tick 先恢复租约，再把到点 preset 入队、claim、执行并 finish succeeded", async () => {
    const { task, claim } = taskFixture();
    const recoverExpiredLeases = vi.fn(async () => ({
      requeued: 0,
      failed: 0,
      paused: 0,
      cancelled: 0,
    }));
    const enqueue = vi.fn(async () => ({ ...task, status: "queued" as const }));
    const claimNext = vi
      .fn()
      .mockResolvedValueOnce(claim)
      .mockResolvedValueOnce(null);
    const finish = vi.fn(async () => ({ ...task, status: "succeeded" as const }));
    const tasks = {
      recoverExpiredLeases,
      enqueue,
      claimNext,
      heartbeat: vi.fn(async () => task),
      finish,
    } as unknown as PersistentTaskService;
    const handler = vi.fn(async () => undefined);
    const sweepStaleJobRuns = vi.fn(async () => 2);
    const registry = createAutomationHandlerRegistry()
      .register("scheduled_collection", handler)
      .seal();

    const report = await runAutomationDriverTick({
      ctx,
      tasks,
      registry,
      listRunnableJobs: async () => [dueJob],
      now: () => "2026-07-26T09:00:20.000Z",
      workerId: "automation-worker",
      cron: { validate: () => true },
      maxClaims: 4,
      leaseSeconds: 60,
      sweepStaleJobRuns,
    });

    expect(sweepStaleJobRuns).toHaveBeenCalledTimes(1);
    expect(recoverExpiredLeases).toHaveBeenCalledTimes(1);
    expect(enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: "account-1" }),
      expect.objectContaining({
        kind: "automation_sync",
        ownerType: "scheduled_job",
        ownerId: "job-1",
        idempotencyKey:
          "scheduled-job:job-1:2026-07-26T09:00:00.000Z",
      }),
    );
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: "account-1" }),
      expect.objectContaining({
        job: dueJob,
        scheduledFor: "2026-07-26T09:00:00.000Z",
      }),
    );
    expect(finish).toHaveBeenCalledWith(
      expect.objectContaining({ status: "succeeded" }),
    );
    expect(report).toMatchObject({
      sweptJobRuns: 2,
      enqueued: 1,
      succeeded: 1,
      failed: 0,
    });
  });

  it("handler 抛错时 task 落 failed + 可读原因，tick 不吞成成功", async () => {
    const { task, claim } = taskFixture();
    const finish = vi.fn(async (input: { status: string }) => ({
      ...task,
      status: input.status,
    }));
    const tasks = {
      recoverExpiredLeases: vi.fn(async () => ({
        requeued: 0,
        failed: 0,
        paused: 0,
        cancelled: 0,
      })),
      enqueue: vi.fn(async () => ({ ...task, status: "queued" as const })),
      claimNext: vi
        .fn()
        .mockResolvedValueOnce(claim)
        .mockResolvedValueOnce(null),
      heartbeat: vi.fn(async () => task),
      finish,
    } as unknown as PersistentTaskService;
    const registry = createAutomationHandlerRegistry()
      .register("scheduled_collection", async () => {
        throw new Error("抖音登录态已过期");
      })
      .seal();

    const report = await runAutomationDriverTick({
      ctx,
      tasks,
      registry,
      listRunnableJobs: async () => [dueJob],
      now: () => "2026-07-26T09:00:20.000Z",
      workerId: "automation-worker",
      cron: { validate: () => true },
      maxClaims: 1,
      leaseSeconds: 60,
    });

    expect(finish).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "failed",
        errorCode: "AUTOMATION_HANDLER_FAILED",
        errorMessage: "抖音登录态已过期",
      }),
    );
    expect(report).toMatchObject({ succeeded: 0, failed: 1 });
  });

  it("[T-636] 启动恢复内容雷达，并补跑今天已错过且尚未尝试的作品同步", async () => {
    const enqueue = vi.fn(async () => taskFixture().task);
    const tasks = {
      recoverExpiredLeases: vi.fn(async () => ({
        requeued: 0,
        failed: 0,
        paused: 0,
        cancelled: 0,
      })),
      enqueue,
      claimNext: vi.fn(async () => null),
    } as unknown as PersistentTaskService;
    const registry = createAutomationHandlerRegistry()
      .register("scheduled_collection", async () => undefined)
      .seal();
    const radarJob: AutomationDriverJob = {
      ...dueJob,
      id: "job-radar",
      sourceKind: "intelligence.sync",
      schedule: "*/15 * * * *",
    };
    const ordinaryJob: AutomationDriverJob = {
      ...dueJob,
      id: "job-comments",
      sourceKind: "comments",
      schedule: "0 9 * * *",
    };
    const metricsJob: AutomationDriverJob = {
      ...dueJob,
      id: "job-metrics",
      sourceKind: "self.metrics",
      schedule: "0 9 * * *",
    };
    const now = new Date(2026, 6, 26, 9, 7, 20);
    const missedAnchor = new Date(2026, 6, 26, 9, 0, 0).toISOString();

    await runAutomationDriverTick({
      ctx,
      tasks,
      registry,
      listRunnableJobs: async () => [radarJob, ordinaryJob, metricsJob],
      now: () => now.toISOString(),
      workerId: "automation-worker",
      cron: { validate: () => true },
      startupRecovery: true,
      recoverMissedDailyRuns: true,
    });

    expect(enqueue).toHaveBeenCalledTimes(2);
    expect(enqueue).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ ownerId: "job-radar" }),
    );
    expect(enqueue).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        ownerId: "job-metrics",
        idempotencyKey: `scheduled-job:job-metrics:${missedAnchor}`,
      }),
    );
  });

  it("[T-636] 后续分钟也能补偿阻塞错过；当天计划后已有任意尝试则不重复", async () => {
    const enqueue = vi.fn(async () => taskFixture().task);
    const tasks = {
      recoverExpiredLeases: vi.fn(async () => ({
        requeued: 0,
        failed: 0,
        paused: 0,
        cancelled: 0,
      })),
      enqueue,
      claimNext: vi.fn(async () => null),
    } as unknown as PersistentTaskService;
    const registry = createAutomationHandlerRegistry()
      .register("scheduled_collection", async () => undefined)
      .seal();
    const now = new Date(2026, 6, 26, 9, 7, 20);
    const attemptedMetricsJob: AutomationDriverJob = {
      ...dueJob,
      id: "job-metrics",
      sourceKind: "self.metrics",
      schedule: "0 9 * * *",
      lastRunStartedAt: new Date(2026, 6, 26, 9, 3, 0).toISOString(),
    };

    await runAutomationDriverTick({
      ctx,
      tasks,
      registry,
      listRunnableJobs: async () => [attemptedMetricsJob],
      now: () => now.toISOString(),
      workerId: "automation-worker",
      cron: { validate: () => true },
      startupRecovery: false,
      recoverMissedDailyRuns: true,
    });

    expect(enqueue).not.toHaveBeenCalled();
  });
});
