"use client";

/**
 * 网格卡片真缩略图(T-061,用户复验「素材还是不能预览」的主因修复)。
 *
 * 此前 AssetCard 一律渲 MediaPreview 占位 glyph —— 浏览素材时满屏紫色假图。
 * 现在 image/video 走签名 URL 渲真内容(共享 resolveAssetPreviewUrl 缓存,与
 * 详情栏同一素材只换一次 URL):
 *   image → <img object-cover>;video → <video preload="metadata" muted>(首帧)。
 * audio/document/subtitle 网格里没有可视内容,保留 glyph(详情栏才给播放器/链接)。
 * URL 换取失败 → 诚实降级 glyph。
 */

import * as React from "react";

import { MediaPreview } from "@/components/resources/media-preview";
import {
  invalidateAssetPreviewUrl,
  acquireAssetPreviewUrl,
} from "@/components/resources/asset-preview-url";
import type { ResourceAsset } from "@/components/resources/types";

export function AssetThumbnail({ asset }: { readonly asset: ResourceAsset }) {
  const visual = asset.type === "image" || asset.type === "video";
  const [url, setUrl] = React.useState<string | null>(null);
  const [retryNonce, setRetryNonce] = React.useState(0);
  // [T-146] 加载失败(签名到手但字节坏/404/网络断)→ 回退占位 glyph,不摆碎图。
  const [loadFailed, setLoadFailed] = React.useState(false);
  const retriedAssetRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (!visual) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 换 URL 时重置为占位态,避免旧图闪
    setUrl(null);
    setLoadFailed(false);
    const preview = acquireAssetPreviewUrl(asset.id, {priority: "thumbnail"});
    void preview.promise.then((u) => {
      if (!cancelled) setUrl(u);
    });
    return () => {
      cancelled = true;
      preview.release();
    };
  }, [asset.id, visual, retryNonce]);

  React.useEffect(() => {
    retriedAssetRef.current = null;
  }, [asset.id]);

  const handleLoadError = React.useCallback(() => {
    invalidateAssetPreviewUrl(asset.id);
    setLoadFailed(true);
    if (retriedAssetRef.current === asset.id) return;
    retriedAssetRef.current = asset.id;
    queueMicrotask(() => setRetryNonce((n) => n + 1));
  }, [asset.id]);

  // URL 换取失败,或换到了但媒体加载失败 → 诚实降级占位 glyph(thumbnailToken 渐变)。
  if (!visual || !url || loadFailed) return <MediaPreview asset={asset} />;

  if (asset.type === "image") {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={asset.name}
        loading="lazy"
        onError={handleLoadError}
        data-slot="asset-thumbnail"
        data-preview-type="image"
        className="aspect-[3/2] w-full rounded-t-card object-cover bg-surface-subtle"
      />
    );
  }
  return (
    // 首帧当缩略图:muted + preload=metadata,不自动播(播放在详情栏)。
    // [T-304] WebKit 下 preload=metadata 只加载元数据、不解码首帧 → 缩略图全黑。
    //   loadedmetadata 后 seek 到 0.1s 逼浏览器解码 + 画出该帧当封面(仍不播,静止首帧)。
    // eslint-disable-next-line jsx-a11y/media-has-caption
    <video
      src={url}
      muted
      preload="metadata"
      onLoadedMetadata={(e) => {
        const v = e.currentTarget;
        if (v.currentTime < 0.05) {
          try {
            v.currentTime = 0.1;
          } catch {
            /* seek 不支持 → 保持黑框(诚实降级) */
          }
        }
      }}
      onError={handleLoadError}
      data-slot="asset-thumbnail"
      data-preview-type="video"
      className="aspect-[3/2] w-full rounded-t-card object-cover bg-black"
    />
  );
}
