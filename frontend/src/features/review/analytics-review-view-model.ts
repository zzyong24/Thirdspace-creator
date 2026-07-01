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
import { isFixtureAnalyticsProject } from "@/fixtures/selectors/review";
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

// 播放趋势(真日级序列) — T-035b 诚实化。
//
// 之前用固定 weekday 权重把「一个累计快照」摊成一条假的 7 天曲线(总和=真播放,
// 但每天的形状是编的)。宪法 §8 不摆假:这里改为按快照的真实采集日 (`capturedAt`
// 的日历天) 分组,每天对当天各发布最新一帧的 views 求和 —— 这是真实采集事件产生的
// 日级序列。
//  - ≥2 个采集日 → mode "daily",画真折线(标签 MM-DD)。
//  - 仅 1 个采集日 → mode "single",单点 + 「需多次采集」提示(不铺假曲线)。
//  - 无快照 → mode "empty"(上游走空态)。
function dayKey(iso: string): string {
  // 取 ISO 时间戳的日历天 (UTC 切分即可,趋势只需稳定分桶,不做时区精修)。
  return iso.slice(0, 10);
}

function shortDayLabel(dayKeyStr: string): string {
  // "2026-06-12" → "06-12"
  const parts = dayKeyStr.split("-");
  return parts.length === 3 ? `${parts[1]}-${parts[2]}` : dayKeyStr;
}

/**
 * 从真实快照推导播放趋势(真日级)。按 `capturedAt` 的日历天分组,每天对「当天每个
 * 发布的最新一帧」的 views 求和,产出按日升序的序列 + 数据形态标记。
 */
function buildRealViewsTrend(
  snapshots: ReadonlyArray<MetricSnapshotDto>,
): {
  trend: ReadonlyArray<{ label: string; value: number }>;
  mode: "daily" | "single" | "empty";
} {
  const playsOfRaw = (r: Record<string, unknown>): number =>
    num(r, "views") || num(r, "plays");

  // day → (publicationId → latest snapshot that day),避免当天多帧对同一发布重复计数。
  const byDay = new Map<string, Map<string, MetricSnapshotDto>>();
  for (const s of snapshots) {
    if (!s.publicationId || !s.capturedAt) continue;
    const key = dayKey(s.capturedAt);
    let pubMap = byDay.get(key);
    if (!pubMap) {
      pubMap = new Map();
      byDay.set(key, pubMap);
    }
    const prev = pubMap.get(s.publicationId);
    if (!prev || s.capturedAt > prev.capturedAt) pubMap.set(s.publicationId, s);
  }

  const days = [...byDay.keys()].sort();
  if (days.length === 0) return { trend: [], mode: "empty" };

  const trend = days.map((day) => {
    let sum = 0;
    for (const s of byDay.get(day)!.values()) sum += playsOfRaw(s.rawMetrics ?? {});
    return { label: shortDayLabel(day), value: sum };
  });

  return { trend, mode: days.length >= 2 ? "daily" : "single" };
}

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
  // Zero owned snapshots → reflect real persistence.
  //  - REAL (non-fixture) project: 该作品还没拉到任何明细快照 → 诚实空态。清空
  //    metrics/趋势/漏斗(页面据此渲染「暂无复盘数据」引导去任务中心跑「拉明细」),
  //    绝不显 fixture 的 7 张 0 卡 + 假 delta(宪法 §8 / 任务 ②)。
  //  - Canonical demo project: 保留 fixture 演示基座(有 canonical 快照演示用)。
  if (snapshots.length === 0) {
    if (isFixtureAnalyticsProject(projectId)) return base;
    return {
      ...base,
      scenario: "empty",
      metrics: [],
      viewsTrend: [],
      viewsTrendMode: "empty",
      conversionFunnel: [],
      audienceProfile: [],
      audienceSource: [],
      retentionCurve: [],
      keyMoments: [],
      topPublished: [],
    };
  }

  // Dedup to ONE snapshot per publication (the latest by capturedAt) BEFORE
  // aggregating. A publication carries a time-series of snapshots (每次采集一条);
  // summing them all would 6–8x over-count播放量. This mirrors the proven
  // dashboard rollup (analytics.repository getDashboardRollup): 取每发布最新一条,
  // 再对计数求和 / 对 ctr·finish_rate 求均。
  const latestByPub = new Map<string, MetricSnapshotDto>();
  for (const s of snapshots) {
    if (!s.publicationId) continue;
    const prev = latestByPub.get(s.publicationId);
    if (!prev || s.capturedAt > prev.capturedAt) latestByPub.set(s.publicationId, s);
  }
  const latest = [...latestByPub.values()];

  // 播放量键名归一(数据底座 §1.4):真实抖音 ingestion 与演示 fixture 键名不同 ——
  // 一侧写 `views`,另一侧写 `plays`,二者本不并存。读侧优先 `views`,缺失回退 `plays`。
  const playsOf = (r: Record<string, unknown>): number => num(r, "views") || num(r, "plays");

  // Aggregate the REAL rawMetrics across the project's LATEST-per-publication
  // snapshots. plays/likes/comments/shares/favorites/follower_gain sum;
  // ctr/finish_rate average across the snapshots that actually carry them
  // (views-keyed 采集帧无 ctr/finish_rate — 用其求均会把真值稀释为 0)。
  let views = 0,
    likes = 0,
    comments = 0,
    shares = 0,
    favorites = 0,
    follower = 0,
    ctrSum = 0,
    ctrN = 0,
    finSum = 0,
    finN = 0;
  for (const s of latest) {
    const r = s.rawMetrics ?? {};
    views += playsOf(r);
    likes += num(r, "likes");
    comments += num(r, "comments");
    shares += num(r, "shares");
    favorites += num(r, "favorites");
    follower += num(r, "follower_gain");
    if ("ctr" in r) {
      ctrSum += num(r, "ctr");
      ctrN += 1;
    }
    if ("finish_rate" in r) {
      finSum += num(r, "finish_rate");
      finN += 1;
    }
  }
  const ctr = ctrN > 0 ? ctrSum / ctrN : 0; // percent (0–100); 0 = 无采集帧携带
  const finish = finN > 0 ? finSum / finN : 0; // percent; 0 = 无采集帧携带
  const interactions = likes + comments + shares + favorites;

  // 7 core metric cards from REAL values. delta "" + trend "flat": no
  // period-over-period source, so we show the real number without a fake change.
  const card = (
    id: string,
    label: string,
    value: string,
    tone: MetricCard["tone"],
  ): MetricCard => ({ id, label, value, delta: "", trend: "flat", tone });
  // 完播率 / 封面点击率:仅当最新采集帧真的携带该字段才显真值;否则「暂无」——
  // 该作品的最新采集是 views-only 帧(无 ctr/finish_rate),不编「0.0%」(读起来像
  // 「0% 完播」的假值)。诚实标暂无 → 去任务中心跑「拉明细」采集。
  const metrics: ReadonlyArray<MetricCard> = [
    card("m-views", "总播放量", formatCount(views), "positive"),
    card("m-likes", "点赞数", formatCount(likes), "positive"),
    card("m-comments", "评论数", formatCount(comments), "neutral"),
    card("m-followers", "新增粉丝", formatCount(follower), "positive"),
    card("m-completion", "完播率", finN > 0 ? `${finish.toFixed(1)}%` : "暂无", "info"),
    card("m-ctr", "封面点击率", ctrN > 0 ? `${ctr.toFixed(1)}%` : "暂无", "info"),
    card("m-shares", "分享数", formatCount(shares), "positive"),
  ];

  // Conversion funnel from REAL numbers ONLY (§8 不摆假). 抖音 exposes 播放(plays)
  // as the entry event — 播放即点进,没有独立的「点击」,所以不设冗余的「点击」段。
  // 「曝光」(impressions)只有在最新采集帧真的带「封面点击率」(ctr) 时才由 曝光=播放/ctr
  // 推导出来;没有 ctr 就不摆一个 = 播放数的假「曝光」段(那等于假装我们有曝光数据)。
  // 互动 = 点赞+评论+分享+收藏之和;转化 = 收藏(favorites,作为转化代理)。
  const conversionFunnel = [
    ...(ctr > 0
      ? [{ label: "曝光", value: Math.round(views / (ctr / 100)) }]
      : []),
    { label: "播放", value: views },
    { label: "互动", value: interactions },
    { label: "转化", value: favorites },
  ];

  // Views trend: REAL day-level series grouped by capture date (T-035b). 单快照
  // 项目 → 单点 + mode "single"(页面显「需多次采集」),绝不用假 weekday 权重铺假曲线。
  const { trend: viewsTrend, mode: viewsTrendMode } = buildRealViewsTrend(snapshots);

  return {
    ...base,
    scenario: "default",
    metrics,
    conversionFunnel,
    viewsTrend,
    viewsTrendMode,
    // REV-2: per-publication comparison over the SAME snapshots (empty <2 pubs).
    comparison: buildComparisonViewModel(snapshots, labels),
  };
}
