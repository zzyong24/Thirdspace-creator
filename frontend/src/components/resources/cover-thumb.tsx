"use client";

/**
 * 作品封面缩略图(T-078,修 Bug-6)。
 *
 * 有 coverAssetId → 经 resolveAssetPreviewUrl(T-061 共享缓存,同一素材整页只换
 * 一次签名 URL)渲真封面 <img>;无 coverAssetId / URL 换取失败 / 图加载失败 →
 * 渲 fallback(调用方现有的渐变占位 / 「封面待生成」块)。
 *
 * [Bug-6 T-019] **图加载失败(token 过期或后端短暂 5xx)→ 清缓存 + 重拉一次**。
 * 旧实现:setBroken(true) → 仅本次挂载回退到占位;cache 里的坏 URL 永不过期,
 * 路由回来再渲 → 拿到同一坏 URL → 仍 fallback(用户体验:「一直在显示占位」)。
 * 修:onError 调 invalidateAssetPreviewUrl + bump 一个 retry key 强制重新拉。
 *
 * 发布中心列表、项目列表行、稿面发布包区共用(AssetThumbnail 范式的封面版:
 * AssetThumbnail 吃 ResourceAsset 整对象,这里只有一个 assetId + 任意占位)。
 */

import * as React from "react";

import {
  resolveAssetPreviewUrl,
  invalidateAssetPreviewUrl,
} from "@/components/resources/asset-preview-url";

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
  const [retryNonce, setRetryNonce] = React.useState(0); // [Bug-6] bump 触发重拉
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
  }, [assetId, retryNonce]);

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
      // [Bug-6 T-019] 图加载失败(token 过期 / 后端 5xx)→ 清缓存 + bump 重拉。
      // 一限(仅一次失败):如果重拉的 URL 也炸,保持在 fallback 不无限重试打爆 dispatch。
      onError={() => {
        if (!assetId) return;
        invalidateAssetPreviewUrl(assetId);
        setBroken(true);
        // 微任务后 bump —— 给一次重试机会(常见的 token 过期情况会修好)。
        queueMicrotask(() => setRetryNonce((n) => n + 1));
      }}
    />
  );
}
