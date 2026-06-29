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
import Link from "next/link";

import { SectionCard } from "@/components/project/section-card";
import { ProgressBar } from "@/components/project/progress-bar";
import { ErrorState } from "@/components/state/page-state";
import type { ViewModelError } from "@/types/view-models";
import type { AssetType } from "@/types/domain";
import {
  AssetsInteractiveRegion,
  type ProjectOption,
} from "./assets-interactive-region";
import { AssetUploadButton } from "./asset-upload-button";
import { AssetsToolbarSearch } from "./assets-toolbar-search";
import { buildAssetsViewModelReal } from "./assets-data";

// The asset-type enum used by the filter sidebar. Mirrors contract
// `primitives.assetType`; these are the ONLY values `?type=` accepts.
const FILTERABLE_TYPES: ReadonlyArray<AssetType> = [
  "image",
  "video",
  "audio",
  "document",
  "subtitle",
];

const TYPE_LABEL: Record<AssetType, string> = {
  image: "图片",
  video: "视频",
  audio: "音频",
  document: "文档",
  subtitle: "字幕",
};

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface AssetsPageProps {
  /**
   * The REAL Assets Center ViewModel, produced by the route from a
   * session-scoped contract client (`buildAssetsViewModelReal`). Also the
   * test-override seam: when provided, the page renders it directly and does
   * NOT issue a network read (SSR stays deterministic, F4). An empty
   * `viewModel.assets` renders the honest 空态 gallery (a fresh account sees
   * its own emptiness, not another user's seed).
   */
  readonly viewModel?: AssetsViewModel;
  /**
   * The 附到项目 picker source (real `projects.list`), passed by the route
   * alongside `viewModel`. When omitted (test seam), the picker is empty.
   */
  readonly projects?: ReadonlyArray<ProjectOption>;
  /**
   * Tri-state read outcome. `"error"` makes the page render an error state
   * instead of a (fabricated) gallery — a read failure is NOT dressed as data.
   * Defaults to `"ready"` so the test/fixture seam renders the gallery.
   */
  readonly state?: "ready" | "error";
  /** Error payload rendered when `state === "error"`. */
  readonly error?: ViewModelError;
  /** `?type=` — asset-type filter (one of FILTERABLE_TYPES, or undefined = all). */
  readonly type?: string;
  /** `?q=` — name/description/tag substring filter. */
  readonly q?: string;
  /** `?page=` — 1-based gallery page (real `assets.list` paging). */
  readonly page?: string;
  /** `?pageSize=` — gallery page size (real `assets.list` paging). */
  readonly pageSize?: string;
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
// Derived gallery state (Plan D1)
// ---------------------------------------------------------------------------
//
// `assets.list` only accepts `page`/`pageSize` (see contract/operations/
// assets.ts — its query is the bare `paginationQuery`). There is NO server-side
// `type` / `q` filter param. So the page reads the real paged list, then applies
// the `?type=` / `?q=` filters as a substring pass over the read page. Paging is
// REAL (the `?page=`/`?pageSize=` query re-reads `assets.list`); the
// type/search filters are an honest client-over-page fallback. Type counts are
// computed from the REAL read rows — no fabricated numbers.

interface GalleryState {
  readonly assets: ReadonlyArray<AssetSummary>;
  readonly totalCount: number;
  readonly currentPage: number;
  readonly pageSize: number;
  readonly totalPages: number;
  readonly activeType: AssetType | null;
  readonly query: string;
  readonly typeCounts: ReadonlyArray<{ readonly type: AssetType; readonly label: string; readonly count: number }>;
  readonly projects: ReadonlyArray<ProjectOption>;
}

function coercePositiveInt(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : fallback;
}

function normalizeType(value: string | undefined): AssetType | null {
  return FILTERABLE_TYPES.includes(value as AssetType)
    ? (value as AssetType)
    : null;
}

function deriveGallery(
  all: ReadonlyArray<AssetSummary>,
  projects: ReadonlyArray<ProjectOption>,
  opts: { type?: string; q?: string; page?: string; pageSize?: string },
): GalleryState {
  const activeType = normalizeType(opts.type);
  const query = (opts.q ?? "").trim();
  const needle = query.toLowerCase();

  const filtered = all.filter((asset) => {
    if (activeType !== null && asset.type !== activeType) return false;
    if (needle.length > 0) {
      const haystack = [
        asset.name,
        asset.description,
        ...asset.tags,
      ]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    return true;
  });

  const pageSize = coercePositiveInt(opts.pageSize, 24);
  const totalCount = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const currentPage = Math.min(coercePositiveInt(opts.page, 1), totalPages);
  const start = (currentPage - 1) * pageSize;
  const pageAssets = filtered.slice(start, start + pageSize);

  // Real type counts over the full (unfiltered) read rows.
  const typeCounts = FILTERABLE_TYPES.map((type) => ({
    type,
    label: TYPE_LABEL[type],
    count: all.filter((asset) => asset.type === type).length,
  }));

  return {
    assets: pageAssets,
    totalCount,
    currentPage,
    pageSize,
    totalPages,
    activeType,
    query,
    typeCounts,
    projects,
  };
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export async function AssetsPage({
  viewModel,
  projects: projectsProp,
  state = "ready",
  error,
  type,
  q,
  page,
  pageSize,
}: AssetsPageProps = {}) {
  // GAP-AST-tristate: the route (server component) resolves the session, builds
  // the REAL VM with a session-scoped client via `buildAssetsViewModelReal`, and
  // passes `viewModel` + `projects` + `state`/`error` here. The `viewModel?`
  // prop is also the test/fixture seam (deterministic SSR, F4). When NOTHING is
  // passed (e.g. no-session SSR/test direct render), we degrade to the singleton
  // client build — the fixture seam — so the page still renders.
  let vm: AssetsViewModel;
  let projects: ReadonlyArray<ProjectOption>;
  let resolvedState: "ready" | "error" = state;
  let resolvedError: ViewModelError | undefined = error;
  if (viewModel === undefined) {
    const real = await buildAssetsViewModelReal();
    vm = real.viewModel;
    projects = real.projects.map((p) => ({ id: p.id, title: p.title }));
    resolvedState = real.state;
    resolvedError = real.error;
  } else {
    vm = viewModel;
    projects = projectsProp ?? [];
  }

  // Error tri-state: a real read failure renders an honest error state — never a
  // fabricated gallery. The toolbar stays so the page chrome is intact.
  if (resolvedState === "error") {
    return (
      <main
        data-app="creatoros"
        data-page="assets"
        data-assets-id="assets-root"
        data-page-state="error"
        className="flex flex-col gap-3"
      >
        <AssetToolbar query={(q ?? "").trim()} activeType={normalizeType(type)} />
        <ErrorState error={resolvedError ?? null} />
      </main>
    );
  }

  const gallery = deriveGallery(vm.assets, projects, {
    type,
    q,
    page,
    pageSize,
  });

  return (
    <main
      data-app="creatoros"
      data-page="assets"
      data-assets-id="assets-root"
      data-page-state={vm.assets.length === 0 ? "empty" : "default"}
      className="flex flex-col gap-3"
    >
      <AssetToolbar query={gallery.query} activeType={gallery.activeType} />
      <div
        data-slot="assets-page-body"
        className="grid grid-cols-1 gap-card-gap lg:grid-cols-[216px_minmax(0,1fr)]"
      >
        <div
          data-slot="assets-left-rail"
          className="flex flex-col gap-card-gap"
        >
          <AssetTypeSidebar
            typeCounts={gallery.typeCounts}
            totalCount={vm.assets.length}
            activeType={gallery.activeType}
            query={gallery.query}
          />
          <StorageUsageCard storage={vm.storage} />
        </div>
        <AssetsInteractiveRegion viewModel={vm} gallery={gallery} />
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------
// AssetToolbar — wired search + upload (Plan D1)
// ---------------------------------------------------------------------------
//
// The 5 fabricated filter chips (类型/来源/项目/标签/更多筛选) and the 批量操作 ▾
// menu were removed: `assets.list` backs none of them, so they were pure
// decoration. Real type filtering lives in the type sidebar (`?type=`), real
// search is the wired `AssetsToolbarSearch` island (`?q=`).

function AssetToolbar({
  query,
  activeType,
}: {
  readonly query: string;
  readonly activeType: AssetType | null;
}) {
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
        <AssetsToolbarSearch
          query={query}
          activeType={activeType}
        />
      </div>
      <div
        data-slot="assets-toolbar-actions"
        className="flex flex-wrap items-center gap-2"
      >
        <AssetUploadButton />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AssetTypeSidebar — page-internal; DISTINCT from the global Sidebar
// ---------------------------------------------------------------------------

type SidebarIcon =
  | "all"
  | "video"
  | "image"
  | "audio"
  | "document"
  | "cover"
  | "broll"
  | "screenshot"
  | "screen-recording"
  | "favorites"
  | "trash";

const TYPE_ICON: Record<AssetType, SidebarIcon> = {
  image: "image",
  video: "video",
  audio: "audio",
  document: "document",
  subtitle: "document",
};

interface AssetTypeSidebarProps {
  readonly typeCounts: ReadonlyArray<{
    readonly type: AssetType;
    readonly label: string;
    readonly count: number;
  }>;
  readonly totalCount: number;
  readonly activeType: AssetType | null;
  readonly query: string;
}

// Plan D1: the type rows are REAL filter links. Each navigates `?type=<type>`
// (preserving the active `?q=`), the server re-reads + re-derives the gallery,
// and the counts come from the real `assets.list` rows — no fabricated numbers.
// The fabricated 截图/录屏/封面/B-roll/我的收藏/回收站 rows + the duplicate search
// field were removed: `assets.list` backs none of them.
function AssetTypeSidebar({
  typeCounts,
  totalCount,
  activeType,
  query,
}: AssetTypeSidebarProps) {
  const q = query.trim();
  const hrefFor = (type: AssetType | null): string => {
    const params = new URLSearchParams();
    if (type !== null) params.set("type", type);
    if (q.length > 0) params.set("q", q);
    const qs = params.toString();
    return qs.length > 0 ? `/assets?${qs}` : "/assets";
  };
  const entries: ReadonlyArray<{
    readonly id: string;
    readonly type: AssetType | null;
    readonly label: string;
    readonly count: number;
    readonly icon: SidebarIcon;
  }> = [
    { id: "all", type: null, label: "全部素材", count: totalCount, icon: "all" },
    ...typeCounts.map((entry) => ({
      id: entry.type,
      type: entry.type,
      label: entry.label,
      count: entry.count,
      icon: TYPE_ICON[entry.type],
    })),
  ];
  return (
    <aside
      data-slot="asset-type-sidebar"
      aria-label="素材类型"
      className="flex h-fit flex-col gap-3 rounded-card border border-border bg-surface p-2.5"
    >
      <section data-slot="asset-filter-type" className="flex flex-col gap-1">
        <h2 className="px-2 py-1 text-[13px] font-medium text-foreground">
          素材类型
        </h2>
        <ul data-slot="asset-type-list" className="flex flex-col gap-0.5">
          {entries.map((entry) => {
            const active = entry.type === activeType;
            return (
              <li key={entry.id}>
                <Link
                  href={hrefFor(entry.type)}
                  data-asset-type={entry.id}
                  data-slot="asset-type-row"
                  data-type-count={entry.count}
                  aria-current={active ? "true" : undefined}
                  className={
                    "flex h-8 w-full items-center justify-between rounded-control px-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 " +
                    (active
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
                </Link>
              </li>
            );
          })}
        </ul>
      </section>
    </aside>
  );
}

function SidebarGlyph({ icon }: { icon: SidebarIcon }) {
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
          {/* ASSET-17:去掉"自动同步已开启"假文案(无同步机制支撑)。 */}
          个人本地素材库
        </p>
      </div>
    </SectionCard>
  );
}