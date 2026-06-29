import { z } from "zod";
import { defineEndpoint } from "../endpoints";
import {
  id,
  paginationQuery,
  calibrationConfidence,
  calibrationSubjectType,
} from "../primitives";
import {
  rubricResource,
  rubricVersionResource,
  predictionResource,
  calibrationResultResource,
  calibrationRuleSuggestionResource,
} from "../resources/calibration";

const rubricParams = z.object({ rubricId: id });
const suggestionParams = z.object({ suggestionId: id });
const predictionParams = z.object({ predictionId: id });

const rubricDimension = z.object({
  key: z.string().min(1),
  label: z.string(),
  weight: z.number(),
});

// SPEC §13 "校准 (calibration)" group (七步⑤⑥, contract v0.4). AI-generated
// predictions ride the AI confirm flow (§C-3); `predictions.lock` is the
// AI-free formalize. `predictedScore`/`deviation` are derived server-side.
export const calibrationOperations = {
  createRubric: defineEndpoint({
    id: "calibration.rubrics.create",
    method: "POST",
    path: "/calibration/rubrics",
    body: z.object({
      name: z.string().min(1),
      dimensions: z.array(rubricDimension).min(1),
    }),
    response: rubricResource,
    fr: ["FR-CALIB-RUBRIC-CREATE"],
  }),
  bumpRubricVersion: defineEndpoint({
    id: "calibration.rubrics.bumpVersion",
    method: "POST",
    path: "/calibration/rubrics/:rubricId/versions",
    params: rubricParams,
    body: z.object({
      dimensions: z.array(rubricDimension).min(1),
      changeSummary: z.string().default(""),
    }),
    response: rubricVersionResource,
    fr: ["FR-CALIB-RUBRIC-BUMP"],
  }),
  getRubric: defineEndpoint({
    id: "calibration.rubrics.get",
    method: "GET",
    path: "/calibration/rubrics/:rubricId",
    params: rubricParams,
    response: rubricResource,
    fr: ["FR-CALIB-RUBRIC-GET"],
  }),
  createPrediction: defineEndpoint({
    id: "calibration.predictions.create",
    method: "POST",
    path: "/calibration/predictions",
    body: z.object({
      subjectType: calibrationSubjectType,
      subjectId: id,
      rubricVersionId: id,
      predictedMetrics: z.record(z.string(), z.unknown()).default({}),
      predictedConversion: z.record(z.string(), z.unknown()).default({}),
      confidence: calibrationConfidence,
    }),
    response: predictionResource,
    fr: ["FR-CALIB-PRED-CREATE"],
  }),
  lockPrediction: defineEndpoint({
    id: "calibration.predictions.lock",
    method: "POST",
    path: "/calibration/predictions/:predictionId/lock",
    params: predictionParams,
    response: predictionResource,
    fr: ["FR-CALIB-PRED-LOCK"],
  }),
  getPrediction: defineEndpoint({
    id: "calibration.predictions.get",
    method: "GET",
    path: "/calibration/predictions/:predictionId",
    params: predictionParams,
    response: predictionResource,
    fr: ["FR-CALIB-PRED-GET"],
  }),
  // GAP-CAL-1: the 盲预测 list read op — user-scoped, createdAt desc, page/pageSize.
  // Mirrors getPrediction's response (predictionResource) as a list so the calibration
  // surface can render the already-locked predictions + the回流 entry per row.
  listPredictions: defineEndpoint({
    id: "calibration.predictions.list",
    method: "GET",
    path: "/calibration/predictions",
    query: paginationQuery,
    response: predictionResource,
    isList: true,
    fr: ["FR-CALIB-PRED-LIST"],
  }),
  createResult: defineEndpoint({
    id: "calibration.results.create",
    method: "POST",
    path: "/calibration/predictions/:predictionId/result",
    params: predictionParams,
    body: z.object({
      ingestionRunId: id,
      actualMetrics: z.record(z.string(), z.unknown()).default({}),
    }),
    response: calibrationResultResource,
    fr: ["FR-CALIB-RESULT-CREATE"],
  }),
  // 复盘飞轮回流 轨B (Learning→校准): 校准中心 lists the pending rule-suggestions reflowed
  // from 复盘 Learnings (user-scoped, status='pending'), each adoptable into a rubric bump.
  listRuleSuggestions: defineEndpoint({
    id: "calibration.suggestions.list",
    method: "GET",
    path: "/calibration/suggestions",
    query: paginationQuery,
    response: calibrationRuleSuggestionResource,
    isList: true,
    fr: ["FR-CALIB-REFLOW-LIST"],
  }),
  // 采纳 a pending suggestion → append a NEW RubricVersion folding in `proposedDimension`
  // (renormalized), mark the suggestion adopted (terminal), and return the new version.
  adoptRuleSuggestion: defineEndpoint({
    id: "calibration.suggestions.adopt",
    method: "POST",
    path: "/calibration/suggestions/:suggestionId/adopt",
    params: suggestionParams,
    response: rubricVersionResource,
    fr: ["FR-CALIB-REFLOW-ADOPT"],
  }),
} as const;
