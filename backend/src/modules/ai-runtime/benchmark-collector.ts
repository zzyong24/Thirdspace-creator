import type { RequestContext } from "@creatoros/contract";
import { detectViral, type DetectViralOptions } from "../benchmark/benchmark.viral";
import type { CollectResult, ReportProgress } from "./scheduled-collection-runner";

// [T-212a] 对标采集器（benchmark sourceKind 的确定性采集体）—— 装进 scheduled-collection-runner
// 的 collectors["benchmark"]。逐个 enabled 对标源 → 抓其公开作品列表（aweme/post，注入端口）→
// detectViral 筛爆款 → 每源按赞降序取 ≤10 条落库（拆解状态=待拆）。
//
// 铁律（同 scheduled-collection-runner）：
//   ① 不 import 浏览器层 —— fetchSourcePosts 注入（host 在 persistence-client 绑真 aweme/post 抓取，
//      测试注 fake），故本采集器纯逻辑可单测。
//   ② detectViral 是确定性统计，不调 LLM（数值程序化判定）。
//   ③ 单源失败（验证码/网络/该号作品不可读）→ 记日志 + 跳过该源，不崩整批（其余源照采）。
//   ④ 降频：每源之间 sleep（默认 ≥1500ms）防高频撞风控。**只抓公开作品的公开统计**（合规红线，
//      由 fetchSourcePosts 实现层保证）。

/** 采集器抓到的一条对标作品（fetchSourcePosts 从 aweme/post XHR 程序化抽取）。 */
export interface BenchmarkFetchedWork {
  awemeId: string;
  description?: string;
  diggCount: number;
  commentCount?: number | null;
  collectCount?: number | null;
  shareCount?: number | null;
  duration?: number | null;
  createTime?: string | null;
}

/** 一个对标源的采集投影（采集器只需身份/主页去抓）。 */
export interface BenchmarkSourceProjection {
  id: string;
  platform: string;
  externalAccountId: string; // sec_uid
  nickname: string | null;
  homeUrl: string | null;
}

export interface BenchmarkCollectorDeps {
  /** 列该 ctx（含号）enabled 的对标源。host 绑 benchmarkService.listEnabledSources。 */
  listEnabledSources: (ctx: RequestContext) => Promise<BenchmarkSourceProjection[]>;
  /** 抓一个源的公开作品列表（aweme/post，翻页 ~maxPages）。host 绑真 fetchDouyinUserPosts；测试注 fake。
   *  抛错 = 该源采集失败（验证码/网络/不可读）→ 采集器 catch 跳过该源。 */
  fetchSourcePosts: (
    ctx: RequestContext,
    source: BenchmarkSourceProjection,
  ) => Promise<BenchmarkFetchedWork[]>;
  /** 幂等落库一条对标作品。host 绑 benchmarkService.recordWork。返回是否新写入（诊断计数）。 */
  recordWork: (
    ctx: RequestContext,
    input: {
      sourceId: string;
      sourceExternalAccountId: string;
      platform: string;
      awemeId: string;
      description: string;
      diggCount: number;
      commentCount: number | null;
      collectCount: number | null;
      shareCount: number | null;
      duration: number | null;
      createTime: string | null;
      isViral: boolean;
      viralMultiple: number | null;
      capturedAt: string;
    },
  ) => Promise<{ inserted: boolean }>;
  now: () => string;
  /** 降频 sleep（默认 setTimeout）。测试注 no-op 关等待。 */
  sleep?: (ms: number) => Promise<void>;
  /** 每源之间降频间隔（默认 1500ms）。 */
  perSourceSleepMs?: number;
  /** 每源每次最多收几条爆款（默认 10，防灌库）。 */
  maxViralPerSource?: number;
  /** detectViral 阈值覆盖（默认 DEFAULT_VIRAL_OPTIONS）。 */
  viralOptions?: DetectViralOptions;
  /** 进度上报（可选；runner 注入 → 写 job_run.progress）。 */
  report?: ReportProgress;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms));

/**
 * 采集所有 enabled 对标源的爆款作品 → 落库。返回新鲜度统计 { itemsNew, itemsUpdated }（供 runner
 * 回填 job_run）。无 enabled 源 → 直接返回 0（诚实空跑，非失败）。
 */
export async function collectBenchmark(
  ctx: RequestContext,
  deps: BenchmarkCollectorDeps,
): Promise<CollectResult> {
  const sleep = deps.sleep ?? defaultSleep;
  const perSourceSleepMs = deps.perSourceSleepMs ?? 1500;
  const maxViralPerSource = deps.maxViralPerSource ?? 10;
  const report = deps.report;

  report?.({ stage: "benchmark", processed: 0, total: null, message: "读取对标源" });
  const sources = await deps.listEnabledSources(ctx);
  if (sources.length === 0) {
    console.log("[benchmark] 无 enabled 对标源,跳过本次采集(0 源)");
    return { itemsNew: 0, itemsUpdated: 0 };
  }

  let itemsNew = 0;
  let itemsUpdated = 0;
  const capturedAt = deps.now();

  for (let i = 0; i < sources.length; i++) {
    const source = sources[i]!;
    const label = source.nickname || source.externalAccountId;
    try {
      report?.({
        stage: "benchmark",
        processed: i,
        total: sources.length,
        message: `抓取对标源 ${label}`,
      });
      const works = await deps.fetchSourcePosts(ctx, source);
      // detectViral：全批判定 → 筛爆款 → 按赞降序取 ≤N（防灌库 + 省下游 token）。
      const verdicts = detectViral(
        works.map((w) => ({ awemeId: w.awemeId, diggCount: w.diggCount })),
        deps.viralOptions,
      );
      const verdictById = new Map(verdicts.map((v) => [v.awemeId, v]));
      const viral = works
        .filter((w) => verdictById.get(w.awemeId)?.isViral)
        .sort((a, b) => b.diggCount - a.diggCount)
        .slice(0, maxViralPerSource);

      for (const w of viral) {
        const v = verdictById.get(w.awemeId)!;
        const { inserted } = await deps.recordWork(ctx, {
          sourceId: source.id,
          sourceExternalAccountId: source.externalAccountId,
          platform: source.platform,
          awemeId: w.awemeId,
          description: w.description ?? "",
          diggCount: w.diggCount,
          commentCount: w.commentCount ?? null,
          collectCount: w.collectCount ?? null,
          shareCount: w.shareCount ?? null,
          duration: w.duration ?? null,
          createTime: w.createTime ?? null,
          isViral: true,
          viralMultiple: v.viralMultiple,
          capturedAt,
        });
        if (inserted) itemsNew += 1;
        else itemsUpdated += 1;
      }

      // 诊断日志（真机观测：源 X 抓 N 条,爆款 M 条）。
      console.log(
        `[benchmark] 源 ${label}(${source.externalAccountId}) 抓 ${works.length} 条,爆款 ${viral.length} 条`,
      );
    } catch (err) {
      // 单源失败（验证码/网络/该号作品不可读）→ 跳过该源,不崩整批（诚实记错）。
      console.error(
        `[benchmark] 源 ${label}(${source.externalAccountId}) 采集失败,跳过该源:`,
        err,
      );
    }

    // 降频：源之间 sleep（最后一个源后不必等）。
    if (i < sources.length - 1 && perSourceSleepMs > 0) {
      await sleep(perSourceSleepMs);
    }
  }

  report?.({
    stage: "benchmark",
    processed: sources.length,
    total: sources.length,
    message: `对标采集完成:新增 ${itemsNew} 条爆款`,
  });
  return { itemsNew, itemsUpdated };
}
