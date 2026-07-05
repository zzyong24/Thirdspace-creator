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
      reuseCount: 3,
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
        reuseCount: 0,
        createdAt: "2026-04-28T02:00:00.000Z",
        updatedAt: "2026-04-28T02:00:00.000Z",
      });
      expect(l.learningType).toBe(learningType);
    },
  );

  // Post-production learningType (GAP-EXP-edit). Additive: the 后期剪辑 stage now has
  // a real source value while every legacy/monetization value keeps parsing above.
  it("accepts the editing learningType", () => {
    const l = learningResource.parse({
      id: "learning-editing",
      userId: "user-zyongzhu",
      reviewId: null,
      learningType: "editing",
      title: "粗剪先定节奏再调色",
      insight: "先把叙事节奏锁死再进精剪，返工率明显下降。",
      recommendation: "后期阶段固化：节奏 → 精剪 → 调色 三段顺序。",
      validationStatus: "validated",
      confidenceScore: 72,
      reuseCount: 1,
      createdAt: "2026-04-28T02:00:00.000Z",
      updatedAt: "2026-04-28T02:00:00.000Z",
    });
    expect(l.learningType).toBe("editing");
  });

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

  // [T-118a gate-F3] projectId 是 additive + optional:旧 payload 不带该键仍解析(零破坏),
  // 带了(null 或真值)也解析。
  it("keeps projectId additive+optional on the Learning resource", () => {
    // 旧 payload(无 projectId)仍解析。
    const without = learningResource.parse({
      id: "learning-legacy",
      userId: "user-zyongzhu",
      reviewId: null,
      learningType: "hook",
      title: "t",
      insight: "i",
      recommendation: "r",
      validationStatus: "candidate",
      confidenceScore: 0,
      reuseCount: 0,
      createdAt: "2026-07-04T02:00:00.000Z",
      updatedAt: "2026-07-04T02:00:00.000Z",
    });
    expect(without.projectId).toBeUndefined();
    // 带 projectId 真值。
    const withProject = learningResource.parse({
      ...without,
      projectId: "project-abc",
    });
    expect(withProject.projectId).toBe("project-abc");
    // null(手录/非复盘来源)也合法。
    const nullProject = learningResource.parse({ ...without, projectId: null });
    expect(nullProject.projectId).toBeNull();
  });

  // [T-118a] learnings.list 的 additive 读过滤:projectId + validationStatus 可选;
  // 都不传维持全量(旧调用零破坏);枚举校验 validationStatus。
  it("accepts optional projectId + validationStatus query on learnings.list", () => {
    const q = learningsOperations.listLearnings.query;
    expect(q).toBeDefined();
    // 只带分页(旧调用)仍解析。
    expect(q!.parse({ page: 1, pageSize: 20 })).toMatchObject({
      page: 1,
      pageSize: 20,
    });
    // 带 projectId + validationStatus=candidate(本期经验区读)。
    const filtered = q!.parse({
      page: 1,
      pageSize: 100,
      projectId: "project-abc",
      validationStatus: "candidate",
    });
    expect(filtered.projectId).toBe("project-abc");
    expect(filtered.validationStatus).toBe("candidate");
    // 非法 validationStatus 拒绝。
    expect(() => q!.parse({ validationStatus: "not_a_status" })).toThrow();
  });
});
