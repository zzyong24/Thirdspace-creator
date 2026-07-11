import type { RequestContext } from "@creatoros/contract";
import {
  detectDarkhorse,
  type DetectDarkhorseOptions,
} from "../benchmark/benchmark.darkhorse";
import type { CollectResult, ReportProgress } from "./scheduled-collection-runner";

// [T-235b] 低粉黑马雷达采集器(平台内证据,SPEC 2026-07-11 §2.2;方法论=darkhorse.py)——
// 并进 benchmark sourceKind 的采集 job(host 在 persistence-client 的 collectors["benchmark"]
// 里**先对标源后黑马关键词**串行调用,共享 douyinGateway 限流预算与 gate-F5 串行闸)。
//
// 流程:关键词(定位 keywords + env 可配)→ 逐词搜抖音「近 1 天最多赞」(注入端口,页内
//   fetch 借登录态,fetchDouyinSearchVideos)→ detectDarkhorse 三档纯函数判黑马(48h 窗口 +
//   赞粉比优先 + 每词 top5)→ 跨词去重 → 落 benchmark_works(discovery=darkhorse,
//   viral_multiple=**赞粉比**,is_viral=true → 复用 T-212c teardown 拆解链自动转化跟拍候选)。
//
// 铁律(同 benchmark-collector):
//   ① 不 import 浏览器层 —— searchVideos 注入(host 绑真 fetchDouyinSearchVideos;测试注 fake),
//      本采集器纯逻辑可单测。
//   ② detectDarkhorse 是确定性统计,不调 LLM。
//   ③ 单关键词失败(验证码/网络)→ 记日志 + 跳过该词,不崩整批。
//   ④ 降频:词间 sleep(默认 ≥2000ms,darkhorse.py 同款);只读公开搜索结果的公开统计。
//   ⑤ 诚实降级:无关键词(未配定位也没配 env)→ 0 跑 + message 注明,非失败。

/** 搜索端口抓到的一条候选视频(fetchDouyinSearchVideos 从 search/item API 程序化抽取)。 */
export interface DarkhorseFetchedVideo {
  awemeId: string;
  description: string;
  diggCount: number;
  commentCount: number | null;
  collectCount: number | null;
  shareCount: number | null;
  /** 时长(ms;抖音原值 duration 已是 ms)。 */
  duration: number | null;
  /** 发布时间(unix 秒,抖音原值)。缺失 0。 */
  createTime: number;
  /** 作者 sec_uid(落 source_external_account_id;缺失空串)。 */
  authorSecUid: string;
  authorNickname: string;
  /** 作者粉丝数(赞粉比分母;缺失 0)。 */
  authorFollowerCount: number;
}

export interface DarkhorseCollectorDeps {
  /** 黑马搜索关键词(host 绑「定位 keywords + env CREATOROS_DARKHORSE_KEYWORDS」合并去重)。 */
  listKeywords: (ctx: RequestContext) => Promise<string[]>;
  /** 按关键词搜抖音近 1 天最多赞(host 绑 fetchDouyinSearchVideos:页内 fetch 借登录态 +
   *  douyinGateway 限流 + 验证码检测返空;测试注 fake)。抛错 = 该词搜索失败 → 跳过该词。 */
  searchVideos: (
    ctx: RequestContext,
    keyword: string,
  ) => Promise<DarkhorseFetchedVideo[]>;
  /** 幂等落库一条黑马作品(host 绑 benchmarkService.recordWork,discovery=darkhorse)。 */
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
      discovery: "darkhorse";
      authorFollowerCount: number | null;
      discoveryKeyword: string;
      capturedAt: string;
    },
  ) => Promise<{ inserted: boolean }>;
  now: () => string;
  /** 当前 unix 秒(48h 窗口锚;默认 Date.now/1000,测试注定值)。 */
  nowSec?: () => number;
  /** 降频 sleep(默认 setTimeout)。测试注 no-op。 */
  sleep?: (ms: number) => Promise<void>;
  /** 词间降频间隔(默认 2000ms,darkhorse.py 同款)。 */
  perKeywordSleepMs?: number;
  /** 黑马三档阈值覆盖(默认 DEFAULT_DARKHORSE_OPTIONS;host 可经 env 配置化)。 */
  darkhorseOptions?: DetectDarkhorseOptions;
  /** 进度上报(可选;runner 注入 → 写 job_run.progress)。 */
  report?: ReportProgress;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms));

/** 黑马作品的合成 source_id(无对标源实体 —— 发现方式是关键词搜索,非登记博主)。 */
export const DARKHORSE_SOURCE_ID = "darkhorse";

/**
 * 黑马雷达采集:逐关键词搜近 1 天最多赞 → 三档判黑马 → 落 benchmark_works(discovery=darkhorse,
 * 爆款倍数字段存赞粉比)。返回 { itemsNew, itemsUpdated, message }(诚实计数)。
 * 无关键词 → 0 跑 + message(非失败);单词失败跳过不崩整批。
 */
export async function collectDarkhorse(
  ctx: RequestContext,
  deps: DarkhorseCollectorDeps,
): Promise<CollectResult> {
  const sleep = deps.sleep ?? defaultSleep;
  const perKeywordSleepMs = deps.perKeywordSleepMs ?? 2000;
  const nowSec = deps.nowSec ?? (() => Math.floor(Date.now() / 1000));
  const report = deps.report;

  let keywords: string[] = [];
  try {
    keywords = (await deps.listKeywords(ctx))
      .map((k) => k.trim())
      .filter((k) => k.length > 0);
  } catch (err) {
    console.error("[darkhorse] 读关键词失败(诚实 0 跑,不崩对标采集):", err);
    keywords = [];
  }
  // 同词去重(定位 keywords 与 env 配置可能重叠)。
  keywords = [...new Set(keywords)];
  if (keywords.length === 0) {
    const message = "无黑马关键词(未配定位关键词/环境变量),跳过黑马雷达";
    console.log(`[darkhorse] ${message}`);
    return { itemsNew: 0, itemsUpdated: 0, message };
  }

  let itemsNew = 0;
  let itemsUpdated = 0;
  let hits = 0;
  const capturedAt = deps.now();
  const seenIds = new Set<string>(); // 跨关键词去重(同视频多词命中只落一次)

  for (let i = 0; i < keywords.length; i++) {
    const kw = keywords[i]!;
    try {
      report?.({
        stage: "darkhorse",
        processed: i,
        total: keywords.length,
        message: `黑马雷达搜索「${kw}」`,
      });
      const videos = await deps.searchVideos(ctx, kw);
      // 三档判黑马(确定性统计,48h 窗口 + 赞粉比优先 + 每词 top5)。
      const verdicts = detectDarkhorse(
        videos.map((v) => ({
          awemeId: v.awemeId,
          diggCount: v.diggCount,
          authorFollowerCount: v.authorFollowerCount,
          createTime: v.createTime,
        })),
        nowSec(),
        deps.darkhorseOptions,
      );
      const videoById = new Map(videos.map((v) => [v.awemeId, v]));
      for (const verdict of verdicts) {
        if (seenIds.has(verdict.awemeId)) continue; // 多词命中同视频只落一次
        seenIds.add(verdict.awemeId);
        const v = videoById.get(verdict.awemeId)!;
        const { inserted } = await deps.recordWork(ctx, {
          sourceId: DARKHORSE_SOURCE_ID,
          sourceExternalAccountId: v.authorSecUid || v.authorNickname || kw,
          platform: "douyin",
          awemeId: v.awemeId,
          description: v.description,
          diggCount: v.diggCount,
          commentCount: v.commentCount,
          collectCount: v.collectCount,
          shareCount: v.shareCount,
          duration: v.duration,
          createTime: v.createTime ? String(v.createTime) : null,
          isViral: true, // 黑马 = 已验证内容 → 进 T-212c 待拆队列,拆解转化跟拍候选
          viralMultiple: verdict.likeFollowerRatio, // 黑马语义:爆款倍数字段存**赞粉比**
          discovery: "darkhorse",
          authorFollowerCount: v.authorFollowerCount || null,
          discoveryKeyword: kw,
          capturedAt,
        });
        hits += 1;
        if (inserted) itemsNew += 1;
        else itemsUpdated += 1;
      }
      console.log(
        `[darkhorse] 关键词「${kw}」搜 ${videos.length} 条,黑马 ${verdicts.length} 条`,
      );
    } catch (err) {
      // 单词失败(验证码/网络)→ 跳过该词,不崩整批(诚实记错)。
      console.error(`[darkhorse] 关键词「${kw}」搜索失败,跳过该词:`, err);
    }
    if (i < keywords.length - 1 && perKeywordSleepMs > 0) {
      await sleep(perKeywordSleepMs);
    }
  }

  const message =
    hits > 0
      ? `黑马雷达:${keywords.length} 词命中 ${hits} 条黑马(新增 ${itemsNew}),赞粉比已入爆款倍数`
      : `黑马雷达:${keywords.length} 词本轮无黑马`;
  console.log(`[darkhorse] ${message}`);
  report?.({
    stage: "darkhorse",
    processed: keywords.length,
    total: keywords.length,
    message,
  });
  return { itemsNew, itemsUpdated, message };
}
