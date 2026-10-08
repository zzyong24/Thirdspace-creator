import {workspaceFilter,workspaceKey} from "../../workspace-scope";
import { and, desc, eq, type Db } from "@creatoros/backend";
import { topicAttributions } from "./topic-attribution.db-schema";

// [T-235d → T-332 S2] TopicAttribution repository —— user+account scoped(userId/accountId
// baked into deps,照 trend-sources 先例)。EVERY 查询 filter eq(userId) AND eq(accountId)
// (strict,SPEC §4.1)/ EVERY insert stamp userId+accountId(§4.6 防绕过)。
// 幂等锚:(user_id, publication_id) 唯一保持不变(SPEC §3.1 裁决:publication 本身已归号,
// 一条发布作品至多一条归因,无需 account 入键)—— upsert:同作品重跑归因 → 覆盖更新(不重复行)。
// [gate-F1] 只写本表,零 learnings 依赖(选题维度资产与脚本级经验不共写、不互相触发)。

export type TopicAttributionRow = Omit<typeof topicAttributions.$inferSelect,"groupId"> & {groupId?:string|null};

export interface RepoDeps {
  now: () => string;
  nextId: (prefix: string) => string;
  userId: string; // 所有权边界,构造时 baked in
  // [T-332 S2] 第二属主维度(账号全域隔离)。必填:service 入口经 requireAccountId 收窄后传入。
  accountId: string|null;
  groupId?:string|null;
}

export interface CreateTopicAttributionInput {
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
  listAttributions(query: {
    limit: number;
    offset: number;
    publicationId?: string;
  }): Promise<{ rows: TopicAttributionRow[]; total: number }>;
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
    async listAttributions({ limit, offset, publicationId }) {
      // [T-332 S2] strict:无条件叠号门(无「无号 → 全量」退化)。
      const conditions = [
        eq(topicAttributions.userId, deps.userId),
        workspaceFilter(topicAttributions,workspaceKey(deps)),
      ];
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
      // [T-332 S2] 叠号门:publication 已归号,正常路径同号恒真;跨号查询诚实返回 false
      // (该作品在当前号工作区不存在)。
      const rows = await db
        .select({ id: topicAttributions.id })
        .from(topicAttributions)
        .where(
          and(
            eq(topicAttributions.userId, deps.userId),
            workspaceFilter(topicAttributions,workspaceKey(deps)),
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
          // [T-332 S2] stamp 当前号(repo 不接受调用方显式传号,§4.6)。
          accountId: deps.accountId,
          groupId: deps.groupId??null,
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
        // 幂等:命中 ux_topic_attributions_pub (user, publication) 唯一 → 覆盖更新归因结论
        // (id/createdAt 保留)。[T-332 S2] 该键**不含 account_id**(SPEC §3.1 裁决:
        // publication 本身已归号,同 publication 不会跨号重复),target 不变。
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
      // [T-332 S2] by-id 读叠号一致性门(跨号 → null,读面按不存在处理,§4.5)。
      const rows = await db
        .select()
        .from(topicAttributions)
        .where(
          and(
            eq(topicAttributions.userId, deps.userId),
            workspaceFilter(topicAttributions,workspaceKey(deps)),
            eq(topicAttributions.id, attributionId),
          ),
        );
      return rows[0] ?? null;
    },
  };
}
