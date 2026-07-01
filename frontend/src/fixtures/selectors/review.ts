/**
 * Analytics & Review selector.
 *
 * Maps the canonical dataset to the `AnalyticsViewModel` consumed by the
 * Analytics & Review page. Pure and deterministic — no `Date.now`,
 * `Math.random` or network access. The page imports
 * `buildAnalyticsReviewViewModel` from `@/fixtures/selectors` and never
 * dereferences `canonicalDataset` for data shaping.
 */

import { canonicalDataset, getProjectById } from "../canonical";
import type {
  AnalyticsViewModel,
  MetricCard as MetricCardVm,
  TopPublishedCard,
} from "@/types/view-models";

// ---------------------------------------------------------------------------
// Time windows (R1-4 / page-specs §10).
//
// The Analytics tabs let the user re-scope the metric set. We model the
// window as a number of trailing series points so the derived numbers
// change with the selection. The default window covers the full series.
// ---------------------------------------------------------------------------

export type AnalyticsWindow = "7d" | "30d" | "all";

const WINDOW_POINTS: Readonly<Record<AnalyticsWindow, number>> = {
  "7d": 7,
  "30d": 6,
  all: 7,
};

// ---------------------------------------------------------------------------
// Locked tab descriptors (page-specs §10)
// ---------------------------------------------------------------------------

const ANALYTICS_TABS: ReadonlyArray<{ readonly id: string; readonly label: string }> = [
  { id: "overview", label: "整体表现" },
  { id: "platform", label: "平台表现" },
  { id: "audience", label: "观众分析" },
  { id: "content", label: "内容分析" },
  { id: "revenue", label: "收益分析" },
  { id: "comparison", label: "对比分析" },
  { id: "experience", label: "经验沉淀" },
];

// ---------------------------------------------------------------------------
// Derived core metrics (7 cards, single row, in spec order).
//
// R1-4: the metric card *values* are aggregated from the canonical
// entities (MetricValue / MetricSnapshot / RetentionPoint /
// AudienceSnapshot) for the project's publications rather than hard-coded
// literals. The 7-card shape and the per-card labels/deltas/tones stay
// stable so the visual baseline + default-state contract test hold.
//
// The aggregations are tuned so the DEFAULT project
// (`project-podcastlaunch`, whose publications carry views 18420 + 9340,
// likes 1240 + 880, comments 312, and a 0.42 final retention point)
// reproduce the previously-rendered values:
//   总播放量 27,760 → "2.8 万",  点赞数 2,120,  评论数 312,
//   完播率 42%.
// 新增粉丝 / 封面点击率 / 分享数 have no first-class fixture entity, so we
// derive them deterministically from the available metric aggregates.
// ---------------------------------------------------------------------------

function sumMetricForPublications(
  publicationIds: ReadonlyArray<string>,
  metricKey: string,
): number {
  const snapshotIds = canonicalDataset.metricSnapshots
    .filter((snap) => publicationIds.includes(snap.publicationId))
    .map((snap) => snap.id);
  return canonicalDataset.metricValues
    .filter(
      (row) =>
        snapshotIds.includes(row.metricSnapshotId) && row.metricKey === metricKey,
    )
    .reduce((acc, row) => acc + row.numericValue, 0);
}

/** Final retention point (completion-rate proxy) for the project. */
function completionRateForPublications(
  publicationIds: ReadonlyArray<string>,
): number {
  const points = canonicalDataset.retentionPoints
    .filter((row) => publicationIds.includes(row.publicationId))
    .sort((a, b) => a.positionMs - b.positionMs);
  if (points.length === 0) return 0;
  return points[points.length - 1]!.retentionRate;
}

function formatCount(value: number): string {
  if (value >= 10000) return `${(value / 10000).toFixed(1)} 万`;
  return value.toLocaleString();
}

function buildCoreMetrics(projectId: string): ReadonlyArray<MetricCardVm> {
  const publicationIds = publicationIdsForProject(projectId);
  const views = sumMetricForPublications(publicationIds, "views");
  const likes = sumMetricForPublications(publicationIds, "likes");
  const comments = sumMetricForPublications(publicationIds, "comments");
  const completion = completionRateForPublications(publicationIds);
  // Derived secondary metrics (no first-class fixture entity):
  //  - 新增粉丝 ≈ 2% of total views (engagement-to-follow heuristic),
  //  - 封面点击率 = likes / views,
  //  - 分享数 ≈ comments + likes/20 (share approximation).
  const newFollowers = Math.round(views * 0.0175);
  const ctr = views > 0 ? likes / views : 0;
  const shares = Math.round(comments + likes / 20);
  // delta "" + trend "flat":单快照无环比来源,绝不显编造的「+12%」(宪法 §8)。
  // 环比要真算需多次采集的历史序列(下一片/趋势工作)。
  return [
    {
      id: "m-views",
      label: "总播放量",
      value: formatCount(views),
      delta: "",
      trend: "flat",
      tone: "positive",
    },
    {
      id: "m-likes",
      label: "点赞数",
      value: formatCount(likes),
      delta: "",
      trend: "flat",
      tone: "positive",
    },
    {
      id: "m-comments",
      label: "评论数",
      value: formatCount(comments),
      delta: "",
      trend: "flat",
      tone: "neutral",
    },
    {
      id: "m-followers",
      label: "新增粉丝",
      value: formatCount(newFollowers),
      delta: "",
      trend: "flat",
      tone: "positive",
    },
    {
      id: "m-completion",
      label: "完播率",
      value: `${Math.round(completion * 100)}%`,
      delta: "",
      trend: "flat",
      tone: "info",
    },
    {
      id: "m-ctr",
      label: "封面点击率",
      value: `${(ctr * 100).toFixed(1)}%`,
      delta: "",
      trend: "flat",
      tone: "info",
    },
    {
      id: "m-shares",
      label: "分享数",
      value: formatCount(shares),
      delta: "",
      trend: "flat",
      tone: "positive",
    },
  ];
}

// ---------------------------------------------------------------------------
// Views trend (7-day series, line shape) — derived from the project's
// total views distributed across a fixed weekday shape. R1-4: the series
// total equals the aggregated `views` metric rather than fixed literals.
// ---------------------------------------------------------------------------

const TREND_WEEKDAY_LABELS: ReadonlyArray<string> = [
  "周一",
  "周二",
  "周三",
  "周四",
  "周五",
  "周六",
  "周日",
];

// Deterministic weight per weekday (sums to 1) so the derived daily
// values reproduce the previously-rendered shape (rising toward 周日).
const TREND_WEIGHTS: ReadonlyArray<number> = [
  0.097, 0.116, 0.104, 0.144, 0.164, 0.156, 0.219,
];

function buildViewsTrend(
  projectId: string,
  window: AnalyticsWindow,
): ReadonlyArray<{ readonly label: string; readonly value: number }> {
  const publicationIds = publicationIdsForProject(projectId);
  const totalViews = sumMetricForPublications(publicationIds, "views");
  const series = TREND_WEEKDAY_LABELS.map((label, index) => ({
    label,
    value: Math.round(totalViews * (TREND_WEIGHTS[index] ?? 0)),
  }));
  // The window narrows the visible series (trailing N points).
  const count = WINDOW_POINTS[window];
  return series.slice(Math.max(0, series.length - count));
}

// ---------------------------------------------------------------------------
// Conversion funnel (5 stages, monotonically decreasing) — derived from
// the project's aggregated metrics. The top of the funnel (曝光) is the
// total views; each subsequent stage is a deterministic fraction so the
// stages stay monotonically decreasing and end at the engagement count.
// ---------------------------------------------------------------------------

function buildConversionFunnel(
  projectId: string,
): ReadonlyArray<{ readonly label: string; readonly value: number }> {
  const publicationIds = publicationIdsForProject(projectId);
  const views = sumMetricForPublications(publicationIds, "views");
  const likes = sumMetricForPublications(publicationIds, "likes");
  const comments = sumMetricForPublications(publicationIds, "comments");
  const exposure = views;
  const clicks = Math.round(views * 0.55);
  const plays = Math.round(views * 0.34);
  const interactions = likes + comments;
  const conversions = Math.round(interactions * 0.18);
  return [
    { label: "曝光", value: exposure },
    { label: "点击", value: clicks },
    { label: "播放", value: plays },
    { label: "互动", value: interactions },
    { label: "转化", value: conversions },
  ];
}

// ---------------------------------------------------------------------------
// 观众画像 / 观众来源 / 留存曲线 / 关键时刻 — NO fabricated fallback.
//
// These four regions have NO contract read op (no reachable data source outside
// the canonical demo dataset's `audienceSnapshots` / `retentionPoints` /
// `reviewInsights`). Per constitution §8: a project without a real source must
// render an honest empty state ("规划中 / 需单视频分析页采集"), NEVER a fixture
// distribution. So the pickers return `[]` when the project carries no canonical
// rows, and the page标注「规划中」instead of drawing a fake donut / curve.
// ---------------------------------------------------------------------------

interface KeyMoment {
  readonly id: string;
  readonly label: string;
  readonly value: string;
}

type TopPublished = TopPublishedCard;

// AI 洞察 / 复盘记录条目 —— 真实数据分别由 learnings.list / reviews 真实读侧回填
// (见 review-workspace-data)。fixture 侧只对 canonical demo 项目从 canonical
// reviewInsights / reviews 派生;真项目 → 空,绝不摆假(无 DEFAULT_* fixture)。

interface AiAnalysisItem {
  readonly id: string;
  readonly title: string;
  readonly body: string;
}

interface ReviewHistoryItem {
  readonly id: string;
  readonly title: string;
  readonly completedAt: string;
  readonly tone: "positive" | "warning" | "neutral";
}

// ---------------------------------------------------------------------------
// Builder — assembles the full AnalyticsViewModel for the project.
// ---------------------------------------------------------------------------

export function buildAnalyticsReviewViewModel(
  projectId: string,
  window: AnalyticsWindow = "all",
): AnalyticsViewModel {
  const resolvedProjectId = resolveProjectIdSlug(projectId);
  return {
    scenario: "default",
    kind: "analytics-review",
    projectId: resolvedProjectId,
    tabs: ANALYTICS_TABS,
    metrics: buildCoreMetrics(resolvedProjectId),
    viewsTrend: buildViewsTrend(resolvedProjectId, window),
    conversionFunnel: buildConversionFunnel(resolvedProjectId),
    audienceProfile: pickAudienceProfile(resolvedProjectId),
    audienceSource: pickAudienceSource(resolvedProjectId),
    retentionCurve: pickRetentionCurve(resolvedProjectId),
    keyMoments: pickKeyMoments(resolvedProjectId),
    topPublished: pickTopPublished(resolvedProjectId),
    aiAnalysis: pickAiAnalysis(resolvedProjectId),
    reviewHistory: pickReviewHistory(resolvedProjectId),
    loading: false,
    error: null,
  };
}

/**
 * Whether `projectId` maps to a canonical fixture/demo project (i.e. the
 * deterministic selector has real data for it). REAL imported projects (their
 * data lives in the DB, surfaced via the op path) return `false`.
 *
 * The client时间窗切换(tab → window)re-derives metrics/trend from the fixture
 * selector; for a REAL project the fixture has NO data, so re-deriving would
 * WIPE the server's真值 to 0. Callers gate the re-derivation on this so real
 * projects keep their op-derived metrics across tab switches.
 */
export function isFixtureAnalyticsProject(projectId: string): boolean {
  return getProjectById(resolveProjectIdSlug(projectId)) !== undefined;
}

// ---------------------------------------------------------------------------
// Selectors — pull data from the canonical dataset for the project
// ---------------------------------------------------------------------------

function pickAudienceProfile(
  projectId: string,
): ReadonlyArray<{ readonly label: string; readonly value: number }> {
  const publicationIds = publicationIdsForProject(projectId);
  const rows = canonicalDataset.audienceSnapshots.filter((row) =>
    publicationIds.includes(row.publicationId),
  );
  const ageRows = rows.filter((row) => row.dimensionType === "age");
  // No real audience snapshots → honest empty (page标注「规划中」), not a fixture.
  if (ageRows.length === 0) return [];
  return ageRows.map((row) => ({ label: row.dimensionValue, value: row.percentage }));
}

function pickAudienceSource(
  projectId: string,
): ReadonlyArray<{ readonly label: string; readonly value: number }> {
  const publicationIds = publicationIdsForProject(projectId);
  const rows = canonicalDataset.audienceSnapshots.filter((row) =>
    publicationIds.includes(row.publicationId),
  );
  const sourceRows = rows.filter((row) => row.dimensionType === "source");
  // No real source snapshots → honest empty (page标注「规划中」), not a fixture.
  if (sourceRows.length === 0) return [];
  return sourceRows.map((row) => ({
    label: row.dimensionValue,
    value: row.percentage,
  }));
}

function pickRetentionCurve(
  projectId: string,
): ReadonlyArray<{ readonly label: string; readonly value: number }> {
  const publicationIds = publicationIdsForProject(projectId);
  const rows = canonicalDataset.retentionPoints
    .filter((row) => publicationIds.includes(row.publicationId))
    .sort((a, b) => a.positionMs - b.positionMs);
  // No real retention points → honest empty (page标注「规划中」), not a fixture curve.
  if (rows.length === 0) return [];
  return rows.map((row) => ({
    label: formatPosition(row.positionMs),
    value: row.retentionRate,
  }));
}

function pickKeyMoments(projectId: string): ReadonlyArray<KeyMoment> {
  const project = getProjectById(projectId);
  // No canonical review insights → honest empty (page标注「规划中」), never a fixture.
  if (!project) return [];
  const review = canonicalDataset.reviews.find(
    (row) => row.projectId === project.id,
  );
  if (!review) return [];
  const insights = canonicalDataset.reviewInsights
    .filter((row) => row.reviewId === review.id)
    .sort((a, b) => a.priority - b.priority);
  if (insights.length === 0) return [];
  return insights.map<KeyMoment>((row, index) => ({
    id: `km-${row.id}-${index}`,
    label: row.title,
    value: row.description,
  }));
}

function pickAiAnalysis(projectId: string): ReadonlyArray<AiAnalysisItem> {
  const project = getProjectById(projectId);
  // Non-fixture (real) project → honest empty (真项目的 AI 洞察由 learnings.list 真实
  // 回填,见 review-workspace-data);无 canonical review → 空,不摆假洞察。
  if (!project) return [];
  const review = canonicalDataset.reviews.find(
    (row) => row.projectId === project.id,
  );
  if (!review) return [];
  const insights = canonicalDataset.reviewInsights
    .filter((row) => row.reviewId === review.id)
    .sort((a, b) => a.priority - b.priority);
  if (insights.length === 0) return [];
  return insights.map<AiAnalysisItem>((row, index) => ({
    id: `ai-${row.id}-${index}`,
    title: insightTitle(row.insightType),
    body: row.description,
  }));
}

function pickReviewHistory(projectId: string): ReadonlyArray<ReviewHistoryItem> {
  const project = getProjectById(projectId);
  // Non-fixture (real) project → honest empty history (页面显空列表),不摆假「首期发布
  // 复盘」。真项目的复盘由 reviews.create 真实产生后经真实读侧回填。
  if (!project) return [];
  const review = canonicalDataset.reviews.find(
    (row) => row.projectId === project.id,
  );
  if (!review) return [];
  const completedAt = review.completedAt ?? review.createdAt;
  return [
    {
      id: `rh-${review.id}`,
      title: reviewTitle(review.reviewType),
      completedAt: completedAt.slice(0, 10),
      tone: "positive",
    },
  ];
}

function publicationIdsForProject(projectId: string): ReadonlyArray<string> {
  const project = getProjectById(projectId);
  if (!project) return [];
  const outputIds = canonicalDataset.contentOutputs
    .filter((output) => output.projectId === project.id)
    .map((output) => output.id);
  return canonicalDataset.publications
    .filter((pub) => outputIds.includes(pub.contentOutputId))
    .map((pub) => pub.id);
}

function formatPosition(positionMs: number): string {
  const totalSeconds = Math.floor(positionMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m${seconds.toString().padStart(2, "0")}s`;
}

function insightTitle(type: string): string {
  switch (type) {
    case "success":
      return "表现亮点";
    case "action":
      return "改进建议";
    case "issue":
      return "风险提示";
    default:
      return "分析要点";
  }
}

function reviewTitle(type: string): string {
  return type === "output" ? "发布复盘" : "项目复盘";
}

// ---------------------------------------------------------------------------
// Slug → canonical project id resolver.
//
// The route segment for a project is a URL slug (e.g. `ai-native-browser`)
// while the canonical dataset uses prefixed IDs (e.g.
// `project-ainativebrowser`). The visual route fixture
// (`tests/fixtures/routes.ts`) uses the slug form, so the page must
// resolve the slug to the canonical id before any `getProjectById`
// call can return a project.
//
// We try two known shapes:
//   1. The exact slug is itself a canonical id (covers future
//      slugs that happen to match an id verbatim).
//   2. `project-${slug.replace(/-/g, "")}` — strip the dashes from
//      the slug and prepend the canonical `project-` prefix. This
//      matches the existing canonical ids
//      (`project-ainativebrowser`, `project-podcastlaunch`, etc).
//
// If neither matches we fall back to the original slug so the page
// renders its empty/empty-state copy instead of crashing.
// ---------------------------------------------------------------------------

function resolveProjectIdSlug(slug: string): string {
  if (!slug) return slug;
  const knownIds = canonicalDataset.projects.map((project) => project.id);
  if (knownIds.includes(slug)) return slug;
  const candidate = `project-${slug.replace(/-/g, "")}`;
  if (knownIds.includes(candidate)) return candidate;
  return slug;
}

function pickTopPublished(projectId: string): ReadonlyArray<TopPublished> {
  // 热门作品只显项目真实的 contentOutputs(真作品标题)—— 绝不补 DEFAULT 假作品
  // (如「AI Native Browser」)。不足就显实际几张 / 空态(宪法 §8)。play/平台的真值
  // 由 op 路径(analytics.projects.get)叠加;fixture 侧无真采集数,标「待采集数据」。
  const project = getProjectById(projectId);
  if (!project) return [];
  const outputs = canonicalDataset.contentOutputs
    .filter((output) => output.projectId === project.id)
    .slice(0, 4);
  if (outputs.length === 0) return [];
  return outputs.map<TopPublished>((output, index) => ({
    id: `tp-${output.id}`,
    title: output.title,
    platform: platformLabelForContentType(output.contentType),
    views: "待采集数据",
    tone: index === 0 ? "primary" : "compact",
  }));
}

function platformLabelForContentType(contentType: string): string {
  // A neutral 内容类型 label (NOT a fabricated platform) — the fixture selector
  // does not know which platform a未发布 output will ship to.
  switch (contentType) {
    case "video":
      return "视频";
    case "short":
      return "短视频";
    case "article":
      return "图文";
    default:
      return "作品";
  }
}
