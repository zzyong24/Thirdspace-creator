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
        <EmptyState
          title="暂无复盘数据"
          description="发布内容并积累数据后即可在此查看复盘分析。"
        />
      ) : (
        <>
          <ReviewAnalyzeIsland projectId={vm.projectId} />
          <AnalyticsReviewInteractiveRegion
            viewModel={vm}
            reviewsWiring={reviewsWiring}
          />
        </>
      )}
    </main>
  );
}
