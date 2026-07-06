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
import { resolveAssetPreviewUrl } from "@/components/resources/asset-preview-url";
import type { ResourceAsset } from "@/components/resources/types";

export function AssetThumbnail({ asset }: { readonly asset: ResourceAsset }) {
  const visual = asset.type === "image" || asset.type === "video";
  const [url, setUrl] = React.useState<string | null>(null);
  // [T-146] 加载失败(签名到手但字节坏/404/网络断)→ 回退占位 glyph,不摆碎图。
  const [loadFailed, setLoadFailed] = React.useState(false);

  React.useEffect(() => {
    if (!visual) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 换 URL 时重置为占位态,避免旧图闪
    setUrl(null);
    setLoadFailed(false);
    void resolveAssetPreviewUrl(asset.id).then((u) => {
      if (!cancelled) setUrl(u);
    });
    return () => {
      cancelled = true;
    };
  }, [asset.id, visual]);

  // URL 换取失败,或换到了但媒体加载失败 → 诚实降级占位 glyph(thumbnailToken 渐变)。
  if (!visual || !url || loadFailed) return <MediaPreview asset={asset} />;

  if (asset.type === "image") {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={asset.name}
        loading="lazy"
        onError={() => setLoadFailed(true)}
        data-slot="asset-thumbnail"
        data-preview-type="image"
        className="aspect-[3/2] w-full rounded-t-card object-cover bg-surface-subtle"
      />
    );
  }
  return (
    // 首帧当缩略图:muted + preload=metadata,不自动播(播放在详情栏)。
    // eslint-disable-next-line jsx-a11y/media-has-caption
    <video
      src={url}
      muted
      preload="metadata"
      onError={() => setLoadFailed(true)}
      data-slot="asset-thumbnail"
      data-preview-type="video"
      className="aspect-[3/2] w-full rounded-t-card object-cover bg-black"
    />
  );
}
