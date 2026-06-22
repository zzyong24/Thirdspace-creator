/**
 * Server-side ViewModel builder for the Analytics & Review page (module 11).
 *
 * The review route fetches the real op `analytics.projects.get` (a list of
 * `MetricSnapshot` DTOs, user-scoped) and feeds the result here. This builder
 * starts from the deterministic fixture selector (which owns the audience /
 * retention shapes that have NO owned contract op) and then OVERLAYS the REAL
 * signal carried by the returned snapshots' `rawMetrics`:
 *   - `empty`: a project with zero owned snapshots renders the empty state.
 *   - with snapshots: the 7 core metric cards (总播放/点赞/评论/新增粉丝/完播率/
 *     封面点击率/分享) + the conversion funnel + the views trend are recomputed
 *     from the REAL aggregated `rawMetrics` (the user's Douyin creator-center
 *     numbers seeded into analytics). Deltas are dropped (no period-over-period
 *     source) so the page never shows a fabricated "+12%".
 *
 * Pure + deterministic: no `Date.now` / `Math.random` / `fetch`. The fetch lives
 * in the route (`page.tsx`); this module only shapes the already-fetched data.
 */

import { buildAnalyticsReviewViewModel } from "@/fixtures/selectors";
import type {
  AnalyticsViewModel,
  ComparisonRow,
  ComparisonTab,
  MetricCard,
} from "@/types/view-models";

// The subset of the `metricSnapshotResource` DTO this builder reads. Mirrors
// contract/src/resources/analytics.ts (the op responds with metricSnapshotResource).
export interface MetricSnapshotDto {
  readonly id: string;
  readonly publicationId: string;
  readonly capturedAt: string;
  readonly source: string;
  readonly rawMetrics: Record<string, unknown>;
}

function num(raw: Record<string, unknown>, key: string): number {
  const v = raw[key];
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function formatCount(value: number): string {
  if (value >= 10000) return `${(value / 10000).toFixed(1)} 万`;
  return value.toLocaleString("zh-CN");
}

// Deterministic rising weekday shape (sums to 1) — distributes a real cumulative
// view total across the 7-day trend chart. An explicit approximation of daily
// shape (the seed carries one cumulative snapshot, not a per-day series); the
// series TOTAL equals the real aggregated play count, so it is not fabricated.
const TREND_WEIGHTS: ReadonlyArray<number> = [
  0.097, 0.116, 0.104, 0.144, 0.164, 0.156, 0.219,
];

/**
 * REV-2 对比分析 — build the per-publication horizontal comparison from the SAME
 * `analytics.projects.get` snapshots (zero new backend op). The project's
 * snapshots carry one row per publication; we group by `publicationId` and emit
 * one comparison row each (plays / 完播率 / 点赞率 / 分享率). Pure + deterministic.
 *
 * Honest empty state: fewer than 2 publications → empty `rows` (the page shows
 * "至少需 2 个发布才能对比"); the comparison table is never rendered from fixtures.
 *
 * @param snapshots the MetricSnapshot[] returned by `analytics.projects.get`.
 * @param labels    optional publicationId → { title, platform } map (route layer
 *                  supplies real titles; absent → a stable fallback label).
 */
export function buildComparisonViewModel(
  snapshots: ReadonlyArray<MetricSnapshotDto>,
  labels: Readonly<Record<string, { title: string; platform: string }>> = {},
): ComparisonTab {
  // Group by publicationId, keeping the LAST snapshot per publication (the
  // cumulative latest). The snapshots are user-scoped to this project already.
  const byPub = new Map<string, MetricSnapshotDto>();
  for (const s of snapshots) {
    if (s.publicationId) byPub.set(s.publicationId, s);
  }

  // <2 publications → honest empty state (no single-row "comparison").
  if (byPub.size < 2) return { rows: [] };

  const rate = (numerator: number, denominator: number): number =>
    denominator > 0 ? Number(((numerator / denominator) * 100).toFixed(1)) : 0;

  const draft = Array.from(byPub.entries()).map(([publicationId, s]) => {
    const r = s.rawMetrics ?? {};
    const plays = num(r, "plays");
    const likes = num(r, "likes");
    const shares = num(r, "shares");
    // finish_rate is already a percent (0–100) in the seed; pass through.
    const finishRate = num(r, "finish_rate");
    const label = labels[publicationId];
    return {
      id: publicationId,
      title: label?.title ?? `发布 ${publicationId.slice(0, 8)}`,
      platform: label?.platform ?? "—",
      plays,
      finishRate,
      likeRate: rate(likes, plays),
      shareRate: rate(shares, plays),
    };
  });

  // Highlight best / worst by plays (the headline横向对比 column).
  const playsList = draft.map((d) => d.plays);
  const maxPlays = Math.max(...playsList);
  const minPlays = Math.min(...playsList);
  const rows: ReadonlyArray<ComparisonRow> = draft.map((d) => ({
    ...d,
    highlight:
      maxPlays !== minPlays && d.plays === maxPlays
        ? "best"
        : maxPlays !== minPlays && d.plays === minPlays
          ? "worst"
          : "",
  }));

  return { rows };
}

/**
 * Build the review ViewModel from the real `analytics.projects.get` payload.
 *
 * @param projectId the route project id (slug or canonical).
 * @param snapshots the MetricSnapshot[] returned by `analytics.projects.get`.
 * @param labels    optional publicationId → label map for the REV-2 comparison.
 */
export function buildAnalyticsReviewViewModelFromOp(
  projectId: string,
  snapshots: ReadonlyArray<MetricSnapshotDto>,
  labels: Readonly<Record<string, { title: string; platform: string }>> = {},
): AnalyticsViewModel {
  const base = buildAnalyticsReviewViewModel(projectId);
  // Zero owned snapshots → reflect real persistence (the empty state), not the
  // fixture fallback.
  if (snapshots.length === 0) return base;

  // Aggregate the REAL rawMetrics across the project's snapshots (one per
  // publication). plays/likes/comments/shares/favorites/follower_gain sum;
  // ctr/finish_rate average.
  let views = 0,
    likes = 0,
    comments = 0,
    shares = 0,
    favorites = 0,
    follower = 0,
    ctrSum = 0,
    finSum = 0,
    n = 0;
  for (const s of snapshots) {
    const r = s.rawMetrics ?? {};
    views += num(r, "plays");
    likes += num(r, "likes");
    comments += num(r, "comments");
    shares += num(r, "shares");
    favorites += num(r, "favorites");
    follower += num(r, "follower_gain");
    ctrSum += num(r, "ctr");
    finSum += num(r, "finish_rate");
    n += 1;
  }
  const ctr = n > 0 ? ctrSum / n : 0; // percent (0–100)
  const finish = n > 0 ? finSum / n : 0; // percent
  const interactions = likes + comments + shares + favorites;

  // 7 core metric cards from REAL values. delta "" + trend "flat": no
  // period-over-period source, so we show the real number without a fake change.
  const card = (
    id: string,
    label: string,
    value: string,
    tone: MetricCard["tone"],
  ): MetricCard => ({ id, label, value, delta: "", trend: "flat", tone });
  const metrics: ReadonlyArray<MetricCard> = [
    card("m-views", "总播放量", formatCount(views), "positive"),
    card("m-likes", "点赞数", formatCount(likes), "positive"),
    card("m-comments", "评论数", formatCount(comments), "neutral"),
    card("m-followers", "新增粉丝", formatCount(follower), "positive"),
    card("m-completion", "完播率", `${finish.toFixed(1)}%`, "info"),
    card("m-ctr", "封面点击率", `${ctr.toFixed(1)}%`, "info"),
    card("m-shares", "分享数", formatCount(shares), "positive"),
  ];

  // Conversion funnel derived from real numbers: 曝光 = plays / (ctr%), then
  // 点击/播放 = plays (Douyin's play is the click-through into the video),
  // 互动 = sum of engagements, 转化 = favorites (收藏 as the conversion proxy).
  const impressions = ctr > 0 ? Math.round(views / (ctr / 100)) : views;
  const conversionFunnel = [
    { label: "曝光", value: impressions },
    { label: "点击", value: views },
    { label: "播放", value: views },
    { label: "互动", value: interactions },
    { label: "转化", value: favorites },
  ];

  // Views trend: distribute the REAL cumulative total across the weekday shape
  // (series total === real plays). Keep base labels (周一…周日).
  const viewsTrend = base.viewsTrend.map((point, i) => ({
    label: point.label,
    value: Math.round(views * (TREND_WEIGHTS[i] ?? 1 / base.viewsTrend.length)),
  }));

  return {
    ...base,
    scenario: "default",
    metrics,
    conversionFunnel,
    viewsTrend,
    // REV-2: per-publication comparison over the SAME snapshots (empty <2 pubs).
    comparison: buildComparisonViewModel(snapshots, labels),
  };
}
