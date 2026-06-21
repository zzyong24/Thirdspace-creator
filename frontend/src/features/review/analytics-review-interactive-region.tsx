"use client";

/**
 * `AnalyticsReviewInteractiveRegion` — Client island for the Analytics &
 * Review page (Increment 4 / page-specs §10).
 *
 * The page (`analytics-review-page.tsx`) stays a Server Component shell;
 * the interactive content lives here following the existing islands
 * pattern (assets / settings / search / knowledge / publishing-center).
 *
 * Wired interactions (client state over fixture data, no network):
 *  - AnalyticsTabs: switching a tab selects an analytics time-window
 *    (整体表现 → all, 平台表现 → 30d, 观众分析 → 7d, …). The selected window
 *    re-derives the CoreMetricsRow + ViewsTrendChart numbers from the
 *    fixture entities via `buildAnalyticsReviewViewModel(projectId,
 *    window)` so the displayed numbers change with the selection.
 *  - Chart tab toggle (趋势 / 漏斗): toggles which primary chart is
 *    emphasised; both stay mounted (no chart type change — page-specs
 *    §10 invariant).
 *  - Key-moment / review selection: selectable rows (one active at a
 *    time) in the Key Moments + Review History lists.
 *
 * Determinism: the re-derivation is a pure selector call; no `Date.now`
 * / `Math.random` / `fetch`. The selector is pure and deterministic so
 * importing it into a Client component is safe.
 */

import * as React from "react";

import { ChartFrame } from "@/components/analytics/chart-frame";
import { AudienceBreakdown } from "@/components/analytics/audience-breakdown";
import { HorizontalBarsChart } from "@/components/analytics/horizontal-bars-chart";
import { RetentionChart } from "@/components/analytics/retention-chart";
import { InsightCard } from "@/components/analytics/insight-card";
import { MetricCard } from "@/components/project/metric-card";
import { SectionCard } from "@/components/project/section-card";
import { buildAnalyticsReviewViewModel } from "@/fixtures/selectors";
import type { AnalyticsWindow } from "@/fixtures/selectors/review";
import type {
  AnalyticsViewModel,
  MetricCard as MetricCardVm,
  TopPublishedCard,
} from "@/types/view-models";

// ---------------------------------------------------------------------------
// Render-side item types (structurally identical to the matching
// AnalyticsViewModel fields).
// ---------------------------------------------------------------------------

type KeyMoment = AnalyticsViewModel["keyMoments"][number];
type TopPublished = TopPublishedCard;
type ReviewHistoryItem = AnalyticsViewModel["reviewHistory"][number];

// ---------------------------------------------------------------------------
// Tab → time-window mapping. Each analytics tab re-scopes the metric set
// + views trend; the remaining tabs reuse the default ("all") window.
// ---------------------------------------------------------------------------

const TAB_WINDOW: Readonly<Record<string, AnalyticsWindow>> = {
  overview: "all",
  platform: "30d",
  audience: "7d",
  content: "30d",
  revenue: "all",
  comparison: "all",
  experience: "all",
};

// ---------------------------------------------------------------------------
// AnalyticsReviewInteractiveRegion
// ---------------------------------------------------------------------------

export function AnalyticsReviewInteractiveRegion({
  viewModel,
}: {
  readonly viewModel: AnalyticsViewModel;
}) {
  const [activeTab, setActiveTab] = React.useState<string>(
    viewModel.tabs[0]?.id ?? "overview",
  );
  const [chartTab, setChartTab] = React.useState<"trend" | "funnel">("trend");
  const [activeMomentId, setActiveMomentId] = React.useState<string | null>(
    null,
  );
  const [activeReviewId, setActiveReviewId] = React.useState<string | null>(
    null,
  );

  // Re-derive the metric set + views trend for the selected window. The
  // base `viewModel` (server-rendered, window = "all") is used for the
  // default tab so the default DOM is unchanged; switching a tab calls
  // the pure selector with the mapped window.
  const window = TAB_WINDOW[activeTab] ?? "all";
  const scoped = React.useMemo<AnalyticsViewModel>(() => {
    if (window === "all") return viewModel;
    return buildAnalyticsReviewViewModel(viewModel.projectId, window);
  }, [viewModel, window]);

  return (
    <>
      <AnalyticsTabs
        tabs={viewModel.tabs}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />
      <div
        data-slot="analytics-grid"
        className="grid grid-cols-1 gap-card-gap lg:grid-cols-[minmax(0,1fr)_350px]"
      >
        <div data-slot="analytics-main-column" className="flex flex-col gap-3">
          <CoreMetricsRow metrics={scoped.metrics} />
          <PrimaryCharts
            viewsTrend={scoped.viewsTrend}
            conversionFunnel={scoped.conversionFunnel}
            chartTab={chartTab}
            onChartTabChange={setChartTab}
          />
          <SecondaryCharts
            audienceProfile={viewModel.audienceProfile}
            audienceSource={viewModel.audienceSource}
            retentionCurve={viewModel.retentionCurve}
          />
          <KeyMomentsSection
            moments={viewModel.keyMoments}
            activeId={activeMomentId}
            onSelect={setActiveMomentId}
          />
          <TopPublishedList items={viewModel.topPublished} />
        </div>
        <div
          data-slot="analytics-right-rail"
          className="flex flex-col gap-card-gap"
        >
          <InsightCard items={viewModel.aiAnalysis} />
          <ReviewHistoryCard
            items={viewModel.reviewHistory}
            activeId={activeReviewId}
            onSelect={setActiveReviewId}
          />
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// AnalyticsTabs — top of page (wired)
// ---------------------------------------------------------------------------

function AnalyticsTabs({
  tabs,
  activeTab,
  onTabChange,
}: {
  tabs: ReadonlyArray<{ readonly id: string; readonly label: string }>;
  activeTab: string;
  onTabChange: (id: string) => void;
}) {
  return (
    <nav
      data-slot="analytics-tabs"
      aria-label="数据复盘阶段"
      className="flex flex-wrap items-center gap-2 border-b border-border pb-2"
    >
      {tabs.map((tab) => {
        const pressed = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            data-slot="page-tabs"
            data-tab-id={tab.id}
            data-pressed={pressed}
            aria-selected={pressed}
            onClick={() => onTabChange(tab.id)}
            className="inline-flex h-8 items-center rounded-full border border-border bg-surface px-3 text-xs font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 data-[pressed=true]:border-brand/60 data-[pressed=true]:bg-brand-soft data-[pressed=true]:text-brand"
          >
            {tab.label}
          </button>
        );
      })}
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

function PrimaryCharts({
  viewsTrend,
  conversionFunnel,
  chartTab,
  onChartTabChange,
}: {
  viewsTrend: ReadonlyArray<{ readonly label: string; readonly value: number }>;
  conversionFunnel: ReadonlyArray<{ readonly label: string; readonly value: number }>;
  chartTab: "trend" | "funnel";
  onChartTabChange: (tab: "trend" | "funnel") => void;
}) {
  return (
    <div data-slot="primary-charts" className="flex flex-col gap-card-gap">
      <div
        data-slot="primary-chart-tabs"
        role="tablist"
        aria-label="主图切换"
        className="flex items-center gap-1.5"
      >
        <button
          type="button"
          role="tab"
          data-slot="primary-chart-tab"
          data-chart-tab="trend"
          data-pressed={chartTab === "trend"}
          aria-selected={chartTab === "trend"}
          onClick={() => onChartTabChange("trend")}
          className="inline-flex h-7 items-center rounded-full border border-border bg-surface px-3 text-[11px] font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 data-[pressed=true]:border-brand/60 data-[pressed=true]:bg-brand-soft data-[pressed=true]:text-brand"
        >
          趋势
        </button>
        <button
          type="button"
          role="tab"
          data-slot="primary-chart-tab"
          data-chart-tab="funnel"
          data-pressed={chartTab === "funnel"}
          aria-selected={chartTab === "funnel"}
          onClick={() => onChartTabChange("funnel")}
          className="inline-flex h-7 items-center rounded-full border border-border bg-surface px-3 text-[11px] font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 data-[pressed=true]:border-brand/60 data-[pressed=true]:bg-brand-soft data-[pressed=true]:text-brand"
        >
          漏斗
        </button>
      </div>
      <div className="grid grid-cols-1 gap-card-gap lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <ChartFrame
          title="播放趋势"
          description="每日播放量"
          summary={`播放趋势：${viewsTrend[0]?.label ?? ""} ${viewsTrend[0]?.value.toLocaleString() ?? ""}，${viewsTrend[viewsTrend.length - 1]?.label ?? ""} ${viewsTrend[viewsTrend.length - 1]?.value.toLocaleString() ?? ""}，整体上升。`}
          trend={viewsTrend}
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
          <FunnelChart data={conversionFunnel} />
          <ul
            data-slot="conversion-funnel-list"
            className="flex flex-col gap-0.5"
            aria-label="转化漏斗数据"
          >
            {conversionFunnel.map((row) => (
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
            转化漏斗：曝光 {conversionFunnel[0]?.value.toLocaleString() ?? ""} → 点击 {conversionFunnel[1]?.value.toLocaleString() ?? ""} → 播放 {conversionFunnel[2]?.value.toLocaleString() ?? ""} → 互动 {conversionFunnel[3]?.value.toLocaleString() ?? ""} → 转化 {conversionFunnel[4]?.value.toLocaleString() ?? ""}，整体转化率 {funnelConversionRate(conversionFunnel)}%。
          </p>
        </article>
      </div>
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

function funnelConversionRate(
  data: ReadonlyArray<{ readonly label: string; readonly value: number }>,
): string {
  const first = data[0]?.value ?? 0;
  const last = data[data.length - 1]?.value ?? 0;
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
        <AudienceBreakdown
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
        <RetentionChart
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
// KeyMomentsSection — bottom of main column (selectable rows)
// ---------------------------------------------------------------------------

function KeyMomentsSection({
  moments,
  activeId,
  onSelect,
}: {
  moments: ReadonlyArray<KeyMoment>;
  activeId: string | null;
  onSelect: (id: string) => void;
}) {
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
          {moments.map((moment) => {
            const selected = moment.id === activeId;
            return (
              <li
                key={moment.id}
                data-slot="key-moment-row"
                data-moment-id={moment.id}
                data-selected={selected ? "true" : "false"}
                onClick={() => onSelect(moment.id)}
                className={
                  "flex cursor-pointer items-center justify-between rounded-md border border-border px-2.5 py-0.5 text-[11px] " +
                  (selected ? "bg-brand-soft/50" : "bg-surface-subtle")
                }
              >
                <span className="font-medium text-foreground">{moment.label}</span>
                <span className="font-mono tabular-nums text-muted-foreground">
                  {moment.value}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// TopPublishedList — band of 4 publication cards at the bottom of the
// main column.
// ---------------------------------------------------------------------------

function TopPublishedList({ items }: { items: ReadonlyArray<TopPublished> }) {
  const list = items;
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
          data-inert="decorative"
          aria-disabled="true"
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
            data-inert="decorative"
            className={
              item.tone === "primary"
                ? "col-span-1 flex flex-col gap-1 overflow-hidden rounded-xl border border-border bg-surface p-1.5 shadow-card md:col-span-2 md:row-span-1 md:flex-row"
                : "flex items-center gap-1.5 overflow-hidden rounded-xl border border-border bg-surface p-1 shadow-card"
            }
          >
            <TopPublishedThumb tone={item.tone} platform={item.platform} />
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
// Right rail — InsightCard → ReviewHistoryCard
// ---------------------------------------------------------------------------

function ReviewHistoryCard({
  items,
  activeId,
  onSelect,
}: {
  items: ReadonlyArray<ReviewHistoryItem>;
  activeId: string | null;
  onSelect: (id: string) => void;
}) {
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
        {items.map((item) => {
          const selected = item.id === activeId;
          return (
            <li
              key={item.id}
              data-slot="review-history-item"
              data-history-id={item.id}
              data-tone={item.tone}
              data-selected={selected ? "true" : "false"}
              onClick={() => onSelect(item.id)}
              className={
                "flex cursor-pointer items-center justify-between rounded-md border border-border px-3 py-2 text-sm " +
                (selected ? "bg-brand-soft/50" : "bg-surface-subtle")
              }
            >
              <span className="font-medium text-foreground">{item.title}</span>
              <span className="font-mono text-xs text-muted-foreground">
                {item.completedAt}
              </span>
            </li>
          );
        })}
      </ul>
    </article>
  );
}
