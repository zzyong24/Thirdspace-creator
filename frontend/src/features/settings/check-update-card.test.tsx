/**
 * [T-180 → T-396c] CheckUpdateCard(软件更新卡)组件测试 —— 经 SettingsDialog 渲染。
 *
 * 覆盖:①桌面态 → 显当前版本 + 「检查更新」按钮;②有新版 + 渠道 downloadUrl → 「去下载」
 * 外开渠道页;③有新版 + downloadUrl=null → 「联系授权方」(有 supportUrl 可点 / 无则纯文案,
 * **不回退官方链接**红线);④已最新;⑤失败 → 人话错误态不崩;⑥买断撤销停更新(T-372 L3);
 * ⑦web 态 → 桌面端专属空态。`@/lib/desktop-updater` 全 mock(不真跑 Tauri IPC)。
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

// 被测薄封装 mock:逐用例控制桌面态探测 + checkLatestVersion() 结果。
const mockIsDesktop = vi.fn<() => boolean>();
const mockCheck = vi.fn();
const mockGetVersion = vi.fn();
vi.mock("@/lib/desktop-updater", () => ({
  isDesktopRuntimeClient: () => mockIsDesktop(),
  getAppVersion: () => mockGetVersion(),
  checkLatestVersion: () => mockCheck(),
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
    defaultCreationMode: "guided",
    autosaveEnabled: true,
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
    fallback: { capability: "chat.fallback", provider: "", modelName: "", baseUrl: "", hasSecret: false },
  },
  douyinAccount: { loggedIn: false },
};

/** IPC 归一化结果构造(desktop-updater CheckLatestResult 的 available 分支)。 */
function availableResult(over: Record<string, unknown> = {}) {
  return {
    kind: "available" as const,
    info: {
      currentVersion: "0.1.0",
      latestVersion: "0.2.0",
      releaseNotes: "修复若干问题",
      downloadUrl: "https://agent.example.com/dl",
      updateAvailable: true,
      ...over,
    },
  };
}

beforeEach(() => {
  mockIsDesktop.mockReset();
  mockCheck.mockReset();
  mockGetVersion.mockReset();
  mockGetVersion.mockResolvedValue("0.1.0");
});
afterEach(() => cleanup());

function renderDialog(props: Record<string, unknown> = {}) {
  render(<SettingsDialog viewModel={VM} {...props} />);
  return document;
}

async function clickCheck(doc: Document) {
  await waitFor(() =>
    expect(doc.querySelector('[data-slot="check-update-action"]')).not.toBeNull(),
  );
  fireEvent.click(
    doc.querySelector('[data-slot="check-update-action"]') as HTMLElement,
  );
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

  it("[T-396c] 有新版 + 渠道 downloadUrl → 「去下载」外开渠道页(无内置下载安装)", async () => {
    mockIsDesktop.mockReturnValue(true);
    mockCheck.mockResolvedValue(availableResult());
    const doc = renderDialog();
    await clickCheck(doc);
    await waitFor(() =>
      expect(doc.querySelector('[data-slot="check-update-available"]')).not.toBeNull(),
    );
    const block = doc.querySelector('[data-slot="check-update-available"]');
    expect(block?.textContent).toContain("0.2.0");
    expect(block?.textContent).toContain("修复若干问题");
    const dl = doc.querySelector(
      '[data-slot="check-update-download"]',
    ) as HTMLAnchorElement;
    expect(dl).not.toBeNull();
    expect(dl.getAttribute("href")).toBe("https://agent.example.com/dl");
    expect(dl.getAttribute("target")).toBe("_blank");
    // 旧「下载并安装」入口已退役。
    expect(doc.querySelector('[data-slot="check-update-install"]')).toBeNull();
  });

  it("[T-396c 红线] downloadUrl=null + 无 supportUrl → 纯文案「联系授权方」,零链接", async () => {
    mockIsDesktop.mockReturnValue(true);
    mockCheck.mockResolvedValue(availableResult({ downloadUrl: null }));
    const doc = renderDialog();
    await clickCheck(doc);
    await waitFor(() =>
      expect(doc.querySelector('[data-slot="check-update-contact"]')).not.toBeNull(),
    );
    const contact = doc.querySelector('[data-slot="check-update-contact"]');
    expect(contact?.textContent).toContain("请联系你的授权方获取新版");
    expect(contact?.querySelector("a")).toBeNull();
    expect(doc.querySelector('[data-slot="check-update-download"]')).toBeNull();
    // 绝不回退官方链接。
    expect(
      doc.querySelector('[data-slot="check-update-available"]')?.innerHTML ?? "",
    ).not.toContain("aitongban");
  });

  it("[T-396c] downloadUrl=null + 缓存有 supportUrl → 联系文案可点跳渠道", async () => {
    mockIsDesktop.mockReturnValue(true);
    mockCheck.mockResolvedValue(availableResult({ downloadUrl: null }));
    const doc = renderDialog({
      channelLinks: {
        purchaseUrl: null,
        supportUrl: "https://agent.example.com/contact",
        downloadUrl: null,
      },
    });
    await clickCheck(doc);
    await waitFor(() =>
      expect(doc.querySelector('[data-slot="check-update-contact"]')).not.toBeNull(),
    );
    const link = doc
      .querySelector('[data-slot="check-update-contact"]')
      ?.querySelector("a");
    expect(link).not.toBeNull();
    expect(link?.getAttribute("href")).toBe("https://agent.example.com/contact");
  });

  it("点检查 → 已最新 → 「已是最新版」", async () => {
    mockIsDesktop.mockReturnValue(true);
    mockCheck.mockResolvedValue({ kind: "uptodate", currentVersion: "0.1.0" });
    const doc = renderDialog();
    await clickCheck(doc);
    await waitFor(() => {
      const fb = doc.querySelector('[data-slot="check-update-feedback"]');
      expect(fb?.getAttribute("data-tone")).toBe("uptodate");
      expect(fb?.textContent).toContain("最新");
    });
  });

  it("[T-412] 点检查 → 失败 → 人话错误态,不崩", async () => {
    mockIsDesktop.mockReturnValue(true);
    mockCheck.mockResolvedValue({
      kind: "error",
      message: "无法连接更新服务,请检查网络后重试。",
    });
    const doc = renderDialog();
    await clickCheck(doc);
    await waitFor(() => {
      const fb = doc.querySelector('[data-slot="check-update-feedback"]');
      expect(fb?.getAttribute("data-tone")).toBe("error");
      expect(fb?.textContent).toContain("无法连接更新服务");
    });
  });
});

// [T-372 L3] 买断撤销软降级(SPEC §8):revoked + expiresAt=null(买断)→ 更新入口旁
// 显式提示「更新服务已暂停,不影响你正常使用」+ 检查更新按钮停用;
// 内测(expiresAt 非 null)revoked 不走此路(内测吊销 = 整体跳激活页,由 Rust 门负责)。
describe("CheckUpdateCard — 买断撤销停更新 (T-372 L3)", () => {
  const baseActivation = {
    status: "active" as const,
    machineId: "M-perp",
    licenseMode: "TIME",
    activatedAt: "2026-07-06T00:00:00.000Z",
    lastOnlineCheckAt: "2026-07-16T00:00:00.000Z",
    lastSeenAt: "2026-07-16T00:00:00.000Z",
    graceSeconds: 2_592_000,
  };

  it("买断 + revoked → 更新入口旁提示 + 检查按钮停用(核心功能不受影响)", async () => {
    mockIsDesktop.mockReturnValue(true);
    render(
      <SettingsDialog
        viewModel={VM}
        activation={{ ...baseActivation, expiresAt: null, revoked: true }}
      />,
    );
    await waitFor(() => {
      const card = document.querySelector('[data-slot="check-update-card"]');
      expect(card?.getAttribute("data-desktop")).toBe("true");
      expect(card?.getAttribute("data-updates-blocked")).toBe("true");
    });
    const alert = document.querySelector(
      '[data-slot="check-update-revoked-alert"]',
    );
    expect(alert).not.toBeNull();
    expect(alert?.textContent).toContain("更新服务已暂停");
    expect(alert?.textContent).toContain("不影响你正常使用");
    const action = document.querySelector(
      '[data-slot="check-update-action"]',
    ) as HTMLButtonElement;
    expect(action.disabled).toBe(true);
  });

  it("内测(expiresAt 非 null)revoked → 不显停更新提示(码型不共用分支)", async () => {
    mockIsDesktop.mockReturnValue(true);
    render(
      <SettingsDialog
        viewModel={VM}
        activation={{
          ...baseActivation,
          expiresAt: "2026-07-20T00:00:00.000Z",
          revoked: true,
        }}
      />,
    );
    await waitFor(() => {
      const card = document.querySelector('[data-slot="check-update-card"]');
      expect(card?.getAttribute("data-desktop")).toBe("true");
    });
    expect(
      document.querySelector('[data-slot="check-update-revoked-alert"]'),
    ).toBeNull();
    const action = document.querySelector(
      '[data-slot="check-update-action"]',
    ) as HTMLButtonElement;
    expect(action.disabled).toBe(false);
  });

  it("买断未撤销 → 无提示,按钮可用", async () => {
    mockIsDesktop.mockReturnValue(true);
    render(
      <SettingsDialog
        viewModel={VM}
        activation={{ ...baseActivation, expiresAt: null, revoked: false }}
      />,
    );
    await waitFor(() => {
      const card = document.querySelector('[data-slot="check-update-card"]');
      expect(card?.getAttribute("data-updates-blocked")).toBe("false");
    });
    expect(
      document.querySelector('[data-slot="check-update-revoked-alert"]'),
    ).toBeNull();
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
