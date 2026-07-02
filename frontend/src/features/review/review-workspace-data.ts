import "server-only";

import { client as defaultClient } from "@/lib/contract-client.server";
import type {
  AnalyticsViewModel,
  ReviewCommentItem,
  RevenueProductRow,
  RevenueTab,
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
 *   REAL  → `revenue` (REV-1 收益分析) assembled here from the monetization
 *           contract: `monetization.funnel.get` (project-level funnel + honest
 *           unattributed ratio) + this project's outputs → linked products
 *           (`projects.outputs.list` → `outputs.products.list` → `products.get`).
 *           Omitted entirely when there is no real data → honest empty state.
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

// --- REV-1 收益分析 structural DTOs (monetization contract) -----------------
// Subset of `monetizationFunnelResource` (monetization.funnel.get).
interface FunnelStageDto {
  readonly stage: string;
  readonly count: number;
}
interface MonetizationFunnelDto {
  readonly stages: ReadonlyArray<FunnelStageDto>;
  readonly revenueAttributed: number;
  readonly unattributed: {
    readonly leadCount: number;
    readonly conversionCount: number;
    readonly revenue: number;
  };
  readonly unattributedRatio: number;
}
// Subset of `contentOutputResource` (projects.outputs.list).
interface OutputDto {
  readonly id: string;
  readonly title: string;
}
// Subset of `contentOutputProductResource` (outputs.products.list).
interface OutputProductDto {
  readonly id: string;
  readonly productId: string;
  readonly contentRole: string | null;
}
// Subset of `productResource` (products.get).
interface ProductDto {
  readonly id: string;
  readonly name: string;
  readonly tier: string | null;
}

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
  // REV-1 收益分析 — monetization funnel + this project's output→product links.
  // Method names mirror the contract op map keys (createClient indexes by key).
  getFunnel(input: {
    params: undefined;
    query: {
      productId?: string;
      periodStart?: string;
      periodEnd?: string;
    };
    body: undefined;
  }): Promise<unknown>;
  listOutputs(input: {
    params: { projectId: string };
    query: { page: number; pageSize: number };
    body: undefined;
  }): Promise<unknown>;
  listOutputProducts(input: {
    params: { outputId: string };
    query: { page: number; pageSize: number };
    body: undefined;
  }): Promise<unknown>;
  getProduct(input: {
    params: { productId: string };
    query: undefined;
    body: undefined;
  }): Promise<unknown>;
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

// Maps a funnel `stage` (the `conversionEventType` enum) to a human 漏斗 label.
// Mirrors contract primitives: profile_visit/follow/lead/inquiry/signup/
// purchase/repurchase. The funnel narrows 曝光→线索→成交; unknown stages pass
// through their raw key (honest, never silently dropped).
const FUNNEL_STAGE_LABEL: Readonly<Record<string, string>> = {
  profile_visit: "主页访问",
  follow: "关注",
  lead: "线索",
  inquiry: "咨询",
  signup: "报名",
  purchase: "成交",
  repurchase: "复购",
};

/**
 * REV-1 收益分析 — pure builder shaping the monetization funnel + linked products
 * into the `revenue` tab. Always carries the funnel (incl. 金额) and the honest
 * unattributed ratio (§4.5). Returns `null` for the empty state: no funnel
 * activity (every stage 0 AND no revenue) AND no products → the page renders
 * "尚无变现数据" instead of a fake all-zero table.
 */
export function buildRevenueTab(
  funnel: MonetizationFunnelDto | null,
  products: ReadonlyArray<RevenueProductRow>,
): RevenueTab | null {
  const stages = funnel?.stages ?? [];
  const funnelRows = stages.map((s) => ({
    label: FUNNEL_STAGE_LABEL[s.stage] ?? s.stage,
    value: s.count,
  }));
  // Append the 金额 stage (attributed revenue) as the funnel tail.
  const revenueAttributed = funnel?.revenueAttributed ?? 0;
  if (funnel) {
    funnelRows.push({ label: "金额", value: revenueAttributed });
  }

  const hasFunnelActivity =
    stages.some((s) => s.count > 0) || revenueAttributed > 0;
  // Honest empty state: nothing to show.
  if (!hasFunnelActivity && products.length === 0) return null;

  return {
    funnel: funnelRows,
    revenueAttributed,
    unattributedRatio: funnel?.unattributedRatio ?? 0,
    products,
  };
}

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

  // --- REV-1 收益分析 region (REAL via monetization contract) --------------
  // Project-level funnel (one getFunnel hop, §REV-1 default口径) + the products
  // this project's outputs are linked to. Fully degrades: any read failure ⇒
  // `revenue` stays undefined ⇒ the tab renders its empty state, never crashes.
  let revenue: RevenueTab | null = null;
  try {
    let funnel: MonetizationFunnelDto | null = null;
    try {
      funnel = (await client.getFunnel({
        params: undefined,
        query: {},
        body: undefined,
      })) as MonetizationFunnelDto;
    } catch {
      funnel = null;
    }

    // Resolve this project's outputs → their linked products (name + tier +
    // contentRole). Each sub-read is isolated so one bad output never sinks the
    // whole tab.
    const productRows: RevenueProductRow[] = [];
    try {
      const outputs = (await client.listOutputs({
        params: { projectId },
        query: { page: 1, pageSize: 100 },
        body: undefined,
      })) as ReadonlyArray<OutputDto>;

      const seen = new Set<string>();
      for (const output of outputs) {
        let links: ReadonlyArray<OutputProductDto> = [];
        try {
          links = (await client.listOutputProducts({
            params: { outputId: output.id },
            query: { page: 1, pageSize: 100 },
            body: undefined,
          })) as ReadonlyArray<OutputProductDto>;
        } catch {
          continue;
        }
        for (const link of links) {
          // De-dupe a product linked to multiple outputs of the same project.
          if (seen.has(link.productId)) continue;
          seen.add(link.productId);
          let product: ProductDto | null = null;
          try {
            product = (await client.getProduct({
              params: { productId: link.productId },
              query: undefined,
              body: undefined,
            })) as ProductDto;
          } catch {
            product = null;
          }
          productRows.push({
            id: link.productId,
            name: product?.name ?? "未命名产品",
            tier: product?.tier ?? "—",
            contentRole: link.contentRole ?? "—",
          });
        }
      }
    } catch {
      // Output/product read failed — keep whatever products we gathered.
    }

    revenue = buildRevenueTab(funnel, productRows);
  } catch {
    // Any unexpected failure — leave revenue null (empty state).
    revenue = null;
  }

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
    // REV-1: omit the field entirely when there is no real revenue data so the
    // page renders the honest empty state (optional, additive field).
    ...(revenue ? { revenue } : {}),
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
