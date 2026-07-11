import { and, desc, eq, type Db } from "@creatoros/backend";
import { benchmarkSources, benchmarkWorks } from "./benchmark.db-schema";
import { OwnershipError } from "./benchmark.errors";

// [T-212a] Benchmark repository —— user-scoped（userId baked into deps，同 material-links）。
// EVERY 查询 filter eq(userId) / EVERY insert stamp userId。remove 先 ownership-scoped select，
// 缺失 → OwnershipError(404，不泄露跨用户行存在)。account_id 从输入 stamp(按号隔离，T-201)。

export type BenchmarkSourceRow = typeof benchmarkSources.$inferSelect;
export type BenchmarkWorkRow = typeof benchmarkWorks.$inferSelect;

export interface RepoDeps {
  now: () => string;
  nextId: (prefix: string) => string;
  userId: string; // 所有权边界，构造时 baked in
}

export interface CreateSourceInput {
  accountId?: string | null;
  platform?: string;
  externalAccountId: string; // sec_uid（稳定身份键）
  nickname?: string | null;
  homeUrl?: string | null;
  note?: string | null;
  enabled?: boolean;
}

export interface UpsertWorkInput {
  accountId?: string | null;
  sourceId: string;
  sourceExternalAccountId: string;
  platform?: string;
  awemeId: string;
  description?: string;
  diggCount: number;
  commentCount?: number | null;
  collectCount?: number | null;
  shareCount?: number | null;
  duration?: number | null;
  createTime?: string | null;
  isViral?: boolean;
  viralMultiple?: number | null;
  capturedAt: string;
}

export interface BenchmarkRepository {
  seedSources(rows: BenchmarkSourceRow[]): Promise<void>;
  listSources(
    accountId: string | null,
    query: { limit: number; offset: number },
  ): Promise<{ rows: BenchmarkSourceRow[]; total: number }>;
  /** 采集用：列该号（accountId=null → 全量）enabled 的对标源。 */
  listEnabledSources(accountId: string | null): Promise<BenchmarkSourceRow[]>;
  /** 幂等 create：同 (user, platform, sec_uid) 已存在 → 更新展示字段/enabled 并返回既有（不新建）。 */
  createSource(input: CreateSourceInput): Promise<BenchmarkSourceRow>;
  /** 切 enabled（ownership gate；不存在 → OwnershipError 404）。 */
  setSourceEnabled(sourceId: string, enabled: boolean): Promise<BenchmarkSourceRow>;
  /** 删对标源（ownership gate）。 */
  removeSource(sourceId: string): Promise<BenchmarkSourceRow>;
  /** 幂等 upsert 对标作品（同 (user, platform, aweme_id) 冲突 → 更新统计/爆款/时间）。返回 inserted 标志。 */
  upsertWork(input: UpsertWorkInput): Promise<{ row: BenchmarkWorkRow; inserted: boolean }>;
  /** [T-212c] 采集用：列该号（accountId=null → 全量）**待拆的爆款作品**（is_viral=true AND
   *  teardown_status='pending'），按爆款倍数降序（越突出越先拆），上限 limit。命中
   *  ix_benchmark_works_user_viral (user_id, is_viral, teardown_status) 索引。 */
  listPendingViral(accountId: string | null, limit: number): Promise<BenchmarkWorkRow[]>;
  /** [T-212c] 拆解完成 → 置 teardown_status='done'（ownership gate；不存在 → OwnershipError 404）。
   *  幂等：已 done 的行再置 done 无副作用（防重拆）。 */
  markTeardownDone(workId: string): Promise<BenchmarkWorkRow>;
}

export function createBenchmarkRepository(db: Db, deps: RepoDeps): BenchmarkRepository {
  return {
    async seedSources(rows) {
      if (rows.length === 0) return;
      await db.insert(benchmarkSources).values(rows).onConflictDoNothing();
    },

    async listSources(accountId, { limit, offset }) {
      const where = accountId
        ? and(
            eq(benchmarkSources.userId, deps.userId),
            eq(benchmarkSources.accountId, accountId),
          )
        : eq(benchmarkSources.userId, deps.userId);
      const rows = await db
        .select()
        .from(benchmarkSources)
        .where(where)
        .orderBy(desc(benchmarkSources.createdAt))
        .limit(limit)
        .offset(offset);
      const all = await db
        .select({ id: benchmarkSources.id })
        .from(benchmarkSources)
        .where(where);
      return { rows, total: all.length };
    },

    async listEnabledSources(accountId) {
      const where = accountId
        ? and(
            eq(benchmarkSources.userId, deps.userId),
            eq(benchmarkSources.accountId, accountId),
            eq(benchmarkSources.enabled, true),
          )
        : and(
            eq(benchmarkSources.userId, deps.userId),
            eq(benchmarkSources.enabled, true),
          );
      return db.select().from(benchmarkSources).where(where);
    },

    async createSource(input) {
      const platform = input.platform ?? "douyin";
      const nowIso = deps.now();
      const inserted = await db
        .insert(benchmarkSources)
        .values({
          id: deps.nextId("bmsrc"),
          userId: deps.userId,
          accountId: input.accountId ?? null,
          platform,
          externalAccountId: input.externalAccountId,
          nickname: input.nickname ?? null,
          homeUrl: input.homeUrl ?? null,
          note: input.note ?? null,
          enabled: input.enabled ?? true,
          createdAt: nowIso,
          updatedAt: nowIso,
        })
        // 幂等:命中 (user, platform, sec_uid) 唯一 → 更新展示字段/enabled（不冒重复源）。
        .onConflictDoUpdate({
          target: [
            benchmarkSources.userId,
            benchmarkSources.platform,
            benchmarkSources.externalAccountId,
          ],
          set: {
            nickname: input.nickname ?? null,
            homeUrl: input.homeUrl ?? null,
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
        .update(benchmarkSources)
        .set({ enabled, updatedAt: deps.now() })
        .where(
          and(
            eq(benchmarkSources.userId, deps.userId),
            eq(benchmarkSources.id, sourceId),
          ),
        )
        .returning();
      return updated[0]!;
    },

    async removeSource(sourceId) {
      const row = await requireOwnedSource(db, deps.userId, sourceId);
      await db
        .delete(benchmarkSources)
        .where(
          and(
            eq(benchmarkSources.userId, deps.userId),
            eq(benchmarkSources.id, sourceId),
          ),
        );
      return row;
    },

    async upsertWork(input) {
      const platform = input.platform ?? "douyin";
      const nowIso = deps.now();
      // 先查是否已存在（决定 inserted 标志 + 保留 createdAt）。
      const existing = await db
        .select()
        .from(benchmarkWorks)
        .where(
          and(
            eq(benchmarkWorks.userId, deps.userId),
            eq(benchmarkWorks.platform, platform),
            eq(benchmarkWorks.awemeId, input.awemeId),
          ),
        );
      const wasExisting = existing.length > 0;
      const rows = await db
        .insert(benchmarkWorks)
        .values({
          id: deps.nextId("bmwork"),
          userId: deps.userId,
          accountId: input.accountId ?? null,
          sourceId: input.sourceId,
          sourceExternalAccountId: input.sourceExternalAccountId,
          platform,
          awemeId: input.awemeId,
          description: input.description ?? "",
          diggCount: input.diggCount,
          commentCount: input.commentCount ?? null,
          collectCount: input.collectCount ?? null,
          shareCount: input.shareCount ?? null,
          duration: input.duration ?? null,
          createTime: input.createTime ?? null,
          isViral: input.isViral ?? false,
          viralMultiple: input.viralMultiple ?? null,
          capturedAt: input.capturedAt,
          createdAt: nowIso,
          updatedAt: nowIso,
        })
        // 幂等 upsert:同作品跨采集 run 更新最新统计/爆款判定（不改 teardown_status —— T-212c 拆解态由它管）。
        .onConflictDoUpdate({
          target: [
            benchmarkWorks.userId,
            benchmarkWorks.platform,
            benchmarkWorks.awemeId,
          ],
          set: {
            description: input.description ?? "",
            diggCount: input.diggCount,
            commentCount: input.commentCount ?? null,
            collectCount: input.collectCount ?? null,
            shareCount: input.shareCount ?? null,
            duration: input.duration ?? null,
            createTime: input.createTime ?? null,
            isViral: input.isViral ?? false,
            viralMultiple: input.viralMultiple ?? null,
            capturedAt: input.capturedAt,
            updatedAt: nowIso,
          },
        })
        .returning();
      return { row: rows[0]!, inserted: !wasExisting };
    },

    async listPendingViral(accountId, limit) {
      const base = [
        eq(benchmarkWorks.userId, deps.userId),
        eq(benchmarkWorks.isViral, true),
        eq(benchmarkWorks.teardownStatus, "pending"),
      ];
      const where = accountId
        ? and(...base, eq(benchmarkWorks.accountId, accountId))
        : and(...base);
      return db
        .select()
        .from(benchmarkWorks)
        .where(where)
        // 越突出（爆款倍数高）越先拆；同倍数按赞降序。
        .orderBy(desc(benchmarkWorks.viralMultiple), desc(benchmarkWorks.diggCount))
        .limit(limit);
    },

    async markTeardownDone(workId) {
      await requireOwnedWork(db, deps.userId, workId);
      const updated = await db
        .update(benchmarkWorks)
        .set({ teardownStatus: "done", updatedAt: deps.now() })
        .where(
          and(
            eq(benchmarkWorks.userId, deps.userId),
            eq(benchmarkWorks.id, workId),
          ),
        )
        .returning();
      return updated[0]!;
    },
  };
}

// Ownership gate（对标作品）:跨用户 / 未知 id select 空 → OwnershipError(404，不泄露行存在)。
async function requireOwnedWork(
  db: Db,
  userId: string,
  workId: string,
): Promise<BenchmarkWorkRow> {
  const rows = await db
    .select()
    .from(benchmarkWorks)
    .where(and(eq(benchmarkWorks.userId, userId), eq(benchmarkWorks.id, workId)));
  const row = rows[0];
  if (!row) {
    throw new OwnershipError(`OwnershipError: benchmark work not found: ${workId}`);
  }
  return row;
}

// Ownership gate:跨用户 / 未知 id select 空 → OwnershipError(404，不泄露行存在)。
async function requireOwnedSource(
  db: Db,
  userId: string,
  sourceId: string,
): Promise<BenchmarkSourceRow> {
  const rows = await db
    .select()
    .from(benchmarkSources)
    .where(
      and(eq(benchmarkSources.userId, userId), eq(benchmarkSources.id, sourceId)),
    );
  const row = rows[0];
  if (!row) {
    throw new OwnershipError(`OwnershipError: benchmark source not found: ${sourceId}`);
  }
  return row;
}
