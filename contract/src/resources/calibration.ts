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

// 维度评分约定 (校准中心大改, Slice 1) — an OPTIONAL strong-schema view over the FREE jsonb
// the prediction already stores. NO schema migration: `predictedConversion` carries
// `{ dimensions: [...] }`, `predictedMetrics` carries `{ performance, diagnosis }`. These
// zods exist so a caller (runner / confirm seam / FE) can validate the convention without
// the contract's create body becoming rigid (it stays `z.record` — back-compat). A
// prediction written before this slice (empty jsonb) still parses every field as optional.
//
// One 维度评分 row: rubric dimension key + 1–5 评分 + 打分理由 + 修改建议 (the 中栏 评分表 row).
export const predictionDimensionScore = z.object({
  key: z.string(),
  score: z.number().min(1).max(5),
  reason: z.string().default(""),
  suggestion: z.string().default(""),
});
export type PredictionDimensionScore = z.infer<
  typeof predictionDimensionScore
>;

// The 发布前预测表现 chips (完播率/收藏率/评论率/转化意向) — 0–100 estimates the AI gives.
export const predictionPerformance = z.object({
  完播率: z.number().nullable().default(null),
  收藏率: z.number().nullable().default(null),
  评论率: z.number().nullable().default(null),
  转化意向: z.number().nullable().default(null),
});
export type PredictionPerformance = z.infer<typeof predictionPerformance>;

// The AI 编导诊断 (右栏) — 综合判断 + 主要问题 + 优先修改.
export const predictionDiagnosis = z.object({
  verdict: z.string().default(""), // 综合判断一句
  mainIssues: z.array(z.string()).default([]), // 主要问题
  priorityFixes: z.array(z.string()).default([]), // 优先修改
});
export type PredictionDiagnosis = z.infer<typeof predictionDiagnosis>;

// `predictedConversion` jsonb shape (维度评分约定).
export const predictionConversionDetail = z.object({
  dimensions: z.array(predictionDimensionScore).default([]),
});
// `predictedMetrics` jsonb shape (预测表现 + 诊断).
export const predictionMetricsDetail = z.object({
  performance: predictionPerformance.optional(),
  diagnosis: predictionDiagnosis.optional(),
});
export type PredictionConversionDetail = z.infer<
  typeof predictionConversionDetail
>;
export type PredictionMetricsDetail = z.infer<
  typeof predictionMetricsDetail
>;

// 校准中心总览 (calibration.overview, 校准中心大改 Slice 1) — a read-only aggregate the
// 校准中心 page renders. Every count/value is DERIVED from real rows at read time (no
// stored 总览 table); a metric with no backing data source reports 0 / "" / [] (零造假 —
// never fabricated).
export const calibrationOverviewResource = z.object({
  // 顶部 4 KPI.
  kpis: z.object({
    lockedPredictions: z.number().int(), // predictions status='locked' 计数
    completedReflows: z.number().int(), // calibration_results 计数 (发布后回流完成数)
    avgDeviationBand: z.enum(["low", "mid", "high", "none"]), // results.deviation 均值→档位
    latestFinding: z.string(), // 最近一条 result 的最大偏差维度一句话 ("" when 无回流)
  }),
  // 左「待校准内容」— content_outputs / publications with NO locked prediction yet.
  pendingSubjects: z.array(
    z.object({
      subjectType: calibrationSubjectType,
      subjectId: id,
      title: z.string(),
      platform: z.string(), // 平台 ("" when content_output 未发布)
      // 未预测 = no prediction; 已锁定 = locked prediction (no result); 已回流 = result landed.
      badge: z.enum(["unpredicted", "locked", "reflowed"]),
      // locked 主体的盲预测 id(其余为 null)。前端「录入真实表现」据此 results.create。
      predictionId: id.nullable(),
    }),
  ),
  // 底「发布后回流对照」— join prediction + result, per-dimension 预测分 vs 真实 + 偏差.
  reflowRows: z.array(
    z.object({
      predictionId: id,
      subjectId: id,
      dimensions: z.array(
        z.object({
          key: z.string(),
          label: z.string(),
          predicted: z.number().nullable(), // 预测分 (1–5; null when 该维度未评)
          actual: z.number().nullable(), // 真实分 (null when actuals lack the dimension)
          deviation: z.number().nullable(), // actual - predicted (null when either missing)
        }),
      ),
      deviationBand: z.enum(["low", "mid", "high", "none"]),
      reason: z.string(), // 偏差原因一句 ("" until a finding is recorded)
    }),
  ),
  // 「经验沉淀」— the user's calibration-related Learnings (复用 learnings 服务).
  learnings: z.array(
    z.object({
      id,
      title: z.string(),
      insight: z.string(),
    }),
  ),
});
export type CalibrationOverviewResource = z.infer<
  typeof calibrationOverviewResource
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
