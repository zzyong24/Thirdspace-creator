// Production module — the ONLY public entry (foundation §1 / MODULE-ARCH §2). The
// composite transport imports Production ONLY through this file (never its
// internals): the service factory to construct it over the shared db (with the
// injected cross-module fan-out seams), the transport factory + op-id list the
// composite merges, PRODUCTION_DDL, the contract DTOs, and the error classes the
// dispatch route maps. The completeExport fan-out reaches Projects/Assets/Search
// ONLY through their own public services (injected as seams) — no cross-module
// repository import.

export {
  createProductionService,
  type ProductionService,
  type ServiceDeps,
  type SetPrimaryOutputAsset,
  type SearchIndexAsset,
  type RecordExportActivity,
} from "./production.service";

export {
  createProductionRepository,
  type ProductionRepository,
  type RepoDeps,
  type ProductionRow,
  type ProductionSegmentRow,
  type ExportRecordRow,
} from "./production.repository";

export {
  createProductionTransport,
  PRODUCTION_OP_IDS,
} from "./production.transport";

export { PRODUCTION_DDL } from "./production.db-schema";

export { OwnershipError, ConflictError } from "./production.errors";

export {
  productionResource,
  productionSegmentResource,
  exportRecordResource,
  type ProductionResource,
  type ProductionSegmentResource,
  type ExportRecordResource,
} from "./production.schema";
