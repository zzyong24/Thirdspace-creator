/**
 * Contract tests for the Planning Workspace page (Task 14).
 *
 * Locks the structural invariants the page must satisfy before any
 * pixel tuning (page-specs §6):
 *  - The TopHeader renders in `project-workspace` mode with the
 *    canonical project identity "AI Native Browser 深度解析" and the
 *    six-stage stepper, with the Planning stage active (current stage
 *    indicator on the stepper, primary action "进入下一步:脚本撰写").
 *  - The Planning Tabs row exposes exactly five tabs in the locked
 *    spec order 内容合同 / 论点树 / 证据地图 / 受众洞察 / 差异化亮点.
 *  - The Main column hosts, in this fixed order:
 *      ContentContractSection (4 ContractCard in a row:
 *      受众定位 / 价值主张 / 核心节奏 / 行动召唤) → CoreThesisCard
 *      (a separate emphasised card) → ThesisTreeSection (central root
 *      node with 4 columns of branches).
 *  - The Right rail hosts, in this fixed order: EvidenceMapCard, then
 *    KeyMaterialsCard.
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

type PlanningWorkspacePageProps = React.ComponentProps<
  typeof import("./planning-workspace-page").PlanningWorkspacePage
>;

// The (creator)/layout already mounts the shared AppShell. For the unit
// test we replicate that wrapper so the "Projects active in sidebar"
// check runs against the same DOM shape a real page render would
// produce. We render with `currentStage="planning"` because the page
// IS the Planning Workspace — the active stage must reflect the page
// context, not the canonical `project.currentStage` (which has moved
// past planning in the canonical dataset).
async function renderWorkspace(
  projectId = "project-ainativebrowser",
  overrides: Partial<PlanningWorkspacePageProps> = {},
) {
  const { AppShell } = await import("@/components/shell/app-shell");
  const { canonicalDataset } = await import("@/fixtures/canonical");
  const { PlanningWorkspacePage } = await import("./planning-workspace-page");
  const project = canonicalDataset.projects.find((p) => p.id === projectId);
  // The Planning Workspace surfaces "planning" as the active step in
  // the header stepper; the other five stages are still pending from
  // the perspective of this workspace.
  const projectStages = STAGE_ORDER.map((stageName) => ({
    id: stageName,
    label: STAGE_LABEL[stageName],
    status:
      stageName === "planning"
        ? ("in_progress" as const)
        : ("pending" as const),
  }));
  return render(
    <AppShell
      pathname={`/projects/${projectId}/planning`}
      headerMode="project-workspace"
      primaryActionLabel="进入下一步:脚本撰写"
      project={
        project
          ? {
              projectId: project.id,
              title: project.title,
              stage: "planning",
              stageProgressPct: project.progressPct,
              updatedLabel: "最近更新 —",
              starred: project.starred,
            }
          : undefined
      }
      projectStages={projectStages}
    >
      <PlanningWorkspacePage projectId={projectId} {...overrides} />
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

describe("PlanningWorkspacePage", () => {
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
    const stepperItems = identity.querySelectorAll(
      '[data-slot="header-stage-stepper"] li',
    );
    expect(stepperItems).toHaveLength(6);
    const expectedStageLabels = ["研究", "策划", "脚本", "拍摄", "发布", "复盘"];
    stepperItems.forEach((item, index) => {
      expect(item.textContent ?? "").toContain(expectedStageLabels[index]);
    });
  });

  it("marks the Planning stage as active in the stepper", async () => {
    const { container } = await renderWorkspace();
    const stepper = container.querySelector(
      '[data-slot="header-stage-stepper"]',
    );
    expect(stepper).not.toBeNull();
    const activeItems = stepper!.querySelectorAll(
      '[data-status="in_progress"]',
    );
    expect(activeItems).toHaveLength(1);
    expect((activeItems[0] as HTMLElement).textContent ?? "").toContain(
      "策划",
    );
  });

  it("exposes the 进入下一步:脚本撰写 primary action in the header", async () => {
    const { container } = await renderWorkspace();
    const header = container.querySelector(
      '[data-slot="app-top-header"]',
    ) as HTMLElement;
    expect(header).not.toBeNull();
    const primaryAction = within(header).getByRole("link", {
      name: /进入下一步:脚本撰写/,
    });
    expect(primaryAction).toHaveAttribute(
      "href",
      "/projects/project-ainativebrowser/script",
    );
  });

  it("renders the Planning Tabs in spec order (内容合同/论点树/证据地图/受众洞察/差异化亮点)", async () => {
    const { container } = await renderWorkspace();
    const tabsSection = container.querySelector(
      '[data-slot="planning-tabs"]',
    ) as HTMLElement;
    expect(tabsSection).not.toBeNull();
    const tabTriggers = tabsSection.querySelectorAll(
      '[data-slot="page-tabs"] [data-tab-id]',
    );
    expect(tabTriggers).toHaveLength(5);
    const tabIds = Array.from(tabTriggers).map((tab) =>
      tab.getAttribute("data-tab-id"),
    );
    expect(tabIds).toEqual([
      "content-contract",
      "thesis-tree",
      "evidence-map",
      "audience-insight",
      "differentiation",
    ]);
    const tabLabels = Array.from(tabTriggers).map(
      (tab) => tab.textContent ?? "",
    );
    expect(tabLabels).toEqual([
      "内容合同",
      "论点树",
      "证据地图",
      "受众洞察",
      "差异化亮点",
    ]);
  });

  it("renders exactly four ContractCards in the ContentContractSection in spec order", async () => {
    const { container } = await renderWorkspace();
    const section = container.querySelector(
      '[data-slot="content-contract-section"]',
    ) as HTMLElement;
    expect(section).not.toBeNull();
    const cards = section.querySelectorAll('[data-slot="contract-card"]');
    expect(cards).toHaveLength(4);
    const expectedContractTitles = [
      "受众定位",
      "价值主张",
      "核心节奏",
      "行动召唤",
    ];
    const renderedTitles = Array.from(cards).map((card) => {
      const titleNode = (card as HTMLElement).querySelector(
        '[data-slot="contract-card-title"]',
      );
      return titleNode?.textContent ?? "";
    });
    expect(renderedTitles).toEqual(expectedContractTitles);
  });

  it("renders the CoreThesisCard as a separate, emphasised card outside the contract row", async () => {
    const { container } = await renderWorkspace();
    const coreThesis = container.querySelector(
      '[data-slot="core-thesis-card"]',
    ) as HTMLElement;
    expect(coreThesis).not.toBeNull();
    // Core Thesis lives OUTSIDE the ContentContractSection so it never
    // gets merged with the four contract cards (D-013 invariant).
    const contractSection = container.querySelector(
      '[data-slot="content-contract-section"]',
    ) as HTMLElement;
    expect(contractSection).not.toBeNull();
    expect(
      contractSection.querySelector('[data-slot="core-thesis-card"]'),
    ).toBeNull();
    // The Core Thesis card surfaces the canonical thesis title and body.
    expect(coreThesis.textContent ?? "").toContain("核心论点");
  });

  it("renders the ThesisTreeSection with a central root node and exactly 4 thesis columns", async () => {
    const { container } = await renderWorkspace();
    const section = container.querySelector(
      '[data-slot="thesis-tree-section"]',
    ) as HTMLElement;
    expect(section).not.toBeNull();
    // The structured tree has a central root node.
    const root = section.querySelector(
      '[data-slot="thesis-tree-root"]',
    ) as HTMLElement;
    expect(root).not.toBeNull();
    // Exactly 4 branch columns, NOT a free canvas.
    const columns = section.querySelectorAll('[data-slot="thesis-column"]');
    expect(columns).toHaveLength(4);
    const expectedColumnTitles = [
      "核心论点",
      "支持依据",
      "证据",
      "反驳",
    ];
    const renderedColumnTitles = Array.from(columns).map((col) => {
      const titleNode = (col as HTMLElement).querySelector(
        '[data-slot="thesis-column-title"]',
      );
      return titleNode?.textContent ?? "";
    });
    expect(renderedColumnTitles).toEqual(expectedColumnTitles);
    // Each column carries at least one node so it is not an empty shell.
    columns.forEach((col) => {
      const nodes = (col as HTMLElement).querySelectorAll(
        '[data-slot="thesis-node"]',
      );
      expect(nodes.length).toBeGreaterThanOrEqual(1);
    });
  });

  it("preserves the approved order of Main column blocks (contract → core thesis → thesis tree)", async () => {
    const { container } = await renderWorkspace();
    const main = container.querySelector(
      '[data-slot="planning-main-column"]',
    ) as HTMLElement;
    expect(main).not.toBeNull();
    const expectedSlots = [
      "content-contract-section",
      "core-thesis-card",
      "thesis-tree-section",
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

  it("renders the right rail with EvidenceMapCard and KeyMaterialsCard in order", async () => {
    const { container } = await renderWorkspace();
    const rightRail = container.querySelector(
      '[data-slot="planning-right-rail"]',
    ) as HTMLElement;
    expect(rightRail).not.toBeNull();
    const expectedSlots = ["evidence-map-card", "key-materials-card"];
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
        .querySelector('[data-slot="evidence-map-card"]')
        ?.querySelectorAll('[data-slot="evidence-row"]').length ?? 0,
    ).toBeGreaterThanOrEqual(1);
    expect(
      rightRail
        .querySelector('[data-slot="key-materials-card"]')
        ?.querySelectorAll('[data-slot="key-material-row"]').length ?? 0,
    ).toBeGreaterThanOrEqual(1);
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

  it("does not replace the structured thesis tree with a free canvas", async () => {
    const { container } = await renderWorkspace();
    // D-013: planning must not become a free-canvas or graph-style
    // thesis page. We assert there is no `free-canvas` slot and no
    // knowledge-graph canvas.
    expect(
      container.querySelector('[data-slot="free-canvas"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-slot="knowledge-graph"]'),
    ).toBeNull();
    // The structured tree is rendered with exactly 4 columns — NOT
    // an arbitrary number that would suggest a graph layout.
    const columns = container.querySelectorAll(
      '[data-slot="thesis-column"]',
    );
    expect(columns).toHaveLength(4);
  });
});
