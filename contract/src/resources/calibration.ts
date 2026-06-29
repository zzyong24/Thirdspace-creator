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
  // 0/3/5 anchor guidance borrowed from cheat-on-content's calibrated rubric.
  // OPTIONAL for back-compat: pre-anchor dimensions (no `description`) still validate.
  description: z.string().optional(),
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

// CalibrationRuleSuggestion — 复盘飞轮回流 轨B (Learning→校准). A 复盘 Learning promoted into an
// explicit, adoptable rubric-rule suggestion. `proposedDimension` is the 维度建议 the 采纳 folds
// into a NEW RubricVersion (renormalized); status pending→adopted|dismissed is terminal.
const ruleSuggestionDimension = z.object({
  key: z.string(),
  label: z.string(),
  weight: z.number(),
  description: z.string().default(""),
});
export const calibrationRuleSuggestionResource = z.object({
  id,
  userId: id,
  learningId: id, // the source 复盘 Learning
  rubricId: id, // the target Rubric this suggestion bumps
  status: z.enum(["pending", "adopted", "dismissed"]),
  proposedDimension: ruleSuggestionDimension,
  rationale: z.string(), // 一句话:这条复盘为什么得出这个维度建议
  adoptedVersionId: id.nullable(), // the RubricVersion 采纳 minted (null until adopted)
  createdAt: iso8601,
  adoptedAt: iso8601.nullable(), // null until adopted/dismissed
});
export type CalibrationRuleSuggestionResource = z.infer<
  typeof calibrationRuleSuggestionResource
>;
