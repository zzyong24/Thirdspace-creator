import { z } from "zod";
import { defineEndpoint } from "../endpoints";
import { searchFacetsResource } from "../resources/search";

// SPEC §13 exposes the composed `GET /search` (served by the GlobalSearchQueryService,
// see operations/pages.ts + pages/global-search.ts, MODULE-ARCHITECTURE §5). The
// Search module ALSO owns a standalone read aggregation: `search.facets`.
//
// GAP-SRCH-facets — `GET /search/facets?q=` returns the per-dimension facet
// buckets (entityType / tag) with hit counts for the matched documents, so the
// search sidebar filters become real (clickable, count-bearing) instead of inert
// decoration. This is a DERIVED read over the same SearchDocument index that
// `GET /search` queries; it stores nothing. Empty query ⇒ all buckets empty.
export const searchOperations = {
  getSearchFacets: defineEndpoint({
    id: "search.facets",
    method: "GET",
    path: "/search/facets",
    query: z.object({ q: z.string().optional() }),
    response: searchFacetsResource,
    fr: ["FR-SEARCH-FACETS"],
  }),
} as const;
