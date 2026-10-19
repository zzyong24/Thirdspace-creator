import {workspaceKey,workspaceStamp,workspaceFilter,assertWritableWorkspace} from "@creatoros/backend";
import type { RequestContext } from "@creatoros/contract";
import {rubricVersionResource as versionSchema} from '@creatoros/contract';
import { requireAccountId, type Db } from "@creatoros/backend";
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
  type CalibrationOverviewResource,
  type CalibrationRuleSuggestionResource,
} from "./calibration.schema";
import {
  OwnershipError,
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
  // 手动回流:无采集 run 时,建一次 source='manual' 的真 run(满足 §C-4,不绕过铁律)。
  // 幂等 key 用 predictionId,使同一预测的重复录入复用同一 run。返回 runId。
  ensureManualRun(ctx: RequestContext, idempotencyKey: string): Promise<string>;
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
  assertSubjectOwned?(ctx:RequestContext,subject:{subjectType:string;subjectId:string}):Promise<unknown>;
  assertLearningOwned?(ctx:RequestContext,learningId:string):Promise<unknown>;
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
  // 省略 = 手动录入 → 服务端自建一次 source='manual' 的真 run(§C-4 溯源不破)。
  ingestionRunId?: string;
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
  getDefaultRubricVersion(ctx:RequestContext):Promise<RubricVersionResource|null>;
  ensureDefaultRubric(ctx:RequestContext):Promise<RubricResource>;
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
  getRubricVersion(ctx: RequestContext, id: string): Promise<RubricVersionResource>;
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
  // [T-063e] dismissRuleSuggestion: 忽略 → mark the suggestion dismissed (terminal, NO rubric
  // bump, adoptedVersionId stays null). Same pending guard as 采纳 (non-pending → ConflictError).
  dismissRuleSuggestion(
    ctx: RequestContext,
    suggestionId: string,
  ): Promise<CalibrationRuleSuggestionResource>;
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

// Deterministic 变现加权 weighted sum. The current AI shape stores the authoritative
// 1–5 score in predictedConversion.dimensions[{key,score}]; legacy flat
// predictedConversion[key] / predictedMetrics[key] remain fallbacks. Rubric weights sum
// to 1, so Σ(score × weight) intentionally stays on the 1–5 scale (no ×20 normalization
// to 100). Non-numeric / missing → 0. Pure; NO Math.random / Date.now.
function deriveScore(
  dimensions: RubricDimension[],
  predictedMetrics: Record<string, unknown>,
  predictedConversion: Record<string, unknown>,
): number {
  const nestedScores = new Map<string, number>();
  const nestedDimensions = (predictedConversion as {
    dimensions?: Array<{ key?: unknown; score?: unknown }>;
  }).dimensions;
  if (Array.isArray(nestedDimensions)) {
    for (const dimension of nestedDimensions) {
      if (
        dimension &&
        typeof dimension.key === "string" &&
        typeof dimension.score === "number" &&
        Number.isFinite(dimension.score)
      ) {
        nestedScores.set(dimension.key, dimension.score);
      }
    }
  }
  let score = 0;
  for (const d of dimensions) {
    const raw =
      nestedScores.has(d.key)
        ? nestedScores.get(d.key)
        : d.key in predictedConversion
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
  // 维度评分约定(预测分真正落在 predictedConversion.dimensions[] = [{key, score}]):
  // 摊平成 {key: score} 当 predicted,否则维度 key 在顶层取不到 → 偏差恒等于"实际分-0"(错)。
  // 旧扁平 metric(predictedMetrics={views:1000})无 dimensions 数组,行为不变(向后兼容)。
  const dims = (predictedConversion as {
    dimensions?: Array<{ key?: unknown; score?: unknown }>;
  }).dimensions;
  if (Array.isArray(dims)) {
    for (const d of dims) {
      if (d && typeof d.key === "string" && typeof d.score === "number") {
        predicted[d.key] = d.score;
      }
    }
  }
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

  // [T-332 S2 · SPEC §4.2] 每个经 ctx 的入口都经此建 repo:未选号 → AccountRequiredError
  // (引导态禁读写),有号则 strict 收窄到该号。op 标注抛点便于前端归因。
  function repoFor(ctx: RequestContext, op: string): CalibrationRepository {
    const repoDeps: RepoDeps = {
      now,
      nextId,
      userId: ctx.userId,
      ...workspaceStamp(workspaceKey(ctx)),
      context:ctx,
    };
    return createCalibrationRepository(db, repoDeps);
  }

  return {
    async getDefaultRubricVersion(ctx) {
      const current = await repoFor(ctx, "calibration.default.read").getDefaultRubric();
      if (!current) return null;
      const version = versionSchema.parse(toRubricVersionDto(current.version));
      validateDimensions(version.dimensions);
      return version;
    },
    async ensureDefaultRubric(ctx) {
      const current = await repoFor(ctx, "calibration.default.ensure").ensureDefaultRubric();
      const version = versionSchema.parse(toRubricVersionDto(current.version));
      validateDimensions(version.dimensions);
      return toRubricDto(current.root, current.version);
    },
    async createRubric(ctx, input) {
      validateDimensions(input.dimensions);
      return repoFor(ctx,"calibration.createRubric").withWrite(async repo=>{
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
      });
    },

    async bumpRubricVersion(ctx, rubricId, input) {
      validateDimensions(input.dimensions);
      return repoFor(ctx,"calibration.bumpRubricVersion").withRubricWrite(rubricId,async repo=>{
      await repo.getRubric(rubricId); // ownership gate
      // 在真实rubric UPDATE锁内分配连续版本号并提交current指针。
      const versionNumber = (await repo.countRubricVersions(rubricId)) + 1;
      const version = await repo.insertRubricVersion({
        rubricId,
        versionNumber,
        dimensions: input.dimensions,
        changeSummary: input.changeSummary,
      });
      await repo.setRubricCurrentVersion(rubricId, version.id); // old rows untouched
      return toRubricVersionDto(version);
      });
    },

    async getRubric(ctx, rubricId) {
      const repo = repoFor(ctx, "calibration.getRubric");
      const rubric = await repo.getRubric(rubricId); // ownership gate
      const current = await repo.getRubricVersion(rubric.currentVersionId!);
      return toRubricDto(rubric, current);
    },

    async getRubricVersion(ctx, id) {
      return toRubricVersionDto(await repoFor(ctx,"calibration.getRubricVersion").getRubricVersion(id));
    },
    async getCurrentRubricVersion(ctx, rubricId) {
      const repo = repoFor(ctx, "calibration.getCurrentRubricVersion");
      const rubric = await repo.getRubric(rubricId); // ownership gate
      const current = await repo.getRubricVersion(rubric.currentVersionId!);
      return toRubricVersionDto(current);
    },

    async createDraftPrediction(ctx, input) {
      await assertWritableWorkspace(db,ctx);
      if(ctx.groupId){if(!deps.assertSubjectOwned)throw new OwnershipError("校准内容归属校验不可用");await deps.assertSubjectOwned(ctx,input);}
      // Identical to createPrediction (deterministic 变现加权 weighted sum over the rubric
      // version's dimensions), but reached from the AI confirm seam rather than the contract
      // op. The status starts 'draft' (the user reviews + locks the 盲预测 themselves; the AI
      // never auto-locks — 盲预测不可改 only kicks in after the user locks).
      const repo = repoFor(ctx, "calibration.createDraftPrediction");
      const version = await repo.getDefaultOrOwnedRubricVersion(input.rubricVersionId); // exact default parent exception; ordinary versions keep original scope
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
      const repo = repoFor(ctx, "calibration.getOverview");
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
          // locked 主体带其盲预测 id,前端「录入真实表现」据此 results.create(FLY-02)。
          predictionId: lockedPreds[0]?.id ?? null,
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
      await assertWritableWorkspace(db,ctx);
      if(ctx.groupId){if(!deps.assertSubjectOwned)throw new OwnershipError("校准内容归属校验不可用");await deps.assertSubjectOwned(ctx,input);}
      const repo = repoFor(ctx, "calibration.createPrediction");
      // Ownership: the rubric version must be owned (cross-user → OwnershipError → 404).
      const version = await repo.getDefaultOrOwnedRubricVersion(input.rubricVersionId);
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
      return repoFor(ctx,"calibration.lockPrediction").withPredictionWrite(predictionId,async repo=>{
      const current = await repo.getPrediction(predictionId); // ownership gate
      // Idempotent: an already-locked prediction returns its existing row WITHOUT
      // re-stamping lockedAt (mirrors Reviews `complete` idempotency). The盲预测 is never
      // re-locked / edited (§6.2) — there is no edit/unlock op.
      if (current.status === "locked") {
        return toPredictionDto(current);
      }
      const locked = await repo.lockPrediction(predictionId);
      return toPredictionDto(locked);
      });
    },

    async getPrediction(ctx, predictionId) {
      const row = await repoFor(ctx, "calibration.getPrediction").getPrediction(predictionId); // ownership gate
      return toPredictionDto(row);
    },

    async listPredictions(ctx, page) {
      const { rows, total } = await repoFor(ctx, "calibration.listPredictions").listPredictions(page);
      return { rows: rows.map(toPredictionDto), total };
    },

    async recordResult(ctx, predictionId, input) {
      const repo = repoFor(ctx, "calibration.recordResult");
      // 1. Ownership + state guard: the prediction must be LOCKED (cannot calibrate an
      //    unlocked, still-editable 盲预测 → ConflictError).
      const prediction = await repo.getPrediction(predictionId); // ownership gate
      if (prediction.status !== "locked") {
        throw new ConflictError(
          `cannot record a calibration result against an unlocked prediction: ${predictionId}`,
        );
      }
      // 2. §C-4 / RISK-005:actuals 必须追溯一次真实 IngestionRun。采集线显式带 runId →
      //    校验真实&owned(悬空 → OwnershipError → 404);手动录入省略 runId → 自建一次
      //    source='manual' 的真 run(幂等于 predictionId,重复录入复用),不绕过铁律。
      let ingestionRunId: string;
      if (input.ingestionRunId) {
        await ingestion.assertRunExists(ctx, input.ingestionRunId);
        ingestionRunId = input.ingestionRunId;
      } else {
        ingestionRunId = await ingestion.ensureManualRun(
          ctx,
          `manual-calib:${predictionId}`,
        );
      }
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
        ingestionRunId,
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
      await assertWritableWorkspace(db, ctx);
      if (ctx.groupId) {
        if (!deps.assertLearningOwned) throw new OwnershipError("经验归属校验不可用");
        await deps.assertLearningOwned(ctx, input.learningId);
      }
      const repo = repoFor(ctx, "calibration.createRuleSuggestion");
      return repo.withRubricWrite(input.rubricId, async (repo) => {
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
      });
    },

    async listRuleSuggestions(ctx, page) {
      const { rows, total } =
        await repoFor(ctx, "calibration.listRuleSuggestions").listPendingRuleSuggestions(page);
      return { rows: rows.map(toRuleSuggestionDto), total };
    },

    async adoptRuleSuggestion(ctx, suggestionId) {
      return repoFor(ctx,"calibration.adoptRuleSuggestion").withSuggestionWrite(suggestionId,async repo=>{
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
      });
    },

    // [T-063e] 忽略一条回流建议:pending 守卫后标记 dismissed(终态),不碰 rubric 版本链。
    // adoptedVersionId 留 null(没有采纳产物),adoptedAt 记录裁决时间(终态时间戳复用同列)。
    async dismissRuleSuggestion(ctx, suggestionId) {
      return repoFor(ctx,"calibration.dismissRuleSuggestion").withSuggestionWrite(suggestionId,async repo=>{
      const suggestion = await repo.getRuleSuggestion(suggestionId); // ownership gate
      if (suggestion.status !== "pending") {
        throw new ConflictError(
          `calibration rule suggestion is already ${suggestion.status}: ${suggestionId}`,
        );
      }
      const row = await repo.markRuleSuggestionAdopted(suggestionId, {
        status: "dismissed",
        adoptedVersionId: null,
      });
      return toRuleSuggestionDto(row);
      });
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
