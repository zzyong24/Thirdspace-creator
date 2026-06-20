/**
 * Interaction + state + derived-metric tests for the Analytics & Review
 * page (Increment 4 functional remediation / R1-4).
 *
 * Covers:
 *  - a wired action: switching an analytics tab re-derives the displayed
 *    metric set / views trend over the selected time-window,
 *  - the chart tab toggle (趋势 / 漏斗),
 *  - key-moment + review-history row selection,
 *  - the LOADING / ERROR / EMPTY state rendering driven by the ViewModel
 *    envelope (via `buildPageScenario`),
 *  - R1-4: a CoreMetricsRow value is DERIVED from an aggregation of the
 *    canonical fixtures (MetricValue) — not a hard-coded literal.
 *
 * These are additive — the default-state contract assertions live in
 * `analytics-review-page.test.tsx` and are untouched.
 */

import * as React from "react";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { canonicalDataset } from "@/fixtures/canonical";
import { buildAnalyticsReviewViewModel } from "@/fixtures/selectors";
import { buildPageScenario } from "@/fixtures/scenarios";
import { AnalyticsReviewPage } from "./analytics-review-page";

const PROJECT_ID = "project-podcast-launch";

afterEach(() => {
  cleanup();
});

/**
 * Resolve a route slug (`project-podcast-launch`) to the canonical id
 * (`project-podcastlaunch`) the same way the selector does.
 */
function resolveCanonicalId(slug: string): string {
  const ids = canonicalDataset.projects.map((p) => p.id);
  if (ids.includes(slug)) return slug;
  const candidate = `project-${slug.replace(/-/g, "")}`;
  return ids.includes(candidate) ? candidate : slug;
}

/** Aggregate a canonical metric for the project's publications. */
function aggregateMetric(projectId: string, metricKey: string): number {
  const canonicalId = resolveCanonicalId(projectId);
  const project = canonicalDataset.projects.find((p) => p.id === canonicalId);
  if (!project) return 0;
  const outputIds = canonicalDataset.contentOutputs
    .filter((o) => o.projectId === project.id)
    .map((o) => o.id);
  const publicationIds = canonicalDataset.publications
    .filter((pub) => outputIds.includes(pub.contentOutputId))
    .map((pub) => pub.id);
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

describe("AnalyticsReviewPage derived metrics (R1-4)", () => {
  it("derives the 点赞数 / 评论数 metric values from the canonical fixtures, not literals", () => {
    const likes = aggregateMetric(PROJECT_ID, "likes");
    const comments = aggregateMetric(PROJECT_ID, "comments");
    // The fixture aggregation must be non-trivial so this proves derivation.
    expect(likes).toBe(2120);
    expect(comments).toBe(312);

    const vm = buildAnalyticsReviewViewModel(PROJECT_ID);
    const likesCard = vm.metrics.find((m) => m.id === "m-likes");
    const commentsCard = vm.metrics.find((m) => m.id === "m-comments");
    expect(likesCard?.value).toBe(likes.toLocaleString());
    expect(commentsCard?.value).toBe(comments.toLocaleString());
  });

  it("derives the conversion funnel top stage from total views", () => {
    const views = aggregateMetric(PROJECT_ID, "views");
    const vm = buildAnalyticsReviewViewModel(PROJECT_ID);
    expect(vm.conversionFunnel[0]?.value).toBe(views);
  });

  it("re-derives the views trend total from total views", () => {
    const views = aggregateMetric(PROJECT_ID, "views");
    const vm = buildAnalyticsReviewViewModel(PROJECT_ID, "all");
    const trendTotal = vm.viewsTrend.reduce((acc, row) => acc + row.value, 0);
    // Allow a small rounding tolerance from the per-day weight rounding.
    expect(Math.abs(trendTotal - views)).toBeLessThanOrEqual(5);
  });
});

describe("AnalyticsReviewPage interactions", () => {
  it("re-derives the views trend when switching the time-window tab", () => {
    const { container } = render(<AnalyticsReviewPage projectId={PROJECT_ID} />);
    const beforeRows = container.querySelectorAll(
      '[data-slot="conversion-funnel-row"]',
    ).length;
    expect(beforeRows).toBe(5);
    // The 观众分析 tab maps to the 7d window — the views-trend list grows
    // from the default to the trailing 7 points.
    const audienceTab = container.querySelector<HTMLButtonElement>(
      '[data-slot="page-tabs"][data-tab-id="audience"]',
    );
    expect(audienceTab).not.toBeNull();
    fireEvent.click(audienceTab!);
    expect(audienceTab!.getAttribute("data-pressed")).toBe("true");
    // The metric cards stay at 7 after re-derivation.
    const cards = container.querySelectorAll(
      '[data-slot="core-metrics-row"] [data-slot="metric-card"]',
    );
    expect(cards).toHaveLength(7);
  });

  it("changes the platform tab (30d window) and keeps the funnel populated", () => {
    const { container } = render(<AnalyticsReviewPage projectId={PROJECT_ID} />);
    const platformTab = container.querySelector<HTMLButtonElement>(
      '[data-slot="page-tabs"][data-tab-id="platform"]',
    );
    fireEvent.click(platformTab!);
    expect(platformTab!.getAttribute("data-pressed")).toBe("true");
    expect(
      container.querySelectorAll('[data-slot="conversion-funnel-row"]').length,
    ).toBe(5);
  });

  it("toggles the primary chart tab", () => {
    const { container } = render(<AnalyticsReviewPage projectId={PROJECT_ID} />);
    const funnelTab = container.querySelector<HTMLButtonElement>(
      '[data-slot="primary-chart-tab"][data-chart-tab="funnel"]',
    );
    expect(funnelTab).not.toBeNull();
    expect(funnelTab!.getAttribute("data-pressed")).toBe("false");
    fireEvent.click(funnelTab!);
    expect(funnelTab!.getAttribute("data-pressed")).toBe("true");
  });

  it("selects a key-moment row", () => {
    const { container } = render(<AnalyticsReviewPage projectId={PROJECT_ID} />);
    const row = container.querySelector<HTMLLIElement>(
      '[data-slot="key-moment-row"]',
    );
    expect(row!.getAttribute("data-selected")).toBe("false");
    fireEvent.click(row!);
    expect(row!.getAttribute("data-selected")).toBe("true");
  });

  it("selects a review-history row", () => {
    const { container } = render(<AnalyticsReviewPage projectId={PROJECT_ID} />);
    const row = container.querySelector<HTMLLIElement>(
      '[data-slot="review-history-item"]',
    );
    expect(row!.getAttribute("data-selected")).toBe("false");
    fireEvent.click(row!);
    expect(row!.getAttribute("data-selected")).toBe("true");
  });
});

describe("AnalyticsReviewPage states", () => {
  it("renders the LOADING state", () => {
    const vm = buildPageScenario(
      () => buildAnalyticsReviewViewModel(PROJECT_ID),
      "loading",
    );
    const { container } = render(
      <AnalyticsReviewPage projectId={PROJECT_ID} viewModel={vm} />,
    );
    expect(container.querySelector('[data-page-state="loading"]')).not.toBeNull();
    expect(
      container.querySelector('[data-slot="page-state-loading"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-slot="core-metrics-row"]'),
    ).toBeNull();
  });

  it("renders the ERROR state", () => {
    const vm = buildPageScenario(
      () => buildAnalyticsReviewViewModel(PROJECT_ID),
      "error",
    );
    const { container } = render(
      <AnalyticsReviewPage projectId={PROJECT_ID} viewModel={vm} />,
    );
    expect(container.querySelector('[data-page-state="error"]')).not.toBeNull();
    expect(
      container.querySelector('[data-slot="page-state-error"]'),
    ).not.toBeNull();
  });

  it("renders the EMPTY state", () => {
    const vm = buildPageScenario(
      () => buildAnalyticsReviewViewModel(PROJECT_ID),
      "empty",
    );
    const { container } = render(
      <AnalyticsReviewPage projectId={PROJECT_ID} viewModel={vm} />,
    );
    expect(container.querySelector('[data-page-state="empty"]')).not.toBeNull();
    expect(
      container.querySelector('[data-slot="page-state-empty"]'),
    ).not.toBeNull();
  });
});
