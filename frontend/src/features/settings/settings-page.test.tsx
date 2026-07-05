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
 *  - SettingsTabs renders 5 tabs in the approved order
 *    (account / preferences / appearance / integrations / storage).
 *  - SettingsGrid contains MainSettings in order
 *      AccountInformationCard → PreferenceSettingsCard → SystemSettingsCard
 *    and SettingsRail in order
 *      StorageUsageCard → ModelConfigurationCard
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

// The settings interactive island (preference + model cards) calls
// `useRouter()` and the typed `client` for its needs-backend wiring
// (Settings module Step 5). Stub both so the structural render runs
// without a Next router context or a real HTTP transport.
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: vi.fn(),
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
  }),
  // [T-132] SettingsDialog 读 ?highlight 做深链定位;测试无 query → 返回空 params。
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/contract-client", () => ({
  client: {
    patchPreferences: vi.fn().mockResolvedValue({}),
    putModel: vi.fn().mockResolvedValue({}),
    patchProfile: vi.fn().mockResolvedValue({}),
    putStorage: vi.fn().mockResolvedValue({}),
    // AccountBindingCard (T-032a) pulls status on mount + calls loginDouyin on click.
    statusDouyin: vi.fn().mockResolvedValue({ loggedIn: false }),
    loginDouyin: vi.fn().mockResolvedValue({ loggedIn: true }),
  },
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
    // 设置弹窗 modal 打开后,Radix 给背景 AppShell(含 sidebar)加 aria-hidden,
    // getByRole(走可访问树)便够不到 nav。sidebar 仍在 DOM 里、仍把 /settings 标为
    // 当前页 —— 直接用 DOM 查询断言。
    const { container } = await renderSettings();
    const nav = container.querySelector('nav[aria-label="主要导航"]');
    expect(nav).not.toBeNull();
    const active = nav!.querySelector('[aria-current="page"]');
    expect(active).not.toBeNull();
    expect(active!.getAttribute("href")).toBe("/settings");
    expect(active!.textContent?.trim()).toBe("设置");
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

  // The settings content now lives in a centered Dialog (Radix Portal → body),
  // so dialog-internal queries go through `document` rather than the render
  // container. The dialog opens by default.
  it("renders the settings dialog with 6 vertical tabs in the approved order", async () => {
    await renderSettings();
    const tabs = document.querySelector('[data-slot="settings-tabs"]');
    expect(tabs).not.toBeNull();
    const triggers = Array.from(
      tabs!.querySelectorAll('[role="tab"]'),
    ).map((node) => node.textContent?.trim() ?? "");
    expect(triggers).toEqual([
      "账户",
      "偏好",
      "外观",
      "模型配置",
      // T-077a:技能管理页签(SPEC 2026-07-03 §1.1)。
      "技能",
      "存储",
    ]);
  });

  it("opens as a centered dialog (not a full-page flood layout)", async () => {
    await renderSettings();
    const dialog = document.querySelector('[data-slot="settings-dialog"]');
    expect(dialog).not.toBeNull();
    // Left vertical tab nav + right scrollable panels area both exist.
    expect(dialog!.querySelector('[data-slot="settings-tabs"]')).not.toBeNull();
    expect(
      dialog!.querySelector('[data-slot="settings-panels"]'),
    ).not.toBeNull();
  });

  it("mounts every settings card (account/preference/system/storage/model)", async () => {
    await renderSettings();
    // All panels are force-mounted so the full inventory is present regardless
    // of the active tab.
    const expectedSlots = [
      "account-information-card",
      "preference-settings-card",
      "system-settings-card",
      "storage-usage-card",
      "model-configuration-card",
      // Multimodal (image / video) model cards — SPEC 2026-07-01 M3.
      "multimodal-image-card",
      "multimodal-video-card",
    ];
    for (const slot of expectedSlots) {
      expect(
        document.querySelector(`[data-slot="${slot}"]`),
      ).not.toBeNull();
    }
  });

  it("renders form rows with the compact label + control pattern", async () => {
    await renderSettings();
    const main = document.querySelector('[data-slot="main-settings"]');
    expect(main).not.toBeNull();
    // Account panel + preference panel together have the form rows; assert the
    // label/control pattern across the whole dialog.
    const rows = document.querySelectorAll('[data-slot="settings-form-row"]');
    expect(rows.length).toBeGreaterThanOrEqual(3);
    for (const row of Array.from(rows)) {
      const label = row.querySelector('[data-slot="form-row-label"]');
      const control = row.querySelector('[data-slot="form-row-control"]');
      expect(label).not.toBeNull();
      expect(control).not.toBeNull();
    }
  });

  it("renders StorageUsageCard with a progress bar", async () => {
    await renderSettings();
    const storage = document.querySelector(
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
