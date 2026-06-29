// Calibration module schema surface — the contract Zod DTOs this module produces
// (foundation §5: "<module>.schema.ts — re-export/usage of the contract Zod DTOs for
// this module"). The transport's mappers and the contract test validate their outputs
// against these; the contract is the single source of truth for the wire shape
// (contract/src/resources/calibration.ts, contract v0.4).
//
// The @creatoros/contract root barrel re-exports `ENDPOINTS` but NOT the resource
// files. The op responses are reachable as ENDPOINTS.<opKey>.response (the calibration
// op keys are unique across the merged registry):
//   - createRubric/getRubric.response === rubricResource
//   - bumpRubricVersion.response === rubricVersionResource
//   - createPrediction/lockPrediction/getPrediction.response === predictionResource
//   - createResult.response === calibrationResultResource
import { ENDPOINTS } from "@creatoros/contract";
import type {
  RubricRow,
  RubricVersionRow,
  PredictionRow,
  CalibrationResultRow,
  RuleSuggestionRow,
} from "./calibration.repository";

export const rubricResource = ENDPOINTS.createRubric.response;
export const rubricVersionResource = ENDPOINTS.bumpRubricVersion.response;
export const predictionResource = ENDPOINTS.createPrediction.response;
export const calibrationResultResource = ENDPOINTS.createResult.response;
// 复盘飞轮回流 轨B — the CalibrationRuleSuggestion DTO (the list/adopt + Learnings reflow ops
// all share this resource; adopt returns a rubricVersionResource so its wire shape is reused).
export const calibrationRuleSuggestionResource =
  ENDPOINTS.listRuleSuggestions.response;

// Derive the inferred output type from the schema's phantom `_output` (zod 4's
// `z.infer<T>` is `T["_output"]`). The frontend package does not declare `zod` as a
// direct dependency, so we read the output type structurally (mirrors monetization).
export type RubricResource = (typeof rubricResource)["_output"];
export type RubricVersionResource = (typeof rubricVersionResource)["_output"];
export type PredictionResource = (typeof predictionResource)["_output"];
export type CalibrationResultResource =
  (typeof calibrationResultResource)["_output"];
export type CalibrationRuleSuggestionResource =
  (typeof calibrationRuleSuggestionResource)["_output"];

// Row → DTO mappers (SPEC §9: the API DTO is built by an explicit mapper, NEVER the
// Drizzle row). The service + contract test share ONE mapping so a wire-shape change
// is caught once. `dimensions` jsonb → the typed array; `predictedScore` text → number
// coercion lives here.
export function toRubricVersionDto(
  row: RubricVersionRow,
): RubricVersionResource {
  return {
    id: row.id,
    userId: row.userId,
    rubricId: row.rubricId,
    versionNumber: row.versionNumber,
    dimensions: (row.dimensions ?? []) as RubricVersionResource["dimensions"],
    changeSummary: row.changeSummary,
    createdAt: row.createdAt,
  };
}

export function toRubricDto(
  row: RubricRow,
  currentVersion: RubricVersionRow,
): RubricResource {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    currentVersionId: row.currentVersionId ?? currentVersion.id,
    currentVersion: toRubricVersionDto(currentVersion),
    createdAt: row.createdAt,
  };
}

export function toPredictionDto(row: PredictionRow): PredictionResource {
  return {
    id: row.id,
    userId: row.userId,
    subjectType: row.subjectType as PredictionResource["subjectType"],
    subjectId: row.subjectId,
    rubricVersionId: row.rubricVersionId,
    predictedMetrics: (row.predictedMetrics ?? {}) as Record<string, unknown>,
    predictedConversion: (row.predictedConversion ?? {}) as Record<
      string,
      unknown
    >,
    predictedScore: Number(row.predictedScore), // decimal-text → number
    confidence: row.confidence as PredictionResource["confidence"],
    status: row.status as PredictionResource["status"],
    lockedAt: row.lockedAt ?? null,
    createdAt: row.createdAt,
  };
}

export function toCalibrationResultDto(
  row: CalibrationResultRow,
): CalibrationResultResource {
  return {
    id: row.id,
    userId: row.userId,
    predictionId: row.predictionId,
    ingestionRunId: row.ingestionRunId,
    actualMetrics: (row.actualMetrics ?? {}) as Record<string, unknown>,
    deviation: (row.deviation ?? {}) as Record<string, unknown>,
    createdAt: row.createdAt,
  };
}

// 复盘飞轮回流 轨B — CalibrationRuleSuggestion row → DTO. The `proposedDimension` jsonb is
// shaped { key, label, weight, description } at write time; default a missing description.
export function toRuleSuggestionDto(
  row: RuleSuggestionRow,
): CalibrationRuleSuggestionResource {
  const dim = (row.proposedDimension ?? {}) as Partial<
    CalibrationRuleSuggestionResource["proposedDimension"]
  >;
  return {
    id: row.id,
    userId: row.userId,
    learningId: row.learningId,
    rubricId: row.rubricId,
    status: row.status as CalibrationRuleSuggestionResource["status"],
    proposedDimension: {
      key: dim.key ?? "",
      label: dim.label ?? "",
      weight: typeof dim.weight === "number" ? dim.weight : 0,
      description: dim.description ?? "",
    },
    rationale: row.rationale,
    adoptedVersionId: row.adoptedVersionId ?? null,
    createdAt: row.createdAt,
    adoptedAt: row.adoptedAt ?? null,
  };
}
