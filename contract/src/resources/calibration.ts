import { z } from "zod";
import {
  id,
  iso8601,
  predictionStatus,
  calibrationConfidence,
  calibrationSubjectType,
} from "../primitives";

// 七步整合设计 §6 — 校准闭环 (Rubric + RubricVersion + Prediction + CalibrationResult).

const rubricDimension = z.object({
  key: z.string(),
  label: z.string(),
  weight: z.number(),
});

// RubricVersion — immutable version chain (ArtifactVersion 范式).
export const rubricVersionResource = z.object({
  id,
  userId: id,
  rubricId: id,
  versionNumber: z.number().int(),
  dimensions: z.array(rubricDimension),
  changeSummary: z.string(),
  createdAt: iso8601,
});
export type RubricVersionResource = z.infer<typeof rubricVersionResource>;

// Rubric — points at its current immutable version.
export const rubricResource = z.object({
  id,
  userId: id,
  name: z.string(),
  currentVersionId: id,
  currentVersion: rubricVersionResource,
  createdAt: iso8601,
});
export type RubricResource = z.infer<typeof rubricResource>;

// Prediction — 发布前盲预测, locked-at-creation immutable (§6.2).
export const predictionResource = z.object({
  id,
  userId: id,
  subjectType: calibrationSubjectType,
  subjectId: id,
  rubricVersionId: id,
  predictedMetrics: z.record(z.string(), z.unknown()),
  predictedConversion: z.record(z.string(), z.unknown()),
  predictedScore: z.number(),
  confidence: calibrationConfidence,
  status: predictionStatus,
  lockedAt: iso8601.nullable(),
  createdAt: iso8601,
});
export type PredictionResource = z.infer<typeof predictionResource>;

// CalibrationResult — 预测 vs 实际偏差. actualMetrics recycled via Ingestion.
export const calibrationResultResource = z.object({
  id,
  userId: id,
  predictionId: id,
  ingestionRunId: id,
  actualMetrics: z.record(z.string(), z.unknown()),
  deviation: z.record(z.string(), z.unknown()),
  createdAt: iso8601,
});
export type CalibrationResultResource = z.infer<
  typeof calibrationResultResource
>;
