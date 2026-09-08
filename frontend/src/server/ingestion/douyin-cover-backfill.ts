import "server-only";
export * from "@creatoros/backend/application/collection/douyin-cover-backfill";
const DY_IMAGE_REFERER = "https://www.douyin.com/";
const DY_IMAGE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) " +
  "AppleWebKit/605.1.15 (KHTML, like Gecko) " +
  "EdgiOS/121.0.2277.107 Version/17.0 Mobile/15E148 Safari/604.1";

/** 封面下载失败(非 2xx / 非图片 / 空字节 / 超时)—— 调用方按单作品降级处理。 */
export class DouyinCoverDownloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DouyinCoverDownloadError";
  }
}

// [Bug-4 T-017] 封面 CDN 图下载 30s 超时(同 fetchDouyinVideoUrl 同病):裸 await 永不 resolve
// → 整批卡死。30s 远超正常(~1-3s)但不拖垮坏作品。
const COVER_IMAGE_FETCH_TIMEOUT_MS = 30_000;

/**
 * 下载封面图字节(带 Referer/UA,抖音 CDN 直链)。非 2xx / content-type 非 image /
 * 空 body → 抛 DouyinCoverDownloadError(runner 记该作品 failed,其余继续)。
 * fetch 注入:host 传真全局 fetch,单测注 fake 不走网络。
 *
 * [Bug-4 T-017] **30s 超时**:CDN 半开连接 / 服务器静默吞请求 → 裸 await 永不 resolve
 * → 整批封面回填卡死。30s 远超正常 (CDN ~1s) 但不至于让一个坏作品卡整批。
 * 超时 → fetch reject AbortError → 下面 try/catch 把它包成 DouyinCoverDownloadError,
 * runner 增 failed 计数继续下一条。
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
      signal: AbortSignal.timeout(COVER_IMAGE_FETCH_TIMEOUT_MS),
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
