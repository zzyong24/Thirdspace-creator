import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDb, type Db } from "@creatoros/backend";
import type { RequestContext } from "@creatoros/contract";
import { createExecutionAuthorityService } from "../execution/execution-authority.service";
import { OwnershipError } from "./ai.errors";
import { createAiRepository } from "./ai.repository";
import {
  createAiService,
  type AiArtifactsPort,
  type AiKnowledgePort,
  type AiPositioningPort,
} from "./ai.service";

const ctx: RequestContext = {
  userId: "user-a",
  accountId: "acct-a",
  requestId: "req-t513",
  source: "user",
};

function makeService(
  db: Db,
  clock: { now: string },
  nextIdOverride?: (prefix: string) => string,
  modelAuthority?: "channel-managed",
) {
  let seq = 0;
  const artifacts: AiArtifactsPort = {
    createVersion: vi.fn(async () => ({})),
  };
  const knowledge: AiKnowledgePort = {
    createKnowledge: vi.fn(async () => ({ id: "knowledge-1" })),
  };
  const positioning: AiPositioningPort = {
    upsertProfile: vi.fn(async () => ({})),
    createStatementVersion: vi.fn(async () => ({})),
  };
  return createAiService({
    db,
    now: () => clock.now,
    nextId: nextIdOverride ?? ((prefix) => `${prefix}-${++seq}`),
    artifacts,
    knowledge,
    candidate: {
      createFromAIResult: vi.fn(async () => ({})),
      enrichCard: vi.fn(async () => ({})),
    },
    learnings: { createLearning: vi.fn(async () => ({})) },
    publishing: { createPublicationFromDraft: vi.fn(async () => ({})) },
    materialLinks: { link: vi.fn(async () => ({})) },
    positioning,
    calibration: { createDraftPrediction: vi.fn(async () => ({})) },
    resolveTaskRuntimeData: vi.fn(async (_ctx, taskType) => ({
      skillSnapshot: {
        snapshotVersion: 1,
        userId: ctx.userId,
        accountId: ctx.accountId,
        taskType,
      },
      ...(modelAuthority ? { modelAuthority } : {}),
    })),
  });
}

describe("T-513 AI task idempotency and atomic execution ownership", () => {
  let db: Db;
  let clock: { now: string };

  beforeEach(async () => {
    ({ db } = await createDb());
    clock = { now: "2026-07-24T00:00:00.000Z" };
  });

  it.each(["retryOfTaskId", "spec.params.retryOf"])("映射任务不得通过 %s 重建并重置执行预算", async field => {
    const service=makeService(db,clock);
    const source=await service.createTask(ctx,{taskType:"exec.agentic.research",inputData:{spec:{taskType:"agentic.research",goal:"研究"}}});
    await createExecutionAuthorityService(db,{now:()=>clock.now}).bindAiTask(ctx,source.id);
    await expect(service.createTask(ctx,{
      taskType:"exec.agentic.research",
      attemptId:"t915-retry-new-attempt",
      ...(field==="retryOfTaskId" ? {retryOfTaskId:source.id} : {}),
      inputData:{spec:{taskType:"agentic.research",goal:"研究",params:field==="spec.params.retryOf" ? {retryOf:source.id} : {}}},
    })).rejects.toMatchObject({name:"ConflictError",message:expect.stringContaining("原执行")});
    expect((await service.listTasks(ctx,{limit:100,offset:0})).rows).toHaveLength(1);
  });

  it("same attempt and payload returns one task, changed payload fails, runtimeData stays server-only", async () => {
    const service = makeService(db, clock);
    const attemptId = "018f8d8a-90ab-7def-8123-123456789abc";
    const [first, replay] = await Promise.all([
      service.createTask(ctx, {
        taskType: "script.draft",
        attemptId,
        inputData: { projectId: "project-1" },
      }),
      service.createTask(ctx, {
        taskType: "script.draft",
        attemptId,
        inputData: { projectId: "project-1" },
      }),
    ]);

    expect(replay.id).toBe(first.id);
    expect(first.attemptId).toBe(attemptId);
    expect(first.requestFingerprint).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(first.retryOfTaskId).toBeNull();
    expect(first.inputData).toEqual({ projectId: "project-1" });
    expect(first.inputData).not.toHaveProperty("skillSnapshot");

    const repo = createAiRepository(db, {
      now: () => clock.now,
      nextId: (prefix) => `${prefix}-inspect`,
      userId: ctx.userId,
      accountId: ctx.accountId!,
    });
    const stored = await repo.requireTask(first.id);
    expect(stored.runtimeData).toEqual({
      skillSnapshot: expect.objectContaining({
        snapshotVersion: 1,
        accountId: "acct-a",
      }),
    });

    await expect(
      service.createTask(ctx, {
        taskType: "script.draft",
        attemptId,
        inputData: { projectId: "project-2" },
      }),
    ).rejects.toMatchObject({ code: "ATTEMPT_PAYLOAD_MISMATCH" });
  });

  it("server-only runtimeData read is account-scoped and never enters task DTO", async () => {
    const service = makeService(db, clock);
    const task = await service.createTask(ctx, {
      taskType: "script.draft",
      attemptId: "018f8d8a-90ab-7def-8123-runtime00001",
      inputData: { projectId: "project-1" },
    });

    await expect(service.getTaskRuntimeData(ctx, task.id)).resolves.toEqual({
      skillSnapshot: expect.objectContaining({
        snapshotVersion: 1,
        accountId: "acct-a",
      }),
    });
    expect(await service.getTask(ctx, task.id)).not.toHaveProperty("runtimeData");

    await expect(
      service.getTaskRuntimeData(
        { ...ctx, accountId: "acct-b", requestId: "req-cross-account" },
        task.id,
      ),
    ).rejects.toBeInstanceOf(OwnershipError);
  });

  it("视频决策断点只写 server-only 固定键，并保留 Skill 快照", async () => {
    const service = makeService(db, clock);
    const task = await service.createTask(ctx, {
      taskType: "video.decisions",
      attemptId: "018f8d8a-90ab-7def-8123-video-check01",
      inputData: { projectId: "project-1" },
    });

    await service.putVideoDecisionsCheckpoint(ctx, task.id, {
      schemaVersion: 1,
      inputFingerprint: "sha256:test",
      scenes: [],
    });

    await expect(service.getTaskRuntimeData(ctx, task.id)).resolves.toEqual({
      skillSnapshot: expect.objectContaining({
        snapshotVersion: 1,
        taskType: "video.decisions",
      }),
      videoDecisionsCheckpoint: {
        schemaVersion: 1,
        inputFingerprint: "sha256:test",
        scenes: [],
      },
    });
    expect(await service.getTask(ctx, task.id)).not.toHaveProperty("runtimeData");
  });

  it("连续口播断点只写 server-only 固定键，并保留 Skill 快照", async () => {
    const service = makeService(db, clock);
    const task = await service.createTask(ctx, {
      taskType: "script.draft",
      attemptId: "018f8d8a-90ab-7def-8123-script-check1",
      inputData: { projectId: "project-1" },
    });

    await service.putScriptDraftCheckpoint(ctx, task.id, {
      schemaVersion: 1,
      inputFingerprint: "sha256:test",
      stage: "voiceover_complete",
      voiceover: "冻结口播",
    });

    await expect(service.getTaskRuntimeData(ctx, task.id)).resolves.toEqual({
      skillSnapshot: expect.objectContaining({
        snapshotVersion: 1,
        taskType: "script.draft",
      }),
      scriptDraftCheckpoint: {
        schemaVersion: 1,
        inputFingerprint: "sha256:test",
        stage: "voiceover_complete",
        voiceover: "冻结口播",
      },
    });
    expect(await service.getTask(ctx, task.id)).not.toHaveProperty("runtimeData");
  });

  it("渠道 authority 的异步任务只记录 channel-managed，不把本地或真实渠道 model 当展示真值", async () => {
    const service = makeService(db, clock, undefined, "channel-managed");
    const task = await service.createTask(ctx, {
      taskType: "script.draft",
      attemptId: "018f8d8a-90ab-7def-8123-channelmodel1",
      inputData: { projectId: "project-1" },
    });

    expect(task.modelKey).toBe("channel-managed");
    expect(task).not.toHaveProperty("runtimeData");
    await expect(service.getTaskRuntimeData(ctx, task.id)).resolves.toEqual(
      expect.objectContaining({ modelAuthority: "channel-managed" }),
    );
  });

  it("retryOf must be a same-owner, same-taskType terminal task and is fingerprinted", async () => {
    const service = makeService(db, clock);
    const source = await service.createTask(ctx, {
      taskType: "script.draft",
      attemptId: "018f8d8a-90ab-7def-8123-aaaaaaaaaaaa",
      inputData: {},
    });
    await service.cancelTask(ctx, source.id, "user cancelled");

    const retry = await service.createTask(ctx, {
      taskType: "script.draft",
      attemptId: "018f8d8a-90ab-7def-8123-bbbbbbbbbbbb",
      retryOfTaskId: source.id,
      inputData: {},
    });
    expect(retry.retryOfTaskId).toBe(source.id);

    await expect(
      service.createTask(ctx, {
        taskType: "script.draft",
        attemptId: "018f8d8a-90ab-7def-8123-cccccccccccc",
        retryOfTaskId: retry.id,
        inputData: {},
      }),
    ).rejects.toMatchObject({ code: "RETRY_SOURCE_NOT_TERMINAL" });
  });

  it("claim and beginModelCall each have one winner; renew and terminal writes are token-bound", async () => {
    const service = makeService(db, clock);
    const task = await service.createTask(ctx, {
      taskType: "script.draft",
      attemptId: "018f8d8a-90ab-7def-8123-dddddddddddd",
      inputData: {},
    });

    const [claimA, claimB] = await Promise.all([
      service.claimAiTaskExecution(ctx, task.id, {
        workerId: "worker-a",
        leaseSeconds: 90,
      }),
      service.claimAiTaskExecution(ctx, task.id, {
        workerId: "worker-b",
        leaseSeconds: 90,
      }),
    ]);
    const claims = [claimA, claimB].filter(
      (value): value is NonNullable<typeof value> => value !== null,
    );
    expect(claims).toHaveLength(1);
    const claim = claims[0]!;

    const [beginA, beginB] = await Promise.all([
      service.beginModelCall(ctx, task.id, claim.leaseToken),
      service.beginModelCall(ctx, task.id, claim.leaseToken),
    ]);
    expect([beginA, beginB].filter(Boolean)).toHaveLength(1);

    expect(
      await service.renewAiTaskExecution(
        ctx,
        task.id,
        "wrong-token",
        90,
      ),
    ).toBeNull();
    clock.now = "2026-07-24T00:00:20.000Z";
    expect(
      await service.renewAiTaskExecution(
        ctx,
        task.id,
        claim.leaseToken,
        90,
      ),
    ).toMatchObject({
      leaseExpiresAt: "2026-07-24T00:01:50.000Z",
    });

    expect(
      await service.completeAiTaskExecution(
        ctx,
        task.id,
        "wrong-token",
        { status: "succeeded" },
      ),
    ).toBe(false);
    expect(
      await service.completeAiTaskExecution(
        ctx,
        task.id,
        claim.leaseToken,
        { status: "succeeded" },
      ),
    ).toBe(true);
    expect((await service.getTask(ctx, task.id)).status).toBe("succeeded");

    const steps = await service.listSteps(ctx, task.id);
    expect(steps.filter((step) => step.kind === "model_call_started")).toHaveLength(
      1,
    );
  });

  it("expired pre-call lease requeues, but a started model call becomes reconciliation-required", async () => {
    const service = makeService(db, clock);
    const safe = await service.createTask(ctx, {
      taskType: "script.draft",
      attemptId: "018f8d8a-90ab-7def-8123-eeeeeeeeeeee",
      inputData: {},
    });
    const safeClaim = await service.claimAiTaskExecution(ctx, safe.id, {
      workerId: "worker-safe",
      leaseSeconds: 60,
    });
    expect(safeClaim).not.toBeNull();
    clock.now = "2026-07-24T00:01:01.000Z";
    expect(
      await service.reconcileExpiredAiTaskExecution(
        ctx,
        safe.id,
        safeClaim!.leaseToken,
      ),
    ).toBe("requeued");
    expect((await service.getTask(ctx, safe.id)).status).toBe("queued");

    clock.now = "2026-07-24T00:02:00.000Z";
    const unsafe = await service.createTask(ctx, {
      taskType: "script.draft",
      attemptId: "018f8d8a-90ab-7def-8123-ffffffffffff",
      inputData: {},
    });
    const unsafeClaim = await service.claimAiTaskExecution(ctx, unsafe.id, {
      workerId: "worker-unsafe",
      leaseSeconds: 60,
    });
    expect(unsafeClaim).not.toBeNull();
    expect(
      await service.beginModelCall(ctx, unsafe.id, unsafeClaim!.leaseToken),
    ).toBe(true);
    clock.now = "2026-07-24T00:03:01.000Z";
    expect(
      await service.reconcileExpiredAiTaskExecution(
        ctx,
        unsafe.id,
        unsafeClaim!.leaseToken,
      ),
    ).toBe("reconciliation_required");
    const failed = await service.getTask(ctx, unsafe.id);
    expect(failed.status).toBe("failed");
    expect(failed.errorMessage).toBe(
      "SKILL_SNAPSHOT_RECONCILIATION_REQUIRED",
    );
  });

  it("production lease scope lets only one runner execute and makes legacy candidate writes atomic", async () => {
    const service = makeService(db, clock);
    const task = await service.createTask(ctx, {
      taskType: "script.draft",
      attemptId: "018f8d8a-90ab-7def-8123-live-runner-01",
      inputData: {},
    });
    let executions = 0;

    const run = () =>
      service.runClaimedTaskExecution(ctx, task.id, async () => {
        executions += 1;
        await service.markRunning(ctx, task.id);
        await service.recordCandidate(ctx, task.id, {
          resultType: "artifact_version",
          artifactId: "artifact-1",
          resultData: { body: "lease-owned candidate" },
        });
        return "done";
      });

    const results = await Promise.all([run(), run()]);
    expect(results.filter((result) => result.claimed)).toHaveLength(1);
    expect(executions).toBe(1);
    expect((await service.getTask(ctx, task.id)).status).toBe(
      "awaiting_confirmation",
    );
    expect(await service.listResults(ctx, task.id)).toHaveLength(1);
    expect(
      (await service.listSteps(ctx, task.id)).filter(
        (step) => step.kind === "model_call_started",
      ),
    ).toHaveLength(1);
  });

  it("[T-522] runner 终态日志关联 taskId、finishReason、usage 与真实结果行数", async () => {
    const service = makeService(db, clock);
    const task = await service.createTask(ctx, {
      taskType: "script.draft",
      attemptId: "018f8d8a-90ab-7def-8123-runner-log-01",
      inputData: {},
    });
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});

    await service.runClaimedTaskExecution(ctx, task.id, async () => {
      await service.recordCandidate(ctx, task.id, {
        resultType: "artifact_version",
        artifactId: "artifact-1",
        resultData: {
          sections: [{ id: "shot-1" }],
          finishReason: "stop",
          usage: { inputTokens: 120, outputTokens: 30, totalTokens: 150 },
        },
      });
    });

    expect(spy).toHaveBeenCalledWith(
      `[ai-task-runner] taskId=${task.id} taskType=script.draft status=awaiting_confirmation finishReason=stop usage={"inputTokens":120,"outputTokens":30,"totalTokens":150} candidateCount=1`,
    );
  });

  it("reuses the active lease when the same task is wrapped by a nested production entry", async () => {
    const service = makeService(db, clock);
    const task = await service.createTask(ctx, {
      taskType: "script.draft",
      attemptId: "018f8d8a-90ab-7def-8123-live-runner-06",
      inputData: {},
    });
    let nestedExecutions = 0;

    const outer = await service.runClaimedTaskExecution(
      ctx,
      task.id,
      async ({ signal: outerSignal }) => {
        const nested = await service.runClaimedTaskExecution(
          ctx,
          task.id,
          async ({ signal: nestedSignal }) => {
            nestedExecutions += 1;
            expect(nestedSignal).toBe(outerSignal);
            await service.recordCandidate(ctx, task.id, {
              resultType: "artifact_version",
              artifactId: "artifact-1",
              resultData: { body: "nested lease reuse" },
            });
            return "nested";
          },
        );
        expect(nested).toEqual({ claimed: true, value: "nested" });
      },
    );

    expect(outer.claimed).toBe(true);
    expect(nestedExecutions).toBe(1);
    expect((await service.getTask(ctx, task.id)).status).toBe(
      "awaiting_confirmation",
    );
    expect(
      (await service.listSteps(ctx, task.id)).filter(
        (step) => step.kind === "model_call_started",
      ),
    ).toHaveLength(1);
  });

  it("a reclaimed lease cannot leave a candidate row or report success through legacy methods", async () => {
    const service = makeService(db, clock);
    const task = await service.createTask(ctx, {
      taskType: "script.draft",
      attemptId: "018f8d8a-90ab-7def-8123-live-runner-02",
      inputData: {},
    });
    const repo = createAiRepository(db, {
      now: () => clock.now,
      nextId: (prefix) => `${prefix}-inspect-stale`,
      userId: ctx.userId,
      accountId: ctx.accountId!,
    });

    await expect(
      service.runClaimedTaskExecution(ctx, task.id, async () => {
        const claimed = await repo.requireTask(task.id);
        expect(claimed.leaseToken).toBeTruthy();
        clock.now = "2026-07-24T00:05:01.000Z";
        expect(
          await repo.reconcileExpiredAiTaskExecution(
            task.id,
            claimed.leaseToken!,
          ),
        ).toBe("reconciliation_required");

        await service.recordCandidate(ctx, task.id, {
          resultType: "artifact_version",
          artifactId: "artifact-1",
          resultData: { body: "must roll back" },
        });
        await service.markSucceeded(ctx, task.id);
      }),
    ).rejects.toMatchObject({ name: "ExecutionLeaseLostError" });

    expect(await service.listResults(ctx, task.id)).toHaveLength(0);
    expect((await service.getTask(ctx, task.id)).status).toBe("failed");
  });

  it("candidate insert failure rolls back awaiting_confirmation in the same lease transaction", async () => {
    let seq = 0;
    const service = makeService(db, clock, (prefix) =>
      prefix === "ai-result" ? "ai-result-collision" : `${prefix}-${++seq}`,
    );
    const task = await service.createTask(ctx, {
      taskType: "script.draft",
      attemptId: "018f8d8a-90ab-7def-8123-live-runner-04",
      inputData: {},
    });
    await service.recordAuxResult(ctx, task.id, {
      resultType: "audit",
      resultData: { existing: true },
    });

    await expect(
      service.runClaimedTaskExecution(ctx, task.id, async () => {
        await service.recordCandidate(ctx, task.id, {
          resultType: "artifact_version",
          artifactId: "artifact-1",
          resultData: { body: "must not partially commit" },
        });
      }),
    ).rejects.toThrow();

    expect((await service.getTask(ctx, task.id)).status).toBe("running");
    expect(await service.listResults(ctx, task.id)).toEqual([
      expect.objectContaining({
        resultType: "audit",
        resultData: { existing: true },
      }),
    ]);
  });

  it("renews a live execution on the 30 second heartbeat before allowing success", async () => {
    const service = makeService(db, clock);
    const task = await service.createTask(ctx, {
      taskType: "script.draft",
      attemptId: "018f8d8a-90ab-7def-8123-live-runner-05",
      inputData: {},
    });
    const repo = createAiRepository(db, {
      now: () => clock.now,
      nextId: (prefix) => `${prefix}-inspect-renewal`,
      userId: ctx.userId,
      accountId: ctx.accountId!,
    });
    let entered!: () => void;
    const hasEntered = new Promise<void>((resolve) => {
      entered = resolve;
    });
    let release!: () => void;
    const waitForRelease = new Promise<void>((resolve) => {
      release = resolve;
    });

    vi.useFakeTimers();
    try {
      const running = service.runClaimedTaskExecution(ctx, task.id, async () => {
        entered();
        await waitForRelease;
        await service.markSucceeded(ctx, task.id);
      });
      await hasEntered;

      clock.now = "2026-07-24T00:00:30.000Z";
      await vi.advanceTimersByTimeAsync(30_000);
      expect((await repo.requireTask(task.id)).leaseExpiresAt).toBe(
        "2026-07-24T00:05:30.000Z",
      );
      release();

      await expect(running).resolves.toMatchObject({ claimed: true });
      expect((await repo.requireTask(task.id)).status).toBe("succeeded");
    } finally {
      vi.useRealTimers();
    }
  });

  it("binds legacy failed and cancelled terminal writes to the active lease", async () => {
    const service = makeService(db, clock);
    const failedTask = await service.createTask(ctx, {
      taskType: "script.draft",
      attemptId: "018f8d8a-90ab-7def-8123-live-runner-07",
      inputData: {},
    });
    const cancelledTask = await service.createTask(ctx, {
      taskType: "script.draft",
      attemptId: "018f8d8a-90ab-7def-8123-live-runner-08",
      inputData: {},
    });

    await expect(
      service.runClaimedTaskExecution(ctx, failedTask.id, async () => {
        await service.markFailed(ctx, failedTask.id, "provider failed");
      }),
    ).resolves.toMatchObject({ claimed: true });
    await expect(
      service.runClaimedTaskExecution(ctx, cancelledTask.id, async () => {
        await service.cancelTask(ctx, cancelledTask.id, "runner cancelled");
      }),
    ).resolves.toMatchObject({ claimed: true });

    expect(await service.getTask(ctx, failedTask.id)).toMatchObject({
      status: "failed",
      errorMessage: "provider failed",
    });
    expect(await service.getTask(ctx, cancelledTask.id)).toMatchObject({
      status: "cancelled",
      errorMessage: "runner cancelled",
    });
  });

  it("heartbeats every 30 seconds and aborts the runner when renewal loses the lease", async () => {
    const service = makeService(db, clock);
    const task = await service.createTask(ctx, {
      taskType: "script.draft",
      attemptId: "018f8d8a-90ab-7def-8123-live-runner-03",
      inputData: {},
    });
    const repo = createAiRepository(db, {
      now: () => clock.now,
      nextId: (prefix) => `${prefix}-inspect-heartbeat`,
      userId: ctx.userId,
      accountId: ctx.accountId!,
    });
    let entered!: (signal: AbortSignal) => void;
    const hasEntered = new Promise<AbortSignal>((resolve) => {
      entered = resolve;
    });
    let release!: () => void;
    const waitForRelease = new Promise<void>((resolve) => {
      release = resolve;
    });

    vi.useFakeTimers();
    try {
      const running = service.runClaimedTaskExecution(
        ctx,
        task.id,
        async ({ signal }) => {
          entered(signal);
          await waitForRelease;
          await service.markSucceeded(ctx, task.id);
        },
      );
      const signal = await hasEntered;

      clock.now = "2026-07-24T00:05:01.000Z";
      await vi.advanceTimersByTimeAsync(30_000);
      expect(signal.aborted).toBe(true);
      release();

      await expect(running).rejects.toMatchObject({
        name: "ExecutionLeaseLostError",
      });
      expect((await repo.requireTask(task.id)).status).toBe("running");
    } finally {
      vi.useRealTimers();
    }
  });
});
