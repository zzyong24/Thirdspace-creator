/**
 * `AssetCard` (SPEC §7, 内容与资源) renders a selectable asset tile with a
 * real `AssetThumbnail` (T-061: 图/视频渲签名 URL 真内容,其余 glyph), name and metadata subtitle. Selection is
 * caller-controlled via `onSelect`; the card carries deterministic
 * data-slots for tests.
 */

import * as React from "react";

import { AssetThumbnail } from "@/components/resources/asset-thumbnail";
import { formatFileSize } from "@/components/resources/asset-format";
import type { ResourceAsset } from "@/components/resources/types";

export interface AssetCardProps {
  readonly asset: ResourceAsset;
  readonly selected: boolean;
  readonly libraryLayout?: boolean;
  readonly onSelect: (assetId: string) => void;
}

export function AssetCard({ asset, selected, onSelect, libraryLayout = false }: AssetCardProps) {
  return (
    <article
      data-slot="asset-card"
      data-asset-id={asset.id}
      data-asset-type={asset.type}
      aria-label={`素材 ${asset.name}`}
      className={
        "flex flex-col gap-1 overflow-hidden rounded-card border bg-surface p-1 transition-colors hover:border-ring " +
        (selected ? "border-brand ring-2 ring-brand/40" : "border-border")
      }
    >
      <button
        type="button"
        data-slot="asset-card-button"
        aria-pressed={selected}
        aria-label={asset.name}
        onClick={() => onSelect(asset.id)}
        className="flex w-full flex-col gap-1.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      >
        <AssetThumbnail asset={asset} />
        <div data-slot="asset-card-caption" className="flex flex-col gap-0.5 px-0.5">
          <span className="flex items-center gap-1 text-[13px] font-medium leading-tight text-foreground">
            {/* [T-051 2e] 收藏痕迹:isFavorite 落库值读回后显星标(此前写库无任何 UI 痕迹)。 */}
            {asset.isFavorite ? (
              <span
                data-slot="asset-favorite-mark"
                aria-label="已收藏"
                className="shrink-0 text-[11px] text-amber-500"
              >
                ★
              </span>
            ) : null}
            <span data-slot="asset-card-name" className="truncate">{asset.name}</span>
          </span>
          {libraryLayout ? (
            <span data-slot="asset-card-meta">
              <span>{({ image: "图片", video: "视频", audio: "音频", document: "文档", subtitle: "字幕" })[asset.type]} · {formatFileSize(asset.fileSizeBytes)}</span>
              <time dateTime={asset.updatedAt}>{asset.updatedAt.slice(0, 10)}</time>
            </span>
          ) : (
            <span className="truncate text-[11px] leading-tight text-muted-foreground">{cardSubtitle(asset)}</span>
          )}
        </div>
      </button>
    </article>
  );
}

function cardSubtitle(asset: ResourceAsset): string {
  const date = asset.updatedAt.slice(0, 10);
  const size = formatFileSize(asset.fileSizeBytes);
  return `${date} · ${asset.mimeType} · ${size}`;
}
