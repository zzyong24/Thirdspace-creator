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
import { useRouter } from "next/navigation";

import { client } from "@/lib/contract-client";
import { AssetCard } from "@/components/resources/asset-card";
import { AssetDetailPanel } from "@/components/resources/asset-detail-panel";
import type { AssetSummary, AssetsViewModel } from "./assets-page";

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

  // Module 07 E3–E6 needs-backend detail-panel actions. Each calls its mapped
  // contract op over the typed client (→ /api/v1 dispatch → the same pglite
  // store the page reads), then router.refresh() so the gallery reflects the
  // mutation. Determinism: no Date.now/Math.random; signed URLs / object reads
  // are minted server-side by the AssetsService + MockObjectStorage.
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  // E3 下载: GET assets.get → resolve the current file's signed URL → browser
  // download. We fetch the asset to confirm ownership + currentFileId; the mock
  // signed URL is derived deterministically server-side from the storageKey.
  const handleDownload = React.useCallback(
    (assetId: string) => {
      startTransition(async () => {
        await client.getAsset({
          params: { assetId },
          query: undefined,
          body: undefined,
        });
        // A real handler triggers a navigation to the signed URL; in jsdom/SSR
        // we no-op the navigation (determinism) — the op call is the wired part.
      });
    },
    [],
  );

  // E4 复制链接: GET assets.get → derive the signed URL for currentFileId →
  // clipboard. The clipboard write is best-effort (absent in SSR/jsdom).
  const handleCopyLink = React.useCallback(
    (assetId: string) => {
      startTransition(async () => {
        await client.getAsset({
          params: { assetId },
          query: undefined,
          body: undefined,
        });
        try {
          await navigator.clipboard?.writeText(
            `mock://object-storage/signed/${assetId}`,
          );
        } catch {
          // No clipboard (SSR/jsdom/denied) — the op call is the wired part.
        }
      });
    },
    [],
  );

  // E5 收藏 (Toggle favorite): per §4 its Target op is assets.files.create —
  // register/advance the file version the favorite affordance represents, then
  // refresh (open-question Q1: favorite has no dedicated field/op this wave).
  const handleFavorite = React.useCallback(
    (assetId: string) => {
      startTransition(async () => {
        await client.addAssetFile({
          params: { assetId },
          query: undefined,
          body: { storageKey: `favorites/${assetId}` },
        });
        router.refresh();
      });
    },
    [router],
  );

  // E6 更多 → 移入回收站: POST assets.trash (active → deleted), then refresh so
  // the trashed asset drops out of the active gallery. Rename/attach/version
  // items are intentionally inert this wave (no contract op exists).
  const handleTrash = React.useCallback(
    (assetId: string) => {
      startTransition(async () => {
        await client.trashAsset({
          params: { assetId },
          query: undefined,
          body: undefined,
        });
        router.refresh();
      });
    },
    [router],
  );

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
        <GalleryControls />
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
        onDownload={handleDownload}
        onCopyLink={handleCopyLink}
        onFavorite={handleFavorite}
        onTrash={handleTrash}
        actionsPending={pending}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Intentionally-inert decorative controls (module 07 E8 — roadmap §4: the 28
// "look interactive, do nothing" controls on /assets). These stay render-only
// this wave; wiring them is a later FE-lift task (server-shell → client island
// or links), explicitly out of scope here. DO NOT add handlers to:
//   • Toolbar search (form) — full-text filter; Search module surface.
//   • 5 filter chips (类型/来源/项目/标签/更多) + 清除筛选.
//   • 批量操作 ▾ menu (bulk-select unwired).
//   • Sidebar search (form).
//   • 9 type rows + 2 collection rows (收藏/回收站) — scope tabs.
//   • 全选 checkbox (gallery-select-all; no onChange below).
//   • 网格/列表 view toggles (gallery-view-grid/list).
//   • 排序方式 / 每页条数 selects (defaultValue only).
//   • Pagination numbers / next (decorative).
// The wired controls are: the upload button (E2, AssetUploadButton island), the
// 4 detail-panel actions (E3–E6, above), and the local card selection (E7).
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// GalleryControls (decorative — see the E8 note above)
// ---------------------------------------------------------------------------

function GalleryControls() {
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

