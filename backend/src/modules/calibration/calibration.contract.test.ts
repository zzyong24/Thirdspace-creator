import {learnings} from "../../schema/learnings";
import {seedAdjacentContent} from "../../integration/adjacent-domain-fixtures";
import { describe, it, expect, beforeEach } from "vitest";
import { createDb, type Db } from "@creatoros/backend";
import type {
  Endpoint,
  RequestContext,
  Transport,
} from "@creatoros/contract";
import { createCalibrationService } from "./calibration.service";
import { createCalibrationTransport } from "./calibration.transport";
import {
  rubricResource,
  rubricVersionResource,
  predictionResource,
  calibrationResultResource,
  calibrationRuleSuggestionResource,
} from "./calibration.schema";

// Calibration contract test (Step 4) — for EACH of the 7 op ids, drive the transport
// with a seeded ctx + valid input and assert the op's contract response DTO
// .parse(envelope.data) succeeds (the output validates against the wire shape). The
// peer ports are stubbed (Ingestion run-existence resolves; Learnings no-op). Mirrors
// the monetization contract test.

const NOW = "2026-06-21T00:00:00.000Z";
const ctx: RequestContext = { userId: "user-a", requestId: "r1", source: "user", accountId: "acct-a" }; // [T-332 S2] strict 门下 ctx 必带号

const ep = (id: string) => ({ id }) as unknown as Endpoint;
async function call(
  transport: Transport,
  id: string,
  input: unknown,
): Promise<{ data: unknown }> {
  const res = await transport.request(ep(id), input as never, ctx);
  return res as { data: unknown };
}

function makeService(db: Db) {
  let seq = 0;
  return createCalibrationService({
    db,
    now: () => NOW,
    nextId: (prefix: string) => `${prefix}-${++seq}`,
    ingestion: {
      assertRunExists: async () => {},
      ensureManualRun: async () => "run-manual",
    },
    learnings: { adjustConfidence: async () => {} },
  });
}

function makeTransport(db: Db): Transport {
  // ONE service per transport (the factory returns the same instance every request) so the
  // deterministic id seq stays monotonic across calls — a fresh service per request would
  // reset seq=0 and collide on the predictions PK.
  const service = makeService(db);
  return createCalibrationTransport(() => service);
}

const DIMENSIONS = [
  { key: "hook", label: "hook 强度", weight: 0.4 },
  { key: "persona", label: "人群匹配", weight: 0.3 },
  { key: "cta", label: "CTA 清晰度", weight: 0.3 },
];

async function seedRubric(
  t: Transport,
): Promise<{ rubricId: string; versionId: string }> {
  const r = await call(t, "calibration.rubrics.create", {
    body: { name: "变现加权", dimensions: DIMENSIONS },
  });
  const data = r.data as { id: string; currentVersionId: string };
  return { rubricId: data.id, versionId: data.currentVersionId };
}

async function seedLockedPrediction(t: Transport): Promise<string> {
  const { versionId } = await seedRubric(t);
  const created = await call(t, "calibration.predictions.create", {
    body: {
      subjectType: "content_output",
      subjectId: "output-1",
      rubricVersionId: versionId,
      predictedMetrics: { hook: 10 },
      predictedConversion: { persona: 5, cta: 5 },
      confidence: "high",
    },
  });
  const predId = (created.data as { id: string }).id;
  await call(t, "calibration.predictions.lock", {
    params: { predictionId: predId },
  });
  return predId;
}

describe("calibration contract (each of 7 ops validates against its DTO)", () => {
  let db: Db;
  beforeEach(async () => {
    ({ db } = await createDb());
    await seedAdjacentContent(db,ctx,["output-1","output-2","o"]);
    await db.insert(learnings).values({id:"learning-1",userId:ctx.userId,accountId:ctx.accountId,title:"真实人工确认经验",createdAt:"2026-06-21T00:00:00.000Z",updatedAt:"2026-06-21T00:00:00.000Z"});
  });

  it("calibration.rubrics.create → rubricResource (embedded currentVersion, versionNumber 1)", async () => {
    const t = makeTransport(db);
    const r = await call(t, "calibration.rubrics.create", {
      body: { name: "r", dimensions: DIMENSIONS },
    });
    const dto = rubricResource.parse(r.data);
    expect(dto.currentVersion.versionNumber).toBe(1);
    expect(dto.currentVersionId).toBe(dto.currentVersion.id);
  });

  it("calibration.rubrics.bumpVersion → rubricVersionResource (versionNumber 2)", async () => {
    const t = makeTransport(db);
    const { rubricId } = await seedRubric(t);
    const r = await call(t, "calibration.rubrics.bumpVersion", {
      params: { rubricId },
      body: { dimensions: DIMENSIONS, changeSummary: "tuned" },
    });
    const dto = rubricVersionResource.parse(r.data);
    expect(dto.versionNumber).toBe(2);
  });

  it("calibration.rubrics.get → rubricResource", async () => {
    const t = makeTransport(db);
    const { rubricId } = await seedRubric(t);
    const r = await call(t, "calibration.rubrics.get", {
      params: { rubricId },
    });
    expect(() => rubricResource.parse(r.data)).not.toThrow();
  });

  it("calibration.predictions.create → predictionResource (draft, lockedAt null, numeric score)", async () => {
    const t = makeTransport(db);
    const { versionId } = await seedRubric(t);
    const r = await call(t, "calibration.predictions.create", {
      body: {
        subjectType: "content_output",
        subjectId: "output-1",
        rubricVersionId: versionId,
        predictedMetrics: { hook: 10 },
        predictedConversion: { persona: 5, cta: 5 },
        confidence: "high",
      },
    });
    const dto = predictionResource.parse(r.data);
    expect(dto.status).toBe("draft");
    expect(dto.lockedAt).toBeNull();
    expect(typeof dto.predictedScore).toBe("number");
  });

  it("calibration.predictions.lock → predictionResource (locked, lockedAt set)", async () => {
    const t = makeTransport(db);
    const { versionId } = await seedRubric(t);
    const created = await call(t, "calibration.predictions.create", {
      body: {
        subjectType: "content_output",
        subjectId: "o",
        rubricVersionId: versionId,
        predictedMetrics: {},
        predictedConversion: {},
        confidence: "med",
      },
    });
    const predId = (created.data as { id: string }).id;
    const r = await call(t, "calibration.predictions.lock", {
      params: { predictionId: predId },
    });
    const dto = predictionResource.parse(r.data);
    expect(dto.status).toBe("locked");
    expect(dto.lockedAt).not.toBeNull();
  });

  it("calibration.predictions.get → predictionResource", async () => {
    const t = makeTransport(db);
    const predId = await seedLockedPrediction(t);
    const r = await call(t, "calibration.predictions.get", {
      params: { predictionId: predId },
    });
    expect(() => predictionResource.parse(r.data)).not.toThrow();
  });

  it("calibration.predictions.list → predictionResource[] (createdAt desc, per-dim score derived)", async () => {
    const t = makeTransport(db);
    const { versionId } = await seedRubric(t);
    // Two predictions; the first uses the current nested AI shape, the second keeps the
    // legacy flat shape. Both must derive a non-zero score through the transport.
    await call(t, "calibration.predictions.create", {
      body: {
        subjectType: "content_output",
        subjectId: "output-1",
        rubricVersionId: versionId,
        predictedMetrics: {},
        predictedConversion: {
          dimensions: [
            { key: "hook", score: 4 },
            { key: "persona", score: 5 },
            { key: "cta", score: 3 },
          ],
        },
        confidence: "high",
      },
    });
    await call(t, "calibration.predictions.create", {
      body: {
        subjectType: "content_output",
        subjectId: "output-2",
        rubricVersionId: versionId,
        predictedMetrics: {},
        predictedConversion: { hook: 2, persona: 2, cta: 2 },
        confidence: "low",
      },
    });
    const r = await call(t, "calibration.predictions.list", {
      query: { page: 1, pageSize: 20 },
    });
    const rows = (r.data as unknown[]).map((d) => predictionResource.parse(d));
    expect(rows).toHaveLength(2);
    // createdAt desc — both share NOW, so assert membership rather than order strictly.
    const subjectIds = rows.map((p) => p.subjectId).sort();
    expect(subjectIds).toEqual(["output-1", "output-2"]);
    // Nested per-dim scores landed → predictedScore is the 1–5 weighted sum, NOT 0.
    const first = rows.find((p) => p.subjectId === "output-1")!;
    expect(first.predictedScore).toBeGreaterThan(0);
    // DIMENSIONS weights: hook .4*4 + persona .3*5 + cta .3*3 = 1.6+1.5+0.9 = 4.0
    expect(first.predictedScore).toBeCloseTo(4.0, 4);
  });

  it("calibration.results.create → calibrationResultResource (deviation object, ingestionRunId present)", async () => {
    const t = makeTransport(db);
    const predId = await seedLockedPrediction(t);
    const r = await call(t, "calibration.results.create", {
      params: { predictionId: predId },
      body: { ingestionRunId: "run-1", actualMetrics: { hook: 12 } },
    });
    const dto = calibrationResultResource.parse(r.data);
    expect(dto.ingestionRunId).toBe("run-1");
    expect(typeof dto.deviation).toBe("object");
  });

  // --- 复盘飞轮回流 轨B (Learning→校准) ---

  it("calibration.suggestions.list → calibrationRuleSuggestionResource[] (pending only)", async () => {
    const t = makeTransport(db);
    const svc = makeService(db);
    const { rubricId } = await seedRubric(t);
    // The Learnings service reaches this seam through the injected port; here we call the
    // public service directly to seed a real CalibrationRuleSuggestion row.
    await svc.createRuleSuggestion(ctx, {
      learningId: "learning-1",
      rubricId,
      proposedDimension: {
        key: "altruism",
        label: "利他性",
        weight: 0.2,
        description: "复盘回流维度",
      },
      rationale: "复盘结论回流",
    });
    const r = await call(t, "calibration.suggestions.list", {
      query: { page: 1, pageSize: 20 },
    });
    const rows = (r.data as unknown[]).map((row) =>
      calibrationRuleSuggestionResource.parse(row),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe("pending");
    expect(rows[0]!.learningId).toBe("learning-1");
    expect(rows[0]!.proposedDimension.key).toBe("altruism");
  });

  it("calibration.suggestions.adopt → rubricVersionResource (folds dim, renormalized Σ=1, marks adopted)", async () => {
    const t = makeTransport(db);
    const svc = makeService(db);
    const { rubricId } = await seedRubric(t);
    const sug = await svc.createRuleSuggestion(ctx, {
      learningId: "learning-1",
      rubricId,
      proposedDimension: {
        key: "altruism",
        label: "利他性",
        weight: 0.2,
        description: "复盘回流维度",
      },
      rationale: "复盘结论回流",
    });
    const r = await call(t, "calibration.suggestions.adopt", {
      params: { suggestionId: sug.id },
    });
    const version = rubricVersionResource.parse(r.data);
    // The new version appends the proposed dimension (DIMENSIONS had hook/persona/cta).
    expect(version.versionNumber).toBe(2);
    const keys = version.dimensions.map((d) => d.key);
    expect(keys).toContain("altruism");
    const sum = version.dimensions.reduce((acc, d) => acc + d.weight, 0);
    expect(sum).toBeCloseTo(1.0, 4);
    // The suggestion is now terminal: a re-list returns it no longer (pending-only).
    const list = await call(t, "calibration.suggestions.list", {
      query: { page: 1, pageSize: 20 },
    });
    expect(list.data as unknown[]).toHaveLength(0);
  });

  // [T-063e] 忽略:终态 dismissed,不 bump rubric(版本链不动、adoptedVersionId 留 null)。
  it("calibration.suggestions.dismiss → calibrationRuleSuggestionResource (terminal, NO rubric bump)", async () => {
    const t = makeTransport(db);
    const svc = makeService(db);
    const { rubricId } = await seedRubric(t);
    const sug = await svc.createRuleSuggestion(ctx, {
      learningId: "learning-1",
      rubricId,
      proposedDimension: {
        key: "altruism",
        label: "利他性",
        weight: 0.2,
        description: "复盘回流维度",
      },
      rationale: "复盘结论回流",
    });
    const r = await call(t, "calibration.suggestions.dismiss", {
      params: { suggestionId: sug.id },
    });
    const dto = calibrationRuleSuggestionResource.parse(r.data);
    expect(dto.status).toBe("dismissed");
    expect(dto.adoptedVersionId).toBeNull();
    // rubric 版本链未动:current version 仍是 v1(没有因忽略被 bump)。
    const rub = await call(t, "calibration.rubrics.get", {
      params: { rubricId },
    });
    expect(
      (rub.data as { currentVersion: { versionNumber: number } }).currentVersion
        .versionNumber,
    ).toBe(1);
    // pending 列表清空;重复忽略 → ConflictError(终态守卫)。
    const list = await call(t, "calibration.suggestions.list", {
      query: { page: 1, pageSize: 20 },
    });
    expect(list.data as unknown[]).toHaveLength(0);
    await expect(
      call(t, "calibration.suggestions.dismiss", {
        params: { suggestionId: sug.id },
      }),
    ).rejects.toThrow(/already dismissed/);
  });
});
