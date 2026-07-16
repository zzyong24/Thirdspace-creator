import type { RequestContext } from "@creatoros/contract";
import type { Db } from "@creatoros/backend";
import {
  createBenchmarkRepository,
  type BenchmarkRepository,
  type RepoDeps,
} from "./benchmark.repository";
import {
  toBenchmarkSourceDto,
  type BenchmarkSourceResource,
} from "./benchmark.schema";
import { ValidationError, requireAccountId } from "./benchmark.errors";

// [T-212a → T-332 S2] Benchmark service（foundation §5.3）—— 每个公开方法 (ctx, …)，构 repo
// bound to ctx.userId + ctx.accountId 使 scoping 结构化。每个入口经 requireAccountId 断言:
// 未选号 = 引导态,读写一律 AccountRequiredError(SPEC §4.2,不存在「null = 全量」退化)。
// 对标源 CRUD（list/create/toggle/remove）+ 采集用只读/写口（listEnabledSources/recordWork）。

export interface ServiceDeps {
  db: Db;
  now: () => string;
  nextId: (prefix: string) => string;
}

export interface CreateSourceInput {
  externalAccountId: string; // sec_uid
  nickname?: string | null;
  homeUrl?: string | null;
  note?: string | null;
  platform?: string;
  enabled?: boolean;
}

// 采集器落库一条对标作品用（含爆款判定结果；service 从 ctx stamp account_id）。
export interface RecordWorkInput {
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

export interface EnabledSource {
  id: string;
  accountId: string | null;
  platform: string;
  externalAccountId: string;
  nickname: string | null;
  homeUrl: string | null;
}

// [T-212c] 待拆的爆款对标作品投影（拆解转化 runner 消费；只暴露拆解 + 参考链接需要的字段）。
export interface PendingViralWork {
  id: string;
  platform: string;
  awemeId: string;
  description: string;
  diggCount: number;
  commentCount: number | null;
  collectCount: number | null;
  shareCount: number | null;
  duration: number | null;
  viralMultiple: number | null;
  sourceExternalAccountId: string;
  // [T-235b] 发现方式(darkhorse=黑马雷达,拆解 prompt 注明时效敏感)+ 黑马信号字段。
  // optional additive:既有消费方/测试 fake 不带这三个字段也结构兼容(缺省视同 benchmark)。
  discovery?: string;
  authorFollowerCount?: number | null;
  discoveryKeyword?: string | null;
}

export interface BenchmarkService {
  listSources(
    ctx: RequestContext,
    query: { page: number; pageSize: number },
  ): Promise<{ rows: BenchmarkSourceResource[]; total: number }>;
  createSource(
    ctx: RequestContext,
    input: CreateSourceInput,
  ): Promise<BenchmarkSourceResource>;
  toggleSource(
    ctx: RequestContext,
    sourceId: string,
    enabled: boolean,
  ): Promise<BenchmarkSourceResource>;
  removeSource(
    ctx: RequestContext,
    sourceId: string,
  ): Promise<BenchmarkSourceResource>;
  /** 采集用：列该 ctx（含号）enabled 的对标源（投影，采集器只需身份/主页）。 */
  listEnabledSources(ctx: RequestContext): Promise<EnabledSource[]>;
  /** 采集用：幂等落库一条对标作品；返回是否新写入（诊断计数用）。 */
  recordWork(ctx: RequestContext, input: RecordWorkInput): Promise<{ inserted: boolean }>;
  /** [T-212c] 拆解用：列该 ctx（含号）**待拆的爆款作品**（is_viral=true 且 teardown_status=pending），
   *  按爆款倍数降序，上限 limit（默认 5）。 */
  listPendingViralWorks(ctx: RequestContext, limit?: number): Promise<PendingViralWork[]>;
  /** [T-212c] 拆解用：置一条对标作品拆解完成（teardown_status=done，幂等防重拆）。 */
  markTeardownDone(ctx: RequestContext, workId: string): Promise<void>;
  /** [T-349] 单条按需逐字稿:按 id 读一行投影(叠号门;查不到/跨号 → null)。 */
  getWork(
    ctx: RequestContext,
    workId: string,
  ): Promise<{
    id: string;
    awemeId: string;
    platform: string;
    transcript: string | null;
    transcriptStatus: string | null;
  } | null>;
  /** [T-349] 单条按需逐字稿:落 transcript + status(origin 隔离落 benchmark_works 自身)。 */
  saveWorkTranscript(
    ctx: RequestContext,
    workId: string,
    transcript: string | null,
    status: string,
  ): Promise<void>;
}

function guardCreate(input: CreateSourceInput): void {
  if (!input.externalAccountId || input.externalAccountId.trim().length === 0) {
    throw new ValidationError(
      "ValidationError: externalAccountId (sec_uid) must be non-empty",
    );
  }
}

export function createBenchmarkService(deps: ServiceDeps): BenchmarkService {
  const { db, now, nextId } = deps;

  function repoFor(ctx: RequestContext, op: string): BenchmarkRepository {
    const repoDeps: RepoDeps = {
      now,
      nextId,
      userId: ctx.userId,
      // [T-332 S2] 未选号 → AccountRequiredError(读写同门,§4.2)。
      accountId: requireAccountId(ctx.accountId, op),
    };
    return createBenchmarkRepository(db, repoDeps);
  }

  return {
    async listSources(ctx, query) {
      const { rows, total } = await repoFor(ctx, "benchmark.listSources").listSources({
        limit: query.pageSize,
        offset: (query.page - 1) * query.pageSize,
      });
      return { rows: rows.map(toBenchmarkSourceDto), total };
    },

    async createSource(ctx, input) {
      guardCreate(input);
      // [T-332 S2] 号由 repo deps stamp(§4.6 防绕过),不再经 input 传递。
      const row = await repoFor(ctx, "benchmark.createSource").createSource({
        platform: input.platform,
        externalAccountId: input.externalAccountId.trim(),
        nickname: input.nickname ?? null,
        homeUrl: input.homeUrl ?? null,
        note: input.note ?? null,
        enabled: input.enabled,
      });
      return toBenchmarkSourceDto(row);
    },

    async toggleSource(ctx, sourceId, enabled) {
      const row = await repoFor(ctx, "benchmark.toggleSource").setSourceEnabled(
        sourceId,
        enabled,
      );
      return toBenchmarkSourceDto(row);
    },

    async removeSource(ctx, sourceId) {
      const row = await repoFor(ctx, "benchmark.removeSource").removeSource(sourceId);
      return toBenchmarkSourceDto(row);
    },

    async listEnabledSources(ctx) {
      const rows = await repoFor(ctx, "benchmark.listEnabledSources").listEnabledSources();
      return rows.map((r) => ({
        id: r.id,
        accountId: r.accountId ?? null,
        platform: r.platform,
        externalAccountId: r.externalAccountId,
        nickname: r.nickname ?? null,
        homeUrl: r.homeUrl ?? null,
      }));
    },

    async listPendingViralWorks(ctx, limit = 5) {
      const rows = await repoFor(ctx, "benchmark.listPendingViralWorks").listPendingViral(
        limit,
      );
      return rows.map((r) => ({
        id: r.id,
        platform: r.platform,
        awemeId: r.awemeId,
        description: r.description,
        diggCount: r.diggCount,
        commentCount: r.commentCount ?? null,
        collectCount: r.collectCount ?? null,
        shareCount: r.shareCount ?? null,
        duration: r.duration ?? null,
        viralMultiple: r.viralMultiple ?? null,
        sourceExternalAccountId: r.sourceExternalAccountId,
        discovery: r.discovery,
        authorFollowerCount: r.authorFollowerCount ?? null,
        discoveryKeyword: r.discoveryKeyword ?? null,
      }));
    },

    async markTeardownDone(ctx, workId) {
      await repoFor(ctx, "benchmark.markTeardownDone").markTeardownDone(workId);
    },

    async getWork(ctx, workId) {
      const row = await repoFor(ctx, "benchmark.getWork").getWorkById(workId);
      if (!row) return null;
      return {
        id: row.id,
        awemeId: row.awemeId,
        platform: row.platform,
        transcript: row.transcript ?? null,
        transcriptStatus: row.transcriptStatus ?? null,
      };
    },

    async saveWorkTranscript(ctx, workId, transcript, status) {
      await repoFor(ctx, "benchmark.saveWorkTranscript").saveTranscript(
        workId,
        transcript,
        status,
      );
    },

    async recordWork(ctx, input) {
      // [T-332 S2] 号由 repo deps stamp(采集 runtime ctx 账号由 job 行派生,ISO-06)。
      const { inserted } = await repoFor(ctx, "benchmark.recordWork").upsertWork({
        sourceId: input.sourceId,
        sourceExternalAccountId: input.sourceExternalAccountId,
        platform: input.platform,
        awemeId: input.awemeId,
        description: input.description,
        diggCount: input.diggCount,
        commentCount: input.commentCount ?? null,
        collectCount: input.collectCount ?? null,
        shareCount: input.shareCount ?? null,
        duration: input.duration ?? null,
        createTime: input.createTime ?? null,
        isViral: input.isViral,
        viralMultiple: input.viralMultiple ?? null,
        discovery: input.discovery,
        authorFollowerCount: input.authorFollowerCount ?? null,
        discoveryKeyword: input.discoveryKeyword ?? null,
        capturedAt: input.capturedAt,
      });
      return { inserted };
    },
  };
}
