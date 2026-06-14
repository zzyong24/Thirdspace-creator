/**
 * Global Search route entrypoint.
 *
 * The (creator) layout supplies the shared AppShell (Sidebar +
 * TopHeader) and the global Header is configured for `/search`
 * with header mode `search` and the approved `assistant`
 * contextual-card variant in `shell-router.tsx` (page-specs §15,
 * D-003, D-005).
 *
 * The page itself is a Server Component. The `?q=...` URL state
 * is read on the client by the inner `SearchQueryClient` which
 * resolves the initial query once on mount and then renders the
 * server-side `SearchPage` with that value.
 *
 * The Suspense fallback is intentionally a minimal fragment, NOT
 * a second `<SearchPage />` instance. Rendering a second
 * `SearchPage` here would inject a second `<main data-page="search">`
 * into the SSR streaming payload (hidden, but in the DOM) and
 * cause the page-level `[data-slot="search-page-input"]` locator
 * to resolve to two nodes — tripping Playwright's strict-mode
 * locators and the visual matrix's `page.locator("main")` count.
 */

import * as React from "react";

import { SearchQueryClient } from "./search-query-client";

export default function SearchRoutePage() {
  return (
    <React.Suspense fallback={<></>}>
      <SearchQueryClient />
    </React.Suspense>
  );
}
