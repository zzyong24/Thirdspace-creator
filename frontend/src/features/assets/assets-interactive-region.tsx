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

// A project the user can attach an asset to (用料链 consumption from the library).
export interface ProjectOption {
  readonly id: string;
  readonly title: string;
}

// Plan D1: the derived gallery the page hands to the island — filtered + paged
// REAL `assets.list` rows, real paging meta, and the projects picker source.
export interface GalleryProps {
  readonly assets: ReadonlyArray<AssetSummary>;
  readonly totalCount: number;
  readonly currentPage: number;
  readonly pageSize: number;
  readonly totalPages: number;
  readonly activeType: string | null;
  readonly query: string;
  readonly projects: ReadonlyArray<ProjectOption>;
}

// ---------------------------------------------------------------------------
// AssetsInteractiveRegion
// ---------------------------------------------------------------------------

interface AssetsInteractiveRegionProps {
  readonly viewModel: AssetsViewModel;
  // Optional so the unit test (which passes only `viewModel`) keeps rendering
  // the full fixture list, page 1, no filter — its DOM-shape assertions hold.
  readonly gallery?: GalleryProps;
}

export function AssetsInteractiveRegion({
  viewModel,
  gallery,
}: AssetsInteractiveRegionProps) {
  // When the page supplies a derived gallery, render its filtered+paged rows;
  // otherwise (tests) fall back to the whole view-model list.
  const galleryAssets = gallery?.assets ?? viewModel.assets;
  const [selectedId, setSelectedId] = React.useState<string | null>(
    galleryAssets[0]?.id ?? null,
  );
  const selected =
    galleryAssets.find((asset) => asset.id === selectedId) ??
    galleryAssets[0] ??
    null;

  // Module 07 E3–E6 needs-backend detail-panel actions. Each calls its mapped
  // contract op over the typed client (→ /api/v1 dispatch → the same pglite
  // store the page reads), then router.refresh() so the gallery reflects the
  // mutation. Determinism: no Date.now/Math.random; signed URLs / object reads
  // are minted server-side by the AssetsService + MockObjectStorage.
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  // GAP-AST-1: an honest aria-live status line. Download / 复制链接 / 收藏 are
  // 规划中 (real object storage + a 收藏 field have no op this wave), so instead
  // of pretending a file was downloaded / a public link copied / a favorite
  // saved, the handler announces the 规划中 state. The detail-panel buttons keep
  // a 规划中 badge once that prop lands (followUp — the panel is a shared
  // component outside this lane).
  const [actionStatus, setActionStatus] = React.useState<string>("");

  // E3 下载: GET assets.get confirms ownership + currentFileId, but the real
  // signed URL points at `mock://object-storage` (no byte store this wave). We
  // do NOT fabricate a download — the op call is the wired part, and the status
  // line is honest that byte download is 规划中.
  const handleDownload = React.useCallback(
    (assetId: string) => {
      startTransition(async () => {
        await client.getAsset({
          params: { assetId },
          query: undefined,
          body: undefined,
        });
        setActionStatus("文件字节下载规划中：已登记素材信息，暂未连接真实对象存储。");
      });
    },
    [],
  );

  // E4 复制链接: GET assets.get derives a `mock://` signed URL (no real object
  // storage this wave). Best-effort clipboard write of the mock URL, but the
  // status line is honest that it is a placeholder link (规划中).
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
        setActionStatus("公开链接规划中：已复制占位链接，真实对象存储签名链接尚未接入。");
      });
    },
    [],
  );

  // E5 收藏 (Toggle favorite): 规划中. There is NO 收藏 field/op this wave — the
  // earlier `assets.files.create { storageKey: favorites/... }` was a misleading
  // hack (it advanced the asset's file version, not a favorite), so it is
  // removed. The status line is honest that 收藏 is not yet persisted.
  const handleFavorite = React.useCallback(
    (_assetId: string) => {
      setActionStatus("收藏规划中：暂无收藏字段，此操作尚未持久化。");
    },
    [],
  );

  // E6 更多 → 移入回收站: POST assets.trash (active → deleted), then refresh so
  // the trashed asset drops out of the active gallery.
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

  // Plan D1 附到项目: the 用料链 consumption from the library side. POST
  // materialLinks.create { projectId, entityType:"asset", entityId, role, stage }
  // then refresh so any usage-derived rows reflect the new link.
  const handleAttach = React.useCallback(
    (assetId: string, projectId: string) => {
      startTransition(async () => {
        await client.createMaterialLink({
          params: undefined,
          query: undefined,
          body: {
            projectId,
            entityType: "asset",
            entityId: assetId,
            role: "clip",
            stage: "production",
          },
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
        <GalleryHeader
          totalCount={gallery?.totalCount ?? galleryAssets.length}
        />
        <AssetCardGrid
          assets={galleryAssets}
          selectedId={selected?.id ?? null}
          onSelect={setSelectedId}
        />
        {gallery ? (
          <Pagination
            currentPage={gallery.currentPage}
            totalPages={gallery.totalPages}
            pageSize={gallery.pageSize}
            activeType={gallery.activeType}
            query={gallery.query}
          />
        ) : null}
      </div>
      <div className="flex flex-col gap-2">
        <AssetDetailPanel
          asset={selected}
          usageHistory={viewModel.usageHistory}
          onDownload={handleDownload}
          onCopyLink={handleCopyLink}
          onFavorite={handleFavorite}
          onTrash={handleTrash}
          projects={gallery?.projects ?? []}
          onAttach={handleAttach}
          actionsPending={pending}
        />
        {/* GAP-AST-1: honest 规划中 status for download / 复制链接 / 收藏 — we never
            claim a byte download / real public link / saved favorite succeeded. */}
        <p
          data-slot="asset-action-status"
          role="status"
          aria-live="polite"
          className={
            "px-2 text-[11px] text-muted-foreground " +
            (actionStatus ? "" : "sr-only")
          }
        >
          {actionStatus}
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Plan D1 cleanup — removed decorative controls that had no real backing:
//   • 5 toolbar filter chips (类型/来源/项目/标签/更多) + 清除筛选 → no `assets.list`
//     param backs them. Real type filtering is the type sidebar (`?type=`).
//   • 批量操作 ▾ menu (no bulk op exists).
//   • Sidebar duplicate search field.
//   • 全选 checkbox, 网格/列表 view toggle, 排序方式 select → no backing op.
//   • The fabricated "共 12,846 个素材" count → now the REAL filtered count.
// Wired controls: toolbar search (`?q=`), type sidebar (`?type=`), real
// pagination (`?page=`/`?pageSize=`), upload (real file input), the 4 detail
// actions, card selection, and 附到项目 (materialLinks.create).
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// GalleryHeader — the REAL result count (no fabricated number)
// ---------------------------------------------------------------------------

function GalleryHeader({ totalCount }: { readonly totalCount: number }) {
  return (
    <div
      data-slot="gallery-controls"
      aria-label="画廊控制"
      className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground"
    >
      <span className="text-sm text-foreground">
        共{" "}
        <span
          data-slot="gallery-total-count"
          className="font-medium tabular-nums"
        >
          {totalCount.toLocaleString("en-US")}
        </span>{" "}
        个素材
      </span>
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
// Pagination — Plan D1: REAL `assets.list` paging via the URL `?page=`/`?pageSize=`
// query. Each control navigates `/assets?...`, the Server Component re-reads the
// list at the new page, and the gallery re-renders.
// ---------------------------------------------------------------------------

function buildAssetsHref(params: {
  page: number;
  pageSize: number;
  activeType: string | null;
  query: string;
}): string {
  const sp = new URLSearchParams();
  if (params.activeType !== null) sp.set("type", params.activeType);
  if (params.query.trim().length > 0) sp.set("q", params.query.trim());
  if (params.page > 1) sp.set("page", String(params.page));
  sp.set("pageSize", String(params.pageSize));
  const qs = sp.toString();
  return qs.length > 0 ? `/assets?${qs}` : "/assets";
}

const PAGE_SIZE_OPTIONS = [12, 24, 48, 60, 100] as const;

function Pagination({
  currentPage,
  totalPages,
  pageSize,
  activeType,
  query,
}: {
  readonly currentPage: number;
  readonly totalPages: number;
  readonly pageSize: number;
  readonly activeType: string | null;
  readonly query: string;
}) {
  const router = useRouter();
  const go = React.useCallback(
    (page: number, nextPageSize: number) => {
      const clamped = Math.min(Math.max(1, page), Math.max(1, totalPages));
      router.push(
        buildAssetsHref({
          page: clamped,
          pageSize: nextPageSize,
          activeType,
          query,
        }),
      );
    },
    [router, totalPages, activeType, query],
  );

  // Render the first 4 pages, an ellipsis, and the last page so the nav stays
  // compact even when `totalPages` is large.
  const visible: Array<number | "ellipsis"> = [];
  const head = Math.min(4, totalPages);
  for (let p = 1; p <= head; p += 1) visible.push(p);
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
              onClick={() => go(entry, pageSize)}
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
          disabled={currentPage >= totalPages}
          onClick={() => go(currentPage + 1, pageSize)}
          className="ml-1 inline-flex h-7 min-w-7 items-center justify-center rounded-full px-2 text-muted-foreground hover:bg-surface-subtle hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-40"
        >
          ›
        </button>
      </nav>
      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span>每页</span>
        <select
          data-slot="pagination-page-size"
          value={String(pageSize)}
          aria-label="每页条数"
          onChange={(e) => go(1, Number(e.target.value))}
          className="h-7 rounded-control border border-border bg-surface px-1.5 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          {PAGE_SIZE_OPTIONS.map((size) => (
            <option key={size} value={size}>
              {size} 条/页
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

