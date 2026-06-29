import { describe, it, expect, beforeEach } from "vitest";
import { createDb, type Db } from "@creatoros/backend";
import type { RequestContext } from "@creatoros/contract";
import {
  createLearningsService,
  type LearningsService,
  type LearningsProjectsPort,
} from "./learnings.service";
import {
  createCalibrationService,
  type CalibrationService,
} from "@/server/modules/calibration";

// 复盘飞轮回流 轨B (Learning→校准) — end-to-end integration over ONE pglite db, wiring the
// REAL Learnings service to the REAL Calibration service through the same injected port the
// composition root binds (NO fakes on the calibration side). Proves the flywheel:
//
//   1. a 复盘 Learning exists;
//   2. learnings.suggestCalibrationRule → a REAL CalibrationRuleSuggestion lands in the db;
//   3. the 校准中心 (calibration.listRuleSuggestions) READS it back (目标中心可读);
//   4. calibration.adoptRuleSuggestion bumps the rubric (a NEW RubricVersion folds the dim in,
//      renormalized) AND the suggestion goes terminal (no longer pending).
//
// This is the "Learning→回流 write 真落库 + 目标中心可读" acceptance the plan calls out.

const NOW = "2026-06-21T00:00:00.000Z";
const ctx: RequestContext = { userId: "user-a", requestId: "r1", source: "user" };

const noopProjects: LearningsProjectsPort = {
  assertOwnsProject: async () => {},
  recordActivity: async () => {},
};

// A mutable holder for the target rubric id the reflow resolver resolves to — the test sets
// it after creating the rubric (the composition root resolves the canonical rubric instead).
function wire(
  db: Db,
  rubricIdRef: { current: string | null },
): {
  learnings: LearningsService;
  calibration: CalibrationService;
} {
  let seq = 0;
  const nextId = (prefix: string) => `${prefix}-${++seq}`;
  const calibration = createCalibrationService({
    db,
    now: () => NOW,
    nextId,
    ingestion: { assertRunExists: async () => {} },
    learnings: { adjustConfidence: async () => {} },
  });
  const learnings = createLearningsService({
    db,
    now: () => NOW,
    nextId,
    projects: noopProjects,
    // The SAME port the composition root binds: resolve the user's rubric + create the
    // suggestion through the calibration PUBLIC service (no cross-module repo import). Here
    // the resolver returns the test's created rubric id (the composition root resolves the
    // shared canonical rubric).
    calibration: {
      resolveCurrentRubricId: async () => rubricIdRef.current,
      createSuggestion: (c, input) => calibration.createRuleSuggestion(c, input),
    },
  });
  return { learnings, calibration };
}

describe("Learning→校准 飞轮回流 (cross-module, real services)", () => {
  let db: Db;
  beforeEach(async () => {
    ({ db } = await createDb());
  });

  it("reflows a Learning into a real suggestion the 校准中心 reads + adopts (rubric bumped)", async () => {
    const rubricIdRef: { current: string | null } = { current: null };
    const { learnings, calibration } = wire(db, rubricIdRef);

    // Seed a rubric the reflow targets (createRubric requires ≥1 变现加权 dim + Σ=1).
    const rubric = await calibration.createRubric(ctx, {
      name: "变现加权评分标准",
      dimensions: [
        { key: "hook", label: "钩子强度", weight: 0.4 },
        { key: "product_path", label: "为产品铺路", weight: 0.3 },
        { key: "cta", label: "CTA 清晰度", weight: 0.3 },
      ],
    });
    rubricIdRef.current = rubric.id; // the reflow resolver now targets this rubric

    // A 复盘 Learning (hook type → 钩子强度 维度建议).
    const learning = await learnings.promoteReviewInsight(ctx, {
      reviewId: "review-1",
      insightTitle: "前15秒抛冲突保留率显著高",
      insightBody: "复盘三条数据印证",
      learningType: "hook",
      recommendation: "脚本前置钩子",
    });

    // 2. 回流 → a REAL CalibrationRuleSuggestion lands.
    const suggestion = await learnings.suggestCalibrationRule(
      ctx,
      learning.id,
      {},
    );
    expect(suggestion.status).toBe("pending");
    expect(suggestion.learningId).toBe(learning.id);
    expect(suggestion.rubricId).toBe(rubric.id);
    expect(suggestion.proposedDimension.key).toBe("hook");

    // 3. 目标中心可读 — the 校准中心 lists the SAME row back.
    const list = await calibration.listRuleSuggestions(ctx, {
      limit: 20,
      offset: 0,
    });
    expect(list.total).toBe(1);
    expect(list.rows[0]!.id).toBe(suggestion.id);
    expect(list.rows[0]!.rationale).toContain("前15秒抛冲突保留率显著高");

    // 4. 采纳 → a NEW RubricVersion folds the dim in (renormalized Σ=1), suggestion terminal.
    const version = await calibration.adoptRuleSuggestion(ctx, suggestion.id);
    expect(version.versionNumber).toBe(2);
    const sum = version.dimensions.reduce((acc, d) => acc + d.weight, 0);
    expect(sum).toBeCloseTo(1.0, 4);
    // hook existed → replaced (not duplicated).
    expect(version.dimensions.filter((d) => d.key === "hook")).toHaveLength(1);
    // The rubric's current version now points at v2.
    const refetched = await calibration.getRubric(ctx, rubric.id);
    expect(refetched.currentVersion.versionNumber).toBe(2);
    // The suggestion is terminal — the pending list is empty.
    const after = await calibration.listRuleSuggestions(ctx, {
      limit: 20,
      offset: 0,
    });
    expect(after.total).toBe(0);
  });

  it("a Learning with no rubric reflows into nothing (honest ConflictError)", async () => {
    const { learnings } = wire(db, { current: null }); // resolver returns null → no rubric
    const learning = await learnings.createLearning(ctx, { title: "L" });
    await expect(
      learnings.suggestCalibrationRule(ctx, learning.id, {}),
    ).rejects.toThrowError(); // ConflictError — no rubric to bump
  });
});
