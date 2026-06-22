// Search module schema surface — the contract Zod DTOs this module produces
// (foundation §5: "<module>.schema.ts — re-export/usage of the contract Zod DTOs
// for this module"). The transport assembles a globalSearchPage and the contract
// test validates it; the contract is the single source of truth for the wire
// shape (contract/src/pages/global-search.ts).
//
// Topology note (verified, same as notifications.schema.ts): the @creatoros/contract
// root barrel re-exports `ENDPOINTS` but NOT the page/resource files. The Global
// Search page DTO is reachable as `ENDPOINTS.getGlobalSearch.response`
// (=== globalSearchPage). The Search module owns no standalone HTTP endpoint, so
// the searchDocument/searchHistory resource schemas are not exposed via ENDPOINTS;
// we derive the document resource SHAPE locally for the service's row→resource map
// (the in-process SPEC §16 interface, not a wire contract).
import { ENDPOINTS } from "@creatoros/contract";

// The composed page DTO served by `pages.search.get`.
export const globalSearchPage = ENDPOINTS.getGlobalSearch.response;
export type GlobalSearchPage = (typeof globalSearchPage)["_output"];

// The in-process SearchDocument resource shape (SPEC §16 internal API). This is
// the public service return type for `search()`; it mirrors
// contract/src/resources/search.ts:searchDocumentResource exactly.
export interface SearchDocumentResource {
  id: string;
  userId: string;
  entityType: string;
  entityId: string;
  title: string;
  body: string;
  searchText: string;
  embedding: number[];
  indexedAt: string;
}
