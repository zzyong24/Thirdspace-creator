/**
 * [T-180 → T-396c] `desktop-updater` 薄封装单测。
 *
 * 覆盖:①非桌面态(web/SSR,无 __TAURI__)→ 所有入口安全降级不 throw;②桌面态探测;
 * ③checkLatestVersion 四态归一(有更新 / 已最新 / 非桌面 / 失败)—— 只 GET 官网
 * 公开 latest.json,不再调用授权 IPC;④非法响应/网络错误收敛成人话(T-412)。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockInvoke = vi.fn();
const mockGetVersion = vi.fn();
const mockFetch = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));
vi.mock("@tauri-apps/api/app", () => ({
  getVersion: () => mockGetVersion(),
}));

import {
  checkLatestVersion,
  getAppVersion,
  isDesktopRuntimeClient,
  OFFICIAL_DOWNLOAD_URL,
  OFFICIAL_UPDATE_MANIFEST_URL,
  relaunchApp,
  versionNewer,
} from "./desktop-updater";

function markDesktop() {
  (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
}
function unmarkDesktop() {
  delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
}

beforeEach(() => {
  mockInvoke.mockReset();
  mockGetVersion.mockReset();
  mockFetch.mockReset();
  vi.stubGlobal("fetch", mockFetch);
  unmarkDesktop();
});
afterEach(() => {
  unmarkDesktop();
  vi.unstubAllGlobals();
});

function manifestResponse(
  body: Record<string, unknown> = {
    version: "0.2.0",
    notes: "修复若干问题",
    platforms: {
      "windows-x86_64": { url: "https://evil.example.com/never-trust-this" },
    },
  },
) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

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
    expect(mockInvoke).not.toHaveBeenCalledWith("relaunch_app");
  });
});

describe("checkLatestVersion (desktop) — 官网公开 latest.json", () => {
  it("有新版 → available，下载地址固定官网且零授权 IPC", async () => {
    markDesktop();
    mockGetVersion.mockResolvedValue("0.1.0");
    mockFetch.mockResolvedValue(manifestResponse());
    const res = await checkLatestVersion();
    expect(res.kind).toBe("available");
    if (res.kind !== "available") throw new Error("unreachable");
    expect(res.info.latestVersion).toBe("0.2.0");
    expect(res.info.currentVersion).toBe("0.1.0");
    expect(res.info.releaseNotes).toBe("修复若干问题");
    expect(res.info.downloadUrl).toBe(OFFICIAL_DOWNLOAD_URL);
    expect(mockFetch).toHaveBeenCalledWith(OFFICIAL_UPDATE_MANIFEST_URL, {
      method: "GET",
      cache: "no-store",
    });
    expect(mockInvoke).not.toHaveBeenCalled();
    expect(JSON.stringify(mockFetch.mock.calls)).not.toMatch(
      /license|machineId|projectKey|nonce|code/i,
    );
  });

  it("manifest 内任意平台 URL 一律忽略，不形成开放跳转", async () => {
    markDesktop();
    mockGetVersion.mockResolvedValue("0.1.0");
    mockFetch.mockResolvedValue(manifestResponse());
    const res = await checkLatestVersion();
    if (res.kind !== "available") throw new Error("unreachable");
    expect(res.info.downloadUrl).toBe(OFFICIAL_DOWNLOAD_URL);
    expect(res.info.downloadUrl).not.toContain("evil.example.com");
  });

  it("无新版 → uptodate", async () => {
    markDesktop();
    mockGetVersion.mockResolvedValue("0.2.0");
    mockFetch.mockResolvedValue(manifestResponse({ version: "0.2.0" }));
    const res = await checkLatestVersion();
    expect(res).toEqual({ kind: "uptodate", currentVersion: "0.2.0" });
  });

  it("官网响应不是合法版本清单 → 人话错误，不假装已最新", async () => {
    markDesktop();
    mockGetVersion.mockResolvedValue("0.1.0");
    mockFetch.mockResolvedValue(manifestResponse({ version: "" }));
    const res = await checkLatestVersion();
    expect(res.kind).toBe("error");
    if (res.kind !== "error") throw new Error("unreachable");
    expect(res.message).toMatch(/响应|稍后/);
  });

  it("[T-412] 官网网络错误 → 收敛为人话，不泄 fetch 技术串", async () => {
    markDesktop();
    mockGetVersion.mockResolvedValue("0.1.0");
    mockFetch.mockRejectedValue(new Error("fetch failed for public manifest"));
    const res = await checkLatestVersion();
    if (res.kind !== "error") throw new Error("unreachable");
    expect(res.message).toMatch(/网络/);
    expect(res.message).not.toMatch(/fetch failed/);
  });
});

describe("versionNewer", () => {
  it("按数字段比较，兼容 v 前缀与缺位", () => {
    expect(versionNewer("0.2.0", "0.1.9")).toBe(true);
    expect(versionNewer("v1.0.0", "0.9.9")).toBe(true);
    expect(versionNewer("0.1.10", "0.1.9")).toBe(true);
    expect(versionNewer("0.2", "0.2.0")).toBe(false);
    expect(versionNewer("0.1.9", "0.1.10")).toBe(false);
    expect(versionNewer("garbage", "0.1.0")).toBe(false);
  });
});

describe("relaunchApp / getAppVersion (desktop)", () => {
  it("relaunchApp → true when plugin resolves", async () => {
    markDesktop();
    mockInvoke.mockResolvedValue(undefined);
    await expect(relaunchApp()).resolves.toBe(true);
    expect(mockInvoke).toHaveBeenCalledWith("relaunch_app");
  });
  it("relaunchApp → false when plugin rejects (honest, no throw)", async () => {
    markDesktop();
    mockInvoke.mockRejectedValue(new Error("nope"));
    await expect(relaunchApp()).resolves.toBe(false);
  });
  it("getAppVersion → version string", async () => {
    markDesktop();
    mockGetVersion.mockResolvedValue("0.1.0");
    await expect(getAppVersion()).resolves.toBe("0.1.0");
  });
});
