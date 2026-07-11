import { and, desc, eq, type Db } from "@creatoros/backend";
import { topicAttributions } from "./topic-attribution.db-schema";

// [T-235d] TopicAttribution repository —— user-scoped(userId baked into deps,照 trend-sources
// 先例)。EVERY 查询 filter eq(userId) / EVERY insert stamp userId。
// 幂等锚:(user_id, publication_id) 唯一 —— upsert:同作品重跑归因 → 覆盖更新(不重复行)。
// [gate-F1] 只写本表,零 learnings 依赖(选题维度资产与脚本级经验不共写、不互相触发)。

export type TopicAttributionRow = typeof topicAttributions.$inferSelect;

export interface RepoDeps {
  now: () => string;
  nextId: (prefix: string) => string;
  userId: string; // 所有权边界,构造时 baked in
}

export interface CreateTopicAttributionInput {
  accountId?: string | null;
  publicationId: string;
  projectId?: string | null;
  performanceTier: string; // viral|normal|low(相对本账号基线)
  baselineRatio?: number | null;
  topicType: string;
  hookType: string;
  structureFormula: string;
  whyWorked?: string;
  whyFailed?: string;
  reusableFormula?: string;
  raw?: Record<string, unknown>;
}

export interface TopicAttributionRepository {
  listAttributions(
    accountId: string | null,
    query: { limit: number; offset: number; publicationId?: string },
  ): Promise<{ rows: TopicAttributionRow[]; total: number }>;
  /** 幂等锚:该作品是否已归因(runner 跳过已归因作品)。 */
  hasAttribution(publicationId: string): Promise<boolean>;
  /** upsert:同 (user, publication) 已存在 → 覆盖更新归因结论(重跑不重复行)。 */
  createAttribution(
    input: CreateTopicAttributionInput,
  ): Promise<TopicAttributionRow>;
  getAttribution(attributionId: string): Promise<TopicAttributionRow | null>;
}

export function createTopicAttributionRepository(
  db: Db,
  deps: RepoDeps,
): TopicAttributionRepository {
  return {
    async listAttributions(accountId, { limit, offset, publicationId }) {
      const conditions = [eq(topicAttributions.userId, deps.userId)];
      if (accountId) {
        conditions.push(eq(topicAttributions.accountId, accountId));
      }
      if (publicationId) {
        conditions.push(eq(topicAttributions.publicationId, publicationId));
      }
      const where = and(...conditions);
      const rows = await db
        .select()
        .from(topicAttributions)
        .where(where)
        .orderBy(desc(topicAttributions.createdAt))
        .limit(limit)
        .offset(offset);
      const all = await db
        .select({ id: topicAttributions.id })
        .from(topicAttributions)
        .where(where);
      return { rows, total: all.length };
    },

    async hasAttribution(publicationId) {
      const rows = await db
        .select({ id: topicAttributions.id })
        .from(topicAttributions)
        .where(
          and(
            eq(topicAttributions.userId, deps.userId),
            eq(topicAttributions.publicationId, publicationId),
          ),
        )
        .limit(1);
      return rows.length > 0;
    },

    async createAttribution(input) {
      const nowIso = deps.now();
      const inserted = await db
        .insert(topicAttributions)
        .values({
          id: deps.nextId("tattr"),
          userId: deps.userId,
          accountId: input.accountId ?? null,
          publicationId: input.publicationId,
          projectId: input.projectId ?? null,
          performanceTier: input.performanceTier,
          baselineRatio: input.baselineRatio ?? null,
          topicType: input.topicType,
          hookType: input.hookType,
          structureFormula: input.structureFormula,
          whyWorked: input.whyWorked ?? "",
          whyFailed: input.whyFailed ?? "",
          reusableFormula: input.reusableFormula ?? "",
          raw: input.raw ?? {},
          createdAt: nowIso,
          updatedAt: nowIso,
        })
        // 幂等:命中 (user, publication) 唯一 → 覆盖更新归因结论(id/createdAt 保留)。
        .onConflictDoUpdate({
          target: [topicAttributions.userId, topicAttributions.publicationId],
          set: {
            performanceTier: input.performanceTier,
            baselineRatio: input.baselineRatio ?? null,
            topicType: input.topicType,
            hookType: input.hookType,
            structureFormula: input.structureFormula,
            whyWorked: input.whyWorked ?? "",
            whyFailed: input.whyFailed ?? "",
            reusableFormula: input.reusableFormula ?? "",
            raw: input.raw ?? {},
            updatedAt: nowIso,
          },
        })
        .returning();
      return inserted[0]!;
    },

    async getAttribution(attributionId) {
      const rows = await db
        .select()
        .from(topicAttributions)
        .where(
          and(
            eq(topicAttributions.userId, deps.userId),
            eq(topicAttributions.id, attributionId),
          ),
        );
      return rows[0] ?? null;
    },
  };
}
