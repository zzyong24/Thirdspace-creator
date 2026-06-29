// Production module schema surface — the contract Zod DTOs this module produces
// (foundation §5: "<module>.schema.ts — re-export/usage of the contract Zod DTOs
// for this module"). The transport's toResource(row) and the contract test
// validate their outputs against these; the contract is the single source of
// truth for the wire shape (contract/src/resources/production.ts).
//
// Topology (verified against artifacts.schema.ts): the @creatoros/contract root
// barrel re-exports `ENDPOINTS` but NOT the resource files. The per-op response
// schema is reachable as ENDPOINTS.<op>.response:
//   - getOutputProduction.response === putOutputProduction.response === productionResource
//   - createProductionSegment.response === productionSegmentResource
//   - createProductionExport.response === completeExport.response === exportRecordResource
import { ENDPOINTS } from "@creatoros/contract";

export const productionResource = ENDPOINTS.getOutputProduction.response;
export const productionSegmentResource =
  ENDPOINTS.createProductionSegment.response;
export const exportRecordResource = ENDPOINTS.createProductionExport.response;

// Derive the inferred output types from each schema's phantom `_output` (zod 4's
// `z.infer<T>` is `T["_output"]`). The frontend package does not declare `zod` as
// a direct dependency, so we read the output type structurally instead of a bare
// `import type { z } from "zod"`.
export type ProductionResource = (typeof productionResource)["_output"];
export type ProductionSegmentResource =
  (typeof productionSegmentResource)["_output"];
export type ExportRecordResource = (typeof exportRecordResource)["_output"];
