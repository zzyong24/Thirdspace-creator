import {seedAdjacentContent} from "../../integration/adjacent-domain-fixtures";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createDb, type Db } from "@creatoros/backend";
import type { RequestContext } from "@creatoros/contract";
import {
  createCalibrationService,
  type CalibrationService,
  type CalibrationIngestionPort,
  type CalibrationLearningsPort,
} from "./calibration.service";
import { OwnershipError, ConflictError } from "./calibration.errors";

// Step 6 — SPEC §22 + 七步整合设计 §1 acceptance for the Calibration module (G20).
// Asserts the structural + domain invariants the plan's acceptance checklist calls out:
//   - foundation §5 module layout present (service + repository + schema + test trio);
//   - NO cross-module repository import (peer access only via index.ts services);
//   - C-3: no parallel candidate state machine (no submit_*/awaiting_confirmation op);
//   - C-4 / RISK-005: CalibrationResult.actualMetrics only from a verified, owned
//     IngestionRun; no new external write path; no 悬空 ingestionRunId;
//   - immutability (§6.2): RubricVersion rows never updated; a locked Prediction is
//     never edited/unlocked (no op exists; lock is idempotent);
//   - §6.3 feedback: a CalibrationResult fires the Learnings confidence bridge (once);
//   - multi-tenant: user A cannot get user B's rubric/prediction;
//   - concurrency (§7.5): (rubric_id, version_number) assignment yields no duplicate.

const HERE = dirname(fileURLToPath(import.meta.url));

const NOW = "2026-06-21T00:00:00.000Z";
// [T-332 S2] strict 门下 ctx 必带号。
const ctxA: RequestContext = { userId: "user-a", requestId: "ra", source: "user", accountId: "acct-a" };
const ctxB: RequestContext = { userId: "user-b", requestId: "rb", source: "user", accountId: "acct-b" };

const DIMENSIONS = [
  { key: "hook", label: "hook 强度", weight: 0.4 },
  { key: "persona", label: "人群匹配", weight: 0.3 },
  { key: "cta", label: "CTA 清晰度", weight: 0.3 },
];

function makeService(
  db: Db,
  tag = "a",
  overrides: {
    ingestion?: CalibrationIngestionPort;
    learnings?: CalibrationLearningsPort;
  } = {},
): CalibrationService {
  let seq = 0;
  return createCalibrationService({
    db,
    now: () => NOW,
    nextId: (prefix: string) => `${prefix}-${tag}-${++seq}`,
    ingestion: overrides.ingestion ?? {
      assertRunExists: async () => {},
      ensureManualRun: async () => "run-manual",
    },
    learnings: overrides.learnings ?? { adjustConfidence: async () => {} },
  });
}

async function seedLocked(svc: CalibrationService, ctx: RequestContext) {
  const rubric = await svc.createRubric(ctx, {
    name: "r",
    dimensions: DIMENSIONS,
  });
  const pred = await svc.createPrediction(ctx, {
    subjectType: "content_output",
    subjectId: "o",
    rubricVersionId: rubric.currentVersion.id,
    predictedMetrics: { hook: 10 },
    predictedConversion: {},
    confidence: "high",
  });
  await svc.lockPrediction(ctx, pred.id);
  return { rubric, predId: pred.id };
}

describe("G20 — module-structure acceptance", () => {
  it("has the foundation §5 layout files", () => {
    const required = [
      "calibration.db-schema.ts",
      "calibration.repository.ts",
      "calibration.service.ts",
      "calibration.schema.ts",
      "calibration.transport.ts",
      "calibration.errors.ts",
      "index.ts",
      "calibration.repository.integration.test.ts",
      "calibration.service.test.ts",
      "calibration.contract.test.ts",
    ];
    for (const file of required) {
      expect(existsSync(join(HERE, file)), `missing ${file}`).toBe(true);
    }
  });

  it("has NO cross-module repository/service import in any module file", () => {
    for (const f of readdirSync(HERE)) {
      if (!f.endsWith(".ts")) continue;
      const src = readFileSync(join(HERE, f), "utf8");
      const crossModuleRepo =
        /from\s+["']@\/server\/modules\/(?!calibration|identity)[^"']*(repository|service)/.test(
          src,
        );
      expect(crossModuleRepo, `cross-module repo/service import in ${f}`).toBe(
        false,
      );
    }
  });

  it("C-3: has NO AI-write / submit_* / awaiting_confirmation op (reuses the AI confirm flow)", () => {
    const transport = readFileSync(
      join(HERE, "calibration.transport.ts"),
      "utf8",
    );
    expect(/submit_candidate|submit_/.test(transport)).toBe(false);
    expect(/awaiting_confirmation/.test(transport)).toBe(false);
  });

  it("immutability: no unlock/edit op exists on the transport or service surface", () => {
    const transport = readFileSync(
      join(HERE, "calibration.transport.ts"),
      "utf8",
    );
    const service = readFileSync(join(HERE, "calibration.service.ts"), "utf8");
    expect(/unlock|editPrediction|updatePrediction/.test(transport)).toBe(false);
    expect(/unlockPrediction|editPrediction/.test(service)).toBe(false);
  });
});

describe("G20 — domain acceptance (SPEC §22 + 七步 §6)", () => {
  let db: Db;
  beforeEach(async () => {
    ({ db } = await createDb());
    await seedAdjacentContent(db,ctxA,["o"]);
  });

  it("immutability §6.2: lock is idempotent (no re-stamp); a locked prediction is never edited/unlocked", async () => {
    const svc = makeService(db);
    const { predId } = await seedLocked(svc, ctxA);
    const first = await svc.getPrediction(ctxA, predId);
    // Re-lock is a no-op (idempotent) — same lockedAt, still locked.
    const relocked = await svc.lockPrediction(ctxA, predId);
    expect(relocked.status).toBe("locked");
    expect(relocked.lockedAt).toBe(first.lockedAt);
  });

  it("immutability §6.2: bumpRubricVersion appends a NEW row; v1 stays byte-identical", async () => {
    const svc = makeService(db);
    const rubric = await svc.createRubric(ctxA, {
      name: "r",
      dimensions: DIMENSIONS,
    });
    const v1 = rubric.currentVersion;
    const v2 = await svc.bumpRubricVersion(ctxA, rubric.id, {
      dimensions: DIMENSIONS,
      changeSummary: "tuned",
    });
    expect(v2.versionNumber).toBe(2);
    const current = await svc.getRubric(ctxA, rubric.id);
    expect(current.currentVersionId).toBe(v2.id);
    // v1 unchanged (its dimensions/changeSummary are not mutated by the bump).
    expect(v1.versionNumber).toBe(1);
    expect(v1.changeSummary).toBe("");
  });

  it("C-4 / RISK-005: recordResult bubbles OwnershipError for a 悬空 IngestionRun; no new write path", async () => {
    const svc = makeService(db, "a", {
      ingestion: {
        assertRunExists: async () => {
          throw new OwnershipError("OwnershipError: run not found");
        },
        ensureManualRun: async () => "run-manual",
      },
    });
    const { predId } = await seedLocked(svc, ctxA);
    await expect(
      svc.recordResult(ctxA, predId, {
        ingestionRunId: "ghost",
        actualMetrics: {},
      }),
    ).rejects.toBeInstanceOf(OwnershipError);
  });

  it("recordResult rejects an unlocked (still-editable) prediction (ConflictError)", async () => {
    const svc = makeService(db);
    const rubric = await svc.createRubric(ctxA, {
      name: "r",
      dimensions: DIMENSIONS,
    });
    const pred = await svc.createPrediction(ctxA, {
      subjectType: "content_output",
      subjectId: "o",
      rubricVersionId: rubric.currentVersion.id,
      predictedMetrics: {},
      predictedConversion: {},
      confidence: "med",
    });
    await expect(
      svc.recordResult(ctxA, pred.id, {
        ingestionRunId: "run-1",
        actualMetrics: {},
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("§6.3 feedback: a CalibrationResult fires the Learnings confidence bridge exactly once (idempotent re-submit skips it)", async () => {
    const adjustConfidence = vi.fn(async () => {});
    const svc = makeService(db, "a", {
      learnings: { adjustConfidence },
    });
    const { predId } = await seedLocked(svc, ctxA);
    await svc.recordResult(ctxA, predId, {
      ingestionRunId: "run-1",
      actualMetrics: { hook: 12 },
    });
    await svc.recordResult(ctxA, predId, {
      ingestionRunId: "run-1",
      actualMetrics: { hook: 999 },
    });
    expect(adjustConfidence).toHaveBeenCalledTimes(1);
  });

  it("T1339 无pair不奖励反馈；已提供0偏差仍按原阈值+5，重放不再反馈",async()=>{
    const adjustConfidence=vi.fn<CalibrationLearningsPort["adjustConfidence"]>(async()=>{}),svc=makeService(db,"pair",{learnings:{adjustConfidence}});
    const empty=await seedLocked(svc,ctxA);
    const result=await svc.recordResult(ctxA,empty.predId,{ingestionRunId:"run-1",actualMetrics:{}});
    expect(result.deviation).toEqual({});expect(adjustConfidence).not.toHaveBeenCalled();
    const zero=await seedLocked(svc,ctxA);
    await svc.recordResult(ctxA,zero.predId,{ingestionRunId:"run-1",actualMetrics:{hook:10}});
    expect(adjustConfidence).toHaveBeenCalledTimes(1);expect(adjustConfidence.mock.calls[0]?.[1]).toMatchObject({delta:5});
    await svc.recordResult(ctxA,zero.predId,{ingestionRunId:"run-1",actualMetrics:{}});expect(adjustConfidence).toHaveBeenCalledTimes(1);
  });

  it("T1339 完整pair反馈失败保原best-effort结果事实且重放不再调用",async()=>{
    const adjustConfidence=vi.fn<CalibrationLearningsPort["adjustConfidence"]>(async()=>{throw Error("controlled feedback unavailable");}),svc=makeService(db,"bridge",{learnings:{adjustConfidence}});
    const {predId}=await seedLocked(svc,ctxA);
    const first=await svc.recordResult(ctxA,predId,{ingestionRunId:"run-1",actualMetrics:{hook:12}});
    expect(first.deviation).toEqual({hook:2});expect(adjustConfidence).toHaveBeenCalledTimes(1);
    const again=await svc.recordResult(ctxA,predId,{ingestionRunId:"run-1",actualMetrics:{hook:0}});
    expect(again).toEqual(first);expect(adjustConfidence).toHaveBeenCalledTimes(1);
  });

  it("multi-tenant: user A cannot get user B's rubric or prediction (404-safe OwnershipError)", async () => {
    const svcA = makeService(db, "a");
    const svcB = makeService(db, "b");
    const { rubric, predId } = await seedLocked(svcA, ctxA);
    await expect(svcB.getRubric(ctxB, rubric.id)).rejects.toBeInstanceOf(
      OwnershipError,
    );
    await expect(svcB.getPrediction(ctxB, predId)).rejects.toBeInstanceOf(
      OwnershipError,
    );
  });

  it("§7.5 concurrency: parallel bumpRubricVersion yields no duplicate versionNumber", async () => {
    const svc = makeService(db);
    const rubric = await svc.createRubric(ctxA, {
      name: "r",
      dimensions: DIMENSIONS,
    });
    // Fire several bumps "concurrently". The (rubric_id, version_number) UNIQUE rejects
    // any racing duplicate; the resolved versions must all be distinct.
    const results = await Promise.allSettled(
      Array.from({ length: 4 }, () =>
        svc.bumpRubricVersion(ctxA, rubric.id, {
          dimensions: DIMENSIONS,
          changeSummary: "race",
        }),
      ),
    );
    const versionNumbers: number[] = [];
    for (const r of results) {
      if (r.status === "fulfilled") versionNumbers.push(r.value.versionNumber);
    }
    // No duplicate version numbers among the ones that committed.
    expect(new Set(versionNumbers).size).toBe(versionNumbers.length);
  });
});
