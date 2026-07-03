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
 *      InsightCard → ReviewHistoryCard.
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

import {
  EmptyState,
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
}: AnalyticsReviewPageProps) {
  const vm = viewModel ?? buildAnalyticsReviewViewModel(projectId);
  const isEmpty =
    vm.metrics.length === 0 &&
    vm.viewsTrend.length === 0 &&
    vm.conversionFunnel.length === 0;
  const state = resolvePageState(vm, isEmpty);
  return (
    <main
      data-app="creatoros"
      data-page="analytics-review"
      data-project-id={vm.projectId}
      data-page-state={state}
      className="flex flex-col gap-section-gap"
    >
      {state === "loading" ? (
        <LoadingState label="正在加载数据复盘…" rows={6} />
      ) : state === "error" ? (
        <ErrorState error={vm.error} />
      ) : state === "empty" ? (
        <>
          <EmptyState
            title="该作品暂无明细数据"
            description="还没有拉到这个作品的播放/互动明细。去任务中心跑「拉明细」采集，数据回收后即可在此查看复盘分析。"
          />
          {/* [T-063e] 已锁定盲预测但数据未回流,正是空指标态 —— 对照区照渲(等待回流)。 */}
          {predictionComparison !== undefined ? (
            <PredictionComparisonSection vm={predictionComparison} />
          ) : null}
        </>
      ) : (
        <>
          <ReviewAnalyzeIsland projectId={vm.projectId} />
          {/* [T-063e] 预测 vs 实际 对照(校准飞轮对照步并入复盘)。 */}
          {predictionComparison !== undefined ? (
            <PredictionComparisonSection vm={predictionComparison} />
          ) : null}
          <AnalyticsReviewInteractiveRegion
            viewModel={vm}
            reviewsWiring={reviewsWiring}
          />
        </>
      )}
    </main>
  );
}
