// Positioning module — the ONLY public entry (foundation §1 / MODULE-ARCH §2). The
// composite transport imports Positioning ONLY through this file (never its
// internals): the service factory to construct it over the shared db (with the
// injected Projects port), the transport factory + op-id list the composite merges,
// POSITIONING_DDL, the contract DTOs/mappers, and the error classes the dispatch
// route maps. Repository is NOT exported (foundation §1). No cross-module repository
// import.
//
// Positioning owns the 9 contract ops (positioning.profile.get/upsert /
// positioning.master.reset/restore / positioning.statements.list/create/get / positioning.gate.evaluate /
// pages.positioning.get). The project subject for the gate reaches Projects ONLY
// through the injected PositioningProjectsPort (no cross-module repository import,
// SPEC §22). `createStatementVersion` is exposed on the PositioningService so the AI
// module (module-15) formalizes an AI-suggested 定位修正 WITHOUT a Positioning repo
// import (C-3: the AI-free formalize callee; there is NO parallel candidate state
// machine here). `evaluateGate` is exposed for the cross-module 契合度 Badge.

export {
  createPositioningService,
  type PositioningService,
  type ServiceDeps,
  type PositioningProjectsPort,
  type PositioningResearchPort,
  type PositioningProjectSubject,
  type UpsertProfileInput,
  type CreateStatementInput,
  type EvaluateGateInput,
  type LegacyStatusNoteCleanupAudit,
  type LegacyStatusNoteCleanupResult,
} from "./positioning.service";

export {
  createPositioningTransport,
  POSITIONING_OP_IDS,
} from "./positioning.transport";

export { POSITIONING_DDL } from "./positioning.db-schema";

export {
  OwnershipError,
  ProfileRequiredError,
  GateSubjectError,
  StatementValidationError,
  MasterSnapshotUnavailableError,
  DiscoveryConflictError,
  DiscoveryValidationError,
} from "./positioning.errors";

export {
  creatorProfileResource,
  positioningStatementResource,
  positioningGateResultResource,
  positioningCenterResource,
  positioningDiscoverySessionResource,
  toCreatorProfileDto,
  toPositioningStatementDto,
  toPositioningDiscoverySessionDto,
  type CreatorProfileResource,
  type PositioningStatementResource,
  type PositioningMasterSnapshotResource,
  type PositioningMasterRestoreResultResource,
  type PositioningGateResultResource,
  type PositioningCenterResource,
  type PositioningDiscoverySessionResource,
} from "./positioning.schema";

// The repository factory + row types are exported ONLY for the composition root's
// canonical seed (persistence-client mints a user-scoped seed repo and calls
// seedProfiles/seedStatements) — mirrors learnings/artifacts. No OTHER module
// imports the repository (acceptance 7.1/7.2 grep: no cross-module repo import).
export {
  createPositioningRepository,
  type PositioningRepository,
  type RepoDeps,
  type CreatorProfileRow,
  type PositioningStatementRow,
  type PositioningDiscoverySessionRow,
} from "./positioning.repository";
