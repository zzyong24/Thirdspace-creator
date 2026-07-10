/**
 * [T-180] CheckUpdateCard(软件更新卡)组件测试 —— 经 SettingsDialog 渲染。
 *
 * 覆盖:①桌面态 → 显当前版本 + 「检查更新」按钮;②web 态 → 桌面端专属空态,无检查入口;
 * ③check 失败 → 诚实错误态,不崩。`@/lib/desktop-updater` 全 mock(不真跑 Tauri)。
 */

import * as React from "react";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// next/navigation + contract-client:SettingsDialog(AccountBindingCard)依赖,给最小 mock。
const mockRouter = { refresh: vi.fn(), push: vi.fn(), replace: vi.fn(), back: vi.fn() };
vi.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/contract-client", () => ({
  client: {
    patchPreferences: (i: unknown) => Promise.resolve(i),
    putModel: (i: unknown) => Promise.resolve(i),
    patchProfile: (i: unknown) => Promise.resolve(i),
    putStorage: (i: unknown) => Promise.resolve(i),
    statusDouyin: () => Promise.resolve({ loggedIn: false }),
    loginDouyin: () => Promise.resolve({ loggedIn: true }),
  },
}));

// 被测薄封装 mock:逐用例控制桌面态探测 + check() 结果。
const mockIsDesktop = vi.fn<() => boolean>();
const mockCheck = vi.fn();
const mockGetVersion = vi.fn();
vi.mock("@/lib/desktop-updater", () => ({
  isDesktopRuntimeClient: () => mockIsDesktop(),
  getAppVersion: () => mockGetVersion(),
  checkForUpdate: () => mockCheck(),
  relaunchApp: () => Promise.resolve(true),
}));

import { SettingsDialog } from "./settings-interactive-region";
import type { SettingsViewModel } from "./settings-page";

const VM: SettingsViewModel = {
  account: {
    displayName: "Zyong Zhu",
    email: "z@creatoros.local",
    initials: "ZZ",
    planLabel: "个人版",
    timezone: "Asia/Shanghai",
    locale: "zh-CN",
  },
  preferences: {
    defaultHome: "dashboard",
    defaultCreationMode: "guided",
    defaultVisibility: "private",
    autosaveEnabled: true,
    analyticsEnabled: true,
  },
  system: { theme: "system", density: "comfortable", notifications: true, locale: "zh-CN" },
  storage: {
    backend: "local",
    rootPath: "~/CreatorOS/media",
    usedBytes: 18_000_000_000,
    totalBytes: 64_000_000_000,
    breakdown: [],
  },
  model: {
    capability: "default",
    provider: "anthropic",
    modelName: "claude-opus-4-8",
    baseUrl: "",
    apiFormat: "anthropic",
    hasSecret: false,
    temperature: 0.6,
  },
  multimodalModels: {
    image: { capability: "image.generate", provider: "", modelName: "", baseUrl: "", hasSecret: false },
    video: { capability: "video.generate", provider: "", modelName: "", baseUrl: "", hasSecret: false },
    audio: { capability: "transcribe.audio", provider: "", modelName: "", baseUrl: "", hasSecret: false },
    vision: { capability: "asset.classify", provider: "", modelName: "", baseUrl: "", hasSecret: false },
    embed: { capability: "knowledge.search.embed", provider: "", modelName: "", baseUrl: "", hasSecret: false },
    review: { capability: "script.review", provider: "", modelName: "", baseUrl: "", hasSecret: false },
    search: { capability: "web.search", provider: "", modelName: "", baseUrl: "", hasSecret: false },
  },
  douyinAccount: { loggedIn: false },
};

beforeEach(() => {
  mockIsDesktop.mockReset();
  mockCheck.mockReset();
  mockGetVersion.mockReset();
  mockGetVersion.mockResolvedValue("0.1.0");
});
afterEach(() => cleanup());

function renderDialog() {
  render(<SettingsDialog viewModel={VM} />);
  return document;
}

describe("CheckUpdateCard — 桌面态", () => {
  it("显当前版本 + 「检查更新」按钮", async () => {
    mockIsDesktop.mockReturnValue(true);
    const doc = renderDialog();

    // 挂载后翻真 → data-desktop=true + 版本读回。
    await waitFor(() => {
      const card = doc.querySelector('[data-slot="check-update-card"]');
      expect(card?.getAttribute("data-desktop")).toBe("true");
    });
    await waitFor(() =>
      expect(
        doc.querySelector('[data-slot="app-version"]')?.textContent,
      ).toContain("0.1.0"),
    );
    expect(doc.querySelector('[data-slot="check-update-action"]')).not.toBeNull();
  });

  it("点检查 → 有新版 → 显版本 + notes + 「下载并安装」", async () => {
    mockIsDesktop.mockReturnValue(true);
    mockCheck.mockResolvedValue({
      kind: "available",
      version: "0.2.0",
      currentVersion: "0.1.0",
      notes: "修复若干问题",
      downloadAndInstall: vi.fn(() => Promise.resolve()),
    });
    const doc = renderDialog();
    await waitFor(() =>
      expect(doc.querySelector('[data-slot="check-update-action"]')).not.toBeNull(),
    );
    fireEvent.click(
      doc.querySelector('[data-slot="check-update-action"]') as HTMLElement,
    );
    await waitFor(() =>
      expect(doc.querySelector('[data-slot="check-update-available"]')).not.toBeNull(),
    );
    expect(
      doc.querySelector('[data-slot="check-update-available"]')?.textContent,
    ).toContain("0.2.0");
    expect(doc.querySelector('[data-slot="check-update-install"]')).not.toBeNull();
  });

  it("点检查 → 已最新 → 「已是最新版」", async () => {
    mockIsDesktop.mockReturnValue(true);
    mockCheck.mockResolvedValue({ kind: "uptodate", currentVersion: "0.1.0" });
    const doc = renderDialog();
    await waitFor(() =>
      expect(doc.querySelector('[data-slot="check-update-action"]')).not.toBeNull(),
    );
    fireEvent.click(
      doc.querySelector('[data-slot="check-update-action"]') as HTMLElement,
    );
    await waitFor(() => {
      const fb = doc.querySelector('[data-slot="check-update-feedback"]');
      expect(fb?.getAttribute("data-tone")).toBe("uptodate");
      expect(fb?.textContent).toContain("最新");
    });
  });

  it("点检查 → 失败 → 诚实错误态,不崩", async () => {
    mockIsDesktop.mockReturnValue(true);
    mockCheck.mockResolvedValue({ kind: "error", message: "检查更新失败:网络不可达,请检查网络后重试。" });
    const doc = renderDialog();
    await waitFor(() =>
      expect(doc.querySelector('[data-slot="check-update-action"]')).not.toBeNull(),
    );
    fireEvent.click(
      doc.querySelector('[data-slot="check-update-action"]') as HTMLElement,
    );
    await waitFor(() => {
      const fb = doc.querySelector('[data-slot="check-update-feedback"]');
      expect(fb?.getAttribute("data-tone")).toBe("error");
      expect(fb?.textContent).toContain("失败");
    });
  });
});

describe("CheckUpdateCard — web 态", () => {
  it("非桌面 → 桌面端专属空态,无检查入口", async () => {
    mockIsDesktop.mockReturnValue(false);
    const doc = renderDialog();
    await waitFor(() =>
      expect(doc.querySelector('[data-slot="check-update-card"]')).not.toBeNull(),
    );
    const card = doc.querySelector('[data-slot="check-update-card"]');
    expect(card?.getAttribute("data-desktop")).toBe("false");
    // web 态无「检查更新」按钮(入口不渲染)。
    expect(doc.querySelector('[data-slot="check-update-action"]')).toBeNull();
    expect(doc.querySelector('[data-slot="check-update-badge"]')?.textContent).toContain(
      "桌面端专属",
    );
  });
});
