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
 */

import * as React from "react";

import { SearchPage } from "@/features/search/search-page";
import { SearchQueryClient } from "./search-query-client";

export default function SearchRoutePage() {
  return (
    <React.Suspense fallback={<SearchPage />}>
      <SearchQueryClient />
    </React.Suspense>
  );
}
