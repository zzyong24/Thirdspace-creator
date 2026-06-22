/**
 * Contract tests for the Publishing Workspace page (Task 17).
 *
 * Locks the structural invariants the page must satisfy before any
 * pixel tuning (page-specs §9):
 *  - The TopHeader renders in `project-workspace` mode with the
 *    canonical project identity "AI Native Browser 深度解析" and the
 *    six-stage stepper, with the Publishing stage active (current
 *    stage indicator on the stepper, primary action
 *    "进入下一步:数据复盘").
 *  - The Publishing Tabs row exposes the spec tabs.
 *  - The Publishing Grid is a three-column layout in the spec order
 *    BasicInformationForm → PlatformPublishingPanel → PreviewRail
 *    (NOT a single-column wizard and NOT a merged settings/basic
 *    info column).
 *  - The BasicInformationForm renders Title → Description → Cover →
 *    Tags → Category/Series → Publishing Options in spec order.
 *  - The PlatformPublishingPanel renders platform cards as separate
 *    cards (each `data-slot="platform-publish-card"`) and exposes
 *    Batch Time / Confirm Publish / Pre-Publish Check controls in the
 *    locked order.
 *  - The PreviewRail renders Preview → PublishChecklist → PublishTips
 *    in spec order.
 *  - The Confirm Publish button is fixture-only: it has no network
 *    side-effect (no `fetch` in the page tree).
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

// The interactive island mounts `useRouter()` (Module 10 Step 5 wiring); the page
// here renders without a wiring prop (local-only), so a stub router suffices.
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: vi.fn(),
    replace: vi.fn(),
    push: vi.fn(),
    back: vi.fn(),
  }),
}));

type PublishingWorkspacePageProps = React.ComponentProps<
  typeof import("./publishing-workspace-page").PublishingWorkspacePage
>;

// The (creator)/layout already mounts the shared AppShell. For the unit
// test we replicate that wrapper so the "Projects active in sidebar"
// check runs against the same DOM shape a real page render would
// produce. We render with `currentStage="publishing"` because the page
// IS the Publishing Workspace — the active stage must reflect the page
// context, not the canonical `project.currentStage`.
async function renderWorkspace(
  projectId = "project-ainativebrowser",
  overrides: Partial<PublishingWorkspacePageProps> = {},
) {
  const { AppShell } = await import("@/components/shell/app-shell");
  const { canonicalDataset } = await import("@/fixtures/canonical");
  const { PublishingWorkspacePage } = await import(
    "./publishing-workspace-page"
  );
  const project = canonicalDataset.projects.find((p) => p.id === projectId);
  // The Publishing Workspace surfaces "publishing" as the active step in
  // the header stepper; the other five stages reflect project progress
  // from the perspective of this workspace.
  const projectStages = STAGE_ORDER.map((stageName, index) => ({
    id: stageName,
    label: STAGE_LABEL[stageName],
    status:
      index < 4
        ? ("completed" as const)
        : index === 4
          ? ("in_progress" as const)
          : ("pending" as const),
  }));
  return render(
    <AppShell
      pathname={`/projects/${projectId}/publishing`}
      headerMode="project-workspace"
      primaryActionLabel="查看数据"
      project={
        project
          ? {
              projectId: project.id,
              title: project.title,
              stage: "publishing",
              stageProgressPct: project.progressPct,
              updatedLabel: "最近更新 —",
              starred: project.starred,
            }
          : undefined
      }
      projectStages={projectStages}
    >
      <PublishingWorkspacePage projectId={projectId} {...overrides} />
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

describe("PublishingWorkspacePage", () => {
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

  it("marks the Publishing stage as active in the stepper", async () => {
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
      "发布",
    );
  });

  it("exposes the 查看数据 primary action in the header", async () => {
    const { container } = await renderWorkspace();
    const header = container.querySelector(
      '[data-slot="app-top-header"]',
    ) as HTMLElement;
    expect(header).not.toBeNull();
    // A6: the workspace primary action is now a button (transition island), not a link.
    const primaryAction = within(header).getByRole("button", {
      name: /查看数据/,
    });
    expect(primaryAction).not.toBeNull();
  });

  it("renders the PublishingTabs row", async () => {
    const { container } = await renderWorkspace();
    const tabs = container.querySelector(
      '[data-slot="publishing-tabs"]',
    ) as HTMLElement;
    expect(tabs).not.toBeNull();
    const triggers = tabs.querySelectorAll('[data-tab-id]');
    expect(triggers.length).toBeGreaterThanOrEqual(1);
  });

  it("renders the four reference publishing tabs in order", async () => {
    const { container } = await renderWorkspace();
    const tabs = Array.from(
      container.querySelectorAll(
        '[data-slot="publishing-tabs"] [data-tab-id]',
      ),
    );

    expect(tabs.map((tab) => tab.textContent?.trim())).toEqual([
      "发布设置",
      "发布记录",
      "平台管理",
      "批量发布",
    ]);
  });

  it("renders a three-column PublishingGrid (basic/platform/preview) in spec order", async () => {
    const { container } = await renderWorkspace();
    const grid = container.querySelector(
      '[data-slot="publishing-grid"]',
    ) as HTMLElement;
    expect(grid).not.toBeNull();
    const expectedSlots = [
      "basic-information-form",
      "platform-publishing-panel",
      "preview-rail",
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

  it("renders BasicInformationForm fields in spec order (title → description → cover → tags → category → options)", async () => {
    const { container } = await renderWorkspace();
    const form = container.querySelector(
      '[data-slot="basic-information-form"]',
    ) as HTMLElement;
    expect(form).not.toBeNull();
    const expectedSlots = [
      "title-field",
      "description-field",
      "cover-selector",
      "tags-field",
      "category-field",
      "publishing-options-field",
    ];
    const orderedNodes = expectedSlots.map((slot) =>
      form.querySelector(`[data-slot="${slot}"]`),
    );
    expect(orderedNodes.every((node) => node !== null)).toBe(true);
    for (let i = 1; i < orderedNodes.length; i += 1) {
      const node = orderedNodes[i] as Element;
      const previous = orderedNodes[i - 1] as Element;
      const relation = previous.compareDocumentPosition(node);
      expect(relation & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  it("renders PlatformPublishingPanel with separate platform cards (not merged with basic info)", async () => {
    const { container } = await renderWorkspace();
    const panel = container.querySelector(
      '[data-slot="platform-publishing-panel"]',
    ) as HTMLElement;
    expect(panel).not.toBeNull();
    const cards = panel.querySelectorAll('[data-slot="platform-publish-card"]');
    expect(cards.length).toBeGreaterThanOrEqual(2);
    // The PlatformPublishingPanel lives outside the BasicInformationForm
    // — settings stay merged neither with platform cards nor with the
    // basic info column.
    const form = container.querySelector(
      '[data-slot="basic-information-form"]',
    ) as HTMLElement;
    const platformInsideForm =
      form.querySelectorAll('[data-slot="platform-publish-card"]').length;
    expect(platformInsideForm).toBe(0);
  });

  it("renders batch time, confirm publish and pre-publish check inside the platform panel", async () => {
    const { container } = await renderWorkspace();
    const panel = container.querySelector(
      '[data-slot="platform-publishing-panel"]',
    ) as HTMLElement;
    expect(panel).not.toBeNull();
    for (const slot of [
      "batch-time-actions",
      "confirm-publish-button",
      "pre-publish-check",
    ]) {
      const node = panel.querySelector(`[data-slot="${slot}"]`);
      expect(node).not.toBeNull();
    }
  });

  it("renders PreviewRail in spec order (preview → checklist → tips)", async () => {
    const { container } = await renderWorkspace();
    const rail = container.querySelector(
      '[data-slot="preview-rail"]',
    ) as HTMLElement;
    expect(rail).not.toBeNull();
    const expectedSlots = [
      "platform-preview",
      "publish-checklist",
      "publish-tips",
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
  });

  it("does not perform network publication: Confirm Publish has no fetch call", async () => {
    const fetchSpy = vi.fn();
    const originalFetch = global.fetch;
    global.fetch = fetchSpy as unknown as typeof fetch;
    try {
      const { container } = await renderWorkspace();
      const confirmButton = container.querySelector(
        '[data-slot="confirm-publish-button"]',
      ) as HTMLElement;
      expect(confirmButton).not.toBeNull();
      // Server-rendered page must not call fetch during render.
      expect(fetchSpy).not.toHaveBeenCalled();
      // The control surfaces a stable label — it is fixture-only, so the
      // visible text is one of the spec-locked actions (确认发布).
      const text = confirmButton.textContent ?? "";
      expect(text).toMatch(/确认发布/);
    } finally {
      global.fetch = originalFetch;
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

  it("does not promote the publishing page into a wizard / merged-settings layout", async () => {
    const { container } = await renderWorkspace();
    // Page-spec §9: no wizard, no platform connection flow, no merging
    // of platform settings into the basic info column.
    expect(
      container.querySelector('[data-slot="publishing-wizard"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-slot="platform-connection-flow"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-slot="basic-information-form"] [data-slot="platform-publish-card"]'),
    ).toBeNull();
  });

  it("renders the right-column design rhythm (preview → metrics → comparison → checklist → tips → comments)", async () => {
    const { container } = await renderWorkspace();
    const rail = container.querySelector(
      '[data-slot="preview-rail"]',
    ) as HTMLElement;
    expect(rail).not.toBeNull();
    const expectedSlots = [
      "platform-preview",
      "platform-metrics-summary",
      "platform-comparison",
      "publish-checklist",
      "publish-tips",
      "comments-teaser",
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
  });

  it("renders a content calendar in the platform panel", async () => {
    const { container } = await renderWorkspace();
    const panel = container.querySelector(
      '[data-slot="platform-publishing-panel"]',
    ) as HTMLElement;
    const calendar = panel.querySelector('[data-slot="content-calendar"]');
    expect(calendar).not.toBeNull();
    const cells = panel.querySelectorAll(
      '[data-slot="content-calendar-cell"]',
    );
    expect(cells.length).toBe(7);
  });

  it("renders a cover thumbnail tile with tag overlay", async () => {
    const { container } = await renderWorkspace();
    const form = container.querySelector(
      '[data-slot="basic-information-form"]',
    ) as HTMLElement;
    const coverPreview = form.querySelector('[data-slot="cover-preview"]');
    expect(coverPreview).not.toBeNull();
    const coverTags = form.querySelectorAll(
      '[data-slot="cover-preview"] [data-slot="cover-tag"]',
    );
    expect(coverTags.length).toBeGreaterThan(0);
  });

  it("renders the metrics summary empty state when no rightRail snapshots are provided (GAP-PUBW-1)", async () => {
    // Right-rail指标 is now 100% props-driven from analytics snapshots. With no
    // rightRail wired (default page render), the summary shows an honest 暂无指标
    // skeleton instead of the old hardcoded "184,203 累计播放" tiles.
    const { container } = await renderWorkspace();
    const summary = container.querySelector(
      '[data-slot="platform-metrics-summary"]',
    ) as HTMLElement;
    expect(summary).not.toBeNull();
    expect(summary.getAttribute("data-empty")).toBe("true");
    expect(summary.querySelectorAll('[data-slot="metric-card"]')).toHaveLength(0);
    expect(summary.textContent ?? "").toContain("暂无指标");
  });

  it("renders the platform-comparison empty state with no fabricated rows (GAP-PUBW-1)", async () => {
    const { container } = await renderWorkspace();
    const comparison = container.querySelector(
      '[data-slot="platform-comparison"]',
    ) as HTMLElement;
    expect(comparison).not.toBeNull();
    expect(comparison.getAttribute("data-empty")).toBe("true");
    // No fabricated comparison rows / table when there are no real snapshots.
    expect(
      comparison.querySelectorAll('[data-slot="platform-comparison-row"]'),
    ).toHaveLength(0);
  });

  it("marks the comments teaser 规划中 with no fake author rows (GAP-PUBW-1)", async () => {
    const { container } = await renderWorkspace();
    const teaser = container.querySelector(
      '[data-slot="comments-teaser"]',
    ) as HTMLElement;
    expect(teaser).not.toBeNull();
    expect(teaser.getAttribute("data-planned")).toBe("true");
    expect(
      teaser.querySelector('[data-slot="planned-badge"]')?.textContent,
    ).toContain("规划中");
    // No fabricated @用户名 comment rows.
    expect(teaser.querySelectorAll('[data-slot="comments-row"]')).toHaveLength(0);
    expect(teaser.textContent ?? "").not.toContain("@Meng");
  });
});
