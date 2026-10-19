// Calibration module — the ONLY public entry (foundation §1 / MODULE-ARCH §2). The
// composite transport imports Calibration ONLY through this file (never its internals):
// the service factory to construct it over the shared db (with the injected peer ports),
// the transport factory + op-id list the composite merges, CALIBRATION_DDL, the contract
// DTOs/mappers, and the error classes the dispatch route maps. No cross-module repository
// import.
//
// Calibration owns 7 contract ops (calibration.rubrics.create/bumpVersion/get +
// calibration.predictions.create/lock/get + calibration.results.create). The peer reads
// (Ingestion run existence — §C-4/RISK-005, Learnings confidence-adjust — §6.3) reach
// those modules ONLY through injected narrow ports (no cross-module repository import,
// SPEC §22). `getCurrentRubricVersion` / `getPrediction` are exposed for the Candidate
// module's 变现加权 ranking (§5.3 → §6.2) + the FE drill (consume AFTER green).

export {
  createCalibrationService,
  type CalibrationService,
  type ServiceDeps,
  type CalibrationIngestionPort,
  type CalibrationLearningsPort,
  type CalibrationOverviewPort,
  type CalibrationOverviewSubject,
  type CalibrationOverviewLearning,
  type CreateRubricInput,
  type CreatePredictionInput,
  type CreateDraftPredictionInput,
  type RecordResultInput,
  type CreateRuleSuggestionInput,
} from "./calibration.service";

export {
  createCalibrationTransport,
  CALIBRATION_OP_IDS,
} from "./calibration.transport";

export { CALIBRATION_DDL } from "./calibration.db-schema";

export {
  OwnershipError,
  ConflictError,
  ImmutableError,
  ValidationError,
} from "./calibration.errors";

export {
  rubricResource,
  rubricVersionResource,
  predictionResource,
  calibrationResultResource,
  calibrationOverviewResource,
  calibrationRuleSuggestionResource,
  toRubricDto,
  toRubricVersionDto,
  toPredictionDto,
  toCalibrationResultDto,
  toRuleSuggestionDto,
  type RubricResource,
  type RubricVersionResource,
  type PredictionResource,
  type CalibrationResultResource,
  type CalibrationOverviewResource,
  type CalibrationRuleSuggestionResource,
} from "./calibration.schema";

// The repository factory + row types are exported ONLY for the composition root's
// canonical seed (persistence-client mints a user-scoped seed repo) — mirrors
// monetization/positioning. No OTHER module imports the repository (acceptance grep: no
// cross-module repo import).
export {
  createCalibrationRepository,
  type CalibrationRepository,
  type RepoDeps,
  type RubricRow,
  type RubricVersionRow,
  type PredictionRow,
  type CalibrationResultRow,
  type RuleSuggestionRow,
  type RubricDimension,
  type ProposedDimension,
} from "./calibration.repository";
export {defaultRubricIdentity} from './default-rubric';
