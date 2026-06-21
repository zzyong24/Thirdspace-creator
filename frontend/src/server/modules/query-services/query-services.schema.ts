// query-services schema (foundation §5 layout). A composition module owns no
// entities — this file re-exports the contract PAGE DTOs the composers build, so
// the service validates against the single source of truth (SPEC §19). No Drizzle
// table definitions here (no db-schema; SPEC §19 owns no SQL).

export {
  dashboardPage,
  metricCard,
  projectOverviewPage,
  globalSearchPage,
  publishingCenterPage,
  type DashboardPage,
  type MetricCard,
  type ProjectOverviewPage,
  type GlobalSearchPage,
  type PublishingCenterPage,
} from "@creatoros/contract";
