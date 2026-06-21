import { describe, it, expect, beforeEach, vi } from "vitest";
import { createDb, type Db } from "@creatoros/backend";
import type { RequestContext } from "@creatoros/contract";
import {
  createCalibrationService,
  type CalibrationService,
  type CalibrationIngestionPort,
  type CalibrationLearningsPort,
} from "./calibration.service";
import {
  ConflictError,
  ValidationError,
  OwnershipError,
} from "./calibration.errors";

// Calibration service test (Step 3) — fake now/nextId, pglite db, stubbed peer services
// (Ingestion run-existence gate + Learnings confidence bridge). Covers: 变现加权
// validation, deterministic predictedScore/deviation, lock idempotency + immutability,
// recordResult RISK-005 guard + locked guard + the §6.3 Learning bridge (fired once).

const NOW = "2026-06-21T00:00:00.000Z";

function ctxFor(userId: string): RequestContext {
  return { userId, requestId: "req-1", source: "user" } as RequestContext;
}

const DIMENSIONS = [
  { key: "hook", label: "hook 强度", weight: 0.4 },
  { key: "persona", label: "人群匹配", weight: 0.3 },
  { key: "cta", label: "CTA 清晰度", weight: 0.3 },
];

describe("calibration service", () => {
  let db: Db;
  let service: CalibrationService;
  let ingestion: CalibrationIngestionPort;
  let learnings: CalibrationLearningsPort;
  let adjustConfidence: CalibrationLearningsPort["adjustConfidence"] &
    ReturnType<typeof vi.fn>;
  let assertRunExists: CalibrationIngestionPort["assertRunExists"] &
    ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    ({ db } = await createDb());
    let seq = 0;
    adjustConfidence = vi.fn(
      async () => {},
    ) as typeof adjustConfidence;
    assertRunExists = vi.fn(async () => {}) as typeof assertRunExists;
    ingestion = { assertRunExists };
    learnings = { adjustConfidence };
    service = createCalibrationService({
      db,
      now: () => NOW,
      nextId: (p: string) => `${p}-${++seq}`,
      ingestion,
      learnings,
    });
  });

  it("createRubric rejects a 播放量-only dimension set (ValidationError)", async () => {
    const ctx = ctxFor("user-a");
    await expect(
      service.createRubric(ctx, {
        name: "纯播放量",
        dimensions: [
          { key: "views", label: "播放量预估", weight: 0.6 },
          { key: "watch_time", label: "完播", weight: 0.4 },
        ],
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("createRubric rejects weights that do not sum to 1.0", async () => {
    const ctx = ctxFor("user-a");
    await expect(
      service.createRubric(ctx, {
        name: "bad weights",
        dimensions: [{ key: "cta", label: "CTA", weight: 0.5 }],
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("createRubric happy path creates v1 + points currentVersion", async () => {
    const ctx = ctxFor("user-a");
    const rubric = await service.createRubric(ctx, {
      name: "变现加权",
      dimensions: DIMENSIONS,
    });
    expect(rubric.currentVersion.versionNumber).toBe(1);
    expect(rubric.currentVersionId).toBe(rubric.currentVersion.id);
    expect(rubric.currentVersion.dimensions).toEqual(DIMENSIONS);
  });

  it("bumpRubricVersion creates v2, re-points currentVersionId, leaves v1 immutable", async () => {
    const ctx = ctxFor("user-a");
    const rubric = await service.createRubric(ctx, {
      name: "r",
      dimensions: DIMENSIONS,
    });
    const v1Id = rubric.currentVersion.id;
    const v2 = await service.bumpRubricVersion(ctx, rubric.id, {
      dimensions: DIMENSIONS,
      changeSummary: "tuned",
    });
    expect(v2.versionNumber).toBe(2);
    const refetched = await service.getRubric(ctx, rubric.id);
    expect(refetched.currentVersionId).toBe(v2.id);
    expect(refetched.currentVersionId).not.toBe(v1Id);
    // v1 still reachable & unchanged via the current-version chain history.
    const currentVer = await service.getCurrentRubricVersion(ctx, rubric.id);
    expect(currentVer.id).toBe(v2.id);
  });

  it("createPrediction derives predictedScore from rubric weights; row is draft/unlocked", async () => {
    const ctx = ctxFor("user-a");
    const rubric = await service.createRubric(ctx, {
      name: "r",
      dimensions: DIMENSIONS,
    });
    const pred = await service.createPrediction(ctx, {
      subjectType: "content_output",
      subjectId: "output-1",
      rubricVersionId: rubric.currentVersion.id,
      predictedMetrics: { hook: 10 },
      predictedConversion: { persona: 20, cta: 30 },
      confidence: "high",
    });
    // 10*0.4 + 20*0.3 + 30*0.3 = 4 + 6 + 9 = 19
    expect(pred.predictedScore).toBe(19);
    expect(pred.status).toBe("draft");
    expect(pred.lockedAt).toBeNull();
  });

  it("createPrediction rejects a cross-user rubric version (OwnershipError)", async () => {
    const a = ctxFor("user-a");
    const b = ctxFor("user-b");
    const rubric = await service.createRubric(a, {
      name: "r",
      dimensions: DIMENSIONS,
    });
    await expect(
      service.createPrediction(b, {
        subjectType: "content_output",
        subjectId: "o",
        rubricVersionId: rubric.currentVersion.id,
        predictedMetrics: {},
        predictedConversion: {},
        confidence: "low",
      }),
    ).rejects.toBeInstanceOf(OwnershipError);
  });

  it("lockPrediction draft→locked stamps lockedAt; second call idempotent (no re-stamp)", async () => {
    const ctx = ctxFor("user-a");
    const rubric = await service.createRubric(ctx, {
      name: "r",
      dimensions: DIMENSIONS,
    });
    const pred = await service.createPrediction(ctx, {
      subjectType: "content_output",
      subjectId: "o",
      rubricVersionId: rubric.currentVersion.id,
      predictedMetrics: {},
      predictedConversion: {},
      confidence: "med",
    });
    const locked = await service.lockPrediction(ctx, pred.id);
    expect(locked.status).toBe("locked");
    expect(locked.lockedAt).toBe(NOW);
    const again = await service.lockPrediction(ctx, pred.id);
    expect(again.status).toBe("locked");
    expect(again.lockedAt).toBe(locked.lockedAt); // idempotent — no re-stamp
  });

  it("recordResult rejects an unlocked prediction (ConflictError)", async () => {
    const ctx = ctxFor("user-a");
    const rubric = await service.createRubric(ctx, {
      name: "r",
      dimensions: DIMENSIONS,
    });
    const pred = await service.createPrediction(ctx, {
      subjectType: "content_output",
      subjectId: "o",
      rubricVersionId: rubric.currentVersion.id,
      predictedMetrics: {},
      predictedConversion: {},
      confidence: "med",
    });
    await expect(
      service.recordResult(ctx, pred.id, {
        ingestionRunId: "run-1",
        actualMetrics: {},
      }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(assertRunExists).not.toHaveBeenCalled();
  });

  it("recordResult bubbles OwnershipError from a 悬空 IngestionRun (RISK-005)", async () => {
    const ctx = ctxFor("user-a");
    const rubric = await service.createRubric(ctx, {
      name: "r",
      dimensions: DIMENSIONS,
    });
    const pred = await service.createPrediction(ctx, {
      subjectType: "content_output",
      subjectId: "o",
      rubricVersionId: rubric.currentVersion.id,
      predictedMetrics: {},
      predictedConversion: {},
      confidence: "med",
    });
    await service.lockPrediction(ctx, pred.id);
    assertRunExists.mockRejectedValueOnce(
      new OwnershipError("OwnershipError: run not found"),
    );
    await expect(
      service.recordResult(ctx, pred.id, {
        ingestionRunId: "ghost-run",
        actualMetrics: {},
      }),
    ).rejects.toBeInstanceOf(OwnershipError);
  });

  it("recordResult happy path computes deviation per key + fires the Learning bridge once", async () => {
    const ctx = ctxFor("user-a");
    const rubric = await service.createRubric(ctx, {
      name: "r",
      dimensions: DIMENSIONS,
    });
    const pred = await service.createPrediction(ctx, {
      subjectType: "content_output",
      subjectId: "o",
      rubricVersionId: rubric.currentVersion.id,
      predictedMetrics: { views: 1000 },
      predictedConversion: { leads: 10 },
      confidence: "high",
    });
    await service.lockPrediction(ctx, pred.id);
    const result = await service.recordResult(ctx, pred.id, {
      ingestionRunId: "run-1",
      actualMetrics: { views: 1200, leads: 8 },
    });
    expect(result.deviation).toMatchObject({ views: 200, leads: -2 });
    expect(result.ingestionRunId).toBe("run-1");
    expect(adjustConfidence).toHaveBeenCalledTimes(1);

    // Idempotent re-submit: same row, NO second bridge call.
    const again = await service.recordResult(ctx, pred.id, {
      ingestionRunId: "run-1",
      actualMetrics: { views: 9999 },
    });
    expect(again.id).toBe(result.id);
    expect(again.deviation).toMatchObject({ views: 200, leads: -2 });
    expect(adjustConfidence).toHaveBeenCalledTimes(1); // not fired again
  });
});
