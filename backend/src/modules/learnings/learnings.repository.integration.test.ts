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

  // [T-118a gate-F3] createLearning 持久化 projectId(nullable);默认(不传)为 null。
  it("createLearning persists projectId (nullable, default null)", async () => {
    const repo = repoFor(db, "user-a");
    const withProject = await repo.createLearning({
      title: "本作品经验",
      insight: "",
      learningType: "hook",
      recommendation: "",
      reviewId: null,
      projectId: "project-abc",
      confidenceScore: 0,
    });
    expect(withProject.projectId).toBe("project-abc");
    const legacy = await repo.createLearning({
      title: "手录经验",
      insight: "",
      learningType: "strategy",
      recommendation: "",
      reviewId: null,
      confidenceScore: 0,
    });
    expect(legacy.projectId).toBeNull();
  });

  // [T-118a] listLearnings 的 additive 过滤:projectId + validationStatus 窄化;不传时全量;
  // 归属门始终最外层(跨用户过滤内层)。
  it("listLearnings narrows by projectId + validationStatus; empty filter = all", async () => {
    const repo = repoFor(db, "user-a");
    // A 的项目 P 的 candidate 经验。
    const pCand = await repo.createLearning({
      title: "P candidate",
      insight: "",
      learningType: "hook",
      recommendation: "",
      reviewId: null,
      projectId: "project-P",
      confidenceScore: 0,
    });
    // A 的项目 P 的 validated 经验(状态不同,应被 candidate 过滤排除)。
    const pValidated = await repo.createLearning({
      title: "P validated",
      insight: "",
      learningType: "hook",
      recommendation: "",
      reviewId: null,
      projectId: "project-P",
      confidenceScore: 0,
    });
    await repo.updateLearningStatus(pValidated.id, {
      validationStatus: "validated",
      confidenceScore: 40,
    });
    // A 的项目 Q 的 candidate 经验(项目不同,应被 project-P 过滤排除)。
    await repo.createLearning({
      title: "Q candidate",
      insight: "",
      learningType: "hook",
      recommendation: "",
      reviewId: null,
      projectId: "project-Q",
      confidenceScore: 0,
    });
    // A 的无项目 candidate 经验(projectId=null,应被 project-P 过滤排除)。
    await repo.createLearning({
      title: "orphan candidate",
      insight: "",
      learningType: "strategy",
      recommendation: "",
      reviewId: null,
      confidenceScore: 0,
    });

    // projectId=project-P + validationStatus=candidate → 只出 pCand。
    const narrowed = await repo.listLearnings(
      { limit: 50, offset: 0 },
      { projectId: "project-P", validationStatus: "candidate" },
    );
    expect(narrowed.total).toBe(1);
    expect(narrowed.rows.map((r) => r.id)).toEqual([pCand.id]);

    // 只按 projectId 过滤(不限状态)→ P 下两条(candidate + validated)。
    const byProject = await repo.listLearnings(
      { limit: 50, offset: 0 },
      { projectId: "project-P" },
    );
    expect(byProject.total).toBe(2);
    expect(new Set(byProject.rows.map((r) => r.id))).toEqual(
      new Set([pCand.id, pValidated.id]),
    );

    // 不传过滤 → 全量(4 条)。
    const all = await repo.listLearnings({ limit: 50, offset: 0 });
    expect(all.total).toBe(4);
  });

  // [T-118a] 归属门最外层:B 用 A 的 projectId 过滤读到 0(过滤在归属门内层,永不越界)。
  it("listLearnings projectId filter never leaks across users (ownership outermost)", async () => {
    const repoA = repoFor(db, "user-a");
    await repoA.createLearning({
      title: "A's P candidate",
      insight: "",
      learningType: "hook",
      recommendation: "",
      reviewId: null,
      projectId: "project-shared",
      confidenceScore: 0,
    });
    const repoB = repoFor(db, "user-b");
    const leaked = await repoB.listLearnings(
      { limit: 50, offset: 0 },
      { projectId: "project-shared", validationStatus: "candidate" },
    );
    expect(leaked.total).toBe(0);
    expect(leaked.rows).toHaveLength(0);
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
