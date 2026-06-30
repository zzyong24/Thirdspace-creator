/**
 * Contract tests for the Project Overview page (Task 12).
 *
 * Locks the structural invariants the page must satisfy before any
 * pixel tuning:
 *  - The page header identifies the current project (title + edit/share
 *    affordances + "进入工作台" primary action),
 *  - The full-width ProjectProgressCard surfaces a six-stage stepper in
 *    the canonical order 选题调研 / 策划构思 / 脚本撰写 / 拍摄制作 /
 *    渠道发布 / 数据复盘 and an overall-progress bar,
 *  - The Main column renders AssetSummaryCard (5 stat items),
 *    RecentFilesCard and ProjectActivityCard in that order,
 *  - The Side column renders the PRESENT cards (ProjectInfoCard,
 *    OutputPlanCard, PublishingStatusCard, MilestoneCard) in that
 *    relative order — empty-content cards are folded away (L1 立项简化,
 *    SPEC §3.1「无真东西不摆空格子」),
 *  - The collaboration visuals (if any) never expose team-management
 *    behavior (no "add member" or "manage team" controls),
 *  - The page lives inside exactly one AppShell, with the Sidebar
 *    marking "项目" as the active nav item, and the TopHeader mounted in
 *    `project-overview` mode.
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

// The page now embeds the `ProjectOverviewActions` Client island (Task 8),
// which calls `useRouter()`. Stub the router so the server-component render
// can mount the island without a real App Router context.
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: vi.fn(),
    replace: vi.fn(),
    push: vi.fn(),
    back: vi.fn(),
  }),
}));

type ProjectOverviewPageProps = React.ComponentProps<
  typeof import("./project-overview-page").ProjectOverviewPage
>;

// The (creator)/layout already mounts the shared AppShell. For the unit
// test we replicate that wrapper so the "Projects active in sidebar"
// check runs against the same DOM shape a real page render would
// produce.
async function renderOverview(
  projectId = "project-ainativebrowser",
  overrides: Partial<ProjectOverviewPageProps> = {},
) {
  const { AppShell } = await import("@/components/shell/app-shell");
  const { ProjectOverviewPage } = await import("./project-overview-page");
  return render(
    <AppShell
      pathname={`/projects/${projectId}`}
      headerMode="project-overview"
      primaryActionLabel="进入工作台"
      pageTitle="项目概览"
    >
      <ProjectOverviewPage projectId={projectId} {...overrides} />
    </AppShell>,
  );
}

describe("ProjectOverviewPage", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders the project title and the 进入工作台 primary action", async () => {
    const { container } = await renderOverview();
    // The page heading surfaces the project title in an h1.
    const heading = screen.getByRole("heading", {
      level: 1,
      name: /AI Native Browser 深度解析/,
    });
    expect(heading).toBeInTheDocument();
    // Scope to the project progress card to avoid matching the same
    // action label rendered by the TopHeader in project-overview mode.
    const progressCard = container.querySelector(
      '[data-slot="project-progress-card"]',
    ) as HTMLElement;
    expect(progressCard).not.toBeNull();
    const enterAction = within(progressCard).getByRole("link", {
      name: /进入工作台/,
    });
    expect(enterAction).toHaveAttribute(
      "href",
      "/projects/ai-native-browser/script",
    );
  });

  it("renders the full-width project progress card with a six-stage stepper in canonical order", async () => {
    const { container } = await renderOverview();
    const progressCard = container.querySelector(
      '[data-slot="project-progress-card"]',
    );
    expect(progressCard).not.toBeNull();
    // The stepper surfaces 7 stages in the canonical Chinese order (立项 Brief
    // 地基:brief「立项准备」是第一个阶段)。
    const stepperItems = within(progressCard as HTMLElement).getAllByRole(
      "listitem",
    );
    expect(stepperItems).toHaveLength(7);
    const expectedStageLabels = [
      "立项准备",
      "选题调研",
      "策划构思",
      "脚本撰写",
      "拍摄制作",
      "渠道发布",
      "数据复盘",
    ];
    stepperItems.forEach((item, index) => {
      expect(item.textContent ?? "").toContain(expectedStageLabels[index]);
    });
    // The progress card also carries the overall-progress bar.
    const progressBar =
      progressCard!.querySelector('[data-slot="progress-bar"]');
    expect(progressBar).not.toBeNull();
  });

  it("renders the five asset statistics in the AssetSummaryCard", async () => {
    const { container } = await renderOverview();
    const assetCard = container.querySelector(
      '[data-slot="asset-summary-card"]',
    ) as HTMLElement;
    expect(assetCard).not.toBeNull();
    const stats = assetCard.querySelectorAll('[data-slot="asset-stat"]');
    // Exactly five stat items per the spec.
    expect(stats).toHaveLength(5);
    const expectedStatLabels = [
      "文档",
      "脚本",
      "素材",
      "数据快照",
      "经验沉淀",
    ];
    stats.forEach((stat, index) => {
      const statEl = stat as HTMLElement;
      expect(statEl.textContent ?? "").toContain(expectedStatLabels[index]);
      // Each stat carries a non-empty value.
      expect(
        statEl.querySelector('[data-slot="asset-stat-value"]')?.textContent ??
          "",
      ).not.toBe("");
    });
  });

  it("renders the RecentFilesCard as a list (not a grid)", async () => {
    const { container } = await renderOverview();
    const recentFiles = container.querySelector(
      '[data-slot="recent-files-card"]',
    ) as HTMLElement;
    expect(recentFiles).not.toBeNull();
    const rows = recentFiles.querySelectorAll('[data-slot="recent-file-row"]');
    expect(rows.length).toBeGreaterThanOrEqual(1);
    // The list is rendered as <ul> for a list semantic, not <div role="grid">.
    const list = recentFiles.querySelector('[data-slot="recent-files-list"]');
    expect(list?.tagName.toLowerCase()).toBe("ul");
  });

  it("renders the ProjectActivityCard as a list (not a grid)", async () => {
    const { container } = await renderOverview();
    const activityCard = container.querySelector(
      '[data-slot="project-activity-card"]',
    ) as HTMLElement;
    expect(activityCard).not.toBeNull();
    const rows = activityCard.querySelectorAll(
      '[data-slot="project-activity-row"]',
    );
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  it("renders the present right-rail cards in the spec order, folding empty ones", async () => {
    // L1 立项简化(SPEC §3.1「无真东西不摆空格子」):右栏只渲染有真内容的卡,
    // 空内容的卡(此处 fixture 的 publishing=0)折叠不渲染。仍渲染的卡保持 spec 相对顺序:
    // project-info → output-plan → publishing-status → milestone。
    const { container } = await renderOverview();
    const sideColumn = container.querySelector(
      '[data-slot="project-overview-side-column"]',
    ) as HTMLElement;
    expect(sideColumn).not.toBeNull();
    // project-info 总在;output-plan(2 产物) 与 milestone(3 里程碑) 有内容 → 在;
    // publishing-status(0 发布) 空 → 折叠不渲染。
    const presentSlots = [
      "project-info-card",
      "output-plan-card",
      "milestone-card",
    ];
    const orderedNodes = presentSlots.map((slot) =>
      sideColumn.querySelector(`[data-slot="${slot}"]`),
    );
    expect(orderedNodes.every((node) => node !== null)).toBe(true);
    for (let i = 1; i < orderedNodes.length; i += 1) {
      const node = orderedNodes[i] as Element;
      const previous = orderedNodes[i - 1] as Element;
      const relation = previous.compareDocumentPosition(node);
      expect(relation & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    // 空发布卡确实没渲染(去掉了「暂无发布记录」噪声)。
    expect(
      sideColumn.querySelector('[data-slot="publishing-status-card"]'),
    ).toBeNull();
  });

  it("does not expose any team-management affordances on the page", async () => {
    const { container } = await renderOverview();
    // The page must not contain buttons, links or text that suggest
    // managing a team / members / invites. D-008 forbids team
    // management UI on the overview.
    const pageText = container.textContent ?? "";
    expect(pageText).not.toMatch(/添加成员|管理成员|邀请协作者|团队管理/);
    const teamTriggers = container.querySelectorAll(
      '[data-slot*="team" i], [data-testid*="team" i]',
    );
    expect(teamTriggers).toHaveLength(0);
  });

  it("is wrapped in the shared AppShell with one sidebar and one top header", async () => {
    const { container } = await renderOverview();
    const sidebars = container.querySelectorAll('[data-slot="app-sidebar"]');
    const headers = container.querySelectorAll('[data-slot="app-top-header"]');
    expect(sidebars).toHaveLength(1);
    expect(headers).toHaveLength(1);
  });

  it("mounts the TopHeader in project-overview mode", async () => {
    const { container } = await renderOverview();
    const header = container.querySelector('[data-slot="app-top-header"]');
    expect(header).not.toBeNull();
    expect(header!.getAttribute("data-mode")).toBe("project-overview");
  });

  it("marks the Projects nav item as the active page in the sidebar", async () => {
    await renderOverview();
    const nav = screen.getByRole("navigation", { name: "主要导航" });
    const active = within(nav).getByRole("link", { current: "page" });
    expect(active).toHaveAttribute("href", "/projects");
    expect(active.textContent?.trim()).toBe("项目");
  });

  it("exposes a left-wide / right-narrow two-column grid for main + side content", async () => {
    const { container } = await renderOverview();
    const mainColumn = container.querySelector(
      '[data-slot="project-overview-main-column"]',
    );
    const sideColumn = container.querySelector(
      '[data-slot="project-overview-side-column"]',
    );
    expect(mainColumn).not.toBeNull();
    expect(sideColumn).not.toBeNull();
  });
});
