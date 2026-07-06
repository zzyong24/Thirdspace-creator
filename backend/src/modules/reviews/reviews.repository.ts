import { and, asc, eq, type Db } from "@creatoros/backend";
import {
  reviews,
  reviewInsights,
  reviewPublications,
} from "./reviews.db-schema";
import { OwnershipError } from "./reviews.errors";

// Reviews repository (foundation §5.2) — user-scoped queries ONLY. `userId` is
// baked into deps (mirrors the knowledge/publishing repos): EVERY query filters
// `eq(table.userId, deps.userId)` and EVERY insert stamps `userId: deps.userId`. A
// private getReviewRow(reviewId) throws OwnershipError when the scoped select
// returns empty — never revealing cross-user existence (foundation §2: 404 not
// 403). The repository executes only service-approved writes — the Review state
// machine guard lives in the service (SPEC §12).

export type ReviewRow = typeof reviews.$inferSelect;
export type ReviewInsightRow = typeof reviewInsights.$inferSelect;
export type ReviewPublicationRow = typeof reviewPublications.$inferSelect;

export interface RepoDeps {
  now: () => string; // ISO-8601 clock (injected for deterministic tests)
  nextId: (prefix: string) => string; // id generator (deterministic in tests)
  userId: string; // the ownership boundary, baked in at construction
  // [T-136 切片 b] 第二所有权维度(多抖音号 / 多人设)。非空 → 读门叠 eq(table.accountId);
  // null(存量/未选号)→ 读门退化不过滤,create 落 NULL 兜底。
  accountId: string | null;
}

export interface CreateReviewInput {
  projectId: string;
  reviewType: string;
  contentOutputId: string | null;
  periodStart: string;
  periodEnd: string;
  reportArtifactId: string | null;
}

export interface CreateInsightInput {
  insightType: string;
  title: string;
  description: string;
  evidence: Record<string, unknown>;
  priority: number;
}

export interface ReviewsRepository {
  // Fixture hydration (insert with explicit user_id already on the row).
  seedReviews(rows: ReviewRow[]): Promise<void>;
  seedInsights(rows: ReviewInsightRow[]): Promise<void>;

  createReview(input: CreateReviewInput): Promise<ReviewRow>;
  getReview(reviewId: string): Promise<ReviewRow>;
  completeReview(reviewId: string): Promise<ReviewRow>;
  createInsight(
    reviewId: string,
    input: CreateInsightInput,
  ): Promise<ReviewInsightRow>;
  listInsights(reviewId: string): Promise<ReviewInsightRow[]>;
  countInsights(reviewId: string): Promise<number>;
  attachPublication(
    reviewId: string,
    publicationId: string,
  ): Promise<void>;
  // The G14 Learnings / G15 AI bridge read: all reviews owned by the user for a
  // project (the service filters to `completed` + joins insights). User-scoped.
  listReviewsByProject(projectId: string): Promise<ReviewRow[]>;
}

export function createReviewsRepository(
  db: Db,
  deps: RepoDeps,
): ReviewsRepository {
  // Private ownership gate: the scoped select for a review. Empty ⇒ OwnershipError
  // (→ 404; cross-user / unknown id never reveals existence).
  async function getReviewRow(reviewId: string): Promise<ReviewRow> {
    const rows = await db
      .select()
      .from(reviews)
      .where(
        and(
          eq(reviews.userId, deps.userId),
          // [T-136 切片 b] 号维度收窄(非空才叠;null → 不过滤,§A)。
          deps.accountId ? eq(reviews.accountId, deps.accountId) : undefined,
          eq(reviews.id, reviewId),
        ),
      );
    const row = rows[0];
    if (!row) {
      throw new OwnershipError(`OwnershipError: review not found: ${reviewId}`);
    }
    return row;
  }

  return {
    async seedReviews(rows) {
      if (rows.length === 0) return;
      await db.insert(reviews).values(rows).onConflictDoNothing();
    },
    async seedInsights(rows) {
      if (rows.length === 0) return;
      await db.insert(reviewInsights).values(rows).onConflictDoNothing();
    },

    async createReview(input) {
      const inserted = await db
        .insert(reviews)
        .values({
          id: deps.nextId("review"),
          userId: deps.userId,
          // [T-136 切片 b] 号维度盖章(null 兜底)。
          accountId: deps.accountId,
          projectId: input.projectId,
          contentOutputId: input.contentOutputId ?? null,
          reportArtifactId: input.reportArtifactId ?? null,
          reviewType: input.reviewType,
          status: "in_progress",
          periodStart: input.periodStart,
          periodEnd: input.periodEnd,
          createdAt: deps.now(),
          completedAt: null,
        })
        .returning();
      return inserted[0]!;
    },

    async getReview(reviewId) {
      return getReviewRow(reviewId);
    },

    async completeReview(reviewId) {
      await getReviewRow(reviewId); // scoped ownership gate
      const updated = await db
        .update(reviews)
        .set({ status: "completed", completedAt: deps.now() })
        .where(and(eq(reviews.userId, deps.userId), eq(reviews.id, reviewId)))
        .returning();
      return updated[0]!;
    },

    async createInsight(reviewId, input) {
      await getReviewRow(reviewId); // scoped ownership gate on the parent review
      const inserted = await db
        .insert(reviewInsights)
        .values({
          id: deps.nextId("insight"),
          userId: deps.userId,
          // [T-136 切片 b] 号维度盖章(与父 review 同号;null 兜底)。
          accountId: deps.accountId,
          reviewId,
          insightType: input.insightType,
          title: input.title,
          description: input.description,
          evidence: input.evidence,
          priority: input.priority,
        })
        .returning();
      return inserted[0]!;
    },

    async listInsights(reviewId) {
      return db
        .select()
        .from(reviewInsights)
        .where(
          and(
            eq(reviewInsights.userId, deps.userId),
            // [T-136 切片 b] 号维度收窄(非空才叠;null → 不过滤)。
            deps.accountId
              ? eq(reviewInsights.accountId, deps.accountId)
              : undefined,
            eq(reviewInsights.reviewId, reviewId),
          ),
        )
        .orderBy(asc(reviewInsights.priority));
    },

    async countInsights(reviewId) {
      const rows = await db
        .select({ id: reviewInsights.id })
        .from(reviewInsights)
        .where(
          and(
            eq(reviewInsights.userId, deps.userId),
            // [T-136 切片 b] 号维度收窄(非空才叠;null → 不过滤)。
            deps.accountId
              ? eq(reviewInsights.accountId, deps.accountId)
              : undefined,
            eq(reviewInsights.reviewId, reviewId),
          ),
        );
      return rows.length;
    },

    async attachPublication(reviewId, publicationId) {
      await getReviewRow(reviewId); // scoped ownership gate on the parent review
      await db
        .insert(reviewPublications)
        .values({
          id: deps.nextId("reviewpub"),
          userId: deps.userId,
          // [T-136] review_publications 是 join 表,不按号隔离(经父 review 号门透传;地基存疑#1)。
          reviewId,
          publicationId,
        })
        .onConflictDoNothing(); // UNIQUE (review_id, publication_id) → idempotent
    },

    async listReviewsByProject(projectId) {
      return db
        .select()
        .from(reviews)
        .where(
          and(
            eq(reviews.userId, deps.userId),
            // [T-136 切片 b] 号维度收窄(非空才叠;null → 不过滤)。
            deps.accountId ? eq(reviews.accountId, deps.accountId) : undefined,
            eq(reviews.projectId, projectId),
          ),
        )
        .orderBy(asc(reviews.createdAt));
    },
  };
}
