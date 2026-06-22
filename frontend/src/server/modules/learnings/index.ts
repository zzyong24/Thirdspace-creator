// Learnings module — the ONLY public entry (foundation §1 / MODULE-ARCH §2). The
// composite transport imports Learnings ONLY through this file (never its
// internals): the service + repository factories to construct it over the shared db
// (with the injected Projects port), the transport factory + op-id list the
// composite merges, LEARNINGS_DDL, the contract DTOs, and the error classes the
// dispatch route maps.
//
// Learnings owns the four contract ops (learnings.list / learnings.create /
// learnings.applications.create / learnings.evaluate). The apply-target project
// ownership + activity append reach Projects ONLY through the injected
// LearningsProjectsPort (no cross-module repository import, SPEC §22).
// promoteReviewInsight is the Reviews→Learnings bridge — exposed on the
// LearningsService so Reviews promotes a confirmed insight WITHOUT a Learnings repo
// import; getSuggestions is the Wave-4 DashboardQueryService feed (foundation §7).

export {
  createLearningsService,
  type LearningsService,
  type ServiceDeps,
  type LearningsProjectsPort,
  type PromoteReviewInsightInput,
} from "./learnings.service";

export {
  createLearningsRepository,
  type LearningsRepository,
  type RepoDeps,
  type LearningRow,
  type LearningApplicationRow,
} from "./learnings.repository";

export { createLearningsTransport, LEARNINGS_OP_IDS } from "./learnings.transport";

export { LEARNINGS_DDL } from "./learnings.db-schema";

export { OwnershipError, ConflictError } from "./learnings.errors";

export {
  learningResource,
  learningApplicationResource,
  toLearningDto,
  toLearningApplicationDto,
  type LearningResource,
  type LearningApplicationResource,
} from "./learnings.schema";
