"use client";

/**
 * 素材真预览(T-060③c,用户裁决:「不管是文档还是视频还是图片还是音频,全部支持预览,
 * 支持去听」)。
 *
 * 挂载时经 assets.downloadUrl 换签名 URL(local-fs = token 门 blob route),按类型渲:
 *   image → <img>;video → <video controls>;audio → <audio controls>(能听);
 *   subtitle/document → 「打开原件」链接(浏览器内联或下载,按 MIME 由浏览器决定)。
 * 取不到 URL(文件缺失/存储不可用)→ 诚实降级回占位 glyph(MediaPreview),不摆坏播放器。
 */

import * as React from "react";

import { client } from "@/lib/contract-client";
import { MediaPreview } from "@/components/resources/media-preview";
import type { ResourceAsset } from "@/components/resources/types";

export function AssetLivePreview({ asset }: { asset: ResourceAsset }) {
  const [url, setUrl] = React.useState<string | null>(null);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    setUrl(null);
    setFailed(false);
    void (async () => {
      try {
        const dto = (await client.getDownloadUrl({
          params: { assetId: asset.id },
          query: undefined,
          body: undefined,
        })) as unknown as { url?: string };
        if (!cancelled) {
          if (dto.url) setUrl(dto.url);
          else setFailed(true);
        }
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [asset.id]);

  // 取不到 → 占位 glyph(诚实);取到前也先显 glyph(避免布局跳)。
  if (failed || !url) return <MediaPreview asset={asset} />;

  if (asset.type === "image") {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={asset.name}
        data-slot="asset-live-preview"
        data-preview-type="image"
        className="aspect-[3/2] w-full rounded-control border border-border object-contain bg-surface-subtle"
      />
    );
  }
  if (asset.type === "video") {
    return (
      // eslint-disable-next-line jsx-a11y/media-has-caption
      <video
        src={url}
        controls
        preload="metadata"
        data-slot="asset-live-preview"
        data-preview-type="video"
        className="aspect-[3/2] w-full rounded-control border border-border bg-black object-contain"
      />
    );
  }
  if (asset.type === "audio") {
    return (
      <div
        data-slot="asset-live-preview"
        data-preview-type="audio"
        className="flex aspect-[3/2] w-full flex-col items-center justify-center gap-2 rounded-control border border-border bg-surface-subtle px-3"
      >
        <p className="max-w-full truncate text-xs text-muted-foreground">
          {asset.name}
        </p>
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <audio src={url} controls preload="metadata" className="w-full" />
      </div>
    );
  }
  // subtitle / document:浏览器内联打开(文本/PDF 可看,其他按 MIME 下载)。
  return (
    <div
      data-slot="asset-live-preview"
      data-preview-type="document"
      className="flex aspect-[3/2] w-full flex-col items-center justify-center gap-2 rounded-control border border-border bg-surface-subtle px-3"
    >
      <p className="max-w-full truncate text-xs text-muted-foreground">
        {asset.name}
      </p>
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="rounded-control border border-brand/40 px-3 py-1 text-xs font-medium text-brand hover:bg-brand-soft"
      >
        打开原件预览
      </a>
    </div>
  );
}
