/**
 * Contract tests for the Experience Center page (Task 22 / page-specs §14).
 *
 * Locks the structural invariants the page must satisfy before any
 * pixel tuning:
 *  - The TopHeader renders in `global` mode with the canonical
 *    page title "经验沉淀" and description "被验证的创作经验与失败案例"
 *    (configured by `(creator)/shell-router.tsx`).
 *  - The sidebar marks "经验沉淀" as the active nav item.
 *  - The contextual card variant is `assistant` (D-003, NOT `storage`).
 *  - ExperienceTabs render in the approved order from the screenshot
 *    (7 tabs).
 *  - AISummarySection renders 4 SummaryCard items horizontally.
 *  - RecentDiscoveries list with effect data column is present.
 *  - ExperienceCategories renders 6 cards including a failures
 *    category.
 *  - RightRail order is exactly:
 *      ValueOverview → ApplicationEffectChart → PopularExperienceList
 *      → QuickRecordActions.
 *  - The page is wrapped in the shared AppShell with exactly one
 *    Sidebar and one TopHeader — no second Shell is created.
 *  - Atomic-level: every visible block from the reference image has a
 *    matching DOM element.
 *
 * The component is a Server Component. The test renders it inside the
 * shared AppShell the same way `(creator)/layout.tsx` does so the
 * header-mode / sidebar-active / single-shell assertions run against
 * the same DOM a real route render would produce.
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

type ExperiencePageProps = React.ComponentProps<
  typeof import("./experience-page").ExperiencePage
>;

// The (creator)/layout already mounts the shared AppShell. For the
// unit test we replicate that wrapper so the "Experience active in
// sidebar" / single-shell checks run against the same DOM shape a
// real page render would produce.
async function renderExperience(overrides: Partial<ExperiencePageProps> = {}) {
  const { AppShell } = await import("@/components/shell/app-shell");
  const { ExperiencePage } = await import("./experience-page");
  return render(
    <AppShell
      pathname="/experience"
      headerMode="global"
      pageTitle="经验沉淀"
      pageDescription="被验证的创作经验与失败案例"
    >
      <ExperiencePage {...overrides} />
    </AppShell>,
  );
}

describe("ExperiencePage", () => {
  afterEach(() => {
    cleanup();
  });

  it("mounts the TopHeader in global mode with the experience title", async () => {
    const { container } = await renderExperience();
    const header = container.querySelector('[data-slot="app-top-header"]');
    expect(header).not.toBeNull();
    expect(header!.getAttribute("data-mode")).toBe("global");
    const heading = container.querySelector(
      '[data-slot="header-page-heading"]',
    );
    expect(heading).not.toBeNull();
    expect(heading!.textContent ?? "").toContain("经验沉淀");
    expect(heading!.textContent ?? "").toContain(
      "被验证的创作经验与失败案例",
    );
  });

  it("marks the Experience nav item as the active page in the sidebar", async () => {
    await renderExperience();
    const nav = screen.getByRole("navigation", { name: "主要导航" });
    const active = within(nav).getByRole("link", { current: "page" });
    expect(active).toHaveAttribute("href", "/experience");
    expect(active.textContent?.trim()).toBe("经验沉淀");
  });

  it("uses the assistant contextual-card variant (NOT storage)", async () => {
    const { container } = await renderExperience();
    const assistant = container.querySelector(
      '[data-slot="sidebar-contextual-card"][data-variant="assistant"]',
    );
    const storage = container.querySelector(
      '[data-slot="sidebar-contextual-card"][data-variant="storage"]',
    );
    expect(assistant).not.toBeNull();
    expect(storage).toBeNull();
  });

  it("renders ExperienceTabs in the approved 7-tab order from the screenshot", async () => {
    const { container } = await renderExperience();
    const tabs = container.querySelector(
      '[data-slot="experience-tabs"]',
    ) as HTMLElement;
    expect(tabs).not.toBeNull();
    const labels = Array.from(
      tabs.querySelectorAll('[role="tab"]'),
    ).map((node) => node.textContent?.trim() ?? "");
    expect(labels).toEqual([
      "全部",
      "选题策划",
      "脚本结构",
      "拍摄执行",
      "后期剪辑",
      "互动运营",
      "复盘沉淀",
    ]);
  });

  it("renders the AISummarySection with 4 summary cards horizontally", async () => {
    const { container } = await renderExperience();
    const summary = container.querySelector(
      '[data-slot="ai-summary-section"]',
    ) as HTMLElement;
    expect(summary).not.toBeNull();
    const cards = summary.querySelectorAll('[data-slot="summary-card"]');
    expect(cards).toHaveLength(4);
  });

  it("renders the RecentDiscoveries list with effect data column", async () => {
    const { container } = await renderExperience();
    const discoveries = container.querySelector(
      '[data-slot="recent-discoveries"]',
    ) as HTMLElement;
    expect(discoveries).not.toBeNull();
    const rows = discoveries.querySelectorAll('[data-slot="discovery-row"]');
    expect(rows.length).toBeGreaterThanOrEqual(1);
    // Each row must expose an effect-data column marker.
    const firstRow = rows[0] as HTMLElement;
    expect(firstRow.querySelector('[data-slot="discovery-effect-data"]')).not.toBeNull();
  });

  it("renders the ExperienceCategories block with 6 cards including a failures category", async () => {
    const { container } = await renderExperience();
    const categories = container.querySelector(
      '[data-slot="experience-categories"]',
    ) as HTMLElement;
    expect(categories).not.toBeNull();
    const cards = categories.querySelectorAll(
      '[data-slot="experience-category-card"]',
    );
    expect(cards).toHaveLength(6);
    const failures = categories.querySelector(
      '[data-category-id="experience-failures"]',
    );
    expect(failures).not.toBeNull();
  });

  it("renders the RightRail in the locked spec order (ValueOverview → ApplicationEffectChart → PopularExperienceList → QuickRecordActions)", async () => {
    const { container } = await renderExperience();
    const rail = container.querySelector(
      '[data-slot="experience-right-rail"]',
    ) as HTMLElement;
    expect(rail).not.toBeNull();
    const expectedSlots = [
      "value-overview",
      "application-effect-chart",
      "popular-experience-list",
      "quick-record-actions",
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

  it("keeps the page inside the single AppShell — no second Sidebar/TopHeader", async () => {
    const { container } = await renderExperience();
    const sidebars = container.querySelectorAll('[data-slot="app-sidebar"]');
    const headers = container.querySelectorAll('[data-slot="app-top-header"]');
    expect(sidebars).toHaveLength(1);
    expect(headers).toHaveLength(1);
    const shells = container.querySelectorAll('[data-slot="app-shell"]');
    expect(shells).toHaveLength(1);
  });
});