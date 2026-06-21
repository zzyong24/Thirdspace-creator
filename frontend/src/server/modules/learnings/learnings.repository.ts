import { and, desc, eq, type Db } from "@creatoros/backend";
import { learnings, learningApplications } from "./learnings.db-schema";
import { OwnershipError } from "./learnings.errors";

// Learnings repository (foundation §5.2) — user-scoped queries ONLY. `userId` is
// baked into deps (mirrors the reviews/knowledge repos): EVERY query filters
// `eq(table.userId, deps.userId)` and EVERY insert stamps `userId: deps.userId`. A
// getLearningRowById(learningId) throws OwnershipError when the scoped select
// returns empty — never revealing cross-user existence (foundation §2: 404 not 403).
// The repository executes only service-approved writes — the validationStatus
// machine guard lives in the service (SPEC §12).

export type LearningRow = typeof learnings.$inferSelect;
export type LearningApplicationRow = typeof learningApplications.$inferSelect;

export interface RepoDeps {
  now: () => string; // ISO-8601 clock (injected for deterministic tests)
  nextId: (prefix: string) => string; // id generator (deterministic in tests)
  userId: string; // the ownership boundary, baked in at construction
}

export interface CreateLearningInput {
  title: string;
  insight: string;
  learningType: string;
  recommendation: string;
  reviewId: string | null;
  confidenceScore: number;
}

export interface UpdateLearningStatusInput {
  validationStatus: string;
  confidenceScore: number;
}

export interface CreateApplicationInput {
  projectId: string;
  applicationNote: string;
}

export interface LearningsRepository {
  // Fixture hydration (insert with explicit user_id already on the row).
  seedLearnings(rows: LearningRow[]): Promise<void>;

  listLearnings(page: {
    limit: number;
    offset: number;
  }): Promise<{ rows: LearningRow[]; total: number }>;
  createLearning(input: CreateLearningInput): Promise<LearningRow>;
  getLearningRowById(learningId: string): Promise<LearningRow>;
  updateLearningStatus(
    learningId: string,
    input: UpdateLearningStatusInput,
  ): Promise<LearningRow>;
  createApplication(
    learningId: string,
    input: CreateApplicationInput,
  ): Promise<LearningApplicationRow>;
  countApplications(learningId: string): Promise<number>;
}

export function createLearningsRepository(
  db: Db,
  deps: RepoDeps,
): LearningsRepository {
  // Private ownership gate: the scoped select for a learning. Empty ⇒ OwnershipError
  // (→ 404; cross-user / unknown id never reveals existence).
  async function getRow(learningId: string): Promise<LearningRow> {
    const rows = await db
      .select()
      .from(learnings)
      .where(
        and(eq(learnings.userId, deps.userId), eq(learnings.id, learningId)),
      );
    const row = rows[0];
    if (!row) {
      throw new OwnershipError(
        `OwnershipError: learning not found: ${learningId}`,
      );
    }
    return row;
  }

  return {
    async seedLearnings(rows) {
      if (rows.length === 0) return;
      await db.insert(learnings).values(rows).onConflictDoNothing();
    },

    async listLearnings({ limit, offset }) {
      const rows = await db
        .select()
        .from(learnings)
        .where(eq(learnings.userId, deps.userId))
        .orderBy(desc(learnings.updatedAt))
        .limit(limit)
        .offset(offset);
      const all = await db
        .select({ id: learnings.id })
        .from(learnings)
        .where(eq(learnings.userId, deps.userId));
      return { rows, total: all.length };
    },

    async createLearning(input) {
      const inserted = await db
        .insert(learnings)
        .values({
          id: deps.nextId("learning"),
          userId: deps.userId,
          reviewId: input.reviewId ?? null,
          learningType: input.learningType,
          title: input.title,
          insight: input.insight,
          recommendation: input.recommendation,
          validationStatus: "candidate",
          confidenceScore: input.confidenceScore,
          createdAt: deps.now(),
          updatedAt: deps.now(),
        })
        .returning();
      return inserted[0]!;
    },

    async getLearningRowById(learningId) {
      return getRow(learningId);
    },

    async updateLearningStatus(learningId, input) {
      await getRow(learningId); // scoped ownership gate
      const updated = await db
        .update(learnings)
        .set({
          validationStatus: input.validationStatus,
          confidenceScore: input.confidenceScore,
          updatedAt: deps.now(),
        })
        .where(
          and(eq(learnings.userId, deps.userId), eq(learnings.id, learningId)),
        )
        .returning();
      return updated[0]!;
    },

    async createApplication(learningId, input) {
      await getRow(learningId); // scoped ownership gate on the parent learning
      const inserted = await db
        .insert(learningApplications)
        .values({
          id: deps.nextId("learning-app"),
          userId: deps.userId,
          learningId,
          projectId: input.projectId,
          contentOutputId: null,
          applicationNote: input.applicationNote,
          outcome: {},
          appliedAt: deps.now(),
          evaluatedAt: null,
        })
        .returning();
      return inserted[0]!;
    },

    async countApplications(learningId) {
      const rows = await db
        .select({ id: learningApplications.id })
        .from(learningApplications)
        .where(
          and(
            eq(learningApplications.userId, deps.userId),
            eq(learningApplications.learningId, learningId),
          ),
        );
      return rows.length;
    },
  };
}
