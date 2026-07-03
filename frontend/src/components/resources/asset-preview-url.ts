"use client";

/**
 * 素材签名预览 URL 共享缓存(T-061)。
 *
 * 网格缩略图(AssetThumbnail)与详情真预览(AssetLivePreview)都要经
 * assets.downloadUrl 换签名 URL(local-fs = token 门 blob route)。模块级
 * Promise 缓存让同一素材整个页面只换一次 —— 24 张网格卡 + 详情栏共 1 次/素材,
 * 不是 2 次。换取失败缓存 null(诚实降级占位 glyph),不无限重试打爆 dispatch。
 */

import { client } from "@/lib/contract-client";

const cache = new Map<string, Promise<string | null>>();

export function resolveAssetPreviewUrl(assetId: string): Promise<string | null> {
  const hit = cache.get(assetId);
  if (hit) return hit;
  const p = (async () => {
    try {
      const dto = (await client.getDownloadUrl({
        params: { assetId },
        query: undefined,
        body: undefined,
      })) as unknown as { url?: string };
      return dto.url ?? null;
    } catch {
      return null;
    }
  })();
  cache.set(assetId, p);
  return p;
}

/** 文件内容变更(重传/新版本)后失效,下次重新换 URL。 */
export function invalidateAssetPreviewUrl(assetId: string): void {
  cache.delete(assetId);
}
