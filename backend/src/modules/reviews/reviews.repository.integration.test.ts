import { describe, it, expect, beforeEach } from "vitest";
import { createDb, eq, type Db } from "@creatoros/backend";
import {
  reviews,
  reviewInsights,
  reviewPublications,
} from "./reviews.db-schema";
import {
  createReviewsRepository,
  type ReviewsRepository,
} from "./reviews.repository";

// Reviews repository (Step 1 round-trip + Step 2 user-scoped ownership) — pglite.
//   - Step 1: a row inserted into each of the three tables round-trips via
//     db.select() with all columns intact (jsonb default {}, nullable cols null,
//     priority default 0).
//   - Step 2: ownership user-A-vs-B; insight priority ordering; attachPublication
//     idempotent UNIQUE.

const NOW = "2026-06-21T00:00:00.000Z";

function makeRepo(
  db: Db,
  userId: string,
  tag = userId,
  accountId: string | null = null,
): ReviewsRepository {
  let seq = 0;
  return createReviewsRepository(db, {
    now: () => NOW,
    nextId: (prefix: string) => `${prefix}-${tag}-${++seq}`,
    userId,
    accountId,
  });
}

describe("reviews schema round-trip (Step 1)", () => {
  let db: Db;
  beforeEach(async () => {
    ({ db } = await createDb());
  });

  it("round-trips a review row with defaults + nullable columns intact", async () => {
    await db.insert(reviews).values({
      id: "review-1",
      userId: "user-a",
      projectId: "project-1",
      contentOutputId: null,
      reportArtifactId: null,
      reviewType: "project",
      status: "in_progress",
      periodStart: NOW,
      periodEnd: NOW,
      createdAt: NOW,
      completedAt: null,
    });
    const [row] = await db
      .select()
      .from(reviews)
      .where(eq(reviews.id, "review-1"));
    expect(row).toMatchObject({
      id: "review-1",
      userId: "user-a",
      projectId: "project-1",
      contentOutputId: null,
      reportArtifactId: null,
      reviewType: "project",
      status: "in_progress",
      completedAt: null,
    });
  });

  it("round-trips an insight row with jsonb default {} and priority default 0", async () => {
    await db.insert(reviewInsights).values({
      id: "insight-1",
      userId: "user-a",
      reviewId: "review-1",
      insightType: "success",
      title: "保留率提升",
    });
    const [row] = await db
      .select()
      .from(reviewInsights)
      .where(eq(reviewInsights.id, "insight-1"));
    expect(row).toMatchObject({
      id: "insight-1",
      description: "",
      evidence: {},
      priority: 0,
    });
  });

  it("round-trips a review_publication row", async () => {
    await db.insert(reviewPublications).values({
      id: "reviewpub-1",
      userId: "user-a",
      reviewId: "review-1",
      publicationId: "pub-1",
    });
    const [row] = await db
      .select()
      .from(reviewPublications)
      .where(eq(reviewPublications.id, "reviewpub-1"));
    expect(row).toMatchObject({
      id: "reviewpub-1",
      userId: "user-a",
      reviewId: "review-1",
      publicationId: "pub-1",
    });
  });
});

describe("reviews repository (user-scoped, Step 2)", () => {
  let db: Db;
  beforeEach(async () => {
    ({ db } = await createDb());
  });

  it("isolates a review by user_id (A's review invisible to B)", async () => {
    const repoA = makeRepo(db, "user-a");
    const created = await repoA.createReview({
      projectId: "project-1",
      reviewType: "project",
      contentOutputId: null,
      periodStart: NOW,
      periodEnd: NOW,
      reportArtifactId: null,
    });
    const repoB = makeRepo(db, "user-b");
    await expect(repoB.getReview(created.id)).rejects.toThrow(/OwnershipError/);
    // A can read its own row.
    const got = await repoA.getReview(created.id);
    expect(got.id).toBe(created.id);
  });

  it("rejects createInsight against a cross-user reviewId", async () => {
    const repoA = makeRepo(db, "user-a");
    const review = await repoA.createReview({
      projectId: "project-1",
      reviewType: "project",
      contentOutputId: null,
      periodStart: NOW,
      periodEnd: NOW,
      reportArtifactId: null,
    });
    const repoB = makeRepo(db, "user-b");
    await expect(
      repoB.createInsight(review.id, {
        insightType: "success",
        title: "x",
        description: "",
        evidence: {},
        priority: 0,
      }),
    ).rejects.toThrow(/OwnershipError/);
  });

  it("listInsights returns in priority order regardless of insert order", async () => {
    const repoA = makeRepo(db, "user-a");
    const review = await repoA.createReview({
      projectId: "project-1",
      reviewType: "project",
      contentOutputId: null,
      periodStart: NOW,
      periodEnd: NOW,
      reportArtifactId: null,
    });
    await repoA.createInsight(review.id, {
      insightType: "action",
      title: "second",
      description: "",
      evidence: {},
      priority: 5,
    });
    await repoA.createInsight(review.id, {
      insightType: "success",
      title: "first",
      description: "",
      evidence: {},
      priority: 1,
    });
    const list = await repoA.listInsights(review.id);
    expect(list.map((i) => i.title)).toEqual(["first", "second"]);
  });

  it("countInsights reflects the current count for priority derivation", async () => {
    const repoA = makeRepo(db, "user-a");
    const review = await repoA.createReview({
      projectId: "project-1",
      reviewType: "project",
      contentOutputId: null,
      periodStart: NOW,
      periodEnd: NOW,
      reportArtifactId: null,
    });
    expect(await repoA.countInsights(review.id)).toBe(0);
    await repoA.createInsight(review.id, {
      insightType: "success",
      title: "a",
      description: "",
      evidence: {},
      priority: 0,
    });
    expect(await repoA.countInsights(review.id)).toBe(1);
  });

  it("attachPublication twice for the same (reviewId, publicationId) leaves exactly one row", async () => {
    const repoA = makeRepo(db, "user-a");
    const review = await repoA.createReview({
      projectId: "project-1",
      reviewType: "project",
      contentOutputId: null,
      periodStart: NOW,
      periodEnd: NOW,
      reportArtifactId: null,
    });
    await repoA.attachPublication(review.id, "pub-1");
    await repoA.attachPublication(review.id, "pub-1");
    const rows = await db
      .select()
      .from(reviewPublications)
      .where(eq(reviewPublications.reviewId, review.id));
    expect(rows).toHaveLength(1);
  });

  it("completeReview stamps status completed + completedAt", async () => {
    const repoA = makeRepo(db, "user-a");
    const review = await repoA.createReview({
      projectId: "project-1",
      reviewType: "project",
      contentOutputId: null,
      periodStart: NOW,
      periodEnd: NOW,
      reportArtifactId: null,
    });
    const done = await repoA.completeReview(review.id);
    expect(done.status).toBe("completed");
    expect(done.completedAt).toBe(NOW);
  });

  // [T-136 切片 b] 号维度隔离:同一 user 下两个抖音号。
  it("accountId-scoped repo only sees its own account's reviews; null sees all; create stamps accountId", async () => {
    const mk = (projectId: string) => ({
      projectId,
      reviewType: "project",
      contentOutputId: null,
      periodStart: NOW,
      periodEnd: NOW,
      reportArtifactId: null,
    });
    const repoA = makeRepo(db, "user-a", "acc-a", "account-a");
    const repoB = makeRepo(db, "user-a", "acc-b", "account-b");
    const repoNull = makeRepo(db, "user-a", "acc-n", null);

    const rA = await repoA.createReview(mk("proj-shared"));
    const rB = await repoB.createReview(mk("proj-shared"));
    // create stamp。
    expect(rA.accountId).toBe("account-a");
    expect(rB.accountId).toBe("account-b");

    // listReviewsByProject 号门收窄:同一 projectId,各号只见本号。
    expect(
      (await repoA.listReviewsByProject("proj-shared")).map((r) => r.id),
    ).toEqual([rA.id]);
    expect(
      (await repoB.listReviewsByProject("proj-shared")).map((r) => r.id),
    ).toEqual([rB.id]);
    // null 号 → 不过滤,两条都见。
    expect(
      (await repoNull.listReviewsByProject("proj-shared")).map((r) => r.id).sort(),
    ).toEqual([rA.id, rB.id].sort());

    // 跨号 get → 404。
    await expect(repoB.getReview(rA.id)).rejects.toThrow();

    // review_insights 随号盖章 + 号门 count。
    await repoA.createInsight(rA.id, {
      insightType: "success",
      title: "T",
      description: "",
      evidence: {},
      priority: 0,
    });
    expect(await repoA.countInsights(rA.id)).toBe(1);
    expect((await repoA.listInsights(rA.id)).length).toBe(1);
  });
});
