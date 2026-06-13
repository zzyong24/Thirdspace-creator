/**
 * Publishing Center page (Task 21 / page-specs §13).
 *
 * The `/publishing` global resource-center landing page. Composes, in
 * the spec order:
 *
 *   PublishingCenterPage
 *   ├── ContentTypeTabs            (locked order: 全部 / 视频 / 图文 / 音频)
 *   ├── PublishingToolbar          (search + filter affordances)
 *   ├── PublishingLayout
 *   │   ├── PublicationTable       (7 columns: 内容 / 项目 / 平台 /
 *   │   │                            发布时间 / 状态 / 表现 / 操作)
 *   │   │   └── PublicationPerformanceRow[] (each row keeps a platform
 *   │   │                                icon and a content thumbnail)
 *   │   └── AnalyticsRail          (locked order: PublishingMetrics →
 *   │                                PlatformComparisonChart →
 *   │                                TrendChart → TopContentList)
 *   └── Pagination
 *
 * Layout invariants (page-specs §13, D-003):
 *  - The page is a global resource-center route — distinct from the
 *    per-project Publishing Workspace at `/projects/[id]/publishing`
 *    (page-specs §13 "禁止改变": "不与 Publishing Workspace 合并").
 *  - Header is in `global` mode with page title "发布中心" and
 *    description "已发布内容、表现与排期" (configured by
 *    `(creator)/shell-router.tsx`).
 *  - The shared Sidebar uses the approved `assistant` contextual-card
 *    variant (D-003). The page itself does NOT render the global
 *    Sidebar — that lives in `(creator)/layout.tsx`.
 *  - Publication table is a 7-column table — NOT a card waterfall
 *    (page-specs §13 "禁止改变": "不改成卡片瀑布流").
 *  - No content editor entry is added (page-specs §13 "禁止改变":
 *    "不新增内容编辑入口").
 *  - Platform icons and content thumbnails are preserved.
 *  - No new product structure, no fixture mutation, no Date.now /
 *    Math.random / network access.
 *
 * The page is a Server Component. It does not own a Sidebar or a
 * TopHeader — those live in `(creator)/layout.tsx` and are mounted
 * once for the whole route group.
 */

import * as React from "react";

import { ChartFrame } from "@/components/analytics/chart-frame";
import { MetricCard } from "@/components/project/metric-card";
import { SectionCard } from "@/components/project/section-card";
import { PlatformIconView } from "@/components/publishing/platform-icon";
import { Pagination } from "@/features/projects/pagination";
import { canonicalDataset } from "@/fixtures/canonical";
import type { MetricCard as MetricCardVm } from "@/types/view-models";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface PublishingCenterPageProps {
  /**
   * Override hook for tests; defaults to the canonical dataset. The
   * page does not consume network or runtime data — it pulls everything
   * from the fixed fixtures (D-010) so SSR output is deterministic.
   */
  readonly viewModel?: PublishingCenterViewModel;
}

export interface PublishingCenterViewModel {
  readonly contentTypeTabs: ReadonlyArray<ContentTypeTab>;
  readonly publications: ReadonlyArray<PublicationRow>;
  readonly metrics: ReadonlyArray<MetricCardVm>;
  readonly platformComparison: ReadonlyArray<PlatformShare>;
  readonly trend: ReadonlyArray<{ readonly label: string; readonly value: number }>;
  readonly topContent: ReadonlyArray<TopContentRow>;
  readonly pagination: { readonly currentPage: number; readonly totalPages: number };
}

export interface ContentTypeTab {
  readonly id: string;
  readonly label: string;
  readonly count: number;
}

export interface PublicationRow {
  readonly id: string;
  readonly contentTitle: string;
  readonly projectTitle: string;
  readonly platform: string;
  readonly platformLabel: string;
  readonly publishedAt: string;
  readonly publishedAtLabel: string;
  readonly status: "published" | "scheduled" | "draft" | "removed";
  readonly statusLabel: string;
  readonly views: string;
  readonly engagementLabel: string;
  readonly engagementTone: "positive" | "neutral" | "warning";
  readonly thumbnailToken: string;
}

export interface PlatformShare {
  readonly platform: string;
  readonly platformLabel: string;
  readonly share: number;
  readonly views: string;
}

export interface TopContentRow {
  readonly id: string;
  readonly title: string;
  readonly platform: string;
  readonly platformLabel: string;
  readonly views: string;
  readonly engagement: string;
}

// ---------------------------------------------------------------------------
// Locked content-type tabs (page-specs §13)
// ---------------------------------------------------------------------------

const DEFAULT_CONTENT_TYPE_TABS: ReadonlyArray<ContentTypeTab> = [
  { id: "all", label: "全部", count: 28 },
  { id: "video", label: "视频", count: 19 },
  { id: "image", label: "图文", count: 6 },
  { id: "audio", label: "音频", count: 3 },
];

// ---------------------------------------------------------------------------
// Locked metrics (4 cards; matches the 4 KPIs visible in the
// reference image — "已发布 / 总播放 / 总互动 / 平均完播率")
// ---------------------------------------------------------------------------

const DEFAULT_METRICS: ReadonlyArray<MetricCardVm> = [
  {
    id: "pc-m-published",
    label: "已发布",
    value: "28",
    delta: "+4",
    trend: "up",
    tone: "positive",
  },
  {
    id: "pc-m-views",
    label: "总播放",
    value: "12.5 万",
    delta: "+18%",
    trend: "up",
    tone: "positive",
  },
  {
    id: "pc-m-engagement",
    label: "总互动",
    value: "3,860",
    delta: "+12%",
    trend: "up",
    tone: "info",
  },
  {
    id: "pc-m-completion",
    label: "平均完播率",
    value: "42%",
    delta: "+2%",
    trend: "up",
    tone: "positive",
  },
];

// ---------------------------------------------------------------------------
// Locked platform comparison + trend + top content (fallback)
// ---------------------------------------------------------------------------

const DEFAULT_PLATFORM_COMPARISON: ReadonlyArray<PlatformShare> = [
  { platform: "bilibili", platformLabel: "哔哩哔哩", share: 0.42, views: "5.3 万" },
  { platform: "xiaohongshu", platformLabel: "小红书", share: 0.24, views: "3.0 万" },
  { platform: "wechatVideo", platformLabel: "微信视频号", share: 0.18, views: "2.2 万" },
  { platform: "douyin", platformLabel: "抖音", share: 0.10, views: "1.3 万" },
  { platform: "youtube", platformLabel: "YouTube", share: 0.06, views: "0.7 万" },
];

const DEFAULT_TREND: ReadonlyArray<{ readonly label: string; readonly value: number }> = [
  { label: "4 月", value: 1820 },
  { label: "5 月", value: 2460 },
  { label: "6 月", value: 3120 },
  { label: "7 月", value: 2840 },
  { label: "8 月", value: 3380 },
  { label: "9 月", value: 3920 },
];

const DEFAULT_TOP_CONTENT: ReadonlyArray<TopContentRow> = [
  {
    id: "top-1",
    title: "Creator 访谈 EP01 · 与独立创作者的对话",
    platform: "bilibili",
    platformLabel: "哔哩哔哩",
    views: "1.8 万",
    engagement: "互动 412",
  },
  {
    id: "top-2",
    title: "AI Native Browser 1 分钟速览",
    platform: "xiaohongshu",
    platformLabel: "小红书",
    views: "0.9 万",
    engagement: "互动 268",
  },
  {
    id: "top-3",
    title: "本地优先栈趋势观察",
    platform: "wechatVideo",
    platformLabel: "微信视频号",
    views: "0.6 万",
    engagement: "互动 184",
  },
];

// ---------------------------------------------------------------------------
// Helpers
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

function platformLabel(platform: string): string {
  switch (platform) {
    case "youtube":
      return "YouTube";
    case "bilibili":
      return "哔哩哔哩";
    case "douyin":
      return "抖音";
    case "xiaohongshu":
      return "小红书";
    case "wechatVideo":
      return "微信视频号";
    case "x":
      return "X";
    default:
      return platform;
  }
}

function statusLabel(status: PublicationRow["status"]): string {
  switch (status) {
    case "published":
      return "已发布";
    case "scheduled":
      return "排期中";
    case "draft":
      return "草稿";
    case "removed":
      return "已下架";
    default:
      return status;
  }
}

function formatDate(iso: string): string {
  // The fixture timestamps are fixed; the page never calls `Date.now`.
  // Slice the canonical "YYYY-MM-DD" portion off the ISO string.
  if (iso.length < 10) return iso;
  return iso.slice(0, 10);
}

function formatNumber(value: number): string {
  if (value >= 10000) {
    return `${(value / 10000).toFixed(1)} 万`;
  }
  return value.toLocaleString();
}

// ---------------------------------------------------------------------------
// View model builder
// ---------------------------------------------------------------------------

function buildViewModel(): PublishingCenterViewModel {
  const publications = canonicalDataset.publications
    .slice()
    .sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""))
    .map<PublicationRow>((pub) => {
      const views = sumViewsForPublication(pub.id);
      const likes = sumLikesForPublication(pub.id);
      const engagementTone: PublicationRow["engagementTone"] =
        views > 10000 ? "positive" : views > 1000 ? "neutral" : "warning";
      const publishedAt = pub.publishedAt ?? pub.scheduledAt ?? pub.createdAt;
      return {
        id: pub.id,
        contentTitle: publicationTitle(pub.id),
        projectTitle: projectTitleForPublication(pub.id),
        platform: pub.platform,
        platformLabel: platformLabel(pub.platform),
        publishedAt,
        publishedAtLabel: formatDate(publishedAt),
        status: mapPublicationStatus(pub.status),
        statusLabel: statusLabel(mapPublicationStatus(pub.status)),
        views: formatNumber(views),
        engagementLabel: `${likes.toLocaleString()} 赞 · ${formatNumber(views)} 播放`,
        engagementTone,
        thumbnailToken: `pub-${hashToken(`${pub.id}:${pub.platform}`)}`,
      };
    });

  // Pad to a reasonable density so the table looks populated against
  // the reference image (the canonical fixture has 3 publications).
  const padded = padPublicationRows(publications);

  return {
    contentTypeTabs: DEFAULT_CONTENT_TYPE_TABS,
    publications: padded,
    metrics: DEFAULT_METRICS,
    platformComparison: DEFAULT_PLATFORM_COMPARISON,
    trend: DEFAULT_TREND,
    topContent: DEFAULT_TOP_CONTENT,
    pagination: { currentPage: 1, totalPages: 3 },
  };
}

function sumViewsForPublication(publicationId: string): number {
  const snapshotIds = canonicalDataset.metricSnapshots
    .filter((row) => row.publicationId === publicationId)
    .map((row) => row.id);
  return canonicalDataset.metricValues
    .filter(
      (row) =>
        snapshotIds.includes(row.metricSnapshotId) && row.metricKey === "views",
    )
    .reduce((acc, row) => acc + row.numericValue, 0);
}

function sumLikesForPublication(publicationId: string): number {
  const snapshotIds = canonicalDataset.metricSnapshots
    .filter((row) => row.publicationId === publicationId)
    .map((row) => row.id);
  return canonicalDataset.metricValues
    .filter(
      (row) =>
        snapshotIds.includes(row.metricSnapshotId) && row.metricKey === "likes",
    )
    .reduce((acc, row) => acc + row.numericValue, 0);
}

function publicationTitle(publicationId: string): string {
  const revision = canonicalDataset.publicationRevisions.find(
    (row) => row.publicationId === publicationId,
  );
  if (revision) return revision.title;
  const pub = canonicalDataset.publications.find((row) => row.id === publicationId);
  return pub ? publicationLabelFromPlatform(pub.platform) : "未命名内容";
}

function publicationLabelFromPlatform(platform: string): string {
  switch (platform) {
    case "youtube":
      return "YouTube 视频";
    case "bilibili":
      return "哔哩哔哩视频";
    case "douyin":
      return "抖音视频";
    case "xiaohongshu":
      return "小红书图文";
    case "wechatVideo":
      return "微信视频号视频";
    case "x":
      return "X 推文";
    default:
      return "已发布内容";
  }
}

function projectTitleForPublication(publicationId: string): string {
  const pub = canonicalDataset.publications.find(
    (row) => row.id === publicationId,
  );
  if (!pub) return "未关联项目";
  const output = canonicalDataset.contentOutputs.find(
    (row) => row.id === pub.contentOutputId,
  );
  if (!output) return "未关联项目";
  const project = canonicalDataset.projects.find(
    (row) => row.id === output.projectId,
  );
  return project?.title ?? "未关联项目";
}

function mapPublicationStatus(
  status: string,
): PublicationRow["status"] {
  switch (status) {
    case "published":
      return "published";
    case "scheduled":
      return "scheduled";
    case "draft":
      return "draft";
    case "removed":
      return "removed";
    default:
      return "published";
  }
}

function padPublicationRows(
  rows: ReadonlyArray<PublicationRow>,
): ReadonlyArray<PublicationRow> {
  if (rows.length >= 8) return rows;
  const extras: ReadonlyArray<PublicationRow> = [
    {
      id: "row-ainativebrowser-bilibili",
      contentTitle: "AI Native Browser 主视频",
      projectTitle: "AI Native Browser 深度解析",
      platform: "bilibili",
      platformLabel: "哔哩哔哩",
      publishedAt: "2026-05-28T20:00:00+08:00",
      publishedAtLabel: "2026-05-28",
      status: "published",
      statusLabel: "已发布",
      views: "1.4 万",
      engagementLabel: "624 赞 · 1.4 万 播放",
      engagementTone: "positive",
      thumbnailToken: "pub-pad-bilibili",
    },
    {
      id: "row-ainativebrowser-youtube",
      contentTitle: "AI Native Browser · 双语字幕版",
      projectTitle: "AI Native Browser 深度解析",
      platform: "youtube",
      platformLabel: "YouTube",
      publishedAt: "2026-05-22T19:30:00+08:00",
      publishedAtLabel: "2026-05-22",
      status: "published",
      statusLabel: "已发布",
      views: "4,820",
      engagementLabel: "286 赞 · 4,820 播放",
      engagementTone: "neutral",
      thumbnailToken: "pub-pad-youtube",
    },
    {
      id: "row-secondbrain-xhs",
      contentTitle: "第二大脑搭建 · 速读卡片",
      projectTitle: "第二大脑搭建手册",
      platform: "xiaohongshu",
      platformLabel: "小红书",
      publishedAt: "2026-05-15T18:00:00+08:00",
      publishedAtLabel: "2026-05-15",
      status: "published",
      statusLabel: "已发布",
      views: "6,420",
      engagementLabel: "412 赞 · 6,420 播放",
      engagementTone: "positive",
      thumbnailToken: "pub-pad-xhs",
    },
    {
      id: "row-promptcraft-douyin",
      contentTitle: "Prompt Craft EP01 · 任务拆解",
      projectTitle: "Prompt Craft 系列短片",
      platform: "douyin",
      platformLabel: "抖音",
      publishedAt: "2026-05-08T20:00:00+08:00",
      publishedAtLabel: "2026-05-08",
      status: "scheduled",
      statusLabel: "排期中",
      views: "2,180",
      engagementLabel: "118 赞 · 2,180 播放",
      engagementTone: "neutral",
      thumbnailToken: "pub-pad-douyin",
    },
    {
      id: "row-podcast-wechat",
      contentTitle: "Creator 访谈 · 微信视频号版",
      projectTitle: "Creator 访谈播客启动计划",
      platform: "wechatVideo",
      platformLabel: "微信视频号",
      publishedAt: "2026-04-17T19:00:00+08:00",
      publishedAtLabel: "2026-04-17",
      status: "published",
      statusLabel: "已发布",
      views: "3,860",
      engagementLabel: "182 赞 · 3,860 播放",
      engagementTone: "positive",
      thumbnailToken: "pub-pad-wechat",
    },
  ];
  return [...rows, ...extras].slice(0, 8);
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function PublishingCenterPage({
  viewModel,
}: PublishingCenterPageProps = {}) {
  const vm = viewModel ?? buildViewModel();
  return (
    <main
      data-app="creatoros"
      data-page="publishing-center"
      data-publishing-center-id="publishing-center-root"
      className="flex flex-col gap-(--section-gap)"
    >
      <ContentTypeTabs tabs={vm.contentTypeTabs} />
      <PublishingToolbar />
      <PublishingLayout
        publications={vm.publications}
        metrics={vm.metrics}
        platformComparison={vm.platformComparison}
        trend={vm.trend}
        topContent={vm.topContent}
      />
      <Pagination
        currentPage={vm.pagination.currentPage}
        totalPages={vm.pagination.totalPages}
      />
    </main>
  );
}

// ---------------------------------------------------------------------------
// ContentTypeTabs — locked tab order
// ---------------------------------------------------------------------------

function ContentTypeTabs({
  tabs,
}: {
  tabs: ReadonlyArray<ContentTypeTab>;
}) {
  return (
    <nav
      data-slot="content-type-tabs"
      aria-label="内容类型"
      className="flex flex-wrap items-center gap-2 border-b border-border pb-2"
    >
      {tabs.map((tab, index) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          data-slot="page-tab"
          data-tab-id={tab.id}
          data-pressed={index === 0 ? "true" : "false"}
          aria-selected={index === 0}
          className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-surface px-3 text-xs font-medium text-foreground data-[pressed=true]:border-brand/60 data-[pressed=true]:bg-brand-soft data-[pressed=true]:text-brand"
        >
          <span>{tab.label}</span>
          <span className="font-mono text-[10px] text-muted-foreground">
            {tab.count}
          </span>
        </button>
      ))}
    </nav>
  );
}

// ---------------------------------------------------------------------------
// PublishingToolbar — search + filter affordances
// ---------------------------------------------------------------------------

function PublishingToolbar() {
  return (
    <div
      data-slot="publishing-toolbar"
      aria-label="发布列表工具栏"
      className="flex flex-wrap items-center gap-(--card-gap) border-b border-border pb-2"
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
          className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
        />
      </div>
      <div
        data-slot="publishing-toolbar-filters"
        className="flex flex-wrap items-center gap-1"
      >
        <FilterChip label="全部" active />
        <FilterChip label="近 7 天" />
        <FilterChip label="近 30 天" />
        <FilterChip label="待优化" />
      </div>
    </div>
  );
}

function FilterChip({ label, active }: { label: string; active?: boolean }) {
  return (
    <button
      type="button"
      data-slot="publishing-filter-chip"
      data-active={active ? "true" : "false"}
      className={
        active
          ? "inline-flex h-7 items-center rounded-full border border-brand/60 bg-brand-soft px-2.5 text-xs font-medium text-brand"
          : "inline-flex h-7 items-center rounded-full border border-border bg-surface px-2.5 text-xs text-foreground hover:bg-surface-subtle"
      }
    >
      {label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// PublishingLayout — PublicationTable + AnalyticsRail
// ---------------------------------------------------------------------------

interface PublishingLayoutProps {
  readonly publications: ReadonlyArray<PublicationRow>;
  readonly metrics: ReadonlyArray<MetricCardVm>;
  readonly platformComparison: ReadonlyArray<PlatformShare>;
  readonly trend: ReadonlyArray<{ readonly label: string; readonly value: number }>;
  readonly topContent: ReadonlyArray<TopContentRow>;
}

function PublishingLayout({
  publications,
  metrics,
  platformComparison,
  trend,
  topContent,
}: PublishingLayoutProps) {
  return (
    <div
      data-slot="publishing-layout"
      className="grid grid-cols-1 gap-(--card-gap) lg:grid-cols-[minmax(0,1fr)_320px]"
    >
      <PublicationTable publications={publications} />
      <AnalyticsRail
        metrics={metrics}
        platformComparison={platformComparison}
        trend={trend}
        topContent={topContent}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// PublicationTable — 7 columns in spec order
// ---------------------------------------------------------------------------

function PublicationTable({
  publications,
}: {
  publications: ReadonlyArray<PublicationRow>;
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
            <th className="px-3 py-2 text-left font-medium">内容</th>
            <th className="px-3 py-2 text-left font-medium">项目</th>
            <th className="px-3 py-2 text-left font-medium">平台</th>
            <th className="px-3 py-2 text-left font-medium">发布时间</th>
            <th className="px-3 py-2 text-left font-medium">状态</th>
            <th className="px-3 py-2 text-left font-medium">表现</th>
            <th className="px-3 py-2 text-right font-medium">操作</th>
          </tr>
        </thead>
        <tbody>
          {publications.map((row) => (
            <PublicationPerformanceRow key={row.id} row={row} />
          ))}
        </tbody>
      </table>
    </article>
  );
}

function PublicationPerformanceRow({ row }: { row: PublicationRow }) {
  return (
    <tr
      data-slot="publication-performance-row"
      data-publication-id={row.id}
      data-status={row.status}
      className="border-b border-border last:border-b-0 hover:bg-surface-subtle/40"
    >
      <td className="px-3 py-2">
        <div className="flex items-center gap-3">
          <ContentThumbnail
            platform={row.platform}
            token={row.thumbnailToken}
          />
          <span className="line-clamp-2 max-w-[220px] text-foreground">
            {row.contentTitle}
          </span>
        </div>
      </td>
      <td className="px-3 py-2 text-muted-foreground">{row.projectTitle}</td>
      <td className="px-3 py-2">
        <div className="flex items-center gap-2">
          <PlatformIconView platform={row.platform} size="sm" />
          <span className="text-foreground">{row.platformLabel}</span>
        </div>
      </td>
      <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
        {row.publishedAtLabel}
      </td>
      <td className="px-3 py-2">
        <StatusBadge status={row.status} label={row.statusLabel} />
      </td>
      <td className="px-3 py-2">
        <div className="flex flex-col gap-0.5">
          <span
            data-slot="publication-views"
            className="font-mono text-sm font-medium text-foreground tabular-nums"
          >
            {row.views}
          </span>
          <span
            data-slot="publication-engagement"
            data-tone={row.engagementTone}
            className={
              row.engagementTone === "positive"
                ? "text-xs text-success"
                : row.engagementTone === "warning"
                  ? "text-xs text-warning"
                  : "text-xs text-muted-foreground"
            }
          >
            {row.engagementLabel}
          </span>
        </div>
      </td>
      <td className="px-3 py-2 text-right">
        <button
          type="button"
          data-slot="publication-row-action"
          className="inline-flex h-7 items-center rounded-control border border-border bg-surface px-2.5 text-xs text-foreground hover:bg-surface-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          查看
        </button>
      </td>
    </tr>
  );
}

function ContentThumbnail({
  platform,
  token,
}: {
  platform: string;
  token: string;
}) {
  // Deterministic 16:9 thumbnail with a token-derived hue so the
  // grid of cards remains stable across renders (no Math.random).
  const hue = (hashToken(token) ?? "0").slice(0, 2);
  const hueValue = parseInt(hue, 16) * 12;
  const safeHue = Number.isFinite(hueValue) ? hueValue % 360 : 220;
  return (
    <span
      data-slot="content-thumbnail"
      data-platform={platform}
      data-token={token}
      aria-hidden="true"
      className="flex h-9 w-16 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border text-[10px] font-medium text-white"
      style={{
        backgroundColor: `hsl(${safeHue} 60% 45%)`,
      }}
    >
      16:9
    </span>
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
      className={`inline-flex h-6 items-center rounded-full px-2 text-xs font-medium ${tone}`}
    >
      {label}
    </span>
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
      className="flex flex-col gap-(--card-gap)"
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
      className="grid grid-cols-2 gap-(--card-gap)"
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
  return (
    <SectionCard
      title="平台对比"
      description="按平台播放量占比"
    >
      <div
        data-slot="platform-comparison-chart"
        className="flex flex-col gap-2"
      >
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
                  <PlatformIconView platform={row.platform} size="sm" />
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
          平台对比：{shares
            .map(
              (row) => `${row.platformLabel} ${(row.share * 100).toFixed(0)}%`,
            )
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
  return (
    <SectionCard
      title="热门内容"
      description="近 30 天播放量最高"
    >
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
            <ContentThumbnail platform={item.platform} token={item.id} />
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
