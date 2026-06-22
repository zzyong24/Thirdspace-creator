import { describe, it, expect } from "vitest";
import { learningResource } from "../../src/resources/learnings";
import { learningsOperations } from "../../src/operations/learnings";

describe("learnings contract", () => {
  it("parses a Learning resource", () => {
    const l = learningResource.parse({
      id: "learning-arc-research",
      userId: "user-zyongzhu",
      reviewId: "review-podcast-ep01",
      learningType: "strategy",
      title: "用户调研样本要超过 100 才稳定",
      insight: "首期访谈样本偏少，导致趋势结论不显著。",
      recommendation: "未来研究阶段设定 100 样本硬性门槛。",
      validationStatus: "validated",
      confidenceScore: 81,
      createdAt: "2026-04-28T02:00:00.000Z",
      updatedAt: "2026-04-28T02:00:00.000Z",
    });
    expect(l.learningType).toBe("strategy");
    expect(l.validationStatus).toBe("validated");
  });

  // Monetization-weighted learningType additions (§4.6). Don't weaken: assert
  // both new values parse while legacy values keep working above.
  it.each(["conversion_pattern", "offer_insight"] as const)(
    "accepts monetization learningType %s",
    (learningType) => {
      const l = learningResource.parse({
        id: "learning-monetization",
        userId: "user-zyongzhu",
        reviewId: null,
        learningType,
        title: "t",
        insight: "i",
        recommendation: "r",
        validationStatus: "candidate",
        confidenceScore: 50,
        createdAt: "2026-04-28T02:00:00.000Z",
        updatedAt: "2026-04-28T02:00:00.000Z",
      });
      expect(l.learningType).toBe(learningType);
    },
  );

  it("still rejects an unknown learningType", () => {
    expect(() =>
      learningResource.parse({
        id: "l",
        userId: "u",
        reviewId: null,
        learningType: "not_a_type",
        title: "t",
        insight: "i",
        recommendation: "r",
        validationStatus: "candidate",
        confidenceScore: 0,
        createdAt: "2026-04-28T02:00:00.000Z",
        updatedAt: "2026-04-28T02:00:00.000Z",
      }),
    ).toThrow();
  });

  it("registers the learnings list + application endpoints", () => {
    expect(learningsOperations.listLearnings.method).toBe("GET");
    expect(learningsOperations.listLearnings.path).toBe("/learnings");
    expect(learningsOperations.listLearnings.isList).toBe(true);
    expect(learningsOperations.createLearningApplication.method).toBe("POST");
    expect(learningsOperations.createLearningApplication.path).toBe(
      "/learnings/:learningId/applications",
    );
    expect(learningsOperations.listLearnings.fr.length).toBeGreaterThan(0);
  });
});
