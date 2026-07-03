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
import { useRouter } from "next/navigation";

import { client } from "@/lib/contract-client";
import { ViewsTrendChart } from "@/components/analytics/views-trend-chart";
import { ConversionFunnelChart } from "@/components/analytics/conversion-funnel-chart";
import { AudienceBreakdown } from "@/components/analytics/audience-breakdown";
import { HorizontalBarsChart } from "@/components/analytics/horizontal-bars-chart";
import { RetentionChart } from "@/components/analytics/retention-chart";
import { InsightCard } from "@/components/analytics/insight-card";
import { MetricCard } from "@/components/project/metric-card";
import { SectionCard } from "@/components/project/section-card";
import { buildAnalyticsReviewViewModel } from "@/fixtures/selectors";
import {
  isFixtureAnalyticsProject,
  type AnalyticsWindow,
} from "@/fixtures/selectors/review";
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
// 复盘每作品评论 (T-030 D6) — 一条真实评论 (文本 + demand_tag 若有)。
type CommentItem = NonNullable<AnalyticsViewModel["comments"]>[number];

// ---------------------------------------------------------------------------
// Reviews wiring (module 13 Step 5). Present only when the server shell resolves
// the real ops surface; absent → the authoring panel + history drill degrade to
// inert local affordances (so the fixture-only render + visual baseline hold).
// Each control maps to exactly one Reviews op; reads (history drill) skip refresh.
// ---------------------------------------------------------------------------

export interface ReviewsWiring {
  readonly projectId: string;
}

// The insight-type select offers the four contract insightType values with the
// roadmap §4 Chinese labels (成功亮点→success / 待优化→issue / 行动项→action / 假设→
// hypothesis).
const INSIGHT_TYPES: ReadonlyArray<{ readonly value: string; readonly label: string }> = [
  { value: "success", label: "成功亮点" },
  { value: "issue", label: "待优化" },
  { value: "action", label: "行动项" },
  { value: "hypothesis", label: "假设" },
];

// The shape returned by reviews.get / reviews.create (reviewResource) + the insight
// (reviewInsightResource) — read structurally by the drill detail panel.
interface ReviewDto {
  readonly id: string;
  readonly status: string;
  readonly reviewType: string;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly completedAt: string | null;
}

// ---------------------------------------------------------------------------
// Tab → time-window mapping. Each analytics tab re-scopes the metric set
// + views trend; the remaining tabs reuse the default ("all") window.
// ---------------------------------------------------------------------------

// [T-052 裁决③] revenue(收益分析)tab 随变现中心物理删除。
const TAB_WINDOW: Readonly<Record<string, AnalyticsWindow>> = {
  overview: "all",
  platform: "30d",
  audience: "7d",
  content: "30d",
  comparison: "all",
  experience: "all",
};

// ---------------------------------------------------------------------------
// AnalyticsReviewInteractiveRegion
// ---------------------------------------------------------------------------

export function AnalyticsReviewInteractiveRegion({
  viewModel,
  reviewsWiring,
}: {
  readonly viewModel: AnalyticsViewModel;
  readonly reviewsWiring?: ReviewsWiring;
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
  // Review-history drill (wired-local → backend): the selected review's detail
  // (reviews.get). A read-only drill — no router.refresh().
  const [reviewDetail, setReviewDetail] = React.useState<ReviewDto | null>(null);

  const onSelectReview = React.useCallback(
    (id: string) => {
      setActiveReviewId(id);
      if (!reviewsWiring) return; // inert without the ops surface (fixture-only)
      void (async () => {
        const detail = (await client.getReview({
          params: { reviewId: id },
          query: undefined,
          body: undefined,
        })) as ReviewDto;
        setReviewDetail(detail);
      })();
    },
    [reviewsWiring],
  );

  // Re-derive the metric set + views trend for the selected window. The
  // base `viewModel` (server-rendered, window = "all") is used for the
  // default tab so the default DOM is unchanged; switching a tab calls
  // the pure selector with the mapped window.
  //
  // GATE: only a canonical fixture/demo project may re-derive by window — for a
  // REAL imported project the fixture selector has NO data, so re-deriving would
  // WIPE the server's真值(真播放/点赞…)to 0 on tab switch. Real projects keep
  // their op-derived VM across tabs (the time-window re-scope is a demo-only
  // affordance until a client-side re-scope over the fetched snapshots exists).
  const window = TAB_WINDOW[activeTab] ?? "all";
  const canRederive = React.useMemo(
    () => isFixtureAnalyticsProject(viewModel.projectId),
    [viewModel.projectId],
  );
  const scoped = React.useMemo<AnalyticsViewModel>(() => {
    if (window === "all" || !canRederive) return viewModel;
    return buildAnalyticsReviewViewModel(viewModel.projectId, window);
  }, [viewModel, window, canRederive]);

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
            viewsTrendMode={scoped.viewsTrendMode ?? (scoped.viewsTrend.length > 1 ? "daily" : "single")}
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
          <CommentsSection comments={viewModel.comments ?? []} />
        </div>
        <div
          data-slot="analytics-right-rail"
          className="flex flex-col gap-card-gap"
        >
          <InsightCard items={viewModel.aiAnalysis} />
          <ReviewAuthoringPanel
            projectId={viewModel.projectId}
            wiring={reviewsWiring}
          />
          <ReviewHistoryCard
            items={viewModel.reviewHistory}
            activeId={activeReviewId}
            onSelect={onSelectReview}
            detail={reviewDetail}
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
  viewsTrendMode,
  conversionFunnel,
  chartTab,
  onChartTabChange,
}: {
  viewsTrend: ReadonlyArray<{ readonly label: string; readonly value: number }>;
  viewsTrendMode: "daily" | "single" | "empty";
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
        <SectionCard
          title="播放趋势"
          description={viewsTrendMode === "single" ? "单次采集快照" : "按采集日"}
          className="[--card-spacing:--spacing(3)]"
        >
          <ViewsTrendChart
            data={viewsTrend}
            mode={viewsTrendMode}
            summary={buildTrendSummary(viewsTrend, viewsTrendMode)}
            slot="views-trend-chart"
            testId="views-trend-chart-echarts"
          />
        </SectionCard>
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
          <ConversionFunnelChart data={conversionFunnel} />
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

// 播放趋势 sr-only 摘要 (D-007): 诚实反映数据形态 —— 单快照说单点,多日说日级折线,
// 绝不在文案里编造「整体上升」这类不存在的趋势结论。
function buildTrendSummary(
  data: ReadonlyArray<{ readonly label: string; readonly value: number }>,
  mode: "daily" | "single" | "empty",
): string {
  if (mode === "empty" || data.length === 0) return "播放趋势：暂无采集数据。";
  if (mode === "single" || data.length === 1) {
    const p = data[data.length - 1]!;
    return `播放趋势：仅 1 次采集(${p.label}），播放量 ${p.value.toLocaleString()}。需多次采集积累日趋势。`;
  }
  const first = data[0]!;
  const last = data[data.length - 1]!;
  const rising = last.value >= first.value;
  return `播放趋势(按采集日）：${first.label} ${first.value.toLocaleString()} 到 ${last.label} ${last.value.toLocaleString()}，${rising ? "整体上升" : "整体回落"}。`;
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
        {audienceProfile.length === 0 ? (
          <PlannedRegion
            slot="audience-profile"
            hint="观众画像需单视频分析页采集，接入后在此显示年龄段分布。"
          />
        ) : (
          <>
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
          </>
        )}
      </SectionCard>

      <SectionCard
        title="观众来源"
        description="按渠道拆分"
        contentClassName="flex flex-col gap-1.5"
        className="[--card-spacing:--spacing(3)]"
      >
        {audienceSource.length === 0 ? (
          <PlannedRegion
            slot="audience-source"
            hint="观众来源需单视频分析页采集，接入后在此按渠道拆分。"
          />
        ) : (
          <>
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
          </>
        )}
      </SectionCard>

      <SectionCard
        title="留存曲线"
        description="完播随时间变化"
        contentClassName="flex flex-col gap-1.5"
        className="[--card-spacing:--spacing(3)]"
      >
        {retentionCurve.length === 0 ? (
          <PlannedRegion
            slot="retention-curve"
            hint="留存曲线需单视频分析页采集，接入后在此显示完播随时间变化。"
          />
        ) : (
          <>
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
          </>
        )}
      </SectionCard>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PlannedRegion — honest「规划中」placeholder for a chart region that has NO
// reachable data source (观众画像/来源/留存/关键时刻)。绝不画假图 / 假分布(宪法 §8)。
// 复用 T-010 的「规划中」标注模式(dashed 边框 + badge + 说明)。
// ---------------------------------------------------------------------------

function PlannedRegion({
  slot,
  hint,
}: {
  slot: string;
  hint: string;
}) {
  return (
    <div
      data-slot={slot}
      data-planned="true"
      data-empty="true"
      className="flex flex-col items-start gap-1 rounded-lg border border-dashed border-border bg-surface-subtle px-3 py-4"
    >
      <span className="inline-flex items-center rounded-full border border-border bg-surface px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground">
        规划中
      </span>
      <p className="text-[11px] leading-relaxed text-muted-foreground">{hint}</p>
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
        {moments.length === 0 ? (
          <PlannedRegion
            slot="key-moments-list"
            hint="关键时刻(完播高峰/互动峰值/流失节点)需单视频分析页采集，接入后在此显示。"
          />
        ) : (
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
        )}
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
        {/* T-010: 装饰按钮无后端,加显式「规划中」标注 + tooltip,不让用户白点。 */}
        <button
          type="button"
          data-slot="top-published-view-all"
          data-inert="decorative"
          data-planned="true"
          aria-disabled="true"
          title="规划中,敬请期待"
          className="inline-flex h-6 cursor-not-allowed items-center gap-1 rounded-md px-2 text-[11px] font-medium text-muted-foreground"
        >
          查看全部
          <span className="rounded-full border border-border bg-surface-subtle px-1.5 py-0.5 text-[9px] font-medium">
            规划中
          </span>
        </button>
      </header>
      {list.length === 0 ? (
        <div
          data-slot="top-published-empty"
          data-empty="true"
          className="flex flex-col items-start gap-1 rounded-lg border border-dashed border-border bg-surface-subtle px-3 py-4"
        >
          <p className="text-[12px] font-medium text-foreground">暂无作品</p>
          <p className="text-[11px] text-muted-foreground">
            该项目还没有导入 / 发布的作品，作品发布后会显示在这里。
          </p>
        </div>
      ) : (
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
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// CommentsSection — 复盘每作品评论 (T-030 §10 / D6)
//
// 当前作品的真实评论 (前 100 条, 文本 + demand_tag 若有), 读自 publications.comments.list。
// 空态诚实 (宪法 §8 / T-010): 无评论 → 引导「去任务中心配『抓我作品评论』采集」, 绝不摆假评论。
// F3 边界: 存量评论无 aweme_id 锚未回填 publication_id → 查不到 → 走空态 (需重采)。
// ---------------------------------------------------------------------------

function CommentsSection({
  comments,
}: {
  comments: ReadonlyArray<CommentItem>;
}) {
  const isEmpty = comments.length === 0;
  // [T-092] 单条评论「入知识库」:点击展开预填确认门(title=评论原文,人改成问题式)
  // → 采纳走 knowledge.create(type='qa' + sourceMetadata 双料锚)。一次只开一条。
  const [backflowFor, setBackflowFor] = React.useState<string | null>(null);
  const [backflowTitle, setBackflowTitle] = React.useState("");
  const [backflowBusy, setBackflowBusy] = React.useState(false);
  const [backflowMessage, setBackflowMessage] = React.useState<string | null>(
    null,
  );
  const [backflowedIds, setBackflowedIds] = React.useState<Set<string>>(
    () => new Set(),
  );

  const openBackflow = React.useCallback((comment: CommentItem) => {
    setBackflowFor(comment.id);
    setBackflowTitle(comment.text.slice(0, 80));
    setBackflowMessage(null);
  }, []);

  const adoptBackflow = React.useCallback(
    async (comment: CommentItem) => {
      const title = backflowTitle.trim();
      if (!title || backflowBusy) return;
      setBackflowBusy(true);
      setBackflowMessage(null);
      try {
        await client.createKnowledge({
          params: undefined,
          query: undefined,
          body: {
            title,
            knowledgeType: "qa",
            content: "",
            sourceType: "import",
            sourceNote: `抖音评论,赞 ${comment.likeCount ?? 0}`,
            sourceMetadata: {
              origin: "comment_backflow",
              signalIds: [comment.id],
              signalExternalIds: comment.externalId ? [comment.externalId] : [],
            },
          },
        });
        setBackflowedIds((prev) => new Set(prev).add(comment.id));
        setBackflowFor(null);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        // service 幂等兜底(锚已入库)→ 诚实标注,不重复入库。
        setBackflowMessage(
          message.includes("已回流") ? "该评论已回流过知识库。" : message,
        );
      } finally {
        setBackflowBusy(false);
      }
    },
    [backflowTitle, backflowBusy],
  );
  return (
    <section
      data-slot="review-comments-section"
      data-empty={isEmpty ? "true" : "false"}
      aria-label="作品评论"
      className="flex flex-col gap-1.5 rounded-xl border border-border bg-surface p-3 shadow-card"
    >
      <header className="flex items-center justify-between px-1">
        <h3 className="text-[13px] font-semibold text-foreground">热门评论</h3>
        {isEmpty ? null : (
          <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
            热榜前 {comments.length} 条
          </span>
        )}
      </header>
      {isEmpty ? (
        <div
          data-slot="review-comments-empty"
          className="flex flex-col items-start gap-1 rounded-lg border border-dashed border-border bg-surface-subtle px-3 py-4"
        >
          <p className="text-[12px] font-medium text-foreground">
            未采集该作品评论
          </p>
          <p className="text-[11px] text-muted-foreground">
            去任务中心配「抓我作品评论」采集，评论回收后会显示在这里。
          </p>
        </div>
      ) : (
        <ul
          data-slot="review-comments-list"
          className="flex flex-col gap-1.5"
          aria-label="评论列表"
        >
          {comments.map((comment) => (
            <li
              key={comment.id}
              data-slot="review-comment-item"
              data-comment-id={comment.id}
              className="flex flex-col gap-1 rounded-lg border border-border bg-surface px-3 py-2"
            >
              <p className="whitespace-pre-wrap text-[12px] leading-relaxed text-foreground">
                {comment.text}
              </p>
              {/* [T-092] 单条「入知识库」轻动作:高价值疑问不必等批处理。 */}
              <div className="flex items-center gap-1.5">
                {backflowedIds.has(comment.id) ? (
                  <span
                    data-slot="review-comment-backflowed"
                    className="text-[10px] text-muted-foreground"
                  >
                    已入知识库
                  </span>
                ) : (
                  <button
                    type="button"
                    data-slot="review-comment-to-knowledge"
                    onClick={() => openBackflow(comment)}
                    className="text-[10px] text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                  >
                    入知识库
                  </button>
                )}
              </div>
              {backflowFor === comment.id ? (
                <div
                  data-slot="review-comment-backflow-gate"
                  className="flex flex-col gap-1.5 rounded-md border border-border bg-surface-subtle/50 p-2"
                >
                  <label
                    className="text-[10px] text-muted-foreground"
                    htmlFor={`review-comment-backflow-title-${comment.id}`}
                  >
                    归一成问题(采纳后进知识库为「观众问题」原子)
                  </label>
                  <input
                    id={`review-comment-backflow-title-${comment.id}`}
                    data-slot="review-comment-backflow-title"
                    type="text"
                    value={backflowTitle}
                    onChange={(e) => setBackflowTitle(e.target.value)}
                    className="h-7 rounded-md border border-border bg-surface px-2 text-[12px] text-foreground focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                  />
                  {backflowMessage ? (
                    <p
                      data-slot="review-comment-backflow-message"
                      className="text-[10px] text-destructive"
                    >
                      {backflowMessage}
                    </p>
                  ) : null}
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      data-slot="review-comment-backflow-adopt"
                      disabled={backflowBusy || backflowTitle.trim().length === 0}
                      onClick={() => void adoptBackflow(comment)}
                      className="inline-flex h-6 items-center rounded-md bg-brand px-2 text-[11px] font-medium text-brand-foreground hover:bg-brand/90 disabled:opacity-50"
                    >
                      {backflowBusy ? "入库中…" : "采纳入库"}
                    </button>
                    <button
                      type="button"
                      data-slot="review-comment-backflow-cancel"
                      disabled={backflowBusy}
                      onClick={() => setBackflowFor(null)}
                      className="inline-flex h-6 items-center rounded-md border border-border bg-surface px-2 text-[11px] text-foreground hover:bg-surface-subtle"
                    >
                      取消
                    </button>
                  </div>
                </div>
              ) : null}
              {comment.demandTag || (comment.likeCount ?? 0) > 0 ? (
                <div className="flex flex-wrap items-center gap-1.5">
                  {(comment.likeCount ?? 0) > 0 ? (
                    <span
                      data-slot="review-comment-likes"
                      data-like-count={comment.likeCount ?? 0}
                      className="inline-flex w-fit items-center gap-0.5 rounded-full bg-surface-subtle px-2 py-0.5 font-mono text-[10px] tabular-nums text-muted-foreground"
                      title="评论点赞数(热榜排序依据)"
                    >
                      🔥 {(comment.likeCount ?? 0).toLocaleString()}
                    </span>
                  ) : null}
                  {comment.demandTag ? (
                    <span
                      data-slot="review-comment-demand-tag"
                      className="inline-flex w-fit items-center rounded-full border border-brand/40 bg-brand-soft px-2 py-0.5 text-[10px] font-medium text-brand"
                    >
                      {comment.demandTag}
                    </span>
                  ) : null}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
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
  detail,
}: {
  items: ReadonlyArray<ReviewHistoryItem>;
  activeId: string | null;
  onSelect: (id: string) => void;
  detail?: ReviewDto | null;
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
      {detail ? (
        <div
          data-slot="review-detail-panel"
          data-review-id={detail.id}
          data-review-status={detail.status}
          className="flex flex-col gap-1 rounded-md border border-border bg-surface-subtle px-3 py-2 text-xs"
        >
          <span className="font-medium text-foreground">
            复盘详情 · {detail.reviewType === "output" ? "单作品" : "项目"}
          </span>
          <span className="text-muted-foreground">
            状态：{detail.status} · 周期 {detail.periodStart} ~ {detail.periodEnd}
          </span>
        </div>
      ) : null}
    </article>
  );
}

// ---------------------------------------------------------------------------
// ReviewAuthoringPanel — the greenfield review-authoring surface (roadmap §4
// Gap / G13). Each control maps to exactly one Reviews op; mutations call the op
// then router.refresh(). Without `wiring` the panel renders inert (no client
// call) so the fixture-only page render + visual baseline hold. The decorative
// controls (添加发布 / 生成复盘报告) carry data-inert="decorative" and issue NO call —
// they belong to a future wave (attach has no contract op; AI report is G15).
// ---------------------------------------------------------------------------

function ReviewAuthoringPanel({
  projectId,
  wiring,
}: {
  projectId: string;
  wiring?: ReviewsWiring;
}) {
  const router = useRouter();
  // The active in_progress review id created via 开始复盘 (kept client-local so 添加洞察
  // / 完成复盘 know which review to target). Null until a review is started.
  const [activeReviewId, setActiveReviewId] = React.useState<string | null>(
    null,
  );
  const [insightType, setInsightType] = React.useState<string>(
    INSIGHT_TYPES[0]!.value,
  );
  const [title, setTitle] = React.useState<string>("");
  const [description, setDescription] = React.useState<string>("");

  const startReview = React.useCallback(() => {
    if (!wiring) return;
    void (async () => {
      const review = (await client.createReview({
        params: { projectId },
        query: undefined,
        body: { reviewType: "project", contentOutputId: null },
      })) as { id: string };
      setActiveReviewId(review.id);
      router.refresh();
    })();
  }, [wiring, projectId, router]);

  const addInsight = React.useCallback(() => {
    if (!wiring || !activeReviewId || title.trim() === "") return;
    void (async () => {
      await client.createReviewInsight({
        params: { reviewId: activeReviewId },
        query: undefined,
        body: {
          insightType: insightType as
            | "success"
            | "issue"
            | "action"
            | "hypothesis",
          title,
          description,
        },
      });
      setTitle("");
      setDescription("");
      router.refresh();
    })();
  }, [wiring, activeReviewId, insightType, title, description, router]);

  const completeReview = React.useCallback(() => {
    if (!wiring || !activeReviewId) return;
    void (async () => {
      await client.completeReview({
        params: { reviewId: activeReviewId },
        query: undefined,
        body: undefined,
      });
      router.refresh();
    })();
  }, [wiring, activeReviewId, router]);

  return (
    <article
      data-slot="review-authoring-panel"
      aria-label="复盘编辑"
      className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-card-gap shadow-card"
    >
      <header className="flex flex-col gap-1">
        <h3 className="text-md font-semibold text-foreground">复盘编辑</h3>
        <p className="text-xs text-muted-foreground">创建复盘、记录洞察并完成</p>
      </header>
      <button
        type="button"
        data-slot="start-review-button"
        data-has-active={activeReviewId ? "true" : "false"}
        onClick={startReview}
        className="inline-flex h-8 items-center justify-center rounded-md border border-brand/60 bg-brand-soft px-3 text-xs font-medium text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      >
        开始复盘
      </button>

      <div data-slot="add-insight-form" className="flex flex-col gap-1.5">
        <select
          data-slot="insight-type-select"
          value={insightType}
          onChange={(e) => setInsightType(e.target.value)}
          className="h-8 rounded-md border border-border bg-surface px-2 text-xs text-foreground"
        >
          {INSIGHT_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        <input
          data-slot="insight-title-input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="洞察标题"
          className="h-8 rounded-md border border-border bg-surface px-2 text-xs text-foreground"
        />
        <input
          data-slot="insight-description-input"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="补充说明（可选）"
          className="h-8 rounded-md border border-border bg-surface px-2 text-xs text-foreground"
        />
        <button
          type="button"
          data-slot="add-insight-button"
          onClick={addInsight}
          className="inline-flex h-8 items-center justify-center rounded-md border border-border bg-surface px-3 text-xs font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          添加洞察
        </button>
      </div>

      <button
        type="button"
        data-slot="complete-review-button"
        onClick={completeReview}
        className="inline-flex h-8 items-center justify-center rounded-md border border-border bg-surface px-3 text-xs font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      >
        完成复盘
      </button>

      {/* T-010: 添加发布 / 生成复盘报告 属经验沉淀飞轮(SPEC §2)未接通的能力,
          真禁用 + 显式「规划中」标注 + tooltip,不假装可点。 */}
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          data-slot="attach-publication-button"
          data-inert="decorative"
          data-planned="true"
          aria-disabled="true"
          disabled
          title="规划中,敬请期待"
          className="inline-flex h-7 cursor-not-allowed items-center gap-1 rounded-md px-2 text-[11px] font-medium text-muted-foreground"
        >
          添加发布
          <span className="rounded-full border border-border bg-surface-subtle px-1.5 py-0.5 text-[9px] font-medium">
            规划中
          </span>
        </button>
        <button
          type="button"
          data-slot="generate-report-button"
          data-inert="decorative"
          data-planned="true"
          aria-disabled="true"
          disabled
          title="规划中,敬请期待"
          className="inline-flex h-7 cursor-not-allowed items-center gap-1 rounded-md px-2 text-[11px] font-medium text-muted-foreground"
        >
          生成复盘报告
          <span className="rounded-full border border-border bg-surface-subtle px-1.5 py-0.5 text-[9px] font-medium">
            规划中
          </span>
        </button>
      </div>
    </article>
  );
}
