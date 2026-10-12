import { describe, it, expect, vi } from "vitest";
import { createDb, executionTasks, eq } from "@creatoros/backend";
import { createPersistentTaskService } from "../execution/persistent-task.service";
import { createObservabilityCollector } from "./collector";
import { createObservabilityTaskLedger } from "./task-ledger";
const ctx = {
  userId: "user-a",
  accountId: "account-a",
  requestId: "fixture",
  source: "user" as const,
};
describe("T1255 original persistent ledger observation", () => {
  it("real claim keeps original lease and records true first start; observer failure leaves business usable", async () => {
    const opened = await createDb();
    let at = "2026-10-12T00:00:00.000Z";
    try {
      const collector = createObservabilityCollector(opened.db, {
        now: () => at,
        uploadAvailable: () => true,
        writeEncryptedContext: () => {},
      });
      const ledger = createObservabilityTaskLedger(opened.db, collector);
      await collector.setConsent(ctx, {
        enabled: false,
        metricsEnabled: true,
        consentVersion: 2,
      });
      const tasks = createPersistentTaskService(opened.db, {
        now: () => at,
        observeAttempt: ledger.observeAttempt,
        observeSettlement: ledger.observeSettlement,
      });
      const task = await tasks.enqueue(ctx, {
        kind: "source_sync",
        ownerType: "source",
        ownerId: "fake-source",
        idempotencyKey: "one",
        payload: {},
        maxAttempts: 2,
      });
      at = "2026-10-12T00:01:00.000Z";
      const claim = await tasks.claimTask({
        taskId: task.id,
        workerId: "worker",
      });
      expect(claim?.task.status).toBe("running");
      await vi.waitFor(
        async () => {
          const state = await opened.client.query(
            "SELECT started_at FROM observability_attempt_clocks",
          );
          expect(state.rows).toEqual([{ started_at: at }]);
        },
        { timeout: 120000 },
      );
      at = "2026-10-12T00:02:00.000Z";
      await opened.db
        .update(executionTasks)
        .set({ status: "partial", updatedAt: at })
        .where(eq(executionTasks.id, task.id));
      expect((await tasks.get(ctx, task.id)).runtimeStatus).toBe("partial");
      await ledger.sweep(ctx);
      await ledger.sweep(ctx);
      const batch = await collector.sealBatch(ctx, {
        appVersion: "1.2.0",
        osName: "macos",
      });
      const body = JSON.parse(batch!.body);
      expect(body.operations[0].result).toBe("partial");
      expect(body.operations[0].count).toBe(1);
      expect(body.operations[0].queueDuration.sumSeconds).toBe(60);
      expect(body.operations[0].executionDuration.sumSeconds).toBe(60);
      const broken = createPersistentTaskService(opened.db, {
        now: () => at,
        observeAttempt: async () => {
          throw Error("COLLECTOR_FIXTURE_FAILED");
        },
      });
      const second = await broken.enqueue(ctx, {
        kind: "source_sync",
        ownerType: "source",
        ownerId: "fake-source-2",
        idempotencyKey: "two",
        payload: {},
        maxAttempts: 2,
      });
      expect(
        (await broken.claimTask({ taskId: second.id, workerId: "worker" }))
          ?.task.status,
      ).toBe("running");
    } finally {
      await opened.client.close();
    }
  });
  it("legacy missing clocks and unknown_result are not fabricated as success or zero durations", async () => {
    const opened = await createDb();
    try {
      let at = "2026-10-12T00:00:00.000Z";
      const collector = createObservabilityCollector(opened.db, {
        now: () => at,
        uploadAvailable: () => true,
        writeEncryptedContext: () => {},
      });
      const ledger = createObservabilityTaskLedger(opened.db, collector);
      await collector.setConsent(ctx, {
        enabled: false,
        metricsEnabled: true,
        consentVersion: 2,
      });
      const tasks = createPersistentTaskService(opened.db, { now: () => at });
      const task = await tasks.enqueue(ctx, {
        kind: "source_sync",
        ownerType: "source",
        ownerId: "fake-legacy",
        idempotencyKey: "legacy",
        payload: {},
        maxAttempts: 2,
      });
      at = "2026-10-12T00:01:00.000Z";
      await opened.db
        .update(executionTasks)
        .set({ status: "unknown_result", updatedAt: at })
        .where(eq(executionTasks.id, task.id));
      expect((await tasks.get(ctx, task.id)).runtimeStatus).toBe(
        "unknown_result",
      );
      await ledger.sweep(ctx);
      const batch = await collector.sealBatch(ctx, {
        appVersion: "1.2.0",
        osName: "macos",
      });
      const value = JSON.parse(batch!.body).operations[0];
      expect(value.result).toBe("unknown");
      expect(value.queueDuration).toBeNull();
      expect(value.executionDuration).toBeNull();
      expect(value.attemptSuccess).toBe(0);
    } finally {
      await opened.client.close();
    }
  });
});

import { createContinuousExecutionBudget } from "@creatoros/contract/execution-worker";
it("real persistent retry chain counts two failed attempts and one success once without call rows", async () => {
  const opened = await createDb();
  let at = "2026-10-12T00:00:00.000Z";
  try {
    const collector = createObservabilityCollector(opened.db, {
      now: () => at,
      uploadAvailable: () => true,
      writeEncryptedContext: () => {},
    });
    const ledger = createObservabilityTaskLedger(opened.db, collector);
    await collector.setConsent(ctx, {
      enabled: false,
      metricsEnabled: true,
      consentVersion: 2,
    });
    const tasks = createPersistentTaskService(opened.db, {
      now: () => at,
      observeAttempt: ledger.observeAttempt,
      observeSettlement: ledger.observeSettlement,
    });
    const task = await tasks.enqueue(ctx, {
      kind: "topic_preview",
      ownerType: "transform",
      ownerId: "fake-transform",
      idempotencyKey: "retry-chain",
      payload: {},
      executionBudget: createContinuousExecutionBudget(),
      maxAttempts: 3,
    });
    for (let attempt = 1; attempt <= 3; attempt++) {
      at = new Date(
        Date.parse("2026-10-12T00:00:00.000Z") + attempt * 60000,
      ).toISOString();
      const claim = await tasks.claimTask({
        taskId: task.id,
        workerId: "worker",
      });
      expect(claim!.lease.attempt).toBe(attempt);
      at = new Date(Date.parse(at) + 10000).toISOString();
      await tasks.finish({
        taskId: task.id,
        workerId: "worker",
        attempt: claim!.lease.attempt,
        fenceToken: claim!.lease.fenceToken,
        status: attempt === 3 ? "succeeded" : "retry_wait",
        retryAfterMs: 1000,
        errorCode: attempt === 3 ? undefined : "TOPIC_PREVIEW_TIMEOUT",
      });
      await vi.waitFor(
        async () => {
          const rows = await opened.client.query(
            "SELECT finished_at FROM observability_attempt_clocks WHERE attempt=$1",
            [attempt],
          );
          expect(
            (rows.rows[0] as { finished_at: string } | undefined)?.finished_at,
          ).toBe(at);
        },
        { timeout: 120000 },
      );
      await ledger.sweep(ctx);
    }
    await ledger.sweep(ctx);
    const batches = await collector.sealBatches(
      ctx,
      { appVersion: "1.2.0", osName: "macos" },
      4,
    );
    const operations = batches.flatMap(
      (batch) => JSON.parse(batch.body).operations,
    );
    expect(operations.reduce((n, row) => n + row.attemptFailed, 0)).toBe(2);
    expect(operations.reduce((n, row) => n + row.attemptSuccess, 0)).toBe(1);
    expect(operations.reduce((n, row) => n + row.count, 0)).toBe(1);
    expect(operations.find((row) => row.result === "success").count).toBe(1);
  } finally {
    await opened.client.close();
  }
});

it("same original attempt unknown becomes confirmed success once and never invents execution duration", async () => {
  const opened = await createDb();
  let at = "2026-10-12T00:00:00.000Z";
  try {
    const collector = createObservabilityCollector(opened.db, {
      now: () => at,
      uploadAvailable: () => true,
      writeEncryptedContext: () => {},
    });
    const ledger = createObservabilityTaskLedger(opened.db, collector);
    await collector.setConsent(ctx, {
      enabled: false,
      metricsEnabled: true,
      consentVersion: 2,
    });
    const tasks = createPersistentTaskService(opened.db, {
      now: () => at,
      observeAttempt: ledger.observeAttempt,
      observeSettlement: async () => {
        throw Error("lost callback fixture");
      },
    });
    const task = await tasks.enqueue(ctx, {
      kind: "source_sync",
      ownerType: "source",
      ownerId: "fake-source-unknown",
      idempotencyKey: "unknown",
      payload: {},
      maxAttempts: 2,
    });
    at = "2026-10-12T00:01:00.000Z";
    const claim = await tasks.claimTask({
      taskId: task.id,
      workerId: "worker",
    });
    expect(claim?.lease.attempt).toBe(1);
    await vi.waitFor(
      async () => {
        expect(
          (
            await opened.client.query(
              "SELECT attempt FROM observability_attempt_clocks",
            )
          ).rows,
        ).toHaveLength(1);
      },
      { timeout: 120000 },
    );
    at = "2026-10-12T00:02:00.000Z";
    await opened.db
      .update(executionTasks)
      .set({ status: "unknown_result", updatedAt: at })
      .where(eq(executionTasks.id, task.id));
    await ledger.sweep(ctx);
    const unknown = await collector.sealBatch(ctx, {
      appVersion: "1.2.0",
      osName: "macos",
    });
    const first = JSON.parse(unknown!.body).operations[0];
    expect(first.result).toBe("unknown");
    expect(first.attemptFailed).toBe(0);
    expect(first.executionDuration).toBeNull();
    await collector.acknowledgeBatch(
      ctx,
      unknown!.batchId,
      unknown!.bodySha256,
      unknown!.batchId,
    );
    at = "2026-10-12T00:03:00.000Z";
    await opened.db
      .update(executionTasks)
      .set({ status: "succeeded", updatedAt: at })
      .where(eq(executionTasks.id, task.id));
    await ledger.sweep(ctx);
    await ledger.sweep(ctx);
    const confirmed = await collector.sealBatch(ctx, {
      appVersion: "1.2.0",
      osName: "macos",
    });
    const result = JSON.parse(confirmed!.body).operations[0];
    expect(result.result).toBe("success");
    expect(result.attemptSuccess).toBe(1);
    expect(result.attemptFailed).toBe(0);
    expect(result.count).toBe(1);
    expect(result.executionDuration).toBeNull();
  } finally {
    await opened.client.close();
  }
});
