/**
 * Interaction + state + derived-metric tests for the Analytics & Review
 * page (Increment 4 functional remediation / R1-4).
 *
 * Covers:
 *  - [T-116a] 去假维度 tab 后:断言那排「维度 tab」已移除(单一诚实视图),
 *  - the chart tab toggle (趋势 / 漏斗),
 *  - review-history row selection([T-116b] 关键时刻区已移除,不再断言其选中),
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
import { afterEach, describe, expect, it, vi } from "vitest";

// Stub `next/navigation` — the review-authoring island (module 13 Step 5) mounts
// `useRouter()`. These tests render the page WITHOUT reviewsWiring, so the controls
// are inert and the router is never used; the stub just satisfies the hook.
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: vi.fn(),
    replace: vi.fn(),
    push: vi.fn(),
    back: vi.fn(),
  }),
}));

import { canonicalDataset } from "@/fixtures/canonical";
import { buildAnalyticsReviewViewModel } from "@/fixtures/selectors";
import { buildPageScenario } from "@/fixtures/scenarios";
import { AnalyticsReviewPage } from "./analytics-review-page";
import { buildAnalyticsReviewViewModelFromOp } from "./analytics-review-view-model";

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

  it("derives an honest funnel (no fabricated 曝光/点击/转化 fractions)", () => {
    const views = aggregateMetric(PROJECT_ID, "views");
    const vm = buildAnalyticsReviewViewModel(PROJECT_ID);
    // The canonical dataset only has views/likes/comments — no favorites/ctr —
    // so the honest fixture funnel is exactly 播放 → 互动 (no invented 曝光/点击/
    // 转化 stages). 播放 = total views on top.
    expect(vm.conversionFunnel.map((s) => s.label)).toEqual(["播放", "互动"]);
    expect(vm.conversionFunnel[0]?.value).toBe(views);
  });

  it("re-derives the views trend total from total views", () => {
    const views = aggregateMetric(PROJECT_ID, "views");
    const vm = buildAnalyticsReviewViewModel(PROJECT_ID, "all");
    const trendTotal = vm.viewsTrend.reduce((acc, row) => acc + row.value, 0);
    // T-035b: the trend is now a REAL per-capture-date series (no fabricated
    // weekday curve). The canonical demo captures on a single date → a single
    // point whose value equals the aggregated views exactly.
    expect(trendTotal).toBe(views);
  });

  // T-035b — 播放趋势诚实化:真日级序列 + 单快照标记,绝不用假 weekday 权重铺假曲线。
  it("单采集日 → viewsTrendMode single + 单点(不铺假曲线)", () => {
    const vm = buildAnalyticsReviewViewModel(PROJECT_ID, "all");
    // Canonical demo snapshots all share one capture date → single mode.
    expect(vm.viewsTrendMode).toBe("single");
    expect(vm.viewsTrend).toHaveLength(1);
  });

  it("op 路径:多采集日快照 → viewsTrendMode daily + 每日一点(真日级)", () => {
    // Two capture dates for the SAME publication → a real 2-point daily series.
    const snapshots = [
      {
        id: "s1",
        publicationId: "pub-x",
        capturedAt: "2026-06-10T10:00:00.000Z",
        source: "platform_api",
        rawMetrics: { views: 1000 },
      },
      {
        id: "s2",
        publicationId: "pub-x",
        capturedAt: "2026-06-12T10:00:00.000Z",
        source: "platform_api",
        rawMetrics: { views: 2600 },
      },
    ];
    const vm = buildAnalyticsReviewViewModelFromOp("real-project-xyz", snapshots);
    expect(vm.viewsTrendMode).toBe("daily");
    expect(vm.viewsTrend.map((p) => p.label)).toEqual(["06-10", "06-12"]);
    expect(vm.viewsTrend.map((p) => p.value)).toEqual([1000, 2600]);
  });

  it("op 路径:单采集日多发布 → single(当天各发布 views 求和,不编日曲线)", () => {
    const snapshots = [
      {
        id: "s1",
        publicationId: "pub-a",
        capturedAt: "2026-06-12T10:00:00.000Z",
        source: "platform_api",
        rawMetrics: { views: 1000 },
      },
      {
        id: "s2",
        publicationId: "pub-b",
        capturedAt: "2026-06-12T11:00:00.000Z",
        source: "platform_api",
        rawMetrics: { views: 500 },
      },
    ];
    const vm = buildAnalyticsReviewViewModelFromOp("real-project-xyz", snapshots);
    expect(vm.viewsTrendMode).toBe("single");
    expect(vm.viewsTrend).toHaveLength(1);
    expect(vm.viewsTrend[0]).toEqual({ label: "06-12", value: 1500 });
  });
});

describe("AnalyticsReviewPage interactions", () => {
  // [T-116a] 去假维度 tab:复盘页改单一诚实视图。断言那排「维度 tab」已彻底移除
  // (无 page-tabs / data-tab-id 残骸),核心指标仍是 7 卡。
  it("does NOT render the removed 维度-tab row; keeps the 7 core metric cards", () => {
    const { container } = render(<AnalyticsReviewPage projectId={PROJECT_ID} />);
    expect(container.querySelector('[data-slot="analytics-tabs"]')).toBeNull();
    expect(container.querySelector('[data-slot="page-tabs"]')).toBeNull();
    expect(container.querySelector('[data-tab-id]')).toBeNull();
    const cards = container.querySelectorAll(
      '[data-slot="core-metrics-row"] [data-slot="metric-card"]',
    );
    expect(cards).toHaveLength(7);
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

  // [T-116b] 关键时刻区已移除(无真数据源 op)—— 断言它不再渲染。
  it("does NOT render the removed 关键时刻 region", () => {
    const { container } = render(<AnalyticsReviewPage projectId={PROJECT_ID} />);
    expect(
      container.querySelector('[data-slot="key-moments-section"]'),
    ).toBeNull();
    expect(container.querySelector('[data-slot="key-moment-row"]')).toBeNull();
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

// Module 11 Task 5/6 — the server read switch builds the page ViewModel from the
// real `analytics.projects.get` payload (a MetricSnapshot[]). [T-116b] 装饰按钮
// 「查看全部」已删除;top-published cards 仍 data-inert="decorative"(纯展示,无导航)。
describe("AnalyticsReviewPage analytics.projects.get-backed ViewModel", () => {
  it("renders from a ViewModel derived from an analytics.projects.get-shaped payload", () => {
    const canonicalId = resolveCanonicalId(PROJECT_ID);
    const publicationIds = (() => {
      const project = canonicalDataset.projects.find((p) => p.id === canonicalId);
      if (!project) return [] as string[];
      const outputIds = canonicalDataset.contentOutputs
        .filter((o) => o.projectId === project.id)
        .map((o) => o.id);
      return canonicalDataset.publications
        .filter((pub) => outputIds.includes(pub.contentOutputId))
        .map((pub) => pub.id);
    })();
    // An `analytics.projects.get`-shaped payload (metricSnapshotResource[]) for the
    // project's publications.
    const snapshots = canonicalDataset.metricSnapshots
      .filter((s) => publicationIds.includes(s.publicationId))
      .map((s) => ({
        id: s.id,
        publicationId: s.publicationId,
        capturedAt: s.capturedAt,
        source: s.source,
        rawMetrics: s.rawMetrics as Record<string, unknown>,
      }));
    expect(snapshots.length).toBeGreaterThan(0);

    const vm = buildAnalyticsReviewViewModelFromOp(PROJECT_ID, snapshots);
    const { container } = render(
      <AnalyticsReviewPage projectId={PROJECT_ID} viewModel={vm} />,
    );
    // The page rendered the metric row from the op-backed ViewModel.
    expect(
      container.querySelectorAll(
        '[data-slot="core-metrics-row"] [data-slot="metric-card"]',
      ),
    ).toHaveLength(7);
  });

  it("removes the 查看全部 decorative button; keeps top-published cards inert (decorative)", () => {
    const { container } = render(<AnalyticsReviewPage projectId={PROJECT_ID} />);
    // [T-116b] 纯装饰「查看全部」按钮已删除。
    expect(
      container.querySelector('[data-slot="top-published-view-all"]'),
    ).toBeNull();

    const cards = container.querySelectorAll<HTMLLIElement>(
      '[data-slot="top-published-card"]',
    );
    expect(cards.length).toBeGreaterThan(0);
    cards.forEach((card) => {
      expect(card.getAttribute("data-inert")).toBe("decorative");
      expect(card.onclick).toBeNull();
    });
  });
});

// [T-116c] AI 分析卡:真本期渲染 + 诚实标题 + 诚实空态 + CTA。
describe("AnalyticsReviewPage AI 分析卡 (T-116c)", () => {
  it("标题诚实(基于本条视频),有要点 → 逐条渲染", () => {
    const base = buildAnalyticsReviewViewModel(PROJECT_ID);
    const vm = {
      ...base,
      aiAnalysis: [
        { id: "ri-1", title: "开头钩子扎实", body: "前 3 秒抛冲突" },
        { id: "ri-2", title: "结尾 CTA 明确", body: "" },
      ],
    };
    const { container } = render(
      <AnalyticsReviewPage projectId={PROJECT_ID} viewModel={vm} />,
    );
    const card = container.querySelector('[data-slot="ai-analysis-card"]')!;
    expect(card.getAttribute("data-empty")).toBe("false");
    // 诚实标题:不再写「本期复盘数据」这种在全站数据上撒谎的话。
    expect(card.textContent ?? "").toContain("基于本条视频的复盘分析");
    expect(card.textContent ?? "").not.toContain("本期复盘数据");
    expect(
      card.querySelectorAll('[data-slot="ai-analysis-item"]'),
    ).toHaveLength(2);
    // 空 body 项不摆空段。
    expect(card.textContent ?? "").toContain("前 3 秒抛冲突");
  });

  it("本视频没跑过复盘 → 诚实空态 + 「帮我复盘」CTA(不摆假要点)", () => {
    const base = buildAnalyticsReviewViewModel(PROJECT_ID);
    const vm = { ...base, aiAnalysis: [] };
    const { container } = render(
      <AnalyticsReviewPage projectId={PROJECT_ID} viewModel={vm} />,
    );
    const card = container.querySelector('[data-slot="ai-analysis-card"]')!;
    expect(card.getAttribute("data-empty")).toBe("true");
    // 没有任何要点条目(不摆假)。
    expect(
      card.querySelectorAll('[data-slot="ai-analysis-item"]'),
    ).toHaveLength(0);
    const empty = card.querySelector('[data-slot="ai-analysis-empty"]')!;
    expect(empty).not.toBeNull();
    expect(empty.textContent ?? "").toContain("本条视频还没生成 AI 复盘要点");
    // CTA 指向 Copilot review.analyze 链路(带本项目 selId)。
    const cta = card.querySelector<HTMLAnchorElement>(
      '[data-slot="ai-analysis-cta"]',
    )!;
    expect(cta).not.toBeNull();
    expect(cta.getAttribute("href") ?? "").toContain("surface=review");
    expect(cta.getAttribute("href") ?? "").toContain("fn=review.analyze");
    expect(cta.getAttribute("href") ?? "").toContain(`selId=${PROJECT_ID}`);
  });
});
