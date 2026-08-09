"use client";

/**
 * `SearchFacetsPanel` — client island that replaces the former「规划中」decorative
 * sidebar filters (GAP-SRCH-facets) with a REAL, clickable facet panel backed by
 * the `search.facets` server op (GET /search/facets?q=).
 *
 * Why a real server op (vs. the result-type tabs, which are client-only):
 *   The result-type tabs facet over the FOUR already-grouped result sets the page
 *   DTO ships, so they need no backend. But entityType-with-counts and the TAG
 *   dimension aggregate over the WHOLE matched document set (not just the current
 *   page's groups) — that aggregation lives server-side. This island fetches it
 *   from `search.facets` whenever the `?q=` term changes and renders each bucket
 *   value as a clickable control:
 *     - entityType buckets → navigate to `?q=<q>&type=<value>` so the server
 *       `pages.search.get` read REALLY narrows to that type (it already honours the
 *       `type` query param). Clicking the active one clears it.
 *     - tag buckets → re-search with the tag appended to the query (`?q=<q> <tag>`),
 *       a real re-run of the FTS read.
 *
 * Honest empty / loading / error states — no silent inert control:
 *   - empty query ⇒ a hint to type a query (the op returns empty buckets anyway).
 *   - in-flight ⇒ a「加载中」line.
 *   - op failure ⇒ a small error line (the panel never throws into the page).
 *
 * No `Date.now`, no `Math.random` beyond the network read keyed on `?q=`.
 */

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { client } from "@/lib/contract-client";
import { SectionCard } from "@/components/project/section-card";
import { TagChip } from "@/components/content/tag-chip";
import { cn } from "@/lib/utils";

interface FacetValue {
  readonly value: string;
  readonly count: number;
}

interface FacetsState {
  readonly status: "idle" | "loading" | "ready" | "error";
  readonly query: string;
  readonly entityType: ReadonlyArray<FacetValue>;
  readonly tag: ReadonlyArray<FacetValue>;
}

const ENTITY_TYPE_LABELS: Record<string, string> = {
  project: "项目",
  knowledge: "知识",
  asset: "素材",
  video: "视频",
};

const EMPTY: FacetsState = {
  status: "idle",
  query: "",
  entityType: [],
  tag: [],
};

export interface SearchFacetsPanelProps {
  readonly initialQuery?: string;
}

export function SearchFacetsPanel({ initialQuery = "" }: SearchFacetsPanelProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlQuery = (searchParams?.get("q") ?? initialQuery).trim();
  const activeType = searchParams?.get("type") ?? "";

  const [state, setState] = React.useState<FacetsState>(EMPTY);

  React.useEffect(() => {
    if (urlQuery === "") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- URL 查询清空时同步清除上一查询的外部 facets
      setState(EMPTY);
      return;
    }
    let cancelled = false;
    setState((s) => ({ ...s, status: "loading" }));
    client
      .getSearchFacets({ params: undefined, query: { q: urlQuery }, body: undefined })
      .then((facets) => {
        if (cancelled) return;
        setState({
          status: "ready",
          query: facets.query,
          entityType: facets.entityType,
          tag: facets.tag,
        });
      })
      .catch(() => {
        if (cancelled) return;
        setState({ status: "error", query: urlQuery, entityType: [], tag: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [urlQuery]);

  const navigate = React.useCallback(
    (nextQ: string, nextType: string | null) => {
      const params = new URLSearchParams(searchParams?.toString() ?? "");
      if (nextQ) params.set("q", nextQ);
      else params.delete("q");
      if (nextType) params.set("type", nextType);
      else params.delete("type");
      const query = params.toString();
      router.push(query ? `/search?${query}` : "/search", { scroll: false });
    },
    [router, searchParams],
  );

  const onEntityType = React.useCallback(
    (value: string) => {
      // Toggle: clicking the active type clears the narrowing.
      navigate(urlQuery, value === activeType ? null : value);
    },
    [navigate, urlQuery, activeType],
  );

  const onTag = React.useCallback(
    (tag: string) => {
      // Re-search with the tag appended (skip if already present).
      const tokens = urlQuery.split(/\s+/).filter(Boolean);
      const nextQ = tokens.includes(tag) ? urlQuery : [...tokens, tag].join(" ");
      navigate(nextQ, activeType || null);
    },
    [navigate, urlQuery, activeType],
  );

  return (
    <SectionCard
      title="筛选"
      description="按类型、标签缩小范围"
    >
      {/* `data-slot="search-filters"` is the stable selector the sidebar facet
          block has always exposed (visual / e2e specs locate it by this); the
          `data-search-facets-panel` marker tags the new REAL facet island. */}
      <div
        data-slot="search-filters"
        data-search-facets-panel="true"
        className="flex flex-col gap-3"
      >
        {urlQuery === "" ? (
          <p className="px-2 text-[11px] leading-snug text-muted-foreground">
            输入搜索词后，这里会显示可点选的类型 / 标签分面。
          </p>
        ) : state.status === "loading" ? (
          <p
            data-slot="search-facets-loading"
            className="px-2 text-[11px] text-muted-foreground"
          >
            加载分面中…
          </p>
        ) : state.status === "error" ? (
          <p
            data-slot="search-facets-error"
            className="px-2 text-[11px] text-destructive"
          >
            分面加载失败，请重试。
          </p>
        ) : (
          <>
            <FacetGroup
              label="类型"
              dimension="entityType"
              values={state.entityType}
              activeValue={activeType}
              labelFor={(v) => ENTITY_TYPE_LABELS[v] ?? v}
              onSelect={onEntityType}
            />
            <FacetGroup
              label="标签"
              dimension="tag"
              values={state.tag}
              activeValue=""
              labelFor={(v) => v}
              onSelect={onTag}
            />
            {state.entityType.length === 0 && state.tag.length === 0 ? (
              <p
                data-slot="search-facets-empty"
                className="px-2 text-[11px] text-muted-foreground"
              >
                当前结果没有可用分面。
              </p>
            ) : null}
          </>
        )}
      </div>
    </SectionCard>
  );
}

function FacetGroup({
  label,
  dimension,
  values,
  activeValue,
  labelFor,
  onSelect,
}: {
  readonly label: string;
  readonly dimension: string;
  readonly values: ReadonlyArray<FacetValue>;
  readonly activeValue: string;
  readonly labelFor: (value: string) => string;
  readonly onSelect: (value: string) => void;
}) {
  if (values.length === 0) return null;
  return (
    <div
      data-slot="search-facet-group"
      data-facet-dimension={dimension}
      className="flex flex-col gap-1.5"
    >
      <span className="px-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <ul className="flex flex-col gap-1" aria-label={`${label}分面`}>
        {values.map((facet) => {
          const pressed = facet.value === activeValue;
          return (
            <li
              key={facet.value}
              data-slot="search-facet-row"
              data-facet-value={facet.value}
            >
              <button
                type="button"
                data-slot="search-facet-button"
                data-pressed={pressed ? "true" : "false"}
                aria-pressed={pressed}
                onClick={() => onSelect(facet.value)}
                className={cn(
                  "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-surface-subtle",
                  pressed && "bg-brand-soft",
                )}
              >
                <span className="flex items-center gap-2 text-foreground">
                  <TagChip
                    label={labelFor(facet.value)}
                    tone={dimension === "tag" ? "brand" : "neutral"}
                    size="sm"
                  />
                </span>
                <span className="font-mono text-xs text-muted-foreground">
                  {facet.count}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
