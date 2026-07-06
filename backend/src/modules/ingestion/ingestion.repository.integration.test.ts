import { describe, it, expect, beforeEach } from "vitest";
import { createDb, type Db } from "@creatoros/backend";
import {
  createIngestionRepository,
  type IngestionRepository,
  type ExternalSourceRow,
} from "./ingestion.repository";
import { OwnershipError } from "./ingestion.errors";

// Tasks 1+2 — db-schema round-trip + user-scoped repository.
//   - the four tables round-trip (ISO text timestamps, jsonb configuration /
//     rejected_payload survive);
//   - ownership: a run/source owned by user-A is invisible to a user-B repo
//     (getRun/listErrors → OwnershipError 404; user A sees it);
//   - the two UNIQUE indexes reject duplicates at the DB layer;
//   - counters bump correctly and a re-pushed record is a no-op (SPEC §17.2).

const NOW = "2026-06-21T00:00:00.000Z";

function makeRepo(db: Db, userId: string): IngestionRepository {
  let seq = 0;
  return createIngestionRepository(db, {
    now: () => NOW,
    nextId: (prefix: string) => `${prefix}-${userId}-${++seq}`,
    userId,
  });
}

const sourceRow = (userId: string, id: string): ExternalSourceRow => ({
  id,
  userId,
  accountId: null,
  sourceType: "mock",
  name: "Mock Source",
  sourceIdentifier: "mock://canonical",
  secretReference: "secret-ref",
  configuration: { region: "cn" },
  createdAt: NOW,
});

describe("ingestion repository — round-trip", () => {
  let db: Db;
  let repoA: IngestionRepository;

  beforeEach(async () => {
    ({ db } = await createDb());
    repoA = makeRepo(db, "user-a");
    await repoA.seedExternalSources([sourceRow("user-a", "src-a")]);
  });

  it("external_source / run / error / record round-trip with jsonb + ISO timestamps", async () => {
    const src = await repoA.getExternalSource("src-a");
    expect(src).toBeDefined();
    expect(src!.configuration).toEqual({ region: "cn" });
    expect(src!.createdAt).toBe(NOW);

    const run = await repoA.createRun({
      externalSourceId: "src-a",
      runType: "metrics",
      idempotencyKey: "idem-1",
    });
    expect(run.status).toBe("pending");
    expect(run.startedAt).toBeNull();
    expect(run.recordsReceived).toBe(0);

    const err = await repoA.appendError({
      ingestionRunId: run.id,
      recordKey: "rk-bad",
      errorCode: "SCHEMA_INVALID",
      errorMessage: "missing capturedAt",
      rejectedPayload: { foo: "bar" },
    });
    const errs = await repoA.listErrors(run.id);
    expect(errs).toHaveLength(1);
    expect(errs[0]!.id).toBe(err.id);
    expect(errs[0]!.rejectedPayload).toEqual({ foo: "bar" });

    await repoA.markRecordResult(run.id, "rk-1", "written");
    const reloaded = await repoA.getRun(run.id);
    expect(reloaded.recordsReceived).toBe(1);
    expect(reloaded.recordsWritten).toBe(1);
    expect(reloaded.recordsRejected).toBe(0);
  });

  it("markRunRunning stamps status + startedAt once; counters track written/rejected", async () => {
    const run = await repoA.createRun({
      externalSourceId: "src-a",
      runType: "metrics",
      idempotencyKey: "idem-run",
    });
    const running = await repoA.markRunRunning(run.id);
    expect(running.status).toBe("running");
    expect(running.startedAt).toBe(NOW);

    // markRunRunning a second time is a no-op (already running).
    const again = await repoA.markRunRunning(run.id);
    expect(again.startedAt).toBe(NOW);

    await repoA.markRecordResult(run.id, "rk-1", "written");
    await repoA.markRecordResult(run.id, "rk-2", "rejected");
    const after = await repoA.getRun(run.id);
    expect(after.recordsReceived).toBe(2);
    expect(after.recordsWritten).toBe(1);
    expect(after.recordsRejected).toBe(1);
  });

  it("a re-pushed record_key is a no-op (counters unchanged) — SPEC §17.2", async () => {
    const run = await repoA.createRun({
      externalSourceId: "src-a",
      runType: "metrics",
      idempotencyKey: "idem-dup",
    });
    expect(await repoA.recordExists(run.id, "rk-1")).toBe(false);
    await repoA.markRecordResult(run.id, "rk-1", "written");
    expect(await repoA.recordExists(run.id, "rk-1")).toBe(true);
    // Second push of the same key — no double-count.
    await repoA.markRecordResult(run.id, "rk-1", "written");
    const after = await repoA.getRun(run.id);
    expect(after.recordsReceived).toBe(1);
    expect(after.recordsWritten).toBe(1);
  });

  it("(external_source_id, idempotency_key) UNIQUE — second createRun with same key throws", async () => {
    await repoA.createRun({
      externalSourceId: "src-a",
      runType: "metrics",
      idempotencyKey: "idem-unique",
    });
    await expect(
      repoA.createRun({
        externalSourceId: "src-a",
        runType: "metrics",
        idempotencyKey: "idem-unique",
      }),
    ).rejects.toThrow();
  });

  it("findRunByIdempotency returns the original run; undefined when absent", async () => {
    const created = await repoA.createRun({
      externalSourceId: "src-a",
      runType: "metrics",
      idempotencyKey: "idem-find",
    });
    const found = await repoA.findRunByIdempotency("src-a", "idem-find");
    expect(found!.id).toBe(created.id);
    expect(await repoA.findRunByIdempotency("src-a", "nope")).toBeUndefined();
  });
});

describe("ingestion repository — multi-tenant ownership", () => {
  let db: Db;
  let repoA: IngestionRepository;
  let repoB: IngestionRepository;

  beforeEach(async () => {
    ({ db } = await createDb());
    repoA = makeRepo(db, "user-a");
    repoB = makeRepo(db, "user-b");
    await repoA.seedExternalSources([sourceRow("user-a", "src-a")]);
  });

  it("user B cannot getRun / listErrors a run owned by user A (OwnershipError 404)", async () => {
    const run = await repoA.createRun({
      externalSourceId: "src-a",
      runType: "metrics",
      idempotencyKey: "idem-own",
    });
    await repoA.appendError({
      ingestionRunId: run.id,
      recordKey: "rk-x",
      errorCode: "SCHEMA_INVALID",
      errorMessage: "x",
      rejectedPayload: {},
    });
    // User A sees it.
    await expect(repoA.getRun(run.id)).resolves.toMatchObject({ id: run.id });
    await expect(repoA.listErrors(run.id)).resolves.toHaveLength(1);
    // User B does not (404, not an existence leak).
    await expect(repoB.getRun(run.id)).rejects.toBeInstanceOf(OwnershipError);
    await expect(repoB.listErrors(run.id)).rejects.toBeInstanceOf(
      OwnershipError,
    );
  });

  it("getExternalSource is user-scoped — user B cannot read user A's source", async () => {
    await expect(repoB.getExternalSource("src-a")).resolves.toBeUndefined();
    await expect(repoA.getExternalSource("src-a")).resolves.toBeDefined();
  });

  it("(ingestion_run_id, record_key) UNIQUE index is enforced at the DB layer", async () => {
    const run = await repoA.createRun({
      externalSourceId: "src-a",
      runType: "metrics",
      idempotencyKey: "idem-rec",
    });
    await repoA.markRecordResult(run.id, "rk-1", "written");
    // The ledger row exists; a second onConflictDoNothing insert is silent.
    await expect(
      repoA.markRecordResult(run.id, "rk-1", "rejected"),
    ).resolves.toBeUndefined();
    const after = await repoA.getRun(run.id);
    expect(after.recordsReceived).toBe(1); // not double-counted
  });
});
