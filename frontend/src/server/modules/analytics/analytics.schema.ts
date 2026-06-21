// Analytics module schema surface — the contract Zod DTOs this module produces
// (foundation §5: "<module>.schema.ts — re-export/usage of the contract Zod DTOs
// for this module"). The transport's toResource(row) and the contract test
// validate their outputs against these; the contract is the single source of truth
// for the wire shape (contract/src/resources/analytics.ts).
//
// Topology (verified against publishing.schema.ts): the @creatoros/contract root
// barrel re-exports `ENDPOINTS` but NOT the resource files. Both owned ops respond
// with metricSnapshotResource, reachable as ENDPOINTS.<op>.response:
//   - getPublicationAnalytics.response === getProjectAnalytics.response
//       === metricSnapshotResource
// The value/retention/audience resources have no owned read op this wave (the two
// ops respond with metricSnapshotResource only) but are re-exported for the module
// (Ingestion writes + future tab data) via the contract resource module path.
import { ENDPOINTS } from "@creatoros/contract";

export const metricSnapshotResource =
  ENDPOINTS.getPublicationAnalytics.response;

// Derive the inferred output type from the schema's phantom `_output` (zod 4's
// `z.infer<T>` is `T["_output"]`). The frontend package does not declare `zod` as
// a direct dependency, so we read the output type structurally.
export type MetricSnapshotResource = (typeof metricSnapshotResource)["_output"];
