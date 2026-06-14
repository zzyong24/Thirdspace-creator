/**
 * Analytics & Review page (Task 18 / page-specs §10).
 *
 * The `project-workspace` Header mode landing page for the Review
 * stage. Composes:
 *  - an `AnalyticsTabs` row of page tabs,
 *  - a `MainAnalytics` block with four regions in the spec order
 *      CoreMetricsRow (7 MetricCards in a single row) →
 *      PrimaryCharts (ViewsTrendChart as a line +
 *        ConversionFunnel as a triangle / funnel) →
 *      SecondaryCharts (AudienceProfile donut +
 *        AudienceSource horizontal bars +
 *        RetentionCurve) →
 *      KeyMomentsSection.
 *  - a `RightRail` with two cards in the locked order
 *      AIAnalysisCard → ReviewHistoryCard.
 *
 * Layout invariants (locked by page-specs §10):
 *  - exactly SEVEN CoreMetricsRow cards in a single row,
 *  - PrimaryCharts expose two distinct visual shapes (line vs.
 *    funnel) — no chart type changes, no new metrics introduced,
 *  - the AI Analysis card lives inside the right rail (NOT a
 *    modal / overlay layer),
 *  - every chart provides a sr-only textual summary so the data
 *    is not conveyed by color alone (D-007).
 *
 * The page is a Server Component. It does not own a Sidebar or a
 * TopHeader — those live in `(creator)/layout.tsx` and are mounted
 * once for the whole route group. The page just provides the content
 * slot.
 */

import * as React from "react";

import { ChartFrame } from "@/components/analytics/chart-frame";
import { MetricCard } from "@/components/project/metric-card";
import { SectionCard } from "@/components/project/section-card";
import { canonicalDataset, getProjectById } from "@/fixtures/canonical";
import type { MetricCard as MetricCardVm } from "@/types/view-models";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface AnalyticsReviewPageProps {
  /** The id of the project to render. */
  readonly projectId: string;
}

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
// Locked default core metrics (7 cards, single row, in spec order)
// ---------------------------------------------------------------------------

const CORE_METRICS: ReadonlyArray<MetricCardVm> = [
  {
    id: "m-views",
    label: "总播放量",
    value: "2.8 万",
    delta: "+12%",
    trend: "up",
    tone: "positive",
  },
  {
    id: "m-likes",
    label: "点赞数",
    value: "2,120",
    delta: "+8%",
    trend: "up",
    tone: "positive",
  },
  {
    id: "m-comments",
    label: "评论数",
    value: "312",
    delta: "+4%",
    trend: "up",
    tone: "neutral",
  },
  {
    id: "m-followers",
    label: "新增粉丝",
    value: "486",
    delta: "+22",
    trend: "up",
    tone: "positive",
  },
  {
    id: "m-completion",
    label: "完播率",
    value: "42%",
    delta: "-3%",
    trend: "down",
    tone: "negative",
  },
  {
    id: "m-ctr",
    label: "封面点击率",
    value: "3.8%",
    delta: "+0.4%",
    trend: "up",
    tone: "info",
  },
  {
    id: "m-shares",
    label: "分享数",
    value: "168",
    delta: "+12%",
    trend: "up",
    tone: "positive",
  },
];

// ---------------------------------------------------------------------------
// Locked views trend (7-day series, line shape)
// ---------------------------------------------------------------------------

const VIEWS_TREND: ReadonlyArray<{ readonly label: string; readonly value: number }> = [
  { label: "周一", value: 1840 },
  { label: "周二", value: 2210 },
  { label: "周三", value: 1980 },
  { label: "周四", value: 2740 },
  { label: "周五", value: 3120 },
  { label: "周六", value: 2960 },
  { label: "周日", value: 3380 },
];

// ---------------------------------------------------------------------------
// Locked conversion funnel (5 stages, monotonically decreasing)
// ---------------------------------------------------------------------------

const CONVERSION_FUNNEL: ReadonlyArray<{ readonly label: string; readonly value: number }> = [
  { label: "曝光", value: 18420 },
  { label: "点击", value: 7120 },
  { label: "播放", value: 4380 },
  { label: "互动", value: 1480 },
  { label: "转化", value: 386 },
];

// ---------------------------------------------------------------------------
// Locked default audience profile / source (fallback when the project
// has no canonical audience snapshots — keeps the secondary charts
// non-empty per the test invariant).
// ---------------------------------------------------------------------------

const DEFAULT_AUDIENCE_PROFILE: ReadonlyArray<{
  readonly label: string;
  readonly value: number;
}> = [
  { label: "18-24", value: 0.22 },
  { label: "25-34", value: 0.41 },
  { label: "35-44", value: 0.25 },
  { label: "45+", value: 0.12 },
];

const DEFAULT_AUDIENCE_SOURCE: ReadonlyArray<{
  readonly label: string;
  readonly value: number;
}> = [
  { label: "推荐流", value: 0.55 },
  { label: "搜索", value: 0.2 },
  { label: "关注更新", value: 0.25 },
];

// ---------------------------------------------------------------------------
// Locked default retention curve (fallback when the project has no
// canonical retention points — keeps the chart non-empty).
// ---------------------------------------------------------------------------

const DEFAULT_RETENTION_CURVE: ReadonlyArray<{
  readonly label: string;
  readonly value: number;
}> = [
  { label: "0s", value: 1 },
  { label: "30s", value: 0.82 },
  { label: "1m", value: 0.78 },
  { label: "3m", value: 0.6 },
  { label: "5m", value: 0.55 },
  { label: "10m", value: 0.42 },
];

// ---------------------------------------------------------------------------
// Locked default key moments (fallback when no canonical review
// insights exist for the project).
// ---------------------------------------------------------------------------

interface KeyMoment {
  readonly id: string;
  readonly label: string;
  readonly value: string;
}

const DEFAULT_KEY_MOMENTS: ReadonlyArray<KeyMoment> = [
  { id: "km-1", label: "完播高峰", value: "00:30 — 01:30" },
  { id: "km-2", label: "互动峰值", value: "评论集中在 04:00" },
  { id: "km-3", label: "流失节点", value: "10:00 后留存下降 18%" },
];

// ---------------------------------------------------------------------------
// Locked default top published list (matches the 4-card band shown in
// the Analytics & Review reference PNG). Falls back when the project
// has no canonical publications (most page-spec projects are still in
// the publishing → review transition).
// ---------------------------------------------------------------------------

interface TopPublished {
  readonly id: string;
  readonly title: string;
  readonly platform: string;
  readonly views: string;
  readonly tone: "primary" | "compact";
}

const DEFAULT_TOP_PUBLISHED: ReadonlyArray<TopPublished> = [
  {
    id: "tp-1",
    title: "AI Native Browser 时代：原生 AI 体验如何重构入口",
    platform: "抖音",
    views: "12.4 万播放",
    tone: "primary",
  },
  {
    id: "tp-2",
    title: "浏览器 = AI 助理入口：从插件到原生",
    platform: "小红书",
    views: "8.2 万曝光",
    tone: "compact",
  },
  {
    id: "tp-3",
    title: "深度评测：Atlas 与 Comet 谁更强",
    platform: "B 站",
    views: "5.6 万播放",
    tone: "compact",
  },
  {
    id: "tp-4",
    title: "从 Chrome 插件到原生 AI 体验",
    platform: "YouTube",
    views: "4.3 万播放",
    tone: "compact",
  },
];

// ---------------------------------------------------------------------------
// Locked default AI analysis + review history (fallback)
// ---------------------------------------------------------------------------

interface AiAnalysisItem {
  readonly id: string;
  readonly title: string;
  readonly body: string;
}

const DEFAULT_AI_ANALYSIS: ReadonlyArray<AiAnalysisItem> = [
  {
    id: "ai-1",
    title: "内容表现",
    body: "首期完播率高于平均 12 个百分点，开场钩子表现稳定。",
  },
  {
    id: "ai-2",
    title: "建议动作",
    body: "建议在小红书复盘封面方案，并将音频电平提升至 -16 LUFS。",
  },
];

interface ReviewHistoryItem {
  readonly id: string;
  readonly title: string;
  readonly completedAt: string;
  readonly tone: "positive" | "warning" | "neutral";
}

const DEFAULT_REVIEW_HISTORY: ReadonlyArray<ReviewHistoryItem> = [
  {
    id: "rh-1",
    title: "首期发布复盘",
    completedAt: "2026-04-28",
    tone: "positive",
  },
  {
    id: "rh-2",
    title: "脚本阶段复盘",
    completedAt: "2026-04-10",
    tone: "neutral",
  },
];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function AnalyticsReviewPage({ projectId }: AnalyticsReviewPageProps) {
  // The URL `[projectId]` segment can be either a canonical id
  // (`project-ainativebrowser`) or a kebab slug (`ai-native-browser`).
  // The visual route fixture uses the slug form, so resolve once up
  // front so every downstream selector hits the canonical dataset.
  const resolvedProjectId = resolveProjectIdSlug(projectId);
  const project = getProjectById(resolvedProjectId);
  return (
    <main
      data-app="creatoros"
      data-page="analytics-review"
      data-project-id={resolvedProjectId}
      className="flex flex-col gap-section-gap"
    >
      <AnalyticsTabs tabs={ANALYTICS_TABS} />
      <div
        data-slot="analytics-grid"
        className="grid grid-cols-1 gap-card-gap lg:grid-cols-[minmax(0,1fr)_350px]"
      >
        <div
          data-slot="analytics-main-column"
          className="flex flex-col gap-3"
        >
          <CoreMetricsRow metrics={project ? CORE_METRICS : CORE_METRICS} />
          <PrimaryCharts />
          <SecondaryCharts
            audienceProfile={pickAudienceProfile(resolvedProjectId)}
            audienceSource={pickAudienceSource(resolvedProjectId)}
            retentionCurve={pickRetentionCurve(resolvedProjectId)}
          />
          <KeyMomentsSection moments={pickKeyMoments(resolvedProjectId)} />
          <TopPublishedList items={pickTopPublished(resolvedProjectId)} />
        </div>
        <div
          data-slot="analytics-right-rail"
          className="flex flex-col gap-card-gap"
        >
          <AIAnalysisCard items={pickAiAnalysis(resolvedProjectId)} />
          <ReviewHistoryCard items={pickReviewHistory(resolvedProjectId)} />
        </div>
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------
// AnalyticsTabs — top of page
// ---------------------------------------------------------------------------

function AnalyticsTabs({
  tabs,
}: {
  tabs: ReadonlyArray<{ readonly id: string; readonly label: string }>;
}) {
  return (
    <nav
      data-slot="analytics-tabs"
      aria-label="数据复盘阶段"
      className="flex flex-wrap items-center gap-2 border-b border-border pb-2"
    >
      {tabs.map((tab, index) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          data-slot="page-tabs"
          data-tab-id={tab.id}
          data-pressed={index === 0}
          className="inline-flex h-8 items-center rounded-full border border-border bg-surface px-3 text-xs font-medium text-foreground data-[pressed=true]:border-brand/60 data-[pressed=true]:bg-brand-soft data-[pressed=true]:text-brand"
        >
          {tab.label}
        </button>
      ))}
    </nav>
  );
}

// ---------------------------------------------------------------------------
// CoreMetricsRow — 7 cards in a single row
// ---------------------------------------------------------------------------

function CoreMetricsRow({ metrics }: { metrics: ReadonlyArray<MetricCardVm> }) {
  return (
    <section
      data-slot="core-metrics-row"
      aria-label="核心指标"
      className="grid grid-cols-1 gap-card-gap sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7"
    >
      {metrics.map((metric) => (
        <MetricCard
          key={metric.id}
          id={metric.id}
          label={metric.label}
          value={metric.value}
          delta={metric.delta}
          trend={metric.trend}
          tone={metric.tone}
        />
      ))}
    </section>
  );
}

// ---------------------------------------------------------------------------
// PrimaryCharts — ViewsTrendChart (line) + ConversionFunnel (funnel)
// ---------------------------------------------------------------------------

function PrimaryCharts() {
  return (
    <div
      data-slot="primary-charts"
      className="grid grid-cols-1 gap-card-gap lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]"
    >
      <ChartFrame
        title="播放趋势"
        description="近 7 天每日播放量"
        summary={`播放趋势：${VIEWS_TREND[0]?.label ?? ""} ${VIEWS_TREND[0]?.value.toLocaleString() ?? ""}，${VIEWS_TREND[VIEWS_TREND.length - 1]?.label ?? ""} ${VIEWS_TREND[VIEWS_TREND.length - 1]?.value.toLocaleString() ?? ""}，整体上升。`}
        trend={VIEWS_TREND}
        slot="views-trend-chart"
        shape="line"
        testId="views-trend-chart"
      />
      <article
        data-slot="conversion-funnel"
        data-shape="funnel"
        data-testid="conversion-funnel"
        className="flex flex-col gap-1 rounded-2xl border border-border bg-surface p-3 shadow-card"
      >
        <header className="flex flex-col gap-1">
          <h3 className="text-md font-semibold text-foreground">转化漏斗</h3>
          <p className="text-xs text-muted-foreground">从曝光到转化的逐级流失</p>
        </header>
        <FunnelChart data={CONVERSION_FUNNEL} />
        <ul
          data-slot="conversion-funnel-list"
          className="flex flex-col gap-0.5"
          aria-label="转化漏斗数据"
        >
          {CONVERSION_FUNNEL.map((row) => (
            <li
              key={row.label}
              data-slot="conversion-funnel-row"
              data-funnel-label={row.label}
              className="flex items-center justify-between text-[11px]"
            >
              <span className="text-muted-foreground">{row.label}</span>
              <span className="font-medium tabular-nums text-foreground">
                {row.value.toLocaleString()}
              </span>
            </li>
          ))}
        </ul>
        <p data-slot="chart-summary" className="sr-only">
          转化漏斗：曝光 {CONVERSION_FUNNEL[0]?.value.toLocaleString() ?? ""} → 点击 {CONVERSION_FUNNEL[1]?.value.toLocaleString() ?? ""} → 播放 {CONVERSION_FUNNEL[2]?.value.toLocaleString() ?? ""} → 互动 {CONVERSION_FUNNEL[3]?.value.toLocaleString() ?? ""} → 转化 {CONVERSION_FUNNEL[4]?.value.toLocaleString() ?? ""}，整体转化率 {funnelConversionRate()}%。
        </p>
      </article>
    </div>
  );
}

function FunnelChart({
  data,
}: {
  data: ReadonlyArray<{ readonly label: string; readonly value: number }>;
}) {
  const max = Math.max(...data.map((row) => row.value), 1);
  return (
    <svg
      data-slot="funnel-svg"
      viewBox="0 0 200 100"
      preserveAspectRatio="none"
      aria-hidden="true"
      className="h-16 w-full"
    >
      {data.map((row, index) => {
        const ratio = row.value / max;
        const width = 40 + ratio * 160;
        const x = (200 - width) / 2;
        const y = index * 13;
        return (
          <polygon
            key={row.label}
            points={`${x},${y} ${x + width},${y} ${x + width - 6},${y + 11} ${x + 6},${y + 11}`}
            fill="var(--color-brand-soft)"
            stroke="var(--color-brand)"
            strokeWidth={0.6}
          />
        );
      })}
    </svg>
  );
}

function funnelConversionRate(): string {
  const first = CONVERSION_FUNNEL[0]?.value ?? 0;
  const last = CONVERSION_FUNNEL[CONVERSION_FUNNEL.length - 1]?.value ?? 0;
  if (first === 0) return "0";
  return ((last / first) * 100).toFixed(1);
}

// ---------------------------------------------------------------------------
// SecondaryCharts — AudienceProfile (donut) + AudienceSource
// (horizontal bars) + RetentionCurve
// ---------------------------------------------------------------------------

function SecondaryCharts({
  audienceProfile,
  audienceSource,
  retentionCurve,
}: {
  audienceProfile: ReadonlyArray<{ readonly label: string; readonly value: number }>;
  audienceSource: ReadonlyArray<{ readonly label: string; readonly value: number }>;
  retentionCurve: ReadonlyArray<{ readonly label: string; readonly value: number }>;
}) {
  return (
    <div
      data-slot="secondary-charts"
      className="grid grid-cols-1 gap-card-gap md:grid-cols-3"
    >
      <SectionCard
        title="观众画像"
        description="年龄段分布"
        contentClassName="flex flex-col gap-1.5"
        className="[--card-spacing:--spacing(3)]"
      >
        <DonutChart
          slot="audience-profile"
          shape="donut"
          data={audienceProfile}
          summary={summariseDistribution("观众画像", audienceProfile)}
        />
        <ul
          data-slot="audience-profile-list"
          className="mt-2 flex flex-col gap-0.5"
          aria-label="观众画像数据"
        >
          {audienceProfile.map((row) => (
            <li
              key={row.label}
              data-slot="audience-profile-row"
              data-profile-label={row.label}
              className="flex items-center justify-between text-[11px]"
            >
              <span className="text-muted-foreground">{row.label}</span>
              <span className="font-medium tabular-nums text-foreground">
                {(row.value * 100).toFixed(0)}%
              </span>
            </li>
          ))}
        </ul>
      </SectionCard>

      <SectionCard
        title="观众来源"
        description="按渠道拆分"
        contentClassName="flex flex-col gap-1.5"
        className="[--card-spacing:--spacing(3)]"
      >
        <HorizontalBarsChart
          slot="audience-source"
          shape="horizontal-bars"
          data={audienceSource}
          summary={summariseDistribution("观众来源", audienceSource)}
        />
        <ul
          data-slot="audience-source-list"
          className="mt-2 flex flex-col gap-0.5"
          aria-label="观众来源数据"
        >
          {audienceSource.map((row) => (
            <li
              key={row.label}
              data-slot="audience-source-row"
              data-source-label={row.label}
              className="flex items-center justify-between text-[11px]"
            >
              <span className="text-muted-foreground">{row.label}</span>
              <span className="font-medium tabular-nums text-foreground">
                {(row.value * 100).toFixed(0)}%
              </span>
            </li>
          ))}
        </ul>
      </SectionCard>

      <SectionCard
        title="留存曲线"
        description="完播随时间变化"
        contentClassName="flex flex-col gap-1.5"
        className="[--card-spacing:--spacing(3)]"
      >
        <RetentionCurveChart
          slot="retention-curve"
          shape="retention-curve"
          data={retentionCurve}
          summary={summariseRetention(retentionCurve)}
        />
        <ul
          data-slot="retention-curve-list"
          className="mt-2 flex flex-col gap-0.5"
          aria-label="留存曲线数据"
        >
          {retentionCurve.map((row) => (
            <li
              key={row.label}
              data-slot="retention-curve-row"
              data-position-label={row.label}
              className="flex items-center justify-between text-[11px]"
            >
              <span className="text-muted-foreground">{row.label}</span>
              <span className="font-medium tabular-nums text-foreground">
                {(row.value * 100).toFixed(0)}%
              </span>
            </li>
          ))}
        </ul>
      </SectionCard>
    </div>
  );
}

function DonutChart({
  slot,
  shape,
  data,
  summary,
}: {
  slot: string;
  shape: string;
  data: ReadonlyArray<{ readonly label: string; readonly value: number }>;
  summary: string;
}) {
  const total = data.reduce((sum, row) => sum + row.value, 0) || 1;
  // Pre-compute start offsets immutably so the render body never
  // reassigns a closure variable (eslint react-hooks/immutability).
  const segments = data.map((row, index) => {
    const fraction = row.value / total;
    const start = data
      .slice(0, index)
      .reduce((acc, prev) => acc + prev.value / total, 0);
    return { row, fraction, start };
  });
  return (
    <figure
      role="figure"
      data-slot={slot}
      data-shape={shape}
      aria-label={slot}
      className="flex flex-col gap-2"
    >
      <svg
        data-slot={`${slot}-svg`}
        viewBox="0 0 42 42"
        aria-hidden="true"
        className="h-20 w-20 self-center"
      >
        {segments.map(({ row, fraction, start }) => (
          <circle
            key={row.label}
            cx="21"
            cy="21"
            r="15.91549430918954"
            fill="transparent"
            stroke="var(--color-brand)"
            strokeWidth="6"
            strokeDasharray={`${fraction * 100} ${100 - fraction * 100}`}
            strokeDashoffset={25 - start * 100}
          />
        ))}
      </svg>
      <p data-slot="chart-summary" className="sr-only">
        {summary}
      </p>
    </figure>
  );
}

function HorizontalBarsChart({
  slot,
  shape,
  data,
  summary,
}: {
  slot: string;
  shape: string;
  data: ReadonlyArray<{ readonly label: string; readonly value: number }>;
  summary: string;
}) {
  const max = Math.max(...data.map((row) => row.value), 1);
  return (
    <figure
      role="figure"
      data-slot={slot}
      data-shape={shape}
      aria-label={slot}
      className="flex flex-col gap-2"
    >
      <svg
        data-slot={`${slot}-svg`}
        viewBox={`0 0 100 ${data.length * 12}`}
        aria-hidden="true"
        className="h-20 w-full"
      >
        {data.map((row, index) => {
          const ratio = row.value / max;
          const y = index * 12;
          return (
            <g key={row.label}>
              <rect
                x={0}
                y={y + 2}
                width={ratio * 100}
                height={8}
                fill="var(--color-brand)"
                rx={1}
              />
              <rect
                x={ratio * 100}
                y={y + 2}
                width={100 - ratio * 100}
                height={8}
                fill="var(--color-border)"
                rx={1}
              />
            </g>
          );
        })}
      </svg>
      <p data-slot="chart-summary" className="sr-only">
        {summary}
      </p>
    </figure>
  );
}

function RetentionCurveChart({
  slot,
  shape,
  data,
  summary,
}: {
  slot: string;
  shape: string;
  data: ReadonlyArray<{ readonly label: string; readonly value: number }>;
  summary: string;
}) {
  const path = buildRetentionPath(data, 24);
  return (
    <figure
      role="figure"
      data-slot={slot}
      data-shape={shape}
      aria-label={slot}
      className="flex flex-col gap-2"
    >
      <svg
        data-slot={`${slot}-svg`}
        viewBox="0 0 100 24"
        preserveAspectRatio="none"
        aria-hidden="true"
        className="h-20 w-full"
      >
        <path
          d={path}
          fill="none"
          stroke="var(--color-brand)"
          strokeWidth={1.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
      <p data-slot="chart-summary" className="sr-only">
        {summary}
      </p>
    </figure>
  );
}

function buildRetentionPath(
  data: ReadonlyArray<{ readonly label: string; readonly value: number }>,
  height: number,
): string {
  if (data.length === 0) return "";
  const padding = 2;
  const width = 100;
  const range = 1; // retention is always 0..1
  const step = (width - padding * 2) / (data.length - 1 || 1);
  const points = data.map((row, index) => {
    const x = padding + step * index;
    const y = padding + (1 - row.value / range) * (height - padding * 2);
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });
  return `M ${points.join(" L ")}`;
}

function summariseDistribution(
  name: string,
  data: ReadonlyArray<{ readonly label: string; readonly value: number }>,
): string {
  if (data.length === 0) return `${name}：暂无数据。`;
  const top = data.reduce(
    (acc, row) => (row.value > acc.value ? row : acc),
    data[0]!,
  );
  return `${name}：最高 ${top.label} 占 ${(top.value * 100).toFixed(0)}%。`;
}

function summariseRetention(
  data: ReadonlyArray<{ readonly label: string; readonly value: number }>,
): string {
  if (data.length === 0) return "留存曲线：暂无数据。";
  const first = data[0]?.value ?? 0;
  const last = data[data.length - 1]?.value ?? 0;
  return `留存曲线：从 ${(first * 100).toFixed(0)}% 降至 ${(last * 100).toFixed(0)}%。`;
}

// ---------------------------------------------------------------------------
// KeyMomentsSection — bottom of main column
// ---------------------------------------------------------------------------

function KeyMomentsSection({
  moments,
}: {
  moments: ReadonlyArray<KeyMoment>;
}) {
  const list = moments.length > 0 ? moments : DEFAULT_KEY_MOMENTS;
  return (
    <section data-slot="key-moments-section" aria-label="关键时刻">
      <div
        data-slot="key-moments-card"
        className="flex flex-col gap-1 rounded-xl border border-border bg-surface p-3 shadow-card"
      >
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-0">
            <h3 className="text-[13px] font-semibold text-foreground">
              关键时刻表现
            </h3>
          </div>
        </div>
        <ul
          data-slot="key-moments-list"
          className="flex flex-col gap-0.5"
          aria-label="关键时刻列表"
        >
          {list.map((moment) => (
            <li
              key={moment.id}
              data-slot="key-moment-row"
              data-moment-id={moment.id}
              className="flex items-center justify-between rounded-md border border-border bg-surface-subtle px-2.5 py-0.5 text-[11px]"
            >
              <span className="font-medium text-foreground">{moment.label}</span>
              <span className="font-mono tabular-nums text-muted-foreground">
                {moment.value}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// TopPublishedList — band of 4 publication cards shown at the bottom
// of the main column. Mirrors the "热门作品发布列表" row in the
// Analytics & Review reference PNG.
// ---------------------------------------------------------------------------

function TopPublishedList({ items }: { items: ReadonlyArray<TopPublished> }) {
  const list = items.length > 0 ? items : DEFAULT_TOP_PUBLISHED;
  return (
    <section
      data-slot="top-published-section"
      aria-label="热门作品发布列表"
      className="flex flex-col gap-1.5"
    >
      <header className="flex items-center justify-between px-1">
        <div className="flex flex-col gap-0">
          <h3 className="text-[13px] font-semibold text-foreground">
            热门作品发布列表
          </h3>
        </div>
        <button
          type="button"
          data-slot="top-published-view-all"
          className="inline-flex h-6 items-center rounded-md px-2 text-[11px] font-medium text-brand hover:bg-brand-soft"
        >
          查看全部
        </button>
      </header>
      <ul
        data-slot="top-published-list"
        className="grid grid-cols-1 gap-1.5 md:grid-cols-2 lg:grid-cols-4"
        aria-label="热门作品发布"
      >
        {list.map((item) => (
          <li
            key={item.id}
            data-slot="top-published-card"
            data-published-id={item.id}
            data-tone={item.tone}
            className={
              item.tone === "primary"
                ? "col-span-1 flex flex-col gap-1 overflow-hidden rounded-xl border border-border bg-surface p-1.5 shadow-card md:col-span-2 md:row-span-1 md:flex-row"
                : "flex items-center gap-1.5 overflow-hidden rounded-xl border border-border bg-surface p-1 shadow-card"
            }
          >
            <TopPublishedThumb
              tone={item.tone}
              platform={item.platform}
            />
            <div
              className={
                item.tone === "primary"
                  ? "flex min-w-0 flex-1 flex-col gap-0.5 p-1"
                  : "flex min-w-0 flex-1 flex-col gap-0"
              }
            >
              <span className="line-clamp-2 text-[11px] font-medium text-foreground">
                {item.title}
              </span>
              <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                {item.platform} · {item.views}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function TopPublishedThumb({
  tone,
  platform,
}: {
  tone: "primary" | "compact";
  platform: string;
}) {
  // The reference PNG uses solid pastel thumbnails with a one-line
  // initial. We synthesise those here so the card density matches
  // without depending on real cover assets (which are still in
  // production for most page-spec projects).
  const palette = paletteForPlatform(platform);
  const sizeClass =
    tone === "primary"
      ? "h-14 w-full md:h-16 md:w-28 md:shrink-0"
      : "h-10 w-10 shrink-0";
  return (
    <div
      data-slot="top-published-thumb"
      data-platform={platform}
      aria-hidden="true"
      className={`flex items-center justify-center rounded-md ${palette.bg} ${sizeClass}`}
    >
      <span className={`text-sm font-semibold ${palette.fg}`}>
        {platformInitial(platform)}
      </span>
    </div>
  );
}

interface Palette {
  readonly bg: string;
  readonly fg: string;
}

function paletteForPlatform(platform: string): Palette {
  switch (platform) {
    case "抖音":
      return { bg: "bg-rose-100", fg: "text-rose-600" };
    case "小红书":
      return { bg: "bg-pink-100", fg: "text-pink-600" };
    case "B 站":
    case "bilibili":
      return { bg: "bg-sky-100", fg: "text-sky-600" };
    case "YouTube":
    case "youtube":
      return { bg: "bg-red-100", fg: "text-red-600" };
    case "视频号":
    case "wechatVideo":
      return { bg: "bg-emerald-100", fg: "text-emerald-600" };
    default:
      return { bg: "bg-violet-100", fg: "text-violet-600" };
  }
}

function platformInitial(platform: string): string {
  switch (platform) {
    case "抖音":
      return "抖";
    case "小红书":
      return "书";
    case "B 站":
    case "bilibili":
      return "B";
    case "YouTube":
    case "youtube":
      return "Y";
    case "视频号":
    case "wechatVideo":
      return "视";
    default:
      return "作";
  }
}

// ---------------------------------------------------------------------------
// Right rail — AIAnalysisCard → ReviewHistoryCard
// ---------------------------------------------------------------------------

function AIAnalysisCard({ items }: { items: ReadonlyArray<AiAnalysisItem> }) {
  const list = items.length > 0 ? items : DEFAULT_AI_ANALYSIS;
  return (
    <article
      data-slot="ai-analysis-card"
      aria-label="AI 分析"
      data-overlay="false"
      className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-card-gap shadow-card"
    >
      <header className="flex flex-col gap-1">
        <h3 className="text-md font-semibold text-foreground">AI 分析</h3>
        <p className="text-xs text-muted-foreground">基于本期复盘数据的要点</p>
      </header>
      <ul
        data-slot="ai-analysis-list"
        className="flex flex-col gap-1.5"
        aria-label="AI 分析要点"
      >
        {list.map((item) => (
          <li
            key={item.id}
            data-slot="ai-analysis-item"
            data-analysis-id={item.id}
            className="rounded-md border border-border bg-surface-subtle p-3 text-sm"
          >
            <div className="text-sm font-medium text-foreground">
              {item.title}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{item.body}</p>
          </li>
        ))}
      </ul>
    </article>
  );
}

function ReviewHistoryCard({
  items,
}: {
  items: ReadonlyArray<ReviewHistoryItem>;
}) {
  const list = items.length > 0 ? items : DEFAULT_REVIEW_HISTORY;
  return (
    <article
      data-slot="review-history-card"
      aria-label="复盘记录"
      className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-card-gap shadow-card"
    >
      <header className="flex flex-col gap-1">
        <h3 className="text-md font-semibold text-foreground">复盘记录</h3>
        <p className="text-xs text-muted-foreground">历史复盘条目</p>
      </header>
      <ul
        data-slot="review-history-list"
        className="flex flex-col gap-1.5"
        aria-label="复盘记录列表"
      >
        {list.map((item) => (
          <li
            key={item.id}
            data-slot="review-history-item"
            data-history-id={item.id}
            data-tone={item.tone}
            className="flex items-center justify-between rounded-md border border-border bg-surface-subtle px-3 py-2 text-sm"
          >
            <span className="font-medium text-foreground">{item.title}</span>
            <span className="font-mono text-xs text-muted-foreground">
              {item.completedAt}
            </span>
          </li>
        ))}
      </ul>
    </article>
  );
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
  if (ageRows.length === 0) return DEFAULT_AUDIENCE_PROFILE;
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
  if (sourceRows.length === 0) return DEFAULT_AUDIENCE_SOURCE;
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
  if (rows.length === 0) return DEFAULT_RETENTION_CURVE;
  return rows.map((row) => ({
    label: formatPosition(row.positionMs),
    value: row.retentionRate,
  }));
}

function pickKeyMoments(projectId: string): ReadonlyArray<KeyMoment> {
  const project = getProjectById(projectId);
  if (!project) return DEFAULT_KEY_MOMENTS;
  const review = canonicalDataset.reviews.find(
    (row) => row.projectId === project.id,
  );
  if (!review) return DEFAULT_KEY_MOMENTS;
  const insights = canonicalDataset.reviewInsights
    .filter((row) => row.reviewId === review.id)
    .sort((a, b) => a.priority - b.priority);
  if (insights.length === 0) return DEFAULT_KEY_MOMENTS;
  return insights.map<KeyMoment>((row, index) => ({
    id: `km-${row.id}-${index}`,
    label: row.title,
    value: row.description,
  }));
}

function pickAiAnalysis(projectId: string): ReadonlyArray<AiAnalysisItem> {
  const project = getProjectById(projectId);
  if (!project) return DEFAULT_AI_ANALYSIS;
  const review = canonicalDataset.reviews.find(
    (row) => row.projectId === project.id,
  );
  if (!review) return DEFAULT_AI_ANALYSIS;
  const insights = canonicalDataset.reviewInsights
    .filter((row) => row.reviewId === review.id)
    .sort((a, b) => a.priority - b.priority);
  if (insights.length === 0) return DEFAULT_AI_ANALYSIS;
  return insights.map<AiAnalysisItem>((row, index) => ({
    id: `ai-${row.id}-${index}`,
    title: insightTitle(row.insightType),
    body: row.description,
  }));
}

function pickReviewHistory(projectId: string): ReadonlyArray<ReviewHistoryItem> {
  const project = getProjectById(projectId);
  if (!project) return DEFAULT_REVIEW_HISTORY;
  const review = canonicalDataset.reviews.find(
    (row) => row.projectId === project.id,
  );
  if (!review) return DEFAULT_REVIEW_HISTORY;
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
  // The reference PNG always shows four cards; the canonical dataset
  // rarely has four live publications for a given project (most are
  // still in publishing). We synthesise the band from the project's
  // content outputs + a fallback so the slot is never empty.
  const project = getProjectById(projectId);
  if (!project) return DEFAULT_TOP_PUBLISHED;
  const outputs = canonicalDataset.contentOutputs
    .filter((output) => output.projectId === project.id)
    .slice(0, 4);
  if (outputs.length === 0) return DEFAULT_TOP_PUBLISHED;
  const rows: TopPublished[] = outputs.map((output, index) => ({
    id: `tp-${output.id}`,
    title: output.title,
    platform: platformLabelForContentType(output.contentType, index),
    views: viewsLabel(index),
    tone: index === 0 ? "primary" : "compact",
  }));
  // Pad to four cards with the canonical defaults so the band is
  // visually full even for projects with a single content output.
  while (rows.length < 4) {
    const filler = DEFAULT_TOP_PUBLISHED[rows.length];
    if (!filler) break;
    rows.push(filler);
  }
  return rows;
}

function platformLabelForContentType(
  contentType: string,
  index: number,
): string {
  // Pick a deterministic platform label per content type so the band
  // is plausible even when the project has no live publications.
  const labels: ReadonlyArray<string> = ["抖音", "小红书", "B 站", "YouTube"];
  if (contentType === "video" || contentType === "short") {
    return labels[index % labels.length] ?? "抖音";
  }
  return labels[index % labels.length] ?? "抖音";
}

function viewsLabel(index: number): string {
  const buckets = ["12.4 万播放", "8.2 万曝光", "5.6 万播放", "4.3 万播放"];
  return buckets[index % buckets.length] ?? "1.0 万播放";
}
