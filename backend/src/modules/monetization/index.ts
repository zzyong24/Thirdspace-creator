// Monetization module — the ONLY public entry (foundation §1 / MODULE-ARCH §2). The
// composite transport imports Monetization ONLY through this file (never its
// internals): the service factory to construct it over the shared db (with the
// injected peer ports), the transport factory + op-id list the composite merges,
// MONETIZATION_DDL, the contract DTOs/mappers, and the error classes the dispatch
// route maps. No cross-module repository import.
//
// Monetization owns 18 contract ops (products.* / products.offers.* /
// outputs.products.* / leads.* / leads.conversions.* / monetization.funnel.*). The
// peer reads (Projects ContentOutput ownership, Ingestion run existence, Analytics
// conversion MetricValue, Search index, Notifications notify) reach those modules ONLY
// through injected narrow ports (no cross-module repository import, SPEC §22).
// `ingestSurveyLeads` is the §C-4 飞书问卷 intake — NOT a contract op; it is called BY
// the Ingestion module's adapter (no parallel write path). `getFunnelForOutput` /
// `getProductFunnel` are exposed for the Reviews ConversionFunnel down-drill +
// Calibration/Dashboard query services (consume AFTER green).

export {
  createMonetizationService,
  type MonetizationService,
  type ServiceDeps,
  type MonetizationProjectsPort,
  type MonetizationIngestionPort,
  type MonetizationAnalyticsPort,
  type MonetizationSearchPort,
  type MonetizationNotificationsPort,
  type ConversionMetricInput,
  type SurveyLeadRecord,
} from "./monetization.service";

export {
  createMonetizationTransport,
  MONETIZATION_OP_IDS,
} from "./monetization.transport";

export { MONETIZATION_DDL } from "./monetization.db-schema";

export {
  OwnershipError,
  ConflictError,
  ValidationError,
} from "./monetization.errors";

export {
  productResource,
  offerResource,
  leadResource,
  conversionEventResource,
  contentOutputProductResource,
  funnelStageResource,
  monetizationFunnelResource,
  toProductDto,
  toOfferDto,
  toLeadDto,
  toConversionEventDto,
  toContentOutputProductDto,
  type ProductResource,
  type OfferResource,
  type LeadResource,
  type ConversionEventResource,
  type ContentOutputProductResource,
  type FunnelStageResource,
  type MonetizationFunnelResource,
} from "./monetization.schema";

// The repository factory + row types are exported ONLY for the composition root's
// canonical seed (persistence-client mints a user-scoped seed repo and calls
// seedProducts/seedLeads) — mirrors positioning/artifacts. No OTHER module imports
// the repository (acceptance grep: no cross-module repo import).
export {
  createMonetizationRepository,
  type MonetizationRepository,
  type RepoDeps,
  type ProductRow,
  type OfferRow,
  type LeadRow,
  type ConversionEventRow,
  type ContentOutputProductRow,
} from "./monetization.repository";
