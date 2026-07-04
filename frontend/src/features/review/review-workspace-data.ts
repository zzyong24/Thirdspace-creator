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
 *   REAL  → `aiAnalysis` overlaid from `learnings.list` (the AI-distilled
 *           experience persisted by the 复盘 pipeline). These are user-scoped
 *           learnings, surfaced as the project's insight card.
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
 *   - The learnings read is independent: if it throws, `aiAnalysis` stays empty.
 *     A real learning set fills the insight card.
 *
 * The contract client is injected so this helper is unit-testable without the
 * real in-process backend.
 */

// Minimal structural DTO — the contract client returns a parsed
// `learningResource[]`; we only read the fields we map.
interface LearningDto {
  readonly id: string;
  readonly title: string;
  readonly insight: string;
  readonly recommendation: string;
  readonly validationStatus: "candidate" | "validated" | "discarded";
  readonly confidenceScore: number;
  readonly createdAt: string;
}

// [T-052 裁决③] REV-1 收益分析 DTO(MonetizationFunnelDto/OutputProductDto/ProductDto 等)
// 随变现中心物理删除(宪法 §8「变现中心移除」)。

export interface ReviewDataClient {
  getProjectAnalytics(input: {
    params: { projectId: string };
    query: { page: number; pageSize: number };
    body: undefined;
  }): Promise<unknown>;
  listLearnings(input: {
    params: undefined;
    query: { page: number; pageSize: number };
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

/** Maps a persisted learning to an `aiAnalysis` insight card item. */
function learningToInsight(
  learning: LearningDto,
): AnalyticsViewModel["aiAnalysis"][number] {
  const body = learning.recommendation
    ? `${learning.insight}\n建议：${learning.recommendation}`
    : learning.insight;
  return {
    id: `learning-${learning.id}`,
    title: learning.title,
    body,
  };
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

  // --- AI 洞察 / 经验 region (REAL via learnings.list) ---------------------
  // [T-050] demo 洞察兜底(isFixtureAnalyticsProject 分支)退役:无 learnings 就是
  // 空洞察卡,不摆演示内容。
  let aiAnalysis: AnalyticsViewModel["aiAnalysis"] = [];
  try {
    const learnings = (await client.listLearnings({
      params: undefined,
      query: { page: 1, pageSize: 100 },
      body: undefined,
    })) as ReadonlyArray<LearningDto>;

    // Surface the AI-distilled experience: drop discarded learnings, prefer the
    // higher-confidence validated ones first.
    const surfaced = learnings
      .filter((learning) => learning.validationStatus !== "discarded")
      .sort((a, b) => {
        const aValidated = a.validationStatus === "validated" ? 1 : 0;
        const bValidated = b.validationStatus === "validated" ? 1 : 0;
        if (aValidated !== bValidated) return bValidated - aValidated;
        return b.confidenceScore - a.confidenceScore;
      });

    if (surfaced.length > 0) {
      // Real learnings OVERWRITE the fixture insight content.
      aiAnalysis = surfaced.map(learningToInsight);
    }
    // No learnings → 保持空(诚实空态)。
  } catch {
    // Learnings read failed — keep the fixture/empty value already assigned.
  }

  // [T-052 裁决③] REV-1 收益分析装配段(getFunnel + outputs→products 三跳读)
  // 随变现中心物理删除;AnalyticsViewModel 不再携带 revenue 字段。

  // --- 复盘每作品评论 region (REAL via publications.comments.list, T-030 D6) --------
  // The current 作品 的真实评论 (前 100 条). Scope to the project's publication(s), read
  // from the analytics snapshots' publicationId. F3 边界:存量评论无 aweme_id 锚未回填,
  // publication_id 空 → 查不到 → 诚实空态(去自动化配「抓我作品评论」重采)。绝不摆假评论。
  const comments = await fetchReviewComments(client, snapshots);

  // [T-053 断点③] 复盘记录接真(reviews.list):完成/进行中的真 review 都列出;空就空。
  const reviewHistory = await readReviewHistory(client, projectId);

  return {
    ...base,
    aiAnalysis,
    reviewHistory,
    // 复盘每作品评论 (T-030 D6) — 前 100 条真实评论;空 → 页面渲染诚实空态。
    comments,
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
