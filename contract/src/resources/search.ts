import { z } from "zod";
import { id, iso8601 } from "../primitives";

// SearchDocument extends BaseEntity only (no Timestamped).
export const searchDocumentResource = z.object({
  id,
  userId: id,
  entityType: z.string(),
  entityId: id,
  title: z.string(),
  body: z.string(),
  searchText: z.string(),
  embedding: z.array(z.number()),
  indexedAt: iso8601,
});
export type SearchDocumentResource = z.infer<typeof searchDocumentResource>;

// SearchHistory extends BaseEntity only (no Timestamped).
export const searchHistoryResource = z.object({
  id,
  userId: id,
  query: z.string(),
  filters: z.record(z.string(), z.unknown()),
  resultCount: z.number().int(),
  searchedAt: iso8601,
});
export type SearchHistoryResource = z.infer<typeof searchHistoryResource>;

// A single selectable facet value with its hit count, scoped to the current
// query. DERIVED data — computed at read time by aggregating the matched
// SearchDocument rows; never stored. `value` is the raw discriminator the FE
// echoes back as a filter (e.g. the entityType slug or the tag string); `count`
// is the number of matched documents carrying it.
export const searchFacetValueResource = z.object({
  value: z.string(),
  count: z.number().int().nonnegative(),
});
export type SearchFacetValueResource = z.infer<typeof searchFacetValueResource>;

// The facet aggregation served by `search.facets` for a query `q`. One bucket
// per facet dimension; `query` echoes the normalized term the counts were
// computed over (empty query ⇒ all dimensions empty). Buckets are ordered by
// descending count then value for a deterministic wire shape.
export const searchFacetsResource = z.object({
  query: z.string(),
  entityType: z.array(searchFacetValueResource),
  tag: z.array(searchFacetValueResource),
});
export type SearchFacetsResource = z.infer<typeof searchFacetsResource>;
