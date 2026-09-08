"use client";
import * as React from "react";
import {resolveAssetPreviewUrl} from "@/components/resources/asset-preview-url";

export function BrollThumb({
  assetId,
  kind,
  name,
}: {
  assetId: string;
  kind: string;
  name: string;
}) {
  const [url, setUrl] = React.useState<string | null>(null);
  React.useEffect(() => {
    let cancelled = false;
    void resolveAssetPreviewUrl(assetId).then((u) => {
      if (!cancelled) setUrl(u ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [assetId]);
  const cls =
    "aspect-video w-full rounded-control border border-border bg-black object-cover";
  if (!url) {
    return (
      <div
        className={`${cls} flex items-center justify-center text-[10px] text-muted-foreground`}
      >
        {kind}
      </div>
    );
  }
  if (kind === "image") {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={url} alt={name} className={cls} />
    );
  }
  return (
    <video src={url} muted preload="metadata" className={cls} />
  );
}

/**
 * [T-292] 成片预览:采纳后的 final.mp4 assetId → 签名 URL → 内联 <video>。
 * 画幅决定播放器比例(竖版 9:16 居中限高 / 横版 16:9);取不到 URL 诚实不渲染。
 */
export function FinalVideoPreview({
  assetId,
  orientation,
}: {
  assetId: string;
  orientation?: "portrait" | "landscape";
}) {
  const [url, setUrl] = React.useState<string | null>(null);
  React.useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 换素材时重置,避免旧片闪
    setUrl(null);
    void resolveAssetPreviewUrl(assetId).then((u) => {
      if (!cancelled) setUrl(u ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [assetId]);
  if (!url) return null;
  const shape =
    orientation === "portrait"
      ? "mx-auto aspect-[9/16] max-h-[70vh]"
      : "aspect-video";
  return (
    <video
      src={url}
      controls
      preload="metadata"
      data-slot="production-final-video"
      className={`w-full rounded-control border border-border bg-black object-contain ${shape}`}
    />
  );
}
