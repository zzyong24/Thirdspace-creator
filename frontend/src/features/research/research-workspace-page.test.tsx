/**
 * Contract tests for the Research Workspace page (Task 13).
 *
 * Locks the structural invariants the page must satisfy before any
 * pixel tuning (page-specs §5):
 *  - The TopHeader renders in `project-workspace` mode with the
 *    canonical project identity "AI Native Browser 深度解析" and the
 *    six-stage stepper, with the Research stage active (current stage
 *    indicator on the stepper, primary action "进入下一步:策划构思").
 *  - The Main column hosts, in this fixed order:
 *      ProjectIdeaCard → TrendBackgroundSection (3 ResearchSummaryCard
 *      in a row) → CompetitorAnalysisTable → ResearchCollectionSection
 *      (with TypeTabs ordered 全部 / 文章 / 视频 / 报告 / 播客 followed by
 *      ResearchSourceRow[]).
 *  - The Right column hosts, in this fixed order: ResearchNotesCard,
 *    EvidenceCollectionCard, RelatedTagsCard.
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

// The right-rail notes/evidence cards are now Client islands (F2a/F2b) that call
// `useRouter()`. Stub `next/navigation` so they mount without a real App Router
// provider; these structural tests never trigger a write, so a no-op router suffices.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn(), back: vi.fn() }),
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

type ResearchWorkspacePageProps = React.ComponentProps<
  typeof import("./research-workspace-page").ResearchWorkspacePage
>;

// The (creator)/layout already mounts the shared AppShell. For the unit
// test we replicate that wrapper so the "Projects active in sidebar"
// check runs against the same DOM shape a real page render would
// produce. We render with `currentStage="research"` because the page
// IS the Research Workspace — the active stage must reflect the page
// context, not the canonical `project.currentStage` (which has moved
// past research in the canonical dataset).
async function renderWorkspace(
  projectId = "project-ainativebrowser",
  overrides: Partial<ResearchWorkspacePageProps> = {},
) {
  const { AppShell } = await import("@/components/shell/app-shell");
  const { canonicalDataset } = await import("@/fixtures/canonical");
  const { ResearchWorkspacePage } = await import("./research-workspace-page");
  const project = canonicalDataset.projects.find((p) => p.id === projectId);
  // The Research Workspace surfaces "research" as the active step in
  // the header stepper; the other five stages are still pending from
  // the perspective of this workspace.
  const projectStages = STAGE_ORDER.map((stageName, index) => ({
    id: stageName,
    label: STAGE_LABEL[stageName],
    status:
      index === 0
        ? ("in_progress" as const)
        : ("pending" as const),
  }));
  return render(
    <AppShell
      pathname={`/projects/${projectId}/research`}
      headerMode="project-workspace"
      primaryActionLabel="进入下一步:策划构思"
      project={
        project
          ? {
              projectId: project.id,
              title: project.title,
              stage: "research",
              stageProgressPct: project.progressPct,
              updatedLabel: "最近更新 —",
              starred: project.starred,
            }
          : undefined
      }
      projectStages={projectStages}
    >
      <ResearchWorkspacePage projectId={projectId} {...overrides} />
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

describe("ResearchWorkspacePage", () => {
  afterEach(() => {
    cleanup();
  });

  it("mounts the TopHeader in project-workspace mode", async () => {
    const { container } = await renderWorkspace();
    const header = container.querySelector('[data-slot="app-top-header"]');
    expect(header).not.toBeNull();
    expect(header!.getAttribute("data-mode")).toBe("project-workspace");
  });

  it("surfaces the project identity AI Native Browser with a six-stage stepper", async () => {
    const { container } = await renderWorkspace();
    const identity = container.querySelector(
      '[data-slot="header-project-identity"]',
    ) as HTMLElement;
    expect(identity).not.toBeNull();
    expect(identity.textContent ?? "").toContain("AI Native Browser 深度解析");
    // The TopHeader stepper in project-workspace mode lists six stages.
    const stepperItems = identity.querySelectorAll(
      '[data-slot="header-stage-stepper"] li',
    );
    expect(stepperItems).toHaveLength(6);
    const expectedStageLabels = ["研究", "策划", "脚本", "拍摄", "发布", "复盘"];
    stepperItems.forEach((item, index) => {
      expect(item.textContent ?? "").toContain(expectedStageLabels[index]);
    });
  });

  it("marks the Research stage as active in the stepper", async () => {
    const { container } = await renderWorkspace();
    // The TopHeader stepper surfaces the active stage via
    // `data-status="in_progress"` on the matching <li>. The Research
    // Workspace must mark "研究" as the active stage.
    const stepper = container.querySelector(
      '[data-slot="header-stage-stepper"]',
    );
    expect(stepper).not.toBeNull();
    const activeItems = stepper!.querySelectorAll(
      '[data-status="in_progress"]',
    );
    expect(activeItems).toHaveLength(1);
    expect((activeItems[0] as HTMLElement).textContent ?? "").toContain(
      "研究",
    );
  });

  it("exposes the 进入下一步:策划构思 primary action in the header", async () => {
    const { container } = await renderWorkspace();
    const header = container.querySelector(
      '[data-slot="app-top-header"]',
    ) as HTMLElement;
    expect(header).not.toBeNull();
    const primaryAction = within(header).getByRole("link", {
      name: /进入下一步:策划构思/,
    });
    expect(primaryAction).toHaveAttribute(
      "href",
      "/projects/project-ainativebrowser/planning",
    );
  });

  it("renders the ProjectIdeaCard at the top of the Main column", async () => {
    const { container } = await renderWorkspace();
    const main = container.querySelector(
      '[data-slot="research-main-column"]',
    ) as HTMLElement;
    expect(main).not.toBeNull();
    const ideaCard = main.querySelector(
      '[data-slot="project-idea-card"]',
    ) as HTMLElement;
    expect(ideaCard).not.toBeNull();
    // The project idea card should surface the canonical project title.
    expect(ideaCard.textContent ?? "").toContain("AI Native Browser 深度解析");
  });

  it("renders exactly three ResearchSummaryCard trend cards in a row", async () => {
    const { container } = await renderWorkspace();
    const trendSection = container.querySelector(
      '[data-slot="trend-background-section"]',
    ) as HTMLElement;
    expect(trendSection).not.toBeNull();
    const cards = trendSection.querySelectorAll(
      '[data-slot="research-summary-card"]',
    );
    expect(cards).toHaveLength(3);
  });

  it("renders the CompetitorAnalysisTable with the required columns and threat-level rows", async () => {
    const { container } = await renderWorkspace();
    const table = container.querySelector(
      '[data-slot="competitor-analysis-table"]',
    ) as HTMLElement;
    expect(table).not.toBeNull();
    // The locked column set: 竞品名称 / 平台 / 定位 / 优势 / 劣势 / 威胁等级.
    const headerCells = table.querySelectorAll("thead th");
    const headerLabels = Array.from(headerCells).map(
      (cell) => cell.textContent ?? "",
    );
    expect(headerLabels).toEqual([
      "竞品名称",
      "平台",
      "定位",
      "优势",
      "劣势",
      "威胁等级",
    ]);
    // At least one row should expose a threat-level badge; the spec
    // locks the threat-level enum to low / medium / high.
    const rows = table.querySelectorAll(
      '[data-slot="competitor-row"]',
    );
    expect(rows.length).toBeGreaterThanOrEqual(2);
    const threatBadges = table.querySelectorAll(
      '[data-slot="competitor-threat"]',
    );
    expect(threatBadges.length).toBe(rows.length);
    const threatLevels = new Set(
      Array.from(threatBadges).map((badge) => badge.getAttribute("data-threat")),
    );
    expect([...threatLevels].sort()).toEqual(["high", "low", "medium"]);
  });

  it("renders the ResearchCollection TypeTabs in spec order (全部/文章/视频/报告/播客)", async () => {
    const { container } = await renderWorkspace();
    const section = container.querySelector(
      '[data-slot="research-collection-section"]',
    ) as HTMLElement;
    expect(section).not.toBeNull();
    const tabTriggers = section.querySelectorAll(
      '[data-slot="page-tabs"] [data-tab-id]',
    );
    const tabIds = Array.from(tabTriggers).map((tab) =>
      tab.getAttribute("data-tab-id"),
    );
    expect(tabIds).toEqual(["all", "article", "video", "report", "podcast"]);
    const tabLabels = Array.from(tabTriggers).map(
      (tab) => tab.textContent ?? "",
    );
    expect(tabLabels).toEqual(["全部", "文章", "视频", "报告", "播客"]);
    // At least one ResearchSourceRow is rendered (the default tab).
    const rows = section.querySelectorAll(
      '[data-slot="research-source-row"]',
    );
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  it("renders the right rail with ResearchNotesCard, EvidenceCollectionCard, and RelatedTagsCard in order", async () => {
    const { container } = await renderWorkspace();
    const rightRail = container.querySelector(
      '[data-slot="research-right-rail"]',
    ) as HTMLElement;
    expect(rightRail).not.toBeNull();
    const expectedSlots = [
      "research-notes-card",
      "evidence-collection-card",
      "related-tags-card",
    ];
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
    // Each right-rail card surfaces at least one item so the slot is not
    // an empty shell.
    expect(
      rightRail
        .querySelector('[data-slot="research-notes-card"]')
        ?.querySelectorAll('[data-slot="research-note-row"]').length ?? 0,
    ).toBeGreaterThanOrEqual(1);
    expect(
      rightRail
        .querySelector('[data-slot="evidence-collection-card"]')
        ?.querySelectorAll('[data-slot="evidence-row"]').length ?? 0,
    ).toBeGreaterThanOrEqual(1);
    expect(
      rightRail
        .querySelector('[data-slot="related-tags-card"]')
        ?.querySelectorAll('[data-slot="related-tag"]').length ?? 0,
    ).toBeGreaterThanOrEqual(1);
  });

  it("preserves the approved order of Main column blocks (idea → trend → competitor → collection)", async () => {
    const { container } = await renderWorkspace();
    const main = container.querySelector(
      '[data-slot="research-main-column"]',
    ) as HTMLElement;
    expect(main).not.toBeNull();
    const expectedSlots = [
      "project-idea-card",
      "trend-background-section",
      "competitor-analysis-table",
      "research-collection-section",
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

  it("does not expose a knowledge-base layout or chat-style research UI", async () => {
    const { container } = await renderWorkspace();
    // D-009 / spec invariant: research must not become the Knowledge page.
    expect(
      container.querySelector('[data-slot="knowledge-page"]'),
    ).toBeNull();
    // No chat-style composer on this page.
    const composer = container.querySelector('[data-slot="chat-composer"]');
    expect(composer).toBeNull();
    // No knowledge-graph canvas.
    expect(
      container.querySelector('[data-slot="knowledge-graph"]'),
    ).toBeNull();
  });
});
