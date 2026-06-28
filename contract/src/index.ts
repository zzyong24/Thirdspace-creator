export const CONTRACT_API_BASE = "/api/v1";

export * from "./envelope";
export * from "./primitives";
export * from "./endpoints";
export * from "./request-context";
export * from "./transport";
export * from "./client";

// Taxonomy resource DTOs (module-04). Resources are normally reached via
// `ENDPOINTS.<op>.response`, but the taxonomy module's `<module>.schema.ts`
// re-exports these named Zod schemas + types directly (foundation §5 / Step 0c:
// "export the resource from contract/src/index.ts"), so the service/repository
// layer can validate against the single source of truth.
export {
  tagResource,
  entityTagResource,
  tagEntityType,
  type TagResource,
  type EntityTagResource,
  type TagEntityType,
} from "./resources/taxonomy";

// contract v0.4 — 七步 (seven-step) module resource DTOs. Re-exported so each
// module's `<module>.schema.ts` can validate against the single source of truth
// (same convention as taxonomy above).
export {
  creatorProfileResource,
  positioningStatementResource,
  positioningGateResultResource,
  positioningCenterResource,
  type CreatorProfileResource,
  type PositioningStatementResource,
  type PositioningGateResultResource,
  type PositioningCenterResource,
} from "./resources/positioning";
export {
  productResource,
  offerResource,
  leadResource,
  conversionEventResource,
  contentOutputProductResource,
  funnelStageResource,
  monetizationFunnelResource,
  type ProductResource,
  type OfferResource,
  type LeadResource,
  type ConversionEventResource,
  type ContentOutputProductResource,
  type FunnelStageResource,
  type MonetizationFunnelResource,
} from "./resources/monetization";
export {
  candidateResource,
  candidateCard,
  audienceSignalResource,
  topicPromotionResource,
  topicsOverviewResource,
  type CandidateResource,
  type CandidateCard,
  type AudienceSignalResource,
  type TopicPromotionResource,
  type TopicsOverviewResource,
} from "./resources/candidate";
export {
  rubricResource,
  rubricVersionResource,
  predictionResource,
  calibrationResultResource,
  type RubricResource,
  type RubricVersionResource,
  type PredictionResource,
  type CalibrationResultResource,
} from "./resources/calibration";
export {
  platformAccountResource,
  type PlatformAccountResource,
} from "./resources/platform-accounts";
export {
  contentCalendarEntryResource,
  publishingCadenceResource,
  cadenceAttainmentResource,
  type ContentCalendarEntryResource,
  type PublishingCadenceResource,
  type CadenceAttainmentResource,
} from "./resources/content-calendar";
export {
  materialLinkResource,
  type MaterialLinkResource,
} from "./resources/material-links";

// PAGE composition DTOs (SPEC §19). The dashboard / projectOverview / globalSearch
// DTOs are reachable via `ENDPOINTS.<op>.response`; `publishingCenterPage` has NO
// endpoint (composed server-side by the query-services module), so it is surfaced
// here so the module's `<module>.schema.ts` can validate against the single source
// of truth (same convention as the resource re-exports above).
export {
  dashboardPage,
  metricCard,
  type DashboardPage,
  type MetricCard,
} from "./pages/dashboard";
export {
  projectOverviewPage,
  type ProjectOverviewPage,
} from "./pages/project-overview";
export {
  globalSearchPage,
  type GlobalSearchPage,
} from "./pages/global-search";
export {
  publishingCenterPage,
  type PublishingCenterPage,
} from "./pages/publishing-center";
