import { z } from "zod";
import { defineEndpoint } from "../endpoints.js";
import { paginationQuery } from "../primitives.js";
import { searchDocumentResource } from "../resources/search.js";

// SPEC §13 "搜索" group.
const searchQuery = paginationQuery.extend({
  q: z.string().min(1),
  type: z.string().optional(),
});

export const searchOperations = {
  search: defineEndpoint({
    id: "search.query",
    method: "GET",
    path: "/search",
    query: searchQuery,
    response: searchDocumentResource,
    isList: true,
    fr: ["FR-SEARCH-QUERY"],
  }),
} as const;
