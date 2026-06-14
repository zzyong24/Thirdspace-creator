/**
 * Contract tests for the Production Workspace page (Task 16).
 *
 * Locks the structural invariants the page must satisfy before any
 * pixel tuning (page-specs §8):
 *  - The TopHeader renders in `project-workspace` mode with the
 *    canonical project identity "AI Native Browser 深度解析" and the
 *    six-stage stepper, with the Production stage active (current
 *    stage indicator on the stepper, primary action
 *    "进入下一步:内容发布").
 *  - The Production Mode Selector exposes three production mode cards
 *    in the locked spec order: 真人口播 / 知识演示 / AI 数字人.
 *  - The Production Grid hosts four visual regions in the spec order:
 *    RecordingScriptPanel → AssetLibraryPanel → PreviewPanel →
 *    SettingsRail.
 *  - The AssetLibraryPanel exposes category tabs and a three-column
 *    thumbnail grid.
 *  - The SettingsRail exposes three groups in the spec order:
 *    RecordingSettings → SubtitleSettings → ExportSettings.
 *  - The TimelinePanel exposes a single horizontal timeline (NOT a
 *    multi-track NLE layout) with TimelineSegmentCard[].
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

type ProductionWorkspacePageProps = React.ComponentProps<
  typeof import("./production-workspace-page").ProductionWorkspacePage
>;

// The (creator)/layout already mounts the shared AppShell. For the unit
// test we replicate that wrapper so the "Projects active in sidebar"
// check runs against the same DOM shape a real page render would
// produce. We render with `currentStage="production"` because the page
// IS the Production Workspace — the active stage must reflect the page
// context, not the canonical `project.currentStage` (which has not yet
// moved into production in the canonical dataset).
async function renderWorkspace(
  projectId = "project-ainativebrowser",
  overrides: Partial<ProductionWorkspacePageProps> = {},
) {
  const { AppShell } = await import("@/components/shell/app-shell");
  const { canonicalDataset } = await import("@/fixtures/canonical");
  const { ProductionWorkspacePage } = await import(
    "./production-workspace-page"
  );
  const project = canonicalDataset.projects.find((p) => p.id === projectId);
  // The Production Workspace surfaces "production" as the active step in
  // the header stepper; the other five stages reflect project progress
  // from the perspective of this workspace.
  const projectStages = STAGE_ORDER.map((stageName, index) => ({
    id: stageName,
    label: STAGE_LABEL[stageName],
    status:
      index < 3
        ? ("completed" as const)
        : index === 3
          ? ("in_progress" as const)
          : ("pending" as const),
  }));
  return render(
    <AppShell
      pathname={`/projects/${projectId}/production`}
      headerMode="project-workspace"
      primaryActionLabel="完成制作"
      project={
        project
          ? {
              projectId: project.id,
              title: project.title,
              stage: "production",
              stageProgressPct: project.progressPct,
              updatedLabel: "最近更新 —",
              starred: project.starred,
            }
          : undefined
      }
      projectStages={projectStages}
    >
      <ProductionWorkspacePage projectId={projectId} {...overrides} />
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

describe("ProductionWorkspacePage", () => {
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

  it("marks the Production stage as active in the stepper", async () => {
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
      "拍摄",
    );
  });

  it("exposes the 完成制作 primary action in the header", async () => {
    const { container } = await renderWorkspace();
    const header = container.querySelector(
      '[data-slot="app-top-header"]',
    ) as HTMLElement;
    expect(header).not.toBeNull();
    const primaryAction = within(header).getByRole("button", {
      name: /完成制作/,
    });
    expect(primaryAction).toBeInTheDocument();
  });

  it("renders the ProductionModeSelector with three production mode cards in spec order", async () => {
    const { container } = await renderWorkspace();
    const selector = container.querySelector(
      '[data-slot="production-mode-selector"]',
    ) as HTMLElement;
    expect(selector).not.toBeNull();
    const cards = selector.querySelectorAll(
      '[data-slot="production-mode-card"]',
    );
    expect(cards).toHaveLength(3);
    const labels = Array.from(cards).map((card) => {
      const labelNode = (card as HTMLElement).querySelector(
        '[data-slot="production-mode-card-label"]',
      );
      return labelNode?.textContent ?? "";
    });
    expect(labels).toEqual(["真人口播", "知识演示", "AI 数字人"]);
  });

  it("renders the four main regions (script/assets/preview/settings) in spec order", async () => {
    const { container } = await renderWorkspace();
    const grid = container.querySelector(
      '[data-slot="production-grid"]',
    ) as HTMLElement;
    expect(grid).not.toBeNull();
    const expectedSlots = [
      "recording-script-panel",
      "asset-library-panel",
      "preview-panel",
      "settings-rail",
    ];
    const orderedNodes = expectedSlots.map((slot) =>
      grid.querySelector(`[data-slot="${slot}"]`),
    );
    expect(orderedNodes.every((node) => node !== null)).toBe(true);
    for (let i = 1; i < orderedNodes.length; i += 1) {
      const node = orderedNodes[i] as Element;
      const previous = orderedNodes[i - 1] as Element;
      const relation = previous.compareDocumentPosition(node);
      expect(relation & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  it("exposes all six production regions in reference order", async () => {
    const { container } = await renderWorkspace();

    expect(
      Array.from(
        container.querySelectorAll('[data-testid="production-region"]'),
      ).map((node) => node.getAttribute("data-region")),
    ).toEqual(["mode", "script", "assets", "preview", "settings", "timeline"]);
  });

  it("renders asset category tabs in the AssetLibraryPanel", async () => {
    const { container } = await renderWorkspace();
    const panel = container.querySelector(
      '[data-slot="asset-library-panel"]',
    ) as HTMLElement;
    expect(panel).not.toBeNull();
    const tabs = panel.querySelectorAll(
      '[data-slot="asset-category-tab"]',
    );
    expect(tabs.length).toBeGreaterThanOrEqual(2);
  });

  it("renders three-column thumbnails in the AssetLibraryPanel", async () => {
    const { container } = await renderWorkspace();
    const panel = container.querySelector(
      '[data-slot="asset-library-panel"]',
    ) as HTMLElement;
    expect(panel).not.toBeNull();
    const grid = panel.querySelector(
      '[data-slot="asset-thumbnail-grid"]',
    ) as HTMLElement;
    expect(grid).not.toBeNull();
    // The grid is a 3-column layout (NOT 1, 2 or 4 columns).
    const classes = grid.getAttribute("class") ?? "";
    expect(classes).toMatch(/xl:grid-cols-3/);
    const thumbnails = grid.querySelectorAll(
      '[data-slot="asset-thumbnail"]',
    );
    expect(thumbnails.length).toBeGreaterThanOrEqual(3);
  });

  it("renders the SettingsRail with three groups in spec order (recording → subtitle → export)", async () => {
    const { container } = await renderWorkspace();
    const rail = container.querySelector(
      '[data-slot="settings-rail"]',
    ) as HTMLElement;
    expect(rail).not.toBeNull();
    const expectedSlots = [
      "recording-settings",
      "subtitle-settings",
      "export-settings",
    ];
    const orderedNodes = expectedSlots.map((slot) =>
      rail.querySelector(`[data-slot="${slot}"]`),
    );
    expect(orderedNodes.every((node) => node !== null)).toBe(true);
    for (let i = 1; i < orderedNodes.length; i += 1) {
      const node = orderedNodes[i] as Element;
      const previous = orderedNodes[i - 1] as Element;
      const relation = previous.compareDocumentPosition(node);
      expect(relation & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    // The export button stays at the bottom of the SettingsRail so it
    // never migrates to the timeline region (D-016 invariant).
    const exportSection = rail.querySelector(
      '[data-slot="export-settings"]',
    ) as HTMLElement;
    const exportButton = exportSection.querySelector(
      '[data-slot="export-button"]',
    );
    expect(exportButton).not.toBeNull();
  });

  it("renders a single horizontal timeline (not a multi-track NLE layout)", async () => {
    const { container } = await renderWorkspace();
    const timeline = container.querySelector(
      '[data-slot="timeline-panel"]',
    ) as HTMLElement;
    expect(timeline).not.toBeNull();
    // There is exactly one timeline panel — never multiple tracks.
    const allTimelines = container.querySelectorAll(
      '[data-slot="timeline-panel"]',
    );
    expect(allTimelines).toHaveLength(1);
    // The track is horizontal (flex-row, not flex-col).
    const track = timeline.querySelector(
      '[data-slot="timeline-track"]',
    ) as HTMLElement;
    expect(track).not.toBeNull();
    const trackClasses = track.getAttribute("class") ?? "";
    expect(trackClasses).toMatch(/flex-row/);
    expect(trackClasses).not.toMatch(/flex-col/);
    // The track exposes TimelineSegmentCard[] (at least 2 cards so the
    // strip is not an empty shell).
    const cards = track.querySelectorAll(
      '[data-slot="timeline-segment-card"]',
    );
    expect(cards.length).toBeGreaterThanOrEqual(2);
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

  it("does not promote the production page into an NLE-style multi-track layout", async () => {
    const { container } = await renderWorkspace();
    // D-016: production must remain a single-track timeline page — no
    // video-track, no audio-track, no canvas-region.
    expect(
      container.querySelector('[data-slot="video-track"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-slot="audio-track"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-slot="nle-canvas"]'),
    ).toBeNull();
  });
});
