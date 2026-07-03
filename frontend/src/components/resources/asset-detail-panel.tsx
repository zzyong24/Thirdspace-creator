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
import {
  AssetAttachToProject,
  type AttachProjectOption,
} from "@/components/resources/asset-attach-to-project";
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
  // Module 07 E3–E6 needs-backend handlers. Optional so the panel stays a pure
  // Server Component when rendered without an island (no handlers → render-only
  // buttons, the previous behavior). When the Assets island passes them, the
  // four actions fire the mapped contract op (download/copy-link/favorite/trash).
  readonly onDownload?: (assetId: string) => void;
  readonly onCopyLink?: (assetId: string) => void;
  readonly onFavorite?: (assetId: string) => void;
  readonly onTrash?: (assetId: string) => void;
  // [T-055d SPEC §7.2] 在 Finder 显示(open -R 定位文件;单机产品 server 与用户同机)。
  readonly onReveal?: (assetId: string) => void;
  // Plan D1 附到项目 (用料链): the user's projects + the attach handler. When
  // provided the panel renders the project picker; the handler fires
  // materialLinks.create. Optional so the panel stays render-only without them.
  readonly projects?: ReadonlyArray<AttachProjectOption>;
  readonly onAttach?: (assetId: string, projectId: string) => void;
  readonly actionsPending?: boolean;
}

export function AssetDetailPanel({
  asset,
  usageHistory,
  onDownload,
  onCopyLink,
  onFavorite,
  onTrash,
  onReveal,
  projects = [],
  onAttach,
  actionsPending = false,
}: AssetDetailPanelProps) {
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
                disabled={actionsPending}
                onClick={
                  onDownload ? () => onDownload(asset.id) : undefined
                }
                className="flex flex-1 flex-col items-center justify-center gap-0.5 rounded-control px-2 py-1.5 text-foreground hover:bg-surface-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-50"
              >
                <svg viewBox="0 0 16 16" className="size-4" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={1.4}>
                  <path d="M8 2.5 V10 M5 7 L8 10 L11 7 M3 12.5 H13" />
                </svg>
                <span>下载</span>
              </button>
              <button
                type="button"
                data-slot="asset-action-copy"
                disabled={actionsPending}
                onClick={onCopyLink ? () => onCopyLink(asset.id) : undefined}
                className="flex flex-1 flex-col items-center justify-center gap-0.5 rounded-control px-2 py-1.5 text-foreground hover:bg-surface-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-50"
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
                disabled={actionsPending}
                onClick={onFavorite ? () => onFavorite(asset.id) : undefined}
                className="flex flex-1 flex-col items-center justify-center gap-0.5 rounded-control px-2 py-1.5 text-foreground hover:bg-surface-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-50"
              >
                <svg viewBox="0 0 16 16" className="size-4" aria-hidden="true" fill="currentColor">
                  <path d="M8 2.5 L9.85 6 L13.5 6.5 L10.75 9 L11.5 12.5 L8 10.8 L4.5 12.5 L5.25 9 L2.5 6.5 L6.15 6 Z" />
                </svg>
                <span>收藏</span>
              </button>
              {/* [T-055d SPEC §7.2] local-fs 单机:在 Finder 定位这份原始文件。 */}
              <button
                type="button"
                data-slot="asset-action-reveal"
                aria-label="在 Finder 显示"
                disabled={actionsPending}
                onClick={onReveal ? () => onReveal(asset.id) : undefined}
                className="flex flex-1 flex-col items-center justify-center gap-0.5 rounded-control px-2 py-1.5 text-foreground hover:bg-surface-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-50"
              >
                <svg viewBox="0 0 16 16" className="size-4" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={1.4}>
                  <path d="M2 5 H6 L7.5 6.5 H14 V12.5 H2 Z" />
                </svg>
                <span>Finder</span>
              </button>
              {/* [T-055d/T-056⑥] 危险操作显式命名(原「更多」实为删除,误导);确认在 handler。 */}
              <button
                type="button"
                data-slot="asset-action-trash"
                aria-label="移入回收站"
                disabled={actionsPending}
                onClick={onTrash ? () => onTrash(asset.id) : undefined}
                className="flex flex-1 flex-col items-center justify-center gap-0.5 rounded-control px-2 py-1.5 text-destructive hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-50"
              >
                <svg viewBox="0 0 16 16" className="size-4" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={1.4}>
                  <path d="M3 4.5 H13 M6.5 4.5 V3 H9.5 V4.5 M4.5 4.5 L5.2 13 H10.8 L11.5 4.5 M6.8 7 V11 M9.2 7 V11" />
                </svg>
                <span>移入回收站</span>
              </button>
            </div>
            <AssetAttachToProject
              assetId={asset.id}
              projects={projects}
              onAttach={onAttach}
              pending={actionsPending}
            />
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
