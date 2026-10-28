/**
 * Analytics & Review page (Task 18 / page-specs §10).
 *
 * The `project-workspace` Header mode landing page for the Review
 * stage. Composes:
 *  - a `MainAnalytics` block in the order
 *      CoreMetricsRow ([T-329] 12 张紧凑指标卡,auto-fit 响应式网格) →
 *      PrimaryCharts (ViewsTrendChart as a line +
 *        ConversionFunnel as a triangle / funnel,并排常挂) →
 *      TopPublished → Comments → CurrentPeriodLearnings.
 *  - a `RightRail` with the locked order
 *      InsightCard → ReviewAuthoringPanel → ReviewHistoryCard.
 *
 * Layout invariants:
 *  - PrimaryCharts expose two distinct visual shapes (line vs.
 *    funnel) — no chart type changes, no new metrics introduced,
 *  - the AI Analysis card lives inside the right rail (NOT a
 *    modal / overlay layer),
 *  - every chart provides a sr-only textual summary so the data
 *    is not conveyed by color alone (D-007),
 *  - [T-329] 指标空态只收窄到图表/指标区;复盘编辑面板与复盘记录始终渲染。
 *
 * The page is a Server Component. It does not own a Sidebar or a
 * TopHeader — those live in `(creator)/layout.tsx` and are mounted
 * once for the whole route group. The page just provides the content
 * slot.
 */

import * as React from "react";
import {TrafficSourcesPanel} from "./traffic-sources-panel";

import {
  ErrorState,
  LoadingState,
  resolvePageState,
} from "@/components/state/page-state";
import { buildAnalyticsReviewViewModel } from "@/fixtures/selectors";
import type { AnalyticsViewModel } from "@/types/view-models";
import {
  AnalyticsReviewInteractiveRegion,
  type ReviewsWiring,
} from "./analytics-review-interactive-region";
import { ReviewAnalyzeIsland } from "./review-analyze-island";
import { PredictionComparisonSection } from "./prediction-comparison-section";
// [T-247] 校准回流建议采纳/驳回门(client 岛;0 条/读失败不渲)。
import { CalibrationSuggestionsCard } from "./calibration-suggestions-card";
// [T-284b G2] 本账号可复用公式(归因回流可见性;client 岛,按 projectId 过滤,0 条/读失败不渲)。
import { ReusableFormulaCard } from "./reusable-formula-card";
import type { PredictionComparisonVm } from "./review-workspace-data";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface AnalyticsReviewPageProps {
  /** The id of the project to render. */
  readonly projectId: string;
  /** Override hook for tests; defaults to the production selector. */
  readonly viewModel?: AnalyticsViewModel;
  /**
   * Server-resolved Reviews wiring (module 13 Step 5). Optional → the authoring
   * panel + history drill degrade to inert local affordances (so the fixture-only
   * page tests render without a network call). The real route supplies it.
   */
  readonly reviewsWiring?: ReviewsWiring;
  /**
   * [T-063e] 预测 vs 实际 对照(校准飞轮的对照步并入复盘页)。route server 装配
   * (buildPredictionComparison);undefined = 不渲染该区(fixture-only 单测),
   * null = 本项目未做盲预测(诚实空态)。空指标态也照渲 —— 已锁定盲预测、
   * 数据还没回流,正是「等待回流」该被看见的时刻。
   */
  readonly predictionComparison?: PredictionComparisonVm | null;
  readonly groupFilters?: React.ReactNode;
  readonly metricsContent?: React.ReactNode;
  readonly analysisScope?: string;
  readonly publicationIds?: readonly string[];
}

// ---------------------------------------------------------------------------
// Page (Server Component shell)
//
// The page renders the shared page-state placeholders when the ViewModel
// envelope signals loading / error / empty, and otherwise mounts the
// Client island (`AnalyticsReviewInteractiveRegion`) which owns the wired
// time-window / tab switching. The window re-derives the displayed metric
// set + views trend over the fixture data. The default-state DOM is
// equivalent to the previous server-only render so the visual baseline
// holds.
// ---------------------------------------------------------------------------

export function AnalyticsReviewPage({
  projectId,
  viewModel,
  reviewsWiring,
  predictionComparison,
  groupFilters,
  metricsContent,
  analysisScope,
  publicationIds,
}: AnalyticsReviewPageProps) {
  const vm = viewModel ?? buildAnalyticsReviewViewModel(projectId);
  const metricsEmpty =
    vm.metrics.length === 0 &&
    vm.viewsTrend.length === 0 &&
    vm.conversionFunnel.length === 0;
  const reviewEvidenceReady =
    !metricsEmpty || (vm.comments?.length ?? 0) > 0;
  const state = resolvePageState(vm, metricsEmpty);
  // [T-329] 拆掉 isEmpty 吞噬门:指标空 ≠ 整页空。此前空指标把整个 interactive region
  // (含复盘编辑面板/复盘记录 —— 与指标采集无依赖的真 op 面)整体吞掉,用户在没跑
  // 「拉明细」前连手动复盘都做不了。现在空态收窄到图表/指标区(region 内部渲窄化
  // EmptyState),编辑面板/记录/评论等区始终渲染(各自带诚实空态)。
  return (
    <main
      data-app="creatoros"
      data-page="analytics-review" data-studio-layout="report"
      data-project-id={vm.projectId}
      data-page-state={state}
      className="flex flex-col gap-section-gap"
    >
      <header><h1 className="text-2xl font-semibold">项目复盘</h1></header>
      {groupFilters}
      {state === "loading" ? (
        <LoadingState label="正在加载数据复盘…" rows={6} />
      ) : state === "error" ? (
        <ErrorState error={vm.error} />
      ) : (
        <>
          {metricsContent}
          <ReviewAnalyzeIsland projectId={vm.projectId} analysisScope={analysisScope}/>
          {reviewsWiring ? <TrafficSourcesPanel projectId={vm.projectId} publicationIds={publicationIds}/> : null}
          {/* [T-063e] 预测 vs 实际 对照(校准飞轮对照步并入复盘)。空指标态也照渲 ——
              已锁定盲预测、数据还没回流,正是「等待回流」该被看见的时刻。 */}
          {predictionComparison !== undefined ? (
            <PredictionComparisonSection vm={predictionComparison} publicationScoped={publicationIds !== undefined} />
          ) : null}
          {/* [T-247] 已回流校准(待采纳):复盘裁决产生的评分维度建议 → 采纳/驳回门。 */}
          <CalibrationSuggestionsCard />
          {/* [T-284b G2] 本账号可复用公式:归因产的 reusable_formula/why_worked 明细(按本项目过滤)。 */}
          <ReusableFormulaCard projectId={vm.projectId} />
          <AnalyticsReviewInteractiveRegion
            viewModel={vm}
            reviewsWiring={reviewsWiring}
            metricsEmpty={state === "empty"}
            reviewEvidenceReady={reviewEvidenceReady}
            metricsContent={metricsContent ? <></> : undefined}
            analysisScope={analysisScope}
          />
        </>
      )}
    </main>
  );
}
