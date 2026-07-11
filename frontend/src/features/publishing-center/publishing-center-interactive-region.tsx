"use client";

/**
 * `PublishingCenterInteractiveRegion` — Client island for the Publishing
 * Center page (Increment 4 / page-specs §13).
 *
 * The page (`publishing-center-page.tsx`) stays a Server Component shell;
 * the interactive content lives here following the existing islands
 * pattern (assets / settings / search / knowledge).
 *
 * Wired interactions (client / URL state over fixture data, no network):
 *  - ContentTypeTabs: switching a tab (全部 / 视频 / 图文 / 音频) filters the
 *    publication table by content type and resets the page to 1.
 *  - PublishingToolbar search input: filters the table by title / project /
 *    platform label (case-insensitive substring). Mirrored to `?q=`.
 *  - Filter chips (全部 / 近 7 天 / 近 30 天 / 待优化): narrow the rows by a
 *    derived predicate over the publication date / engagement tone.
 *  - Row "查看" action: marks the row as the active selection.
 *  - Pagination: changing the page slices the filtered rows into pages.
 *
 * [T-231①] 批量操作(批量发布/批量下架/修改时间)与整套行选择机制已删:
 * live 端 publisher 绑 mock(persistence-client `createMockPublisher()`),
 * 批量发布会铸 `mock:douyin:` 假 externalId、批量下架会把真实导入作品标
 * removed(毁数据)、修改时间无时间选择器——按 T-209「不能实现的去掉」原则整体移除。
 *
 * Determinism: filtering / paging is pure over props; side effects are a
 * `history.replaceState` URL update, plus a mount-time real "today" for the
 * 近 N 天 chips ([T-231④])。No `Math.random` / `fetch`.
 */

import * as React from "react";
import Link from "next/link";

import { ChartFrame } from "@/components/analytics/chart-frame";
import { MetricCard } from "@/components/project/metric-card";
import { SectionCard } from "@/components/project/section-card";
import { PlatformIcon } from "@/components/publishing/platform-icon";
import { CoverThumb } from "@/components/resources/cover-thumb";
import type { MetricCard as MetricCardVm } from "@/types/view-models";
import type {
  ContentTypeTab,
  PlatformShare,
  PublicationRow,
  PublishingCenterViewModel,
  TopContentRow,
} from "./publishing-center-page";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PAGE_SIZE = 6;

interface DateFilterChip {
  readonly id: "all" | "recent7" | "recent30" | "needsWork";
  readonly label: string;
}

const FILTER_CHIPS: ReadonlyArray<DateFilterChip> = [
  { id: "all", label: "全部" },
  { id: "recent7", label: "近 7 天" },
  { id: "recent30", label: "近 30 天" },
  { id: "needsWork", label: "待优化" },
];

// [T-231④] 「近 N 天」以真实"今天"为基准(原来写死 "2026-06-20" 冻结日期,
// chip 永远相对一个过去的锚点)。SSR/hydration 一致性:初始 chip 是 "all"
// (不依赖日期),reference date 用 useState 惰性初始化,首帧 DOM 与服务端一致。
function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Thumbnail hashing — derives a deterministic hue from a token.
// ---------------------------------------------------------------------------

function hashToken(input: string): string {
  // FNV-1a 32-bit. Pure function — no `Math.random`, no `Date.now`.
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash =
      (hash +
        ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>>
      0;
  }
  return hash.toString(16).padStart(8, "0");
}

// ---------------------------------------------------------------------------
// URL `?q=` helpers (router-independent so the island works in tests too)
// ---------------------------------------------------------------------------

function readUrlQuery(): string {
  if (typeof window === "undefined") return "";
  try {
    return new URLSearchParams(window.location.search).get("q") ?? "";
  } catch {
    return "";
  }
}

function writeUrlQuery(next: string): void {
  if (typeof window === "undefined") return;
  try {
    const params = new URLSearchParams(window.location.search);
    if (next) params.set("q", next);
    else params.delete("q");
    const qs = params.toString();
    const url = qs
      ? `${window.location.pathname}?${qs}`
      : window.location.pathname;
    window.history.replaceState(window.history.state, "", url);
  } catch {
    // No-op: URL mirroring is a best-effort enhancement.
  }
}

// ---------------------------------------------------------------------------
// Filtering helpers (pure)
// ---------------------------------------------------------------------------

function daysBetween(fromIso: string, toIso: string): number {
  const from = new Date(`${fromIso.slice(0, 10)}T00:00:00Z`).getTime();
  const to = new Date(`${toIso.slice(0, 10)}T00:00:00Z`).getTime();
  if (Number.isNaN(from) || Number.isNaN(to)) return Number.POSITIVE_INFINITY;
  return Math.round((to - from) / (24 * 60 * 60 * 1000));
}

function matchesDateChip(
  row: PublicationRow,
  chip: DateFilterChip["id"],
  referenceDate: string,
): boolean {
  switch (chip) {
    case "recent7":
      return daysBetween(row.publishedAt, referenceDate) <= 7;
    case "recent30":
      return daysBetween(row.publishedAt, referenceDate) <= 30;
    case "needsWork":
      return row.engagementTone === "warning";
    case "all":
    default:
      return true;
  }
}

// ---------------------------------------------------------------------------
// PublishingCenterInteractiveRegion
// ---------------------------------------------------------------------------

export function PublishingCenterInteractiveRegion({
  viewModel,
}: {
  readonly viewModel: PublishingCenterViewModel;
}) {
  const [activeTab, setActiveTab] = React.useState<string>(
    viewModel.contentTypeTabs[0]?.id ?? "all",
  );
  const [chip, setChip] = React.useState<DateFilterChip["id"]>("all");
  // [T-231④] 「近 N 天」基准 = 真实今天(惰性初始化,组件生命周期内稳定)。
  const [referenceDate] = React.useState<string>(() => todayIsoDate());
  // [T-073] 显示已隐藏(抖音端「仅自己可见/已隐藏」的发布行,hidden=true)。默认过滤。
  const [showHidden, setShowHidden] = React.useState(false);
  const [query, setQuery] = React.useState<string>(() => readUrlQuery());
  const [page, setPage] = React.useState<number>(1);
  const [activeRowId, setActiveRowId] = React.useState<string | null>(null);

  const handleSearchChange = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const next = event.target.value;
      setQuery(next);
      setPage(1);
      writeUrlQuery(next);
    },
    [],
  );

  const handleTabChange = React.useCallback((id: string) => {
    setActiveTab(id);
    setPage(1);
  }, []);

  const handleChipChange = React.useCallback((id: DateFilterChip["id"]) => {
    setChip(id);
    setPage(1);
  }, []);

  // [T-073] 已隐藏行数(开关徽标计数;为 0 且未开时开关不渲染)。
  const hiddenCount = React.useMemo(
    () => viewModel.publications.filter((row) => row.hidden).length,
    [viewModel.publications],
  );
  const handleToggleHidden = React.useCallback(() => {
    setShowHidden((prev) => !prev);
    setPage(1);
  }, []);

  // Filter the publication list by the active tab + date chip + query.
  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return viewModel.publications.filter((row) => {
      // [T-073] 平台侧已隐藏默认过滤,开关打开才显示(行上带「已隐藏」徽标)。
      if (!showHidden && row.hidden) return false;
      const tabOk = activeTab === "all" || row.contentType === activeTab;
      if (!tabOk) return false;
      if (!matchesDateChip(row, chip, referenceDate)) return false;
      if (q.length === 0) return true;
      const haystack =
        `${row.contentTitle} ${row.projectTitle} ${row.platformLabel}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [viewModel.publications, activeTab, chip, query, showHidden, referenceDate]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = React.useMemo(
    () =>
      filtered.slice((safePage - 1) * PAGE_SIZE, (safePage - 1) * PAGE_SIZE + PAGE_SIZE),
    [filtered, safePage],
  );

  return (
    <>
      <ContentTypeTabs
        tabs={viewModel.contentTypeTabs}
        activeTab={activeTab}
        onTabChange={handleTabChange}
      />
      {/* Two-column layout: left stack (toolbar → table) + right rail */}
      <div
        data-slot="publishing-two-col"
        className="grid grid-cols-1 gap-card-gap lg:grid-cols-[minmax(0,1fr)_320px]"
      >
        <div
          data-slot="publishing-left-stack"
          className="flex flex-col gap-card-gap"
        >
          <PublishingToolbar
            query={query}
            onQueryChange={handleSearchChange}
            chip={chip}
            onChipChange={handleChipChange}
            showHidden={showHidden}
            hiddenCount={hiddenCount}
            onToggleHidden={handleToggleHidden}
          />
          <PublicationTable
            publications={pageRows}
            activeRowId={activeRowId}
            onActivateRow={setActiveRowId}
          />
        </div>
        <AnalyticsRail
          metrics={viewModel.metrics}
          platformComparison={viewModel.platformComparison}
          trend={viewModel.trend}
          topContent={viewModel.topContent}
        />
      </div>
      <Pagination
        currentPage={safePage}
        totalPages={totalPages}
        onPageChange={setPage}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// ContentTypeTabs — locked tab order (wired)
// ---------------------------------------------------------------------------

function ContentTypeTabs({
  tabs,
  activeTab,
  onTabChange,
}: {
  tabs: ReadonlyArray<ContentTypeTab>;
  activeTab: string;
  onTabChange: (id: string) => void;
}) {
  return (
    <nav
      data-slot="content-type-tabs"
      aria-label="内容类型"
      className="flex flex-wrap items-center gap-2 border-b border-border pb-2"
    >
      {tabs.map((tab) => {
        const pressed = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            data-slot="page-tab"
            data-tab-id={tab.id}
            data-pressed={pressed ? "true" : "false"}
            aria-selected={pressed}
            onClick={() => onTabChange(tab.id)}
            className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-surface px-3 text-xs font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 data-[pressed=true]:border-brand/60 data-[pressed=true]:bg-brand-soft data-[pressed=true]:text-brand"
          >
            <span>{tab.label}</span>
            <span className="font-mono text-[10px] text-muted-foreground">
              {tab.count}
            </span>
          </button>
        );
      })}
    </nav>
  );
}

// ---------------------------------------------------------------------------
// PublishingToolbar — search + filter chips (wired)
// ---------------------------------------------------------------------------

function PublishingToolbar({
  query,
  onQueryChange,
  chip,
  onChipChange,
  showHidden,
  hiddenCount,
  onToggleHidden,
}: {
  query: string;
  onQueryChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  chip: DateFilterChip["id"];
  onChipChange: (id: DateFilterChip["id"]) => void;
  /** [T-073] 显示已隐藏开关状态 + 已隐藏行数(为 0 且未开时不渲染开关)。 */
  showHidden: boolean;
  hiddenCount: number;
  onToggleHidden: () => void;
}) {
  return (
    <div
      data-slot="publishing-toolbar"
      aria-label="发布列表工具栏"
      className="flex flex-wrap items-center gap-card-gap"
    >
      <label className="sr-only" htmlFor="publishing-search">
        搜索发布内容
      </label>
      <div
        data-slot="search-field"
        className="flex h-9 w-72 items-center gap-2 rounded-control border border-border bg-surface px-3 text-sm"
      >
        <span aria-hidden="true" className="text-muted-foreground">
          🔎
        </span>
        <input
          id="publishing-search"
          type="search"
          placeholder="搜索标题、项目或平台"
          data-slot="publishing-search-input"
          value={query}
          onChange={onQueryChange}
          className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
        />
      </div>
      <div
        data-slot="publishing-toolbar-filters"
        className="flex flex-wrap items-center gap-1"
      >
        {FILTER_CHIPS.map((entry) => (
          <FilterChip
            key={entry.id}
            label={entry.label}
            active={entry.id === chip}
            onClick={() => onChipChange(entry.id)}
          />
        ))}
        {/* [T-073] 显示已隐藏开关(抖音端「仅自己可见/已隐藏」默认过滤)。 */}
        {hiddenCount > 0 || showHidden ? (
          <button
            type="button"
            data-slot="publishing-show-hidden-toggle"
            aria-pressed={showHidden}
            onClick={onToggleHidden}
            className={
              showHidden
                ? "inline-flex h-7 items-center gap-1 rounded-full border border-brand/60 bg-brand-soft px-2.5 text-xs font-medium text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                : "inline-flex h-7 items-center gap-1 rounded-full border border-border bg-surface px-2.5 text-xs text-foreground hover:bg-surface-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            }
          >
            <span>{showHidden ? "隐藏已隐藏" : "显示已隐藏"}</span>
            {hiddenCount > 0 ? (
              <span className="font-mono text-[10px] tabular-nums">
                {hiddenCount}
              </span>
            ) : null}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      data-slot="publishing-filter-chip"
      data-active={active ? "true" : "false"}
      aria-pressed={active}
      onClick={onClick}
      className={
        active
          ? "inline-flex h-7 items-center rounded-full border border-brand/60 bg-brand-soft px-2.5 text-xs font-medium text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          : "inline-flex h-7 items-center rounded-full border border-border bg-surface px-2.5 text-xs text-foreground hover:bg-surface-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      }
    >
      {label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// PublicationTable — 7 columns in spec order (rows wired)
// [T-231①] 批量操作条(BatchOperationBar)与行勾选已删——live publisher 是
// mock,批量 transition 会铸假数据/毁真数据,按「不能实现的去掉」原则移除。
// ---------------------------------------------------------------------------

function PublicationTable({
  publications,
  activeRowId,
  onActivateRow,
}: {
  publications: ReadonlyArray<PublicationRow>;
  activeRowId: string | null;
  onActivateRow: (id: string) => void;
}) {
  return (
    <article
      data-slot="publication-table-wrapper"
      aria-label="发布内容列表"
      className="rounded-2xl border border-border bg-surface shadow-card"
    >
      <table
        data-slot="publication-table"
        className="w-full text-sm"
        aria-label="发布内容表格"
      >
        <thead>
          <tr className="border-b border-border text-xs text-muted-foreground">
            <th className="px-3 py-2.5 text-left font-medium">内容</th>
            <th className="px-3 py-2.5 text-left font-medium">项目</th>
            <th className="px-3 py-2.5 text-left font-medium">平台</th>
            <th className="px-3 py-2.5 text-left font-medium">发布时间</th>
            <th className="px-3 py-2.5 text-left font-medium">状态</th>
            <th className="px-3 py-2.5 text-left font-medium">表现</th>
            <th className="px-3 py-2.5 text-right font-medium">操作</th>
          </tr>
        </thead>
        <tbody>
          {publications.length === 0 ? (
            <tr data-slot="publication-table-empty">
              <td
                colSpan={7}
                className="px-3 py-6 text-center text-[12px] text-muted-foreground"
              >
                没有匹配的发布内容。
              </td>
            </tr>
          ) : (
            publications.map((row) => (
              <PublicationPerformanceRow
                key={row.id}
                row={row}
                active={row.id === activeRowId}
                onActivateRow={onActivateRow}
              />
            ))
          )}
        </tbody>
      </table>
    </article>
  );
}

function PublicationPerformanceRow({
  row,
  active,
  onActivateRow,
}: {
  row: PublicationRow;
  active: boolean;
  onActivateRow: (id: string) => void;
}) {
  return (
    <tr
      data-slot="publication-performance-row"
      data-publication-id={row.id}
      data-status={row.status}
      data-hidden={row.hidden ? "true" : "false"}
      data-active={active ? "true" : "false"}
      className={
        "border-b border-border last:border-b-0 " +
        (active ? "bg-brand-soft/40" : "hover:bg-surface-subtle/40")
      }
    >
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-3">
          <ContentThumbnail
            platform={row.platform}
            token={row.thumbnailToken}
            coverAssetId={row.coverAssetId ?? null}
            alt={row.contentTitle}
          />
          <span className="line-clamp-2 max-w-[200px] text-[13px] leading-snug text-foreground">
            {row.contentTitle}
          </span>
        </div>
      </td>
      <td className="px-3 py-2.5 text-[13px] leading-snug text-muted-foreground">
        {row.projectTitle}
      </td>
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-1.5">
          <PlatformIcon platform={row.platform} size="sm" />
          <span className="text-[13px] text-foreground">{row.platformLabel}</span>
        </div>
      </td>
      <td className="px-3 py-2.5 font-mono text-[11px] leading-snug text-muted-foreground">
        {row.publishedAtLabel}
      </td>
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-1">
          <StatusBadge status={row.status} label={row.statusLabel} />
          {/* [T-073] 平台侧已隐藏徽标(「显示已隐藏」开关打开时该行才可见)。 */}
          {row.hidden ? (
            <span
              data-slot="publication-hidden-badge"
              className="inline-flex h-5 items-center rounded-md bg-surface-subtle px-1.5 text-[11px] font-medium text-muted-foreground"
            >
              已隐藏
            </span>
          ) : null}
        </div>
      </td>
      <td className="px-3 py-2.5">
        <div className="flex flex-col gap-0.5">
          <span
            data-slot="publication-views"
            className="font-mono text-[13px] font-medium tabular-nums text-foreground"
          >
            {row.views}
          </span>
          <span
            data-slot="publication-engagement"
            data-tone={row.engagementTone}
            className={
              row.engagementTone === "positive"
                ? "text-[11px] text-success"
                : row.engagementTone === "warning"
                  ? "text-[11px] text-warning"
                  : "text-[11px] text-muted-foreground"
            }
          >
            {row.engagementLabel}
          </span>
        </div>
      </td>
      <td className="px-3 py-2.5 text-right">
        {/* D3: 查看 deep-links to the content's owning project when resolvable,
            else the Projects index. Still marks the row active on click so the
            existing highlight affordance is preserved. */}
        <Link
          href={row.projectId ? `/projects/${row.projectId}` : "/projects"}
          data-slot="publication-row-action"
          aria-pressed={active}
          onClick={() => onActivateRow(row.id)}
          className="inline-flex h-7 items-center rounded-md border border-border bg-surface px-2.5 text-[11px] text-foreground hover:bg-surface-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 aria-pressed:border-brand/60 aria-pressed:bg-brand-soft aria-pressed:text-brand"
        >
          查看
        </Link>
      </td>
    </tr>
  );
}

function ContentThumbnail({
  platform,
  token,
  coverAssetId = null,
  alt = "",
}: {
  platform: string;
  token: string;
  /** [T-078] 真封面 asset id;有则渲真图,无/取不到回渐变占位。 */
  coverAssetId?: string | null;
  alt?: string;
}) {
  // Deterministic 16:9 thumbnail with a token-derived hue so the
  // grid of cards remains stable across renders (no Math.random).
  const hue = (hashToken(token) ?? "0").slice(0, 2);
  const hueValue = parseInt(hue, 16) * 12;
  const safeHue = Number.isFinite(hueValue) ? hueValue % 360 : 220;
  const placeholder = (
    <span
      data-slot="content-thumbnail"
      data-platform={platform}
      data-token={token}
      aria-hidden="true"
      className="flex h-9 w-16 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border text-[10px] font-medium text-white"
      style={{ backgroundColor: `hsl(${safeHue} 60% 45%)` }}
    >
      16:9
    </span>
  );
  // [T-078] 有封面 → 签名 URL 渲真图(共享 resolveAssetPreviewUrl 缓存);失败回占位。
  return (
    <CoverThumb
      assetId={coverAssetId}
      alt={alt}
      className="h-9 w-16 shrink-0 rounded-md border border-border object-cover bg-surface-subtle"
      fallback={placeholder}
    />
  );
}

function StatusBadge({
  status,
  label,
}: {
  status: PublicationRow["status"];
  label: string;
}) {
  const tone =
    status === "published"
      ? "bg-success-soft text-success"
      : status === "scheduled"
        ? "bg-info-soft text-info"
        : status === "draft"
          ? "bg-warning-soft text-warning"
          : "bg-surface-subtle text-muted-foreground";
  return (
    <span
      data-slot="status-badge"
      data-status={status}
      className={`inline-flex h-5 items-center rounded-md px-1.5 text-[11px] font-medium ${tone}`}
    >
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Pagination — wired
// ---------------------------------------------------------------------------

function Pagination({
  currentPage,
  totalPages,
  onPageChange,
}: {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) {
  const pages = Array.from({ length: totalPages }, (_, index) => index + 1);
  return (
    <nav
      data-slot="pagination"
      aria-label="发布内容分页"
      className="flex items-center justify-center gap-1 pt-1 text-xs"
    >
      <button
        type="button"
        data-slot="pagination-prev"
        aria-label="上一页"
        disabled={currentPage <= 1}
        onClick={() => onPageChange(Math.max(1, currentPage - 1))}
        className="inline-flex h-7 min-w-7 items-center justify-center rounded-full px-2 text-muted-foreground hover:bg-surface-subtle hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-40"
      >
        ‹
      </button>
      {pages.map((entry) => {
        const isCurrent = entry === currentPage;
        return (
          <button
            key={entry}
            type="button"
            data-slot="pagination-page"
            data-page-current={isCurrent ? "true" : "false"}
            aria-current={isCurrent ? "page" : undefined}
            aria-label={`第 ${entry} 页`}
            onClick={() => onPageChange(entry)}
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
        onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
        className="inline-flex h-7 min-w-7 items-center justify-center rounded-full px-2 text-muted-foreground hover:bg-surface-subtle hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-40"
      >
        ›
      </button>
    </nav>
  );
}

// ---------------------------------------------------------------------------
// AnalyticsRail — locked order: metrics → platform-comparison →
// trend → top-content
// ---------------------------------------------------------------------------

function AnalyticsRail({
  metrics,
  platformComparison,
  trend,
  topContent,
}: {
  metrics: ReadonlyArray<MetricCardVm>;
  platformComparison: ReadonlyArray<PlatformShare>;
  trend: ReadonlyArray<{ readonly label: string; readonly value: number }>;
  topContent: ReadonlyArray<TopContentRow>;
}) {
  return (
    <aside
      data-slot="analytics-rail"
      aria-label="发布数据"
      className="flex flex-col gap-card-gap"
    >
      <PublishingMetrics metrics={metrics} />
      <PlatformComparisonChart shares={platformComparison} />
      <TrendChart trend={trend} />
      <TopContentList items={topContent} />
    </aside>
  );
}

function PublishingMetrics({
  metrics,
}: {
  metrics: ReadonlyArray<MetricCardVm>;
}) {
  return (
    <section
      data-slot="publishing-metrics"
      aria-label="发布概览"
      className="grid grid-cols-2 gap-card-gap"
    >
      {metrics.map((metric) => (
        <MetricCard
          key={metric.id}
          id={metric.id}
          label={metric.label}
          value={metric.value}
          delta={metric.delta}
          trend={metric.trend}
          tone={metric.tone}
        />
      ))}
    </section>
  );
}

function PlatformComparisonChart({
  shares,
}: {
  shares: ReadonlyArray<PlatformShare>;
}) {
  const total = shares.reduce((acc, row) => acc + row.share, 0) || 1;
  if (shares.length === 0) {
    return (
      <SectionCard title="平台对比" description="按平台播放量占比">
        <p
          data-slot="platform-comparison-empty"
          className="py-6 text-center text-xs text-muted-foreground"
        >
          暂无数据
        </p>
      </SectionCard>
    );
  }
  return (
    <SectionCard title="平台对比" description="按平台播放量占比">
      <div data-slot="platform-comparison-chart" className="flex flex-col gap-2">
        <ul
          data-slot="platform-comparison-list"
          className="flex flex-col gap-1.5"
          aria-label="平台对比数据"
        >
          {shares.map((row) => {
            const pct = (row.share / total) * 100;
            return (
              <li
                key={row.platform}
                data-slot="platform-comparison-row"
                data-platform={row.platform}
                data-share={row.share.toFixed(2)}
                className="flex items-center justify-between gap-2 text-xs"
              >
                <div className="flex items-center gap-2">
                  <PlatformIcon platform={row.platform} size="sm" />
                  <span className="text-foreground">{row.platformLabel}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div
                    aria-hidden="true"
                    className="h-1.5 w-20 overflow-hidden rounded-full bg-surface-subtle"
                  >
                    <div
                      className="h-full bg-brand"
                      style={{ width: `${pct.toFixed(1)}%` }}
                    />
                  </div>
                  <span className="font-mono tabular-nums text-muted-foreground">
                    {pct.toFixed(0)}%
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
        <p data-slot="chart-summary" className="sr-only">
          平台对比：
          {shares
            .map((row) => `${row.platformLabel} ${(row.share * 100).toFixed(0)}%`)
            .join("、")}
          。
        </p>
      </div>
    </SectionCard>
  );
}

function TrendChart({
  trend,
}: {
  trend: ReadonlyArray<{ readonly label: string; readonly value: number }>;
}) {
  if (trend.length === 0) {
    return (
      <SectionCard title="发布趋势" description="按日播放量">
        <p
          data-slot="trend-chart-empty"
          className="py-6 text-center text-xs text-muted-foreground"
        >
          暂无数据
        </p>
      </SectionCard>
    );
  }
  const summary = `发布趋势：${
    trend[0]?.label ?? ""
  } ${trend[0]?.value.toLocaleString() ?? ""}，${
    trend[trend.length - 1]?.label ?? ""
  } ${trend[trend.length - 1]?.value.toLocaleString() ?? ""}，整体上升。`;
  return (
    <ChartFrame
      title="发布趋势"
      description="近 6 月发布量"
      summary={summary}
      trend={trend}
      slot="trend-chart"
      shape="line"
      testId="publishing-trend-chart"
    />
  );
}

function TopContentList({
  items,
}: {
  items: ReadonlyArray<TopContentRow>;
}) {
  if (items.length === 0) {
    return (
      <SectionCard title="热门内容" description="播放量最高">
        <p
          data-slot="top-content-empty"
          className="py-6 text-center text-xs text-muted-foreground"
        >
          暂无数据
        </p>
      </SectionCard>
    );
  }
  return (
    <SectionCard title="热门内容" description="播放量最高">
      <ul
        data-slot="top-content-list"
        className="flex flex-col gap-2"
        aria-label="热门内容列表"
      >
        {items.map((item) => (
          <li
            key={item.id}
            data-slot="top-content-row"
            data-top-content-id={item.id}
            className="flex items-center gap-3 rounded-md border border-border bg-surface-subtle px-3 py-2 text-sm"
          >
            {/* [T-082] 真封面接 CoverThumb 链(ContentThumbnail 内部处理回退占位)。 */}
            <ContentThumbnail
              platform={item.platform}
              token={item.id}
              coverAssetId={item.coverAssetId}
              alt={item.title}
            />
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="truncate text-foreground">{item.title}</span>
              <span className="text-xs text-muted-foreground">
                {item.platformLabel} · {item.views} · {item.engagement}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}
