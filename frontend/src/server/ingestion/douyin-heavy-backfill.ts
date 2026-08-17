import "server-only";
import type { RequestContext } from "@creatoros/contract";
import {
  backfillDouyinCovers as realBackfillDouyinCovers,
  type CoverBackfillPorts,
} from "@/server/ingestion/douyin-cover-backfill";
import {
  enqueueReconstructForImported as realEnqueueReconstructForImported,
  type ReconstructEnqueuePorts,
  type ImportedWork,
} from "@/server/ingestion/reconstruct-enqueue";

// [T-195] 抖音「初始化重活」编排(封面回填 + 逐字稿/重建排队)。
//
// 背景(真机实测,T-195 根因):这两步重活原挂在 self.metrics 采集器尾部——但可见性
// (hidden_at / platform_status)过去要到 self.detail 落明细才标。结果首轮封面回填照撞全部
// 75 条(含隐藏),隐藏作品分享页 item_list 为空逐个失败(~40s/个),14/75 磨 9 分钟,
// 还把排在后面的 self.detail / comments / 逐字稿全堵在串行闸后(gate-F5 并发 1)。
//
// 修法:把这两步整体从 self.metrics 尾部**挪到 self.detail 尾部**——self.detail 落完明细
// 后再跑。T-595 进一步把可见性归一提前到持久化边界：进入这里的 imported works 与
// publication 已经都是公开作品，因此本模块不再维护第二份 hidden 判据。
//
// 铁律(与两个子 helper 同款):
//   ① 全端口注入——本模块不 import ai / projects / assets / publishing service,host 在
//      persistence-client 接真实现,单测注 fake(零网络零浏览器)。可见性过滤在此编排层接上。
//   ② best-effort:封面回填 / 逐字稿排队各自独立 try/catch,一方整批失败绝不拖垮另一方,
//      更不拖垮 self.detail 的指标落库主流程(self.detail 侧亦不因本函数抛错 fail run)。
//   ③ 幂等:两个子 helper 自带多闸(候选集只含缺封面作品 / 已重建项目跳过 / createTask 去重),
//      每轮 self.detail 都可安全重跑。

/** self.detail 用来判可见性的最小 publication 行(缺封面候选 + 明细已标的两列)。 */
export interface HeavyBackfillPubRow {
  /** publication id(= CoverBackfillPorts 的 publicationId)。 */
  id: string;
  /** 抖音 aweme_id(为空的候选不参与回填,诚实跳)。 */
  externalId: string | null;
  /** 作品所属 content_output(封面绑项目用;为空则封面只进全局池)。 */
  contentOutputId: string | null;
}

/**
 * host 端口(persistence-client canonical collector 接真实现;单测注 fake)。
 * 候选装配 / outputId→project 映射由本模块内部完成,host 只提供**原始**读写能力。
 */
export interface DouyinHeavyBackfillHost {
  // ── 封面回填 ────────────────────────────────────────────────────────────
  /** 缺封面的已发布抖音 publication 原始行(host 绑 publishingService.listPublicationsMissingCover)。 */
  listPublicationsMissingCover(
    ctx: RequestContext,
    limit: number,
  ): Promise<HeavyBackfillPubRow[]>;
  /** 封面组合解析(host 绑 fetchDouyinCoverUrl + 当前账号登录态 + 真限流网关)。 */
  fetchVideoUrl(awemeId: string): Promise<{ coverUrl?: string }>;
  /** 封面图下载(host 绑 downloadDouyinImage + 真 fetch)。 */
  downloadImage(url: string): Promise<{ bytes: Uint8Array; mimeType: string }>;
  /** 字节直落 image asset(host 绑 assetsService.createGeneratedAsset)。 */
  createImageAsset(
    ctx: RequestContext,
    input: { name: string; bytes: Uint8Array; mimeType: string },
  ): Promise<{ id: string }>;
  /** 封面落账(host 绑 publishingService.setCover;幂等在 service 层)。 */
  setCover(
    ctx: RequestContext,
    publicationId: string,
    coverAssetId: string,
  ): Promise<void>;
  /**
   * [T-151 缺口 B] 把封面 asset 绑到作品所属项目(host 内部:contentOutputId → getOutput().projectId
   * → materialLinksService.create,entityType='asset',role='cover')。best-effort:host 内吞错记日志。
   * contentOutputId 由本模块从缺封面候选行透传(为空则本模块不调此端口)。
   */
  bindCoverToProjectByOutput(
    ctx: RequestContext,
    input: { contentOutputId: string; coverAssetId: string },
  ): Promise<void>;

  // ── 逐字稿 + 重建排队 ─────────────────────────────────────────────────────
  /** 本 user 全部 imported 作品的两维锚(host 绑 projectsService.listImportedWorks)。 */
  listImportedWorks(ctx: RequestContext): Promise<ImportedWork[]>;
  /** 排一个 transcribe.douyin 批任务(host 绑 ai transport 的 ai.tasks.create,inputData={awemeIds})。 */
  enqueueTranscribe(ctx: RequestContext, awemeIds: string[]): Promise<void>;
  /** 项目是否已有真实逐字稿；图集占位稿返回 false。 */
  hasReconstructableTranscript(
    ctx: RequestContext,
    projectId: string,
  ): Promise<boolean>;
  /** 该项目是否已有 origin='reconstructed' 的 artifact(host 绑 listProjectArtifacts 过滤 origin)。 */
  hasReconstructedArtifact(
    ctx: RequestContext,
    projectId: string,
  ): Promise<boolean>;
  /** 排一个 reconstruct.project 任务(host 绑 ai transport 的 ai.tasks.create,inputData={projectId})。 */
  enqueueReconstruct(ctx: RequestContext, projectId: string): Promise<void>;
}

export interface DouyinHeavyBackfillOptions {
  /** 每轮封面回填上限(host 从 env CREATOROS_COVER_BACKFILL_LIMIT 解析)。 */
  coverLimit: number;
  /** 封面回填逐条进度回调(host 绑 job_run 进度上报;best-effort,子 helper 内吞错)。 */
  onCoverProgress?: (done: number, total: number) => void;
  /** 每轮统一采集最多补多少条逐字稿；默认 5。 */
  transcribeBatchLimit?: number;
}

/** 便于单测 spy 两个子 helper 是否被调(默认注真实现)。 */
export interface DouyinHeavyBackfillImpl {
  backfillDouyinCovers: typeof realBackfillDouyinCovers;
  enqueueReconstructForImported: typeof realEnqueueReconstructForImported;
}

export interface DouyinHeavyBackfillResult {
  /** 本轮真回填的封面数(诚实,子 helper 返回)。 */
  coversFilled: number;
}

/**
 * canonical collector 完成源边界归一后跑的初始化重活：①封面回填 ②逐字稿 +
 * 重建排队。两步各自 best-effort,互不拖垮,更不拖垮 run。
 *
 * 可见性接线(T-195 核心):
 *   - 封面候选：只校验 externalId；可见性已经由 canonical collector 保证；
 *   - 逐字稿/重建：直接消费归一化后的 imported works，不再反查 hidden。
 */
export async function runDouyinHeavyBackfill(
  ctx: RequestContext,
  host: DouyinHeavyBackfillHost,
  opts: DouyinHeavyBackfillOptions,
  impl: DouyinHeavyBackfillImpl = {
    backfillDouyinCovers: realBackfillDouyinCovers,
    enqueueReconstructForImported: realEnqueueReconstructForImported,
  },
): Promise<DouyinHeavyBackfillResult> {
  let coversFilled = 0;

  // ── ① 封面回填(只对可见作品) ──────────────────────────────────────────────
  // publicationId → contentOutputId 映射(listMissingCover 里填,bindCoverToProject 里消费)。
  const outputIdByPublication = new Map<string, string>();
  const coverPorts: CoverBackfillPorts = {
    listMissingCover: async (limit) =>
      (await host.listPublicationsMissingCover(ctx, limit))
        .filter((p) => typeof p.externalId === "string" && p.externalId)
        .map((p) => {
          if (typeof p.contentOutputId === "string" && p.contentOutputId) {
            outputIdByPublication.set(p.id, p.contentOutputId);
          }
          return { publicationId: p.id, externalId: p.externalId as string };
        }),
    fetchVideoUrl: (awemeId) => host.fetchVideoUrl(awemeId),
    downloadImage: (url) => host.downloadImage(url),
    createImageAsset: (input) => host.createImageAsset(ctx, input),
    setCover: (publicationId, coverAssetId) =>
      host.setCover(ctx, publicationId, coverAssetId),
    bindCoverToProject: async (publicationId, coverAssetId) => {
      const contentOutputId = outputIdByPublication.get(publicationId);
      if (!contentOutputId) return; // 无 output 锚 → 无法解析项目,诚实跳过(不硬造)
      await host.bindCoverToProjectByOutput(ctx, {
        contentOutputId,
        coverAssetId,
      });
    },
  };
  try {
    const backfill = await impl.backfillDouyinCovers(coverPorts, {
      limit: opts.coverLimit,
      onProgress: opts.onCoverProgress,
    });
    coversFilled = backfill.filled;
    if (backfill.attempted > 0) {
      console.log(
        `[douyin-cover-backfill] 候选 ${backfill.attempted},回填 ${backfill.filled},跳过 ${backfill.skipped},失败 ${backfill.failed},延后 ${backfill.deferred}`,
      );
    }
  } catch (err) {
    // 封面是锦上添花:回填整批失败绝不拖垮明细采集(run 仍 succeeded)。
    console.error("[douyin-cover-backfill] 封面回填整批失败(明细不受影响):", err);
  }

  // ── ② 逐字稿 + 重建排队 ───────────────────────────────────────────────────
  const reconstructPorts: ReconstructEnqueuePorts = {
    listImportedWorks: (c) => host.listImportedWorks(c),
    enqueueTranscribe: (c, awemeIds) => host.enqueueTranscribe(c, awemeIds),
    hasReconstructableTranscript: (c, projectId) =>
      host.hasReconstructableTranscript(c, projectId),
    hasReconstructedArtifact: (c, projectId) =>
      host.hasReconstructedArtifact(c, projectId),
    enqueueReconstruct: (c, projectId) => host.enqueueReconstruct(c, projectId),
  };
  try {
    const enqueued = await impl.enqueueReconstructForImported(
      reconstructPorts,
      ctx,
      { transcribeBatchLimit: opts.transcribeBatchLimit },
    );
    if (enqueued.considered > 0) {
      console.log(
        `[reconstruct-enqueue] imported ${enqueued.considered},逐字稿批 ${enqueued.transcribeEnqueued ? enqueued.transcribeAwemeCount : 0} 条,延后 ${enqueued.transcribeDeferred} 条,重建排队 ${enqueued.reconstructEnqueued},等待逐字稿 ${enqueued.transcriptWaiting},跳过 ${enqueued.reconstructSkipped},失败 ${enqueued.failed}`,
      );
    }
  } catch (err) {
    // 逐字稿/重建触发是锦上添花:排队整批失败绝不拖垮明细采集(run 仍 succeeded)。
    console.error(
      "[reconstruct-enqueue] 逐字稿/重建任务排队整批失败(明细不受影响):",
      err,
    );
  }

  return { coversFilled };
}
