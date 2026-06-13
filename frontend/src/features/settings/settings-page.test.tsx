/**
 * Contract tests for the Settings page (Task 25 / page-specs §17).
 *
 * Locks the structural invariants the page must satisfy before any
 * pixel tuning:
 *  - The TopHeader renders in `global` mode with the canonical
 *    page title "设置" and description "账号、偏好与系统"
 *    (configured by `(creator)/shell-router.tsx`).
 *  - The sidebar marks "设置" as the active nav item.
 *  - The contextual card variant is `assistant` (D-003, NOT `storage`).
 *  - SettingsTabs renders 8 tabs in the approved order from the
 *    reference image (page-specs §17: "顶部设置 Tab 保持八项及顺序").
 *  - SettingsGrid contains MainSettings in order
 *      AccountInformationCard → PreferenceSettingsCard → SystemSettingsCard
 *    and SettingsRail in order
 *      StorageUsageCard → ModelConfigurationCard → OtherSettingsCard
 *    (page-specs §17 "组件树").
 *  - Form rows follow the "label + control" compact pattern.
 *  - The page is wrapped in the shared AppShell with exactly one
 *    Sidebar and one TopHeader — no second Shell is created.
 *  - Controls have fixture-only local state. No team, no subscription
 *    detail page, no server persistence (D-001 + page-specs §17
 *    "禁止改变").
 *
 * The component is a Server Component. The test renders it inside
 * the shared AppShell the same way `(creator)/layout.tsx` does so
 * the header-mode / sidebar-active / single-shell assertions run
 * against the same DOM a real route render would produce.
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

type SettingsPageProps = React.ComponentProps<
  typeof import("./settings-page").SettingsPage
>;

// The (creator)/layout already mounts the shared AppShell. For the
// unit test we replicate that wrapper so the "Settings active in
// sidebar" / single-shell checks run against the same DOM shape a
// real page render would produce.
async function renderSettings(overrides: Partial<SettingsPageProps> = {}) {
  const { AppShell } = await import("@/components/shell/app-shell");
  const { SettingsPage } = await import("./settings-page");
  return render(
    <AppShell
      pathname="/settings"
      headerMode="global"
      pageTitle="设置"
      pageDescription="账号、偏好与系统"
    >
      <SettingsPage {...overrides} />
    </AppShell>,
  );
}

describe("SettingsPage", () => {
  afterEach(() => {
    cleanup();
  });

  it("mounts the TopHeader in global mode with the settings title", async () => {
    const { container } = await renderSettings();
    const header = container.querySelector('[data-slot="app-top-header"]');
    expect(header).not.toBeNull();
    expect(header!.getAttribute("data-mode")).toBe("global");
    const heading = container.querySelector(
      '[data-slot="header-page-heading"]',
    );
    expect(heading).not.toBeNull();
    expect(heading!.textContent ?? "").toContain("设置");
    expect(heading!.textContent ?? "").toContain("账号、偏好与系统");
  });

  it("marks the Settings nav item as the active page in the sidebar", async () => {
    await renderSettings();
    const nav = screen.getByRole("navigation", { name: "主要导航" });
    const active = within(nav).getByRole("link", { current: "page" });
    expect(active).toHaveAttribute("href", "/settings");
    expect(active.textContent?.trim()).toBe("设置");
  });

  it("uses the assistant contextual-card variant (NOT storage)", async () => {
    const { container } = await renderSettings();
    const assistant = container.querySelector(
      '[data-slot="sidebar-contextual-card"][data-variant="assistant"]',
    );
    const storage = container.querySelector(
      '[data-slot="sidebar-contextual-card"][data-variant="storage"]',
    );
    expect(assistant).not.toBeNull();
    expect(storage).toBeNull();
  });

  it("renders SettingsTabs with 8 tabs in the approved order", async () => {
    const { container } = await renderSettings();
    const tabs = container.querySelector('[data-slot="settings-tabs"]');
    expect(tabs).not.toBeNull();
    const triggers = Array.from(
      tabs!.querySelectorAll('[role="tab"]'),
    ).map((node) => node.textContent?.trim() ?? "");
    // page-specs §17: 顶部设置 Tab 保持八项及顺序
    expect(triggers).toEqual([
      "账户",
      "偏好",
      "通知",
      "外观",
      "集成",
      "存储",
      "数据",
      "关于",
    ]);
  });

  it("renders SettingsGrid with MainSettings (account → preference → system)", async () => {
    const { container } = await renderSettings();
    const grid = container.querySelector('[data-slot="settings-grid"]');
    expect(grid).not.toBeNull();
    const main = grid!.querySelector('[data-slot="main-settings"]');
    expect(main).not.toBeNull();
    const expectedSlots = [
      "account-information-card",
      "preference-settings-card",
      "system-settings-card",
    ];
    const orderedNodes = expectedSlots.map((slot) =>
      main!.querySelector(`[data-slot="${slot}"]`),
    );
    expect(orderedNodes.every((node) => node !== null)).toBe(true);
    for (let i = 1; i < orderedNodes.length; i += 1) {
      const node = orderedNodes[i] as Element;
      const previous = orderedNodes[i - 1] as Element;
      const relation = previous.compareDocumentPosition(node);
      expect(relation & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  it("renders SettingsRail (storage → model → other) inside SettingsGrid", async () => {
    const { container } = await renderSettings();
    const grid = container.querySelector('[data-slot="settings-grid"]');
    expect(grid).not.toBeNull();
    const rail = grid!.querySelector('[data-slot="settings-rail"]');
    expect(rail).not.toBeNull();
    const expectedSlots = [
      "storage-usage-card",
      "model-configuration-card",
      "other-settings-card",
    ];
    const orderedNodes = expectedSlots.map((slot) =>
      rail!.querySelector(`[data-slot="${slot}"]`),
    );
    expect(orderedNodes.every((node) => node !== null)).toBe(true);
    for (let i = 1; i < orderedNodes.length; i += 1) {
      const node = orderedNodes[i] as Element;
      const previous = orderedNodes[i - 1] as Element;
      const relation = previous.compareDocumentPosition(node);
      expect(relation & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  it("renders form rows with the compact label + control pattern", async () => {
    const { container } = await renderSettings();
    const main = container.querySelector('[data-slot="main-settings"]');
    expect(main).not.toBeNull();
    const rows = main!.querySelectorAll('[data-slot="settings-form-row"]');
    expect(rows.length).toBeGreaterThanOrEqual(3);
    // Each row has a label slot AND a control slot.
    for (const row of Array.from(rows)) {
      const label = row.querySelector('[data-slot="form-row-label"]');
      const control = row.querySelector('[data-slot="form-row-control"]');
      expect(label).not.toBeNull();
      expect(control).not.toBeNull();
    }
  });

  it("renders StorageUsageCard with a progress bar", async () => {
    const { container } = await renderSettings();
    const storage = container.querySelector(
      '[data-slot="storage-usage-card"]',
    );
    expect(storage).not.toBeNull();
    const bar = storage!.querySelector('[data-slot="progress-bar"]');
    expect(bar).not.toBeNull();
  });

  it("keeps the page inside the single AppShell — no second Sidebar/TopHeader", async () => {
    const { container } = await renderSettings();
    const sidebars = container.querySelectorAll('[data-slot="app-sidebar"]');
    const headers = container.querySelectorAll('[data-slot="app-top-header"]');
    expect(sidebars).toHaveLength(1);
    expect(headers).toHaveLength(1);
    const shells = container.querySelectorAll('[data-slot="app-shell"]');
    expect(shells).toHaveLength(1);
  });

  it("renders the page-internal main region with the settings page marker", async () => {
    const { container } = await renderSettings();
    const main = container.querySelector('main[data-page="settings"]');
    expect(main).not.toBeNull();
  });
});
