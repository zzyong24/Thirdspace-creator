// Search module — the ONLY public entry (foundation §1 / MODULE-ARCH §2). The
// composite transport imports Search ONLY through this file (never its internals):
// the service + repository factories to construct it over the shared db, the
// transport factory + op-id list the composite merges, SEARCH_DDL, the page DTO,
// and the error class the dispatch route maps. No cross-module repository import
// (SPEC §16: SearchService 不反向读取其他模块 repository).

export {
  createSearchService,
  type SearchService,
  type ServiceDeps,
  type SearchIndexOutcome,
  type UpsertInput,
  type RebuildDoc,
} from "./search.service";

export {
  createSearchRepository,
  type SearchRepository,
  type SearchDocumentRow,
  type SearchHistoryRow,
  type RepoDeps,
} from "./search.repository";

export {
  createSearchTransport,
  SEARCH_OP_IDS,
} from "./search.transport";

export { SEARCH_DDL } from "./search.db-schema";

export { OwnershipError } from "./search.errors";

export {
  globalSearchPage,
  type GlobalSearchPage,
  type SearchDocumentResource,
} from "./search.schema";
