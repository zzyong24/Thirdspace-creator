/**
 * Global Search page (Task 23 / page-specs §15).
 *
 * The `/search` global resource-center landing page. The TopHeader
 * is in `search` mode and renders the global search field; this
 * page composes the result surface below it.
 *
 * Composes, in the spec order:
 *   SearchPage
 *   ├── GlobalSearchHeader (hosted by the shared TopHeader; the page
 *   │                        renders only the duplicate page-level
 *   │                        input for redundancy / accessibility —
 *   │                        see SearchInteractiveRegion)
 *   ├── ResultTypeTabs
 *   ├── SearchResults
 *   │   ├── ProjectResultSection    (3 cards horizontally)
 *   │   ├── KnowledgeResultSection
 *   │   ├── AssetResultSection      (thumbnails horizontally)
 *   │   └── VideoResultSection      (thumbnails horizontally)
 *   └── SearchSideRail
 *       ├── SearchFilters
 *       ├── QuickActions
 *       ├── SearchHistory
 *       └── SearchTips
 *
 * Layout invariants (page-specs §15, D-003, D-005):
 *  - The route is a global resource-center route. There is no
 *    project identity block, no second AppShell, and no second
 *    Sidebar/TopHeader. The Header region stays in `search` mode
 *    with the page title "全局搜索".
 *  - The contextual card variant is `assistant` (D-003, configured
 *    by `(creator)/shell-router.tsx`).
 *  - ResultTypeTabs render in the locked order
 *    (项目 / 知识 / 素材 / 视频).
 *  - The ProjectResultSection renders exactly THREE project cards
 *    in a horizontal layout.
 *  - AssetResultSection and VideoResultSection render thumbnails
 *    in a horizontal layout.
 *  - SearchSideRail order is exactly:
 *      SearchFilters → QuickActions → SearchHistory → SearchTips.
 *  - The page exposes a single `?q=...` URL state which is
 *    reflected in the page-level input value and in the result
 *    filtering (declarative two-way data flow through the
 *    SearchInteractiveRegion client island).
 *  - No new dependencies, no fixture mutation, no `Date.now` /
 *    `Math.random` / network access.
 *
 * The page is a Server Component. The `?q=...` URL sync is
 * delegated to a small client island
 * (`search-interactive-region.tsx`) so the page itself stays
 * server-rendered.
 */

import * as React from "react";

import { SectionCard } from "@/components/project/section-card";
import { TagChip } from "@/components/content/tag-chip";
import { PlatformIconView } from "@/components/publishing/platform-icon";
import { canonicalDataset } from "@/fixtures/canonical";

import { SearchInteractiveRegion } from "./search-interactive-region";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface SearchPageProps {
  /**
   * Override hook for tests; defaults to the canonical dataset.
   * The page does not consume network or runtime data — it pulls
   * everything from the fixed fixtures (D-010) so SSR output is
   * deterministic.
   */
  readonly viewModel?: SearchViewModel;
  /**
   * Override hook for the initial query. Server components cannot
   * read `useSearchParams()`; the page receives the resolved query
   * as a prop from its route entrypoint.
   */
  readonly initialQuery?: string;
}

export interface SearchViewModel {
  readonly resultTypeTabs: ReadonlyArray<ResultTypeTab>;
  readonly projectResults: ReadonlyArray<ProjectResult>;
  readonly knowledgeResults: ReadonlyArray<KnowledgeResult>;
  readonly assetResults: ReadonlyArray<AssetResult>;
  readonly videoResults: ReadonlyArray<VideoResult>;
  readonly filters: ReadonlyArray<SearchFilterOption>;
  readonly quickActions: ReadonlyArray<QuickAction>;
  readonly history: ReadonlyArray<HistoryItem>;
  readonly tips: ReadonlyArray<string>;
}

export interface ResultTypeTab {
  readonly id: string;
  readonly label: string;
  readonly count: number;
}

export interface ProjectResult {
  readonly id: string;
  readonly title: string;
  readonly currentStage: string;
  readonly currentStageLabel: string;
  readonly progressPct: number;
  readonly statusLabel: string;
  readonly brief: string;
  readonly tags: ReadonlyArray<string>;
}

export interface KnowledgeResult {
  readonly id: string;
  readonly title: string;
  readonly typeLabel: string;
  readonly updatedAt: string;
  readonly excerpt: string;
}

export interface AssetResult {
  readonly id: string;
  readonly title: string;
  readonly typeLabel: string;
  readonly token: string;
}

export interface VideoResult {
  readonly id: string;
  readonly title: string;
  readonly platform: string;
  readonly platformLabel: string;
  readonly publishedAtLabel: string;
  readonly views: string;
  readonly token: string;
}

export interface SearchFilterOption {
  readonly id: string;
  readonly label: string;
  readonly count: number;
  readonly tone: "neutral" | "brand" | "success" | "warning" | "info";
}

export interface QuickAction {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly href: string;
}

export interface HistoryItem {
  readonly id: string;
  readonly query: string;
  readonly resultCount: number;
  readonly searchedAtLabel: string;
}

// ---------------------------------------------------------------------------
// Locked default view model
// ---------------------------------------------------------------------------

const STAGE_LABELS: Record<string, string> = {
  research: "研究",
  planning: "策划",
  script: "脚本",
  production: "拍摄",
  publishing: "发布",
  review: "复盘",
};

const STAGE_TONES: Record<string, "neutral" | "brand" | "info" | "success" | "warning"> = {
  research: "info",
  planning: "brand",
  script: "warning",
  production: "warning",
  publishing: "success",
  review: "neutral",
};

const RESULT_TYPE_TABS: ReadonlyArray<ResultTypeTab> = [
  { id: "project", label: "项目", count: 12 },
  { id: "knowledge", label: "知识", count: 38 },
  { id: "asset", label: "素材", count: 84 },
  { id: "video", label: "视频", count: 19 },
];

const DEFAULT_FILTERS: ReadonlyArray<SearchFilterOption> = [
  { id: "f-type", label: "类型", count: 4, tone: "neutral" },
  { id: "f-stage", label: "阶段", count: 6, tone: "neutral" },
  { id: "f-tag", label: "标签", count: 28, tone: "brand" },
  { id: "f-date", label: "更新时间", count: 5, tone: "info" },
  { id: "f-author", label: "作者", count: 3, tone: "neutral" },
];

const DEFAULT_QUICK_ACTIONS: ReadonlyArray<QuickAction> = [
  {
    id: "qa-new-project",
    label: "新建项目",
    description: "从一个空模板开始",
    href: "/projects/new",
  },
  {
    id: "qa-knowledge",
    label: "查看知识库",
    description: "浏览所有沉淀的笔记",
    href: "/knowledge",
  },
  {
    id: "qa-assets",
    label: "上传素材",
    description: "跳转到素材中心",
    href: "/assets",
  },
];

const DEFAULT_TIPS: ReadonlyArray<string> = [
  "使用空格分隔多个关键词",
  "用「类型:」前缀过滤，例如 type:project",
  "在搜索框里直接回车跳到第一条结果",
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

function formatDate(iso: string): string {
  if (iso.length < 10) return iso;
  return iso.slice(0, 10);
}

function knowledgeTypeLabel(type: string): string {
  switch (type) {
    case "note":
      return "笔记";
    case "reference":
      return "参考";
    case "inspiration":
      return "灵感";
    case "snippet":
      return "片段";
    case "transcript":
      return "记录";
    default:
      return type;
  }
}

function assetTypeLabel(type: string): string {
  switch (type) {
    case "image":
      return "图片";
    case "video":
      return "视频";
    case "audio":
      return "音频";
    case "document":
      return "文档";
    case "subtitle":
      return "字幕";
    default:
      return type;
  }
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

function statusLabel(status: string): string {
  switch (status) {
    case "active":
      return "进行中";
    case "paused":
      return "已暂停";
    case "archived":
      return "已归档";
    case "completed":
      return "已完成";
    default:
      return status;
  }
}

function tagsForEntity(
  entityType: "project" | "knowledge" | "asset",
  entityId: string,
): ReadonlyArray<string> {
  const links = canonicalDataset.entityTags.filter(
    (row) => row.entityType === entityType && row.entityId === entityId,
  );
  return links
    .map(
      (link) => canonicalDataset.tags.find((tag) => tag.id === link.tagId)?.name,
    )
    .filter((name): name is string => Boolean(name));
}

function publicationTitle(publicationId: string): string {
  const revision = canonicalDataset.publicationRevisions.find(
    (row) => row.publicationId === publicationId,
  );
  if (revision) return revision.title;
  const pub = canonicalDataset.publications.find(
    (row) => row.id === publicationId,
  );
  return pub ? `${platformLabel(pub.platform)} 内容` : "未命名内容";
}

function publicationViews(publicationId: string): number {
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

function formatViews(value: number): string {
  if (value >= 10000) return `${(value / 10000).toFixed(1)} 万`;
  return value.toLocaleString();
}

function relativeDate(iso: string): string {
  // The canonical dataset ships fixed timestamps. We translate them
  // to a coarse "x days ago" label so the search history list stays
  // human-readable without ever invoking `Date.now`. The mapping
  // uses the FIXED_NOW anchor baked into the canonical dataset.
  const FIXED_NOW_ISO = "2026-06-13T10:00:00+08:00";
  const fixedMs = new Date(FIXED_NOW_ISO).getTime();
  const ms = new Date(iso).getTime();
  const diffDays = Math.max(
    0,
    Math.floor((fixedMs - ms) / (24 * 60 * 60 * 1000)),
  );
  if (diffDays <= 0) return "今天";
  if (diffDays === 1) return "昨天";
  if (diffDays < 7) return `${diffDays} 天前`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} 周前`;
  return `${Math.floor(diffDays / 30)} 个月前`;
}

// ---------------------------------------------------------------------------
// View model builder
// ---------------------------------------------------------------------------

function buildViewModel(): SearchViewModel {
  const projects = canonicalDataset.projects.slice(0, 3).map<ProjectResult>(
    (project) => ({
      id: project.id,
      title: project.title,
      currentStage: project.currentStage,
      currentStageLabel: STAGE_LABELS[project.currentStage] ?? project.currentStage,
      progressPct: project.progressPct,
      statusLabel: statusLabel(project.status),
      brief: project.brief,
      tags: tagsForEntity("project", project.id),
    }),
  );

  const knowledge = canonicalDataset.knowledgeItems
    .slice(0, 4)
    .map<KnowledgeResult>((item) => {
      const revision = canonicalDataset.knowledgeRevisions.find(
        (row) => row.knowledgeItemId === item.id,
      );
      return {
        id: item.id,
        title: item.title,
        typeLabel: knowledgeTypeLabel(item.knowledgeType),
        updatedAt: formatDate(item.updatedAt),
        excerpt: revision?.content?.slice(0, 80) ?? "暂无摘要",
      };
    });

  const assets = canonicalDataset.assets.slice(0, 4).map<AssetResult>(
    (asset) => ({
      id: asset.id,
      title: asset.name,
      typeLabel: assetTypeLabel(asset.assetType),
      token: `asset-${hashToken(asset.id)}`,
    }),
  );

  const videos = canonicalDataset.publications
    .slice(0, 4)
    .map<VideoResult>((pub) => ({
      id: pub.id,
      title: publicationTitle(pub.id),
      platform: pub.platform,
      platformLabel: platformLabel(pub.platform),
      publishedAtLabel: formatDate(pub.publishedAt ?? pub.createdAt),
      views: formatViews(publicationViews(pub.id)),
      token: `video-${hashToken(`${pub.id}:${pub.platform}`)}`,
    }));

  const history = canonicalDataset.searchHistory.map<HistoryItem>(
    (row) => ({
      id: row.id,
      query: row.query,
      resultCount: row.resultCount,
      searchedAtLabel: relativeDate(row.searchedAt),
    }),
  );

  return {
    resultTypeTabs: RESULT_TYPE_TABS,
    projectResults: projects,
    knowledgeResults: knowledge,
    assetResults: assets,
    videoResults: videos,
    filters: DEFAULT_FILTERS,
    quickActions: DEFAULT_QUICK_ACTIONS,
    history,
    tips: DEFAULT_TIPS,
  };
}

// ---------------------------------------------------------------------------
// Filter helpers
// ---------------------------------------------------------------------------

function matchesQuery(haystack: string | undefined, query: string): boolean {
  if (!query) return true;
  if (!haystack) return false;
  return haystack.toLowerCase().includes(query.toLowerCase());
}

function applyQuery(
  vm: SearchViewModel,
  query: string,
): SearchViewModel {
  if (!query) return vm;
  const matchProject = (row: ProjectResult) =>
    matchesQuery(row.title, query) ||
    matchesQuery(row.brief, query) ||
    row.tags.some((tag) => matchesQuery(tag, query));
  const matchKnowledge = (row: KnowledgeResult) =>
    matchesQuery(row.title, query) || matchesQuery(row.excerpt, query);
  const matchAsset = (row: AssetResult) =>
    matchesQuery(row.title, query) || matchesQuery(row.typeLabel, query);
  const matchVideo = (row: VideoResult) =>
    matchesQuery(row.title, query) || matchesQuery(row.platformLabel, query);
  return {
    ...vm,
    projectResults: vm.projectResults.filter(matchProject),
    knowledgeResults: vm.knowledgeResults.filter(matchKnowledge),
    assetResults: vm.assetResults.filter(matchAsset),
    videoResults: vm.videoResults.filter(matchVideo),
  };
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function SearchPage({
  viewModel,
  initialQuery = "",
}: SearchPageProps = {}) {
  const baseVm = viewModel ?? buildViewModel();
  const vm = applyQuery(baseVm, initialQuery);
  return (
    <main
      data-app="creatoros"
      data-page="search"
      data-search-id="search-root"
      className="flex flex-col gap-(--section-gap)"
    >
      <SearchInteractiveRegion
        initialQuery={initialQuery}
        placeholder="搜索项目、素材、知识或视频"
      />
      <ResultTypeTabs tabs={vm.resultTypeTabs} />
      <div
        data-slot="search-layout"
        className="grid grid-cols-1 gap-(--card-gap) lg:grid-cols-[minmax(0,1fr)_320px]"
      >
        <SearchResults
          projects={vm.projectResults}
          knowledge={vm.knowledgeResults}
          assets={vm.assetResults}
          videos={vm.videoResults}
        />
        <SearchSideRail
          filters={vm.filters}
          quickActions={vm.quickActions}
          history={vm.history}
          tips={vm.tips}
        />
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------
// ResultTypeTabs
// ---------------------------------------------------------------------------

function ResultTypeTabs({
  tabs,
}: {
  tabs: ReadonlyArray<ResultTypeTab>;
}) {
  return (
    <nav
      data-slot="result-type-tabs"
      aria-label="搜索结果类型"
      className="flex flex-wrap items-center gap-2 border-b border-border pb-2"
    >
      {tabs.map((tab, index) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          data-slot="result-type-tab"
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
// SearchResults
// ---------------------------------------------------------------------------

function SearchResults({
  projects,
  knowledge,
  assets,
  videos,
}: {
  readonly projects: ReadonlyArray<ProjectResult>;
  readonly knowledge: ReadonlyArray<KnowledgeResult>;
  readonly assets: ReadonlyArray<AssetResult>;
  readonly videos: ReadonlyArray<VideoResult>;
}) {
  return (
    <div
      data-slot="search-results"
      className="flex flex-col gap-(--card-gap)"
    >
      <ProjectResultSection projects={projects} />
      <KnowledgeResultSection rows={knowledge} />
      <AssetResultSection items={assets} />
      <VideoResultSection items={videos} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// ProjectResultSection — 3 cards horizontally
// ---------------------------------------------------------------------------

function ProjectResultSection({
  projects,
}: {
  projects: ReadonlyArray<ProjectResult>;
}) {
  return (
    <SectionCard title="项目" description="按相关度排序的匹配项目">
      <div
        data-slot="project-result-section"
        className="grid grid-cols-1 gap-(--card-gap) sm:grid-cols-2 lg:grid-cols-3"
      >
        {projects.map((project) => (
          <ProjectResultCard key={project.id} project={project} />
        ))}
      </div>
    </SectionCard>
  );
}

function ProjectResultCard({ project }: { project: ProjectResult }) {
  return (
    <article
      data-slot="project-result-card"
      data-project-id={project.id}
      data-stage={project.currentStage}
      className="flex flex-col gap-2 rounded-xl border border-border bg-surface-subtle p-3"
    >
      <header className="flex items-start justify-between gap-2">
        <h3 className="line-clamp-1 text-sm font-medium text-foreground">
          {project.title}
        </h3>
        <span
          data-slot="project-result-stage"
          data-tone={STAGE_TONES[project.currentStage] ?? "neutral"}
          className="inline-flex h-5 shrink-0 items-center rounded-full bg-surface px-2 text-[10px] font-medium text-muted-foreground"
        >
          {project.currentStageLabel}
        </span>
      </header>
      <p className="line-clamp-2 text-xs text-muted-foreground">
        {project.brief}
      </p>
      <div className="flex items-center gap-2">
        <div
          aria-hidden="true"
          className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface"
        >
          <div
            className="h-full bg-brand"
            style={{ width: `${project.progressPct}%` }}
          />
        </div>
        <span className="font-mono text-[10px] text-muted-foreground">
          {project.progressPct}%
        </span>
      </div>
      <div className="flex flex-wrap gap-1">
        {project.tags.slice(0, 3).map((tag) => (
          <TagChip key={`${project.id}-${tag}`} label={tag} tone="neutral" size="sm" />
        ))}
      </div>
      <span className="text-[10px] text-muted-foreground">
        {project.statusLabel}
      </span>
    </article>
  );
}

// ---------------------------------------------------------------------------
// KnowledgeResultSection
// ---------------------------------------------------------------------------

function KnowledgeResultSection({
  rows,
}: {
  rows: ReadonlyArray<KnowledgeResult>;
}) {
  return (
    <SectionCard title="知识" description="匹配的知识条目">
      <ul
        data-slot="knowledge-result-section"
        className="flex flex-col gap-2"
        aria-label="知识搜索结果"
      >
        {rows.map((row) => (
          <li
            key={row.id}
            data-slot="knowledge-result-row"
            data-knowledge-id={row.id}
            className="flex flex-col gap-1 rounded-md border border-border bg-surface-subtle p-3 text-sm"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="truncate font-medium text-foreground">
                {row.title}
              </span>
              <span className="text-[10px] text-muted-foreground">
                {row.typeLabel}
              </span>
            </div>
            <p className="line-clamp-2 text-xs text-muted-foreground">
              {row.excerpt}
            </p>
            <span className="font-mono text-[10px] text-muted-foreground">
              {row.updatedAt}
            </span>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// AssetResultSection — thumbnails horizontally
// ---------------------------------------------------------------------------

function AssetResultSection({
  items,
}: {
  items: ReadonlyArray<AssetResult>;
}) {
  return (
    <SectionCard title="素材" description="缩略图横向排列">
      <div
        data-slot="asset-result-section"
        className="grid grid-cols-2 gap-(--card-gap) sm:grid-cols-3 lg:grid-cols-4"
      >
        {items.map((item) => (
          <AssetThumb key={item.id} item={item} />
        ))}
      </div>
    </SectionCard>
  );
}

function AssetThumb({ item }: { item: AssetResult }) {
  const hue = parseInt((item.token ?? "0").slice(-2), 16) * 12;
  const safeHue = Number.isFinite(hue) ? hue % 360 : 220;
  return (
    <figure
      data-slot="asset-result-thumb"
      data-asset-id={item.id}
      data-asset-type={item.typeLabel}
      className="flex flex-col gap-1.5"
    >
      <div
        aria-hidden="true"
        className="flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-md border border-border text-[10px] font-medium text-white"
        style={{ backgroundColor: `hsl(${safeHue} 60% 45%)` }}
      >
        {item.typeLabel}
      </div>
      <figcaption className="line-clamp-1 text-xs text-foreground">
        {item.title}
      </figcaption>
    </figure>
  );
}

// ---------------------------------------------------------------------------
// VideoResultSection — thumbnails horizontally
// ---------------------------------------------------------------------------

function VideoResultSection({
  items,
}: {
  items: ReadonlyArray<VideoResult>;
}) {
  return (
    <SectionCard title="视频" description="匹配的视频内容">
      <div
        data-slot="video-result-section"
        className="grid grid-cols-1 gap-(--card-gap) sm:grid-cols-2 lg:grid-cols-4"
      >
        {items.map((item) => (
          <VideoThumb key={item.id} item={item} />
        ))}
      </div>
    </SectionCard>
  );
}

function VideoThumb({ item }: { item: VideoResult }) {
  const hue = parseInt((item.token ?? "0").slice(-2), 16) * 12;
  const safeHue = Number.isFinite(hue) ? hue % 360 : 220;
  return (
    <figure
      data-slot="video-result-thumb"
      data-video-id={item.id}
      data-platform={item.platform}
      className="flex flex-col gap-1.5"
    >
      <div
        aria-hidden="true"
        className="relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-md border border-border text-[10px] font-medium text-white"
        style={{ backgroundColor: `hsl(${safeHue} 60% 45%)` }}
      >
        <span>16:9</span>
        <span className="absolute left-1.5 top-1.5 inline-flex">
          <PlatformIconView platform={item.platform} size="xs" />
        </span>
      </div>
      <figcaption className="flex flex-col gap-0.5 text-xs">
        <span className="line-clamp-1 text-foreground">{item.title}</span>
        <span className="text-muted-foreground">
          {item.platformLabel} · {item.publishedAtLabel} · {item.views}
        </span>
      </figcaption>
    </figure>
  );
}

// ---------------------------------------------------------------------------
// SearchSideRail
// ---------------------------------------------------------------------------

function SearchSideRail({
  filters,
  quickActions,
  history,
  tips,
}: {
  readonly filters: ReadonlyArray<SearchFilterOption>;
  readonly quickActions: ReadonlyArray<QuickAction>;
  readonly history: ReadonlyArray<HistoryItem>;
  readonly tips: ReadonlyArray<string>;
}) {
  return (
    <aside
      data-slot="search-side-rail"
      aria-label="搜索辅助"
      className="flex flex-col gap-(--card-gap)"
    >
      <SearchFilters filters={filters} />
      <QuickActions actions={quickActions} />
      <SearchHistory items={history} />
      <SearchTips tips={tips} />
    </aside>
  );
}

function SearchFilters({
  filters,
}: {
  filters: ReadonlyArray<SearchFilterOption>;
}) {
  return (
    <SectionCard title="筛选" description="按类型、阶段、标签缩小范围">
      <ul
        data-slot="search-filters"
        className="flex flex-col gap-1.5"
        aria-label="搜索筛选"
      >
        {filters.map((filter) => (
          <li
            key={filter.id}
            data-slot="search-filter-row"
            data-filter-id={filter.id}
            className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-surface-subtle"
          >
            <span className="flex items-center gap-2 text-foreground">
              <TagChip label={filter.label} tone={filter.tone} size="sm" />
            </span>
            <span className="font-mono text-xs text-muted-foreground">
              {filter.count}
            </span>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}

function QuickActions({ actions }: { actions: ReadonlyArray<QuickAction> }) {
  return (
    <SectionCard title="快捷操作" description="一键跳转到常用入口">
      <ul
        data-slot="search-quick-actions"
        className="flex flex-col gap-1.5"
        aria-label="搜索快捷操作"
      >
        {actions.map((action) => (
          <li
            key={action.id}
            data-slot="search-quick-action-row"
            data-action-id={action.id}
          >
            <a
              href={action.href}
              className="flex flex-col rounded-md border border-border bg-surface-subtle px-3 py-2 text-sm hover:bg-surface"
            >
              <span className="font-medium text-foreground">
                {action.label}
              </span>
              <span className="text-xs text-muted-foreground">
                {action.description}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}

function SearchHistory({ items }: { items: ReadonlyArray<HistoryItem> }) {
  return (
    <SectionCard title="历史" description="最近的搜索">
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">暂无搜索历史。</p>
      ) : (
        <ul
          data-slot="search-history"
          className="flex flex-col gap-1"
          aria-label="搜索历史"
        >
          {items.map((item) => (
            <li
              key={item.id}
              data-slot="search-history-row"
              data-history-id={item.id}
              className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-surface-subtle"
            >
              <span className="truncate text-foreground">{item.query}</span>
              <span className="ml-2 shrink-0 font-mono text-[10px] text-muted-foreground">
                {item.resultCount} · {item.searchedAtLabel}
              </span>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

function SearchTips({ tips }: { tips: ReadonlyArray<string> }) {
  return (
    <SectionCard title="技巧" description="更精确地搜索">
      <ul
        data-slot="search-tips"
        className="flex flex-col gap-1.5 text-sm text-muted-foreground"
        aria-label="搜索技巧"
      >
        {tips.map((tip, index) => (
          <li
            key={index}
            data-slot="search-tip-row"
            data-tip-index={index}
            className="rounded-md bg-surface-subtle px-2 py-1.5"
          >
            {tip}
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}
