import { describe, it, expect, beforeEach } from "vitest";
import { createDb, type Db } from "../db";
import {
  createReviewsRepository,
  type ReviewsRepository,
} from "./reviews-repository";

const FIXED_NOW = "2026-06-13T10:00:00+08:00";
const PERIOD_START = "2026-06-01T00:00:00+08:00";
const PERIOD_END = "2026-06-13T00:00:00+08:00";

// Deterministic deps. ids are namespaced per userId so two repos in one db do not
// collide on the shared PK (mirrors project-repository.test.ts's counter pattern).
function deterministicDeps(userId = "user-1") {
  const counters = new Map<string, number>();
  return {
    now: () => FIXED_NOW,
    nextId: (prefix: string) => {
      const n = (counters.get(prefix) ?? 0) + 1;
      counters.set(prefix, n);
      return `${prefix}-${userId}-${n}`;
    },
    userId,
  };
}

let db: Db;
let repo: ReviewsRepository;

beforeEach(async () => {
  ({ db } = await createDb()); // fresh in-memory pglite per test
  repo = createReviewsRepository(db, deterministicDeps());
});

describe("ReviewsRepository (pglite-backed real persistence)", () => {
  it("creates a review and reads it back from SQL", async () => {
    const created = await repo.create({
      projectId: "project-1",
      reviewType: "project",
      periodStart: PERIOD_START,
      periodEnd: PERIOD_END,
    });
    expect(created.id).toBe("review-user-1-1");
    expect(created.status).toBe("in_progress");
    expect(created.completedAt).toBeNull();

    const list = await repo.list();
    expect(list.map((r) => r.id)).toContain("review-user-1-1");

    const fetched = await repo.get("review-user-1-1");
    expect(fetched.projectId).toBe("project-1");
    expect(fetched.reviewType).toBe("project");
  });

  it("throws for a missing review", async () => {
    await expect(repo.get("nope")).rejects.toThrow(/not found/);
  });

  it("completes an in_progress review and stamps completedAt durably", async () => {
    const r = await repo.create({
      projectId: "project-1",
      reviewType: "project",
      periodStart: PERIOD_START,
      periodEnd: PERIOD_END,
    });
    const done = await repo.complete(r.id);
    expect(done.status).toBe("completed");
    expect(done.completedAt).toBe(FIXED_NOW);
    // persisted: a fresh read reflects it
    expect((await repo.get(r.id)).status).toBe("completed");
  });

  it("rejects re-completing an already completed review (FSM guard)", async () => {
    const r = await repo.create({
      projectId: "project-1",
      reviewType: "project",
      periodStart: PERIOD_START,
      periodEnd: PERIOD_END,
    });
    await repo.complete(r.id);
    await expect(repo.complete(r.id)).rejects.toThrow(
      /illegal review transition/,
    );
  });

  it("appends insights ordered by priority", async () => {
    const r = await repo.create({
      projectId: "project-1",
      reviewType: "project",
      periodStart: PERIOD_START,
      periodEnd: PERIOD_END,
    });
    await repo.createInsight(r.id, {
      insightType: "action",
      title: "B",
      priority: 2,
    });
    await repo.createInsight(r.id, {
      insightType: "success",
      title: "A",
      priority: 1,
      evidence: { conversionRate: 0.12 },
    });

    const insights = await repo.listInsights(r.id);
    expect(insights.map((i) => i.title)).toEqual(["A", "B"]);
    expect(insights[0]!.evidence).toEqual({ conversionRate: 0.12 });
  });

  it("attaches a publication idempotently (UNIQUE join)", async () => {
    const r = await repo.create({
      projectId: "project-1",
      reviewType: "output",
      periodStart: PERIOD_START,
      periodEnd: PERIOD_END,
    });
    await repo.attachPublication(r.id, "pub-1");
    await repo.attachPublication(r.id, "pub-1"); // conflict ignored — no-op

    const pubs = await repo.listPublications(r.id);
    expect(pubs).toHaveLength(1);
    expect(pubs[0]!.publicationId).toBe("pub-1");
  });

  it("seeds reviews idempotently", async () => {
    const seedRow = {
      id: "seed-1",
      userId: "user-1",
      projectId: "project-1",
      contentOutputId: null,
      reportArtifactId: null,
      reviewType: "project",
      status: "completed",
      periodStart: PERIOD_START,
      periodEnd: PERIOD_END,
      createdAt: FIXED_NOW,
      completedAt: FIXED_NOW,
    };
    await repo.seedReviews([seedRow]);
    await repo.seedReviews([seedRow]); // again — conflict ignored
    const list = await repo.list();
    expect(list.filter((r) => r.id === "seed-1")).toHaveLength(1);
  });

  it("does not leak another user's review (ownership 404 surface)", async () => {
    // user-2 owns a review in the same db; user-1's repo must not see it.
    const otherRepo = createReviewsRepository(db, deterministicDeps("user-2"));
    const owned = await otherRepo.create({
      projectId: "project-x",
      reviewType: "project",
      periodStart: PERIOD_START,
      periodEnd: PERIOD_END,
    });

    // cross-user get -> same "not found" surface as a missing row
    await expect(repo.get(owned.id)).rejects.toThrow(/not found/);
    // cross-user mutation is likewise blocked at the ownership gate
    await expect(repo.complete(owned.id)).rejects.toThrow(/not found/);
    // and it never appears in the other tenant's list
    expect((await repo.list()).map((r) => r.id)).not.toContain(owned.id);
  });
});
