import { describe, it, expect, beforeEach } from "vitest";
import { createDb, type Db } from "../db";
import {
  createIngestionRepository,
  type IngestionRepository,
} from "./ingestion-repository";

const FIXED_NOW = "2026-06-13T10:00:00+08:00";

// Per-userId namespaced ids so two repos sharing one db never collide on PKs.
function deterministicDeps(userId: string) {
  const counters = new Map<string, number>();
  return {
    now: () => FIXED_NOW,
    nextId: (prefix: string) => {
      const n = (counters.get(prefix) ?? 0) + 1;
      counters.set(prefix, n);
      return `${prefix}-${userId}-${n}`;
    },
    userId,
  };
}

let db: Db;
let repo: IngestionRepository;

beforeEach(async () => {
  ({ db } = await createDb()); // fresh in-memory pglite per test
  repo = createIngestionRepository(db, deterministicDeps("user-1"));
});

describe("IngestionRepository (pglite-backed real persistence)", () => {
  it("creates a source + run and reads them back from SQL", async () => {
    const src = await repo.createSource({ sourceType: "notion", name: "我的素材库" });
    expect(src.id).toBe("extsource-user-1-1");
    expect(src.userId).toBe("user-1");

    const sources = await repo.listSources();
    expect(sources.map((s) => s.id)).toContain("extsource-user-1-1");
    expect((await repo.getSource(src.id)).name).toBe("我的素材库");

    const run = await repo.createRun({
      externalSourceId: src.id,
      runType: "full",
      idempotencyKey: "key-1",
    });
    expect(run.status).toBe("pending");
    expect(run.externalSourceId).toBe(src.id);

    const runs = await repo.listRuns(src.id);
    expect(runs.map((r) => r.id)).toContain(run.id);
    expect((await repo.getRun(run.id)).idempotencyKey).toBe("key-1");
  });

  it("throws for a missing source and a missing run", async () => {
    await expect(repo.getSource("nope")).rejects.toThrow(/not found/);
    await expect(repo.getRun("nope")).rejects.toThrow(/not found/);
  });

  // KEY INVARIANT (SPEC §17.1): createRun is idempotent on
  // (externalSourceId, idempotencyKey) — a duplicate returns the ORIGINAL run.
  it("createRun is idempotent on (source, idempotencyKey)", async () => {
    const src = await repo.createSource({ sourceType: "notion", name: "S" });
    const first = await repo.createRun({
      externalSourceId: src.id,
      runType: "full",
      idempotencyKey: "dup",
    });
    const second = await repo.createRun({
      externalSourceId: src.id,
      runType: "full",
      idempotencyKey: "dup",
    });
    expect(second.id).toBe(first.id); // same row, no duplicate
    expect(await repo.listRuns(src.id)).toHaveLength(1);
  });

  // KEY INVARIANT (SPEC §17.2): per-record push is idempotent on
  // (runId, recordKey) — a re-push is a no-op that does NOT re-bump counters.
  it("pushRecord is idempotent and bumps run counters once", async () => {
    const src = await repo.createSource({ sourceType: "notion", name: "S" });
    const run = await repo.createRun({
      externalSourceId: src.id,
      runType: "full",
      idempotencyKey: "k",
    });

    const a = await repo.pushRecord(run.id, { recordKey: "r1", result: "written" });
    expect(a.inserted).toBe(true);
    await repo.pushRecord(run.id, { recordKey: "r2", result: "rejected" });

    // Re-push r1 → no-op, counters unchanged.
    const again = await repo.pushRecord(run.id, { recordKey: "r1", result: "written" });
    expect(again.inserted).toBe(false);

    const persisted = await repo.getRun(run.id);
    expect(persisted.recordsReceived).toBe(2);
    expect(persisted.recordsWritten).toBe(1);
    expect(persisted.recordsRejected).toBe(1);
  });

  it("transitions run status adjacent-only and rejects illegal moves", async () => {
    const src = await repo.createSource({ sourceType: "notion", name: "S" });
    const run = await repo.createRun({
      externalSourceId: src.id,
      runType: "full",
      idempotencyKey: "k",
    });

    const running = await repo.transitionRun(run.id, "running");
    expect(running.status).toBe("running");

    const done = await repo.transitionRun(run.id, "succeeded");
    expect(done.status).toBe("succeeded");
    expect(done.completedAt).toBe(FIXED_NOW);

    // pending -> succeeded is non-adjacent; terminal -> anything is illegal.
    await expect(repo.transitionRun(run.id, "running")).rejects.toThrow(
      /illegal run transition/,
    );
  });

  it("records and lists ingestion errors for a run", async () => {
    const src = await repo.createSource({ sourceType: "notion", name: "S" });
    const run = await repo.createRun({
      externalSourceId: src.id,
      runType: "full",
      idempotencyKey: "k",
    });
    const err = await repo.recordError(run.id, {
      recordKey: "r1",
      errorCode: "PARSE_FAILED",
      errorMessage: "bad json",
      rejectedPayload: { raw: "{" },
    });
    expect(err.errorCode).toBe("PARSE_FAILED");

    const errors = await repo.listErrors(run.id);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.rejectedPayload).toEqual({ raw: "{" });
  });

  // OWNERSHIP: a row owned by another user is invisible — same 404 surface as
  // the reference repos (cross-user read is "not found", never leaks).
  it("does not expose another user's source or run", async () => {
    const src = await repo.createSource({ sourceType: "notion", name: "S" });
    const run = await repo.createRun({
      externalSourceId: src.id,
      runType: "full",
      idempotencyKey: "k",
    });

    const otherRepo = createIngestionRepository(db, deterministicDeps("user-2"));
    await expect(otherRepo.getSource(src.id)).rejects.toThrow(/not found/);
    await expect(otherRepo.getRun(run.id)).rejects.toThrow(/not found/);
    expect(await otherRepo.listSources()).toHaveLength(0);
  });
});
