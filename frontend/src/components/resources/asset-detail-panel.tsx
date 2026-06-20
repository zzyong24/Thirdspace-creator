/**
 * `AssetDetailPanel` (SPEC §7, 内容与资源; page-specs §12) is the fixed
 * right-hand detail panel for the currently selected asset — preview,
 * actions, metadata, tags and usage history. Per the page spec it stays a
 * panel (not a dialog). Server component: no interactivity of its own.
 */

import * as React from "react";

import { TagChip } from "@/components/content/tag-chip";
import { SectionCard } from "@/components/project/section-card";
import { MediaPreview } from "@/components/resources/media-preview";
import {
  formatDuration,
  formatFileSize,
} from "@/components/resources/asset-format";
import type {
  ResourceAsset,
  ResourceAssetUsage,
} from "@/components/resources/types";
import type { AssetType } from "@/types/domain";

const TYPE_LABEL: Record<AssetType, string> = {
  image: "图片",
  video: "视频",
  audio: "音频",
  document: "文档",
  subtitle: "字幕",
};

export interface AssetDetailPanelProps {
  readonly asset: ResourceAsset | null;
  readonly usageHistory: ReadonlyArray<ResourceAssetUsage>;
}

export function AssetDetailPanel({ asset, usageHistory }: AssetDetailPanelProps) {
  const usageForAsset = asset
    ? usageHistory.filter((row) => row.assetId === asset.id)
    : [];
  return (
    <aside
      data-slot="asset-detail-panel"
      data-asset-id={asset?.id ?? ""}
      aria-label="素材详情"
      className="flex h-fit flex-col gap-2 rounded-card border border-border bg-surface p-2"
    >
      {asset ? (
        <>
          <SectionCard
            title="预览"
            description={TYPE_LABEL[asset.type]}
            contentClassName="p-0"
            className="gap-1.5"
          >
            <MediaPreview asset={asset} />
          </SectionCard>
          <SectionCard
            title="操作"
            description="管理此素材的使用方式"
            className="gap-1.5"
          >
            <div data-slot="asset-actions" className="flex items-center justify-between gap-1 text-[11px] text-muted-foreground">
              <button
                type="button"
                data-slot="asset-action-download"
                className="flex flex-1 flex-col items-center justify-center gap-0.5 rounded-control px-2 py-1.5 text-foreground hover:bg-surface-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              >
                <svg viewBox="0 0 16 16" className="size-4" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={1.4}>
                  <path d="M8 2.5 V10 M5 7 L8 10 L11 7 M3 12.5 H13" />
                </svg>
                <span>下载</span>
              </button>
              <button
                type="button"
                data-slot="asset-action-copy"
                className="flex flex-1 flex-col items-center justify-center gap-0.5 rounded-control px-2 py-1.5 text-foreground hover:bg-surface-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              >
                <svg viewBox="0 0 16 16" className="size-4" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={1.4}>
                  <rect x={5} y={5} width={9} height={9} rx={1.2} />
                  <path d="M3 11 V3 H11" />
                </svg>
                <span>复制链接</span>
              </button>
              <button
                type="button"
                data-slot="asset-action-favorite"
                className="flex flex-1 flex-col items-center justify-center gap-0.5 rounded-control px-2 py-1.5 text-foreground hover:bg-surface-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              >
                <svg viewBox="0 0 16 16" className="size-4" aria-hidden="true" fill="currentColor">
                  <path d="M8 2.5 L9.85 6 L13.5 6.5 L10.75 9 L11.5 12.5 L8 10.8 L4.5 12.5 L5.25 9 L2.5 6.5 L6.15 6 Z" />
                </svg>
                <span>收藏</span>
              </button>
              <button
                type="button"
                data-slot="asset-action-rename"
                className="flex flex-1 flex-col items-center justify-center gap-0.5 rounded-control px-2 py-1.5 text-foreground hover:bg-surface-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              >
                <svg viewBox="0 0 16 16" className="size-4" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={1.4}>
                  <circle cx={8} cy={8} r={1.2} fill="currentColor" />
                  <circle cx={3.5} cy={8} r={1.2} fill="currentColor" />
                  <circle cx={12.5} cy={8} r={1.2} fill="currentColor" />
                </svg>
                <span>更多</span>
              </button>
            </div>
          </SectionCard>
          <SectionCard
            title="元数据"
            description="文件基础信息"
            className="gap-1.5"
          >
            <dl
              data-slot="asset-metadata"
              className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground"
            >
              <dt>类型</dt>
              <dd className="text-right text-foreground">{TYPE_LABEL[asset.type]}</dd>
              <dt>格式</dt>
              <dd className="text-right font-mono tabular-nums text-foreground">
                {asset.mimeType}
              </dd>
              <dt>大小</dt>
              <dd className="text-right font-mono tabular-nums text-foreground">
                {formatFileSize(asset.fileSizeBytes)}
              </dd>
              {asset.width !== null && asset.height !== null ? (
                <>
                  <dt>尺寸</dt>
                  <dd className="text-right font-mono tabular-nums text-foreground">
                    {asset.width}×{asset.height}
                  </dd>
                </>
              ) : null}
              {asset.durationMs !== null ? (
                <>
                  <dt>时长</dt>
                  <dd className="text-right font-mono tabular-nums text-foreground">
                    {formatDuration(asset.durationMs)}
                  </dd>
                </>
              ) : null}
              <dt>更新</dt>
              <dd className="text-right font-mono tabular-nums text-foreground">
                {asset.updatedAt.slice(0, 10)}
              </dd>
            </dl>
          </SectionCard>
          <SectionCard
            title="标签"
            description="已附加到此素材的标签"
            className="gap-1.5"
          >
            <div data-slot="asset-tags" className="flex flex-wrap gap-1">
              {asset.tags.length > 0 ? (
                asset.tags.map((tag) => (
                  <TagChip
                    key={`${asset.id}-${tag}`}
                    label={tag}
                    tone="neutral"
                    size="sm"
                  />
                ))
              ) : (
                <span className="text-[11px] text-muted-foreground">—</span>
              )}
            </div>
          </SectionCard>
          <SectionCard
            title="使用记录"
            description="此素材被引用的项目"
            className="gap-1.5"
          >
            <ul
              data-slot="asset-usage-history"
              className="flex flex-col gap-0.5 text-[11px]"
              aria-label="素材使用记录"
            >
              {usageForAsset.length > 0 ? (
                usageForAsset.map((row) => (
                  <li
                    key={row.id}
                    data-slot="asset-usage-row"
                    data-usage-id={row.id}
                    className="flex items-center justify-between gap-2 rounded-control bg-surface-subtle px-2 py-1"
                  >
                    <span className="truncate text-foreground">
                      {row.projectTitle}
                    </span>
                    <span className="shrink-0 font-mono tabular-nums text-muted-foreground">
                      {row.dateLabel}
                    </span>
                  </li>
                ))
              ) : (
                <li className="text-muted-foreground">尚未被项目引用。</li>
              )}
            </ul>
          </SectionCard>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          选择一个素材以查看详情。
        </p>
      )}
    </aside>
  );
}
