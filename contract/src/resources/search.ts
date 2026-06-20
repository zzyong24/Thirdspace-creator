import { z } from "zod";
import { id, iso8601 } from "../primitives.js";

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
