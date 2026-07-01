/**
 * Contract tests for the Analytics & Review page (Task 18).
 *
 * Locks the structural invariants the page must satisfy before any
 * pixel tuning (page-specs §10):
 *  - The TopHeader renders in `project-workspace` mode with the
 *    canonical project identity and the six-stage stepper, with the
 *    Review stage active (current stage indicator on the stepper).
 *  - The AnalyticsTabs row exists.
 *  - The Main column renders, in this fixed order:
 *      CoreMetricsRow (7 cards in a single row) →
 *      PrimaryCharts (ViewsTrendChart + ConversionFunnel) →
 *      SecondaryCharts (AudienceProfile donut + AudienceSource
 *      horizontal bars + RetentionCurve) →
 *      KeyMomentsSection.
 *  - The ViewsTrendChart and ConversionFunnel use distinct visual
 *    shapes: trend is a line; funnel is a triangle / funnel.
 *  - The SecondaryCharts render three distinct chart types: donut
 *    (audience profile), horizontal bars (audience source), and
 *    retention curve (monotonically decreasing line).
 *  - The Right column renders AI Analysis → Review History in that
 *    fixed order (NOT an overlay or modal).
 *  - Every chart provides a sr-only textual summary (a11y / D-007).
 *  - The page is wrapped in exactly one AppShell, with the sidebar
 *    marking "项目" as the active nav item.
 *
 * The page is a Server Component. The test renders it inside the
 * shared AppShell the same way `(creator)/layout.tsx` does so the
 * header mode / sidebar-active assertions run against the same DOM a
 * real route render would produce.
 */

import * as React from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import type { AnalyticsViewModel as AnalyticsViewModelType } from "@/types/view-models";

// Stub `next/navigation` — the review-authoring island (module 13 Step 5) mounts
// `useRouter()`. The page renders WITHOUT reviewsWiring here, so the controls are
// inert and the router is never actually used; the stub just satisfies the hook.
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: vi.fn(),
    replace: vi.fn(),
    push: vi.fn(),
    back: vi.fn(),
  }),
}));

// Stub `next/link` so we can assert href values without the Next.js
// runtime mounting a router.
vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...rest
  }: {
    children: ReactNode;
    href: string;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

type AnalyticsReviewPageProps = React.ComponentProps<
  typeof import("./analytics-review-page").AnalyticsReviewPage
>;

// The (creator)/layout already mounts the shared AppShell. For the unit
// test we replicate that wrapper so the "Projects active in sidebar"
// check runs against the same DOM shape a real page render would
// produce. We render with `currentStage="review"` because the page
// IS the Analytics & Review workspace — the active stage must reflect
// the page context, not the canonical `project.currentStage`.
async function renderWorkspace(
  projectId = "project-podcast-launch",
  overrides: Partial<AnalyticsReviewPageProps> = {},
) {
  const { AppShell } = await import("@/components/shell/app-shell");
  const { canonicalDataset } = await import("@/fixtures/canonical");
  const { AnalyticsReviewPage } = await import("./analytics-review-page");
  const project = canonicalDataset.projects.find((p) => p.id === projectId);
  // The Analytics & Review workspace surfaces "review" as the active
  // step in the header stepper; the previous five stages are
  // completed and there is no pending stage from this workspace's
  // perspective.
  const projectStages = STAGE_ORDER.map((stageName) => ({
    id: stageName,
    label: STAGE_LABEL[stageName],
    status:
      stageName === "review"
        ? ("in_progress" as const)
        : ("completed" as const),
  }));
  return render(
    <AppShell
      pathname={`/projects/${projectId}/review`}
      headerMode="project-workspace"
      primaryActionLabel="导出复盘报告"
      project={
        project
          ? {
              projectId: project.id,
              title: project.title,
              stage: "review",
              stageProgressPct: project.progressPct,
              updatedLabel: "最近更新 —",
              starred: project.starred,
            }
          : undefined
      }
      projectStages={projectStages}
    >
      <AnalyticsReviewPage projectId={projectId} {...overrides} />
    </AppShell>,
  );
}

const STAGE_ORDER = [
  "research",
  "planning",
  "script",
  "production",
  "publishing",
  "review",
] as const;

const STAGE_LABEL: Record<(typeof STAGE_ORDER)[number], string> = {
  research: "研究",
  planning: "策划",
  script: "脚本",
  production: "拍摄",
  publishing: "发布",
  review: "复盘",
};

describe("AnalyticsReviewPage", () => {
  afterEach(() => {
    cleanup();
  });

  it("mounts the TopHeader in project-workspace mode", async () => {
    const { container } = await renderWorkspace();
    const header = container.querySelector('[data-slot="app-top-header"]');
    expect(header).not.toBeNull();
    expect(header!.getAttribute("data-mode")).toBe("project-workspace");
  });

  it("surfaces the project identity with a six-stage stepper", async () => {
    const { container } = await renderWorkspace();
    const identity = container.querySelector(
      '[data-slot="header-project-identity"]',
    ) as HTMLElement;
    expect(identity).not.toBeNull();
    expect(identity.textContent ?? "").toContain("Creator 访谈播客启动计划");
    const stepperItems = identity.querySelectorAll(
      '[data-slot="header-stage-stepper"] li',
    );
    expect(stepperItems).toHaveLength(6);
    const expectedStageLabels = ["研究", "策划", "脚本", "拍摄", "发布", "复盘"];
    stepperItems.forEach((item, index) => {
      expect(item.textContent ?? "").toContain(expectedStageLabels[index]);
    });
  });

  it("marks the Review stage as active in the stepper", async () => {
    const { container } = await renderWorkspace();
    const stepper = container.querySelector(
      '[data-slot="header-stage-stepper"]',
    );
    expect(stepper).not.toBeNull();
    const activeItems = stepper!.querySelectorAll(
      '[data-status="in_progress"]',
    );
    expect(activeItems).toHaveLength(1);
    expect((activeItems[0] as HTMLElement).textContent ?? "").toContain("复盘");
  });

  it("renders the AnalyticsTabs row", async () => {
    const { container } = await renderWorkspace();
    const tabs = container.querySelector(
      '[data-slot="analytics-tabs"]',
    ) as HTMLElement;
    expect(tabs).not.toBeNull();
    const triggers = tabs.querySelectorAll('[data-tab-id]');
    expect(triggers.length).toBeGreaterThanOrEqual(1);
  });

  it("renders the CoreMetricsRow with exactly seven cards in a single row", async () => {
    const { container } = await renderWorkspace();
    const row = container.querySelector(
      '[data-slot="core-metrics-row"]',
    ) as HTMLElement;
    expect(row).not.toBeNull();
    const cards = row.querySelectorAll('[data-slot="metric-card"]');
    expect(cards).toHaveLength(7);
  });

  it("renders the PrimaryCharts row with ViewsTrendChart and ConversionFunnel", async () => {
    const { container } = await renderWorkspace();
    const primary = container.querySelector(
      '[data-slot="primary-charts"]',
    ) as HTMLElement;
    expect(primary).not.toBeNull();
    const expectedSlots = [
      "views-trend-chart",
      "conversion-funnel",
    ];
    const orderedNodes = expectedSlots.map((slot) =>
      primary.querySelector(`[data-slot="${slot}"]`),
    );
    expect(orderedNodes.every((node) => node !== null)).toBe(true);
    for (let i = 1; i < orderedNodes.length; i += 1) {
      const node = orderedNodes[i] as Element;
      const previous = orderedNodes[i - 1] as Element;
      const relation = previous.compareDocumentPosition(node);
      expect(relation & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  it("renders the ViewsTrendChart as a line and the ConversionFunnel as a funnel / triangle", async () => {
    const { container } = await renderWorkspace();
    const trend = container.querySelector(
      '[data-slot="views-trend-chart"]',
    ) as HTMLElement;
    expect(trend).not.toBeNull();
    expect(trend.getAttribute("data-shape")).toBe("line");
    const funnel = container.querySelector(
      '[data-slot="conversion-funnel"]',
    ) as HTMLElement;
    expect(funnel).not.toBeNull();
    expect(funnel.getAttribute("data-shape")).toBe("funnel");
  });

  it("renders the SecondaryCharts row with AudienceProfile, AudienceSource, and RetentionCurve in spec order", async () => {
    const { container } = await renderWorkspace();
    const secondary = container.querySelector(
      '[data-slot="secondary-charts"]',
    ) as HTMLElement;
    expect(secondary).not.toBeNull();
    const expectedSlots = [
      "audience-profile",
      "audience-source",
      "retention-curve",
    ];
    const orderedNodes = expectedSlots.map((slot) =>
      secondary.querySelector(`[data-slot="${slot}"]`),
    );
    expect(orderedNodes.every((node) => node !== null)).toBe(true);
    for (let i = 1; i < orderedNodes.length; i += 1) {
      const node = orderedNodes[i] as Element;
      const previous = orderedNodes[i - 1] as Element;
      const relation = previous.compareDocumentPosition(node);
      expect(relation & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  it("renders the three secondary chart types (donut + horizontal bars + retention curve)", async () => {
    const { container } = await renderWorkspace();
    const audience = container.querySelector(
      '[data-slot="audience-profile"]',
    ) as HTMLElement;
    expect(audience).not.toBeNull();
    expect(audience.getAttribute("data-shape")).toBe("donut");

    const source = container.querySelector(
      '[data-slot="audience-source"]',
    ) as HTMLElement;
    expect(source).not.toBeNull();
    expect(source.getAttribute("data-shape")).toBe("horizontal-bars");

    const retention = container.querySelector(
      '[data-slot="retention-curve"]',
    ) as HTMLElement;
    expect(retention).not.toBeNull();
    expect(retention.getAttribute("data-shape")).toBe("retention-curve");
  });

  it("renders the KeyMomentsSection at the bottom of the main column", async () => {
    const { container } = await renderWorkspace();
    const moments = container.querySelector(
      '[data-slot="key-moments-section"]',
    ) as HTMLElement;
    expect(moments).not.toBeNull();
    const rows = moments.querySelectorAll('[data-slot="key-moment-row"]');
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  it("preserves the approved order of Main column blocks (metrics → primary → secondary → key moments)", async () => {
    const { container } = await renderWorkspace();
    const main = container.querySelector(
      '[data-slot="analytics-main-column"]',
    ) as HTMLElement;
    expect(main).not.toBeNull();
    const expectedSlots = [
      "core-metrics-row",
      "primary-charts",
      "secondary-charts",
      "key-moments-section",
    ];
    const orderedNodes = expectedSlots.map((slot) =>
      main.querySelector(`[data-slot="${slot}"]`),
    );
    expect(orderedNodes.every((node) => node !== null)).toBe(true);
    for (let i = 1; i < orderedNodes.length; i += 1) {
      const node = orderedNodes[i] as Element;
      const previous = orderedNodes[i - 1] as Element;
      const relation = previous.compareDocumentPosition(node);
      expect(relation & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  it("renders the right rail with InsightCard and ReviewHistoryCard in that order", async () => {
    const { container } = await renderWorkspace();
    const rightRail = container.querySelector(
      '[data-slot="analytics-right-rail"]',
    ) as HTMLElement;
    expect(rightRail).not.toBeNull();
    const expectedSlots = ["ai-analysis-card", "review-history-card"];
    const orderedNodes = expectedSlots.map((slot) =>
      rightRail.querySelector(`[data-slot="${slot}"]`),
    );
    expect(orderedNodes.every((node) => node !== null)).toBe(true);
    for (let i = 1; i < orderedNodes.length; i += 1) {
      const node = orderedNodes[i] as Element;
      const previous = orderedNodes[i - 1] as Element;
      const relation = previous.compareDocumentPosition(node);
      expect(relation & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    // Each right-rail card surfaces at least one item so the slot is
    // not an empty shell.
    expect(
      rightRail
        .querySelector('[data-slot="ai-analysis-card"]')
        ?.querySelectorAll('[data-slot="ai-analysis-item"]').length ?? 0,
    ).toBeGreaterThanOrEqual(1);
    expect(
      rightRail
        .querySelector('[data-slot="review-history-card"]')
        ?.querySelectorAll('[data-slot="review-history-item"]').length ?? 0,
    ).toBeGreaterThanOrEqual(1);
  });

  it("does not promote the AI analysis into a modal / overlay", async () => {
    const { container } = await renderWorkspace();
    // The AI analysis lives inside the right rail — never as a
    // top-layer overlay, modal, or portal slot.
    const ai = container.querySelector(
      '[data-slot="ai-analysis-card"]',
    ) as HTMLElement;
    expect(ai).not.toBeNull();
    expect(ai.getAttribute("data-overlay")).not.toBe("true");
    // No dialog role appears for the analysis card.
    expect(ai.getAttribute("role")).not.toBe("dialog");
  });

  it("provides a sr-only textual summary for every chart (a11y)", async () => {
    const { container } = await renderWorkspace();
    const chartSlots = [
      "views-trend-chart",
      "conversion-funnel",
      "audience-profile",
      "audience-source",
      "retention-curve",
    ];
    for (const slot of chartSlots) {
      const chart = container.querySelector(`[data-slot="${slot}"]`) as HTMLElement;
      expect(chart).not.toBeNull();
      const summary = chart.querySelector('[data-slot="chart-summary"]');
      expect(summary).not.toBeNull();
      expect(summary!.classList.contains("sr-only")).toBe(true);
      expect((summary!.textContent ?? "").length).toBeGreaterThan(0);
    }
  });

  it("is wrapped in the shared AppShell with exactly one sidebar and one top header", async () => {
    const { container } = await renderWorkspace();
    const sidebars = container.querySelectorAll('[data-slot="app-sidebar"]');
    const headers = container.querySelectorAll('[data-slot="app-top-header"]');
    expect(sidebars).toHaveLength(1);
    expect(headers).toHaveLength(1);
  });

  it("marks the Projects nav item as the active page in the sidebar", async () => {
    await renderWorkspace();
    const nav = screen.getByRole("navigation", { name: "主要导航" });
    const active = within(nav).getByRole("link", { current: "page" });
    expect(active).toHaveAttribute("href", "/projects");
    expect(active.textContent?.trim()).toBe("项目");
  });

  // 复盘每作品评论 (T-030 §10 / D6) — 评论区渲染 + 空态诚实。
  describe("作品评论区 (T-030 D6)", () => {
    async function vmWith(
      comments: AnalyticsViewModelType["comments"],
    ): Promise<AnalyticsViewModelType> {
      const { buildAnalyticsReviewViewModel } = await import(
        "@/fixtures/selectors"
      );
      return {
        ...buildAnalyticsReviewViewModel("project-podcast-launch"),
        comments,
      };
    }

    it("有评论 → 列出评论文本(+ demand_tag)", async () => {
      const viewModel = await vmWith([
        {
          id: "sig-1",
          text: "求 RAG 落地教程",
          demandTag: "教程需求",
          createdAt: "2026-06-30T02:00:00.000Z",
        },
        {
          id: "sig-2",
          text: "这条能变现吗",
          demandTag: null,
          createdAt: "2026-06-30T01:00:00.000Z",
        },
      ]);
      const { container } = await renderWorkspace("project-podcast-launch", {
        viewModel,
      });
      const section = container.querySelector(
        '[data-slot="review-comments-section"]',
      );
      expect(section).not.toBeNull();
      expect(section!.getAttribute("data-empty")).toBe("false");
      const items = container.querySelectorAll(
        '[data-slot="review-comment-item"]',
      );
      expect(items).toHaveLength(2);
      expect(section!.textContent ?? "").toContain("求 RAG 落地教程");
      expect(section!.textContent ?? "").toContain("这条能变现吗");
      // demand_tag 若有则展示;无则不摆。
      const tags = container.querySelectorAll(
        '[data-slot="review-comment-demand-tag"]',
      );
      expect(tags).toHaveLength(1);
      expect(tags[0].textContent ?? "").toContain("教程需求");
    });

    it("无评论 → 诚实空态文案(不摆假评论,引导去任务中心采集)", async () => {
      const viewModel = await vmWith([]);
      const { container } = await renderWorkspace("project-podcast-launch", {
        viewModel,
      });
      const section = container.querySelector(
        '[data-slot="review-comments-section"]',
      );
      expect(section).not.toBeNull();
      expect(section!.getAttribute("data-empty")).toBe("true");
      const empty = container.querySelector(
        '[data-slot="review-comments-empty"]',
      );
      expect(empty).not.toBeNull();
      expect(empty!.textContent ?? "").toContain("未采集该作品评论");
      expect(empty!.textContent ?? "").toContain("抓我作品评论");
      // 没有任何评论条目(不摆假)。
      expect(
        container.querySelectorAll('[data-slot="review-comment-item"]'),
      ).toHaveLength(0);
    });
  });
});
