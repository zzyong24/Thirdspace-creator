import { and, desc, eq, type Db } from "@creatoros/backend";
import { benchmarkSources, benchmarkWorks } from "./benchmark.db-schema";
import { OwnershipError } from "./benchmark.errors";

// [T-212a → T-332 S2] Benchmark repository —— user+account scoped（userId/accountId baked
// into deps）。EVERY 查询 filter eq(userId) AND eq(accountId)(strict,SPEC §4.1,无「null =
// 全量」退化)/ EVERY insert stamp userId+accountId(repo 不接受调用方显式传号,§4.6 防绕过)。
// remove/toggle 先 ownership-scoped select(叠号门),缺失/跨号 → OwnershipError(404,
// 不泄露跨用户/跨号行存在)。

export type BenchmarkSourceRow = typeof benchmarkSources.$inferSelect;
export type BenchmarkWorkRow = typeof benchmarkWorks.$inferSelect;

export interface RepoDeps {
  now: () => string;
  nextId: (prefix: string) => string;
  userId: string; // 所有权边界，构造时 baked in
  // [T-332 S2] 第二属主维度(账号全域隔离)。必填:service 入口经 requireAccountId 收窄
  // 后传入,未选号到不了 repo(引导态禁读写)。
  accountId: string;
}

export interface CreateSourceInput {
  platform?: string;
  externalAccountId: string; // sec_uid（稳定身份键）
  nickname?: string | null;
  homeUrl?: string | null;
  note?: string | null;
  enabled?: boolean;
}

export interface UpsertWorkInput {
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
  // [T-235b] 发现方式维度(缺省 benchmark;黑马雷达传 darkhorse,viralMultiple 存赞粉比)。
  discovery?: "benchmark" | "darkhorse";
  authorFollowerCount?: number | null;
  discoveryKeyword?: string | null;
  capturedAt: string;
}

export interface BenchmarkRepository {
  seedSources(rows: BenchmarkSourceRow[]): Promise<void>;
  listSources(query: {
    limit: number;
    offset: number;
  }): Promise<{ rows: BenchmarkSourceRow[]; total: number }>;
  /** 采集用：列该号(deps.accountId,strict)enabled 的对标源。 */
  listEnabledSources(): Promise<BenchmarkSourceRow[]>;
  /** 幂等 create：同 (user, account, platform, sec_uid) 已存在 → 更新展示字段/enabled 并返回既有（不新建）。 */
  createSource(input: CreateSourceInput): Promise<BenchmarkSourceRow>;
  /** 切 enabled（ownership gate；不存在 → OwnershipError 404）。 */
  setSourceEnabled(sourceId: string, enabled: boolean): Promise<BenchmarkSourceRow>;
  /** 删对标源（ownership gate）。 */
  removeSource(sourceId: string): Promise<BenchmarkSourceRow>;
  /** 幂等 upsert 对标作品（同 (user, account, platform, aweme_id) 冲突 → 更新统计/爆款/时间）。返回 inserted 标志。 */
  upsertWork(input: UpsertWorkInput): Promise<{ row: BenchmarkWorkRow; inserted: boolean }>;
  /** [T-349b] 列该号(deps.accountId,strict)对标作品分页(按 capturedAt 降序,最新采集在前)。
   *  照 listSources 分页范式返回 { rows, total }(total 供 list envelope meta)。 */
  listWorks(query: {
    limit: number;
    offset: number;
  }): Promise<{ rows: BenchmarkWorkRow[]; total: number }>;
  /** [T-212c] 采集用：列该号(deps.accountId,strict)**待拆的爆款作品**（is_viral=true AND
   *  teardown_status='pending'），按爆款倍数降序（越突出越先拆），上限 limit。命中
   *  ix_benchmark_works_user_viral (user_id, is_viral, teardown_status) 索引。 */
  listPendingViral(limit: number): Promise<BenchmarkWorkRow[]>;
  /** [T-212c] 拆解完成 → 置 teardown_status='done'（ownership gate；不存在 → OwnershipError 404）。
   *  幂等：已 done 的行再置 done 无副作用（防重拆）。 */
  markTeardownDone(workId: string): Promise<BenchmarkWorkRow>;
  /** [T-349] 按 id 读一行(叠号门:id + userId + accountId,strict)。查不到/跨号 → 返 null
   *  (不抛,交调用方决定 404 语义;拦截层据此判 ownership)。 */
  getWorkById(workId: string): Promise<BenchmarkWorkRow | null>;
  /** [T-349] 落逐字稿 + 状态(单条按需抓,origin 隔离落本表自身)。where id+userId+accountId,
   *  更新 transcript / transcript_status / updatedAt。不存在 → OwnershipError 404。 */
  saveTranscript(
    workId: string,
    transcript: string | null,
    status: string,
  ): Promise<BenchmarkWorkRow>;
}

export function createBenchmarkRepository(db: Db, deps: RepoDeps): BenchmarkRepository {
  return {
    async seedSources(rows) {
      if (rows.length === 0) return;
      await db.insert(benchmarkSources).values(rows).onConflictDoNothing();
    },

    async listSources({ limit, offset }) {
      // [T-332 S2] strict:无条件叠号门(无「无号 → 全量」退化)。
      const where = and(
        eq(benchmarkSources.userId, deps.userId),
        eq(benchmarkSources.accountId, deps.accountId),
      );
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

    async listEnabledSources() {
      const where = and(
        eq(benchmarkSources.userId, deps.userId),
        eq(benchmarkSources.accountId, deps.accountId),
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
          // [T-332 S2] stamp 当前号(repo 不接受调用方显式传号,§4.6)。
          accountId: deps.accountId,
          platform,
          externalAccountId: input.externalAccountId,
          nickname: input.nickname ?? null,
          homeUrl: input.homeUrl ?? null,
          note: input.note ?? null,
          enabled: input.enabled ?? true,
          createdAt: nowIso,
          updatedAt: nowIso,
        })
        // [T-332 S2] 幂等:命中 ux_benchmark_sources_identity_v2
        // (user, account, platform, sec_uid)(迁移 0042)→ 更新展示字段/enabled(不冒重复源)。
        // conflict target 必须与 _v2 索引列一致(含 account_id),否则 ON CONFLICT 不命中直接报错;
        // 两个号对标同一博主合法,各自成行。
        .onConflictDoUpdate({
          target: [
            benchmarkSources.userId,
            benchmarkSources.accountId,
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
      await requireOwnedSource(db, deps, sourceId);
      const updated = await db
        .update(benchmarkSources)
        .set({ enabled, updatedAt: deps.now() })
        .where(
          and(
            eq(benchmarkSources.userId, deps.userId),
            eq(benchmarkSources.accountId, deps.accountId),
            eq(benchmarkSources.id, sourceId),
          ),
        )
        .returning();
      return updated[0]!;
    },

    async removeSource(sourceId) {
      const row = await requireOwnedSource(db, deps, sourceId);
      await db
        .delete(benchmarkSources)
        .where(
          and(
            eq(benchmarkSources.userId, deps.userId),
            eq(benchmarkSources.accountId, deps.accountId),
            eq(benchmarkSources.id, sourceId),
          ),
        );
      return row;
    },

    async upsertWork(input) {
      const platform = input.platform ?? "douyin";
      const nowIso = deps.now();
      // 先查是否已存在（决定 inserted 标志 + 保留 createdAt）。[T-332 S2] 叠号门:
      // _v2 键下同 aweme 可在别的号名下另有一行,存在性判定必须限定本号。
      const existing = await db
        .select()
        .from(benchmarkWorks)
        .where(
          and(
            eq(benchmarkWorks.userId, deps.userId),
            eq(benchmarkWorks.accountId, deps.accountId),
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
          // [T-332 S2] stamp 当前号(repo 不接受调用方显式传号,§4.6)。
          accountId: deps.accountId,
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
          // [T-235b] 发现方式维度(黑马雷达=darkhorse;缺省对标采集)。
          discovery: input.discovery ?? "benchmark",
          authorFollowerCount: input.authorFollowerCount ?? null,
          discoveryKeyword: input.discoveryKeyword ?? null,
          capturedAt: input.capturedAt,
          createdAt: nowIso,
          updatedAt: nowIso,
        })
        // [T-332 S2] 幂等 upsert:命中 ux_benchmark_works_aweme_v2
        // (user, account, platform, aweme_id)(迁移 0042)→ 同号同作品跨采集 run 更新最新
        // 统计/爆款判定(不改 teardown_status —— T-212c 拆解态由它管)。conflict target 必须
        // 与 _v2 索引列一致(含 account_id);两个号各自采同一 aweme 合法,各自成行。
        .onConflictDoUpdate({
          target: [
            benchmarkWorks.userId,
            benchmarkWorks.accountId,
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
            discovery: input.discovery ?? "benchmark",
            authorFollowerCount: input.authorFollowerCount ?? null,
            discoveryKeyword: input.discoveryKeyword ?? null,
            capturedAt: input.capturedAt,
            updatedAt: nowIso,
          },
        })
        .returning();
      return { row: rows[0]!, inserted: !wasExisting };
    },

    async listWorks({ limit, offset }) {
      // [T-349b] strict:无条件叠号门(无「无号 → 全量」退化,同 listSources)。
      const where = and(
        eq(benchmarkWorks.userId, deps.userId),
        eq(benchmarkWorks.accountId, deps.accountId),
      );
      const rows = await db
        .select()
        .from(benchmarkWorks)
        .where(where)
        .orderBy(desc(benchmarkWorks.capturedAt))
        .limit(limit)
        .offset(offset);
      const all = await db
        .select({ id: benchmarkWorks.id })
        .from(benchmarkWorks)
        .where(where);
      return { rows, total: all.length };
    },

    async listPendingViral(limit) {
      // [T-332 S2] strict:无条件叠号门。
      const where = and(
        eq(benchmarkWorks.userId, deps.userId),
        eq(benchmarkWorks.accountId, deps.accountId),
        eq(benchmarkWorks.isViral, true),
        eq(benchmarkWorks.teardownStatus, "pending"),
      );
      return db
        .select()
        .from(benchmarkWorks)
        .where(where)
        // 越突出（爆款倍数高）越先拆；同倍数按赞降序。
        .orderBy(desc(benchmarkWorks.viralMultiple), desc(benchmarkWorks.diggCount))
        .limit(limit);
    },

    async markTeardownDone(workId) {
      await requireOwnedWork(db, deps, workId);
      const updated = await db
        .update(benchmarkWorks)
        .set({ teardownStatus: "done", updatedAt: deps.now() })
        .where(
          and(
            eq(benchmarkWorks.userId, deps.userId),
            eq(benchmarkWorks.accountId, deps.accountId),
            eq(benchmarkWorks.id, workId),
          ),
        )
        .returning();
      return updated[0]!;
    },

    async getWorkById(workId) {
      // [T-349] 叠号门(id + userId + accountId,strict);跨号/未知 → null(不泄露行存在)。
      const rows = await db
        .select()
        .from(benchmarkWorks)
        .where(
          and(
            eq(benchmarkWorks.userId, deps.userId),
            eq(benchmarkWorks.accountId, deps.accountId),
            eq(benchmarkWorks.id, workId),
          ),
        );
      return rows[0] ?? null;
    },

    async saveTranscript(workId, transcript, status) {
      // [T-349] ownership gate(缺失/跨号 → OwnershipError 404),再 where id+userId+accountId 更新。
      await requireOwnedWork(db, deps, workId);
      const updated = await db
        .update(benchmarkWorks)
        .set({ transcript, transcriptStatus: status, updatedAt: deps.now() })
        .where(
          and(
            eq(benchmarkWorks.userId, deps.userId),
            eq(benchmarkWorks.accountId, deps.accountId),
            eq(benchmarkWorks.id, workId),
          ),
        )
        .returning();
      return updated[0]!;
    },
  };
}

// Ownership gate（对标作品）:跨用户 / 跨号 / 未知 id select 空 → OwnershipError(404,
// 不泄露行存在;[T-332 S2] by-id 读叠号一致性门,SPEC §4.5)。
async function requireOwnedWork(
  db: Db,
  deps: Pick<RepoDeps, "userId" | "accountId">,
  workId: string,
): Promise<BenchmarkWorkRow> {
  const rows = await db
    .select()
    .from(benchmarkWorks)
    .where(
      and(
        eq(benchmarkWorks.userId, deps.userId),
        eq(benchmarkWorks.accountId, deps.accountId),
        eq(benchmarkWorks.id, workId),
      ),
    );
  const row = rows[0];
  if (!row) {
    throw new OwnershipError(`OwnershipError: benchmark work not found: ${workId}`);
  }
  return row;
}

// Ownership gate:跨用户 / 跨号 / 未知 id select 空 → OwnershipError(404,不泄露行存在)。
async function requireOwnedSource(
  db: Db,
  deps: Pick<RepoDeps, "userId" | "accountId">,
  sourceId: string,
): Promise<BenchmarkSourceRow> {
  const rows = await db
    .select()
    .from(benchmarkSources)
    .where(
      and(
        eq(benchmarkSources.userId, deps.userId),
        eq(benchmarkSources.accountId, deps.accountId),
        eq(benchmarkSources.id, sourceId),
      ),
    );
  const row = rows[0];
  if (!row) {
    throw new OwnershipError(`OwnershipError: benchmark source not found: ${sourceId}`);
  }
  return row;
}
