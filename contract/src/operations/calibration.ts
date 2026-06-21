import { z } from "zod";
import { defineEndpoint } from "../endpoints";
import {
  id,
  calibrationConfidence,
  calibrationSubjectType,
} from "../primitives";
import {
  rubricResource,
  rubricVersionResource,
  predictionResource,
  calibrationResultResource,
} from "../resources/calibration";

const rubricParams = z.object({ rubricId: id });
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
} as const;
