// Query-services module — the ONLY public entry (foundation §1 / MODULE-ARCH §2).
// A COMPOSITION module (SPEC §19): no db-schema, no repository, no entities. It
// owns the 3 page-read ops + 1 client-composed DTO selector (publishingCenterPage,
// no endpoint). The composite transport imports this module ONLY through this file:
// the four composer factories + the transport factory + the op-id list it merges.
// Other modules do NOT import this module (it is a leaf consumer at Wave 4).

export {
  createDashboardQueryService,
  createProjectOverviewQueryService,
  createGlobalSearchQueryService,
  createPublishingCenterQueryService,
  type DashboardQueryService,
  type ProjectOverviewQueryService,
  type GlobalSearchQueryService,
  type PublishingCenterQueryService,
  type DashboardDeps,
  type ProjectOverviewDeps,
  type GlobalSearchDeps,
  type PublishingCenterDeps,
  type DashboardSummary,
  type DashboardMetrics,
  type ProjectOverviewCore,
  type ProjectAssetStats,
  type PublishingMetricsBundle,
  type SearchDocLike,
  type SearchHistoryLike,
} from "./query-services.service";

export {
  createQueryServicesTransport,
  QUERY_SERVICES_OP_IDS,
  type QueryServicesTransportDeps,
} from "./query-services.transport";

export { OwnershipError } from "./query-services.errors";
export {
  composeDashboardTodos,
  type ActiveProjectSchedule,
  type ScheduleProjectFact,
  type DashboardScheduleInput,
} from "./dashboard-schedule-reminders";

export {
  dashboardPage,
  projectOverviewPage,
  globalSearchPage,
  publishingCenterPage,
  type DashboardPage,
  type ProjectOverviewPage,
  type GlobalSearchPage,
  type PublishingCenterPage,
} from "./query-services.schema";
