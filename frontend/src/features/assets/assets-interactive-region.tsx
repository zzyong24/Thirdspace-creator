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
      className="grid grid-cols-1 gap-card-gap lg:grid-cols-[minmax(0,1fr)_312px]"
    >
      <div
        data-slot="asset-gallery"
        aria-label="素材画廊"
        className="flex flex-col gap-3"
      >
        <GalleryControls totalCount={viewModel.assets.length} />
        <AssetCardGrid
          assets={viewModel.assets}
          selectedId={selected?.id ?? null}
          onSelect={setSelectedId}
        />
        <Pagination currentPage={1} totalPages={215} />
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

function GalleryControls(_props: { totalCount: number }) {
  return (
    <div
      data-slot="gallery-controls"
      aria-label="画廊控制"
      className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground"
    >
      <div className="flex flex-wrap items-center gap-2 text-sm text-foreground">
        <span>
          共 <span data-slot="gallery-total-count" className="font-medium tabular-nums">12,846</span> 个素材
        </span>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <input
            type="checkbox"
            data-slot="gallery-select-all"
            aria-label="全选"
            className="size-3.5 rounded border-border text-brand focus:ring-ring/40"
          />
          全部
        </label>
      </div>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1" data-slot="gallery-view-toggle" role="group" aria-label="视图切换">
          <button
            type="button"
            data-slot="gallery-view-grid"
            aria-pressed="true"
            className="inline-flex h-7 w-7 items-center justify-center rounded-control bg-brand-soft text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            aria-label="网格视图"
          >
            <svg viewBox="0 0 16 16" className="size-3.5" aria-hidden="true" fill="currentColor">
              <rect x={2} y={2} width={5} height={5} rx={1} />
              <rect x={9} y={2} width={5} height={5} rx={1} />
              <rect x={2} y={9} width={5} height={5} rx={1} />
              <rect x={9} y={9} width={5} height={5} rx={1} />
            </svg>
          </button>
          <button
            type="button"
            data-slot="gallery-view-list"
            aria-pressed="false"
            className="inline-flex h-7 w-7 items-center justify-center rounded-control text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            aria-label="列表视图"
          >
            <svg viewBox="0 0 16 16" className="size-3.5" aria-hidden="true" fill="currentColor">
              <rect x={2} y={3} width={12} height={2} rx={1} />
              <rect x={2} y={7} width={12} height={2} rx={1} />
              <rect x={2} y={11} width={12} height={2} rx={1} />
            </svg>
          </button>
        </div>
        <div className="flex items-center gap-1">
          <select
            data-slot="gallery-sort"
            defaultValue="updated"
            aria-label="排序方式"
            className="h-7 rounded-control border border-border bg-surface px-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <option value="updated">最新上传</option>
            <option value="name">名称</option>
            <option value="size">大小</option>
            <option value="type">类型</option>
          </select>
        </div>
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
        "flex flex-col gap-1 overflow-hidden rounded-card border bg-surface p-1 transition-colors hover:border-ring " +
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
          <span className="truncate text-[11px] leading-tight text-muted-foreground">
            {cardSubtitle(asset)}
          </span>
        </div>
      </button>
    </article>
  );
}

function cardSubtitle(asset: AssetSummary): string {
  const date = asset.updatedAt.slice(0, 10);
  const size = formatFileSize(asset.fileSizeBytes);
  return `${date} · ${asset.mimeType} · ${size}`;
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
  return (
    <div
      data-slot="media-preview"
      data-asset-type={asset.type}
      data-asset-thumbnail-token={token}
      aria-hidden="true"
      className={
        "relative aspect-[3/2] w-full overflow-hidden rounded-control border " +
        previewContainerClass(asset.type)
      }
    >
      <PreviewGlyph type={asset.type} token={token} name={asset.name} />
      {asset.durationMs !== null ? (
        <span className="absolute bottom-1.5 right-1.5 rounded bg-foreground/70 px-1.5 font-mono text-[10px] tabular-nums text-background">
          {formatDuration(asset.durationMs)}
        </span>
      ) : asset.width !== null && asset.height !== null ? (
        <span className="absolute bottom-1.5 right-1.5 rounded bg-foreground/70 px-1.5 font-mono text-[10px] tabular-nums text-background">
          {asset.width}×{asset.height}
        </span>
      ) : null}
      {asset.type === "video" ? (
        <span
          aria-hidden="true"
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex size-9 items-center justify-center rounded-full bg-foreground/80 text-background shadow-sm"
        >
          <svg viewBox="0 0 16 16" className="size-4" fill="currentColor">
            <path d="M5 3.5 L13 8 L5 12.5 Z" />
          </svg>
        </span>
      ) : null}
    </div>
  );
}

function previewContainerClass(type: AssetType): string {
  switch (type) {
    case "video":
      return "border-border bg-gradient-to-br from-info/20 via-info/10 to-surface-subtle text-info";
    case "image":
      return "border-border bg-gradient-to-br from-brand/20 via-brand/10 to-surface-subtle text-brand";
    case "audio":
      return "border-border bg-gradient-to-br from-warning/20 via-warning/10 to-surface-subtle text-warning";
    case "document":
      return "border-border bg-gradient-to-br from-muted via-surface-subtle to-surface text-muted-foreground";
    case "subtitle":
      return "border-border bg-gradient-to-br from-success/20 via-success/10 to-surface-subtle text-success";
  }
}

function PreviewGlyph({ type, token, name }: { type: AssetType; token: string; name: string }) {
  const digits = token
    .replace(/[^0-9a-f]/g, "")
    .slice(0, 4)
    .padEnd(4, "0");
  const parseHexPair = (value: string) =>
    Number.parseInt(value || "0", 16);
  // Each thumbnail is a full-bleed composition that varies by type. No
  // fixed pixel size — the SVG fills the parent (aspect-video) so the
  // reference image proportions match the page (1.6:1 wide cards).
  if (type === "image") {
    return (
      <svg
        viewBox="0 0 160 90"
        preserveAspectRatio="xMidYMid slice"
        className="size-full text-current"
        aria-hidden="true"
      >
        <rect x={0} y={0} width={160} height={90} fill="currentColor" opacity={0.18} />
        <circle cx={parseHexPair(digits.slice(0, 2)) % 140 + 10} cy={parseHexPair(digits.slice(2, 4)) % 70 + 10} r={10} fill="currentColor" />
        <path
          d="M0 78 L40 60 L70 70 L100 50 L130 65 L160 55 L160 90 L0 90 Z"
          fill="currentColor"
          opacity={0.55}
        />
        <path
          d="M0 90 L30 82 L60 86 L90 78 L120 84 L160 80 L160 90 Z"
          fill="currentColor"
          opacity={0.8}
        />
      </svg>
    );
  }
  if (type === "video") {
    return (
      <svg
        viewBox="0 0 160 90"
        preserveAspectRatio="xMidYMid slice"
        className="size-full text-current"
        aria-hidden="true"
      >
        <rect x={0} y={0} width={160} height={90} fill="currentColor" opacity={0.22} />
        <rect x={6} y={10} width={148} height={70} rx={3} fill="currentColor" opacity={0.1} />
        <rect x={6} y={10} width={148} height={70} rx={3} stroke="currentColor" strokeWidth={1} fill="none" opacity={0.4} />
        <text
          x={80}
          y={50}
          textAnchor="middle"
          fontFamily="ui-sans-serif, system-ui, sans-serif"
          fontSize={11}
          fontWeight={600}
          fill="currentColor"
          opacity={0.9}
        >
          {name.length > 16 ? `${name.slice(0, 15)}…` : name}
        </text>
        <rect x={6} y={82} width={(parseHexPair(digits.slice(0, 2)) % 100) + 30} height={2} fill="currentColor" opacity={0.7} />
      </svg>
    );
  }
  if (type === "audio") {
    const barHeights = Array.from({ length: 26 }, (_, i) =>
      8 + (parseHexPair(digits.charAt(i % digits.length)) % 56),
    );
    return (
      <svg
        viewBox="0 0 160 90"
        preserveAspectRatio="xMidYMid slice"
        className="size-full text-current"
        aria-hidden="true"
      >
        <rect x={0} y={0} width={160} height={90} fill="currentColor" opacity={0.2} />
        {barHeights.map((h, i) => {
          const x = 8 + i * 5.6;
          const y = 45 - h / 2;
          return (
            <rect
              key={i}
              x={x}
              y={y}
              width={3.6}
              height={h}
              rx={1.2}
              fill="currentColor"
              opacity={0.7 + (i % 3) * 0.1}
            />
          );
        })}
      </svg>
    );
  }
  if (type === "document") {
    return (
      <svg
        viewBox="0 0 160 90"
        preserveAspectRatio="xMidYMid slice"
        className="size-full text-current"
        aria-hidden="true"
      >
        <rect x={0} y={0} width={160} height={90} fill="currentColor" opacity={0.08} />
        <rect x={40} y={6} width={80} height={78} rx={4} fill="currentColor" opacity={0.22} />
        <rect x={50} y={20} width={60} height={4} fill="currentColor" opacity={0.7} />
        <rect x={50} y={32} width={parseHexPair(digits.slice(0, 2)) % 40 + 20} height={4} fill="currentColor" opacity={0.7} />
        <rect x={50} y={44} width={parseHexPair(digits.slice(2, 4)) % 44 + 16} height={4} fill="currentColor" opacity={0.7} />
        <rect x={50} y={56} width={parseHexPair(digits.slice(0, 2)) % 36 + 24} height={4} fill="currentColor" opacity={0.7} />
        <rect x={50} y={68} width={parseHexPair(digits.slice(2, 4)) % 30 + 12} height={4} fill="currentColor" opacity={0.7} />
      </svg>
    );
  }
  // subtitle
  return (
    <svg
      viewBox="0 0 160 90"
      preserveAspectRatio="xMidYMid slice"
      className="size-full text-current"
      aria-hidden="true"
    >
      <rect x={0} y={0} width={160} height={90} fill="currentColor" opacity={0.16} />
      <rect x={12} y={28} width={136} height={36} rx={3} fill="currentColor" opacity={0.2} />
      <rect x={28} y={36} width={parseHexPair(digits.slice(0, 2)) % 60 + 30} height={4} fill="currentColor" />
      <rect x={28} y={48} width={parseHexPair(digits.slice(2, 4)) % 60 + 30} height={4} fill="currentColor" />
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
  // Render only the first 4 pages, an ellipsis, and the last page so the
  // nav stays compact even when `totalPages` is large.
  const visible: Array<number | "ellipsis"> = [1, 2, 3, 4];
  if (totalPages > 6) {
    visible.push("ellipsis");
    visible.push(totalPages);
  } else {
    for (let p = 5; p <= totalPages; p += 1) visible.push(p);
  }
  return (
    <div
      data-slot="pagination-row"
      className="flex items-center justify-between gap-2 pt-1 text-xs text-muted-foreground"
    >
      <nav
        data-slot="pagination"
        aria-label="素材分页"
        className="flex items-center justify-center gap-1 text-xs"
      >
        {visible.map((entry, idx) => {
          if (entry === "ellipsis") {
            return (
              <span
                key={`ellipsis-${idx}`}
                aria-hidden="true"
                className="px-1 text-muted-foreground"
              >
                …
              </span>
            );
          }
          const isCurrent = entry === currentPage;
          return (
            <button
              key={entry}
              type="button"
              data-slot="pagination-page"
              data-page-current={isCurrent ? "true" : "false"}
              aria-current={isCurrent ? "page" : undefined}
              aria-label={`第 ${entry} 页`}
              className={
                "inline-flex h-7 min-w-7 items-center justify-center rounded-full px-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 " +
                (isCurrent
                  ? "bg-brand text-brand-foreground"
                  : "text-muted-foreground hover:bg-surface-subtle hover:text-foreground")
              }
            >
              {entry}
            </button>
          );
        })}
        <button
          type="button"
          data-slot="pagination-next"
          aria-label="下一页"
          className="ml-1 inline-flex h-7 min-w-7 items-center justify-center rounded-full px-2 text-muted-foreground hover:bg-surface-subtle hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          ›
        </button>
      </nav>
      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span>每页</span>
        <select
          data-slot="pagination-page-size"
          defaultValue="60"
          aria-label="每页条数"
          className="h-7 rounded-control border border-border bg-surface px-1.5 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          <option value="12">12 条/页</option>
          <option value="24">24 条/页</option>
          <option value="48">48 条/页</option>
          <option value="60">60 条/页</option>
          <option value="120">120 条/页</option>
        </select>
      </label>
    </div>
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
