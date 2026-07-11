import { and, desc, eq, type Db } from "@creatoros/backend";
import { trendSources } from "./trend-sources.db-schema";
import { OwnershipError } from "./trend-sources.errors";

// [T-235b] TrendSources repository —— user-scoped(userId baked into deps,照 benchmark 先例)。
// EVERY 查询 filter eq(userId) / EVERY insert stamp userId。toggle/remove 先 ownership-scoped
// select,缺失 → OwnershipError(404,不泄露跨用户行存在)。account_id 从输入 stamp(按号隔离)。

export type TrendSourceRow = typeof trendSources.$inferSelect;

export interface RepoDeps {
  now: () => string;
  nextId: (prefix: string) => string;
  userId: string; // 所有权边界,构造时 baked in
}

export interface CreateTrendSourceInput {
  accountId?: string | null;
  url: string;
  name?: string | null;
  sourceType: "web" | "rss";
  domain: string;
  note?: string | null;
  enabled?: boolean;
}

export interface TrendSourcesRepository {
  listSources(
    accountId: string | null,
    query: { limit: number; offset: number },
  ): Promise<{ rows: TrendSourceRow[]; total: number }>;
  /** 抓取用:列该号(accountId=null → 全量)enabled 的信源。 */
  listEnabledSources(accountId: string | null): Promise<TrendSourceRow[]>;
  /** 幂等 create:同 (user, url) 已存在 → 更新展示字段/enabled 并返回既有(不新建)。 */
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
    async listSources(accountId, { limit, offset }) {
      const where = accountId
        ? and(
            eq(trendSources.userId, deps.userId),
            eq(trendSources.accountId, accountId),
          )
        : eq(trendSources.userId, deps.userId);
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

    async listEnabledSources(accountId) {
      const where = accountId
        ? and(
            eq(trendSources.userId, deps.userId),
            eq(trendSources.accountId, accountId),
            eq(trendSources.enabled, true),
          )
        : and(
            eq(trendSources.userId, deps.userId),
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
          accountId: input.accountId ?? null,
          name: input.name ?? "",
          url: input.url,
          sourceType: input.sourceType,
          domain: input.domain,
          note: input.note ?? null,
          enabled: input.enabled ?? true,
          createdAt: nowIso,
          updatedAt: nowIso,
        })
        // 幂等:命中 (user, url) 唯一 → 更新展示字段/enabled(不冒重复源)。
        .onConflictDoUpdate({
          target: [trendSources.userId, trendSources.url],
          set: {
            name: input.name ?? "",
            sourceType: input.sourceType,
            domain: input.domain,
            note: input.note ?? null,
            enabled: input.enabled ?? true,
            updatedAt: nowIso,
          },
        })
        .returning();
      return inserted[0]!;
    },

    async setSourceEnabled(sourceId, enabled) {
      await requireOwnedSource(db, deps.userId, sourceId);
      const updated = await db
        .update(trendSources)
        .set({ enabled, updatedAt: deps.now() })
        .where(
          and(
            eq(trendSources.userId, deps.userId),
            eq(trendSources.id, sourceId),
          ),
        )
        .returning();
      return updated[0]!;
    },

    async removeSource(sourceId) {
      const row = await requireOwnedSource(db, deps.userId, sourceId);
      await db
        .delete(trendSources)
        .where(
          and(
            eq(trendSources.userId, deps.userId),
            eq(trendSources.id, sourceId),
          ),
        );
      return row;
    },
  };
}

// Ownership gate:跨用户 / 未知 id select 空 → OwnershipError(404,不泄露行存在)。
async function requireOwnedSource(
  db: Db,
  userId: string,
  sourceId: string,
): Promise<TrendSourceRow> {
  const rows = await db
    .select()
    .from(trendSources)
    .where(and(eq(trendSources.userId, userId), eq(trendSources.id, sourceId)));
  const row = rows[0];
  if (!row) {
    throw new OwnershipError(`OwnershipError: trend source not found: ${sourceId}`);
  }
  return row;
}
