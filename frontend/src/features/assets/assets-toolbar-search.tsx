"use client";
import { Search } from "lucide-react";

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

export function AssetsToolbarSearch({
  query,
  activeType,
}: {
  readonly query: string;
  readonly activeType: AssetType | null;
}) {
  const router = useRouter();
  const [value, setValue] = React.useState(query);

  // Keep the input in sync if the URL-driven query changes underneath us
  // (e.g. a type-filter navigation that preserves `q`).
  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- URL 是输入框的外部真相源，导航后需同步受控值
    setValue(query);
  }, [query]);

  const navigate = React.useCallback(
    (next: string) => {
      const params = new URLSearchParams();
      if (activeType !== null) params.set("type", activeType);
      const trimmed = next.trim();
      if (trimmed.length > 0) params.set("q", trimmed);
      const qs = params.toString();
      router.push(qs.length > 0 ? `/assets?${qs}` : "/assets");
    },
    [router, activeType],
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
        <Search className="size-4" aria-hidden="true" />
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
