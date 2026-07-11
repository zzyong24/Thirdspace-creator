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
import { ValidationError } from "./benchmark.errors";

// [T-212a] Benchmark service（foundation §5.3）—— 每个公开方法 (ctx, …)，构 repo bound to
// ctx.userId 使 scoping 结构化。account_id 从 ctx.accountId stamp（按号隔离，T-201）。
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

  function repoFor(ctx: RequestContext): BenchmarkRepository {
    const repoDeps: RepoDeps = { now, nextId, userId: ctx.userId };
    return createBenchmarkRepository(db, repoDeps);
  }

  return {
    async listSources(ctx, query) {
      const { rows, total } = await repoFor(ctx).listSources(
        ctx.accountId ?? null,
        {
          limit: query.pageSize,
          offset: (query.page - 1) * query.pageSize,
        },
      );
      return { rows: rows.map(toBenchmarkSourceDto), total };
    },

    async createSource(ctx, input) {
      guardCreate(input);
      const row = await repoFor(ctx).createSource({
        accountId: ctx.accountId ?? null,
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
      const row = await repoFor(ctx).setSourceEnabled(sourceId, enabled);
      return toBenchmarkSourceDto(row);
    },

    async removeSource(ctx, sourceId) {
      const row = await repoFor(ctx).removeSource(sourceId);
      return toBenchmarkSourceDto(row);
    },

    async listEnabledSources(ctx) {
      const rows = await repoFor(ctx).listEnabledSources(ctx.accountId ?? null);
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
      const rows = await repoFor(ctx).listPendingViral(
        ctx.accountId ?? null,
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
      }));
    },

    async markTeardownDone(ctx, workId) {
      await repoFor(ctx).markTeardownDone(workId);
    },

    async recordWork(ctx, input) {
      const { inserted } = await repoFor(ctx).upsertWork({
        accountId: ctx.accountId ?? null,
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
        capturedAt: input.capturedAt,
      });
      return { inserted };
    },
  };
}
