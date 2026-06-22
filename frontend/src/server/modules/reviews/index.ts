// Reviews module — the ONLY public entry (foundation §1 / MODULE-ARCH §2). The
// composite transport imports Reviews ONLY through this file (never its
// internals): the service + repository factories to construct it over the shared
// db (with the injected Projects/Publishing/Analytics ports), the transport factory
// + op-id list the composite merges, REVIEWS_DDL, the contract DTOs, and the error
// classes the dispatch route maps.
//
// Reviews owns the four contract ops (reviews.create / reviews.get /
// reviews.insights.create / reviews.complete). Cross-module reads (project/output
// ownership, publishing window, analytics evidence) + the activity append reach
// peers ONLY through the injected ports (no cross-module repository import, SPEC
// §22). listCompletedReviewInsights is the G14 Learnings / G15 AI bridge read —
// exposed on the ReviewsService so those modules consume completed-review insights
// WITHOUT a Reviews repo import (the unblock contract, plan Step 6).

export {
  createReviewsService,
  type ReviewsService,
  type ServiceDeps,
  type ReviewsProjectsPort,
  type ReviewsPublishingPort,
  type ReviewsAnalyticsPort,
  type ReviewPublicationWindow,
} from "./reviews.service";

export {
  createReviewsRepository,
  type ReviewsRepository,
  type RepoDeps,
  type ReviewRow,
  type ReviewInsightRow,
  type ReviewPublicationRow,
} from "./reviews.repository";

export { createReviewsTransport, REVIEWS_OP_IDS } from "./reviews.transport";

export { REVIEWS_DDL } from "./reviews.db-schema";

export { OwnershipError, ConflictError, ValidationError } from "./reviews.errors";

export {
  reviewResource,
  reviewInsightResource,
  toReviewDto,
  toReviewInsightDto,
  type ReviewResource,
  type ReviewInsightResource,
} from "./reviews.schema";
