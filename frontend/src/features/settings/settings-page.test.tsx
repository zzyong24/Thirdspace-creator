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

  // [FE-H02] fixture(读取失败/SSR 的兜底)不再伪造模型/占用:数据缺失诚实置空/置 0,
  // 绝不把不存在的 claude-opus-4-8 / 18GB/64GB 当真。
  describe("honest fallback (FE-H02)", () => {
    it("fixture 兜底不伪造模型与占用(provider/model 空、占用置 0、无分布)", async () => {
      const { buildSettingsViewModel } = await import("@/fixtures/selectors");
      const vm = buildSettingsViewModel();
      expect(vm.model.provider).toBe("");
      expect(vm.model.modelName).toBe("");
      expect(vm.storage.usedBytes).toBe(0);
      expect(vm.storage.totalBytes).toBe(0);
      expect(vm.storage.breakdown).toHaveLength(0);
    });

    it("无 model/storage props(读取失败态)→ 模型卡输入为空(不预填伪造模型),存储诚实显 0 MB", async () => {
      await renderSettings();
      // 模型卡的供应商 / 模型输入不被伪造值预填(原来 fixture 会填 anthropic / claude-opus-4-8)。
      const provider = document.querySelector(
        "#model-provider",
      ) as HTMLInputElement | null;
      const modelName = document.querySelector(
        "#model-name",
      ) as HTMLInputElement | null;
      expect(provider).not.toBeNull();
      expect(provider!.value).toBe("");
      expect(modelName!.value).toBe("");
      // 存储卡诚实显示已用 0.0 GB(数据缺失置 0),绝不显伪造的 18GB/64GB。
      const storage = document.querySelector(
        '[data-slot="storage-usage-card"]',
      ) as HTMLElement;
      // [T-360①] 自适应单位:零用量显「0 MB」(旧 0.0 GB 会把 MB 级真值也抹成 0)。
      expect(storage.textContent ?? "").toContain("0 MB");
      expect(storage.textContent ?? "").not.toContain("18.0 GB");
    });
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

  // [T-167] 激活状态卡(账户页签)。desktop 有激活态 → 四态徽章 + 授权类型/到期/机器码;
  // web/未装配(activation undefined)→ 诚实空态「激活为桌面端功能」,绝不假装已激活。
  describe("ActivationStatusCard (T-167)", () => {
    it("web / 未装配(activation undefined)→ 诚实空态卡「桌面端专属」", async () => {
      await renderSettings();
      const card = document.querySelector('[data-slot="activation-status-card"]');
      expect(card).not.toBeNull();
      expect(card!.getAttribute("data-activation-available")).toBe("false");
      const badge = document.querySelector(
        '[data-slot="activation-status-badge"]',
      );
      expect(badge?.getAttribute("data-status")).toBe("unavailable");
      expect(badge?.textContent).toContain("桌面端专属");
      expect(card!.textContent).toContain("激活为桌面端功能");
    });

    it("已激活(active)→ 绿徽章 + 授权类型/到期/机器码/最后在线校验", async () => {
      await renderSettings({
        activation: {
          status: "active",
          machineId: "MACHINE-abcdef0123456789-XYZ",
          licenseMode: "TIME",
          expiresAt: "2027-12-31T00:00:00.000Z",
          activatedAt: "2026-07-06T00:00:00.000Z",
          lastOnlineCheckAt: "2026-07-06T00:00:00.000Z",
        },
      });
      const card = document.querySelector('[data-slot="activation-status-card"]');
      expect(card).not.toBeNull();
      expect(card!.getAttribute("data-activation-available")).toBe("true");
      const badge = document.querySelector(
        '[data-slot="activation-status-badge"]',
      );
      expect(badge?.getAttribute("data-status")).toBe("active");
      expect(badge?.textContent).toContain("已激活");
      // 授权类型:TIME → 时间型;到期显日期;机器码截断 + 完整码在 title。
      expect(
        document.querySelector('[data-slot="activation-license-mode"]')
          ?.textContent,
      ).toBe("时间型");
      expect(
        document.querySelector('[data-slot="activation-expires-at"]')
          ?.textContent,
      ).toBe("2027-12-31");
      const machine = document.querySelector(
        '[data-slot="activation-machine-id"]',
      );
      expect(machine?.getAttribute("title")).toBe("MACHINE-abcdef0123456789-XYZ");
      // [T-372 L3] 上次在线确认:绝对日期 + 挂载后补相对天数(「X 天前」)。
      expect(
        document.querySelector('[data-slot="activation-last-check"]')
          ?.textContent,
      ).toContain("2026-07-06");
      // 购买/续期入口存在。
      expect(
        document.querySelector('[data-slot="activation-purchase-link"]'),
      ).not.toBeNull();
    });

    it("永久激活(expiresAt=null)→ 授权类型「永久激活」+ 到期「永久」", async () => {
      await renderSettings({
        activation: {
          status: "active",
          machineId: "M-perm",
          licenseMode: "PERMANENT",
          expiresAt: null,
          activatedAt: "2026-07-06T00:00:00.000Z",
          lastOnlineCheckAt: "2026-07-06T00:00:00.000Z",
        },
      });
      expect(
        document.querySelector('[data-slot="activation-license-mode"]')
          ?.textContent,
      ).toBe("永久激活");
      expect(
        document.querySelector('[data-slot="activation-expires-at"]')
          ?.textContent,
      ).toBe("永久");
    });

    it("离线宽限(grace)→ 黄徽章 + 到期「离线宽限中」", async () => {
      await renderSettings({
        activation: {
          status: "grace",
          machineId: "M-grace",
          licenseMode: "TIME",
          expiresAt: "2027-12-31T00:00:00.000Z",
          activatedAt: "2026-07-06T00:00:00.000Z",
          lastOnlineCheckAt: "2026-06-01T00:00:00.000Z",
        },
      });
      const badge = document.querySelector(
        '[data-slot="activation-status-badge"]',
      );
      expect(badge?.getAttribute("data-status")).toBe("grace");
      expect(badge?.textContent).toContain("离线宽限");
      expect(
        document.querySelector('[data-slot="activation-expires-at"]')
          ?.textContent,
      ).toBe("离线宽限中");
    });

    it("已过期(expired)→ 红徽章「已过期」", async () => {
      await renderSettings({
        activation: {
          status: "expired",
          machineId: "M-exp",
          licenseMode: "TIME",
          expiresAt: "2026-01-01T00:00:00.000Z",
          activatedAt: "2025-07-06T00:00:00.000Z",
          lastOnlineCheckAt: "2025-12-01T00:00:00.000Z",
        },
      });
      const badge = document.querySelector(
        '[data-slot="activation-status-badge"]',
      );
      expect(badge?.getAttribute("data-status")).toBe("expired");
      expect(badge?.textContent).toContain("已过期");
    });

    // ── [T-372 L3] 上次在线确认「X 天前」/ 未知 + 内测宽限倒计时行 ────────────────
    it("[L3] 上次在线确认:有记录 → 「X 天前(日期)」相对文案", async () => {
      await renderSettings({
        activation: {
          status: "active",
          machineId: "M-l3",
          licenseMode: "TIME",
          expiresAt: "2027-12-31T00:00:00.000Z",
          activatedAt: "2026-07-06T00:00:00.000Z",
          lastOnlineCheckAt: "2026-07-06T00:00:00.000Z",
          lastSeenAt: "2026-07-06T00:00:00.000Z",
          graceSeconds: 86_400,
          revoked: false,
        },
      });
      const row = document.querySelector('[data-slot="activation-last-check"]');
      expect(row?.textContent).toContain("天前");
      expect(row?.textContent).toContain("2026-07-06");
    });

    it("[L3] 上次在线确认:无记录(null)→ 诚实「未知」,行不藏", async () => {
      await renderSettings({
        activation: {
          status: "active",
          machineId: "M-l3",
          licenseMode: "TIME",
          expiresAt: null,
          activatedAt: null,
          lastOnlineCheckAt: null,
          lastSeenAt: null,
          graceSeconds: null,
          revoked: false,
        },
      });
      const row = document.querySelector('[data-slot="activation-last-check"]');
      expect(row).not.toBeNull();
      expect(row?.textContent).toContain("未知");
    });

    it("[L3] 内测离线宽限(grace)→ 显倒计时行;无壳层实时判定(web/单测)→ 诚实「未知」", async () => {
      await renderSettings({
        activation: {
          status: "grace",
          machineId: "M-grace",
          licenseMode: "TIME",
          expiresAt: "2027-12-31T00:00:00.000Z",
          activatedAt: "2026-07-06T00:00:00.000Z",
          lastOnlineCheckAt: "2026-06-01T00:00:00.000Z",
          lastSeenAt: "2026-06-01T00:00:00.000Z",
          graceSeconds: 86_400,
          revoked: false,
        },
      });
      const countdown = document.querySelector(
        '[data-slot="activation-grace-countdown"]',
      );
      expect(countdown).not.toBeNull();
      // 单测/web 无 Tauri 壳 → 拿不到实时判定 → 不臆造秒数,显「未知」。
      expect(countdown?.textContent).toBe("未知");
    });

    it("[L3] 非宽限态(active)→ 不渲染倒计时行", async () => {
      await renderSettings({
        activation: {
          status: "active",
          machineId: "M-l3",
          licenseMode: "TIME",
          expiresAt: "2027-12-31T00:00:00.000Z",
          activatedAt: "2026-07-06T00:00:00.000Z",
          lastOnlineCheckAt: "2026-07-06T00:00:00.000Z",
          lastSeenAt: null,
          graceSeconds: 86_400,
          revoked: false,
        },
      });
      expect(
        document.querySelector('[data-slot="activation-grace-countdown"]'),
      ).toBeNull();
    });
  });
});
