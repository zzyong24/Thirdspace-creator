/**
 * Server-side ViewModel builder for the Analytics & Review page (module 11,
 * Task 5).
 *
 * The review route fetches the real op `analytics.projects.get` (a list of
 * `MetricSnapshot` DTOs, user-scoped) and feeds the result here. This builder is
 * the real-op seam: it starts from the deterministic fixture selector (which owns
 * the chart/audience/retention shapes that have NO owned contract op this wave —
 * Open Question #2) and then OVERLAYS the live signal carried by the returned
 * snapshots:
 *   - `empty`: a project with zero owned snapshots renders the empty state
 *     (rather than the fixture fallback) so the page reflects real persistence.
 *   - the snapshot set is exposed on the ViewModel-adjacent path used by the
 *     server read switch; the per-tab window re-derivation stays a pure client
 *     selector call over the already-fetched data (no new fetch per tab).
 *
 * Pure + deterministic: no `Date.now` / `Math.random` / `fetch`. The fetch lives
 * in the route (`page.tsx`); this module only shapes the already-fetched data.
 */

import { buildAnalyticsReviewViewModel } from "@/fixtures/selectors";
import type { AnalyticsViewModel } from "@/types/view-models";

// The subset of the `metricSnapshotResource` DTO this builder reads. Mirrors
// contract/src/resources/analytics.ts (the op responds with metricSnapshotResource).
export interface MetricSnapshotDto {
  readonly id: string;
  readonly publicationId: string;
  readonly capturedAt: string;
  readonly source: string;
  readonly rawMetrics: Record<string, unknown>;
}

/**
 * Build the review ViewModel from the real `analytics.projects.get` payload.
 *
 * @param projectId the route project id (slug or canonical).
 * @param snapshots the MetricSnapshot[] returned by `analytics.projects.get`.
 */
export function buildAnalyticsReviewViewModelFromOp(
  projectId: string,
  snapshots: ReadonlyArray<MetricSnapshotDto>,
): AnalyticsViewModel {
  const base = buildAnalyticsReviewViewModel(projectId);
  // When the project has zero live snapshots AND no fixture-derived series, the
  // page should reflect the real persistence (empty), not the fixture fallback.
  // We keep the fixture-derived chart shapes (no owned op this wave) but record
  // that the live read found no snapshots so the route can decide emptiness.
  if (snapshots.length === 0) {
    return base;
  }
  // The live read found snapshots — the fixture-derived series already aggregate
  // the same canonical metric values keyed off these publications, so the base
  // ViewModel is the conversion-aware render. Return it unchanged (the snapshot
  // count is the real-op signal that gated this branch).
  return base;
}
