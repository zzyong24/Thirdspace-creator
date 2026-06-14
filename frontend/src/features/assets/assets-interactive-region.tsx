"use client";

/**
 * `AssetsInteractiveRegion` is the Client island for the Assets Center
 * page (Task 20 / page-specs §12).
 *
 * Selection of the currently-active asset requires local UI state, so
 * the gallery (3-col grid + pagination) and the fixed right-rail
 * detail panel live together in this single Client island. The page
 * (`assets-page.tsx`) stays a Server Component.
 *
 * The island renders:
 *  - GalleryControls (view toggle + sort),
 *  - AssetCardGrid (three-column grid of AssetCard),
 *  - Pagination (page-specs §12),
 *  - AssetDetailPanel (MediaPreview + AssetActions + AssetMetadata +
 *    Tags + UsageHistory; fixed right-rail — NOT a dialog/modal).
 *
 * Determinism: every visual is rendered from props derived from
 * canonical fixtures. No `Date.now`/`Math.random`/network.
 */

import * as React from "react";

import { TagChip } from "@/components/content/tag-chip";
import { SectionCard } from "@/components/project/section-card";
import type { AssetType } from "@/types/domain";
import type {
  AssetSummary,
  AssetUsageRow,
  AssetsViewModel,
} from "./assets-page";

const TYPE_LABEL: Record<AssetType, string> = {
  image: "图片",
  video: "视频",
  audio: "音频",
  document: "文档",
  subtitle: "字幕",
};

// ---------------------------------------------------------------------------
// AssetsInteractiveRegion
// ---------------------------------------------------------------------------

interface AssetsInteractiveRegionProps {
  readonly viewModel: AssetsViewModel;
}

export function AssetsInteractiveRegion({ viewModel }: AssetsInteractiveRegionProps) {
  const [selectedId, setSelectedId] = React.useState<string | null>(
    viewModel.assets[0]?.id ?? null,
  );
  const selected =
    viewModel.assets.find((asset) => asset.id === selectedId) ??
    viewModel.assets[0] ??
    null;
  return (
    <div
      data-slot="assets-interactive-region"
      className="grid grid-cols-1 gap-card-gap lg:grid-cols-[minmax(0,1fr)_296px]"
    >
      <div
        data-slot="asset-gallery"
        aria-label="素材画廊"
        className="flex flex-col gap-3"
      >
        <GalleryControls />
        <AssetCardGrid
          assets={viewModel.assets}
          selectedId={selected?.id ?? null}
          onSelect={setSelectedId}
        />
        <Pagination
          currentPage={1}
          totalPages={Math.max(1, Math.ceil(viewModel.assets.length / 9))}
        />
      </div>
      <AssetDetailPanel
        asset={selected}
        usageHistory={viewModel.usageHistory}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// GalleryControls
// ---------------------------------------------------------------------------

function GalleryControls() {
  return (
    <div
      data-slot="gallery-controls"
      aria-label="画廊控制"
      className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground"
    >
      <div className="flex flex-wrap items-center gap-1">
        <span className="font-medium uppercase tracking-wide">视图</span>
        <button
          type="button"
          data-slot="gallery-view-grid"
          aria-pressed="true"
          className="rounded-control bg-brand-soft px-2 py-1 text-brand"
        >
          网格
        </button>
        <button
          type="button"
          data-slot="gallery-view-list"
          aria-pressed="false"
          className="rounded-control px-2 py-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          列表
        </button>
      </div>
      <div className="flex items-center gap-1">
        <span className="font-medium uppercase tracking-wide">排序</span>
        <select
          data-slot="gallery-sort"
          defaultValue="updated"
          aria-label="排序方式"
          className="h-7 rounded-control border border-border bg-surface px-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          <option value="updated">最近更新</option>
          <option value="name">名称</option>
          <option value="size">大小</option>
          <option value="type">类型</option>
        </select>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AssetCardGrid
// ---------------------------------------------------------------------------

interface AssetCardGridProps {
  readonly assets: ReadonlyArray<AssetSummary>;
  readonly selectedId: string | null;
  readonly onSelect: (assetId: string) => void;
}

function AssetCardGrid({ assets, selectedId, onSelect }: AssetCardGridProps) {
  return (
    <div
      data-slot="asset-card-grid"
      aria-label="素材卡片网格"
      className="grid grid-cols-1 gap-card-gap sm:grid-cols-2 lg:grid-cols-3"
    >
      {assets.map((asset) => (
        <AssetCard
          key={asset.id}
          asset={asset}
          selected={asset.id === selectedId}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// AssetCard
// ---------------------------------------------------------------------------

interface AssetCardProps {
  readonly asset: AssetSummary;
  readonly selected: boolean;
  readonly onSelect: (assetId: string) => void;
}

function AssetCard({ asset, selected, onSelect }: AssetCardProps) {
  return (
    <article
      data-slot="asset-card"
      data-asset-id={asset.id}
      data-asset-type={asset.type}
      aria-label={`素材 ${asset.name}`}
      className={
        "flex flex-col gap-1.5 rounded-card border bg-surface p-1.5 transition-colors hover:border-ring " +
        (selected
          ? "border-brand ring-2 ring-brand/40"
          : "border-border")
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
          <span className="truncate text-[13px] font-medium leading-tight text-foreground">
            {asset.name}
          </span>
          <span className="line-clamp-1 text-[11px] leading-tight text-muted-foreground">
            {asset.description}
          </span>
        </div>
        <div className="flex items-center justify-between px-0.5 pb-0.5 text-[10px] text-muted-foreground">
          <span className="font-mono tabular-nums">{asset.mimeType}</span>
          <span className="font-mono tabular-nums">
            {formatFileSize(asset.fileSizeBytes)}
          </span>
        </div>
      </button>
    </article>
  );
}

// ---------------------------------------------------------------------------
// MediaPreview
// ---------------------------------------------------------------------------
//
// page-specs §12: "视频、图片、音频和文档缩略方式需区分". We render a
// small composition that varies by `asset.type`. The `data-asset-type`
// and `data-asset-thumbnail-token` slots give tests a deterministic
// handle to assert against.

function MediaPreview({ asset }: { asset: AssetSummary }) {
  const token = asset.thumbnailToken;
  const aspect =
    asset.width && asset.height
      ? `${asset.width}×${asset.height}`
      : asset.durationMs
        ? formatDuration(asset.durationMs)
        : "—";
  return (
    <div
      data-slot="media-preview"
      data-asset-type={asset.type}
      data-asset-thumbnail-token={token}
      aria-hidden="true"
      className={
        "relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-control border " +
        previewContainerClass(asset.type)
      }
    >
      <PreviewGlyph type={asset.type} token={token} />
      <span className="absolute bottom-1 right-1 rounded bg-foreground/70 px-1 font-mono text-[10px] text-background">
        {aspect}
      </span>
      <span className="absolute bottom-1 left-1 rounded bg-foreground/70 px-1 font-mono text-[10px] text-background">
        {typeShortLabel(asset.type)}
      </span>
    </div>
  );
}

function previewContainerClass(type: AssetType): string {
  switch (type) {
    case "video":
      return "border-info/30 bg-info-soft text-info";
    case "image":
      return "border-brand/30 bg-brand-soft text-brand";
    case "audio":
      return "border-warning/30 bg-warning-soft text-warning";
    case "document":
      return "border-border bg-surface-subtle text-muted-foreground";
    case "subtitle":
      return "border-success/30 bg-success-soft text-success";
  }
}

function typeShortLabel(type: AssetType): string {
  switch (type) {
    case "video":
      return "VID";
    case "image":
      return "IMG";
    case "audio":
      return "AUD";
    case "document":
      return "DOC";
    case "subtitle":
      return "SRT";
  }
}

function PreviewGlyph({ type, token }: { type: AssetType; token: string }) {
  const digits = token
    .replace(/[^0-9a-f]/g, "")
    .slice(0, 4)
    .padEnd(4, "0");
  const parseHexPair = (value: string) =>
    Number.parseInt(value || "0", 16);
  if (type === "image") {
    return (
      <svg
        viewBox="0 0 60 36"
        width={72}
        height={44}
        className="text-current"
        aria-hidden="true"
      >
        <rect x={2} y={2} width={56} height={32} rx={3} fill="currentColor" opacity={0.25} />
        <circle cx={parseHexPair(digits.slice(0, 2)) % 56 + 2} cy={parseHexPair(digits.slice(2, 4)) % 28 + 4} r={5} fill="currentColor" />
        <path
          d="M2 34 L20 22 L34 30 L48 18 L58 28 L58 34 Z"
          fill="currentColor"
          opacity={0.5}
        />
      </svg>
    );
  }
  if (type === "video") {
    return (
      <svg
        viewBox="0 0 60 36"
        width={72}
        height={44}
        className="text-current"
        aria-hidden="true"
      >
        <rect x={2} y={2} width={56} height={32} rx={3} fill="currentColor" opacity={0.18} />
        <polygon
          points={`${(parseHexPair(digits.slice(0, 2)) % 12) + 18},${(parseHexPair(digits.slice(2, 4)) % 8) + 12} ${(parseHexPair(digits.slice(0, 2)) % 12) + 18},${(parseHexPair(digits.slice(2, 4)) % 8) + 24} ${(parseHexPair(digits.slice(0, 2)) % 12) + 32},18`}
          fill="currentColor"
        />
        <rect x={6} y={32} width={parseHexPair(digits.slice(2, 4)) % 48 + 4} height={2} fill="currentColor" opacity={0.6} />
      </svg>
    );
  }
  if (type === "audio") {
    const barHeights = [0, 1, 2, 3, 4].map(
      (i) => 4 + (parseHexPair(digits.charAt(i)) % 24),
    );
    return (
      <svg
        viewBox="0 0 60 36"
        width={72}
        height={44}
        className="text-current"
        aria-hidden="true"
      >
        {barHeights.map((h, i) => {
          const x = 6 + i * 12;
          const y = 18 - h / 2;
          return (
            <rect
              key={i}
              x={x}
              y={y}
              width={6}
              height={h}
              rx={1.5}
              fill="currentColor"
            />
          );
        })}
      </svg>
    );
  }
  if (type === "document") {
    return (
      <svg
        viewBox="0 0 60 36"
        width={72}
        height={44}
        className="text-current"
        aria-hidden="true"
      >
        <rect x={14} y={2} width={32} height={32} rx={2} fill="currentColor" opacity={0.2} />
        <rect x={18} y={8} width={24} height={2} fill="currentColor" opacity={0.7} />
        <rect x={18} y={14} width={parseHexPair(digits.slice(0, 2)) % 16 + 8} height={2} fill="currentColor" opacity={0.7} />
        <rect x={18} y={20} width={parseHexPair(digits.slice(2, 4)) % 18 + 6} height={2} fill="currentColor" opacity={0.7} />
        <rect x={18} y={26} width={parseHexPair(digits.slice(0, 2)) % 12 + 10} height={2} fill="currentColor" opacity={0.7} />
      </svg>
    );
  }
  // subtitle
  return (
    <svg
      viewBox="0 0 60 36"
      width={72}
      height={44}
      className="text-current"
      aria-hidden="true"
    >
      <rect x={4} y={10} width={52} height={16} rx={2} fill="currentColor" opacity={0.2} />
      <rect x={10} y={14} width={parseHexPair(digits.slice(0, 2)) % 28 + 12} height={2} fill="currentColor" />
      <rect x={10} y={20} width={parseHexPair(digits.slice(2, 4)) % 24 + 14} height={2} fill="currentColor" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// AssetDetailPanel
// ---------------------------------------------------------------------------
//
// page-specs §12: "右侧详情面板固定展示当前选中素材".
// page-specs §12: "不把详情面板改成弹窗".

function AssetDetailPanel({
  asset,
  usageHistory,
}: {
  asset: AssetSummary | null;
  usageHistory: ReadonlyArray<AssetUsageRow>;
}) {
  const usageForAsset = asset
    ? usageHistory.filter((row) => row.assetId === asset.id)
    : [];
  return (
    <aside
      data-slot="asset-detail-panel"
      data-asset-id={asset?.id ?? ""}
      aria-label="素材详情"
      className="flex h-fit flex-col gap-3 rounded-card border border-border bg-surface p-2.5"
    >
      {asset ? (
        <>
          <SectionCard
            title="预览"
            description={TYPE_LABEL[asset.type]}
            contentClassName="p-0"
          >
            <MediaPreview asset={asset} />
          </SectionCard>
          <SectionCard title="操作" description="管理此素材的使用方式">
            <div data-slot="asset-actions" className="flex flex-wrap gap-2">
              <button
                type="button"
                data-slot="asset-action-insert"
                className="inline-flex h-8 items-center rounded-control bg-brand px-3 text-xs font-medium text-brand-foreground hover:bg-brand/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              >
                插入到项目
              </button>
              <button
                type="button"
                data-slot="asset-action-download"
                className="inline-flex h-8 items-center rounded-control border border-border bg-surface px-3 text-xs text-foreground hover:bg-surface-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              >
                下载
              </button>
              <button
                type="button"
                data-slot="asset-action-rename"
                className="inline-flex h-8 items-center rounded-control border border-border bg-surface px-3 text-xs text-foreground hover:bg-surface-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              >
                重命名
              </button>
            </div>
          </SectionCard>
          <SectionCard title="元数据" description="文件基础信息">
            <dl
              data-slot="asset-metadata"
              className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted-foreground"
            >
              <dt>类型</dt>
              <dd className="text-foreground">{TYPE_LABEL[asset.type]}</dd>
              <dt>格式</dt>
              <dd className="font-mono tabular-nums text-foreground">
                {asset.mimeType}
              </dd>
              <dt>大小</dt>
              <dd className="font-mono tabular-nums text-foreground">
                {formatFileSize(asset.fileSizeBytes)}
              </dd>
              {asset.width !== null && asset.height !== null ? (
                <>
                  <dt>尺寸</dt>
                  <dd className="font-mono tabular-nums text-foreground">
                    {asset.width}×{asset.height}
                  </dd>
                </>
              ) : null}
              {asset.durationMs !== null ? (
                <>
                  <dt>时长</dt>
                  <dd className="font-mono tabular-nums text-foreground">
                    {formatDuration(asset.durationMs)}
                  </dd>
                </>
              ) : null}
              <dt>更新</dt>
              <dd className="font-mono tabular-nums text-foreground">
                {asset.updatedAt.slice(0, 10)}
              </dd>
            </dl>
          </SectionCard>
          <SectionCard title="标签" description="已附加到此素材的标签">
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
                <span className="text-xs text-muted-foreground">—</span>
              )}
            </div>
          </SectionCard>
          <SectionCard title="使用记录" description="此素材被引用的项目">
            <ul
              data-slot="asset-usage-history"
              className="flex flex-col gap-1 text-xs"
              aria-label="素材使用记录"
            >
              {usageForAsset.length > 0 ? (
                usageForAsset.map((row) => (
                  <li
                    key={row.id}
                    data-slot="asset-usage-row"
                    data-usage-id={row.id}
                    className="flex items-center justify-between rounded-control bg-surface-subtle px-2 py-1"
                  >
                    <span className="truncate text-foreground">
                      {row.projectTitle}
                    </span>
                    <span className="ml-2 shrink-0 font-mono tabular-nums text-muted-foreground">
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

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

function Pagination({
  currentPage,
  totalPages,
}: {
  readonly currentPage: number;
  readonly totalPages: number;
}) {
  if (totalPages <= 1) return null;
  return (
    <nav
      data-slot="pagination"
      aria-label="素材分页"
      className="flex items-center justify-center gap-1 pt-1 text-xs text-muted-foreground"
    >
      {Array.from({ length: totalPages }, (_, idx) => idx + 1).map((page) => {
        const isCurrent = page === currentPage;
        return (
          <button
            key={page}
            type="button"
            data-slot="pagination-page"
            data-page-current={isCurrent ? "true" : "false"}
            aria-current={isCurrent ? "page" : undefined}
            aria-label={`第 ${page} 页`}
            className={
              "inline-flex h-7 min-w-7 items-center justify-center rounded-full px-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 " +
              (isCurrent
                ? "bg-brand text-brand-foreground"
                : "text-muted-foreground hover:bg-surface-subtle hover:text-foreground")
            }
          >
            {page}
          </button>
        );
      })}
    </nav>
  );
}

// ---------------------------------------------------------------------------
// Formatting helpers (shared between cards + panel)
// ---------------------------------------------------------------------------

function formatFileSize(bytes: number): string {
  if (bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatDuration(durationMs: number): string {
  const totalSeconds = Math.round(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds} 秒`;
  return `${minutes} 分 ${seconds.toString().padStart(2, "0")} 秒`;
}
