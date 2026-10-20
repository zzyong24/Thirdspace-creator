/**
 * Global Search page (Task 23 / page-specs §15).
 *
 * The `/search` global resource-center landing page. The TopHeader
 * is in `search` mode and renders the global search field; this
 * page composes the result surface below it.
 *
 * Composes, in the spec order:
 *   SearchPage
 *   ├── (search input lives in the shared TopHeader — the REAL, wired
 *   │    `HeaderGlobalSearch` client island; [T-051 2d] the former
 *   │    sr-only duplicate page-level input has been removed)
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
 *  - The page exposes `?q=...` + `?type=...` URL state: the query is
 *    reflected in the TopHeader's `HeaderGlobalSearch` island and the
 *    type facet narrows which result group renders ([T-051 2d] the
 *    route threads both params into `pages.search.get`).
 *  - No new dependencies, no fixture mutation, no `Date.now` /
 *    `Math.random` / network access.
 *
 * The page is a Server Component. URL state is written by the
 * TopHeader search island (`?q=`) and the ResultTypeTabs island
 * (`?type=`) so the page itself stays server-rendered.
 */

import * as React from "react";
import Link from "next/link";

import { SectionCard } from "@/components/project/section-card";
import { TagChip } from "@/components/content/tag-chip";
import { PlatformIcon } from "@/components/publishing/platform-icon";
import { buildSearchViewModel } from "@/fixtures/selectors";

import { ResultTypeTabs } from "./result-type-tabs";
import { SearchFacetsPanel } from "./search-facets-panel";

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
  /**
   * [T-051 2d] 当前激活的结果类型分面(URL ?type=,route 白名单校验后传入)。
   * 存在时只渲染对应的结果组(server 已按该类窄化数据),tab 高亮据此绘制。
   */
  readonly activeType?: string;
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
  activeType,
}: SearchPageProps = {}) {
  // When an op-backed `viewModel` is supplied, the server already executed the
  // query (`pages.search.get` → SearchService.search), so the groups are ALREADY
  // filtered — re-applying the client-side `applyQuery` would double-filter and
  // drop matches whose relevance lives in fields the VM doesn't expose. Only the
  // fixture-fallback path (no op data) needs the client-side query filter.
  const opBacked = viewModel !== undefined;
  const baseVm = viewModel ?? buildSearchViewModel();
  const vm = opBacked ? baseVm : applyQuery(baseVm, initialQuery);
  // [T-051 2d] tab 计数的两条路径:
  //  - op-backed:信任后端计数。pages.search.get 现在用全量分面计数(不受
  //    per-type top-N 截断),且 ?type= 窄化时其它 tab 仍是真实命中数 ——
  //    此时组长度(被窄化清空)反而是错误来源,不能覆盖。
  //  - fixture 回退:fixture VM 带的是装饰性硬编码计数(12/38/84/19),用实际
  //    渲染组长度覆盖,徽标才诚实。
  const groupLengthByTab: Record<string, number> = {
    project: vm.projectResults.length,
    knowledge: vm.knowledgeResults.length,
    asset: vm.assetResults.length,
    video: vm.videoResults.length,
  };
  const resultTypeTabs = opBacked
    ? vm.resultTypeTabs
    : vm.resultTypeTabs.map((tab) => ({
        ...tab,
        count: groupLengthByTab[tab.id] ?? tab.count,
      }));
  const totalCount = resultTypeTabs.reduce((acc, t) => acc + t.count, 0);
  return (
    <main
      data-app="creatoros"
      data-page="search" data-studio-layout="search"
      data-search-id="search-root"
      className="flex flex-col gap-3"
    >
      <header><h1 className="text-2xl font-semibold">搜索结果</h1></header>
      {/* [T-051 2d] 全局搜索输入框只有一个真身:TopHeader `search` 模式渲染的
          `HeaderGlobalSearch` client 岛(提交 → push /search?q= → server 重查)。
          原来藏在这里的 sr-only 复制品(可见框是死的、活框被藏起来的交互倒置)
          已删除。 */}
      <ResultTypeTabs
        tabs={resultTypeTabs}
        totalCount={totalCount}
        activeType={activeType}
      />
      <div
        data-slot="search-layout"
        className="grid grid-cols-1 gap-card-gap lg:grid-cols-[minmax(0,1fr)_320px]"
      >
        <SearchResults
          activeType={activeType}
          projects={vm.projectResults}
          knowledge={vm.knowledgeResults}
          assets={vm.assetResults}
          videos={vm.videoResults}
        />
        <SearchSideRail
          initialQuery={initialQuery}
          quickActions={vm.quickActions}
          history={vm.history}
          tips={vm.tips}
        />
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------
// ResultTypeTabs is a client island (`./result-type-tabs.tsx`). [T-051 2d] the
// four type tabs are now a URL-driven facet: clicking pushes `?type=` which the
// route threads into `pages.search.get` (server-side narrowing) — no more
// local-state DOM `hidden` toggling. The former decorative topic chips (§291
// AI/教程/…) had NO data backing in the VM and remain removed (GAP-SRCH-1).
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// SearchResults
// ---------------------------------------------------------------------------

function SearchResults({
  activeType,
  projects,
  knowledge,
  assets,
  videos,
}: {
  readonly activeType?: string;
  readonly projects: ReadonlyArray<ProjectResult>;
  readonly knowledge: ReadonlyArray<KnowledgeResult>;
  readonly assets: ReadonlyArray<AssetResult>;
  readonly videos: ReadonlyArray<VideoResult>;
}) {
  // [T-051 2d] ?type= 窄化时只渲染选中的组:server 只返回了该类的卡片数据,
  // 其它组若照渲会是一排空壳 SectionCard。无窄化时 4 组全渲。
  const visible = (group: string) => !activeType || activeType === group;
  return (
    // §293 Project/knowledge/asset/video result cards. Each card is a real
    // next/link: projects deep-link to /projects/<id>; knowledge/asset/video
    // link to their respective center list (/knowledge, /assets, /publishing)
    // since no per-entity detail route exists yet.
    <div
      data-slot="search-results"
      className="flex flex-col gap-3"
    >
      {/* `data-result-group` 是各组的稳定选择器(e2e / 测试用)。组的显隐由
          server 数据 + activeType 决定,不再有客户端 hidden 戏法。 */}
      {visible("project") ? (
        <div data-result-group="project">
          <ProjectResultSection projects={projects} />
        </div>
      ) : null}
      {visible("knowledge") ? (
        <div data-result-group="knowledge">
          <KnowledgeResultSection rows={knowledge} />
        </div>
      ) : null}
      {visible("asset") ? (
        <div data-result-group="asset">
          <AssetResultSection items={assets} />
        </div>
      ) : null}
      {visible("video") ? (
        <div data-result-group="video">
          <VideoResultSection items={videos} />
        </div>
      ) : null}
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
  // Link to the project's overview when we hold a real entity id; otherwise fall
  // back to the projects list (never a dead card, never a fake detail route).
  const href = project.id ? `/projects/${project.id}` : "/projects";
  return (
    <Link
      href={href}
      data-slot="project-result-card"
      data-project-id={project.id}
      data-stage={project.currentStage}
      className="flex flex-col gap-1 rounded-lg border border-border bg-surface-subtle p-2.5 transition-colors hover:border-brand/50 hover:bg-surface"
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
    </Link>
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
          >
            {/* No per-entity knowledge detail route exists yet — link to the
                knowledge center list rather than fabricate a detail URL. */}
            <Link
              href="/knowledge"
              className="flex items-start gap-2 rounded-md border border-border bg-surface-subtle p-2 text-sm transition-colors hover:border-brand/50 hover:bg-surface"
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
            </Link>
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
    // No per-asset detail route exists yet — link to the asset center list.
    <Link
      href="/assets"
      data-slot="asset-result-thumb"
      data-asset-id={item.id}
      data-asset-type={item.typeLabel}
      className="flex flex-col gap-1 transition-opacity hover:opacity-80"
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
      <span className="line-clamp-1 text-[10px] text-foreground">
        {item.title}
      </span>
    </Link>
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
    // No per-video detail route exists yet — link to the publishing center.
    <Link
      href="/publishing"
      data-slot="video-result-thumb"
      data-video-id={item.id}
      data-platform={item.platform}
      className="flex flex-col gap-1 transition-opacity hover:opacity-80"
    >
      <div
        aria-hidden="true"
        className="relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-md border border-border/60 text-white"
        style={{
          backgroundImage: `linear-gradient(135deg, hsl(${safeHue} 45% 40%) 0%, hsl(${safeHue2} 50% 44%) 100%)`,
        }}
      >
        <span className="absolute left-1.5 top-1.5 inline-flex">
          <PlatformIcon platform={item.platform} size="xs" />
        </span>
        <span
          data-slot="video-result-duration"
          className="absolute right-1.5 bottom-1.5 rounded bg-black/55 px-1 text-[9px] font-mono leading-tight text-white/90 backdrop-blur-sm"
        >
          {duration}
        </span>
      </div>
      <span className="flex flex-col gap-0.5 text-[11px]">
        <span className="line-clamp-1 text-foreground">{item.title}</span>
        <span className="text-muted-foreground">
          {item.platformLabel} · {item.publishedAtLabel} · {item.views}
        </span>
      </span>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// SearchSideRail
// ---------------------------------------------------------------------------

function SearchSideRail({
  initialQuery,
  quickActions,
  history,
  tips,
}: {
  readonly initialQuery: string;
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
      {/* §294 — REAL facet panel (GAP-SRCH-facets). The former「规划中」inert
          summary is replaced by `SearchFacetsPanel`, a client island backed by
          the `search.facets` server op (GET /search/facets?q=). It fetches the
          per-dimension facet buckets (entityType / tag) with hit counts for the
          current query and renders each value as a clickable control that REALLY
          narrows the server read (entityType → `?type=`) or re-searches
          (tag → query append). */}
      <SearchFacetsPanel initialQuery={initialQuery} />
      <QuickActions actions={quickActions} />
      <SearchHistory items={history} />
      <SearchTips tips={tips} />
    </aside>
  );
}

function QuickActions({ actions }: { actions: ReadonlyArray<QuickAction> }) {
  return (
    <SectionCard title="快捷操作">
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
    <SectionCard title="搜索历史">
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
            >
              {/* §296 — Re-run a prior query by NAVIGATING to /search?q=<query>.
                  The server `pages.search.get` read re-runs and re-appends a
                  SearchHistory row (persistence is a server-side post-read
                  side-effect — no mutation endpoint per the spec-gap resolution). */}
              <Link
                href={`/search?q=${encodeURIComponent(item.query)}`}
                data-slot="search-history-link"
                className="flex items-center justify-between rounded-md px-2 py-1 text-xs hover:bg-surface-subtle"
              >
                <span className="truncate text-foreground">{item.query}</span>
                <span className="ml-2 shrink-0 font-mono text-[10px] text-muted-foreground">
                  {item.searchedAtLabel}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

function SearchTips({ tips }: { tips: ReadonlyArray<string> }) {
  return (
    <SectionCard title="搜索技巧">
      {/* §297 Search-tips rows — decorative per roadmap §4 (static syntax tips). */}
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
