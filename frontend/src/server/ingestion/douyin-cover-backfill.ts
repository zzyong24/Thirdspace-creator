import "server-only";

// 作品封面回填(T-078)。
//
// 背景:iesdouyin 分享页解析(douyin-cdp parseDouyinVideoUrl)一直能抽到
// `video.cover.url_list[0]`,但此前无人消费 —— 作品列表全是渐变占位假封面。
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
  publicationId: string;
  /** 抖音 aweme_id(候选集查询已过滤 external_id 非空)。 */
  externalId: string;
}

/** 回填一轮的统计(attempted = 候选数;filled + failed + skipped = attempted)。 */
export interface CoverBackfillResult {
  attempted: number;
  /** 成功落库(asset 建成 + revision.coverAssetId 写上)的作品数。 */
  filled: number;
  /** 分享页解析成功但没有 coverUrl(图集/结构变化)→ 诚实跳过,不硬造。 */
  skipped: number;
  /** 任一环节失败(解析/下载/落库)→ 单作品降级,计数继续。 */
  failed: number;
}

export interface CoverBackfillPorts {
  /** 缺封面候选集(host 绑 publishingService.listPublicationsMissingCover)。 */
  listMissingCover(limit: number): Promise<MissingCoverPublication[]>;
  /** iesdouyin 分享页解析(host 绑 fetchDouyinVideoUrl + 真限流网关)。 */
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
}

/** 每轮默认回填上限(env CREATOROS_COVER_BACKFILL_LIMIT 可调)。iesdouyin channel
 *  minInterval 9s → 100 条 ≈ 15 分钟,采集串行闸内后台跑,不阻塞界面。 */
export const DEFAULT_COVER_BACKFILL_LIMIT = 100;

/**
 * 回填一轮缺封面作品。逐条串行(节奏由 fetchVideoUrl 内的限流网关控制,并行只会
 * 在 acquire 上排队,无意义),单作品失败降级继续(③)。
 */
export async function backfillDouyinCovers(
  ports: CoverBackfillPorts,
  opts?: { limit?: number },
): Promise<CoverBackfillResult> {
  const limit = opts?.limit ?? DEFAULT_COVER_BACKFILL_LIMIT;
  const result: CoverBackfillResult = {
    attempted: 0,
    filled: 0,
    skipped: 0,
    failed: 0,
  };
  const missing = await ports.listMissingCover(limit);
  result.attempted = missing.length;
  for (const pub of missing) {
    try {
      const { coverUrl } = await ports.fetchVideoUrl(pub.externalId);
      if (!coverUrl) {
        // 分享页可解析但无 cover(图集等)—— 诚实跳过,下一轮还会是候选;
        // 不造占位 asset。
        result.skipped += 1;
        continue;
      }
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
      result.filled += 1;
    } catch (err) {
      // ③ 单作品降级:记日志继续,绝不抛出拖垮整批(整批的 best-effort 兜底在调用方)。
      result.failed += 1;
      console.error(
        `[douyin-cover-backfill] 作品 ${pub.externalId} 封面回填失败:`,
        err instanceof Error ? err.message : err,
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
const DY_IMAGE_REFERER = "https://www.douyin.com/";
const DY_IMAGE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) " +
  "AppleWebKit/605.1.15 (KHTML, like Gecko) " +
  "EdgiOS/121.0.2277.107 Version/17.0 Mobile/15E148 Safari/604.1";

/** 封面下载失败(非 2xx / 非图片 / 空字节)—— 调用方按单作品降级处理。 */
export class DouyinCoverDownloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DouyinCoverDownloadError";
  }
}

/**
 * 下载封面图字节(带 Referer/UA,抖音 CDN 直链)。非 2xx / content-type 非 image /
 * 空 body → 抛 DouyinCoverDownloadError(runner 记该作品 failed,其余继续)。
 * fetch 注入:host 传真全局 fetch,单测注 fake 不走网络。
 */
export async function downloadDouyinImage(
  url: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ bytes: Uint8Array; mimeType: string }> {
  let res: Response;
  try {
    res = await fetchImpl(url, {
      headers: {
        "User-Agent": DY_IMAGE_UA,
        Referer: DY_IMAGE_REFERER,
        Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      },
    });
  } catch (err) {
    throw new DouyinCoverDownloadError(
      `downloadDouyinImage: 请求封面失败: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
  if (!res.ok) {
    throw new DouyinCoverDownloadError(
      `downloadDouyinImage: HTTP ${res.status}`,
    );
  }
  const contentType = res.headers.get("content-type") ?? "";
  // 抖音 CDN 偶发把风控页当 200 返回 —— 非 image/* 一律拒收,不落假封面。
  if (!contentType.startsWith("image/")) {
    throw new DouyinCoverDownloadError(
      `downloadDouyinImage: 非图片响应 (content-type: ${contentType || "无"})`,
    );
  }
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.byteLength === 0) {
    throw new DouyinCoverDownloadError("downloadDouyinImage: 空响应体");
  }
  // content-type 可能带 "; charset=..." 尾巴,截干净当 mimeType。
  const mimeType = contentType.split(";")[0]!.trim() || "image/jpeg";
  return { bytes, mimeType };
}
