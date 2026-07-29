import {
  and,
  desc,
  eq,
  inArray,
  or,
  sql,
  type Db,
} from "@creatoros/backend";
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
  // [T-332 S2 · ISO-02/03] 第二所有权维度,**必填 strict**:读门恒叠 eq(table.accountId),
  // 写路径盖章当前号。未选号在 service 入口 requireAccountId 即被拒(SPEC §4.2 引导态)。
  accountId: string;
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
  // [T-284c G3-A] 落地状态可显式传(默认 candidate,向后兼容):grounded 经验 capture 时直接
  // validated 自动进生成。service 据 evidenceStrength 决定,repo 只忠实落库。
  validationStatus?: string;
  // [T-284c G3-A] 真实证据强度('grounded' | null);派生列,service 算好传入。
  evidenceStrength?: string | null;
  contentFingerprint?: string | null;
}

export interface AdoptLearningInput {
  title: string;
  insight: string;
  learningType: string;
  projectId?: string | null;
  contentFingerprint: string;
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
  adoptLearning(input: AdoptLearningInput): Promise<LearningRow>;
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
        and(
          eq(learnings.userId, deps.userId),
          // [T-332 S2 · §4.5 by-id 门] strict 恒叠号:跨号 learning 与未知 id 同样 404。
          eq(learnings.accountId, deps.accountId),
          eq(learnings.id, learningId),
        ),
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
      const conds = [
        eq(learnings.userId, deps.userId),
        // [T-332 S2 · ISO-02] 号维度 strict 恒叠(无「无号全量」退化)。
        eq(learnings.accountId, deps.accountId),
      ];
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
          // [T-332 S2 · ISO-03] 号维度盖章(必填,无 null 兜底)。
          accountId: deps.accountId,
          reviewId: input.reviewId ?? null,
          // [T-118a gate-F3] 来源作品锚(复盘产经验采纳时带上 task.projectId)。
          projectId: input.projectId ?? null,
          learningType: input.learningType,
          title: input.title,
          insight: input.insight,
          recommendation: input.recommendation,
          // [T-284c G3-A] 默认 candidate(旧行为);grounded 经验 service 传 'validated' 自动进生成。
          validationStatus: input.validationStatus ?? "candidate",
          confidenceScore: input.confidenceScore,
          // [T-284c G3-A] 真实证据强度派生列(service 算好;无背书 → null)。
          evidenceStrength: input.evidenceStrength ?? null,
          contentFingerprint: input.contentFingerprint ?? null,
          createdAt: deps.now(),
          updatedAt: deps.now(),
        })
        .returning();
      return inserted[0]!;
    },

    async adoptLearning(input) {
      try {
        return await db.transaction(async (tx) => {
          const matches = await tx
            .select()
            .from(learnings)
            .where(
              and(
                eq(learnings.userId, deps.userId),
                eq(learnings.accountId, deps.accountId),
                sql`${learnings.validationStatus} <> 'discarded'`,
                or(
                  eq(learnings.contentFingerprint, input.contentFingerprint),
                  and(
                    eq(learnings.title, input.title),
                    eq(learnings.insight, input.insight),
                  ),
                ),
              ),
            );
          const [keeper, ...duplicates] = matches.sort((left, right) => {
            const status =
              Number(left.validationStatus !== "validated") -
              Number(right.validationStatus !== "validated");
            if (status !== 0) return status;
            return (
              left.createdAt.localeCompare(right.createdAt) ||
              left.id.localeCompare(right.id)
            );
          });

          // [T-610] 重复历史不物理删：标 discarded 并释放活动唯一键，避免打断
          // learning_applications / calibration suggestions 等既有引用。
          if (duplicates.length > 0) {
            await tx
              .update(learnings)
              .set({
                validationStatus: "discarded",
                contentFingerprint: null,
                updatedAt: deps.now(),
              })
              .where(
                and(
                  eq(learnings.userId, deps.userId),
                  eq(learnings.accountId, deps.accountId),
                  inArray(
                    learnings.id,
                    duplicates.map((row) => row.id),
                  ),
                ),
              );
          }

          if (keeper) {
            const [adopted] = await tx
              .update(learnings)
              .set({
                title: input.title,
                insight: input.insight,
                learningType: input.learningType,
                projectId: keeper.projectId ?? input.projectId ?? null,
                validationStatus: "validated",
                confidenceScore: Math.max(40, keeper.confidenceScore),
                contentFingerprint: input.contentFingerprint,
                updatedAt: deps.now(),
              })
              .where(
                and(
                  eq(learnings.userId, deps.userId),
                  eq(learnings.accountId, deps.accountId),
                  eq(learnings.id, keeper.id),
                ),
              )
              .returning();
            return adopted!;
          }

          const [created] = await tx
            .insert(learnings)
            .values({
              id: deps.nextId("learning"),
              userId: deps.userId,
              accountId: deps.accountId,
              reviewId: null,
              projectId: input.projectId ?? null,
              learningType: input.learningType,
              title: input.title,
              insight: input.insight,
              recommendation: "",
              validationStatus: "validated",
              confidenceScore: 40,
              evidenceStrength: null,
              contentFingerprint: input.contentFingerprint,
              createdAt: deps.now(),
              updatedAt: deps.now(),
            })
            .returning();
          return created!;
        });
      } catch (error) {
        // 两个窗口同时采纳同一经验时，唯一索引只允许一个事务成功。败方在事务回滚后
        // 读回赢家，保持“重复采纳返回同一事实”而不是向用户冒一个冲突错误。
        const [winner] = await db
          .select()
          .from(learnings)
          .where(
            and(
              eq(learnings.userId, deps.userId),
              eq(learnings.accountId, deps.accountId),
              eq(learnings.contentFingerprint, input.contentFingerprint),
              eq(learnings.validationStatus, "validated"),
            ),
          )
          .limit(1);
        if (winner) return winner;
        throw error;
      }
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
          // [T-332 S2 · ISO-03] 号维度盖章(与父 learning 同号;必填)。
          accountId: deps.accountId,
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
            // [T-332 S2 · ISO-02] 号维度 strict 恒叠。
            eq(learningApplications.accountId, deps.accountId),
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
            // [T-332 S2 · ISO-02] 号维度 strict 恒叠。
            eq(learningApplications.accountId, deps.accountId),
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
