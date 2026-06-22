import type { RequestContext } from "@creatoros/contract";
import type { Db } from "@creatoros/backend";
import {
  createCalibrationRepository,
  type CalibrationRepository,
  type RepoDeps,
  type RubricDimension,
} from "./calibration.repository";
import {
  toRubricDto,
  toRubricVersionDto,
  toPredictionDto,
  toCalibrationResultDto,
  type RubricResource,
  type RubricVersionResource,
  type PredictionResource,
  type CalibrationResultResource,
} from "./calibration.schema";
import {
  ConflictError,
  ImmutableError,
  ValidationError,
} from "./calibration.errors";

// Calibration service (foundation §5.3) — every public method takes
// `(ctx: RequestContext, …)` and builds a repository bound to `ctx.userId`
// (createCalibrationRepository(db, { now, nextId, userId: ctx.userId })) so scoping is
// structural. It receives peer service interfaces via constructor deps (narrow ports —
// NO cross-module repository import, SPEC §22): Ingestion (IngestionRun existence —
// §C-4 / RISK-005) and Learnings (the §6.3 confidence-adjust feedback bridge).
//
// Immutability + state-machine invariants (§6.2):
//   - Prediction.status draft→locked is terminal; a locked prediction is never edited /
//     re-locked (lockPrediction is idempotent — returns the already-locked row WITHOUT
//     re-stamping lockedAt; no edit/unlock op exists).
//   - RubricVersion rows are never updated — bumpRubricVersion appends a NEW row.
//   - A CalibrationResult is only created against a LOCKED prediction (recycling actuals
//     against an unlocked, still-editable prediction → ConflictError) and only from a
//     verified, owned IngestionRun (§C-4 / RISK-005).

// The 变现加权 dimensions that signal a conversion / 铺路 direction (§2.0): a rubric must
// carry at least one of these (NOT 播放量-only). Matched against the dimension `key`.
const MONETIZATION_DIMENSION_KEYS = new Set([
  "persona", // 人群匹配
  "cta", // CTA 清晰度
  "product_path", // 为产品铺路程度
  "conversion", // generic conversion weight
  "altruism", // 利他性 (audience value, accepted)
]);

// The 维度权重 normalizer: weights sum to 1.0 (OQ6 decision). The deterministic weighted
// sum over predictedMetrics ∪ predictedConversion derives predictedScore.
const WEIGHT_NORMALIZER = 1.0;
const WEIGHT_EPSILON = 1e-6;

// Deviation threshold (absolute predictedScore-equivalent) above which a RubricVersion
// bump is suggested (§6.3). Deterministic; no Math.random.
const DEVIATION_BUMP_THRESHOLD = 0.25;

// --- Peer ports (narrow; satisfied at composition by the public services) ---

export interface CalibrationIngestionPort {
  // Ownership-gated IngestionRun existence check (§C-4 / RISK-005 — reject 悬空 ids).
  assertRunExists(ctx: RequestContext, runId: string): Promise<void>;
}

export interface CalibrationLearningsPort {
  // §6.3 feedback bridge: nudge the Learning confidence by a deterministic delta when a
  // CalibrationResult lands. Best-effort (post-commit); a failure must NOT roll back the
  // result fact (SPEC §11). Reached via the Learnings public service (no repo import).
  adjustConfidence(
    ctx: RequestContext,
    input: { delta: number; reason: string },
  ): Promise<void>;
}

export interface ServiceDeps {
  db: Db;
  now: () => string;
  nextId: (prefix: string) => string;
  ingestion: CalibrationIngestionPort;
  learnings: CalibrationLearningsPort;
}

// --- Command inputs ---

export interface CreateRubricInput {
  name: string;
  dimensions: RubricDimension[];
}

export interface BumpRubricVersionInput {
  dimensions: RubricDimension[];
  changeSummary: string;
}

export interface CreatePredictionInput {
  subjectType: "content_output" | "publication";
  subjectId: string;
  rubricVersionId: string;
  predictedMetrics: Record<string, unknown>;
  predictedConversion: Record<string, unknown>;
  confidence: "high" | "med" | "low";
}

export interface RecordResultInput {
  ingestionRunId: string;
  actualMetrics: Record<string, unknown>;
}

export interface CalibrationService {
  createRubric(
    ctx: RequestContext,
    input: CreateRubricInput,
  ): Promise<RubricResource>;
  bumpRubricVersion(
    ctx: RequestContext,
    rubricId: string,
    input: BumpRubricVersionInput,
  ): Promise<RubricVersionResource>;
  getRubric(ctx: RequestContext, rubricId: string): Promise<RubricResource>;
  createPrediction(
    ctx: RequestContext,
    input: CreatePredictionInput,
  ): Promise<PredictionResource>;
  lockPrediction(
    ctx: RequestContext,
    predictionId: string,
  ): Promise<PredictionResource>;
  getPrediction(
    ctx: RequestContext,
    predictionId: string,
  ): Promise<PredictionResource>;
  recordResult(
    ctx: RequestContext,
    predictionId: string,
    input: RecordResultInput,
  ): Promise<CalibrationResultResource>;
  // Read surface consumed by the Candidate module's 变现加权 ranking (§5.3 → §6.2) and
  // the FE drill — public, no contract op.
  getCurrentRubricVersion(
    ctx: RequestContext,
    rubricId: string,
  ): Promise<RubricVersionResource>;
}

// Validate the 变现加权维度 (§6.2 / §2.0). Non-empty; weights sum to the normalizer;
// at least one conversion/铺路/利他 dimension (reject a pure 播放量预估 set).
function validateDimensions(dimensions: RubricDimension[]): void {
  if (dimensions.length === 0) {
    throw new ValidationError("rubric must declare at least one dimension");
  }
  const sum = dimensions.reduce((acc, d) => acc + d.weight, 0);
  if (Math.abs(sum - WEIGHT_NORMALIZER) > WEIGHT_EPSILON) {
    throw new ValidationError(
      `rubric dimension weights must sum to ${WEIGHT_NORMALIZER} (got ${sum})`,
    );
  }
  const hasMonetizationDimension = dimensions.some((d) =>
    MONETIZATION_DIMENSION_KEYS.has(d.key),
  );
  if (!hasMonetizationDimension) {
    throw new ValidationError(
      "rubric must include at least one 变现加权 dimension (人群匹配 / CTA清晰度 / 为产品铺路程度 / 利他性), not 播放量预估 only",
    );
  }
}

// Deterministic 变现加权 weighted sum. For each dimension, read the metric value keyed by
// the dimension `key` from predictedConversion first (变现优先), else predictedMetrics;
// non-numeric / missing → 0. Pure; NO Math.random / Date.now.
function deriveScore(
  dimensions: RubricDimension[],
  predictedMetrics: Record<string, unknown>,
  predictedConversion: Record<string, unknown>,
): number {
  let score = 0;
  for (const d of dimensions) {
    const raw =
      d.key in predictedConversion
        ? predictedConversion[d.key]
        : predictedMetrics[d.key];
    const value = typeof raw === "number" && Number.isFinite(raw) ? raw : 0;
    score += value * d.weight;
  }
  // Round to 4 decimals for stable decimal-text storage.
  return Math.round(score * 10000) / 10000;
}

// Compute deviation per metric key (actual - predicted) over the union of keys, plus a
// `_score` aggregate magnitude. Deterministic.
function computeDeviation(
  predictedMetrics: Record<string, unknown>,
  predictedConversion: Record<string, unknown>,
  actualMetrics: Record<string, unknown>,
): Record<string, number> {
  const predicted: Record<string, unknown> = {
    ...predictedMetrics,
    ...predictedConversion,
  };
  const keys = new Set([
    ...Object.keys(predicted),
    ...Object.keys(actualMetrics),
  ]);
  const deviation: Record<string, number> = {};
  for (const key of keys) {
    const p = predicted[key];
    const a = actualMetrics[key];
    const pv = typeof p === "number" && Number.isFinite(p) ? p : 0;
    const av = typeof a === "number" && Number.isFinite(a) ? a : 0;
    deviation[key] = Math.round((av - pv) * 10000) / 10000;
  }
  return deviation;
}

export function createCalibrationService(
  deps: ServiceDeps,
): CalibrationService {
  const { db, now, nextId, ingestion, learnings } = deps;

  function repoFor(ctx: RequestContext): CalibrationRepository {
    const repoDeps: RepoDeps = { now, nextId, userId: ctx.userId };
    return createCalibrationRepository(db, repoDeps);
  }

  return {
    async createRubric(ctx, input) {
      validateDimensions(input.dimensions);
      const repo = repoFor(ctx);
      // First-insert circular-FK order (§7.5): rubric (NULL currentVersionId) → v1 →
      // patch currentVersionId.
      const rubric = await repo.createRubric({ name: input.name });
      const v1 = await repo.insertRubricVersion({
        rubricId: rubric.id,
        versionNumber: 1,
        dimensions: input.dimensions,
        changeSummary: "",
      });
      const patched = await repo.setRubricCurrentVersion(rubric.id, v1.id);
      return toRubricDto(patched, v1);
    },

    async bumpRubricVersion(ctx, rubricId, input) {
      validateDimensions(input.dimensions);
      const repo = repoFor(ctx);
      await repo.getRubric(rubricId); // ownership gate
      // versionNumber = current count + 1 (assigned under the scoped read — §7.5
      // concurrency: the (rubric_id, version_number) UNIQUE rejects a racing duplicate).
      const versionNumber = (await repo.countRubricVersions(rubricId)) + 1;
      const version = await repo.insertRubricVersion({
        rubricId,
        versionNumber,
        dimensions: input.dimensions,
        changeSummary: input.changeSummary,
      });
      await repo.setRubricCurrentVersion(rubricId, version.id); // old rows untouched
      return toRubricVersionDto(version);
    },

    async getRubric(ctx, rubricId) {
      const repo = repoFor(ctx);
      const rubric = await repo.getRubric(rubricId); // ownership gate
      const current = await repo.getRubricVersion(rubric.currentVersionId!);
      return toRubricDto(rubric, current);
    },

    async getCurrentRubricVersion(ctx, rubricId) {
      const repo = repoFor(ctx);
      const rubric = await repo.getRubric(rubricId); // ownership gate
      const current = await repo.getRubricVersion(rubric.currentVersionId!);
      return toRubricVersionDto(current);
    },

    async createPrediction(ctx, input) {
      const repo = repoFor(ctx);
      // Ownership: the rubric version must be owned (cross-user → OwnershipError → 404).
      const version = await repo.getRubricVersion(input.rubricVersionId);
      const dimensions = (version.dimensions ?? []) as RubricDimension[];
      // Derive predictedScore (the body omits it) — deterministic 变现加权 weighted sum.
      const predictedScore = deriveScore(
        dimensions,
        input.predictedMetrics,
        input.predictedConversion,
      );
      const row = await repo.createPrediction({
        subjectType: input.subjectType,
        subjectId: input.subjectId,
        rubricVersionId: input.rubricVersionId,
        predictedMetrics: input.predictedMetrics,
        predictedConversion: input.predictedConversion,
        predictedScore: String(predictedScore),
        confidence: input.confidence,
      });
      return toPredictionDto(row);
    },

    async lockPrediction(ctx, predictionId) {
      const repo = repoFor(ctx);
      const current = await repo.getPrediction(predictionId); // ownership gate
      // Idempotent: an already-locked prediction returns its existing row WITHOUT
      // re-stamping lockedAt (mirrors Reviews `complete` idempotency). The盲预测 is never
      // re-locked / edited (§6.2) — there is no edit/unlock op.
      if (current.status === "locked") {
        return toPredictionDto(current);
      }
      const locked = await repo.lockPrediction(predictionId);
      return toPredictionDto(locked);
    },

    async getPrediction(ctx, predictionId) {
      const row = await repoFor(ctx).getPrediction(predictionId); // ownership gate
      return toPredictionDto(row);
    },

    async recordResult(ctx, predictionId, input) {
      const repo = repoFor(ctx);
      // 1. Ownership + state guard: the prediction must be LOCKED (cannot calibrate an
      //    unlocked, still-editable 盲预测 → ConflictError).
      const prediction = await repo.getPrediction(predictionId); // ownership gate
      if (prediction.status !== "locked") {
        throw new ConflictError(
          `cannot record a calibration result against an unlocked prediction: ${predictionId}`,
        );
      }
      // 2. §C-4 / RISK-005 guard: the IngestionRun must be REAL & owned. A 悬空 run id
      //    throws OwnershipError (bubbles → 404); actuals only trace to a verified run.
      await ingestion.assertRunExists(ctx, input.ingestionRunId);
      // 3. Compute deviation (the body omits it) — deterministic per-key actual-predicted.
      const deviation = computeDeviation(
        (prediction.predictedMetrics ?? {}) as Record<string, unknown>,
        (prediction.predictedConversion ?? {}) as Record<string, unknown>,
        input.actualMetrics,
      );
      // 4. Persist (idempotent UNIQUE prediction_id — a re-submit returns the existing
      //    row, so the bridges below never double-fire).
      const existing = await repo.getResultByPrediction(predictionId);
      const row = await repo.createResult({
        predictionId,
        ingestionRunId: input.ingestionRunId,
        actualMetrics: input.actualMetrics,
        deviation,
      });
      // 5. §6.3 feedback bridges — ONLY on the first (new) result; an idempotent
      //    re-submit (existing row) skips them (no double feedback). Post-commit,
      //    best-effort (a bridge failure must NOT roll back the result fact, SPEC §11).
      if (!existing) {
        const scoreDeviation = deriveScoreDeviation(deviation);
        const delta = scoreDeviation <= DEVIATION_BUMP_THRESHOLD ? 5 : -5;
        try {
          await learnings.adjustConfidence(ctx, {
            delta,
            reason: `calibration:${predictionId}`,
          });
        } catch {
          // intentionally swallowed — the confidence nudge is non-critical feedback.
        }
      }
      return toCalibrationResultDto(row);
    },
  };
}

// A single deviation magnitude (normalized) used to decide the confidence nudge / bump
// suggestion. Deterministic: mean absolute deviation across keys, scaled to [0, ∞).
function deriveScoreDeviation(deviation: Record<string, number>): number {
  const values = Object.values(deviation);
  if (values.length === 0) return 0;
  const total = values.reduce((acc, v) => acc + Math.abs(v), 0);
  return total / values.length;
}
