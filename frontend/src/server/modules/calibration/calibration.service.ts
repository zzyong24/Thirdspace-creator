import type { RequestContext } from "@creatoros/contract";
import type { Db } from "@creatoros/backend";
import {
  createCalibrationRepository,
  type CalibrationRepository,
  type RepoDeps,
  type RubricDimension,
  type ProposedDimension,
} from "./calibration.repository";
import {
  toRubricDto,
  toRubricVersionDto,
  toPredictionDto,
  toCalibrationResultDto,
  toRuleSuggestionDto,
  type RubricResource,
  type RubricVersionResource,
  type PredictionResource,
  type CalibrationResultResource,
  type CalibrationRuleSuggestionResource,
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

// 复盘飞轮回流 轨B (Learning→校准). createRuleSuggestion is the cross-module write seam the
// Learnings service reaches through an injected port (LearningsCalibrationPort) — a 复盘
// Learning becomes an EXPLICIT, adoptable rubric-rule suggestion. The rubricId defaults to
// the user's current rubric when omitted (resolved by the composition seam, NOT here — the
// service requires an explicit rubricId so ownership is always gated).
export interface CreateRuleSuggestionInput {
  learningId: string;
  rubricId: string;
  proposedDimension: ProposedDimension;
  rationale: string;
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
  // GAP-CAL-1: user-scoped 盲预测 list (createdAt desc, paginated) — the calibration
  // surface renders one PredictionRow per row (lock / 回流 entry per real id).
  listPredictions(
    ctx: RequestContext,
    page: { limit: number; offset: number },
  ): Promise<{ rows: PredictionResource[]; total: number }>;
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

  // --- 复盘飞轮回流 轨B (Learning→校准) ---
  // createRuleSuggestion: the cross-module write the Learnings service calls (через the
  // injected port) to promote a 复盘 Learning into a real, adoptable CalibrationRuleSuggestion.
  // Ownership-gated on the target Rubric (cross-user → OwnershipError → 404). Idempotent on a
  // pending (learning, rubric) — re-reflowing the same Learning returns the existing pending.
  createRuleSuggestion(
    ctx: RequestContext,
    input: CreateRuleSuggestionInput,
  ): Promise<CalibrationRuleSuggestionResource>;
  // listRuleSuggestions: 校准中心 reads the user's PENDING reflowed suggestions (createdAt desc).
  listRuleSuggestions(
    ctx: RequestContext,
    page: { limit: number; offset: number },
  ): Promise<{ rows: CalibrationRuleSuggestionResource[]; total: number }>;
  // adoptRuleSuggestion: 采纳 → append a NEW RubricVersion folding in `proposedDimension`
  // (weights renormalized to sum to 1.0), mark the suggestion adopted (terminal, provenance =
  // the new versionId), and return the new RubricVersion. Idempotent guards: a non-pending
  // suggestion → ConflictError (already 采纳/dismissed — never double-bumps the rubric).
  adoptRuleSuggestion(
    ctx: RequestContext,
    suggestionId: string,
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

    async listPredictions(ctx, page) {
      const { rows, total } = await repoFor(ctx).listPredictions(page);
      return { rows: rows.map(toPredictionDto), total };
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

    async createRuleSuggestion(ctx, input) {
      const repo = repoFor(ctx);
      // Ownership gate on the target Rubric (cross-user / unknown → OwnershipError → 404)
      // BEFORE any suggestion row is written.
      await repo.getRubric(input.rubricId);
      const row = await repo.createRuleSuggestion({
        learningId: input.learningId,
        rubricId: input.rubricId,
        proposedDimension: input.proposedDimension,
        rationale: input.rationale,
      });
      return toRuleSuggestionDto(row);
    },

    async listRuleSuggestions(ctx, page) {
      const { rows, total } =
        await repoFor(ctx).listPendingRuleSuggestions(page);
      return { rows: rows.map(toRuleSuggestionDto), total };
    },

    async adoptRuleSuggestion(ctx, suggestionId) {
      const repo = repoFor(ctx);
      // 1. Ownership + terminal guard: the suggestion must be PENDING (a re-adopt of an
      //    already 采纳/dismissed suggestion → ConflictError; never double-bumps the rubric).
      const suggestion = await repo.getRuleSuggestion(suggestionId); // ownership gate
      if (suggestion.status !== "pending") {
        throw new ConflictError(
          `calibration rule suggestion is already ${suggestion.status}: ${suggestionId}`,
        );
      }
      // 2. Resolve the target rubric's CURRENT immutable version (ownership re-checked).
      const rubric = await repo.getRubric(suggestion.rubricId);
      const current = await repo.getRubricVersion(rubric.currentVersionId!);
      const currentDims = (current.dimensions ?? []) as RubricDimension[];
      const proposed = (suggestion.proposedDimension ?? {}) as ProposedDimension;
      // 3. Fold the proposed dimension into the version's dimensions: REPLACE if the key
      //    already exists (bump its weight/label/desc), else APPEND. Then renormalize all
      //    weights so the set still sums to 1.0 (validateDimensions invariant). The 采纳
      //    keeps the conversion/铺路/利他 direction (the source dim or an existing one).
      const merged = mergeProposedDimension(currentDims, proposed);
      const renormalized = renormalizeWeights(merged);
      validateDimensions(renormalized);
      // 4. Append a NEW immutable RubricVersion (never an update — data-model 约束 6) and
      //    re-point the rubric's current_version_id, exactly like bumpRubricVersion.
      const versionNumber = (await repo.countRubricVersions(suggestion.rubricId)) + 1;
      const version = await repo.insertRubricVersion({
        rubricId: suggestion.rubricId,
        versionNumber,
        dimensions: renormalized,
        changeSummary: `复盘回流采纳：${suggestion.rationale || proposed.label || proposed.key}`,
      });
      await repo.setRubricCurrentVersion(suggestion.rubricId, version.id);
      // 5. Mark the suggestion terminal (adopted), recording the new version as provenance.
      await repo.markRuleSuggestionAdopted(suggestionId, {
        status: "adopted",
        adoptedVersionId: version.id,
      });
      return toRubricVersionDto(version);
    },
  };
}

// Fold a proposed dimension into an existing dimension set: REPLACE the matching `key`
// (bumping its weight/label/description), else APPEND. Returns a NEW array (pure).
function mergeProposedDimension(
  current: RubricDimension[],
  proposed: ProposedDimension,
): RubricDimension[] {
  const next = current.map((d) => ({ ...d }));
  const idx = next.findIndex((d) => d.key === proposed.key);
  const incoming: RubricDimension = {
    key: proposed.key,
    label: proposed.label,
    weight: proposed.weight,
    // description is OPTIONAL on the contract dimension; pass it through when present.
    ...(proposed.description ? { description: proposed.description } : {}),
  } as RubricDimension;
  if (idx >= 0) {
    next[idx] = incoming;
  } else {
    next.push(incoming);
  }
  return next;
}

// Renormalize weights so the set sums to 1.0 (the validateDimensions invariant). When the
// raw sum is ≤ 0 (defensive), fall back to an equal split. Rounds to 4 decimals and pins the
// rounding residue onto the last dimension so the sum is EXACTLY 1.0 (no epsilon drift).
function renormalizeWeights(dims: RubricDimension[]): RubricDimension[] {
  if (dims.length === 0) return dims;
  const rawSum = dims.reduce((acc, d) => acc + (d.weight > 0 ? d.weight : 0), 0);
  const useEqual = rawSum <= 0;
  const scaled = dims.map((d) => {
    const w = useEqual ? 1 / dims.length : (d.weight > 0 ? d.weight : 0) / rawSum;
    return { ...d, weight: Math.round(w * 10000) / 10000 };
  });
  // Pin the residue onto the last dim so Σ === 1.0 exactly (within float repr).
  const sumScaled = scaled.reduce((acc, d) => acc + d.weight, 0);
  const residue = Math.round((1 - sumScaled) * 10000) / 10000;
  const last = scaled[scaled.length - 1]!;
  last.weight = Math.round((last.weight + residue) * 10000) / 10000;
  return scaled;
}

// A single deviation magnitude (normalized) used to decide the confidence nudge / bump
// suggestion. Deterministic: mean absolute deviation across keys, scaled to [0, ∞).
function deriveScoreDeviation(deviation: Record<string, number>): number {
  const values = Object.values(deviation);
  if (values.length === 0) return 0;
  const total = values.reduce((acc, v) => acc + Math.abs(v), 0);
  return total / values.length;
}
