import { describe, it, expect, afterEach } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { OBSERVABILITY_DDL } from "../../schema/observability";
import { createObservabilityCollector } from "./collector";
const ctx = {
  userId: "isolated-user",
  requestId: "test",
  source: "user" as const,
};
const opened: PGlite[] = [];
afterEach(async () => {
  await Promise.all(opened.splice(0).map((c) => c.close()));
});
async function setup() {
  const pg = new PGlite();
  opened.push(pg);
  await pg.exec(OBSERVABILITY_DDL);
  let at = "2026-10-12T00:00:00.000Z";
  const db = drizzle(pg) as never;
  const collector = createObservabilityCollector(db, {
    now: () => at,
    uploadAvailable: () => true,
    writeEncryptedContext: () => {},
  });
  return {
    collector,
    advance: () => {
      at = "2026-10-13T00:00:00.000Z";
    },
    db,
  };
}
describe("T1255 durable daily claims and consent", () => {
  it("defaults to no authorization and does not claim", async () => {
    const { collector } = await setup();
    expect((await collector.status(ctx)).enabled).toBe(false);
    expect(await collector.claimRound(ctx)).toBeNull();
  });
  it("explicit v2 begins 24h later, failures and restarts retain the attempt", async () => {
    const { collector, advance, db } = await setup();
    await collector.setConsent(ctx, {
      enabled: true,
      metricsEnabled: true,
      consentVersion: 2,
    });
    expect(await collector.claimRound(ctx)).toBeNull();
    advance();
    const result = await Promise.all([
      collector.claimRound(ctx),
      collector.claimRound(ctx),
    ]);
    expect(result.filter(Boolean)).toHaveLength(1);
    const restarted = createObservabilityCollector(db, {
      now: () => "2026-10-13T01:00:00.000Z",
      uploadAvailable: () => true,
      writeEncryptedContext: () => {},
    });
    expect(await restarted.claimRound(ctx)).toBeNull();
  });
  it("revoke cancels data and preserves daily attempt", async () => {
    const { collector, advance } = await setup();
    await collector.setConsent(ctx, {
      enabled: true,
      metricsEnabled: true,
      consentVersion: 2,
    });
    advance();
    await collector.claimRound(ctx);
    const before = (await collector.status(ctx)).lastAttemptAt;
    await collector.setConsent(ctx, {
      enabled: false,
      metricsEnabled: false,
      consentVersion: 2,
    });
    expect((await collector.status(ctx)).lastAttemptAt).toBe(before);
    expect(await collector.claimRound(ctx)).toBeNull();
  });
  it("counts request success apart from task unknown and never puts context into metrics", async () => {
    const { collector } = await setup();
    await collector.setConsent(ctx, {
      enabled: false,
      metricsEnabled: true,
      consentVersion: 2,
    });
    await collector.recordOutcome(ctx, {
      eventId: "request-one",
      operationId: "ai.tasks.create",
      measurement: "request",
      result: "success",
      occurredAt: "2026-10-12T00:01:00.000Z",
    });
    await collector.recordOutcome(ctx, {
      eventId: "task-one",
      operationId: "task.ai_task",
      measurement: "task",
      result: "unknown",
      occurredAt: "2026-10-12T00:02:00.000Z",
    });
    await collector.recordException(ctx, {
      eventId: crypto.randomUUID(),
      module: "ui",
      code: "UNCLASSIFIED_EXCEPTION",
      occurredAt: "2026-10-12T00:03:00.000Z",
      referenceId: null,
      stack: "private stack",
      message: "private content",
    });
    const pending = await collector.sealBatch(ctx, {
      appVersion: "1.2.0",
      osName: "macos",
    });
    expect(pending?.body).not.toContain("private");
    const body = JSON.parse(pending!.body);
    expect(body.operations.map((v: any) => [v.measurement, v.result])).toEqual([
      ["request", "success"],
      ["task", "unknown"],
    ]);
    expect(
      await collector.sealBatch(ctx, { appVersion: "1.2.0", osName: "macos" }),
    ).toEqual(pending);
  });
});

it("rolls up fixed request dimensions without losing counts beyond batch group bound", async () => {
  const { collector } = await setup();
  await collector.setConsent(ctx, {
    enabled: false,
    metricsEnabled: true,
    consentVersion: 2,
  });
  for (let index = 0; index < 105; index++)
    await collector.recordOutcome(ctx, {
      eventId: `request-${index}`,
      operationId: "ai.tasks.create",
      measurement: "request",
      result: "success",
      occurredAt: "2026-10-12T00:01:00.000Z",
      executionSeconds: 1,
    });
  const batch = await collector.sealBatch(ctx, {
    appVersion: "1.2.0",
    osName: "macos",
  });
  const body = JSON.parse(batch!.body);
  expect(body.operations).toHaveLength(1);
  expect(body.operations[0].count).toBe(105);
  expect(body.operations[0].executionDuration.count).toBe(105);
  await collector.recordOutcome(ctx, {
    eventId: "next",
    operationId: "ai.tasks.create",
    measurement: "request",
    result: "success",
    occurredAt: "2026-10-12T00:01:00.000Z",
  });
  await collector.acknowledgeBatch(
    ctx,
    batch!.batchId,
    batch!.bodySha256,
    batch!.batchId,
  );
  const next = await collector.sealBatch(ctx, {
    appVersion: "1.2.0",
    osName: "macos",
  });
  expect(JSON.parse(next!.body).operations[0].count).toBe(1);
});
it("remote pause survives expired config and first severe context survives sampling zero", async () => {
  const pg = new PGlite();
  opened.push(pg);
  await pg.exec(OBSERVABILITY_DDL);
  const contexts: unknown[] = [];
  let now = "2026-10-12T00:00:00.000Z";
  const collector = createObservabilityCollector(drizzle(pg) as never, {
    now: () => now,
    uploadAvailable: () => true,
    writeEncryptedContext: (event) => contexts.push(event),
  });
  await collector.setConsent(ctx, {
    enabled: false,
    metricsEnabled: true,
    consentVersion: 2,
  });
  await collector.saveConfig({
    revision: 1,
    enabled: false,
    reportIntervalHours: 48,
    maxRoundBytes: 65536,
    uploadBytesPerSecond: 16384,
    captureLevel: "error",
    debugExpiresAt: null,
    exceptionSampleRate: 0,
    scopeModules: ["ui"],
    expiresAt: "2026-10-13T00:00:00.000Z",
  });
  for (let i = 0; i < 2; i++)
    await collector.recordException(ctx, {
      eventId: crypto.randomUUID(),
      module: "ui",
      code: "UNCLASSIFIED_EXCEPTION",
      occurredAt: now,
      referenceId: null,
      stack: "private fixture",
      message: "private fixture",
    });
  expect(contexts).toHaveLength(1);
  now = "2026-10-15T00:00:00.000Z";
  expect((await collector.status(ctx)).remotePaused).toBe(true);
  expect((await collector.claimRound(ctx))!.config.reportIntervalHours).toBe(
    48,
  );
  const batch = await collector.sealBatch(ctx, {
    appVersion: "1.2.0",
    osName: "macos",
  });
  expect(JSON.parse(batch!.body).exceptions).toHaveLength(2);
});
it("native metadata is counted once across delivered batches and subsequent restarts", async () => {
  const { collector } = await setup();
  await collector.setConsent(ctx, {
    enabled: false,
    metricsEnabled: true,
    consentVersion: 2,
  });
  const event = {
    eventId: "a".repeat(64),
    code: "HOST_PANIC",
    occurredAt: "2026-10-12T00:01:00.000Z",
    logSessionId: "b".repeat(64),
  };
  expect(await collector.recordNativeException(ctx, event)).toBe(true);
  const first = await collector.sealBatch(ctx, {
    appVersion: "1.2.0",
    osName: "macos",
  });
  expect(JSON.parse(first!.body).exceptions[0].logSessionId).toBe(
    event.logSessionId,
  );
  await collector.acknowledgeBatch(
    ctx,
    first!.batchId,
    first!.bodySha256,
    first!.batchId,
  );
  expect(await collector.recordNativeException(ctx, event)).toBe(false);
  expect(
    await collector.sealBatch(ctx, { appVersion: "1.2.0", osName: "macos" }),
  ).toBeNull();
});

it("aggregates 200 separate minute rows into one original UTC day group and separates later days", async () => {
  const { collector } = await setup();
  await collector.setConsent(ctx, {
    enabled: false,
    metricsEnabled: true,
    consentVersion: 2,
  });
  for (let index = 0; index < 200; index++)
    await collector.recordOutcome(ctx, {
      eventId: `minute-${index}`,
      measurement: "request",
      operationId: "ai.tasks.create",
      result: "success",
      occurredAt: new Date(
        Date.parse("2026-10-12T00:00:00.000Z") + index * 60000,
      ).toISOString(),
    });
  await collector.recordOutcome(ctx, {
    eventId: "day-two",
    measurement: "request",
    operationId: "ai.tasks.create",
    result: "success",
    occurredAt: "2026-10-13T00:02:00.000Z",
  });
  const batches = await collector.sealBatches(
    ctx,
    { appVersion: "1.2.0", osName: "macos" },
    4,
  );
  expect(batches).toHaveLength(2);
  const payloads = batches
    .map((v) => JSON.parse(v.body))
    .sort((a, b) => a.windowStart.localeCompare(b.windowStart));
  expect(payloads[0].operations[0].count).toBe(200);
  expect(payloads[0].windowStart.slice(0, 10)).toBe("2026-10-12");
  expect(payloads[0].windowEnd.slice(0, 10)).toBe("2026-10-12");
  expect(payloads[1].operations[0].count).toBe(1);
  expect(payloads[1].windowStart.slice(0, 10)).toBe("2026-10-13");
});
it("same code preserves distinct stack first contexts and a new 60 second window with sampling zero", async () => {
  const pg = new PGlite();
  opened.push(pg);
  await pg.exec(OBSERVABILITY_DDL);
  const contexts: unknown[] = [];
  const collector = createObservabilityCollector(drizzle(pg) as never, {
    now: () => "2026-10-12T00:00:00.000Z",
    uploadAvailable: () => true,
    writeEncryptedContext: (event) => contexts.push(event),
  });
  await collector.setConsent(ctx, {
    enabled: true,
    metricsEnabled: true,
    consentVersion: 2,
  });
  await collector.saveConfig({
    revision: 1,
    enabled: true,
    reportIntervalHours: 24,
    maxRoundBytes: 65536,
    uploadBytesPerSecond: 16384,
    captureLevel: "error",
    debugExpiresAt: null,
    exceptionSampleRate: 0,
    scopeModules: ["ui"],
    expiresAt: "2027-01-01T00:00:00.000Z",
  });
  for (const [stack, at] of [
    ["original-frame-a", "2026-10-12T00:00:00.000Z"],
    ["original-frame-a", "2026-10-12T00:00:02.000Z"],
    ["original-frame-b", "2026-10-12T00:00:03.000Z"],
    ["original-frame-a", "2026-10-12T00:01:03.000Z"],
  ])
    await collector.recordException(ctx, {
      eventId: crypto.randomUUID(),
      module: "ui",
      code: "UNCLASSIFIED_EXCEPTION",
      occurredAt: at,
      referenceId: null,
      stack,
      message: "fake",
    });
  expect(contexts).toHaveLength(3);
  const batch = await collector.sealBatch(ctx, {
    appVersion: "1.2.0",
    osName: "macos",
  });
  expect(JSON.parse(batch!.body).exceptions).toHaveLength(4);
});
it("continuous metrics grant survives log-only edits; re-enabling excludes revoked interval and parses epoch", async () => {
  const pg = new PGlite();
  opened.push(pg);
  await pg.exec(OBSERVABILITY_DDL);
  let now = "2026-10-12T00:00:00.999Z";
  const collector = createObservabilityCollector(drizzle(pg) as never, {
    now: () => now,
    uploadAvailable: () => true,
    writeEncryptedContext: () => {},
  });
  await collector.setConsent(ctx, {
    enabled: true,
    metricsEnabled: true,
    consentVersion: 2,
  });
  now = "2026-10-12T00:02:00.000Z";
  await collector.setConsent(ctx, {
    enabled: false,
    metricsEnabled: true,
    consentVersion: 2,
  });
  const event = {
    eventId: "c".repeat(64),
    code: "HOST_PANIC",
    occurredAt: "2026-10-12T00:01:00Z",
    logSessionId: "d".repeat(64),
  };
  expect(await collector.recordNativeException(ctx, event)).toBe(true);
  expect(
    await collector.recordNativeException(ctx, {
      ...event,
      eventId: "e".repeat(64),
      occurredAt: "2026-10-12T00:00:00Z",
    }),
  ).toBe(false);
  now = "2026-10-12T00:03:00.000Z";
  await collector.setConsent(ctx, {
    enabled: false,
    metricsEnabled: false,
    consentVersion: 2,
  });
  now = "2026-10-12T00:05:00.000Z";
  await collector.setConsent(ctx, {
    enabled: false,
    metricsEnabled: true,
    consentVersion: 2,
  });
  expect(
    await collector.recordNativeException(ctx, {
      ...event,
      eventId: "f".repeat(64),
      occurredAt: "2026-10-12T00:04:00Z",
    }),
  ).toBe(false);
});
