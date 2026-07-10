"use client";

/**
 * 素材签名预览 URL 共享缓存(T-061,修 Bug-6)。
 *
 * 网格缩略图(AssetThumbnail)与详情真预览(AssetLivePreview)都要经
 * assets.downloadUrl 换签名 URL(local-fs = token 门 blob route)。模块级
 * Promise 缓存让同一素材整个页面只换一次 —— 24 张网格卡 + 详情栏共 1 次/素材,
 * 不是 2 次。换取失败缓存 null(诚实降级占位 glyph),不无限重试打爆 dispatch。
 *
 * [Bug-6 T-019] **TTL 强制 ≤ token TTL**:local-fs 默认 expiresInMs=15min,签名 URL 15 分钟
 * 后服务端验签 reject → 浏览器 <img onError> → 卡片回退到占位。**但 module-scope Promise
 * 缓存永不过期**,用户看一会儿图就全消失(就是「先用能看,过会儿全不显示」的根因)。
 * 修法:存 `{url, expiresAt}`,过期自动 invalidate + 重换。`invalidateAssetPreviewUrl`
 * 也终于有 caller 调了(组件 onError 时),避免「失败的 URL 永远卡死」的二次病。
 */

import { client } from "@/lib/contract-client";

// [Bug-6 T-019] 10 分钟 < token TTL(15min 默认),留 5min 安全垫;
// 太短 → 多余 dispatch;太长 → 又踩「缓存超过 token 寿命」的原坑。
const CACHE_TTL_MS = 10 * 60 * 1000;

interface CacheEntry {
  url: string | null;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();
// in-flight Promise 按 assetId 串行(防双击/并发 mount 同一素材重复换),
// 但 cache 命中读 `Promise.resolve(entry.url)`(不进微任务排队,已 fetch 完的同步返回)。
const inflight = new Map<string, Promise<string | null>>();

export function resolveAssetPreviewUrl(assetId: string): Promise<string | null> {
  const hit = cache.get(assetId);
  // [Bug-6 T-019] 命中但过期 → 当作未命中,失效 + 重换。
  if (hit && Date.now() < hit.expiresAt) return Promise.resolve(hit.url);

  // 已过期 → 失效原条目(下个 await 不会用旧 url)。
  if (hit) cache.delete(assetId);

  // 防并发:同一 assetId 多处同时 mount(网格卡 + 详情栏)共用一次 in-flight。
  const inflightHit = inflight.get(assetId);
  if (inflightHit) return inflightHit;

  const p = (async () => {
    try {
      const dto = (await client.getDownloadUrl({
        params: { assetId },
        query: undefined,
        body: undefined,
      })) as unknown as { url?: string };
      const url = dto.url ?? null;
      cache.set(assetId, { url, expiresAt: Date.now() + CACHE_TTL_MS });
      return url;
    } catch {
      // [Bug-6 T-019] 失败也缓存短 TTL(30s),避免某素材瞬时 5xx 被打爆 dispatch。
      // 但显式 invalidate 仍能立刻清掉(组件 onError 触发时)。
      cache.set(assetId, { url: null, expiresAt: Date.now() + 30_000 });
      return null;
    } finally {
      inflight.delete(assetId);
    }
  })();
  inflight.set(assetId, p);
  return p;
}

/** 文件内容变更(重传/新版本)后失效,下次重新换 URL。 */
export function invalidateAssetPreviewUrl(assetId: string): void {
  cache.delete(assetId);
  // [Bug-6 T-019] 同时清 in-flight(避免下一次 mount 拿到旧 in-flight 旧 promise)。
  inflight.delete(assetId);
}
