"use client";

/**
 * `KnowledgeInteractiveRegion` — Client island for the Knowledge &
 * Memory page (Increment 4 / page-specs §11).
 *
 * The page (`knowledge-page.tsx`) stays a Server Component shell; the
 * interactive content lives here following the existing islands pattern
 * (assets / settings / search).
 *
 * Wired interactions (client / URL state, fixture data, no network):
 *  - KnowledgeToolbar search input: filters the recent-knowledge list
 *    by title / tag (case-insensitive substring). The query is also
 *    mirrored to the URL `?q=` so it is shareable / restorable.
 *  - Filter chips (全部 / 参考 / 笔记 / 片段 / 记录): narrow the list by
 *    knowledge type; "全部" clears the type filter.
 *  - RecentKnowledgeTable rows: selectable (one active row at a time).
 *
 * The KnowledgeToolbar + KnowledgeMetrics row + KnowledgeGrid render
 * here so the page's content order (toolbar → metrics → grid) is
 * unchanged from the previous server-only render. The metrics row is
 * purely presentational but lives in the island so the toolbar can sit
 * above it exactly as before.
 *
 * Determinism: filtering is pure over props; the only side effect is a
 * `router.replace` URL update. No `Date.now` / `Math.random` / `fetch`.
 */

import * as React from "react";
import Link from "next/link";

import { MetricCard } from "@/components/project/metric-card";
import { SectionCard } from "@/components/project/section-card";
import { TagChip } from "@/components/content/tag-chip";
import type { MetricCard as MetricCardVm } from "@/types/view-models";
import type {
  KnowledgeCategory,
  KnowledgeInsight,
  KnowledgeRow,
  KnowledgeSnippet,
  KnowledgeTag,
  KnowledgeUnsorted,
  KnowledgeViewModel,
} from "./knowledge-page";

// ---------------------------------------------------------------------------
// Filter chip descriptors (type → label). "all" clears the type filter.
// ---------------------------------------------------------------------------

interface FilterChip {
  readonly id: string;
  readonly label: string;
  readonly tone: "neutral" | "brand" | "success" | "warning" | "info";
}

const FILTER_CHIPS: ReadonlyArray<FilterChip> = [
  { id: "all", label: "全部", tone: "brand" },
  { id: "参考", label: "参考", tone: "neutral" },
  { id: "笔记", label: "笔记", tone: "neutral" },
  { id: "片段", label: "片段", tone: "success" },
  { id: "记录", label: "记录", tone: "warning" },
];

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
// KnowledgeInteractiveRegion
// ---------------------------------------------------------------------------

export function KnowledgeInteractiveRegion({
  viewModel,
}: {
  readonly viewModel: KnowledgeViewModel;
}) {
  // Initialise the query from the URL `?q=` when one is present. We read
  // the URL directly (not via `useRouter`/`useSearchParams`) so the
  // island works whether or not an App Router provider is mounted — and
  // we mirror changes back with `history.replaceState`, which is safe in
  // both the browser and jsdom. This keeps the search query shareable /
  // restorable without depending on a router being present.
  const [query, setQuery] = React.useState<string>(() => readUrlQuery());
  const [activeFilter, setActiveFilter] = React.useState<string>("all");
  const [selectedId, setSelectedId] = React.useState<string | null>(null);

  const handleSearchChange = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const next = event.target.value;
      setQuery(next);
      writeUrlQuery(next);
    },
    [],
  );

  // Filter the recent list by both the type chip and the search query.
  const filteredRecent = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return viewModel.recent.filter((row) => {
      const typeOk = activeFilter === "all" || row.type === activeFilter;
      if (!typeOk) return false;
      if (q.length === 0) return true;
      const haystack = `${row.title} ${row.tags.join(" ")}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [viewModel.recent, activeFilter, query]);

  return (
    <>
      <KnowledgeToolbar
        query={query}
        onQueryChange={handleSearchChange}
        chips={FILTER_CHIPS}
        activeFilter={activeFilter}
        onFilterChange={setActiveFilter}
      />
      <KnowledgeMetrics metrics={viewModel.metrics} />
      <KnowledgeGrid
        categories={viewModel.categories}
        recent={filteredRecent}
        popularTags={viewModel.popularTags}
        memoryInsights={viewModel.memoryInsights}
        unsorted={viewModel.unsorted}
        snippets={viewModel.snippets}
        selectedId={selectedId}
        onSelectRow={setSelectedId}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// KnowledgeToolbar — search + filter chips (controlled)
// ---------------------------------------------------------------------------

function KnowledgeToolbar({
  query,
  onQueryChange,
  chips,
  activeFilter,
  onFilterChange,
}: {
  readonly query: string;
  readonly onQueryChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  readonly chips: ReadonlyArray<FilterChip>;
  readonly activeFilter: string;
  readonly onFilterChange: (id: string) => void;
}) {
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
        value={query}
        onChange={onQueryChange}
        className="h-8 w-64 rounded-md border border-border bg-surface px-3 text-[13px] text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      />
      <div
        data-slot="knowledge-filter-chips"
        className="flex flex-wrap items-center gap-0.5"
      >
        {chips.map((chip) => {
          const active = chip.id === activeFilter;
          return (
            <button
              key={chip.id}
              type="button"
              data-slot="knowledge-filter-chip"
              data-filter-id={chip.id}
              data-pressed={active ? "true" : "false"}
              aria-pressed={active}
              onClick={() => onFilterChange(chip.id)}
              className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              <TagChip
                label={chip.label}
                tone={active ? "brand" : chip.tone}
                size="sm"
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// KnowledgeMetrics — 5 cards in a single row (presentational)
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
  selectedId,
  onSelectRow,
}: {
  readonly categories: ReadonlyArray<KnowledgeCategory>;
  readonly recent: ReadonlyArray<KnowledgeRow>;
  readonly popularTags: ReadonlyArray<KnowledgeTag>;
  readonly memoryInsights: ReadonlyArray<KnowledgeInsight>;
  readonly unsorted: ReadonlyArray<KnowledgeUnsorted>;
  readonly snippets: ReadonlyArray<KnowledgeSnippet>;
  readonly selectedId: string | null;
  readonly onSelectRow: (id: string) => void;
}) {
  return (
    <div
      data-slot="knowledge-grid"
      className="grid grid-cols-1 gap-card-gap lg:grid-cols-[220px_minmax(0,1fr)_300px]"
    >
      <CategoryPanel categories={categories} />
      <RecentKnowledgeTable
        rows={recent}
        selectedId={selectedId}
        onSelectRow={onSelectRow}
      />
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
// RecentKnowledgeTable — middle column (selectable rows)
// ---------------------------------------------------------------------------

function RecentKnowledgeTable({
  rows,
  selectedId,
  onSelectRow,
}: {
  rows: ReadonlyArray<KnowledgeRow>;
  selectedId: string | null;
  onSelectRow: (id: string) => void;
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
            {rows.length === 0 ? (
              <tr data-slot="recent-knowledge-empty">
                <td
                  colSpan={4}
                  className="py-3 text-center text-[12px] text-muted-foreground"
                >
                  没有匹配的知识条目。
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const selected = row.id === selectedId;
                return (
                  <tr
                    key={row.id}
                    data-slot="recent-knowledge-row"
                    data-knowledge-id={row.id}
                    data-status={row.status}
                    data-selected={selected ? "true" : "false"}
                    aria-selected={selected}
                    onClick={() => onSelectRow(row.id)}
                    className={
                      "cursor-pointer border-b border-border last:border-b-0 " +
                      (selected ? "bg-brand-soft/40" : "hover:bg-surface-subtle")
                    }
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
                          <span className="text-[11px] text-muted-foreground">
                            —
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-1.5 text-right font-mono text-[11px] text-muted-foreground">
                      {row.updatedAt}
                    </td>
                  </tr>
                );
              })
            )}
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
          // Module 04 §5b: each popular-tag chip now links to the Knowledge list
          // filtered by that tag name (/knowledge?tag=<name>). The `?tag=`
          // consumption (filtering the list) is delivered by the Knowledge
          // module (06); this plan supplies the navigational chip + tag data.
          <li key={tag.id}>
            <Link
              href={`/knowledge?tag=${encodeURIComponent(tag.name)}`}
              className="inline-flex rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              <TagChip label={tag.name} tone={tag.tone} size="sm" />
            </Link>
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
