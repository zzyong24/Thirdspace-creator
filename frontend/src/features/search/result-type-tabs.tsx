"use client";

/**
 * `ResultTypeTabs` — client island that turns the four result-type tabs
 * (项目 / 知识 / 素材 / 视频) into a REAL client-side facet over the result
 * groups already returned by `pages.search.get`.
 *
 * Why client-only / zero backend (GAP-SRCH-1):
 *   The server already groups results by entity type and renders each group as
 *   a `SectionCard`. A "result type" facet therefore needs no server facet op —
 *   it is purely a question of which already-rendered groups stay visible. So
 *   this island filters the DOM groups by `data-result-group` and scrolls the
 *   active group into view. No `search.facets` op is invented.
 *
 * Semantics (D-SRCH-b → "filter to that group" + anchor):
 *   - Initial state shows ALL groups (no tab pressed). This keeps SSR output
 *     and the non-JS / pre-hydration render identical to "show everything".
 *   - Clicking a tab filters the visible groups to that single type and scrolls
 *     it into view.
 *   - Clicking the already-active tab toggles back to "show all".
 *
 * The page itself stays a Server Component. Only this tab strip is a client
 * island; the result groups remain server-rendered siblings whose visibility we
 * toggle via the `hidden` attribute on their `[data-result-group]` wrappers.
 *
 * No `Date.now`, no `Math.random`, no network access.
 */

import * as React from "react";

export interface ResultTypeTabsTab {
  readonly id: string;
  readonly label: string;
  readonly count: number;
}

export interface ResultTypeTabsProps {
  readonly tabs: ReadonlyArray<ResultTypeTabsTab>;
  readonly totalCount: number;
}

const ALL_GROUPS = ["project", "knowledge", "asset", "video"] as const;

export function ResultTypeTabs({ tabs, totalCount }: ResultTypeTabsProps) {
  // `null` = show all groups (the default, matching the SSR render where every
  // group is visible). A tab id = filter to just that group.
  const [activeType, setActiveType] = React.useState<string | null>(null);

  // Apply the active filter to the server-rendered result groups by toggling
  // their `hidden` attribute. The groups are siblings rendered by the server
  // component; we select them by the stable `data-result-group` contract.
  React.useEffect(() => {
    const root = document.querySelector<HTMLElement>(
      '[data-search-id="search-root"]',
    );
    if (!root) return;
    for (const group of ALL_GROUPS) {
      const node = root.querySelector<HTMLElement>(
        `[data-result-group="${group}"]`,
      );
      if (!node) continue;
      const visible = activeType === null || activeType === group;
      node.hidden = !visible;
    }
    // When a single group is selected, bring it into view so the facet feels
    // like a real "jump to + filter" interaction rather than a silent toggle.
    if (activeType) {
      const target = root.querySelector<HTMLElement>(
        `[data-result-group="${activeType}"]`,
      );
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    // On unmount / re-render away, the cleanup re-reveals every group so we
    // never leave a group orphaned as `hidden`.
    return () => {
      for (const group of ALL_GROUPS) {
        const node = root.querySelector<HTMLElement>(
          `[data-result-group="${group}"]`,
        );
        if (node) node.hidden = false;
      }
    };
  }, [activeType]);

  const handleClick = React.useCallback((tabId: string) => {
    setActiveType((current) => (current === tabId ? null : tabId));
  }, []);

  return (
    <div
      data-slot="result-type-tabs-block"
      data-active-type={activeType ?? "all"}
      className="-mt-1 flex flex-col gap-2"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* §290 Result type tabs (项目/知识/素材/视频) — REAL client-side facet
            over the already-grouped results (no server facet op needed; see
            GAP-SRCH-1). Clicking filters the visible groups + scrolls; clicking
            the active tab again clears the filter. */}
        <nav
          data-slot="result-type-tabs"
          aria-label="搜索结果类型"
          className="flex flex-wrap items-center gap-1.5"
        >
          {tabs.map((tab) => {
            const pressed = activeType === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                data-slot="result-type-tab"
                data-tab-id={tab.id}
                data-pressed={pressed ? "true" : "false"}
                aria-selected={pressed}
                onClick={() => handleClick(tab.id)}
                className="inline-flex h-7 items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 text-[12px] font-medium text-foreground transition-colors hover:bg-surface-subtle data-[pressed=true]:border-brand/60 data-[pressed=true]:bg-brand-soft data-[pressed=true]:text-brand"
              >
                <span>{tab.label}</span>
                <span
                  data-slot="result-type-tab-count"
                  className="font-mono text-[10px] text-muted-foreground data-[pressed=true]:text-brand/70"
                >
                  {tab.count}
                </span>
              </button>
            );
          })}
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
          {activeType ? (
            <>
              已筛选「
              <span className="text-foreground">
                {tabs.find((t) => t.id === activeType)?.label ?? activeType}
              </span>
              」 ·{" "}
              <button
                type="button"
                data-slot="result-type-clear"
                onClick={() => setActiveType(null)}
                className="font-medium text-brand hover:underline"
              >
                显示全部
              </button>
            </>
          ) : (
            <>
              找到 <span className="font-mono text-foreground">{totalCount}</span> 个结果
            </>
          )}
        </span>
      </div>
    </div>
  );
}
