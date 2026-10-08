import {workspaceFilter,workspaceKey} from "../../workspace-scope";
import { and, desc, eq, type Db } from "@creatoros/backend";
import { trendSources } from "./trend-sources.db-schema";
import { OwnershipError } from "./trend-sources.errors";

// [T-235b → T-332 S2] TrendSources repository —— user+account scoped(userId/accountId baked
// into deps,照 benchmark 先例)。EVERY 查询 filter eq(userId) AND eq(accountId)(strict,
// SPEC §4.1)/ EVERY insert stamp userId+accountId(repo 不接受调用方显式传号,§4.6)。
// toggle/remove 先 ownership-scoped select(叠号门),缺失/跨号 → OwnershipError(404)。

export type TrendSourceRow = Omit<typeof trendSources.$inferSelect,"groupId"> & {groupId?:string|null};

export interface RepoDeps {
  now: () => string;
  nextId: (prefix: string) => string;
  userId: string; // 所有权边界,构造时 baked in
  // [T-332 S2] 第二属主维度(账号全域隔离)。必填:service 入口经 requireAccountId 收窄后传入。
  accountId: string|null;
  groupId?:string|null;
}

export interface CreateTrendSourceInput {
  url: string;
  name?: string | null;
  sourceType: "web" | "rss";
  domain: string;
  note?: string | null;
  enabled?: boolean;
}

export interface TrendSourcesRepository {
  listSources(query: {
    limit: number;
    offset: number;
  }): Promise<{ rows: TrendSourceRow[]; total: number }>;
  /** 抓取用:列该号(deps.accountId,strict)enabled 的信源。 */
  listEnabledSources(): Promise<TrendSourceRow[]>;
  /** 幂等 create:同 (user, account, url) 已存在 → 更新展示字段/enabled 并返回既有(不新建)。 */
  createSource(input: CreateTrendSourceInput): Promise<TrendSourceRow>;
  /** 切 enabled(ownership gate;不存在 → OwnershipError 404)。 */
  setSourceEnabled(sourceId: string, enabled: boolean): Promise<TrendSourceRow>;
  /** 删信源(ownership gate)。 */
  removeSource(sourceId: string): Promise<TrendSourceRow>;
}

export function createTrendSourcesRepository(
  db: Db,
  deps: RepoDeps,
): TrendSourcesRepository {
  return {
    async listSources({ limit, offset }) {
      // [T-332 S2] strict:无条件叠号门(无「无号 → 全量」退化)。
      const where = and(
        eq(trendSources.userId, deps.userId),
        workspaceFilter(trendSources,workspaceKey(deps)),
      );
      const rows = await db
        .select()
        .from(trendSources)
        .where(where)
        .orderBy(desc(trendSources.createdAt))
        .limit(limit)
        .offset(offset);
      const all = await db
        .select({ id: trendSources.id })
        .from(trendSources)
        .where(where);
      return { rows, total: all.length };
    },

    async listEnabledSources() {
      const where = and(
        eq(trendSources.userId, deps.userId),
        workspaceFilter(trendSources,workspaceKey(deps)),
        eq(trendSources.enabled, true),
      );
      return db.select().from(trendSources).where(where);
    },

    async createSource(input) {
      const nowIso = deps.now();
      const inserted = await db
        .insert(trendSources)
        .values({
          id: deps.nextId("trsrc"),
          userId: deps.userId,
          // [T-332 S2] stamp 当前号(repo 不接受调用方显式传号,§4.6)。
          accountId: deps.accountId,
          groupId: deps.groupId??null,
          name: input.name ?? "",
          url: input.url,
          sourceType: input.sourceType,
          domain: input.domain,
          note: input.note ?? null,
          enabled: input.enabled ?? true,
          createdAt: nowIso,
          updatedAt: nowIso,
        })
        // [T-332 S2] 幂等:命中 ux_trend_sources_identity_v2 (user, account, url)
        // (迁移 0042)→ 更新展示字段/enabled(不冒重复源)。conflict target 必须与 _v2
        // 索引列一致(含 account_id);两个号登记同一 URL 信源合法,各自成行。
        .onConflictDoNothing()
        .returning();
      const owned=inserted[0]??(await db.select().from(trendSources).where(and(eq(trendSources.userId,deps.userId), workspaceFilter(trendSources,workspaceKey(deps)), eq(trendSources.url,input.url))).limit(1))[0];
      if(!owned)throw new OwnershipError("研究资料不存在");
      const [updated]=await db.update(trendSources).set({
            name: input.name ?? "",
            sourceType: input.sourceType,
            domain: input.domain,
            note: input.note ?? null,
            enabled: input.enabled ?? true,
            updatedAt: nowIso,
      }).where(and(eq(trendSources.userId,deps.userId), workspaceFilter(trendSources,workspaceKey(deps)), eq(trendSources.url,input.url),eq(trendSources.id,owned.id))).returning();
      if(!updated)throw new OwnershipError("研究资料不存在");
      return updated;
    },

    async setSourceEnabled(sourceId, enabled) {
      await requireOwnedSource(db, deps, sourceId);
      const updated = await db
        .update(trendSources)
        .set({ enabled, updatedAt: deps.now() })
        .where(
          and(
            eq(trendSources.userId, deps.userId),
            workspaceFilter(trendSources,workspaceKey(deps)),
            eq(trendSources.id, sourceId),
          ),
        )
        .returning();
      return updated[0]!;
    },

    async removeSource(sourceId) {
      const row = await requireOwnedSource(db, deps, sourceId);
      await db
        .delete(trendSources)
        .where(
          and(
            eq(trendSources.userId, deps.userId),
            workspaceFilter(trendSources,workspaceKey(deps)),
            eq(trendSources.id, sourceId),
          ),
        );
      return row;
    },
  };
}

// Ownership gate:跨用户 / 跨号 / 未知 id select 空 → OwnershipError(404,不泄露行存在;
// [T-332 S2] by-id 读叠号一致性门,SPEC §4.5)。
async function requireOwnedSource(
  db: Db,
  deps: Pick<RepoDeps, "userId" | "accountId">,
  sourceId: string,
): Promise<TrendSourceRow> {
  const rows = await db
    .select()
    .from(trendSources)
    .where(
      and(
        eq(trendSources.userId, deps.userId),
        workspaceFilter(trendSources,workspaceKey(deps)),
        eq(trendSources.id, sourceId),
      ),
    );
  const row = rows[0];
  if (!row) {
    throw new OwnershipError(`OwnershipError: trend source not found: ${sourceId}`);
  }
  return row;
}
