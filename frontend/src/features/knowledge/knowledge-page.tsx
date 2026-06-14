/**
 * Knowledge & Memory page (Task 19 / page-specs §11).
 *
 * The `/knowledge` global resource-center landing page. Composes:
 *  - a `KnowledgeToolbar` (search + filter affordances),
 *  - a `KnowledgeMetrics` row of FIVE MetricCard items in a single row,
 *  - a `KnowledgeGrid` with three columns in the spec order
 *      CategoryPanel → RecentKnowledgeTable → InsightRail
 *    where InsightRail contains the four insight blocks in the
 *    locked order PopularTags → MemoryInsights → UnsortedItems →
 *    ReusableSnippets,
 *  - a `KnowledgeGraph` rendered at the bottom of the same page
 *    (NOT a separate route — page-specs §11 "禁止改变").
 *
 * Layout invariants (locked by page-specs §11, decision-log D-002):
 *  - The route is a global resource-center route. There is no
 *    project identity block, no second AppShell, and no second
 *    Sidebar/TopHeader. The Header region remains in `global` mode
 *    with the page title "知识库".
 *  - The MemoryInsights block is NOT removed (page-specs §11).
 *  - The KnowledgeGraph stays on the same page (no graph-as-route
 *    redesign). No folder-tree hierarchy is added.
 *
 * The page is a Server Component. It does not own a Sidebar or a
 * TopHeader — those live in `(creator)/layout.tsx` and are mounted
 * once for the whole route group.
 */

import * as React from "react";

import { ChartFrame } from "@/components/analytics/chart-frame";
import { MetricCard } from "@/components/project/metric-card";
import { SectionCard } from "@/components/project/section-card";
import { TagChip } from "@/components/content/tag-chip";
import {
  canonicalDataset,
} from "@/fixtures/canonical";
import type { MetricCard as MetricCardVm } from "@/types/view-models";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface KnowledgePageProps {
  /**
   * Override hook for tests; defaults to the canonical dataset.
   * The page does not consume network or runtime data — it pulls
   * everything from the fixed fixtures (D-010) so SSR output is
   * deterministic.
   */
  readonly viewModel?: KnowledgeViewModel;
}

export interface KnowledgeViewModel {
  readonly metrics: ReadonlyArray<MetricCardVm>;
  readonly categories: ReadonlyArray<KnowledgeCategory>;
  readonly recent: ReadonlyArray<KnowledgeRow>;
  readonly popularTags: ReadonlyArray<KnowledgeTag>;
  readonly memoryInsights: ReadonlyArray<KnowledgeInsight>;
  readonly unsorted: ReadonlyArray<KnowledgeUnsorted>;
  readonly snippets: ReadonlyArray<KnowledgeSnippet>;
  readonly graphSeries: ReadonlyArray<{ readonly label: string; readonly value: number }>;
}

interface KnowledgeCategory {
  readonly id: string;
  readonly name: string;
  readonly count: number;
  readonly tone: "neutral" | "brand" | "success" | "warning" | "info";
}

interface KnowledgeRow {
  readonly id: string;
  readonly title: string;
  readonly type: string;
  readonly updatedAt: string;
  readonly status: "active" | "archived" | "draft";
  readonly tags: ReadonlyArray<string>;
}

interface KnowledgeTag {
  readonly id: string;
  readonly name: string;
  readonly tone: "neutral" | "brand" | "success" | "warning" | "info";
}

interface KnowledgeInsight {
  readonly id: string;
  readonly title: string;
  readonly body: string;
}

interface KnowledgeUnsorted {
  readonly id: string;
  readonly title: string;
  readonly ageLabel: string;
}

interface KnowledgeSnippet {
  readonly id: string;
  readonly title: string;
  readonly preview: string;
}

// ---------------------------------------------------------------------------
// Locked default knowledge metrics (5 cards, single row, in spec order)
// ---------------------------------------------------------------------------

const DEFAULT_METRICS: ReadonlyArray<MetricCardVm> = [
  {
    id: "km-total",
    label: "知识条目",
    value: "1,328",
    delta: "+24",
    trend: "up",
    tone: "positive",
  },
  {
    id: "km-week",
    label: "本周新增",
    value: "42",
    delta: "+12%",
    trend: "up",
    tone: "positive",
  },
  {
    id: "km-relations",
    label: "知识关联",
    value: "386",
    delta: "+18",
    trend: "up",
    tone: "info",
  },
  {
    id: "km-snippets",
    label: "复用片段",
    value: "118",
    delta: "+5",
    trend: "up",
    tone: "info",
  },
  {
    id: "km-memory",
    label: "记忆命中率",
    value: "78%",
    delta: "-2%",
    trend: "down",
    tone: "warning",
  },
];

// ---------------------------------------------------------------------------
// Locked default categories (fallback when canonical dataset is empty)
// ---------------------------------------------------------------------------

const DEFAULT_CATEGORIES: ReadonlyArray<KnowledgeCategory> = [
  { id: "cat-research", name: "用户调研", count: 124, tone: "brand" },
  { id: "cat-trend", name: "趋势观察", count: 86, tone: "info" },
  { id: "cat-snippet", name: "可复用片段", count: 118, tone: "success" },
  { id: "cat-transcript", name: "访谈记录", count: 64, tone: "warning" },
  { id: "cat-note", name: "随手笔记", count: 936, tone: "neutral" },
];

// ---------------------------------------------------------------------------
// Locked default recent knowledge rows (fallback)
// ---------------------------------------------------------------------------

const DEFAULT_RECENT: ReadonlyArray<KnowledgeRow> = [
  {
    id: "kr-1",
    title: "Arc / Dia 用户调研",
    type: "参考",
    updatedAt: "2026-05-30",
    status: "active",
    tags: ["调研", "Arc"],
  },
  {
    id: "kr-2",
    title: "本地优先栈趋势",
    type: "笔记",
    updatedAt: "2026-05-25",
    status: "active",
    tags: ["趋势"],
  },
  {
    id: "kr-3",
    title: "Hook 公式",
    type: "片段",
    updatedAt: "2026-04-12",
    status: "active",
    tags: ["Hook"],
  },
  {
    id: "kr-4",
    title: "发布前自检清单",
    type: "笔记",
    updatedAt: "2026-04-01",
    status: "active",
    tags: ["发布"],
  },
  {
    id: "kr-5",
    title: "独立创作者访谈 01",
    type: "记录",
    updatedAt: "2026-03-20",
    status: "active",
    tags: ["访谈"],
  },
];

// ---------------------------------------------------------------------------
// Locked default popular tags (fallback)
// ---------------------------------------------------------------------------

const DEFAULT_POPULAR_TAGS: ReadonlyArray<KnowledgeTag> = [
  { id: "t-knowledge", name: "知识", tone: "brand" },
  { id: "t-hook", name: "Hook", tone: "warning" },
  { id: "t-trend", name: "趋势", tone: "info" },
  { id: "t-publish", name: "发布", tone: "success" },
  { id: "t-research", name: "调研", tone: "brand" },
  { id: "t-snippet", name: "片段", tone: "success" },
  { id: "t-interview", name: "访谈", tone: "warning" },
  { id: "t-local", name: "本地优先", tone: "info" },
];

// ---------------------------------------------------------------------------
// Locked default memory insights (fallback) — page-specs §11 requires
// this block to remain visible.
// ---------------------------------------------------------------------------

const DEFAULT_MEMORY_INSIGHTS: ReadonlyArray<KnowledgeInsight> = [
  {
    id: "mi-1",
    title: "高频钩子:反差开场",
    body: "近 30 天调用 12 次，完播率比平均高 14 个百分点。",
  },
  {
    id: "mi-2",
    title: "低复用:产品对比表格",
    body: "出现 3 次但 0 次被引用，建议合并到一条主条目。",
  },
  {
    id: "mi-3",
    title: "趋势:本地优先栈",
    body: "5 月新增 8 条，关联到「创作流程」主条目。",
  },
];

// ---------------------------------------------------------------------------
// Locked default unsorted items (fallback)
// ---------------------------------------------------------------------------

const DEFAULT_UNSORTED: ReadonlyArray<KnowledgeUnsorted> = [
  { id: "u-1", title: "AI Copilot 复盘", ageLabel: "12 天前" },
  { id: "u-2", title: "采访脚本草稿", ageLabel: "5 天前" },
  { id: "u-3", title: "Vlog 拍摄备忘", ageLabel: "3 天前" },
];

// ---------------------------------------------------------------------------
// Locked default reusable snippets (fallback)
// ---------------------------------------------------------------------------

const DEFAULT_SNIPPETS: ReadonlyArray<KnowledgeSnippet> = [
  {
    id: "s-1",
    title: "3 秒钩子模板",
    preview: "「你以为的 X，其实只是 Y」— 用于反差开场。",
  },
  {
    id: "s-2",
    title: "结尾 CTA 模板",
    preview: "「如果这期对你有用，留言告诉我下一步想看什么」。",
  },
  {
    id: "s-3",
    title: "标题公式",
    preview: "「[人群]+[痛点]+[收益]」— 16 字以内效果最佳。",
  },
];

// ---------------------------------------------------------------------------
// Locked default graph series (fallback) — used by the KnowledgeGraph
// chart, which stays on the same page (page-specs §11).
// ---------------------------------------------------------------------------

const DEFAULT_GRAPH_SERIES: ReadonlyArray<{ readonly label: string; readonly value: number }> = [
  { label: "调研", value: 18 },
  { label: "趋势", value: 26 },
  { label: "片段", value: 34 },
  { label: "笔记", value: 48 },
  { label: "访谈", value: 22 },
  { label: "脚本", value: 30 },
  { label: "素材", value: 28 },
];

// ---------------------------------------------------------------------------
// View model — derived from canonical dataset, with deterministic
// fallbacks so the page is never empty.
// ---------------------------------------------------------------------------

function buildKnowledgeViewModel(): KnowledgeViewModel {
  return {
    metrics: DEFAULT_METRICS,
    categories: buildCategories(),
    recent: buildRecentRows(),
    popularTags: buildPopularTags(),
    memoryInsights: buildMemoryInsights(),
    unsorted: DEFAULT_UNSORTED,
    snippets: DEFAULT_SNIPPETS,
    graphSeries: DEFAULT_GRAPH_SERIES,
  };
}

function buildCategories(): ReadonlyArray<KnowledgeCategory> {
  const items = canonicalDataset.knowledgeItems;
  if (items.length === 0) return DEFAULT_CATEGORIES;
  const tally = new Map<string, number>();
  for (const item of items) {
    tally.set(item.knowledgeType, (tally.get(item.knowledgeType) ?? 0) + 1);
  }
  const toneFor: Record<string, KnowledgeCategory["tone"]> = {
    reference: "brand",
    note: "neutral",
    snippet: "success",
    transcript: "warning",
  };
  const labelFor: Record<string, string> = {
    reference: "参考",
    note: "笔记",
    snippet: "片段",
    transcript: "记录",
  };
  return Array.from(tally.entries()).map(([type, count]) => ({
    id: `cat-${type}`,
    name: labelFor[type] ?? type,
    count,
    tone: toneFor[type] ?? "neutral",
  }));
}

function buildRecentRows(): ReadonlyArray<KnowledgeRow> {
  const items = canonicalDataset.knowledgeItems;
  if (items.length === 0) return DEFAULT_RECENT;
  return items
    .slice()
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 5)
    .map<KnowledgeRow>((item) => ({
      id: item.id,
      title: item.title,
      type: knowledgeTypeLabel(item.knowledgeType),
      updatedAt: item.updatedAt.slice(0, 10),
      status: item.status,
      tags: tagsForKnowledge(item.id),
    }));
}

function knowledgeTypeLabel(type: string): string {
  switch (type) {
    case "reference":
      return "参考";
    case "note":
      return "笔记";
    case "snippet":
      return "片段";
    case "transcript":
      return "记录";
    default:
      return type;
  }
}

function tagsForKnowledge(knowledgeId: string): ReadonlyArray<string> {
  const links = canonicalDataset.entityTags.filter(
    (row) => row.entityType === "knowledge" && row.entityId === knowledgeId,
  );
  return links
    .map((link) => canonicalDataset.tags.find((tag) => tag.id === link.tagId)?.name)
    .filter((name): name is string => Boolean(name));
}

function buildPopularTags(): ReadonlyArray<KnowledgeTag> {
  const tags = canonicalDataset.tags;
  if (tags.length === 0) return DEFAULT_POPULAR_TAGS;
  const toneFor: Record<string, KnowledgeTag["tone"]> = {
    "#f59e0b": "warning",
    "#0ea5e9": "info",
    "#22c55e": "success",
    "#a855f7": "brand",
  };
  return tags.slice(0, 8).map<KnowledgeTag>((tag) => ({
    id: tag.id,
    name: tag.name,
    tone: toneFor[tag.color] ?? "neutral",
  }));
}

function buildMemoryInsights(): ReadonlyArray<KnowledgeInsight> {
  // The MemoryInsights block is required by page-specs §11 — never
  // collapse it into another section. We always render at least the
  // canonical fallback so the rail is non-empty.
  return DEFAULT_MEMORY_INSIGHTS;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function KnowledgePage({ viewModel }: KnowledgePageProps = {}) {
  const vm = viewModel ?? buildKnowledgeViewModel();
  return (
    <main
      data-app="creatoros"
      data-page="knowledge"
      data-knowledge-id="knowledge-root"
      className="flex flex-col gap-section-gap"
    >
      <KnowledgeToolbar />
      <KnowledgeMetrics metrics={vm.metrics} />
      <KnowledgeGrid
        categories={vm.categories}
        recent={vm.recent}
        popularTags={vm.popularTags}
        memoryInsights={vm.memoryInsights}
        unsorted={vm.unsorted}
        snippets={vm.snippets}
      />
      <KnowledgeGraph series={vm.graphSeries} />
    </main>
  );
}

// ---------------------------------------------------------------------------
// KnowledgeToolbar — search + filter affordances pinned at the top
// ---------------------------------------------------------------------------

function KnowledgeToolbar() {
  return (
    <div
      data-slot="knowledge-toolbar"
      aria-label="知识库工具栏"
      className="flex flex-wrap items-center gap-2 border-b border-border pb-2"
    >
      <label className="sr-only" htmlFor="knowledge-search">
        搜索知识
      </label>
      <input
        id="knowledge-search"
        type="search"
        placeholder="搜索条目、标签或关联项目"
        data-slot="knowledge-search-input"
        className="h-8 w-64 rounded-md border border-border bg-surface px-3 text-[13px] text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      />
      <div
        data-slot="knowledge-filter-chips"
        className="flex flex-wrap items-center gap-0.5"
      >
        <TagChip label="全部" tone="brand" size="sm" />
        <TagChip label="参考" tone="neutral" size="sm" />
        <TagChip label="笔记" tone="neutral" size="sm" />
        <TagChip label="片段" tone="success" size="sm" />
        <TagChip label="记录" tone="warning" size="sm" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// KnowledgeMetrics — 5 cards in a single row
// ---------------------------------------------------------------------------

function KnowledgeMetrics({
  metrics,
}: {
  metrics: ReadonlyArray<MetricCardVm>;
}) {
  return (
    <section
      data-slot="knowledge-metrics"
      aria-label="知识统计"
      className="grid grid-cols-1 gap-card-gap sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5"
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

// ---------------------------------------------------------------------------
// KnowledgeGrid — Category / Recent / InsightRail in three columns
// ---------------------------------------------------------------------------

function KnowledgeGrid({
  categories,
  recent,
  popularTags,
  memoryInsights,
  unsorted,
  snippets,
}: {
  readonly categories: ReadonlyArray<KnowledgeCategory>;
  readonly recent: ReadonlyArray<KnowledgeRow>;
  readonly popularTags: ReadonlyArray<KnowledgeTag>;
  readonly memoryInsights: ReadonlyArray<KnowledgeInsight>;
  readonly unsorted: ReadonlyArray<KnowledgeUnsorted>;
  readonly snippets: ReadonlyArray<KnowledgeSnippet>;
}) {
  return (
    <div
      data-slot="knowledge-grid"
      className="grid grid-cols-1 gap-card-gap lg:grid-cols-[220px_minmax(0,1fr)_300px]"
    >
      <CategoryPanel categories={categories} />
      <RecentKnowledgeTable rows={recent} />
      <InsightRail
        popularTags={popularTags}
        memoryInsights={memoryInsights}
        unsorted={unsorted}
        snippets={snippets}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// CategoryPanel — left column
// ---------------------------------------------------------------------------

function CategoryPanel({
  categories,
}: {
  categories: ReadonlyArray<KnowledgeCategory>;
}) {
  return (
    <div data-slot="category-panel">
      <SectionCard title="知识分类" description="按类型组织">
        <ul
          data-slot="category-list"
          className="flex flex-col gap-0.5"
          aria-label="知识分类列表"
        >
          {categories.map((category) => (
            <li
              key={category.id}
              data-slot="category-row"
              data-category-id={category.id}
              className="flex items-center justify-between rounded-md px-2 py-1 text-[13px] hover:bg-surface-subtle"
            >
              <span className="flex items-center gap-2 text-foreground">
                <span
                  aria-hidden="true"
                  className={
                    category.tone === "brand"
                      ? "size-1.5 rounded-full bg-brand"
                      : category.tone === "success"
                        ? "size-1.5 rounded-full bg-success"
                        : category.tone === "warning"
                          ? "size-1.5 rounded-full bg-warning"
                          : category.tone === "info"
                            ? "size-1.5 rounded-full bg-info"
                            : "size-1.5 rounded-full bg-border-strong"
                  }
                />
                {category.name}
              </span>
              <span className="font-mono tabular-nums text-[11px] text-muted-foreground">
                {category.count}
              </span>
            </li>
          ))}
        </ul>
      </SectionCard>
    </div>
  );
}

// ---------------------------------------------------------------------------
// RecentKnowledgeTable — middle column
// ---------------------------------------------------------------------------

function RecentKnowledgeTable({
  rows,
}: {
  rows: ReadonlyArray<KnowledgeRow>;
}) {
  return (
    <div data-slot="recent-knowledge-table-wrapper">
      <SectionCard title="最近更新" description="按更新时间倒序">
        <table
          data-slot="recent-knowledge-table"
          className="w-full text-[13px]"
          aria-label="最近知识条目"
        >
          <thead>
            <tr className="border-b border-border text-[11px] text-muted-foreground">
              <th className="py-1.5 text-left font-medium">标题</th>
              <th className="py-1.5 text-left font-medium">类型</th>
              <th className="py-1.5 text-left font-medium">标签</th>
              <th className="py-1.5 text-right font-medium">更新</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                data-slot="recent-knowledge-row"
                data-knowledge-id={row.id}
                data-status={row.status}
                className="border-b border-border last:border-b-0"
              >
                <td className="py-1.5 text-foreground">{row.title}</td>
                <td className="py-1.5 text-muted-foreground">{row.type}</td>
                <td className="py-1.5">
                  <div className="flex flex-wrap gap-0.5">
                    {row.tags.length > 0 ? (
                      row.tags.map((tag) => (
                        <TagChip
                          key={`${row.id}-${tag}`}
                          label={tag}
                          tone="neutral"
                          size="sm"
                        />
                      ))
                    ) : (
                      <span className="text-[11px] text-muted-foreground">—</span>
                    )}
                  </div>
                </td>
                <td className="py-1.5 text-right font-mono text-[11px] text-muted-foreground">
                  {row.updatedAt}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </SectionCard>
    </div>
  );
}

// ---------------------------------------------------------------------------
// InsightRail — right column with the four locked blocks in spec order
// ---------------------------------------------------------------------------

function InsightRail({
  popularTags,
  memoryInsights,
  unsorted,
  snippets,
}: {
  readonly popularTags: ReadonlyArray<KnowledgeTag>;
  readonly memoryInsights: ReadonlyArray<KnowledgeInsight>;
  readonly unsorted: ReadonlyArray<KnowledgeUnsorted>;
  readonly snippets: ReadonlyArray<KnowledgeSnippet>;
}) {
  return (
    <div
      data-slot="insight-rail"
      aria-label="知识洞察"
      className="flex flex-col gap-card-gap"
    >
      <PopularTags tags={popularTags} />
      <MemoryInsights items={memoryInsights} />
      <UnsortedItems items={unsorted} />
      <ReusableSnippets items={snippets} />
    </div>
  );
}

function PopularTags({ tags }: { tags: ReadonlyArray<KnowledgeTag> }) {
  return (
    <SectionCard title="热门标签" description="使用频率最高的标签">
      <ul
        data-slot="popular-tags"
        className="flex flex-wrap gap-1"
        aria-label="热门标签"
      >
        {tags.map((tag) => (
          <li key={tag.id}>
            <TagChip label={tag.name} tone={tag.tone} size="sm" />
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}

function MemoryInsights({
  items,
}: {
  items: ReadonlyArray<KnowledgeInsight>;
}) {
  return (
    <SectionCard title="记忆洞察" description="系统从知识库中提炼的要点">
      <ul
        data-slot="memory-insights"
        className="flex flex-col gap-1.5"
        aria-label="记忆洞察列表"
      >
        {items.map((item) => (
          <li
            key={item.id}
            data-slot="memory-insight-item"
            data-insight-id={item.id}
            className="rounded-md border border-border bg-surface-subtle px-2.5 py-2 text-[13px]"
          >
            <div className="font-medium text-foreground">{item.title}</div>
            <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
              {item.body}
            </p>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}

function UnsortedItems({
  items,
}: {
  items: ReadonlyArray<KnowledgeUnsorted>;
}) {
  return (
    <SectionCard title="未整理" description="尚未归类的知识条目">
      <ul
        data-slot="unsorted-items"
        className="flex flex-col gap-0.5"
        aria-label="未整理条目"
      >
        {items.map((item) => (
          <li
            key={item.id}
            data-slot="unsorted-item-row"
            data-unsorted-id={item.id}
            className="flex items-center justify-between rounded-md px-2 py-1 text-[13px] hover:bg-surface-subtle"
          >
            <span className="truncate text-foreground">{item.title}</span>
            <span className="ml-2 shrink-0 text-[11px] text-muted-foreground">
              {item.ageLabel}
            </span>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}

function ReusableSnippets({
  items,
}: {
  items: ReadonlyArray<KnowledgeSnippet>;
}) {
  return (
    <SectionCard title="可复用片段" description="快速插入到脚本的模板">
      <ul
        data-slot="reusable-snippets"
        className="flex flex-col gap-1.5"
        aria-label="可复用片段列表"
      >
        {items.map((item) => (
          <li
            key={item.id}
            data-slot="reusable-snippet-row"
            data-snippet-id={item.id}
            className="rounded-md border border-border bg-surface-subtle px-2.5 py-2 text-[13px]"
          >
            <div className="font-medium text-foreground">{item.title}</div>
            <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
              {item.preview}
            </p>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// KnowledgeGraph — rendered on the same page (page-specs §11 invariant)
// ---------------------------------------------------------------------------

function KnowledgeGraph({
  series,
}: {
  series: ReadonlyArray<{ readonly label: string; readonly value: number }>;
}) {
  const summary = summariseGraph(series);
  return (
    <SectionCard
      title="知识图谱"
      description="按类型分布的条目数"
    >
      <div data-slot="knowledge-graph" className="flex flex-col gap-1">
        <ChartFrame
          title="条目分布"
          description="按类型聚合的知识条目数"
          summary={summary}
          trend={series}
          slot="knowledge-graph-chart"
          shape="line"
          testId="knowledge-graph-chart"
          height={160}
        />
        <p data-slot="knowledge-graph-summary" className="sr-only">
          {summary}
        </p>
      </div>
    </SectionCard>
  );
}

function summariseGraph(
  series: ReadonlyArray<{ readonly label: string; readonly value: number }>,
): string {
  if (series.length === 0) return "知识图谱：暂无数据。";
  const total = series.reduce((acc, row) => acc + row.value, 0);
  const top = series.reduce(
    (acc, row) => (row.value > acc.value ? row : acc),
    series[0]!,
  );
  return `知识图谱：共 ${total} 条，最多的类型是 ${top.label}（${top.value} 条）。`;
}
