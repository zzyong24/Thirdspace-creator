/**
 * Assets Center page (Task 20 / page-specs §12).
 *
 * The `/assets` global resource-center landing page. Composes, in spec
 * order (page-specs §12 "组件树"):
 *
 *   AssetsPage
 *   ├── AssetToolbar           (search + filter + upload affordances)
 *   ├── assets-page-body
 *   │   ├── assets-left-rail
 *   │   │   ├── AssetTypeSidebar   (page-internal; distinct `data-slot`
 *   │   │   │                       from the global Sidebar — page-specs §12
 *   │   │   │                       invariant: "页面内部存在素材类型窄栏，
 *   │   │   │                       不可与全局 Sidebar 混淆")
 *   │   │   └── StorageUsageCard   (page-internal; sits at the bottom
 *   │   │                            of the in-page left rail — matches
 *   │   │                            reference "左下保留存储空间卡")
 *   │   └── AssetsInteractiveRegion
 *   │       ├── AssetGallery       (GalleryControls + AssetCardGrid +
 *   │       │                       Pagination — three-column grid)
 *   │       └── AssetDetailPanel   (MediaPreview + AssetActions +
 *   │                               AssetMetadata + Tags + UsageHistory;
 *   │                               fixed right-rail — NOT a dialog/modal
 *   │                               per page-specs §12 "禁止改变")
 *
 * The page is a Server Component (page-specs §12 + D-003 default).
 * Selection of the currently-active asset requires local UI state, so
 * a single Client island (`AssetsInteractiveRegion` in
 * `./assets-interactive-region.tsx`) hosts the card grid AND the
 * detail panel. The toolbar + type sidebar + storage card are pure
 * Server Components.
 *
 * Layout invariants (page-specs §12 + D-003):
 *  - Header region is in `global` mode with page title "素材中心"
 *    (configured by `(creator)/shell-router.tsx`).
 *  - The shared Sidebar uses the approved `storage` contextual-card
 *    variant (D-003). The page itself does NOT render the global
 *    Sidebar — that lives in `(creator)/layout.tsx`.
 *  - The AssetTypeSidebar is page-internal; it is rendered INSIDE the
 *    page content region with a distinct `data-slot` ("asset-type-
 *    sidebar") so it can never be confused with the global Sidebar
 *    ("app-sidebar").
 *  - The AssetGallery is a three-column grid (page-specs §12:
 *    "中央保持三列素材卡网格").
 *  - The AssetDetailPanel is mounted as a fixed right-rail — never as
 *    a dialog/modal (page-specs §12: "不把详情面板改成弹窗").
 *  - Media thumbnails are deterministic per asset type — video,
 *    image, audio, and document each render a distinct, reproducible
 *    thumbnail token. No `Date.now`/`Math.random` is used.
 *  - There is no folder-tree / folder-hierarchy navigation
 *    (page-specs §12 "禁止改变": "不增加文件夹层级导航").
 */

import * as React from "react";

import { SectionCard } from "@/components/project/section-card";
import { ProgressBar } from "@/components/project/progress-bar";
import {
  buildAssetsViewModel,
  buildAssetSummariesFromResources,
  type AssetListRow,
} from "@/fixtures/selectors";
import { client } from "@/lib/contract-client.server";
import type { AssetType } from "@/types/domain";
import { AssetsInteractiveRegion } from "./assets-interactive-region";
import { AssetUploadButton } from "./asset-upload-button";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface AssetsPageProps {
  /**
   * Override hook for tests; defaults to the canonical dataset. The
   * page does not consume network or runtime data — it pulls everything
   * from the fixed fixtures (D-010) so SSR output is deterministic.
   */
  readonly viewModel?: AssetsViewModel;
}

export interface AssetsViewModel {
  readonly assets: ReadonlyArray<AssetSummary>;
  readonly typeCounts: ReadonlyArray<AssetTypeCount>;
  readonly usageHistory: ReadonlyArray<AssetUsageRow>;
  readonly storage: StorageUsage;
}

export interface AssetSummary {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly type: AssetType;
  readonly mimeType: string;
  readonly fileSizeBytes: number;
  readonly width: number | null;
  readonly height: number | null;
  readonly durationMs: number | null;
  readonly tags: ReadonlyArray<string>;
  readonly thumbnailToken: string;
  readonly updatedAt: string;
}

export interface AssetTypeCount {
  readonly type: AssetType;
  readonly label: string;
  readonly count: number;
  readonly tone: "neutral" | "brand" | "success" | "warning" | "info";
}

export interface AssetUsageRow {
  readonly id: string;
  readonly assetId: string;
  readonly projectTitle: string;
  readonly note: string;
  readonly dateLabel: string;
}

export interface StorageUsage {
  readonly usedBytes: number;
  readonly totalBytes: number;
  readonly usedLabel: string;
  readonly totalLabel: string;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export async function AssetsPage({ viewModel }: AssetsPageProps = {}) {
  // Module 07 E1: the gallery `assets` now come from the REAL `assets.list` op
  // (pglite, user-scoped, active-only) instead of the fixture-derived list. The
  // rest of the VM (typeCounts / usageHistory / storage) stays selector-derived
  // this wave (those rows are decorative or Production/Settings-owned). The
  // `viewModel?` prop remains the test-override seam: when provided, no network
  // read happens (SSR stays deterministic, F4).
  let vm: AssetsViewModel;
  if (viewModel === undefined) {
    const base = buildAssetsViewModel();
    const rows = (await client.listAssets({
      params: undefined,
      query: { page: 1, pageSize: 200 },
      body: undefined,
    })) as unknown as ReadonlyArray<AssetListRow>;
    vm = { ...base, assets: buildAssetSummariesFromResources(rows) };
  } else {
    vm = viewModel;
  }
  return (
    <main
      data-app="creatoros"
      data-page="assets"
      data-assets-id="assets-root"
      className="flex flex-col gap-3"
    >
      <AssetToolbar />
      <div
        data-slot="assets-page-body"
        className="grid grid-cols-1 gap-card-gap lg:grid-cols-[216px_minmax(0,1fr)]"
      >
        <div
          data-slot="assets-left-rail"
          className="flex flex-col gap-card-gap"
        >
          <AssetTypeSidebar />
          <StorageUsageCard storage={vm.storage} />
        </div>
        <AssetsInteractiveRegion viewModel={vm} />
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------
// AssetToolbar — search + filter affordances pinned at the top
// ---------------------------------------------------------------------------

function AssetToolbar() {
  const filters: ReadonlyArray<{ id: string; label: string; value: string }> = [
    { id: "type", label: "全部类型", value: "all" },
    { id: "source", label: "全部来源", value: "all" },
    { id: "project", label: "全部项目", value: "all" },
    { id: "tag", label: "全部标签", value: "all" },
    { id: "more", label: "更多筛选", value: "all" },
  ];
  return (
    <div
      data-slot="asset-toolbar"
      aria-label="素材中心工具栏"
      className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3"
    >
      <div
        data-slot="assets-toolbar-filters"
        className="flex flex-wrap items-center gap-2"
      >
        <label className="sr-only" htmlFor="assets-search">
          搜索素材
        </label>
        <div
          data-slot="search-field"
          className="flex h-8 w-72 items-center gap-2 rounded-control border border-border bg-surface px-2.5 text-sm"
        >
          <span aria-hidden="true" className="text-muted-foreground text-xs">
            🔎
          </span>
          <input
            id="assets-search"
            type="search"
            placeholder="搜索素材名称、标签、描述、项目..."
            data-slot="assets-search-input"
            className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
        </div>
        {filters.map((filter) => (
          <button
            key={filter.id}
            type="button"
            data-slot={`assets-filter-${filter.id}`}
            aria-label={filter.label}
            className="inline-flex h-8 items-center gap-1.5 rounded-control border border-border bg-surface px-2.5 text-xs text-foreground hover:bg-surface-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <span>{filter.label}</span>
            <span aria-hidden="true" className="text-[10px] text-muted-foreground">
              ▾
            </span>
          </button>
        ))}
        <button
          type="button"
          data-slot="assets-filter-clear"
          aria-label="清除筛选"
          className="inline-flex h-8 w-8 items-center justify-center rounded-control border border-border bg-surface text-xs text-foreground hover:bg-surface-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          <span aria-hidden="true">⌧</span>
        </button>
      </div>
      <div
        data-slot="assets-toolbar-actions"
        className="flex flex-wrap items-center gap-2"
      >
        <button
          type="button"
          data-slot="assets-batch-button"
          aria-label="批量操作"
          className="inline-flex h-8 items-center gap-1.5 rounded-control border border-border bg-surface px-2.5 text-xs text-foreground hover:bg-surface-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          <span>批量操作</span>
          <span aria-hidden="true" className="text-[10px] text-muted-foreground">
            ▾
          </span>
        </button>
        <AssetUploadButton />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AssetTypeSidebar — page-internal; DISTINCT from the global Sidebar
// ---------------------------------------------------------------------------

interface AssetTypeSidebarEntry {
  readonly id: string;
  readonly label: string;
  readonly count: number;
  readonly icon: "all" | "video" | "image" | "audio" | "document" | "cover" | "broll" | "screenshot" | "screen-recording" | "favorites" | "trash";
  readonly active?: boolean;
}

function AssetTypeSidebar() {
  // The reference mockup shows 9 display categories with curated counts;
  // we keep them deterministic (no `Math.random`/fixture lookup) so the
  // sidebar visual is stable across renders and matches the Controller
  // reference proportions.
  const entries: ReadonlyArray<AssetTypeSidebarEntry> = [
    { id: "all", label: "全部素材", count: 12846, icon: "all", active: true },
    { id: "video", label: "视频", count: 3245, icon: "video" },
    { id: "image", label: "图片", count: 4732, icon: "image" },
    { id: "audio", label: "音频", count: 1287, icon: "audio" },
    { id: "screenshot", label: "截图", count: 1856, icon: "screenshot" },
    { id: "screen-recording", label: "录屏", count: 642, icon: "screen-recording" },
    { id: "document", label: "文档", count: 498, icon: "document" },
    { id: "cover", label: "封面", count: 326, icon: "cover" },
    { id: "broll", label: "B-roll", count: 260, icon: "broll" },
  ];
  const collections: ReadonlyArray<AssetTypeSidebarEntry> = [
    { id: "favorites", label: "我的收藏", count: 156, icon: "favorites" },
    { id: "trash", label: "回收站", count: 32, icon: "trash" },
  ];
  return (
    <aside
      data-slot="asset-type-sidebar"
      aria-label="素材类型"
      className="flex h-fit flex-col gap-3 rounded-card border border-border bg-surface p-2.5"
    >
      <div
        data-slot="asset-search-field"
        className="flex h-8 w-full items-center gap-2 rounded-control border border-border bg-surface-subtle px-2.5 text-xs"
      >
        <span aria-hidden="true" className="text-muted-foreground text-xs">
          🔎
        </span>
        <input
          type="search"
          placeholder="搜索素材名称、标签、描述、项目..."
          aria-label="搜索素材"
          data-slot="asset-type-search"
          className="w-full bg-transparent text-xs text-foreground placeholder:text-muted-foreground focus:outline-none"
        />
      </div>
      <section data-slot="asset-filter-type" className="flex flex-col gap-1">
        <h2 className="px-2 py-1 text-[13px] font-medium text-foreground">
          素材类型
        </h2>
        <ul data-slot="asset-type-list" className="flex flex-col gap-0.5">
          {entries.map((entry) => (
            <li key={entry.id}>
              <button
                type="button"
                data-asset-type={entry.id}
                data-slot="asset-type-row"
                data-type-count={entry.count}
                aria-current={entry.active ? "true" : undefined}
                className={
                  "flex h-8 w-full items-center justify-between rounded-control px-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 " +
                  (entry.active
                    ? "bg-brand-soft font-medium text-brand"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground")
                }
              >
                <span className="flex min-w-0 items-center gap-2">
                  <SidebarGlyph icon={entry.icon} />
                  <span className="truncate">{entry.label}</span>
                </span>
                <span className="shrink-0 font-mono tabular-nums text-[11px] text-muted-foreground">
                  {entry.count.toLocaleString("en-US")}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>
      <div aria-hidden="true" className="mx-1 h-px bg-border" />
      <section data-slot="asset-filter-collection" className="flex flex-col gap-1">
        <ul data-slot="asset-collection-list" className="flex flex-col gap-0.5">
          {collections.map((entry) => (
            <li key={entry.id}>
              <button
                type="button"
                data-slot="asset-collection-row"
                data-collection-id={entry.id}
                className="flex h-8 w-full items-center justify-between rounded-control px-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <SidebarGlyph icon={entry.icon} />
                  <span className="truncate">{entry.label}</span>
                </span>
                <span className="shrink-0 font-mono tabular-nums text-[11px] text-muted-foreground">
                  {entry.count.toLocaleString("en-US")}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </aside>
  );
}

function SidebarGlyph({ icon }: { icon: AssetTypeSidebarEntry["icon"] }) {
  const baseClass = "flex size-4 shrink-0 items-center justify-center text-current";
  switch (icon) {
    case "all":
      return (
        <span aria-hidden="true" className={baseClass}>
          <span className="grid grid-cols-2 grid-rows-2 gap-0.5">
            <span className="block size-1.5 rounded-[1.5px] bg-current" />
            <span className="block size-1.5 rounded-[1.5px] bg-current" />
            <span className="block size-1.5 rounded-[1.5px] bg-current" />
            <span className="block size-1.5 rounded-[1.5px] bg-current" />
          </span>
        </span>
      );
    case "video":
      return (
        <svg
          aria-hidden="true"
          viewBox="0 0 16 16"
          className={baseClass}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.4}
        >
          <rect x={2} y={3.5} width={9} height={9} rx={1.2} />
          <path d="M11 6.5 L14 4.5 L14 11.5 L11 9.5 Z" fill="currentColor" stroke="none" />
        </svg>
      );
    case "image":
      return (
        <svg
          aria-hidden="true"
          viewBox="0 0 16 16"
          className={baseClass}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.4}
        >
          <rect x={2} y={3} width={12} height={10} rx={1.2} />
          <circle cx={6.2} cy={7} r={1.2} fill="currentColor" stroke="none" />
          <path d="M2 12 L6 8.5 L9 11 L11.5 9 L14 12" />
        </svg>
      );
    case "audio":
      return (
        <svg
          aria-hidden="true"
          viewBox="0 0 16 16"
          className={baseClass}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.4}
        >
          <path d="M3 11 V6 M6 13 V4 M9 11 V6 M12 9 V8" />
        </svg>
      );
    case "screenshot":
      return (
        <svg
          aria-hidden="true"
          viewBox="0 0 16 16"
          className={baseClass}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.4}
        >
          <rect x={2} y={2.5} width={12} height={11} rx={1.2} />
          <rect x={4.5} y={5} width={7} height={6} rx={0.6} />
        </svg>
      );
    case "screen-recording":
      return (
        <svg
          aria-hidden="true"
          viewBox="0 0 16 16"
          className={baseClass}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.4}
        >
          <rect x={2} y={3.5} width={9} height={9} rx={1.2} />
          <path d="M11 6.5 L14 4.5 L14 11.5 L11 9.5 Z" fill="currentColor" stroke="none" />
          <circle cx={13} cy={3} r={1.5} fill="currentColor" stroke="none" />
        </svg>
      );
    case "document":
      return (
        <svg
          aria-hidden="true"
          viewBox="0 0 16 16"
          className={baseClass}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.4}
        >
          <path d="M3.5 2 H9.5 L12.5 5 V14 H3.5 Z" />
          <path d="M9.5 2 V5 H12.5" />
          <path d="M5.5 8 H10.5 M5.5 10.5 H8" />
        </svg>
      );
    case "cover":
      return (
        <svg
          aria-hidden="true"
          viewBox="0 0 16 16"
          className={baseClass}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.4}
        >
          <rect x={2} y={2.5} width={12} height={11} rx={1.2} />
          <rect x={4} y={4.5} width={8} height={4} rx={0.6} />
          <path d="M4 11 L6.5 9 L9 10.5 L12 8.5" />
        </svg>
      );
    case "broll":
      return (
        <svg
          aria-hidden="true"
          viewBox="0 0 16 16"
          className={baseClass}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.4}
        >
          <circle cx={8} cy={8} r={5.5} />
          <path d="M6.5 6 L11 8 L6.5 10 Z" fill="currentColor" stroke="none" />
        </svg>
      );
    case "favorites":
      return (
        <svg
          aria-hidden="true"
          viewBox="0 0 16 16"
          className={baseClass}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.4}
        >
          <path d="M8 2.5 L9.85 6 L13.5 6.5 L10.75 9 L11.5 12.5 L8 10.8 L4.5 12.5 L5.25 9 L2.5 6.5 L6.15 6 Z" />
        </svg>
      );
    case "trash":
      return (
        <svg
          aria-hidden="true"
          viewBox="0 0 16 16"
          className={baseClass}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.4}
        >
          <path d="M3 4 H13 M5.5 4 V2.5 H10.5 V4 M4.5 4 L5 13.5 H11 L11.5 4" />
        </svg>
      );
  }
}

// ---------------------------------------------------------------------------
// StorageUsageCard — storage usage summary
// ---------------------------------------------------------------------------
//
// page-specs §12: "左下保留存储空间卡".

interface StorageUsageCardProps {
  readonly storage: StorageUsage;
}

function StorageUsageCard({ storage }: StorageUsageCardProps) {
  const pct = Math.min(
    100,
    Math.round((storage.usedBytes / storage.totalBytes) * 100),
  );
  return (
    <SectionCard
      title="存储空间"
      description="本地素材库使用情况"
      contentClassName="flex flex-col gap-1.5"
    >
      <div data-slot="storage-usage-card" className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">已使用</span>
          <span className="font-mono tabular-nums text-foreground">
            {storage.usedLabel} / {storage.totalLabel}
          </span>
        </div>
        <ProgressBar
          value={pct}
          showValue
          label="素材库存储使用率"
          tone="brand"
        />
        <p className="text-[11px] text-muted-foreground">
          个人本地素材库 · 自动同步已开启
        </p>
      </div>
    </SectionCard>
  );
}