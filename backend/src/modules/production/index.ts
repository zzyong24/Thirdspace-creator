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
  // [T-366b] 素材包导出接线类型(组合根 wiring 用)。
  type MaterialExportWiring,
  type MaterialExportResult,
} from "./production.service";

// [T-366b] 素材包导出纯函数层(组合根接 ports;文案常量供前端/测试对齐诚实门)。
export {
  aggregateMaterialExport,
  buildStoreZip,
  crc32,
  coerceDecisions,
  renderDirectorReadme,
  renderManifest,
  sanitizeZipName,
  MATERIAL_EXPORT_HONESTY_NOTE,
  NO_DECISIONS_NOTE,
  type MaterialExportPorts,
  type MaterialExportBundle,
  type DecisionsShape,
  type ZipEntry,
  type ManifestLine,
} from "./material-export";

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
