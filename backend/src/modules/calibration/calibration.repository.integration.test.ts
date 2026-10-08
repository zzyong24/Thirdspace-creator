import { describe, it, expect, beforeEach } from "vitest";
import { createDb, type Db } from "@creatoros/backend";
import {
  createCalibrationRepository,
  type CalibrationRepository,
} from "./calibration.repository";
import { OwnershipError } from "./calibration.errors";

// Calibration repository integration test (Steps 1+2) — pglite-backed. Asserts the
// four tables round-trip (Step 1: jsonb defaults, nullable lockedAt/currentVersionId =
// null, dimensions array order preserved, versionNumber integer) AND that every query
// is user-scoped (Step 2: user A cannot read user B's rubric/prediction →
// OwnershipError), the RubricVersion (rubric_id, version_number) UNIQUE holds +
// listRubricVersions returns ascending, and CalibrationResult is idempotent on the
// UNIQUE prediction_id. Deterministic clock/ids.

const NOW = "2026-06-21T00:00:00.000Z";

// [T-332 S2] RepoDeps.accountId 已收成必填 string(strict 门):缺省固定测试号,
// 「null 全局视图」形态随 SPEC §4.2 裁决删除。
function repoFor(
  db: Db,
  userId: string,
  tag = userId,
  accountId = "acct-default",
): CalibrationRepository {
  let seq = 0;
  return createCalibrationRepository(db, {
    now: () => NOW,
    nextId: (prefix: string) => `${prefix}-${tag}-${++seq}`,
    userId,
    accountId,
  });
}

const DIMENSIONS = [
  { key: "hook", label: "hook 强度", weight: 0.3 },
  { key: "altruism", label: "利他性", weight: 0.2 },
  { key: "persona", label: "人群匹配", weight: 0.2 },
  { key: "cta", label: "CTA 清晰度", weight: 0.15 },
  { key: "product_path", label: "为产品铺路程度", weight: 0.15 },
];

async function createOwnedPrediction(repo: CalibrationRepository) {
  const rubric=await repo.createRubric({name:"结果所属标准"});
  const version=await repo.insertRubricVersion({rubricId:rubric.id,versionNumber:1,dimensions:DIMENSIONS,changeSummary:""});
  return repo.createPrediction({subjectType:"content_output",subjectId:"output-1",rubricVersionId:version.id,predictedMetrics:{},predictedConversion:{},predictedScore:"42.5",confidence:"high"});
}

describe("calibration repository (integration, user-scoped)", () => {
  let db: Db;
  beforeEach(async () => {
    ({ db } = await createDb());
  });

  it("rubric + version round-trip with nullable currentVersionId + dimension order", async () => {
    const repo = repoFor(db, "user-a");
    const rubric = await repo.createRubric({ name: "变现加权评分" });
    expect(rubric.userId).toBe("user-a");
    expect(rubric.name).toBe("变现加权评分");
    expect(rubric.currentVersionId).toBeNull();
    expect(rubric.createdAt).toBe(NOW);

    const v1 = await repo.insertRubricVersion({
      rubricId: rubric.id,
      versionNumber: 1,
      dimensions: DIMENSIONS,
      changeSummary: "",
    });
    expect(v1.versionNumber).toBe(1);
    expect(v1.changeSummary).toBe("");
    expect(v1.dimensions).toEqual(DIMENSIONS); // jsonb array order preserved
    expect((v1.dimensions as { key: string }[])[0]!.key).toBe("hook");

    const patched = await repo.setRubricCurrentVersion(rubric.id, v1.id);
    expect(patched.currentVersionId).toBe(v1.id);
  });

  it("prediction round-trips with jsonb defaults + nullable lockedAt, then lock stamps it", async () => {
    const repo = repoFor(db, "user-a");
    const rubric = await repo.createRubric({ name: "r" });
    const v1 = await repo.insertRubricVersion({
      rubricId: rubric.id,
      versionNumber: 1,
      dimensions: DIMENSIONS,
      changeSummary: "",
    });
    const pred = await repo.createPrediction({
      subjectType: "content_output",
      subjectId: "output-1",
      rubricVersionId: v1.id,
      predictedMetrics: { views: 1000 },
      predictedConversion: { leads: 10 },
      predictedScore: "42.5",
      confidence: "high",
    });
    expect(pred.userId).toBe("user-a");
    expect(pred.status).toBe("draft");
    expect(pred.lockedAt).toBeNull();
    expect(pred.predictedMetrics).toEqual({ views: 1000 });
    expect(pred.predictedConversion).toEqual({ leads: 10 });
    expect(pred.predictedScore).toBe("42.5");

    const locked = await repo.lockPrediction(pred.id);
    expect(locked.status).toBe("locked");
    expect(locked.lockedAt).toBe(NOW);
  });

  it("calibration result round-trips with jsonb deviation + actualMetrics", async () => {
    const repo = repoFor(db, "user-a");
    const prediction=await createOwnedPrediction(repo);
    const result = await repo.createResult({
      predictionId: prediction.id,
      ingestionRunId: "run-1",
      actualMetrics: { views: 1200 },
      deviation: { views: 200 },
    });
    expect(result.userId).toBe("user-a");
    expect(result.predictionId).toBe(prediction.id);
    expect(result.ingestionRunId).toBe("run-1");
    expect(result.actualMetrics).toEqual({ views: 1200 });
    expect(result.deviation).toEqual({ views: 200 });
  });

  it("ownership: user B cannot read user A's rubric / version / prediction", async () => {
    const a = repoFor(db, "user-a");
    const b = repoFor(db, "user-b");
    const rubric = await a.createRubric({ name: "secret" });
    const v1 = await a.insertRubricVersion({
      rubricId: rubric.id,
      versionNumber: 1,
      dimensions: DIMENSIONS,
      changeSummary: "",
    });
    const pred = await a.createPrediction({
      subjectType: "content_output",
      subjectId: "output-1",
      rubricVersionId: v1.id,
      predictedMetrics: {},
      predictedConversion: {},
      predictedScore: "0",
      confidence: "low",
    });

    await expect(b.getRubric(rubric.id)).rejects.toBeInstanceOf(OwnershipError);
    await expect(b.getRubricVersion(v1.id)).rejects.toBeInstanceOf(
      OwnershipError,
    );
    await expect(b.getPrediction(pred.id)).rejects.toBeInstanceOf(
      OwnershipError,
    );
    // A still owns them.
    await expect(a.getPrediction(pred.id)).resolves.toMatchObject({
      id: pred.id,
    });
  });

  it("RubricVersion (rubric_id, version_number) UNIQUE + listRubricVersions ascending", async () => {
    const repo = repoFor(db, "user-a");
    const rubric = await repo.createRubric({ name: "r" });
    await repo.insertRubricVersion({
      rubricId: rubric.id,
      versionNumber: 1,
      dimensions: DIMENSIONS,
      changeSummary: "v1",
    });
    await repo.insertRubricVersion({
      rubricId: rubric.id,
      versionNumber: 2,
      dimensions: DIMENSIONS,
      changeSummary: "v2",
    });
    // Duplicate (rubric_id, version_number) → UNIQUE violation.
    await expect(
      repo.insertRubricVersion({
        rubricId: rubric.id,
        versionNumber: 1,
        dimensions: DIMENSIONS,
        changeSummary: "dup",
      }),
    ).rejects.toThrow();

    const versions = await repo.listRubricVersions(rubric.id);
    expect(versions.map((v) => v.versionNumber)).toEqual([1, 2]);
    expect(await repo.countRubricVersions(rubric.id)).toBe(2);
  });

  it("CalibrationResult idempotent UNIQUE prediction_id (second create returns first row)", async () => {
    const repo = repoFor(db, "user-a");
    const prediction=await createOwnedPrediction(repo);
    const first = await repo.createResult({
      predictionId: prediction.id,
      ingestionRunId: "run-1",
      actualMetrics: { views: 100 },
      deviation: { views: 10 },
    });
    const second = await repo.createResult({
      predictionId: prediction.id,
      ingestionRunId: "run-1",
      actualMetrics: { views: 999 }, // ignored — row already exists
      deviation: { views: 999 },
    });
    expect(second.id).toBe(first.id);
    expect(second.actualMetrics).toEqual({ views: 100 });
    const fetched = await repo.getResultByPrediction(prediction.id);
    expect(fetched?.id).toBe(first.id);
  });

  // --- 复盘飞轮回流 轨B (Learning→校准) CalibrationRuleSuggestion ---

  it("rule-suggestion round-trips, is pending-scoped, idempotent, terminal on adopt, user-scoped", async () => {
    const a = repoFor(db, "user-a");
    const b = repoFor(db, "user-b");
    const dim = {
      key: "altruism",
      label: "利他性",
      weight: 0.2,
      description: "复盘回流维度",
    };
    const s1 = await a.createRuleSuggestion({
      learningId: "learning-1",
      rubricId: "rubric-a",
      proposedDimension: dim,
      rationale: "复盘结论",
    });
    expect(s1.userId).toBe("user-a");
    expect(s1.status).toBe("pending");
    expect(s1.proposedDimension).toEqual(dim);
    expect(s1.adoptedVersionId).toBeNull();
    expect(s1.adoptedAt).toBeNull();
    // Idempotent on pending (learning, rubric).
    const s1b = await a.createRuleSuggestion({
      learningId: "learning-1",
      rubricId: "rubric-a",
      proposedDimension: dim,
      rationale: "复盘结论",
    });
    expect(s1b.id).toBe(s1.id);
    // Pending list scoping — user A sees 1, user B sees none.
    const listA = await a.listPendingRuleSuggestions({ limit: 20, offset: 0 });
    expect(listA.total).toBe(1);
    const listB = await b.listPendingRuleSuggestions({ limit: 20, offset: 0 });
    expect(listB.total).toBe(0);
    // Cross-user single read → OwnershipError (404).
    await expect(b.getRuleSuggestion(s1.id)).rejects.toBeInstanceOf(
      OwnershipError,
    );
    // Mark adopted (terminal) — stamps version + adoptedAt; leaves pending list empty.
    const adopted = await a.markRuleSuggestionAdopted(s1.id, {
      status: "adopted",
      adoptedVersionId: "rubricver-2",
    });
    expect(adopted.status).toBe("adopted");
    expect(adopted.adoptedVersionId).toBe("rubricver-2");
    expect(adopted.adoptedAt).toBe(NOW);
    const listAfter = await a.listPendingRuleSuggestions({
      limit: 20,
      offset: 0,
    });
    expect(listAfter.total).toBe(0);
  });

  // [T-332 S2 · ISO-02/08] 号维度 strict 隔离:同一 user 下两个抖音号,
  // rubric→version→prediction 全链盖章 + 恒开号门(无 null 全局视图)。
  it("accountId-scoped repo isolates rubrics/predictions across accounts; create stamps accountId", async () => {
    const repoA = repoFor(db, "user-a", "acc-a", "account-a");
    const repoB = repoFor(db, "user-a", "acc-b", "account-b");

    const rubricA = await repoA.createRubric({ name: "号A rubric" });
    const rubricB = await repoB.createRubric({ name: "号B rubric" });
    expect(rubricA.accountId).toBe("account-a");
    expect(rubricB.accountId).toBe("account-b");

    const vA = await repoA.insertRubricVersion({
      rubricId: rubricA.id,
      versionNumber: 1,
      dimensions: DIMENSIONS,
      changeSummary: "",
    });
    expect(vA.accountId).toBe("account-a");

    const predA = await repoA.createPrediction({
      subjectType: "content_output",
      subjectId: "output-1",
      rubricVersionId: vA.id,
      predictedMetrics: {},
      predictedConversion: {},
      predictedScore: "10",
      confidence: "high",
    });
    expect(predA.accountId).toBe("account-a");

    // 号 B 看不到号 A 的 rubric / prediction(getter 号门 → 404)。
    await expect(repoB.getRubric(rubricA.id)).rejects.toBeInstanceOf(
      OwnershipError,
    );
    await expect(repoB.getPrediction(predA.id)).rejects.toBeInstanceOf(
      OwnershipError,
    );
    // 本号 get 正常。
    expect((await repoA.getRubric(rubricA.id)).id).toBe(rubricA.id);

    // listAllPredictions 号门:A 只见自己那条;B 零交叉。
    expect((await repoA.listAllPredictions()).map((p) => p.id)).toEqual([
      predA.id,
    ]);
    expect((await repoB.listAllPredictions()).map((p) => p.id)).toEqual([]);

    // listRubricVersions 号门。
    expect((await repoA.listRubricVersions(rubricA.id)).map((v) => v.id)).toEqual(
      [vA.id],
    );
    expect(await repoA.countRubricVersions(rubricA.id)).toBe(1);
  });
});
