import type { RequestContext } from "@creatoros/contract";
import { requireAccountId, type Db } from "@creatoros/backend";
import {
  createReviewsRepository,
  type ReviewsRepository,
  type RepoDeps,
} from "./reviews.repository";
import {
  toReviewDto,
  toReviewInsightDto,
  type ReviewResource,
  type ReviewInsightResource,
} from "./reviews.schema";
import { ConflictError, ValidationError } from "./reviews.errors";

// Reviews service (foundation §5.3) — every public method takes
// `(ctx: RequestContext, …)` and builds a repository bound to `ctx.userId`
// (createReviewsRepository(db, { now, nextId, userId: ctx.userId })) so scoping is
// structural. Peer modules (Projects / Publishing / Analytics) are reached ONLY
// through injected narrow PORTS (mirrors analytics' AnalyticsPublishingPort) — no
// cross-module repository import (SPEC §22). The ports are satisfied at composition
// time by the peers' public services (frontend/src/server/persistence-client.ts).

// A publication in the review window — only the fields period-derivation needs.
export interface ReviewPublicationWindow {
  contentOutputId: string;
  publishedAt: string | null;
}

// The Projects seam: project/output ownership gates + the post-commit activity
// append. verifyProjectOwned / verifyOutputOwned throw OwnershipError (→ 404) for a
// cross-user / unknown id BEFORE any review row is written. recordActivity is
// best-effort (SPEC §11: an activity-append failure must not roll back the review
// fact) — the composition adapter swallows its own errors.
export interface ReviewsProjectsPort {
  verifyProjectOwned(ctx: RequestContext, projectId: string): Promise<void>;
  verifyOutputOwned(ctx: RequestContext, contentOutputId: string): Promise<void>;
  recordActivity(
    ctx: RequestContext,
    input: {
      projectId: string;
      eventType: string;
      entityType: string;
      entityId: string;
    },
  ): Promise<void>;
}

// The Publishing seam: the published-publication window for a project (used to
// derive the review period from min/max publishedAt). Output-scoped reviews filter
// to the matching contentOutputId. An unwired seam / no publications → [].
export interface ReviewsPublishingPort {
  listProjectPublications(
    ctx: RequestContext,
    projectId: string,
  ): Promise<ReviewPublicationWindow[]>;
}

// The Analytics seam: the metric context for the review period, reduced to the
// small evidence record the AI review node (G15) + the FE render share. Determinate
// — never user-supplied. No data → {}.
export interface ReviewsAnalyticsPort {
  getProjectSnapshots(
    ctx: RequestContext,
    projectId: string,
    window: { from: string; to: string },
  ): Promise<Record<string, unknown>>;
}

export interface ServiceDeps {
  db: Db;
  now: () => string;
  nextId: (prefix: string) => string;
  projects: ReviewsProjectsPort;
  publishing: ReviewsPublishingPort;
  analytics: ReviewsAnalyticsPort;
}

export interface ReviewsService {
  createReview(
    ctx: RequestContext,
    projectId: string,
    body: { reviewType: string; contentOutputId?: string | null },
  ): Promise<ReviewResource>;
  getReview(ctx: RequestContext, reviewId: string): Promise<ReviewResource>;
  // [T-053 断点③] 项目复盘记录列表(复盘页「复盘记录」区读真)。
  listReviews(ctx: RequestContext, projectId: string): Promise<ReviewResource[]>;
  listReviewInsights(
    ctx: RequestContext,
    reviewId: string,
  ): Promise<ReviewInsightResource[]>;
  createInsight(
    ctx: RequestContext,
    reviewId: string,
    body: { insightType: string; title: string; description?: string },
  ): Promise<ReviewInsightResource>;
  completeReview(
    ctx: RequestContext,
    reviewId: string,
  ): Promise<ReviewResource>;
  // The G14 Learnings / G15 AI bridge read (foundation §1 / plan Step 4): the
  // insights of the user's COMPLETED reviews for a project. Exposed via index.ts so
  // Learnings/AI consume them WITHOUT a Reviews repo import (the unblock contract).
  listCompletedReviewInsights(
    ctx: RequestContext,
    projectId: string,
  ): Promise<ReviewInsightResource[]>;
}

export function createReviewsService(deps: ServiceDeps): ReviewsService {
  const { db, now, nextId, projects, publishing, analytics } = deps;

  // [T-332 S2 · SPEC §4.2] 每个经 ctx 的入口都经此建 repo:未选号 → AccountRequiredError
  // (引导态禁读写),有号则 strict 收窄到该号。op 标注抛点便于前端归因。
  function repoFor(ctx: RequestContext, op: string): ReviewsRepository {
    const repoDeps: RepoDeps = {
      now,
      nextId,
      userId: ctx.userId,
      accountId: requireAccountId(ctx.accountId, op),
    };
    return createReviewsRepository(db, repoDeps);
  }

  // Derive [periodStart, periodEnd] from the published-publication window. When no
  // publication has a publishedAt yet, default both to now() (an empty-period
  // in_progress review is valid — insights can be authored before metrics land).
  function derivePeriod(
    pubs: ReviewPublicationWindow[],
  ): { periodStart: string; periodEnd: string } {
    const published = pubs
      .map((p) => p.publishedAt)
      .filter((d): d is string => d !== null && d !== undefined && d !== "");
    if (published.length === 0) {
      const ts = now();
      return { periodStart: ts, periodEnd: ts };
    }
    published.sort();
    return { periodStart: published[0]!, periodEnd: published[published.length - 1]! };
  }

  return {
    async createReview(ctx, projectId, body) {
      const reviewType = body.reviewType;
      // 1. Validate scope + ownership.
      let contentOutputId: string | null;
      if (reviewType === "output") {
        if (!body.contentOutputId) {
          throw new ValidationError(
            "output-scoped review requires contentOutputId",
          );
        }
        contentOutputId = body.contentOutputId;
      } else {
        contentOutputId = null; // project-scope forces null
      }
      // Project ownership (cross-user / unknown → OwnershipError → 404).
      await projects.verifyProjectOwned(ctx, projectId);
      if (contentOutputId) {
        await projects.verifyOutputOwned(ctx, contentOutputId);
      }

      // 2. Derive the review period (the contract body omits it) from the
      //    publishing window. Output-scoped → filter to the selected output.
      const allPubs = await publishing.listProjectPublications(ctx, projectId);
      const scopedPubs = contentOutputId
        ? allPubs.filter((p) => p.contentOutputId === contentOutputId)
        : allPubs;
      const { periodStart, periodEnd } = derivePeriod(scopedPubs);

      // 3. Persist. reportArtifactId is null at creation (the review_report artifact
      //    is linked later via the AI vertical — not in the create body).
      const repo = repoFor(ctx, "reviews.createReview");
      const row = await repo.createReview({
        projectId,
        reviewType,
        contentOutputId,
        periodStart,
        periodEnd,
        reportArtifactId: null,
      });

      // 4. Post-commit activity (best-effort; failure must not roll back the fact).
      await projects.recordActivity(ctx, {
        projectId,
        eventType: "review_created",
        entityType: "review",
        entityId: row.id,
      });

      return toReviewDto(row);
    },

    async getReview(ctx, reviewId) {
      const row = await repoFor(ctx, "reviews.getReview").getReview(reviewId);
      return toReviewDto(row);
    },

    async listReviews(ctx, projectId) {
      // Ownership gate first (cross-user / unknown project → OwnershipError 404).
      await projects.verifyProjectOwned(ctx, projectId);
      const rows = await repoFor(ctx, "reviews.listReviews").listReviewsByProject(projectId);
      return rows.map(toReviewDto);
    },

    async listReviewInsights(ctx, reviewId) {
      const repo = repoFor(ctx, "reviews.listReviewInsights");
      await repo.getReview(reviewId);
      const rows = await repo.listInsights(reviewId);
      return rows.map(toReviewInsightDto);
    },

    async createInsight(ctx, reviewId, body) {
      const repo = repoFor(ctx, "reviews.createInsight");
      // 1. Ownership + state guard: insights only on an in_progress review.
      const review = await repo.getReview(reviewId);
      if (review.status !== "in_progress") {
        throw new ConflictError(
          `cannot add an insight to a ${review.status} review`,
        );
      }
      // 2. Derive priority = current insight count (0-based insert order).
      const priority = await repo.countInsights(reviewId);
      // 3. Derive evidence = the reduced Analytics snapshot for the review period
      //    (determinate; never user-supplied). No data → {}.
      const evidence = await analytics.getProjectSnapshots(ctx, review.projectId, {
        from: review.periodStart,
        to: review.periodEnd,
      });
      const row = await repo.createInsight(reviewId, {
        insightType: body.insightType,
        title: body.title,
        description: body.description ?? "",
        evidence: evidence ?? {},
        priority,
      });
      return toReviewInsightDto(row);
    },

    async completeReview(ctx, reviewId) {
      const repo = repoFor(ctx, "reviews.completeReview");
      const review = await repo.getReview(reviewId); // ownership gate
      // Review.status machine (SPEC §12 / roadmap §4):
      //   completed  → idempotent (return existing, no re-stamp)
      //   abandoned  → ConflictError (terminal, cannot complete)
      //   in_progress→ complete (sets completed + completedAt)
      if (review.status === "completed") {
        return toReviewDto(review);
      }
      if (review.status === "abandoned") {
        throw new ConflictError("cannot complete an abandoned review");
      }
      const row = await repo.completeReview(reviewId);
      // Post-commit activity (best-effort). The completion is the signal G14
      // Learnings consumes — a completed review's insights become promotable
      // learnings.create sources; Reviews does NOT call Learnings.
      await projects.recordActivity(ctx, {
        projectId: row.projectId,
        eventType: "review_completed",
        entityType: "review",
        entityId: row.id,
      });
      return toReviewDto(row);
    },

    async listCompletedReviewInsights(ctx, projectId) {
      const repo = repoFor(ctx, "reviews.listCompletedReviewInsights");
      const reviews = await repo.listReviewsByProject(projectId);
      const completed = reviews.filter((r) => r.status === "completed");
      const out: ReviewInsightResource[] = [];
      for (const review of completed) {
        const insights = await repo.listInsights(review.id);
        for (const ins of insights) out.push(toReviewInsightDto(ins));
      }
      return out;
    },
  };
}
