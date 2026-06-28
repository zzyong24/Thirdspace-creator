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
  type CalibrationOverviewResource,
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

// 偏差档位 (校准中心总览 KPI) — bucket a mean-absolute-deviation magnitude into 低/中/高.
// Deterministic boundaries (no Math.random). Bands are tuned for the 维度评分 scale (1–5
// scores → per-dimension deviation roughly in [-4, 4]); a result whose deviation jsonb is
// empty yields "none" (no signal yet, never fabricated as 低).
const DEVIATION_BAND_LOW_MAX = 0.5; // |mean dev| ≤ 0.5 → 低 (预测准)
const DEVIATION_BAND_MID_MAX = 1.5; // ≤ 1.5 → 中; above → 高 (预测偏差大)

function deviationBand(
  meanAbsDeviation: number | null,
): "low" | "mid" | "high" | "none" {
  if (meanAbsDeviation === null) return "none";
  if (meanAbsDeviation <= DEVIATION_BAND_LOW_MAX) return "low";
  if (meanAbsDeviation <= DEVIATION_BAND_MID_MAX) return "mid";
  return "high";
}

// Mean absolute deviation across a deviation jsonb's numeric values; null when there is no
// numeric value (an empty deviation map → no signal, surfaces as "none").
function meanAbsDeviationOf(
  deviation: Record<string, unknown>,
): number | null {
  const values = Object.values(deviation).filter(
    (v): v is number => typeof v === "number" && Number.isFinite(v),
  );
  if (values.length === 0) return null;
  const total = values.reduce((acc, v) => acc + Math.abs(v), 0);
  return total / values.length;
}

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

// 校准中心总览 cross-module aggregates (校准中心大改, Slice 1) — the read-only signals the
// calibration module cannot compute from its OWN tables (待校准内容 subjects + 经验沉淀).
// OPTIONAL (SOFT dep): an absent port (or any rejecting call) degrades to [] — the overview
// NEVER fabricates a subject / learning for a data source that isn't wired. Bound at the
// composition root to peers' PUBLIC services (no cross-module repository import, SPEC §22).
export interface CalibrationOverviewSubject {
  subjectType: "content_output" | "publication";
  subjectId: string;
  title: string;
  platform: string; // "" when a content_output that hasn't been published
}
export interface CalibrationOverviewLearning {
  id: string;
  title: string;
  insight: string;
}
export interface CalibrationOverviewPort {
  // 待校准内容 source — the user's content_outputs + publications (id + title + platform).
  // The service subtracts the ones that already carry a locked prediction.
  listSubjects(ctx: RequestContext): Promise<CalibrationOverviewSubject[]>;
  // 经验沉淀 — the user's calibration-related Learnings (复盘回流经验).
  listLearnings(
    ctx: RequestContext,
    limit: number,
  ): Promise<CalibrationOverviewLearning[]>;
}

export interface ServiceDeps {
  db: Db;
  now: () => string;
  nextId: (prefix: string) => string;
  ingestion: CalibrationIngestionPort;
  learnings: CalibrationLearningsPort;
  // SOFT dep — the cross-module aggregates for calibration.overview (待校准内容 + 经验沉淀).
  // Absent ⇒ those lists report [] (honest, never fabricated).
  overview?: CalibrationOverviewPort;
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

// AI 编导诊断 confirm seam (calibration.diagnose, Slice 1) — the AI module's
// `calibration_diagnosis` confirm branch calls this (AI-free formalize) to mint ONE
// draft prediction whose jsonb carries the 维度评分约定. NOT a contract op. The
// rubricVersionId resolves the dimensions (ownership-gated); predictedScore is derived
// deterministically from the 1–5 dimension scores like any other prediction.
export interface CreateDraftPredictionInput {
  subjectType: "content_output" | "publication";
  subjectId: string;
  rubricVersionId: string;
  predictedMetrics: Record<string, unknown>; // { performance, diagnosis }
  predictedConversion: Record<string, unknown>; // { dimensions: [{key,score,reason,suggestion}] }
  confidence: "high" | "med" | "low";
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

  // AI 编导诊断 confirm seam (calibration.diagnose) — called by the AI module's confirmTask
  // `calibration_diagnosis` branch (AI-free). NOT a contract op. Mints ONE draft prediction
  // carrying the 维度评分约定 jsonb. Reuses the same deriveScore path as createPrediction.
  createDraftPrediction(
    ctx: RequestContext,
    input: CreateDraftPredictionInput,
  ): Promise<PredictionResource>;

  // 校准中心总览 (calibration.overview) — 4 KPI + 待校准内容 + 发布后回流对照 + 经验沉淀,
  // every value DERIVED from real rows at read time (calibration-module rows + the SOFT
  // overview port for cross-module subjects/learnings). No stored 总览 table.
  getOverview(ctx: RequestContext): Promise<CalibrationOverviewResource>;
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
  const { db, now, nextId, ingestion, learnings, overview } = deps;

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

    async createDraftPrediction(ctx, input) {
      // Identical to createPrediction (deterministic 变现加权 weighted sum over the rubric
      // version's dimensions), but reached from the AI confirm seam rather than the contract
      // op. The status starts 'draft' (the user reviews + locks the 盲预测 themselves; the AI
      // never auto-locks — 盲预测不可改 only kicks in after the user locks).
      const repo = repoFor(ctx);
      const version = await repo.getRubricVersion(input.rubricVersionId); // ownership gate
      const dimensions = (version.dimensions ?? []) as RubricDimension[];
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

    async getOverview(ctx) {
      const repo = repoFor(ctx);
      // ONE pass over the user's predictions + results; everything below is DERIVED from
      // these real rows (零造假 — a metric with no backing row is 0 / "" / [] / "none").
      const predictionRows = await repo.listAllPredictions();
      const resultRows = await repo.listAllResults();

      // SOFT cross-module reads (待校准内容 subjects + 经验沉淀 learnings). An absent /
      // rejecting port degrades to [] — never blocks or fabricates.
      const soft = async <T>(p: Promise<T> | undefined, fallback: T): Promise<T> => {
        if (!p) return fallback;
        try {
          return await p;
        } catch {
          return fallback;
        }
      };
      const subjects = await soft(overview?.listSubjects(ctx), []);
      const learningRows = await soft(overview?.listLearnings(ctx, 20), []);

      // --- KPIs ---
      // lockedPredictions = predictions whose status is 'locked' (盲预测已锁定).
      const lockedPredictions = predictionRows.filter(
        (p) => p.status === "locked",
      ).length;
      // completedReflows = calibration_results count (每条 result = 一次发布后回流完成).
      const completedReflows = resultRows.length;
      // avgDeviation = mean of each result's mean-absolute-deviation, bucketed to 低/中/高.
      //   no results → "none" (无回流, 没有偏差信号; never fabricated as 低).
      const perResultMeans = resultRows
        .map((r) =>
          meanAbsDeviationOf((r.deviation ?? {}) as Record<string, unknown>),
        )
        .filter((m): m is number => m !== null);
      const avgDeviation =
        perResultMeans.length === 0
          ? null
          : perResultMeans.reduce((a, b) => a + b, 0) / perResultMeans.length;
      const avgDeviationBand = deviationBand(avgDeviation);
      // latestFinding = the most-recent result's largest-deviation dimension, one line.
      //   "" when there is no result OR the latest result's deviation map is empty.
      const latestFinding = describeLatestFinding(resultRows);

      // --- 待校准内容 (pendingSubjects) ---
      // A subject (content_output / publication) keyed by `${subjectType}:${subjectId}`.
      // badge: 未预测 = no prediction at all; 已锁定 = has a locked prediction but no result;
      //        已回流 = a result landed for one of its locked predictions.
      const predBySubject = new Map<string, typeof predictionRows>();
      for (const p of predictionRows) {
        const key = `${p.subjectType}:${p.subjectId}`;
        const arr = predBySubject.get(key) ?? [];
        arr.push(p);
        predBySubject.set(key, arr);
      }
      const resultPredIds = new Set(resultRows.map((r) => r.predictionId));
      const pendingSubjects: CalibrationOverviewResource["pendingSubjects"] = [];
      for (const s of subjects) {
        const key = `${s.subjectType}:${s.subjectId}`;
        const preds = predBySubject.get(key) ?? [];
        const lockedPreds = preds.filter((p) => p.status === "locked");
        const hasReflow = lockedPreds.some((p) => resultPredIds.has(p.id));
        // 已回流 content is no longer "pending"; only 未预测 + 已锁定(未回流) are待校准.
        if (hasReflow) continue;
        const badge: "unpredicted" | "locked" | "reflowed" =
          lockedPreds.length > 0 ? "locked" : "unpredicted";
        pendingSubjects.push({
          subjectType: s.subjectType,
          subjectId: s.subjectId,
          title: s.title,
          platform: s.platform,
          badge,
        });
      }

      // --- 发布后回流对照 (reflowRows) — join each result with its locked prediction. ---
      const predById = new Map(predictionRows.map((p) => [p.id, p]));
      // Resolve the rubric-version dimension labels for each prediction in a reflow (the key
      // → 中文 label map the 对照表 shows). Fetched once per distinct version (ownership-gated
      // read; a version we cannot see degrades to an empty label map → falls back to key).
      const labelCache = new Map<string, Map<string, string>>();
      async function labelsFor(versionId: string): Promise<Map<string, string>> {
        const cached = labelCache.get(versionId);
        if (cached) return cached;
        const map = new Map<string, string>();
        try {
          const v = await repo.getRubricVersion(versionId);
          for (const d of (v.dimensions ?? []) as RubricDimension[]) {
            if (d && typeof d.key === "string") map.set(d.key, d.label ?? d.key);
          }
        } catch {
          /* version not visible — fall back to keys */
        }
        labelCache.set(versionId, map);
        return map;
      }
      const reflowRows: CalibrationOverviewResource["reflowRows"] = [];
      for (const r of resultRows) {
        const pred = predById.get(r.predictionId);
        if (!pred) continue; // a result whose prediction we cannot see (defensive) — skip.
        // The 维度评分 lives in predictedConversion.dimensions (维度评分约定). Each row pairs
        // the 预测分 (1–5) with the actual sub-score if the actuals carry the dimension key.
        const conv = (pred.predictedConversion ?? {}) as {
          dimensions?: Array<{ key?: unknown; score?: unknown }>;
        };
        const deviationMap = (r.deviation ?? {}) as Record<string, unknown>;
        const actualMap = (r.actualMetrics ?? {}) as Record<string, unknown>;
        const dims = Array.isArray(conv.dimensions) ? conv.dimensions : [];
        const rubricDims = await labelsFor(pred.rubricVersionId);
        const rowDims = dims.map((d) => {
          const key = typeof d.key === "string" ? d.key : "";
          const predicted =
            typeof d.score === "number" && Number.isFinite(d.score)
              ? d.score
              : null;
          const actualRaw = actualMap[key];
          const actual =
            typeof actualRaw === "number" && Number.isFinite(actualRaw)
              ? actualRaw
              : null;
          const devRaw = deviationMap[key];
          const deviation =
            typeof devRaw === "number" && Number.isFinite(devRaw)
              ? devRaw
              : predicted !== null && actual !== null
                ? Math.round((actual - predicted) * 10000) / 10000
                : null;
          return {
            key,
            label: rubricDims.get(key) ?? key,
            predicted,
            actual,
            deviation,
          };
        });
        reflowRows.push({
          predictionId: pred.id,
          subjectId: pred.subjectId,
          dimensions: rowDims,
          deviationBand: deviationBand(meanAbsDeviationOf(deviationMap)),
          // 偏差原因 — the largest-deviation dimension, surfaced as the one-line finding.
          reason: describeFinding(deviationMap, rubricDims),
        });
      }

      return {
        kpis: {
          lockedPredictions,
          completedReflows,
          avgDeviationBand,
          latestFinding,
        },
        pendingSubjects,
        reflowRows,
        learnings: learningRows.map((l) => ({
          id: l.id,
          title: l.title,
          insight: l.insight,
        })),
      };
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

// 偏差原因一句 — the dimension with the largest |deviation|, rendered "{label}: 预测偏{方向}
// {幅度}". "" when the deviation map carries no numeric value (no finding yet). Deterministic
// (ties broken by first-seen key order).
function describeFinding(
  deviation: Record<string, unknown>,
  labels: Map<string, string>,
): string {
  let topKey = "";
  let topAbs = -1;
  let topVal = 0;
  for (const [k, v] of Object.entries(deviation)) {
    if (typeof v !== "number" || !Number.isFinite(v)) continue;
    const abs = Math.abs(v);
    if (abs > topAbs) {
      topAbs = abs;
      topKey = k;
      topVal = v;
    }
  }
  if (!topKey || topAbs <= 0) return "";
  const label = labels.get(topKey) ?? topKey;
  const direction = topVal > 0 ? "实际高于预测" : "实际低于预测";
  return `${label}: ${direction} ${Math.abs(topVal)}`;
}

// latestFinding (KPI) — the most-recent result's largest-deviation finding, one line. The
// result rows are createdAt-desc, so the first with a non-empty deviation map wins. No
// labels available at the KPI level (cross-version), so we surface the raw key. "" when
// there is no result with a numeric deviation.
function describeLatestFinding(
  results: Array<{ deviation: unknown }>,
): string {
  for (const r of results) {
    const dev = (r.deviation ?? {}) as Record<string, unknown>;
    const line = describeFinding(dev, new Map());
    if (line) return line;
  }
  return "";
}
