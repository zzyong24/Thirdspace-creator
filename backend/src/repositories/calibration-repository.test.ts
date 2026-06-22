import { describe, it, expect, beforeEach } from "vitest";
import { createDb, type Db } from "../db";
import {
  createCalibrationRepository,
  type CalibrationRepository,
  type RepoDeps,
} from "./calibration-repository";

const FIXED_NOW = "2026-06-13T02:00:00.000Z"; // contract iso8601 (UTC, .000Z)

// Deterministic deps factory — ids are namespaced per userId so two repos backed
// by the SAME pglite store never collide on primary keys (cross-user tests).
function deterministicDeps(userId: string): RepoDeps {
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
let repo: CalibrationRepository;

beforeEach(async () => {
  ({ db } = await createDb()); // fresh in-memory pglite per test
  repo = createCalibrationRepository(db, deterministicDeps("user-1"));
});

describe("CalibrationRepository (pglite-backed real persistence)", () => {
  it("creates a rubric with its v1 version and reads it back from SQL", async () => {
    const created = await repo.createRubric({
      name: "变现加权",
      dimensions: [{ key: "hook", label: "Hook 强度", weight: 0.4 }],
      changeSummary: "initial",
    });
    expect(created.id).toBe("rubric-user-1-1");
    expect(created.currentVersionId).toBe("rubric-version-user-1-1");
    expect(created.currentVersion.versionNumber).toBe(1);
    expect(created.currentVersion.dimensions).toEqual([
      { key: "hook", label: "Hook 强度", weight: 0.4 },
    ]);

    const list = await repo.listRubrics();
    expect(list.map((r) => r.id)).toContain("rubric-user-1-1");

    const fetched = await repo.getRubric("rubric-user-1-1");
    expect(fetched.name).toBe("变现加权");
    expect(fetched.currentVersion.versionNumber).toBe(1);
  });

  it("throws for a missing rubric", async () => {
    await expect(repo.getRubric("nope")).rejects.toThrow(/not found/);
  });

  // Key invariant: editing a rubric APPENDS an immutable version (never updates).
  it("bumps rubric version append-only and repoints currentVersionId", async () => {
    const rubric = await repo.createRubric({ name: "R", dimensions: [] });
    const v1Id = rubric.currentVersionId;

    const v2 = await repo.bumpRubricVersion(rubric.id, {
      dimensions: [{ key: "cta", label: "CTA 清晰度", weight: 0.3 }],
      changeSummary: "add cta",
    });
    expect(v2.versionNumber).toBe(2);

    // currentVersionId repointed; v1 row untouched (still present in the chain).
    const after = await repo.getRubric(rubric.id);
    expect(after.currentVersionId).toBe(v2.id);
    expect(after.currentVersionId).not.toBe(v1Id);

    const versions = await repo.listRubricVersions(rubric.id);
    expect(versions.map((v) => v.versionNumber)).toEqual([1, 2]);
    // v1 immutable: its dimensions are still the original empty array.
    expect(versions[0]!.dimensions).toEqual([]);
  });

  it("creates a prediction (draft), coerces predictedScore to number, reads it back", async () => {
    const p = await repo.createPrediction({
      subjectType: "content_output",
      subjectId: "co-1",
      rubricVersionId: "rv-1",
      predictedScore: 87.5,
      confidence: "high",
    });
    expect(p.status).toBe("draft");
    expect(p.lockedAt).toBeNull();
    expect(p.predictedScore).toBe(87.5);
    expect(typeof p.predictedScore).toBe("number");

    const fetched = await repo.getPrediction(p.id);
    expect(fetched.predictedScore).toBe(87.5);

    const list = await repo.listPredictions();
    expect(list.map((x) => x.id)).toContain(p.id);
  });

  // FSM invariant: draft→locked is terminal; re-lock is rejected (盲预测不可改).
  it("locks a draft prediction and rejects re-locking", async () => {
    const p = await repo.createPrediction({
      subjectType: "publication",
      subjectId: "pub-1",
      rubricVersionId: "rv-1",
      confidence: "med",
    });
    const locked = await repo.lockPrediction(p.id);
    expect(locked.status).toBe("locked");
    expect(locked.lockedAt).toBe(FIXED_NOW);

    await expect(repo.lockPrediction(p.id)).rejects.toThrow(/not draft/);
  });

  // Key invariant: one CalibrationResult per prediction; idempotent recycle.
  it("records a calibration result idempotently (one row per prediction)", async () => {
    const p = await repo.createPrediction({
      subjectType: "content_output",
      subjectId: "co-1",
      rubricVersionId: "rv-1",
      confidence: "low",
    });
    const first = await repo.recordResult(p.id, {
      ingestionRunId: "ingest-1",
      actualMetrics: { views: 1000 },
      deviation: { views: 0.1 },
    });
    expect(first.predictionId).toBe(p.id);
    expect(first.actualMetrics).toEqual({ views: 1000 });

    // Re-submit is a no-op insert — returns the SAME existing row.
    const second = await repo.recordResult(p.id, {
      ingestionRunId: "ingest-2",
      actualMetrics: { views: 9999 },
    });
    expect(second.id).toBe(first.id);
    expect(second.actualMetrics).toEqual({ views: 1000 }); // unchanged

    const fetched = await repo.getResultByPrediction(p.id);
    expect(fetched?.id).toBe(first.id);
  });

  // Ownership: a rubric owned by user-1 is invisible to user-2 → same not-found.
  it("isolates rubrics by owner (cross-user is not found)", async () => {
    const mine = await repo.createRubric({ name: "Mine", dimensions: [] });

    const otherRepo = createCalibrationRepository(db, deterministicDeps("user-2"));
    await expect(otherRepo.getRubric(mine.id)).rejects.toThrow(/not found/);
    expect(await otherRepo.listRubrics()).toHaveLength(0);
  });

  it("isolates predictions by owner (cross-user is not found)", async () => {
    const mine = await repo.createPrediction({
      subjectType: "content_output",
      subjectId: "co-1",
      rubricVersionId: "rv-1",
      confidence: "high",
    });
    const otherRepo = createCalibrationRepository(db, deterministicDeps("user-2"));
    await expect(otherRepo.getPrediction(mine.id)).rejects.toThrow(/not found/);
  });
});
