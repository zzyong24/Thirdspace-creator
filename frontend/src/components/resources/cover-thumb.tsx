"use client";

/**
 * 作品封面缩略图(T-078)。
 *
 * 有 coverAssetId → 经 resolveAssetPreviewUrl(T-061 共享缓存,同一素材整页只换
 * 一次签名 URL)渲真封面 <img>;无 coverAssetId / URL 换取失败 / 图加载失败 →
 * 渲 fallback(调用方现有的渐变占位 / 「封面待生成」块),现状不回退。
 *
 * 发布中心列表、项目列表行、稿面发布包区共用(AssetThumbnail 范式的封面版:
 * AssetThumbnail 吃 ResourceAsset 整对象,这里只有一个 assetId + 任意占位)。
 */

import * as React from "react";

import { resolveAssetPreviewUrl } from "@/components/resources/asset-preview-url";

export function CoverThumb({
  assetId,
  alt,
  className,
  fallback,
}: {
  readonly assetId: string | null | undefined;
  readonly alt: string;
  readonly className: string;
  /** 无封面/换 URL 失败时渲染的现有占位(渐变块 / 文案块)。 */
  readonly fallback: React.ReactNode;
}) {
  const [url, setUrl] = React.useState<string | null>(null);
  const [broken, setBroken] = React.useState(false);

  React.useEffect(() => {
    if (!assetId) return;
    let cancelled = false;
    setUrl(null);
    setBroken(false);
    void resolveAssetPreviewUrl(assetId).then((u) => {
      if (!cancelled) setUrl(u);
    });
    return () => {
      cancelled = true;
    };
  }, [assetId]);

  if (!assetId || !url || broken) return <>{fallback}</>;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={alt}
      loading="lazy"
      data-slot="cover-thumb"
      data-asset-id={assetId}
      className={className}
      onError={() => setBroken(true)}
    />
  );
}
