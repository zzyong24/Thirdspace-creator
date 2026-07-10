import { describe, it, expect, beforeEach, vi } from "vitest";
import { createDb, type Db } from "@creatoros/backend";
import type { RequestContext } from "@creatoros/contract";
import {
  createLearningsService,
  type LearningsProjectsPort,
  type LearningsService,
} from "./learnings.service";
import { ConflictError, OwnershipError } from "./learnings.errors";

// Learnings service test (Step 3) — fake now/nextId, pglite db, stubbed ProjectsPort.
// Covers the validationStatus machine (valid + invalid), the confidenceScore
// recompute formula, the cross-user apply guard, and getSuggestions.

const NOW = "2026-06-21T00:00:00.000Z";
const ctx: RequestContext = { userId: "user-a", requestId: "r1", source: "user" };

function makeProjectsPort(): LearningsProjectsPort & {
  assertOwnsProject: ReturnType<typeof vi.fn>;
  recordActivity: ReturnType<typeof vi.fn>;
} {
  return {
    assertOwnsProject: vi.fn(async () => {}),
    recordActivity: vi.fn(async () => {}),
  };
}

function makeService(
  db: Db,
  projects: LearningsProjectsPort,
  tag = "a",
): LearningsService {
  let seq = 0;
  return createLearningsService({
    db,
    now: () => NOW,
    nextId: (prefix: string) => `${prefix}-${tag}-${++seq}`,
    projects,
  });
}

describe("learnings service (validationStatus machine + confidence + apply)", () => {
  let db: Db;
  beforeEach(async () => {
    ({ db } = await createDb());
  });

  it("createLearning yields a candidate strategy learning with zeroed fields", async () => {
    const service = makeService(db, makeProjectsPort());
    const learning = await service.createLearning(ctx, {
      title: "钩子前置",
      insight: "",
    });
    expect(learning.validationStatus).toBe("candidate");
    expect(learning.learningType).toBe("strategy");
    expect(learning.confidenceScore).toBe(0);
    expect(learning.recommendation).toBe("");
    expect(learning.reviewId).toBeNull();
  });

  it("status machine valid: candidate→validated bumps confidence (0 apps → 40)", async () => {
    const service = makeService(db, makeProjectsPort());
    const learning = await service.createLearning(ctx, { title: "L" });
    const evaluated = await service.evaluateLearning(ctx, learning.id, {
      validationStatus: "validated",
    });
    expect(evaluated.validationStatus).toBe("validated");
    expect(evaluated.confidenceScore).toBe(40);
  });

  it("status machine valid: candidate→validated with 2 apps → 80", async () => {
    const projects = makeProjectsPort();
    const service = makeService(db, projects);
    const learning = await service.createLearning(ctx, { title: "L" });
    await service.applyLearning(ctx, learning.id, { projectId: "p1" });
    await service.applyLearning(ctx, learning.id, { projectId: "p2" });
    const evaluated = await service.evaluateLearning(ctx, learning.id, {
      validationStatus: "validated",
    });
    expect(evaluated.confidenceScore).toBe(80); // min(100, 2*20 + 40)
  });

  it("status machine valid: candidate→discarded and validated→discarded succeed", async () => {
    const service = makeService(db, makeProjectsPort());
    const a = await service.createLearning(ctx, { title: "A" });
    const discardedA = await service.evaluateLearning(ctx, a.id, {
      validationStatus: "discarded",
    });
    expect(discardedA.validationStatus).toBe("discarded");

    const b = await service.createLearning(ctx, { title: "B" });
    await service.evaluateLearning(ctx, b.id, { validationStatus: "validated" });
    const discardedB = await service.evaluateLearning(ctx, b.id, {
      validationStatus: "discarded",
    });
    expect(discardedB.validationStatus).toBe("discarded");
  });

  it("status machine invalid transitions throw ConflictError", async () => {
    const service = makeService(db, makeProjectsPort());
    // discarded → validated
    const a = await service.createLearning(ctx, { title: "A" });
    await service.evaluateLearning(ctx, a.id, { validationStatus: "discarded" });
    await expect(
      service.evaluateLearning(ctx, a.id, { validationStatus: "validated" }),
    ).rejects.toBeInstanceOf(ConflictError);

    // validated → candidate
    const b = await service.createLearning(ctx, { title: "B" });
    await service.evaluateLearning(ctx, b.id, { validationStatus: "validated" });
    await expect(
      service.evaluateLearning(ctx, b.id, { validationStatus: "candidate" }),
    ).rejects.toBeInstanceOf(ConflictError);

    // same-state candidate → candidate
    const c = await service.createLearning(ctx, { title: "C" });
    await expect(
      service.evaluateLearning(ctx, c.id, { validationStatus: "candidate" }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("evaluate with omitted validationStatus keeps status, recomputes confidence (2 apps → 40)", async () => {
    const service = makeService(db, makeProjectsPort());
    const learning = await service.createLearning(ctx, { title: "L" });
    await service.applyLearning(ctx, learning.id, { projectId: "p1" });
    await service.applyLearning(ctx, learning.id, { projectId: "p2" });
    const evaluated = await service.evaluateLearning(ctx, learning.id, {});
    expect(evaluated.validationStatus).toBe("candidate");
    expect(evaluated.confidenceScore).toBe(40); // min(100, 2*20 + 0)
  });

  it("applyLearning cross-user project: propagates OwnershipError, inserts no row", async () => {
    const projects = makeProjectsPort();
    projects.assertOwnsProject.mockImplementationOnce(async () => {
      throw new OwnershipError("OwnershipError: project not found: p-other");
    });
    const service = makeService(db, projects);
    const learning = await service.createLearning(ctx, { title: "L" });
    await expect(
      service.applyLearning(ctx, learning.id, { projectId: "p-other" }),
    ).rejects.toBeInstanceOf(OwnershipError);
    // No application row written → confidence recompute sees 0 apps.
    const evaluated = await service.evaluateLearning(ctx, learning.id, {});
    expect(evaluated.confidenceScore).toBe(0);
  });

  it("applyLearning happy path: ownership + activity each called once; DTO defaults", async () => {
    const projects = makeProjectsPort();
    const service = makeService(db, projects);
    const learning = await service.createLearning(ctx, { title: "L" });
    const app = await service.applyLearning(ctx, learning.id, {
      projectId: "p1",
      applicationNote: "试用",
    });
    expect(projects.assertOwnsProject).toHaveBeenCalledTimes(1);
    expect(projects.assertOwnsProject).toHaveBeenCalledWith(ctx, "p1");
    expect(projects.recordActivity).toHaveBeenCalledTimes(1);
    expect(projects.recordActivity).toHaveBeenCalledWith(ctx, {
      projectId: "p1",
      eventType: "learning_applied",
      refId: learning.id,
    });
    expect(app.outcome).toEqual({});
    expect(app.evaluatedAt).toBeNull();
    expect(app.applicationNote).toBe("试用");
  });

  it("getSuggestions returns only validated learnings, confidence desc, length ≤ limit", async () => {
    const service = makeService(db, makeProjectsPort());
    // candidate (excluded)
    await service.createLearning(ctx, { title: "candidate" });
    // validated with 0 apps → 40
    const low = await service.createLearning(ctx, { title: "low" });
    await service.evaluateLearning(ctx, low.id, { validationStatus: "validated" });
    // validated with 2 apps → 80
    const high = await service.createLearning(ctx, { title: "high" });
    await service.applyLearning(ctx, high.id, { projectId: "p1" });
    await service.applyLearning(ctx, high.id, { projectId: "p2" });
    await service.evaluateLearning(ctx, high.id, {
      validationStatus: "validated",
    });

    const suggestions = await service.getSuggestions(ctx, { limit: 5 });
    expect(suggestions.every((s) => s.validationStatus === "validated")).toBe(
      true,
    );
    expect(suggestions.map((s) => s.confidenceScore)).toEqual([80, 40]);

    const capped = await service.getSuggestions(ctx, { limit: 1 });
    expect(capped).toHaveLength(1);
    expect(capped[0]!.confidenceScore).toBe(80);
  });

  it("promoteReviewInsight creates a candidate learning sourced from the review", async () => {
    const service = makeService(db, makeProjectsPort());
    const learning = await service.promoteReviewInsight(ctx, {
      reviewId: "review-1",
      insightTitle: "保留率提升",
      insightBody: "前三秒抛冲突",
      learningType: "hook",
      recommendation: "脚本前置钩子",
    });
    expect(learning.reviewId).toBe("review-1");
    expect(learning.learningType).toBe("hook");
    expect(learning.validationStatus).toBe("candidate");
    expect(learning.recommendation).toBe("脚本前置钩子");
  });
});

// 复盘飞轮回流 轨B (Learning→校准) — suggestCalibrationRule promotes a Learning into a
// CalibrationRuleSuggestion through the injected port. Covers: ownership gate, the
// type→维度 derivation, body override, and the honest no-seam / no-rubric ConflictError.
describe("learnings suggestCalibrationRule (复盘飞轮回流 轨B)", () => {
  let db: Db;
  beforeEach(async () => {
    ({ db } = await createDb());
  });

  function makeCalibrationPort(rubricId: string | null = "rubric-x") {
    const createSuggestion = vi.fn(
      async (
        _ctx: RequestContext,
        input: {
          learningId: string;
          rubricId: string;
          proposedDimension: {
            key: string;
            label: string;
            weight: number;
            description: string;
          };
          rationale: string;
        },
      ) => ({
        id: "calibsug-1",
        userId: "user-a",
        learningId: input.learningId,
        rubricId: input.rubricId,
        status: "pending" as const,
        proposedDimension: input.proposedDimension,
        rationale: input.rationale,
        adoptedVersionId: null,
        createdAt: NOW,
        adoptedAt: null,
      }),
    );
    return {
      resolveCurrentRubricId: vi.fn(async () => rubricId),
      createSuggestion,
    };
  }

  function makeServiceWithCalib(
    calibration: ReturnType<typeof makeCalibrationPort> | undefined,
  ): LearningsService {
    let seq = 0;
    return createLearningsService({
      db,
      now: () => NOW,
      nextId: (prefix: string) => `${prefix}-c-${++seq}`,
      projects: makeProjectsPort(),
      calibration,
    });
  }

  it("derives the 维度建议 from the Learning type and writes a real suggestion", async () => {
    const calib = makeCalibrationPort();
    const service = makeServiceWithCalib(calib);
    // A 'hook' learning (promoteReviewInsight stamps the type).
    const learning = await service.promoteReviewInsight(ctx, {
      reviewId: "review-1",
      insightTitle: "前三秒抛冲突保留率高",
      insightBody: "body",
      learningType: "hook",
      recommendation: "",
    });
    const suggestion = await service.suggestCalibrationRule(
      ctx,
      learning.id,
      {},
    );
    expect(suggestion.status).toBe("pending");
    expect(suggestion.rubricId).toBe("rubric-x");
    expect(suggestion.proposedDimension.key).toBe("hook"); // hook → 钩子强度
    // The port received the ownership-gated learning id + derived rationale.
    expect(calib.createSuggestion).toHaveBeenCalledTimes(1);
    const arg = calib.createSuggestion.mock.calls[0]![1];
    expect(arg.learningId).toBe(learning.id);
    expect(arg.rationale).toContain("前三秒抛冲突保留率高");
  });

  it("honors a body override (dimensionKey/label/weight)", async () => {
    const calib = makeCalibrationPort();
    const service = makeServiceWithCalib(calib);
    const learning = await service.createLearning(ctx, { title: "L" });
    const suggestion = await service.suggestCalibrationRule(ctx, learning.id, {
      dimensionKey: "cta",
      dimensionLabel: "CTA 清晰度",
      weight: 0.3,
      rationale: "自定义",
    });
    expect(suggestion.proposedDimension.key).toBe("cta");
    expect(suggestion.proposedDimension.weight).toBe(0.3);
    expect(suggestion.rationale).toBe("自定义");
  });

  it("rejects a cross-user / unknown learning with OwnershipError (404)", async () => {
    const service = makeServiceWithCalib(makeCalibrationPort());
    await expect(
      service.suggestCalibrationRule(ctx, "learning-nope", {}),
    ).rejects.toBeInstanceOf(OwnershipError);
  });

  it("ConflictError when no calibration seam is wired", async () => {
    const service = makeServiceWithCalib(undefined);
    const learning = await service.createLearning(ctx, { title: "L" });
    await expect(
      service.suggestCalibrationRule(ctx, learning.id, {}),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("ConflictError when there is no rubric to reflow into", async () => {
    const service = makeServiceWithCalib(makeCalibrationPort(null));
    const learning = await service.createLearning(ctx, { title: "L" });
    await expect(
      service.suggestCalibrationRule(ctx, learning.id, {}),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});

// [T-183] 改稿信号沉淀 captureEditDelta。产 edit_delta candidate learning、带 projectId、
// 无变化不误产、提炼失败降级存原始。
describe("learnings service — captureEditDelta (改稿 delta → 品味信号)", () => {
  let db: Db;
  beforeEach(async () => {
    ({ db } = await createDb());
  });

  it("有实质改稿 → 产一条 edit_delta candidate learning(带 projectId,可被裁决台读到)", async () => {
    const service = makeService(db, makeProjectsPort());
    const learning = await service.captureEditDelta(ctx, {
      projectId: "proj-1",
      artifactId: "art-1",
      before: "开场一句非常啰嗦的废话😄\n正文",
      after: "正文\n新钩子",
    });
    expect(learning).not.toBeNull();
    expect(learning!.learningType).toBe("edit_delta");
    expect(learning!.validationStatus).toBe("candidate");
    expect(learning!.projectId).toBe("proj-1");
    // 原始 delta 落在 insight;溯源到脚本 artifact。
    expect(learning!.insight).toContain("新钩子");
    expect(learning!.insight).toContain("art-1");

    // 进裁决台:list(projectId, status=candidate) 读得到。
    const { rows } = await service.listLearnings(
      ctx,
      { limit: 50, offset: 0 },
      { projectId: "proj-1", validationStatus: "candidate" },
    );
    expect(rows.some((r) => r.id === learning!.id)).toBe(true);
  });

  it("无实质变化(前后相同) → 返回 null,不误产", async () => {
    const service = makeService(db, makeProjectsPort());
    const learning = await service.captureEditDelta(ctx, {
      projectId: "proj-1",
      artifactId: "art-1",
      before: "同一段话",
      after: "同一段话",
    });
    expect(learning).toBeNull();
    const { total } = await service.listLearnings(ctx, { limit: 50, offset: 0 });
    expect(total).toBe(0);
  });

  it("提炼失败(summarizer 抛错) → 降级为存原始 before→after,不崩", async () => {
    let seq = 0;
    const service = createLearningsService({
      db,
      now: () => NOW,
      nextId: (prefix: string) => `${prefix}-x-${++seq}`,
      projects: makeProjectsPort(),
      // 注入抛错的摘要器,强制走降级分支。
      summarizeEditDelta: () => {
        throw new Error("boom");
      },
    });
    const learning = await service.captureEditDelta(ctx, {
      projectId: "proj-1",
      artifactId: "art-1",
      before: "AI 产出的原文",
      after: "用户手改后的文",
    });
    expect(learning).not.toBeNull();
    expect(learning!.learningType).toBe("edit_delta");
    expect(learning!.insight).toContain("降级");
    // 原始 before / after 都被保留。
    expect(learning!.insight).toContain("AI 产出的原文");
    expect(learning!.insight).toContain("用户手改后的文");
  });
});
