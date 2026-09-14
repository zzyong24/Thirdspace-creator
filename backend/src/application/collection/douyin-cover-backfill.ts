import {isBrowserProfileBusy} from "../../modules/ai-runtime/scheduled-collection-runner";


// 作品封面回填(T-078)。
//
// 背景:匿名 iesdouyin 分享页可抽 `video.cover.url_list[0]`，但页面结构/风控会让
// `_ROUTER_DATA` 或 item_list 为空；host 通过 douyin-cdp 的组合入口在解析类失败时
// 按当前账号登录态回落 detail，网络/HTTP/冷却类错误仍不双路重试。
// 本模块把封面挂进 self.metrics 采集链:每轮指标采集后,对**尚无 coverAssetId**
// 的已发布抖音 publication 逐条:
//   iesdouyin 分享页(aweme_id)→ coverUrl → 下载字节(带 Referer,抖音 CDN 校验
//   来源)→ assetsService.createGeneratedAsset(服务端直写,T-055/L5 通路)→
//   publishingService.setCover(append-only 新 revision 带 coverAssetId)。
//
// 铁律(与 scheduled-collection-runner 同款):
//   ① 全端口注入 —— 本模块不 import douyin-cdp / assets / publishing,host 在
//      persistence-client 接真实现,单测注 fake(零网络零浏览器)。
//   ② 幂等:候选集本身只含缺封面的作品(listPublicationsMissingCover),已有封面
//      (含用户手选)绝不重抓、绝不覆盖。
//   ③ 单作品降级:任一作品抓取/下载/落库失败 → 记一条 failed 继续下一个,绝不
//      拖垮整批(F7);整批失败也不影响指标采集主流程(调用方 best-effort 包裹)。
//   ④ 限流:iesdouyin 分享页请求由注入的 fetchVideoUrl 内部走 T-038 网关
//      (iesdouyin channel,host 注真单例);封面 CDN 图片下载是静态资源,不占
//      分享页 channel 预算。

/** 一条缺封面的作品(publication + 可拼 iesdouyin 分享页的 aweme_id)。 */
export interface MissingCoverPublication {
  /** 文件探测未知时保留原封面，单项记录待重试，不调用外部下载。 */
  coverCheckError?: string;
  publicationId: string;
  /** 抖音 aweme_id(候选集查询已过滤 external_id 非空)。 */
  externalId: string;
}

/** 回填一轮的统计(attempted = 候选数;filled + failed + skipped + deferred = attempted)。 */
export interface CoverBackfillResult {
  attempted: number;
  /** 成功落库(asset 建成 + revision.coverAssetId 写上)的作品数。 */
  filled: number;
  /** 分享页解析成功但没有 coverUrl(图集/结构变化)→ 诚实跳过,不硬造。 */
  skipped: number;
  /** 任一环节失败(解析/下载/落库)→ 单作品降级,计数继续。 */
  failed: number;
  /** 共享抖音网关处于长冷却时，本轮未再尝试、留待下轮处理的作品数。 */
  deferred: number;
}

export interface CoverBackfillPorts {
  /** 缺封面候选集(host 绑 publishingService.listPublicationsMissingCover)。 */
  onSettled?(publicationId:string,result:{success:true}|{success:false;error:string}):Promise<void>;
  listMissingCover(limit: number): Promise<MissingCoverPublication[]>;
  /** 封面组合解析(host 绑 fetchDouyinCoverUrl + 当前账号登录态 + 真限流网关)。 */
  fetchVideoUrl(awemeId: string): Promise<{ coverUrl?: string }>;
  /** 封面图下载(host 绑 downloadDouyinImage + 真 fetch)。 */
  downloadImage(url: string): Promise<{ bytes: Uint8Array; mimeType: string }>;
  /** 字节直落 asset(host 绑 assetsService.createGeneratedAsset)。 */
  createImageAsset(input: {
    name: string;
    bytes: Uint8Array;
    mimeType: string;
  }): Promise<{ id: string }>;
  /** 封面落账(host 绑 publishingService.setCover;幂等在 service 层)。 */
  setCover(publicationId: string, coverAssetId: string): Promise<void>;
  /**
   * [T-151 缺口 B] 把封面 asset 绑到作品所属项目(host 绑 materialLinksService.create,
   * entityType='asset'),让素材中心「按项目」能看到该作品封面。可选 —— 未注入时退回旧
   * 行为(封面只进全局池,不绑项目;旧组合根不破)。best-effort:绑定失败绝不把「已落封面」
   * 翻成 failed(封面 setCover 已成功是真的)——host 内部吞错记日志,不抛回本 runner。
   */
  bindCoverToProject?(publicationId: string, coverAssetId: string): Promise<void>;
}

/** 每轮默认回填上限(env CREATOROS_COVER_BACKFILL_LIMIT 可调)。小批量避免后台长占
 *  iesdouyin channel；剩余候选由下一轮继续，用户数据不会丢。 */
export const DEFAULT_COVER_BACKFILL_LIMIT = 10;

/**
 * 回填一轮缺封面作品。逐条串行(节奏由 fetchVideoUrl 内的限流网关控制,并行只会
 * 在 acquire 上排队,无意义),单作品失败降级继续(③)。
 */
export async function backfillDouyinCovers(
  ports: CoverBackfillPorts,
  opts?: {
    limit?: number;
    checkSignal?:()=>void;
    // [T-152] 逐封面进度回调(可选):每处理完一条作品调一次(done=已处理数,total=候选总数)。
    //   best-effort:回调抛错不阻断回填(内部吞)。用于采集器把封面回填阶段进度上报 job_run。
    onProgress?: (done: number, total: number) => void;
  },
): Promise<CoverBackfillResult> {
  const limit = opts?.limit ?? DEFAULT_COVER_BACKFILL_LIMIT;
  const result: CoverBackfillResult = {
    attempted: 0,
    filled: 0,
    skipped: 0,
    failed: 0,
    deferred: 0,
  };
  const missing = await ports.listMissingCover(limit);
  result.attempted = missing.length;
  // [T-202] 整批进度日志:75+ 条串行(iesdouyin 9s minInterval → ~15 分钟)真机看着像卡死。
  //   每 PROGRESS_EVERY 条(及末条)打一行 filled/skipped/failed 计数,让真机能观测「在跑、跑到哪」,
  //   而非误判整批挂死。不改限流、不改串行(并行只在 acquire 排队,无意义)。
  const PROGRESS_EVERY = 10;
  console.log(
    `[douyin-cover-backfill] 开始回填:候选 ${missing.length} 条缺封面作品(串行,受 iesdouyin 限流节奏)`,
  );
  let done = 0;
  for (let index = 0; index < missing.length; index += 1) {
    const pub = missing[index]!;
    try {
      opts?.checkSignal?.();
      if (pub.coverCheckError) throw new Error(pub.coverCheckError);
      const { coverUrl } = await ports.fetchVideoUrl(pub.externalId);
      if (!coverUrl) {
        // 分享页可解析但无 cover(图集等)—— 诚实跳过,下一轮还会是候选;
        // 不造占位 asset。
        result.skipped += 1;
        await ports.onSettled?.(pub.publicationId,{success:false,error:"暂未获取到作品封面"});
      } else {
        const { bytes, mimeType } = await ports.downloadImage(coverUrl);
        const ext = mimeType.includes("png")
          ? "png"
          : mimeType.includes("webp")
            ? "webp"
            : "jpg";
        const asset = await ports.createImageAsset({
          name: `douyin-cover-${pub.externalId}.${ext}`,
          bytes,
          mimeType,
        });
        await ports.setCover(pub.publicationId, asset.id);
        // [T-151 缺口 B] 封面已落账 → 绑到作品所属项目(素材中心「按项目」可见)。绑定**独立
        //   try/catch**:封面 setCover 已成功是真的,绑定是锦上添花 —— 绑定失败绝不把这条 filled
        //   翻成 failed(否则 filled 计数说谎)。端口未注入则跳过(退回旧行为,不绑项目)。
        if (ports.bindCoverToProject) {
          try {
            await ports.bindCoverToProject(pub.publicationId, asset.id);
          } catch (bindErr) {
            console.error(
              `[douyin-cover-backfill] 作品 ${pub.externalId} 封面绑项目失败(封面已落,项目视图暂缺):`,
              bindErr instanceof Error ? bindErr.message : bindErr,
            );
          }
        }
        await ports.onSettled?.(pub.publicationId,{success:true});
        result.filled += 1;
      }
    } catch (err) {
      opts?.checkSignal?.();
      if (err instanceof Error && err.name === "DouyinCooldownActiveError" && "remainMs" in err && typeof err.remainMs === "number") {
        // 共享网关已明确告诉我们本轮不可继续。当前项没有真正发出请求，连同剩余项
        // 一起留到下轮；继续循环只会放大日志、任务时长和 CPU/网络负载。
        result.deferred = missing.length - index;
        console.warn(
          `[douyin-cover-backfill] 抖音冷却中,本轮提前结束:已处理 ${done}/${missing.length},延后 ${result.deferred} 条,约 ${Math.ceil(err.remainMs / 1000)}s 后可重试`,
        );
        break;
      }
      // ③ 单作品降级:记日志继续,绝不抛出拖垮整批(整批的 best-effort 兜底在调用方)。
      if(isBrowserProfileBusy(err))throw err;
      await ports.onSettled?.(pub.publicationId,{success:false,error:err instanceof Error?err.message:"封面获取失败"});
      result.failed += 1;
      console.error(
        `[douyin-cover-backfill] 作品 ${pub.externalId} 封面回填失败:`,
        err instanceof Error ? err.message : err,
      );
    }
    // [T-152] 逐条上报进度(best-effort:回调抛错吞掉,不拖垮回填)。
    done += 1;
    if (opts?.onProgress) {
      try {
        opts.onProgress(done, missing.length);
      } catch {
        /* 进度回调失败不影响回填 */
      }
    }
    // [T-202] 每 N 条(及末条)打一行累计计数,真机可观测进度而非误判卡死。
    if (done % PROGRESS_EVERY === 0 || done === missing.length) {
      console.log(
        `[douyin-cover-backfill] 进度 ${done}/${missing.length} · 已填 ${result.filled} · 跳过 ${result.skipped} · 失败 ${result.failed}`,
      );
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// 封面图下载(真实现;fetch 可注入供单测)
// ---------------------------------------------------------------------------

// 抖音 CDN 校验来源 —— 与 douyin-cdp 播放直链下载惯例一致(ffmpeg headers 注释):
// 不带 Referer 会 403。UA 用手机端(与 iesdouyin 分享页请求同款口径)。
