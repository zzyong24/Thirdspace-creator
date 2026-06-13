"use client";

/**
 * `SearchQueryClient` resolves the `?q=...` URL state on the
 * client and forwards it to the server-rendered `SearchPage`.
 *
 * Next.js requires any component that calls `useSearchParams()`
 * to be either wrapped in a Suspense boundary or moved out of the
 * server-rendered tree. The (creator) route's shell router mounts
 * the page in a Server Component, so the URL read must happen in
 * a small client island.
 *
 * On the very first render (before hydration) the page is shown
 * with `initialQuery=""`. After hydration the client island
 * reads the URL and re-renders the page with the resolved query.
 *
 * No `Date.now`, no `Math.random`, no network access.
 */

import * as React from "react";
import { useSearchParams } from "next/navigation";

import { SearchPage } from "@/features/search/search-page";

export function SearchQueryClient() {
  const searchParams = useSearchParams();
  const query = searchParams?.get("q") ?? "";
  return <SearchPage initialQuery={query} />;
}
