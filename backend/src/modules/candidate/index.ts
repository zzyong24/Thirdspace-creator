// Candidate module — the ONLY public entry (foundation §1 / MODULE-ARCH §2). The
// composite transport imports Candidate ONLY through this file (never its
// internals): the service factory to construct it over the shared db (with the
// injected Projects / Positioning / Ingestion ports), the transport factory + op-id
// list the composite merges, CANDIDATE_DDL, the contract DTOs/mappers, and the error
// classes the dispatch route maps. Repository is exported ONLY for the composition
// root's canonical seed (mirrors positioning); no OTHER module imports it. No
// cross-module repository import.
//
// Candidate owns the 7 contract ops (candidates.list/create/get/patch/promote +
// audienceSignals.list/linkToCandidate). It supplies the C-3 formalize target
// (`createFromAIResult` — the AI module's confirmResult callee, AI-free) and the C-4
// intake port (`ingestAudienceSignal` — called by the Ingestion module). There is NO
// parallel candidate state machine here (C-3) and NO second AudienceSignal write path
// (C-4): the AI awaiting/confirmed machine lives on the AITask; signal writes ride
// Ingestion's idempotency.

export {
  createCandidateService,
  type CandidateService,
  type ServiceDeps,
  type CandidateProjectsPort,
  type CandidatePositioningPort,
  type CandidateIngestionPort,
  type CandidateOverviewPort,
  type CreateCandidateInput,
  type PatchCandidateInput,
  type CandidateAIResult,
  type IngestSignalInput,
} from "./candidate.service";

export {
  createCandidateTransport,
  CANDIDATE_OP_IDS,
} from "./candidate.transport";

export { CANDIDATE_DDL } from "./candidate.db-schema";

export {
  OwnershipError,
  PromoteStateError,
  DanglingRunError,
  SignalSchemaError,
  DerivedFieldError,
} from "./candidate.errors";

export {
  candidateResource,
  audienceSignalResource,
  topicPromotionResource,
  topicsOverviewResource,
  toCandidateDto,
  toAudienceSignalDto,
  toTopicPromotionDto,
  toCardDto,
  pickCardFields,
  parseAudienceSignalRecord,
  type CandidateResource,
  type CandidateCard,
  type AudienceSignalResource,
  type TopicPromotionResource,
  type TopicsOverviewResource,
  type AudienceSignalRecord,
} from "./candidate.schema";

// The repository factory + row types are exported ONLY for the composition root's
// canonical seed (persistence-client mints a user-scoped seed repo) — mirrors
// positioning/monetization. No OTHER module imports the repository (acceptance grep:
// no cross-module repo import).
export {
  createCandidateRepository,
  type CandidateRepository,
  type RepoDeps,
  type CandidateRow,
  type AudienceSignalRow,
  type TopicPromotionRow,
} from "./candidate.repository";

export {countCandidatesForDay} from "./candidate.service";

export {lockCandidateSupply} from "./candidate-supply-lock";
