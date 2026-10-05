// Publishing module — the ONLY public entry (foundation §1 / MODULE-ARCH §2). The
// composite transport imports Publishing ONLY through this file (never its
// internals): the service factory to construct it over the shared db (with the
// injected PlatformPublisherPort + cross-module fan-out seams), the transport
// factory + op-id list the composite merges, PUBLISHING_DDL, the contract DTOs, and
// the error classes the dispatch route maps. The transition fan-out reaches
// Projects/Search/Notifications ONLY through their own public services (injected as
// seams) — no cross-module repository import. getRecentPublications /
// resolvePublication are the downstream hooks for Analytics (SPEC §11) and the
// DashboardQueryService (SPEC §19).

export {
  createPublishingService,
  type PublishingService,
  type ServiceDeps,
  type MarkOutputPublished,
  type SearchIndexPublication,
  type RecordPublishActivity,
  type NotifyPublished,
} from "./publishing.service";

export {
  createPublishingRepository,
  type PublishingRepository,
  type RepoDeps,
  type PublicationRow,
  type PublicationRevisionRow,
} from "./publishing.repository";

export {
  createPublishingTransport,
  PUBLISHING_OP_IDS,
} from "./publishing.transport";

export {
  createMockPublisher,
  createUnavailablePublisher,
  type PlatformPublisherPort,
  type MockPublisher,
  type PublishInput,
  type PublishResult,
} from "./platform-publisher";

export { PUBLISHING_DDL } from "./publishing.db-schema";

export { OwnershipError, ConflictError, ValidationError, PublishingUnavailableError } from "./publishing.errors";

export {
  publicationResource,
  publicationRevisionResource,
  type PublicationResource,
  type PublicationRevisionResource,
} from "./publishing.schema";
export {createPublicationResultsService,type PublicationResultsService} from "./publication-results.service";
export {createPublicationCreativeResultAdapter,combinePublicationResultAdapters} from "./publication-results.creative-adapter";
export {createPublicationCoverCreativeResultAdapter,type PublicationCoverPorts} from "./publication-cover.creative-adapter";

export {createPublicationCoverService,type PublicationCoverService} from "./publication-cover.service";
export type {PublicationCoverSavePorts} from "./publication-cover.ports";
export {withPublicationManualRevisionLock} from "./publication-cover.manual-lock";
