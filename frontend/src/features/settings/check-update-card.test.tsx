/**
 * [T-180 → T-396c → T-459] CheckUpdateCard(软件更新卡)组件测试 —— 经 SettingsDialog 渲染。
 *
 * 覆盖:①桌面态 → 显当前版本 + 「检查更新」按钮;②有新版 → 固定官网「去下载」;
 * ③远端结果里的任意 downloadUrl 不进入 DOM;④已最新;⑤失败 → 人话错误态不崩;
 * ⑥授权撤销不再影响公开更新入口;⑦web 态 → 桌面端专属空态。
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
  OFFICIAL_DOWNLOAD_URL: "https://creatoros.aitongban.cloud/",
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
    radar: { capability: "intelligence.topic-decompose", provider: "", modelName: "", baseUrl: "", hasSecret: false },
  },
  douyinAccount: { loggedIn: false },
};

/** 官网 manifest 归一化结果构造(desktop-updater available 分支)。 */
function availableResult(over: Record<string, unknown> = {}) {
  return {
    kind: "available" as const,
    info: {
      currentVersion: "0.1.0",
      latestVersion: "0.2.0",
      releaseNotes: "修复若干问题",
      downloadUrl: "https://creatoros.aitongban.cloud/",
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

  it("[T-459] 有新版 → 「去官网下载」固定产品官网", async () => {
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
    expect(dl.getAttribute("href")).toBe("https://creatoros.aitongban.cloud/");
    expect(dl.getAttribute("target")).toBe("_blank");
    expect(dl.textContent).toContain("官网下载");
    // 旧「下载并安装」入口已退役。
    expect(doc.querySelector('[data-slot="check-update-install"]')).toBeNull();
  });

  it("[T-459] mock 结果夹带任意 downloadUrl 也不形成开放跳转", async () => {
    mockIsDesktop.mockReturnValue(true);
    mockCheck.mockResolvedValue(
      availableResult({ downloadUrl: "https://evil.example.com/payload" }),
    );
    const doc = renderDialog();
    await clickCheck(doc);
    await waitFor(() =>
      expect(doc.querySelector('[data-slot="check-update-download"]')).not.toBeNull(),
    );
    const dl = doc.querySelector(
      '[data-slot="check-update-download"]',
    ) as HTMLAnchorElement;
    expect(dl.getAttribute("href")).toBe("https://creatoros.aitongban.cloud/");
    expect(dl.getAttribute("href")).not.toContain("evil.example.com");
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

// [T-459] 更新源公开且不携带授权信息，因此设置页更新入口不再消费授权状态。
describe("CheckUpdateCard — 与授权状态解耦", () => {
  const baseActivation = {
    status: "active" as const,
    machineId: "M-perp",
    licenseMode: "TIME",
    activatedAt: "2026-07-06T00:00:00.000Z",
    lastOnlineCheckAt: "2026-07-16T00:00:00.000Z",
    lastSeenAt: "2026-07-16T00:00:00.000Z",
    graceSeconds: 2_592_000,
  };

  it("买断码 revoked 也不禁用公开官网更新检查", async () => {
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
    });
    expect(
      document.querySelector('[data-slot="check-update-revoked-alert"]'),
    ).toBeNull();
    const action = document.querySelector(
      '[data-slot="check-update-action"]',
    ) as HTMLButtonElement;
    expect(action.disabled).toBe(false);
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
