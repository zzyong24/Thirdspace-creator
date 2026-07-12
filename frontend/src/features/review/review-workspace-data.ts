import "server-only";

import { client as defaultClient } from "@/lib/contract-client.server";
import type {
  AnalyticsViewModel,
  ReviewCommentItem,
} from "@/types/view-models";
import {
  buildAnalyticsReviewViewModelFromOp,
  type MetricSnapshotDto,
} from "./analytics-review-view-model";
import type { LearningVm } from "@/features/experience/experience-data";

/**
 * Analytics & Review Workspace READ-side data assembly ("工作台读侧做真").
 *
 * Assembles a REAL `AnalyticsViewModel` for the Review stage. Only ONE region of
 * this page has an owned read op this wave — the AI 洞察/经验 card (rendered from
 * `viewModel.aiAnalysis`). Everything else (core metrics, the views/conversion/
 * audience/retention charts, key moments, review history) has NO owned read op,
 * so it stays the deterministic fixture/mock shape — we do NOT fake those as
 * "real". The honest split:
 *
 *   REAL  → `aiAnalysis` = 本条视频(projectId)最近一次 `review.analyze` 复盘分析
 *           结果的 learning_list items(T-116c 真·本期专属)。经 ai.tasks.list
 *           (additive projectId+taskType 读过滤)+ ai.tasks.results.list 取。
 *           无本项目结果 → 空(诚实空态 + 「帮我复盘」CTA),绝不回退全站 learnings。
 *   REAL  → `comparison` (REV-2 对比分析) derived in the pure view-model builder
 *           by grouping the SAME `analytics.projects.get` snapshots by
 *           publicationId (zero new backend op). Honest empty <2 publications.
 *   EMPTY → metrics / viewsTrend / conversionFunnel / audience* / retentionCurve
 *           / keyMoments / topPublished / reviewHistory — no owned read path →
 *           honest empty ([T-050] demo fixture 兜底退役)。
 *
 * Degrades gracefully:
 *   - The metrics/chart base is built via `buildAnalyticsReviewViewModelFromOp`
 *     over the real `analytics.projects.get` payload; a failure runs the SAME
 *     builder over an empty snapshot list (honest empty metrics, never demo).
 *   - The AI 分析 read is independent: if it throws (or the client lacks the task
 *     ops), `aiAnalysis` stays empty (honest empty card, never fabricated).
 *
 * The contract client is injected so this helper is unit-testable without the
 * real in-process backend.
 */

// [T-116c] AI 分析卡真本期读侧的两个结构 DTO(ai.tasks.list / ai.tasks.results.list)。
// AITask:本项目最近一次 review.analyze 任务(projectId + taskType 已在服务端窄化过滤)。
interface AITaskDto {
  readonly id: string;
  readonly taskType: string;
  readonly projectId: string | null;
  readonly status: string;
  readonly requestedAt: string;
  readonly completedAt: string | null;
}

// AITaskResult:该任务的一条结果;复盘产物是 resultType "learning_list",
// resultData.items = [{ title, insight }]。读侧只取要点标题 + insight 正文。
interface AITaskResultDto {
  readonly id: string;
  readonly resultType: string;
  readonly resultData: Record<string, unknown>;
}

interface LearningListItem {
  readonly title?: unknown;
  readonly insight?: unknown;
}

// [T-118a] 本作品 candidate learning 行(learnings.list 的 learningResource 子集)。
// AdjudicationQueue 复用 experience 的 LearningVm 形状,这里映射真值(读失败诚实空)。
interface CandidateLearningDto {
  readonly id: string;
  readonly title: string;
  readonly insight: string;
  readonly learningType: string;
  readonly validationStatus: "candidate" | "validated" | "discarded";
  readonly confidenceScore: number;
  readonly reuseCount?: number;
  readonly reviewId?: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

const LEARNING_TYPE_KEYS = [
  "strategy",
  "hook",
  "structure",
  "failure",
  "process",
  "editing",
  "conversion_pattern",
  "offer_insight",
  // [T-183] 改稿信号源(与 contract learningResource + experience-data 对齐)。
  "edit_delta",
] as const;

function normalizeLearningType(raw: string): LearningVm["learningType"] {
  return (LEARNING_TYPE_KEYS as ReadonlyArray<string>).includes(raw)
    ? (raw as LearningVm["learningType"])
    : "strategy";
}

function toLearningVm(dto: CandidateLearningDto): LearningVm {
  return {
    id: dto.id,
    title: dto.title,
    insight: dto.insight,
    learningType: normalizeLearningType(dto.learningType),
    validationStatus: dto.validationStatus,
    confidenceScore: dto.confidenceScore,
    reuseCount: dto.reuseCount ?? 0,
    reviewId: dto.reviewId ?? null,
    createdAt: dto.createdAt ?? "",
    updatedAt: dto.updatedAt ?? "",
  };
}

/**
 * [T-118a §A] 读「本作品的 candidate learnings」→ 复盘页「本期经验」裁决区。
 *
 * 走 learnings.list 的 additive projectId + validationStatus=candidate 过滤(纯读窄化,
 * 归属门在 backend 最外层)。createdAt 倒序(最新的经验候选在前)。
 *
 * 诚实空态:本作品还没产经验候选 / 端口未装配 / 读失败 → [](上层渲空态 + 「帮我复盘」CTA),
 * 绝不 fixture 兜底、绝不回退全站 learnings(宪法 §8)。
 */
async function readProjectCandidateLearnings(
  client: ReviewDataClient,
  projectId: string,
): Promise<ReadonlyArray<LearningVm>> {
  if (!client.listLearnings) return [];
  try {
    const listed = await client.listLearnings({
      params: undefined,
      query: {
        page: 1,
        // paginationQuery 上限 100(见 contract primitives)。单作品的经验候选不会到百级,
        // 取满一页即可(超出极端情况按最新 100 条裁决,诚实边界)。
        pageSize: 100,
        projectId,
        validationStatus: "candidate",
      },
      body: undefined,
    });
    const rows = (Array.isArray(listed) ? listed : []) as CandidateLearningDto[];
    return rows
      .map(toLearningVm)
      .sort((a, b) =>
        a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0,
      );
  } catch {
    return [];
  }
}

// [T-052 裁决③] REV-1 收益分析 DTO(MonetizationFunnelDto/OutputProductDto/ProductDto 等)
// 随变现中心物理删除(宪法 §8「变现中心移除」)。

export interface ReviewDataClient {
  getProjectAnalytics(input: {
    params: { projectId: string };
    query: { page: number; pageSize: number };
    body: undefined;
  }): Promise<unknown>;
  // [T-116c] AI 分析卡改读「本条视频的 review.analyze 最近一次复盘结果」(真·本期专属),
  // 不再挂全站 learnings(旧 listLearnings 读已移除)。走既有 ai.tasks.list(additive
  // projectId+taskType 读过滤)定位本项目任务 → ai.tasks.results.list 取其 learning_list items。
  listAITasks?(input: {
    params: undefined;
    query: {
      page: number;
      pageSize: number;
      projectId?: string;
      taskType?: string;
    };
    body: undefined;
  }): Promise<unknown>;
  listTaskResults?(input: {
    params: { taskId: string };
    query: undefined;
    body: undefined;
  }): Promise<unknown>;
  // [T-118a] 本作品的 candidate learnings(复盘产的经验候选)——「本期经验」裁决区读。
  // 走 learnings.list 的 additive projectId + validationStatus 过滤(纯读窄化)。
  listLearnings?(input: {
    params: undefined;
    query: {
      page: number;
      pageSize: number;
      projectId?: string;
      validationStatus?: "candidate" | "validated" | "discarded";
    };
    body: undefined;
  }): Promise<unknown>;
  // [T-052 裁决③] getFunnel/listOutputs/listOutputProducts/getProduct 四个
  // monetization 读方法随收益分析装配一并删除。
  // 复盘每作品评论 (T-030 D6) — a publication's comment signals (前 100 条, user-scoped).
  listPublicationComments(input: {
    params: { publicationId: string };
    query: { limit: number };
    body: undefined;
  }): Promise<unknown>;
  // [T-053 断点③] 项目复盘记录(reviews.list)—— 复盘页「复盘记录」区读真。
  listReviews?(input: {
    params: { projectId: string };
    query: undefined;
    body: undefined;
  }): Promise<unknown>;
}

// Subset of `reviewResource` (reviews.list).
interface ReviewRowDto {
  readonly id: string;
  readonly reviewType: "project" | "output";
  readonly status: string;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly createdAt: string;
  readonly completedAt: string | null;
}

/**
 * [T-053 断点③] 项目的真实复盘记录 → 「复盘记录」条目。此前该区 fixture-only
 * (契约没有按项目列 reviews 的读 op),用户完成的复盘永远显示不出来。
 * completed → positive;进行中 → neutral。读失败 → [](诚实空)。
 */
async function readReviewHistory(
  client: ReviewDataClient,
  projectId: string,
): Promise<AnalyticsViewModel["reviewHistory"]> {
  if (!client.listReviews) return [];
  try {
    const listed = await client.listReviews({
      params: { projectId },
      query: undefined,
      body: undefined,
    });
    const rows = (Array.isArray(listed) ? listed : []) as ReviewRowDto[];
    return rows.map((r) => ({
      id: r.id,
      title: `${r.reviewType === "project" ? "项目复盘" : "作品复盘"} · ${r.periodStart.slice(0, 10)} ~ ${r.periodEnd.slice(0, 10)}`,
      completedAt: r.completedAt ?? r.createdAt,
      tone: r.status === "completed" ? ("positive" as const) : ("neutral" as const),
    }));
  } catch {
    return [];
  }
}

// Subset of `audienceSignalResource` (publications.comments.list) — 复盘每作品评论读侧。
interface CommentSignalDto {
  readonly id: string;
  readonly rawText: string;
  readonly demandTag: string | null;
  readonly likeCount: number | null; // T-042 热榜排序依据
  readonly externalId: string | null; // T-092 幂等锚(单条入知识库用)
  readonly createdAt: string;
}

/**
 * [T-116c] 读「本条视频的最近一次 review.analyze 复盘分析结果」→ AI 分析卡要点。
 *
 * 真本期专属(不再挂全站 learnings):
 *   1. ai.tasks.list(projectId + taskType="review.analyze",additive 读过滤)取本项目
 *      的复盘分析任务,服务端已按 requestedAt desc 排序;
 *   2. 顺着取「最近一个有 learning_list 结果」的任务(优先 completed/awaiting_confirmation
 *      即产出过候选的),读 ai.tasks.results.list → resultData.items;
 *   3. items({title, insight})映射成要点卡。
 *
 * 诚实空态:本项目没有任何 review.analyze 结果 → 返回 []。上层据此渲「本条视频还没生成
 * AI 复盘要点」+ 指向「帮我复盘」的 CTA,绝不回退全站 learnings 假充本期(宪法 §8)。
 *
 * 端口未装配(旧 client 无这两个方法)/ 任一读失败 → [](诚实降级,不炸页)。
 */
async function readProjectReviewInsights(
  client: ReviewDataClient,
  projectId: string,
): Promise<AnalyticsViewModel["aiAnalysis"]> {
  if (!client.listAITasks || !client.listTaskResults) return [];
  try {
    const listed = await client.listAITasks({
      params: undefined,
      query: {
        page: 1,
        pageSize: 50,
        projectId,
        taskType: "review.analyze",
      },
      body: undefined,
    });
    const tasks = (Array.isArray(listed) ? listed : []) as AITaskDto[];
    // 服务端已 requestedAt desc;客户端再做防御性排序(最近在前)。
    const ordered = tasks
      .slice()
      .sort((a, b) => (a.requestedAt < b.requestedAt ? 1 : a.requestedAt > b.requestedAt ? -1 : 0));

    // 顺着取第一个「真产出了 learning_list」的任务结果(可能有排队/失败的任务夹在中间)。
    for (const task of ordered) {
      const resultsRaw = await client.listTaskResults({
        params: { taskId: task.id },
        query: undefined,
        body: undefined,
      });
      const results = (Array.isArray(resultsRaw) ? resultsRaw : []) as AITaskResultDto[];
      // 最新一条 learning_list 结果(CollabField patch 后仍是同一条的 items)。
      const candidate = results
        .filter((r) => r.resultType === "learning_list")
        .at(-1);
      const items = candidate && Array.isArray(candidate.resultData.items)
        ? (candidate.resultData.items as LearningListItem[])
        : [];
      const mapped = items
        .map((item, idx): AnalyticsViewModel["aiAnalysis"][number] | null => {
          const title = typeof item.title === "string" ? item.title.trim() : "";
          if (!title) return null;
          const insight =
            typeof item.insight === "string" ? item.insight.trim() : "";
          return { id: `review-insight-${task.id}-${idx}`, title, body: insight };
        })
        .filter((x): x is AnalyticsViewModel["aiAnalysis"][number] => x !== null);
      if (mapped.length > 0) return mapped;
    }
    return [];
  } catch {
    return [];
  }
}

// [T-052 裁决③] FUNNEL_STAGE_LABEL 与 buildRevenueTab(REV-1 收益分析纯构建器)
// 随变现中心物理删除。

/**
 * Build the REAL Review ViewModel, degrading to the fixture VM on failure.
 *
 * @param projectId  the (already canonical-resolved) route project id.
 * @param client     the contract client (server-bound). Injected for tests.
 */
export async function buildReviewWorkspaceViewModel(
  projectId: string,
  client: ReviewDataClient = defaultClient as unknown as ReviewDataClient,
): Promise<AnalyticsViewModel> {
  // --- Metrics / charts base (real op) -------------------------------------
  // [T-050] snapshots 读失败不再回退 fixture 聚合(canonicalDataset demo 指标已
  // 退役)——用空快照走同一个 op 版构造,渲染诚实空指标,页面不炸。
  let base: AnalyticsViewModel;
  // Retain the real snapshots — they carry the project's publicationId(s), which the
  // 复盘每作品评论 read (T-030 D6) needs to scope comments to the current 作品.
  let snapshots: ReadonlyArray<MetricSnapshotDto> = [];
  try {
    snapshots = (await client.getProjectAnalytics({
      params: { projectId },
      query: { page: 1, pageSize: 100 },
      body: undefined,
    })) as ReadonlyArray<MetricSnapshotDto>;
    base = buildAnalyticsReviewViewModelFromOp(projectId, snapshots);
  } catch {
    base = buildAnalyticsReviewViewModelFromOp(projectId, []);
  }

  // --- AI 分析 region (REAL·真本期专属 via review.analyze 任务结果, T-116c) -----
  // 停止读全站 learnings 挂本项目(那在全站数据上撒谎「基于本期复盘数据」)。改读本条
  // 视频(projectId)最近一次 review.analyze 复盘分析的 learning_list 结果。无结果 → 空
  // (页面渲诚实空态 + 「帮我复盘」CTA),绝不回退全站 learnings 假充本期(宪法 §8)。
  const aiAnalysis = await readProjectReviewInsights(client, projectId);

  // [T-052 裁决③] REV-1 收益分析装配段(getFunnel + outputs→products 三跳读)
  // 随变现中心物理删除;AnalyticsViewModel 不再携带 revenue 字段。

  // --- 复盘每作品评论 region (REAL via publications.comments.list, T-030 D6) --------
  // The current 作品 的真实评论 (前 100 条). Scope to the project's publication(s), read
  // from the analytics snapshots' publicationId. F3 边界:存量评论无 aweme_id 锚未回填,
  // publication_id 空 → 查不到 → 诚实空态(去自动化配「抓我作品评论」重采)。绝不摆假评论。
  const comments = await fetchReviewComments(client, snapshots);

  // [T-053 断点③] 复盘记录接真(reviews.list):完成/进行中的真 review 都列出;空就空。
  const reviewHistory = await readReviewHistory(client, projectId);

  // [T-118a §A] 本作品的经验候选(candidate learnings)——「本期经验」裁决区。读失败/空 → []
  // (页面渲诚实空态 + 「帮我复盘」CTA),绝不 fixture 兜底、绝不回退全站 learnings。
  const candidateLearnings = await readProjectCandidateLearnings(
    client,
    projectId,
  );

  return {
    ...base,
    aiAnalysis,
    reviewHistory,
    // 复盘每作品评论 (T-030 D6) — 前 100 条真实评论;空 → 页面渲染诚实空态。
    comments,
    // [T-118a §A] 本作品经验候选;空 → 本期经验区渲诚实空态 + CTA。
    candidateLearnings,
  };
}

// ---------------------------------------------------------------------------
// [T-063e] 预测 vs 实际 对照(校准对照视图并入项目复盘页)
// ---------------------------------------------------------------------------
//
// 飞轮第四步「对照」发生在复盘:本项目的盲预测分 vs 发布后真实表现。读侧全部复用
// 现有 calibration op(零新契约):
//   listOutputs(projectId) + listPublications(outputId) → 本项目的 subject 集合
//   calibration.predictions.list → 命中 subject 的盲预测(预测分/状态)
//   calibration.overview.reflowRows → 已回流预测的逐维度 预测/真实/偏差
// 无盲预测 → null(页面渲诚实空态「本项目未做盲预测」);任一读失败按区降级。

export interface PredictionComparisonRow {
  readonly predictionId: string;
  readonly status: "draft" | "locked";
  readonly predictedScore: number;
  readonly lockedAt: string | null;
  /**
   * [T-247] 盲预测的维度评分(predictedConversion.dimensions 维度评分约定)——
   * 「录入实绩」确认门按 key 摆录入框、预填 AI 候选分。旧预测无维度约定 → []。
   */
  readonly dimensions: ReadonlyArray<{
    readonly key: string;
    readonly predicted: number | null;
  }>;
  /** 已回流 → 逐维度对照;未回流 → null(显「等待发布数据回流」)。 */
  readonly reflow: {
    readonly deviationBand: "low" | "mid" | "high" | "none";
    readonly reason: string;
    readonly dimensions: ReadonlyArray<{
      readonly key: string;
      readonly label: string;
      readonly predicted: number | null;
      readonly actual: number | null;
      readonly deviation: number | null;
    }>;
  } | null;
}

export interface PredictionComparisonVm {
  readonly rows: ReadonlyArray<PredictionComparisonRow>;
}

// 对照读侧的窄 client 形状(route 传 session-scoped 契约 client 的结构子集)。
export interface PredictionComparisonClient {
  listOutputs(input: {
    params: { projectId: string };
    query: undefined;
    body: undefined;
  }): Promise<unknown>;
  listPublications(input: {
    params: { outputId: string };
    query: { page: number; pageSize: number };
    body: undefined;
  }): Promise<unknown>;
  listPredictions(input: {
    params: undefined;
    query: { page: number; pageSize: number };
    body: undefined;
  }): Promise<unknown>;
  overview(input: {
    params: undefined;
    query: undefined;
    body: undefined;
  }): Promise<unknown>;
}

interface PredictionRowDto {
  readonly id: string;
  readonly subjectType: string;
  readonly subjectId: string;
  readonly status: string;
  readonly predictedScore: number;
  readonly lockedAt: string | null;
  readonly createdAt: string;
  // [T-247] 维度评分约定(可选强 schema 视图):{ dimensions: [{key, score}] }。
  readonly predictedConversion?: Record<string, unknown>;
}

// [T-247] 从 predictedConversion 抽维度评分(键 + 当初预测分)。旧预测(空 jsonb /
// 无约定)→ [](录入门按无预填的手动录入降级,诚实不编)。
function extractPredictionDimensions(
  predictedConversion: Record<string, unknown> | undefined,
): ReadonlyArray<{ key: string; predicted: number | null }> {
  const raw = (predictedConversion ?? {}) as {
    dimensions?: Array<{ key?: unknown; score?: unknown }>;
  };
  if (!Array.isArray(raw.dimensions)) return [];
  const out: Array<{ key: string; predicted: number | null }> = [];
  for (const d of raw.dimensions) {
    if (typeof d?.key !== "string" || d.key.length === 0) continue;
    out.push({
      key: d.key,
      predicted: typeof d.score === "number" ? d.score : null,
    });
  }
  return out;
}

interface OverviewReflowDto {
  readonly reflowRows: ReadonlyArray<{
    readonly predictionId: string;
    readonly subjectId: string;
    readonly deviationBand: "low" | "mid" | "high" | "none";
    readonly reason: string;
    readonly dimensions: ReadonlyArray<{
      readonly key: string;
      readonly label: string;
      readonly predicted: number | null;
      readonly actual: number | null;
      readonly deviation: number | null;
    }>;
  }>;
}

/**
 * [T-063e] 装配本项目的「预测 vs 实际」对照。返回 null = 本项目没有任何盲预测
 * (页面渲诚实空态);返回行按 createdAt desc(最新预测在前)。
 */
export async function buildPredictionComparison(
  projectId: string,
  client: PredictionComparisonClient,
): Promise<PredictionComparisonVm | null> {
  // 1. 本项目的 subject 集合:content_output ids + 其下 publication ids。
  const subjectIds = new Set<string>();
  try {
    const outputsRaw = await client.listOutputs({
      params: { projectId },
      query: undefined,
      body: undefined,
    });
    const outputs = (Array.isArray(outputsRaw) ? outputsRaw : []) as Array<{
      id: string;
    }>;
    for (const o of outputs) {
      subjectIds.add(o.id);
      try {
        const pubsRaw = await client.listPublications({
          params: { outputId: o.id },
          query: { page: 1, pageSize: 20 },
          body: undefined,
        });
        for (const p of (Array.isArray(pubsRaw) ? pubsRaw : []) as Array<{
          id: string;
        }>) {
          subjectIds.add(p.id);
        }
      } catch {
        // 单产出的发布读失败 → 跳过它,不沉整个对照区。
      }
    }
  } catch {
    return null; // 产出都读不到 → 无从对照,诚实空。
  }
  if (subjectIds.size === 0) return null;

  // 2. 命中本项目 subject 的盲预测。
  let predictions: PredictionRowDto[] = [];
  try {
    const raw = await client.listPredictions({
      params: undefined,
      query: { page: 1, pageSize: 100 },
      body: undefined,
    });
    predictions = ((Array.isArray(raw) ? raw : []) as PredictionRowDto[]).filter(
      (p) => subjectIds.has(p.subjectId),
    );
  } catch {
    return null;
  }
  if (predictions.length === 0) return null;

  // 3. 已回流预测的逐维度对照(overview.reflowRows;读失败 → 全部按未回流渲染)。
  let reflowByPrediction = new Map<
    string,
    NonNullable<PredictionComparisonRow["reflow"]>
  >();
  try {
    const overview = (await client.overview({
      params: undefined,
      query: undefined,
      body: undefined,
    })) as OverviewReflowDto;
    reflowByPrediction = new Map(
      (overview.reflowRows ?? []).map((r) => [
        r.predictionId,
        {
          deviationBand: r.deviationBand,
          reason: r.reason,
          dimensions: r.dimensions,
        },
      ]),
    );
  } catch {
    // 回流读失败 → 对照行仍渲预测分,逐维度区显「等待回流」。
  }

  return {
    rows: predictions.map((p) => ({
      predictionId: p.id,
      status: p.status === "locked" ? "locked" : "draft",
      predictedScore: p.predictedScore,
      lockedAt: p.lockedAt,
      // [T-247] 维度评分随行带出 → 「录入实绩」门按 key 摆录入框。
      dimensions: extractPredictionDimensions(p.predictedConversion),
      reflow: reflowByPrediction.get(p.id) ?? null,
    })),
  };
}

/** Distinct publicationIds carried by the project's analytics snapshots (one row per
 *  publication). An imported project's 作品 = its publication; this is the作品 scope for
 *  the 复盘评论 read. */
function publicationIdsFromSnapshots(
  snapshots: ReadonlyArray<MetricSnapshotDto>,
): ReadonlyArray<string> {
  const seen = new Set<string>();
  for (const s of snapshots) {
    if (s.publicationId) seen.add(s.publicationId);
  }
  return Array.from(seen);
}

/**
 * 复盘每作品评论 (T-030 D6) — fetch the current 作品 的评论 (前 100 条, newest first).
 * Reads `publications.comments.list` for each of the project's publications and merges,
 * capped at 100. Each read is isolated: one failing publication never sinks the region.
 * Returns `[]` on no publications / no comments (honest empty state — the page shows the
 * "去自动化配采集" guidance, never fake comments).
 */
export async function fetchReviewComments(
  client: ReviewDataClient,
  snapshots: ReadonlyArray<MetricSnapshotDto>,
): Promise<ReadonlyArray<ReviewCommentItem>> {
  const publicationIds = publicationIdsFromSnapshots(snapshots);
  if (publicationIds.length === 0) return [];
  const merged: CommentSignalDto[] = [];
  for (const publicationId of publicationIds) {
    if (merged.length >= 100) break;
    try {
      const rows = (await client.listPublicationComments({
        params: { publicationId },
        query: { limit: 100 },
        body: undefined,
      })) as ReadonlyArray<CommentSignalDto>;
      merged.push(...rows);
    } catch {
      // One publication's read failed — skip it, keep the rest (honest partial).
      continue;
    }
  }
  // 热榜排序 (T-042):跨作品合并后按点赞数降序,同赞数再按 created_at 降序兜底,封顶前 100 条
  // (SPEC §10「热榜100」)。后端每作品已按点赞排,但多作品合并需在此重排出全局热榜。
  // likeCount null(存量 0014 前采集)按 -1 计,沉到榜尾不抢前列。
  const rank = (c: CommentSignalDto) => c.likeCount ?? -1;
  return merged
    .slice()
    .sort((a, b) => {
      const byLike = rank(b) - rank(a);
      if (byLike !== 0) return byLike;
      return a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0;
    })
    .slice(0, 100)
    .map((c) => ({
      id: c.id,
      text: c.rawText,
      demandTag: c.demandTag ?? null,
      likeCount: c.likeCount ?? null,
      // [T-092] 幂等锚透传(单条「入知识库」写 sourceMetadata 双料锚)。
      externalId: c.externalId ?? null,
      createdAt: c.createdAt,
    }));
}
