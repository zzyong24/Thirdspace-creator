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
  // [T-187] 连续加载失败计数。仅对"连续失败"计数;一旦某次 <img> 成功
  // (onLoad)即归零 —— 这样 token 过期(常见)第一次 onError 重拉新 token 成功后,
  // 后续独立失败仍享有完整重试额度,不会被历史失败误伤成永久 broken。
  const retryCountRef = React.useRef(0);

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

  // [T-187] 换 asset 时重置失败计数(retryNonce bump 不重置 —— 那是同一 asset
  // 的重试轮次,必须让计数累加到上限才能停)。
  React.useEffect(() => {
    retryCountRef.current = 0;
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
      // [T-187] <img> 成功渲染 → 失败计数归零。兑现"只对连续失败计数":
      // token 过期第一次 onError 重拉、这次成功 → 计数复位,下次真失败仍有完整额度。
      onLoad={() => {
        retryCountRef.current = 0;
      }}
      // [Bug-6 T-019 / T-187] 图加载失败(token 过期 / 后端 5xx)→ 清缓存 + bump 重拉。
      // 上限 MAX_COVER_RETRIES(仅一次):重拉的 URL 也炸(持续 404/5xx)→ 停在 fallback,
      // 不再 invalidate/bump,不无限重试打爆 dispatch(兑现注释承诺)。
      onError={() => {
        if (!assetId) return;
        if (retryCountRef.current >= MAX_COVER_RETRIES) {
          // 已达上限:持续失败,停在占位,不再打 dispatch。
          setBroken(true);
          return;
        }
        retryCountRef.current += 1;
        invalidateAssetPreviewUrl(assetId);
        setBroken(true);
        // 微任务后 bump —— 给一次重试机会(常见的 token 过期情况会修好)。
        queueMicrotask(() => setRetryNonce((n) => n + 1));
      }}
    />
  );
}

/** [T-187] 封面 <img> 连续加载失败的重试上限(仅 1 次)。达上限后停在占位,不再重拉。 */
const MAX_COVER_RETRIES = 1;
