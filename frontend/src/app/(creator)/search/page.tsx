/**
 * Global Search route entrypoint (Module 02, Task 5 — server read switch).
 *
 * The (creator) layout supplies the shared AppShell (Sidebar + TopHeader) and the
 * global Header is configured for `/search` with header mode `search` and the
 * approved `assistant` contextual-card variant in `shell-router.tsx`.
 *
 * This is a Server Component. It reads the `?q=` URL state from the route's
 * `searchParams`, fetches the composed `pages.search.get` op server-side under the
 * request's session ctx, maps the `globalSearchPage` DTO into the page's
 * `SearchViewModel`, and renders `SearchPage` with that `viewModel`. The
 * `viewModel?` seam is preserved: when there is no session ctx (SSR fallback /
 * tests), `SearchPage` falls back to `buildSearchViewModel()`.
 *
 * History rows re-run a prior query by navigating `/search?q=<row.query>` (a
 * link), which re-reads `pages.search.get` and re-appends a SearchHistory row
 * server-side (the spec-gap resolution — no invented mutation endpoint).
 */

import * as React from "react";

import { resolveSession } from "@/lib/session.server";
import { createServerClient } from "@/lib/contract-client.server";
import { SearchPage } from "@/features/search/search-page";
import { globalSearchPageToViewModel } from "@/features/search/search-view-model";

interface SearchRoutePageProps {
  readonly searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function SearchRoutePage({
  searchParams,
}: SearchRoutePageProps) {
  const params = (await searchParams) ?? {};
  const rawQ = params.q;
  const q = Array.isArray(rawQ) ? (rawQ[0] ?? "") : (rawQ ?? "");

  const session = await resolveSession();
  if (!session) {
    // No session (the (creator) layout guard will already have redirected on a
    // real request). Render the fixture-composed fallback so SSR never crashes.
    return <SearchPage initialQuery={q} />;
  }

  const page = (await createServerClient(session.ctx).getGlobalSearch({
    params: undefined,
    query: { q },
    body: undefined,
  })) as unknown as Parameters<typeof globalSearchPageToViewModel>[0];

  const viewModel = globalSearchPageToViewModel(page);
  return <SearchPage viewModel={viewModel} initialQuery={q} />;
}
