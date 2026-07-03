"use client";

/**
 * `AssetsToolbarSearch` — Plan D1 wired search box for the Assets Center
 * toolbar. Submitting (Enter) navigates `/assets?q=<term>` (preserving the
 * active `?type=`), the Server Component re-reads `assets.list` and re-derives
 * the gallery, and the `?q=` substring filter is applied over the read page.
 *
 * `assets.list` has no server-side search param (its query is the bare
 * `paginationQuery`), so the term filters name/description/tags over the loaded
 * page — an honest client-over-page fallback. This is wired (real URL state),
 * not decorative.
 */

import * as React from "react";
import { useRouter } from "next/navigation";

import type { AssetType } from "@/types/domain";

import { assetsHref } from "./assets-href";

export function AssetsToolbarSearch({
  query,
  activeType,
  embedded = false,
}: {
  readonly query: string;
  readonly activeType: AssetType | null;
  /** [T-063d] 内嵌时搜索导航到 /library?tab=assets&q=(301 会丢 query)。 */
  readonly embedded?: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = React.useState(query);

  // Keep the input in sync if the URL-driven query changes underneath us
  // (e.g. a type-filter navigation that preserves `q`).
  React.useEffect(() => {
    setValue(query);
  }, [query]);

  const navigate = React.useCallback(
    (next: string) => {
      const params = new URLSearchParams();
      if (activeType !== null) params.set("type", activeType);
      const trimmed = next.trim();
      if (trimmed.length > 0) params.set("q", trimmed);
      router.push(assetsHref(params, embedded));
    },
    [router, activeType, embedded],
  );

  return (
    <form
      data-slot="assets-search-form"
      onSubmit={(e) => {
        e.preventDefault();
        navigate(value);
      }}
      className="flex h-8 w-72 items-center gap-2 rounded-control border border-border bg-surface px-2.5 text-sm"
    >
      <label className="sr-only" htmlFor="assets-search">
        搜索素材
      </label>
      <span aria-hidden="true" className="text-muted-foreground text-xs">
        🔎
      </span>
      <input
        id="assets-search"
        type="search"
        placeholder="搜索素材名称、标签、描述..."
        data-slot="assets-search-input"
        value={value}
        onChange={(e) => {
          const next = e.target.value;
          setValue(next);
          // A cleared search box restores the unfiltered list immediately.
          if (next.length === 0 && query.length > 0) navigate("");
        }}
        className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
      />
    </form>
  );
}
