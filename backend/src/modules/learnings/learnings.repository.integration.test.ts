import { describe, it, expect, beforeEach } from "vitest";
import { createDb, type Db } from "@creatoros/backend";
import { createLearningsRepository } from "./learnings.repository";
import { OwnershipError } from "./learnings.errors";

// Learnings repository integration test (Steps 1+2) — pglite-backed. Asserts the
// schema round-trips with defaults (Step 1) AND that every query is user-scoped:
// ownership user-A-vs-user-B, cross-user apply blocked, pagination order,
// countApplications (Step 2). Deterministic clock/ids (no Date.now/Math.random).

const NOW = "2026-06-21T00:00:00.000Z";

function repoFor(db: Db, userId: string, tag = userId) {
  let seq = 0;
  return createLearningsRepository(db, {
    now: () => NOW,
    nextId: (prefix: string) => `${prefix}-${tag}-${++seq}`,
    userId,
  });
}

describe("learnings repository (integration, user-scoped)", () => {
  let db: Db;
  beforeEach(async () => {
    ({ db } = await createDb());
  });

  it("learnings row round-trips with defaults", async () => {
    const repo = repoFor(db, "user-a");
    const row = await repo.createLearning({
      title: "钩子前置提升完播",
      insight: "",
      learningType: "strategy",
      recommendation: "",
      reviewId: null,
      confidenceScore: 0,
    });
    expect(row.userId).toBe("user-a");
    expect(row.learningType).toBe("strategy");
    expect(row.validationStatus).toBe("candidate");
    expect(row.confidenceScore).toBe(0);
    expect(row.insight).toBe("");
    expect(row.recommendation).toBe("");
    expect(row.reviewId).toBeNull();
    expect(row.createdAt).toBe(NOW);
    expect(row.updatedAt).toBe(NOW);
  });

  it("learning_applications row round-trips with defaults", async () => {
    const repo = repoFor(db, "user-a");
    const learning = await repo.createLearning({
      title: "L",
      insight: "",
      learningType: "strategy",
      recommendation: "",
      reviewId: null,
      confidenceScore: 0,
    });
    const app = await repo.createApplication(learning.id, {
      projectId: "project-1",
      applicationNote: "",
    });
    expect(app.userId).toBe("user-a");
    expect(app.learningId).toBe(learning.id);
    expect(app.projectId).toBe("project-1");
    expect(app.contentOutputId).toBeNull();
    expect(app.applicationNote).toBe("");
    expect(app.outcome).toEqual({});
    expect(app.appliedAt).toBe(NOW);
    expect(app.evaluatedAt).toBeNull();
  });

  it("ownership: user B cannot read user A's learning", async () => {
    const repoA = repoFor(db, "user-a");
    const created = await repoA.createLearning({
      title: "A's learning",
      insight: "",
      learningType: "strategy",
      recommendation: "",
      reviewId: null,
      confidenceScore: 0,
    });
    const repoB = repoFor(db, "user-b");
    await expect(repoB.getLearningRowById(created.id)).rejects.toBeInstanceOf(
      OwnershipError,
    );
    const list = await repoB.listLearnings({ limit: 50, offset: 0 });
    expect(list.total).toBe(0);
  });

  it("createApplication against another user's learning throws OwnershipError", async () => {
    const repoA = repoFor(db, "user-a");
    const created = await repoA.createLearning({
      title: "A's learning",
      insight: "",
      learningType: "strategy",
      recommendation: "",
      reviewId: null,
      confidenceScore: 0,
    });
    const repoB = repoFor(db, "user-b");
    await expect(
      repoB.createApplication(created.id, {
        projectId: "project-x",
        applicationNote: "",
      }),
    ).rejects.toBeInstanceOf(OwnershipError);
  });

  it("listLearnings returns desc(updatedAt) order and honors limit/offset", async () => {
    let seq = 0;
    // Distinct updatedAt per row so ordering is deterministic.
    const repo = createLearningsRepository(db, {
      now: () => `2026-06-2${++seq}T00:00:00.000Z`,
      nextId: (prefix: string) => `${prefix}-${seq}`,
      userId: "user-a",
    });
    const first = await repo.createLearning({
      title: "first",
      insight: "",
      learningType: "strategy",
      recommendation: "",
      reviewId: null,
      confidenceScore: 0,
    });
    const second = await repo.createLearning({
      title: "second",
      insight: "",
      learningType: "strategy",
      recommendation: "",
      reviewId: null,
      confidenceScore: 0,
    });
    const third = await repo.createLearning({
      title: "third",
      insight: "",
      learningType: "strategy",
      recommendation: "",
      reviewId: null,
      confidenceScore: 0,
    });
    void first;
    void third;
    const page = await repo.listLearnings({ limit: 2, offset: 1 });
    expect(page.total).toBe(3);
    // desc(updatedAt): [third, second, first]; offset 1 limit 2 → [second, first].
    expect(page.rows[0]!.id).toBe(second.id);
  });

  it("countApplications returns the per-learning scoped count", async () => {
    const repo = repoFor(db, "user-a");
    const x = await repo.createLearning({
      title: "X",
      insight: "",
      learningType: "strategy",
      recommendation: "",
      reviewId: null,
      confidenceScore: 0,
    });
    const y = await repo.createLearning({
      title: "Y",
      insight: "",
      learningType: "strategy",
      recommendation: "",
      reviewId: null,
      confidenceScore: 0,
    });
    await repo.createApplication(x.id, { projectId: "p1", applicationNote: "" });
    await repo.createApplication(x.id, { projectId: "p2", applicationNote: "" });
    expect(await repo.countApplications(x.id)).toBe(2);
    expect(await repo.countApplications(y.id)).toBe(0);
  });
});
