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
  // publication_id 空 → 查不到 → 诚实空态(去任务中心配「抓我作品评论」重采)。绝不摆假评论。
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
 * "去任务中心配采集" guidance, never fake comments).
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
      createdAt: c.createdAt,
    }));
}
