// Analytics module — the ONLY public entry (foundation §1 / MODULE-ARCH §2). The
// composite transport imports Analytics ONLY through this file (never its
// internals): the repository + service factories to construct it over the shared
// db (with the injected AnalyticsPublishingPort), the transport factory + op-id
// list the composite merges, ANALYTICS_DDL, the contract DTO, and the error
// classes the dispatch route maps.
//
// Analytics owns the read side of the two contract ops (analytics.publications.get
// / analytics.projects.get) AND the internal AnalyticsService.appendSnapshot seam
// (SPEC §11) that Ingestion (module 12) calls to persist platform metrics
// idempotently. Cross-module project→publication ownership resolution reaches
// Publishing ONLY through the injected port (no cross-module repository import).

export {
  createAnalyticsService,
  type AnalyticsService,
  type AnalyticsPublishingPort,
  type ServiceDeps,
} from "./analytics.service";

export {
  createAnalyticsRepository,
  type AnalyticsRepository,
  type RepoDeps,
  type AppendSnapshotInput,
  type AppendValueInput,
  type MetricSnapshotRow,
  type MetricValueRow,
  type RetentionPointRow,
  type AudienceSnapshotRow,
} from "./analytics.repository";

export {
  createAnalyticsTransport,
  ANALYTICS_OP_IDS,
} from "./analytics.transport";

export { ANALYTICS_DDL } from "./analytics.db-schema";

export { OwnershipError } from "./analytics.errors";

export {
  metricSnapshotResource,
  type MetricSnapshotResource,
} from "./analytics.schema";
export {parseTrafficTables} from './traffic-parser';
export {createTrafficService,type TrafficService} from './traffic.service';
