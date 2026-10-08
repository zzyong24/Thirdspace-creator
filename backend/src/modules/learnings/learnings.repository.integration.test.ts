import {projects as parentProjects,contentOutputs as parentOutputs,publications as parentPublications,reviews as parentReviews} from "@creatoros/backend";
import { describe, it, expect, beforeEach } from "vitest";
import { createDb, type Db } from "@creatoros/backend";
import { createLearningsRepository } from "./learnings.repository";
import { OwnershipError } from "./learnings.errors";

// Learnings repository integration test (Steps 1+2) — pglite-backed. Asserts the
// schema round-trips with defaults (Step 1) AND that every query is user-scoped:
// ownership user-A-vs-user-B, cross-user apply blocked, pagination order,
// countApplications (Step 2). Deterministic clock/ids (no Date.now/Math.random).

const NOW = "2026-06-21T00:00:00.000Z";

// [T-332 S2] RepoDeps.accountId 已收成必填 string(strict 门):缺省固定测试号,
// 「null 全局视图」形态随 SPEC §4.2 裁决删除。
function repoFor(
  db: Db,
  userId: string,
  tag = userId,
  accountId = "acct-default",
) {
  let seq = 0;
  return createLearningsRepository(db, {
    now: () => NOW,
    nextId: (prefix: string) => `${prefix}-${tag}-${++seq}`,
    userId,
    accountId,
  });
}

describe("learnings repository (integration, user-scoped)", () => {
  let db: Db;
  beforeEach(async () => {
    ({ db } = await createDb());
    // 真实父实体fixture；授权不能只靠通过的mock服务端口。
    await db.insert(parentProjects).values(["project-1", "project-abc", "project-P", "project-Q", "project-shared", "p1", "p2"].map(id=>({id,userId:"user-a",accountId:"acct-default",title:id,creationMode:"free",status:"active",currentStage:"script",startedAt:NOW,createdAt:NOW,updatedAt:NOW}))).onConflictDoNothing();
    await db.insert(parentProjects).values({id:"p1-account-a",accountId:"account-a",userId:"user-a",title:"号A项目",creationMode:"free",status:"active",currentStage:"script",startedAt:NOW,createdAt:NOW,updatedAt:NOW});
    await db.insert(parentReviews).values({id:"review-1",userId:"user-a",accountId:"acct-default",projectId:"project-1",reviewType:"project",status:"completed",periodStart:NOW,periodEnd:NOW,createdAt:NOW});

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
      accountId: "acct-default",
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

  // [T-332 S2 · ISO-02/08] 号维度 strict 隔离:同一 user 下两个抖音号(无 null 全局视图)。
  it("accountId-scoped repo only sees its own account's learnings; create stamps accountId", async () => {
    const mk = (title: string) => ({
      title,
      insight: "",
      learningType: "strategy",
      recommendation: "",
      reviewId: null,
      confidenceScore: 0,
    });
    const repoA = repoFor(db, "user-a", "acc-a", "account-a");
    const repoB = repoFor(db, "user-a", "acc-b", "account-b");

    const a = await repoA.createLearning(mk("A-号"));
    const b = await repoB.createLearning(mk("B-号"));
    // create stamp:account_id 落到行上。
    expect(a.accountId).toBe("account-a");
    expect(b.accountId).toBe("account-b");

    // 号 A 的 repo 只看到 A 的经验(list 号门收窄)。
    const listA = await repoA.listLearnings({ limit: 50, offset: 0 });
    expect(listA.rows.map((r) => r.id)).toEqual([a.id]);
    // 号 B 只看到 B 的。
    const listB = await repoB.listLearnings({ limit: 50, offset: 0 });
    expect(listB.rows.map((r) => r.id)).toEqual([b.id]);
    // 跨号 get 门:号 B 的 repo 取号 A 的 learning → OwnershipError(404,不泄露存在)。
    await expect(repoB.getLearningRowById(a.id)).rejects.toBeInstanceOf(
      OwnershipError,
    );
    // 本号 get 正常。
    expect((await repoA.getLearningRowById(a.id)).id).toBe(a.id);

    // learning_applications 也随号盖章 + 号门收窄计数。
    await repoA.createApplication(a.id, { projectId: "p1-account-a", applicationNote: "" });
    expect(await repoA.countApplications(a.id)).toBe(1);
  });
});
