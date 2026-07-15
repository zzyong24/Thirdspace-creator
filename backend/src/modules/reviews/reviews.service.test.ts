import { describe, it, expect, beforeEach, vi } from "vitest";
import { createDb, type Db } from "@creatoros/backend";
import type { RequestContext } from "@creatoros/contract";
import {
  createReviewsService,
  type ReviewsService,
  type ReviewsProjectsPort,
  type ReviewsPublishingPort,
  type ReviewsAnalyticsPort,
  type ReviewPublicationWindow,
} from "./reviews.service";

// Reviews service (Step 3) — RequestContext-taking methods + the Review state
// machine (SPEC §12), with stubbed peer ports (Projects/Publishing/Analytics) and a
// REAL pglite db (deterministic now/nextId). Covers: project/output scope
// validation + ownership calls, period derivation (min/max publishedAt, empty
// default), priority + evidence derivation, complete idempotency, abandoned guard,
// insight-on-completed guard.

const NOW = "2026-06-21T00:00:00.000Z";
const ctx: RequestContext = { userId: "user-a", requestId: "r1", source: "user", accountId: "acct-a" }; // [T-332 S2] strict 门下 ctx 必带号

function fakeProjects(): ReviewsProjectsPort & {
  verifyProjectOwned: ReturnType<typeof vi.fn>;
  verifyOutputOwned: ReturnType<typeof vi.fn>;
  recordActivity: ReturnType<typeof vi.fn>;
} {
  return {
    verifyProjectOwned: vi.fn(async () => {}),
    verifyOutputOwned: vi.fn(async () => {}),
    recordActivity: vi.fn(async () => {}),
  };
}

function fakePublishing(
  pubs: ReviewPublicationWindow[],
): ReviewsPublishingPort {
  return { listProjectPublications: vi.fn(async () => pubs) };
}

function fakeAnalytics(
  evidence: Record<string, unknown>,
): ReviewsAnalyticsPort {
  return { getProjectSnapshots: vi.fn(async () => evidence) };
}

function makeService(
  db: Db,
  opts: {
    projects?: ReturnType<typeof fakeProjects>;
    pubs?: ReviewPublicationWindow[];
    evidence?: Record<string, unknown>;
  } = {},
): { service: ReviewsService; projects: ReturnType<typeof fakeProjects> } {
  const projects = opts.projects ?? fakeProjects();
  let seq = 0;
  const service = createReviewsService({
    db,
    now: () => NOW,
    nextId: (prefix: string) => `${prefix}-${++seq}`,
    projects,
    publishing: fakePublishing(opts.pubs ?? []),
    analytics: fakeAnalytics(opts.evidence ?? {}),
  });
  return { service, projects };
}

describe("reviews service", () => {
  let db: Db;
  beforeEach(async () => {
    ({ db } = await createDb());
  });

  it("createReview project-scope: verifies project, in_progress, null output/report, period from publications", async () => {
    const { service, projects } = makeService(db, {
      pubs: [
        { contentOutputId: "out-1", publishedAt: "2026-06-10T00:00:00.000Z" },
        { contentOutputId: "out-2", publishedAt: "2026-06-15T00:00:00.000Z" },
      ],
    });
    const review = await service.createReview(ctx, "project-1", {
      reviewType: "project",
      contentOutputId: null,
    });
    expect(projects.verifyProjectOwned).toHaveBeenCalledWith(ctx, "project-1");
    expect(projects.verifyOutputOwned).not.toHaveBeenCalled();
    expect(review.status).toBe("in_progress");
    expect(review.contentOutputId).toBeNull();
    expect(review.reportArtifactId).toBeNull();
    expect(review.completedAt).toBeNull();
    expect(review.periodStart).toBe("2026-06-10T00:00:00.000Z");
    expect(review.periodEnd).toBe("2026-06-15T00:00:00.000Z");
    expect(projects.recordActivity).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({ eventType: "review_created", entityType: "review" }),
    );
  });

  it("createReview output-scope without contentOutputId → ValidationError", async () => {
    const { service } = makeService(db);
    await expect(
      service.createReview(ctx, "project-1", { reviewType: "output" }),
    ).rejects.toThrow(/contentOutputId/);
  });

  it("createReview output-scope verifies the output and scopes the period to it", async () => {
    const { service, projects } = makeService(db, {
      pubs: [
        { contentOutputId: "out-1", publishedAt: "2026-06-10T00:00:00.000Z" },
        { contentOutputId: "out-2", publishedAt: "2026-06-20T00:00:00.000Z" },
      ],
    });
    const review = await service.createReview(ctx, "project-1", {
      reviewType: "output",
      contentOutputId: "out-1",
    });
    expect(projects.verifyOutputOwned).toHaveBeenCalledWith(ctx, "out-1");
    expect(review.contentOutputId).toBe("out-1");
    // period scoped to out-1 only → both bounds = out-1's publishedAt.
    expect(review.periodStart).toBe("2026-06-10T00:00:00.000Z");
    expect(review.periodEnd).toBe("2026-06-10T00:00:00.000Z");
  });

  it("createReview with no published publications → periodStart === periodEnd === now()", async () => {
    const { service } = makeService(db, { pubs: [] });
    const review = await service.createReview(ctx, "project-1", {
      reviewType: "project",
      contentOutputId: null,
    });
    expect(review.periodStart).toBe(NOW);
    expect(review.periodEnd).toBe(NOW);
  });

  it("createInsight derives priority (0,1) and evidence from analytics", async () => {
    const { service } = makeService(db, {
      evidence: { source: "analytics", metric: "retention", value: 0.42 },
    });
    const review = await service.createReview(ctx, "project-1", {
      reviewType: "project",
      contentOutputId: null,
    });
    const first = await service.createInsight(ctx, review.id, {
      insightType: "success",
      title: "保留率提升",
      description: "",
    });
    const second = await service.createInsight(ctx, review.id, {
      insightType: "action",
      title: "优化开头",
    });
    expect(first.priority).toBe(0);
    expect(second.priority).toBe(1);
    expect(first.evidence).toMatchObject({ source: "analytics", value: 0.42 });
  });

  it("createInsight on a completed review → ConflictError", async () => {
    const { service } = makeService(db);
    const review = await service.createReview(ctx, "project-1", {
      reviewType: "project",
      contentOutputId: null,
    });
    await service.completeReview(ctx, review.id);
    await expect(
      service.createInsight(ctx, review.id, {
        insightType: "success",
        title: "late",
      }),
    ).rejects.toThrow(/completed/);
  });

  it("completeReview: in_progress → completed stamps completedAt", async () => {
    const { service, projects } = makeService(db);
    const review = await service.createReview(ctx, "project-1", {
      reviewType: "project",
      contentOutputId: null,
    });
    const done = await service.completeReview(ctx, review.id);
    expect(done.status).toBe("completed");
    expect(done.completedAt).toBe(NOW);
    expect(projects.recordActivity).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({ eventType: "review_completed" }),
    );
  });

  it("completeReview is idempotent (second call returns the same completed row)", async () => {
    const { service } = makeService(db);
    const review = await service.createReview(ctx, "project-1", {
      reviewType: "project",
      contentOutputId: null,
    });
    const first = await service.completeReview(ctx, review.id);
    const second = await service.completeReview(ctx, review.id);
    expect(second.status).toBe("completed");
    expect(second.completedAt).toBe(first.completedAt);
  });

  it("listCompletedReviewInsights returns insights of completed reviews only", async () => {
    const { service } = makeService(db, {
      evidence: { source: "analytics" },
    });
    const completed = await service.createReview(ctx, "project-1", {
      reviewType: "project",
      contentOutputId: null,
    });
    await service.createInsight(ctx, completed.id, {
      insightType: "success",
      title: "kept",
    });
    await service.completeReview(ctx, completed.id);
    // a second, still-in_progress review's insight must be excluded.
    const open = await service.createReview(ctx, "project-1", {
      reviewType: "project",
      contentOutputId: null,
    });
    await service.createInsight(ctx, open.id, {
      insightType: "issue",
      title: "excluded",
    });
    const insights = await service.listCompletedReviewInsights(ctx, "project-1");
    expect(insights.map((i) => i.title)).toEqual(["kept"]);
  });
});
