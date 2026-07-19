/**
 * [T-180 → T-396c] `desktop-updater` 薄封装单测。
 *
 * 覆盖:①非桌面态(web/SSR,无 __TAURI__)→ 所有入口安全降级不 throw;②桌面态探测;
 * ③checkLatestVersion 四态归一(有更新 / 已最新 / 非桌面 / 失败)—— IPC
 * `license_latest_version` 全 mock(不真跑 Tauri);④Rust 人话错误透传(T-412)。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockInvoke = vi.fn();
const mockRelaunch = vi.fn();
const mockGetVersion = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));
vi.mock("@tauri-apps/plugin-process", () => ({
  relaunch: () => mockRelaunch(),
}));
vi.mock("@tauri-apps/api/app", () => ({
  getVersion: () => mockGetVersion(),
}));

import {
  checkLatestVersion,
  getAppVersion,
  isDesktopRuntimeClient,
  relaunchApp,
  type LatestVersionInfo,
} from "./desktop-updater";

function markDesktop() {
  (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
}
function unmarkDesktop() {
  delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
}

function latestInfo(over: Partial<LatestVersionInfo> = {}): LatestVersionInfo {
  return {
    currentVersion: "0.1.0",
    latestVersion: "0.2.0",
    releaseNotes: "修复若干问题",
    downloadUrl: "https://agent.example.com/dl",
    updateAvailable: true,
    ...over,
  };
}

beforeEach(() => {
  mockInvoke.mockReset();
  mockRelaunch.mockReset();
  mockGetVersion.mockReset();
  unmarkDesktop();
});
afterEach(() => unmarkDesktop());

describe("isDesktopRuntimeClient", () => {
  it("false without Tauri globals (web/SSR)", () => {
    expect(isDesktopRuntimeClient()).toBe(false);
  });
  it("true when __TAURI_INTERNALS__ present", () => {
    markDesktop();
    expect(isDesktopRuntimeClient()).toBe(true);
  });
});

describe("web degradation (no Tauri) — never throws, honest downgrade", () => {
  it("checkLatestVersion → unavailable (does not invoke IPC)", async () => {
    await expect(checkLatestVersion()).resolves.toEqual({ kind: "unavailable" });
    expect(mockInvoke).not.toHaveBeenCalled();
  });
  it("getAppVersion → null", async () => {
    await expect(getAppVersion()).resolves.toBeNull();
  });
  it("relaunchApp → false", async () => {
    await expect(relaunchApp()).resolves.toBe(false);
    expect(mockRelaunch).not.toHaveBeenCalled();
  });
});

describe("checkLatestVersion (desktop) — IPC license_latest_version", () => {
  it("有新版 → available(含渠道 downloadUrl)", async () => {
    markDesktop();
    mockInvoke.mockResolvedValue(latestInfo());
    const res = await checkLatestVersion();
    expect(res.kind).toBe("available");
    if (res.kind !== "available") throw new Error("unreachable");
    expect(res.info.latestVersion).toBe("0.2.0");
    expect(res.info.currentVersion).toBe("0.1.0");
    expect(res.info.releaseNotes).toBe("修复若干问题");
    expect(res.info.downloadUrl).toBe("https://agent.example.com/dl");
    expect(mockInvoke).toHaveBeenCalledWith("license_latest_version");
  });

  it("有新版但 downloadUrl=null → 原样透传 null(红线:不回退官方链接)", async () => {
    markDesktop();
    mockInvoke.mockResolvedValue(latestInfo({ downloadUrl: null }));
    const res = await checkLatestVersion();
    if (res.kind !== "available") throw new Error("unreachable");
    expect(res.info.downloadUrl).toBeNull();
  });

  it("无新版 → uptodate", async () => {
    markDesktop();
    mockInvoke.mockResolvedValue(
      latestInfo({ latestVersion: "0.1.0", updateAvailable: false }),
    );
    const res = await checkLatestVersion();
    expect(res).toEqual({ kind: "uptodate", currentVersion: "0.1.0" });
  });

  it("[T-412] Rust 人话错误(中文)原样透传,不被通用文案覆盖", async () => {
    markDesktop();
    mockInvoke.mockRejectedValue("无法连接更新服务,请检查网络后重试。");
    const res = await checkLatestVersion();
    expect(res.kind).toBe("error");
    if (res.kind !== "error") throw new Error("unreachable");
    expect(res.message).toBe("无法连接更新服务,请检查网络后重试。");
  });

  it("[T-412] 英文技术报错(IPC 桥异常)→ 收敛为人话,不甩 error sending request", async () => {
    markDesktop();
    mockInvoke.mockRejectedValue(
      new Error("error sending request for url(https://x/latest.json)"),
    );
    const res = await checkLatestVersion();
    if (res.kind !== "error") throw new Error("unreachable");
    expect(res.message).toMatch(/网络/);
    expect(res.message).not.toMatch(/error sending request/);
  });
});

describe("relaunchApp / getAppVersion (desktop)", () => {
  it("relaunchApp → true when plugin resolves", async () => {
    markDesktop();
    mockRelaunch.mockResolvedValue(undefined);
    await expect(relaunchApp()).resolves.toBe(true);
  });
  it("relaunchApp → false when plugin rejects (honest, no throw)", async () => {
    markDesktop();
    mockRelaunch.mockRejectedValue(new Error("nope"));
    await expect(relaunchApp()).resolves.toBe(false);
  });
  it("getAppVersion → version string", async () => {
    markDesktop();
    mockGetVersion.mockResolvedValue("0.1.0");
    await expect(getAppVersion()).resolves.toBe("0.1.0");
  });
});
