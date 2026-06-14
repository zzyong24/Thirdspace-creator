"use client";

/**
 * `SearchInteractiveRegion` is the small client island the Search
 * page mounts in place of the page-level search input. The shared
 * TopHeader already renders the global search field in `search`
 * mode; this island duplicates the input below the header so the
 * search query is independently controllable in the page's
 * scrollable area, and synchronises the value to the URL `?q=`
 * state.
 *
 * The page itself stays a Server Component — it receives the
 * `initialQuery` from the route entrypoint which reads
 * `useSearchParams()` on the client.
 *
 * No `Date.now`, no `Math.random`, no network access. The island
 * only updates the URL via `useRouter().replace()`.
 *
 * Suspense-fallback handling
 * --------------------------
 * The route entrypoint wraps `<SearchPage />` in a Suspense
 * boundary whose fallback is *also* `<SearchPage />`. During SSR /
 * streaming, the fallback instance renders first; on the client,
 * the actual instance replaces it. While the fallback is mounted,
 * `useSearchParams()` resolves to `null` (Next.js does not yet
 * have access to the request URL inside the unresolved boundary).
 * We use that signal to suppress the input element from the
 * fallback so the DOM never contains two matching
 * `[data-slot="search-page-input"]` nodes — which would otherwise
 * trip Playwright's strict-mode locators.
 */

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { Input } from "@/components/ui/input";
import { creatorIcons } from "@/lib/icons";
import { cn } from "@/lib/utils";

const SearchIcon = creatorIcons.search;

export interface SearchInteractiveRegionProps {
  readonly initialQuery?: string;
  readonly placeholder?: string;
  readonly className?: string;
}

export function SearchInteractiveRegion({
  initialQuery = "",
  placeholder = "搜索项目、素材、知识或视频",
  className,
}: SearchInteractiveRegionProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Detect the Suspense fallback pass: the route entrypoint renders
  // `<Suspense fallback={<SearchPage />}>` so during SSR / streaming
  // the fallback instance runs first WITHOUT the `initialQuery`
  // prop (the actual instance receives the resolved `?q=` value via
  // the route's `SearchQueryClient`). We treat any render where the
  // URL exposes a query but the prop is still empty as the
  // fallback. This signal survives SSR ↔ hydration because both
  // passes observe the same URL but only the actual pass carries
  // the prop.
  const urlQuery = searchParams?.get("q") ?? "";
  const isSuspenseFallback = urlQuery.length > 0 && initialQuery.length === 0;
  // Initial state: prefer the URL `?q=` value if it is set,
  // otherwise fall back to whatever the server-rendered page
  // provided. The lazy initializer runs only once, so we do not
  // need an effect to mirror the URL into local state.
  const [value, setValue] = React.useState<string>(() => {
    const urlQ = searchParams?.get("q");
    return urlQ && urlQ.length > 0 ? urlQ : initialQuery;
  });
  const lastWrittenRef = React.useRef<string>(
    (() => {
      const urlQ = searchParams?.get("q");
      return urlQ && urlQ.length > 0 ? urlQ : initialQuery;
    })(),
  );
  // Track the first non-empty render to avoid double-writing the
  // initial value back into the URL on mount.
  const initialSyncRef = React.useRef<boolean>(false);

  // Mirror external URL changes (e.g. back/forward) into the
  // local input value.
  React.useEffect(() => {
    const urlQ = searchParams?.get("q") ?? "";
    if (!initialSyncRef.current) {
      initialSyncRef.current = true;
      return;
    }
    if (urlQ !== value && urlQ !== lastWrittenRef.current) {
      setValue(urlQ);
      lastWrittenRef.current = urlQ;
    }
    // We intentionally exclude `value` from the dep list — this
    // effect is for the URL → input direction only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const handleChange = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const next = event.target.value;
      setValue(next);
      lastWrittenRef.current = next;
      const params = new URLSearchParams(searchParams?.toString() ?? "");
      if (next) {
        params.set("q", next);
      } else {
        params.delete("q");
      }
      const query = params.toString();
      const url = query ? `/search?${query}` : "/search";
      router.replace(url, { scroll: false });
    },
    [router, searchParams],
  );

  if (isSuspenseFallback) {
    // Render a placeholder of equal height so the page rhythm does
    // not shift between the SSR fallback pass and the hydrated
    // pass. The placeholder has NO matching `data-slot` so it does
    // not collide with the actual instance's input.
    return (
      <div
        data-slot="search-interactive-region-fallback"
        aria-hidden="true"
        className={cn("h-9 w-full", className)}
      />
    );
  }

  return (
    <div
      data-slot="search-interactive-region"
      className={cn(
        "flex items-center gap-2 rounded-control border border-border bg-surface px-3",
        className,
      )}
    >
      <SearchIcon
        className="size-4 text-muted-foreground"
        aria-hidden="true"
      />
      <label className="sr-only" htmlFor="search-page-input">
        全局搜索
      </label>
      <Input
        id="search-page-input"
        type="search"
        data-slot="search-page-input"
        value={value}
        onChange={handleChange}
        placeholder={placeholder}
        autoComplete="off"
        className="h-9 w-full border-0 bg-transparent shadow-none focus-visible:ring-0"
      />
    </div>
  );
}