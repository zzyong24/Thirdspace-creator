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
import Link from "next/link";

import { SectionCard } from "@/components/project/section-card";
import { TagChip } from "@/components/content/tag-chip";
import { PlatformIconView } from "@/components/publishing/platform-icon";
import { buildSearchViewModel } from "@/fixtures/selectors";

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

const STAGE_TONES: Record<string, "neutral" | "brand" | "info" | "success" | "warning"> = {
  research: "info",
  planning: "brand",
  script: "warning",
  production: "warning",
  publishing: "success",
  review: "neutral",
};

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
  const baseVm = viewModel ?? buildSearchViewModel();
  const vm = applyQuery(baseVm, initialQuery);
  const totalCount = vm.resultTypeTabs.reduce((acc, t) => acc + t.count, 0);
  return (
    <main
      data-app="creatoros"
      data-page="search"
      data-search-id="search-root"
      className="flex flex-col gap-3"
    >
      {/* The TopHeader already renders the global search input in
          `search` mode; we keep a hidden mirror here so URL `?q=`
          state stays in sync and screen-reader / programmatic users
          can still drive the query. Visually it collapses to zero
          height so the result-type tabs sit directly under the
          header — matching the design rhythm. */}
      <SearchInteractiveRegion
        initialQuery={initialQuery}
        placeholder="搜索项目、素材、知识或视频"
        className="sr-only"
      />
      <ResultTypeTabs tabs={vm.resultTypeTabs} totalCount={totalCount} />
      <div
        data-slot="search-layout"
        className="grid grid-cols-1 gap-card-gap lg:grid-cols-[minmax(0,1fr)_320px]"
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

const FILTER_CHIPS: ReadonlyArray<{ id: string; label: string }> = [
  { id: "chip-ai", label: "AI" },
  { id: "chip-tutorial", label: "教程" },
  { id: "chip-prompt", label: "提示词" },
  { id: "chip-agent", label: "Agent" },
  { id: "chip-monetize", label: "变现" },
  { id: "chip-global", label: "出海" },
];

function ResultTypeTabs({
  tabs,
  totalCount,
}: {
  tabs: ReadonlyArray<ResultTypeTab>;
  totalCount: number;
}) {
  return (
    <div
      data-slot="result-type-tabs-block"
      className="-mt-1 flex flex-col gap-2"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav
          data-slot="result-type-tabs"
          aria-label="搜索结果类型"
          className="flex flex-wrap items-center gap-1.5"
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
              className="inline-flex h-7 items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 text-[12px] font-medium text-foreground data-[pressed=true]:border-brand/60 data-[pressed=true]:bg-brand-soft data-[pressed=true]:text-brand"
            >
              <span>{tab.label}</span>
              <span
                data-slot="result-type-tab-count"
                className="font-mono text-[10px] text-muted-foreground data-[pressed=true]:text-brand/70"
              >
                {tab.count}
              </span>
            </button>
          ))}
        </nav>
        <span
          data-slot="result-type-sort"
          className="text-[11px] text-muted-foreground"
        >
          按相关性排序
        </span>
      </div>
      <div
        data-slot="result-type-meta"
        className="flex items-center justify-between gap-3 text-[11px] text-muted-foreground"
      >
        <span data-slot="result-type-count">
          找到 <span className="font-mono text-foreground">{totalCount}</span> 个结果
        </span>
        <div
          data-slot="result-type-filter-chips"
          className="flex flex-wrap items-center gap-1.5"
        >
          {FILTER_CHIPS.map((chip) => (
            <button
              key={chip.id}
              type="button"
              data-slot="result-type-filter-chip"
              data-chip-id={chip.id}
              className="inline-flex h-5 items-center rounded-full border border-border bg-surface px-2 text-[10px] font-medium text-foreground hover:bg-surface-subtle"
            >
              {chip.label}
            </button>
          ))}
        </div>
      </div>
    </div>
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
      className="flex flex-col gap-3"
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
    <SectionCard
      title="项目"
      description="按相关度排序的匹配项目"
      action={
        <Link
          href="/projects"
          data-slot="project-result-view-all"
          className="inline-flex items-center gap-1 text-[11px] font-medium text-brand hover:underline"
        >
          查看全部
          <span aria-hidden="true">→</span>
        </Link>
      }
    >
      <div
        data-slot="project-result-section"
        className="grid grid-cols-1 gap-card-gap sm:grid-cols-2 lg:grid-cols-3"
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
      className="flex flex-col gap-1 rounded-lg border border-border bg-surface-subtle p-2.5"
    >
      <header className="flex items-start justify-between gap-2">
        <h3 className="line-clamp-1 text-[12px] font-medium text-foreground">
          {project.title}
        </h3>
        <span
          data-slot="project-result-stage"
          data-tone={STAGE_TONES[project.currentStage] ?? "neutral"}
          className="inline-flex h-4 shrink-0 items-center rounded-full bg-surface px-1.5 text-[9px] font-medium text-muted-foreground"
        >
          {project.currentStageLabel}
        </span>
      </header>
      <p className="line-clamp-1 text-[10px] text-muted-foreground">
        {project.brief}
      </p>
      <div className="flex items-center gap-2">
        <div
          aria-hidden="true"
          className="h-1 flex-1 overflow-hidden rounded-full bg-surface"
        >
          <div
            className="h-full bg-brand"
            style={{ width: `${project.progressPct}%` }}
          />
        </div>
        <span className="font-mono text-[9px] text-muted-foreground">
          {project.progressPct}%
        </span>
      </div>
      <div className="flex flex-wrap gap-0.5">
        {project.tags.slice(0, 2).map((tag) => (
          <TagChip key={`${project.id}-${tag}`} label={tag} tone="neutral" size="sm" />
        ))}
      </div>
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
    <SectionCard
      title="知识"
      description="匹配的知识条目"
      action={
        <a
          href="/knowledge"
          data-slot="knowledge-result-view-all"
          className="inline-flex items-center gap-1 text-[11px] font-medium text-brand hover:underline"
        >
          查看全部
          <span aria-hidden="true">→</span>
        </a>
      }
    >
      <ul
        data-slot="knowledge-result-section"
        className="flex flex-col gap-1.5"
        aria-label="知识搜索结果"
      >
        {rows.map((row) => (
          <li
            key={row.id}
            data-slot="knowledge-result-row"
            data-knowledge-id={row.id}
            className="flex items-start gap-2 rounded-md border border-border bg-surface-subtle p-2 text-sm"
          >
            <span
              aria-hidden="true"
              data-slot="knowledge-result-icon"
              className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-border bg-surface text-[9px] font-semibold text-brand"
            >
              {row.typeLabel.slice(0, 1)}
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-[12px] font-medium text-foreground">
                  {row.title}
                </span>
                <span className="shrink-0 text-[10px] text-muted-foreground">
                  {row.typeLabel}
                </span>
              </div>
              <p className="line-clamp-1 text-[10px] text-muted-foreground">
                {row.excerpt}
              </p>
              <span className="font-mono text-[9px] text-muted-foreground">
                {row.updatedAt}
              </span>
            </div>
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
    <SectionCard
      title="素材"
      description="缩略图横向排列"
      action={
        <a
          href="/assets"
          data-slot="asset-result-view-all"
          className="inline-flex items-center gap-1 text-[11px] font-medium text-brand hover:underline"
        >
          查看全部
          <span aria-hidden="true">→</span>
        </a>
      }
    >
      <div
        data-slot="asset-result-section"
        className="grid grid-cols-2 gap-card-gap sm:grid-cols-3 lg:grid-cols-4"
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
  const safeHue2 = (safeHue + 50) % 360;
  return (
    <figure
      data-slot="asset-result-thumb"
      data-asset-id={item.id}
      data-asset-type={item.typeLabel}
      className="flex flex-col gap-1"
    >
      <div
        aria-hidden="true"
        className="relative flex aspect-[16/9] w-full items-center justify-center overflow-hidden rounded-md border border-border/60 text-[9px] font-medium"
        style={{
          backgroundImage: `linear-gradient(135deg, hsl(${safeHue} 35% 60%) 0%, hsl(${safeHue2} 40% 65%) 100%)`,
          color: "white",
          textShadow: "0 1px 2px rgba(0,0,0,0.15)",
        }}
      >
        <span className="inline-flex h-3.5 items-center rounded bg-white/25 px-1 text-[8px] font-semibold uppercase tracking-wider backdrop-blur-sm">
          {item.typeLabel.slice(0, 2)}
        </span>
      </div>
      <figcaption className="line-clamp-1 text-[10px] text-foreground">
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
    <SectionCard
      title="视频"
      description="匹配的视频内容"
      action={
        <a
          href="/publishing"
          data-slot="video-result-view-all"
          className="inline-flex items-center gap-1 text-[11px] font-medium text-brand hover:underline"
        >
          查看全部
          <span aria-hidden="true">→</span>
        </a>
      }
    >
      <div
        data-slot="video-result-section"
        className="grid grid-cols-1 gap-card-gap sm:grid-cols-2 lg:grid-cols-4"
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
  const safeHue2 = (safeHue + 45) % 360;
  // Derive a deterministic fake duration string from the token so
  // the thumbnail overlay always shows a `MM:SS` style label
  // (matching the design reference) without using `Date.now` or
  // `Math.random`.
  const minutes = 1 + (parseInt((item.token ?? "0").slice(-1), 16) % 28);
  const seconds = (parseInt((item.token ?? "0").slice(-3, -1), 16) * 13) % 60;
  const duration = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  return (
    <figure
      data-slot="video-result-thumb"
      data-video-id={item.id}
      data-platform={item.platform}
      className="flex flex-col gap-1"
    >
      <div
        aria-hidden="true"
        className="relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-md border border-border/60 text-white"
        style={{
          backgroundImage: `linear-gradient(135deg, hsl(${safeHue} 45% 40%) 0%, hsl(${safeHue2} 50% 44%) 100%)`,
        }}
      >
        <span className="absolute left-1.5 top-1.5 inline-flex">
          <PlatformIconView platform={item.platform} size="xs" />
        </span>
        <span
          data-slot="video-result-duration"
          className="absolute right-1.5 bottom-1.5 rounded bg-black/55 px-1 text-[9px] font-mono leading-tight text-white/90 backdrop-blur-sm"
        >
          {duration}
        </span>
      </div>
      <figcaption className="flex flex-col gap-0.5 text-[11px]">
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
      className="flex flex-col gap-3"
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
    <SectionCard title="搜索历史" description="最近的搜索">
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">暂无搜索历史。</p>
      ) : (
        <ul
          data-slot="search-history"
          className="flex flex-col gap-0.5"
          aria-label="搜索历史"
        >
          {items.slice(0, 5).map((item) => (
            <li
              key={item.id}
              data-slot="search-history-row"
              data-history-id={item.id}
              className="flex items-center justify-between rounded-md px-2 py-1 text-xs hover:bg-surface-subtle"
            >
              <span className="truncate text-foreground">{item.query}</span>
              <span className="ml-2 shrink-0 font-mono text-[10px] text-muted-foreground">
                {item.searchedAtLabel}
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
    <SectionCard title="搜索技巧" description="更精确地搜索">
      <ul
        data-slot="search-tips"
        className="flex flex-col gap-1 text-xs text-muted-foreground"
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
