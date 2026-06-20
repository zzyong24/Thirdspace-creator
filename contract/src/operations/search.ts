// SPEC §13 exposes search only through the composed `GET /search`, which is
// served by the GlobalSearchQueryService and returns the grouped page DTO
// (see operations/pages.ts + pages/global-search.ts, MODULE-ARCHITECTURE §5).
// The Search module owns no standalone HTTP endpoint of its own here; its
// resource schemas live in resources/search.ts.
export const searchOperations = {} as const;
