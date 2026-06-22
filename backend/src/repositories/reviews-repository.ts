import { eq, and, asc } from "drizzle-orm";
import type { Db } from "../db";
import { reviews, reviewInsights, reviewPublications } from "../schema/reviews";

// Injected dependencies — mirrors project-repository / knowledge-repository's
// RepoDeps so the repo stays deterministic (no Date.now / Math.random / fetch
// inside) and user-scoped.
export interface RepoDeps {
  now: () => string; // ISO-8601 clock (injected for deterministic tests)
  nextId: (prefix: string) => string; // id generator (deterministic in tests)
  userId: string; // owner threaded from RequestContext
}

type ReviewType = "project" | "output";
type InsightType = "success" | "issue" | "action" | "hypothesis";

type ReviewRow = typeof reviews.$inferSelect;
type InsightRow = typeof reviewInsights.$inferSelect;
type PublicationRow = typeof reviewPublications.$inferSelect;

export interface ReviewsRepository {
  seedReviews(rows: ReviewRow[]): Promise<void>;
  list(): Promise<ReviewRow[]>;
  get(reviewId: string): Promise<ReviewRow>;
  create(input: {
    projectId: string;
    reviewType: ReviewType;
    periodStart: string;
    periodEnd: string;
    contentOutputId?: string | null;
    reportArtifactId?: string | null;
  }): Promise<ReviewRow>;
  // FSM: in_progress -> completed (adjacent-only). abandoned is schema-valid but
  // unwired this wave (see SPEC §12). Re-completing a completed review is illegal.
  complete(reviewId: string): Promise<ReviewRow>;

  // Insights are owned, ordered by priority, scoped under a review.
  createInsight(
    reviewId: string,
    input: {
      insightType: InsightType;
      title: string;
      description?: string;
      evidence?: Record<string, unknown>;
      priority?: number;
    },
  ): Promise<InsightRow>;
  listInsights(reviewId: string): Promise<InsightRow[]>;

  // Idempotent join: a publication is attached to a review at most once
  // (reviews_review_publication_uq) — onConflictDoNothing backs the idempotent attach.
  attachPublication(
    reviewId: string,
    publicationId: string,
  ): Promise<void>;
  listPublications(reviewId: string): Promise<PublicationRow[]>;

  // TODO: detachPublication + abandon (in_progress -> abandoned terminal) are
  // schema-valid but deferred this wave.
}

export function createReviewsRepository(
  db: Db,
  deps: RepoDeps,
): ReviewsRepository {
  // Owner-scoped read: a row owned by another user is invisible → same
  // "not found" surface project/knowledge repositories use for cross-user / missing.
  async function get(reviewId: string): Promise<ReviewRow> {
    const rows = await db
      .select()
      .from(reviews)
      .where(and(eq(reviews.id, reviewId), eq(reviews.userId, deps.userId)));
    const row = rows[0];
    if (!row) {
      throw new Error(`OwnershipError: review not found: ${reviewId}`);
    }
    return row;
  }

  return {
    async seedReviews(rows) {
      if (rows.length === 0) return;
      await db.insert(reviews).values(rows).onConflictDoNothing();
    },

    async list() {
      return db
        .select()
        .from(reviews)
        .where(eq(reviews.userId, deps.userId))
        .orderBy(asc(reviews.createdAt));
    },

    get,

    async create({
      projectId,
      reviewType,
      periodStart,
      periodEnd,
      contentOutputId,
      reportArtifactId,
    }) {
      const ts = deps.now();
      const inserted = await db
        .insert(reviews)
        .values({
          id: deps.nextId("review"),
          userId: deps.userId,
          projectId,
          contentOutputId: contentOutputId ?? null,
          reportArtifactId: reportArtifactId ?? null,
          reviewType,
          status: "in_progress",
          periodStart,
          periodEnd,
          createdAt: ts,
          completedAt: null,
        })
        .returning();
      return inserted[0]!;
    },

    async complete(reviewId) {
      const review = await get(reviewId); // ownership + existence gate
      if (review.status !== "in_progress") {
        throw new Error(
          `ConflictError: illegal review transition ${review.status} -> completed`,
        );
      }
      const ts = deps.now();
      const updated = await db
        .update(reviews)
        .set({ status: "completed", completedAt: ts })
        .where(and(eq(reviews.id, reviewId), eq(reviews.userId, deps.userId)))
        .returning();
      return updated[0]!;
    },

    async createInsight(reviewId, input) {
      await get(reviewId); // caller must own the parent review
      const inserted = await db
        .insert(reviewInsights)
        .values({
          id: deps.nextId("insight"),
          userId: deps.userId,
          reviewId,
          insightType: input.insightType,
          title: input.title,
          description: input.description ?? "",
          evidence: input.evidence ?? {},
          priority: input.priority ?? 0,
        })
        .returning();
      return inserted[0]!;
    },

    async listInsights(reviewId) {
      await get(reviewId); // ownership + existence gate
      return db
        .select()
        .from(reviewInsights)
        .where(
          and(
            eq(reviewInsights.reviewId, reviewId),
            eq(reviewInsights.userId, deps.userId),
          ),
        )
        .orderBy(asc(reviewInsights.priority));
    },

    async attachPublication(reviewId, publicationId) {
      await get(reviewId); // caller must own the parent review
      // Idempotent: re-attaching the same publication is a no-op
      // (reviews_review_publication_uq).
      await db
        .insert(reviewPublications)
        .values({
          id: deps.nextId("review-publication"),
          userId: deps.userId,
          reviewId,
          publicationId,
        })
        .onConflictDoNothing();
    },

    async listPublications(reviewId) {
      await get(reviewId); // ownership + existence gate
      return db
        .select()
        .from(reviewPublications)
        .where(
          and(
            eq(reviewPublications.reviewId, reviewId),
            eq(reviewPublications.userId, deps.userId),
          ),
        );
    },
  };
}
