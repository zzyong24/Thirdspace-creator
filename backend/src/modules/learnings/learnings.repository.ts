import { and, desc, eq, inArray, sql, type Db } from "@creatoros/backend";
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
  // [T-118a gate-F3] 来源作品(project-scoped 复盘读的锚);手录/非复盘来源传 null。
  projectId?: string | null;
  confidenceScore: number;
}

// [T-118a] listLearnings 的 additive 读过滤。都可选;都不传 → 全量(经验库/裁决台全量读)。
// 用户归属门(eq userId)始终最外层,与这里的过滤 AND 合并。
export interface ListLearningsFilter {
  projectId?: string;
  validationStatus?: string;
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

  listLearnings(
    page: {
      limit: number;
      offset: number;
    },
    // [T-118a] 可选窄化过滤(projectId / validationStatus);省略 → 全量。
    filter?: ListLearningsFilter,
  ): Promise<{ rows: LearningRow[]; total: number }>;
  createLearning(input: CreateLearningInput): Promise<LearningRow>;
  getLearningRowById(learningId: string): Promise<LearningRow>;
  updateLearningStatus(
    learningId: string,
    input: UpdateLearningStatusInput,
  ): Promise<LearningRow>;
  // [T-062a gate-F1] 裁决台 inline 编辑:title/insight/learningType 局部改写。
  patchLearning(
    learningId: string,
    input: { title?: string; insight?: string; learningType?: string },
  ): Promise<LearningRow>;
  createApplication(
    learningId: string,
    input: CreateApplicationInput,
  ): Promise<LearningApplicationRow>;
  countApplications(learningId: string): Promise<number>;
  // Batch reuse-count: one user-scoped grouped read returning the application
  // count for each of the given learning ids (missing ids ⇒ absent from the map,
  // the caller defaults to 0). Avoids an N+1 over countApplications for list reads.
  countApplicationsByLearning(
    learningIds: string[],
  ): Promise<Map<string, number>>;
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

    async listLearnings({ limit, offset }, filter) {
      // [T-118a] 归属门(userId)始终最外层;projectId / validationStatus 是可选的 AND 窄化。
      // 都不传 → where 只剩 userId(全量,旧行为)。
      const conds = [eq(learnings.userId, deps.userId)];
      if (filter?.projectId !== undefined) {
        conds.push(eq(learnings.projectId, filter.projectId));
      }
      if (filter?.validationStatus !== undefined) {
        conds.push(eq(learnings.validationStatus, filter.validationStatus));
      }
      const where = conds.length === 1 ? conds[0] : and(...conds);
      const rows = await db
        .select()
        .from(learnings)
        .where(where)
        .orderBy(desc(learnings.updatedAt))
        .limit(limit)
        .offset(offset);
      const all = await db
        .select({ id: learnings.id })
        .from(learnings)
        .where(where);
      return { rows, total: all.length };
    },

    async createLearning(input) {
      const inserted = await db
        .insert(learnings)
        .values({
          id: deps.nextId("learning"),
          userId: deps.userId,
          reviewId: input.reviewId ?? null,
          // [T-118a gate-F3] 来源作品锚(复盘产经验采纳时带上 task.projectId)。
          projectId: input.projectId ?? null,
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

    async patchLearning(learningId, input) {
      await getRow(learningId); // scoped ownership gate
      const set: Record<string, unknown> = { updatedAt: deps.now() };
      if (input.title !== undefined) set.title = input.title;
      if (input.insight !== undefined) set.insight = input.insight;
      if (input.learningType !== undefined) set.learningType = input.learningType;
      const updated = await db
        .update(learnings)
        .set(set)
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

    async countApplicationsByLearning(learningIds) {
      if (learningIds.length === 0) return new Map<string, number>();
      const rows = await db
        .select({
          learningId: learningApplications.learningId,
          count: sql<number>`count(*)`,
        })
        .from(learningApplications)
        .where(
          and(
            eq(learningApplications.userId, deps.userId),
            inArray(learningApplications.learningId, learningIds),
          ),
        )
        .groupBy(learningApplications.learningId);
      const map = new Map<string, number>();
      for (const r of rows) {
        map.set(r.learningId, Number(r.count));
      }
      return map;
    },
  };
}
