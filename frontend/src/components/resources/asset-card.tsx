/**
 * `AssetCard` (SPEC §7, 内容与资源) renders a selectable asset tile with a
 * `MediaPreview` thumbnail, name and metadata subtitle. Selection is
 * caller-controlled via `onSelect`; the card carries deterministic
 * data-slots for tests.
 */

import * as React from "react";

import { MediaPreview } from "@/components/resources/media-preview";
import { formatFileSize } from "@/components/resources/asset-format";
import type { ResourceAsset } from "@/components/resources/types";

export interface AssetCardProps {
  readonly asset: ResourceAsset;
  readonly selected: boolean;
  readonly onSelect: (assetId: string) => void;
}

export function AssetCard({ asset, selected, onSelect }: AssetCardProps) {
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
        onClick={() => onSelect(asset.id)}
        className="flex w-full flex-col gap-1.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      >
        <MediaPreview asset={asset} />
        <div className="flex flex-col gap-0.5 px-0.5">
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
            <span className="truncate">{asset.name}</span>
          </span>
          <span className="truncate text-[11px] leading-tight text-muted-foreground">
            {cardSubtitle(asset)}
          </span>
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
