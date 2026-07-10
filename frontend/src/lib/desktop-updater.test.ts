/**
 * [T-180] `desktop-updater` 薄封装单测。
 *
 * 覆盖:①非桌面态(web/SSR,无 __TAURI__)→ 所有入口安全降级不 throw;②桌面态探测;
 * ③check() 三态归一(有更新 / 已最新 / 失败);④进度累计。插件模块全 mock(不真跑 Tauri)。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockCheck = vi.fn();
const mockRelaunch = vi.fn();
const mockGetVersion = vi.fn();

vi.mock("@tauri-apps/plugin-updater", () => ({
  check: (...args: unknown[]) => mockCheck(...args),
}));
vi.mock("@tauri-apps/plugin-process", () => ({
  relaunch: () => mockRelaunch(),
}));
vi.mock("@tauri-apps/api/app", () => ({
  getVersion: () => mockGetVersion(),
}));

import {
  checkForUpdate,
  getAppVersion,
  isDesktopRuntimeClient,
  relaunchApp,
  type UpdateProgress,
} from "./desktop-updater";

function markDesktop() {
  (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
}
function unmarkDesktop() {
  delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
}

beforeEach(() => {
  mockCheck.mockReset();
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
  it("checkForUpdate → unavailable (does not import plugin)", async () => {
    await expect(checkForUpdate()).resolves.toEqual({ kind: "unavailable" });
    expect(mockCheck).not.toHaveBeenCalled();
  });
  it("getAppVersion → null", async () => {
    await expect(getAppVersion()).resolves.toBeNull();
  });
  it("relaunchApp → false", async () => {
    await expect(relaunchApp()).resolves.toBe(false);
    expect(mockRelaunch).not.toHaveBeenCalled();
  });
});

describe("checkForUpdate (desktop)", () => {
  it("no update → uptodate", async () => {
    markDesktop();
    mockCheck.mockResolvedValue(null);
    const res = await checkForUpdate();
    expect(res.kind).toBe("uptodate");
  });

  it("update available → available with version/notes + downloadAndInstall", async () => {
    markDesktop();
    const downloadAndInstall = vi.fn(
      (cb?: (e: unknown) => void): Promise<void> => {
        cb?.({ event: "Started", data: { contentLength: 100 } });
        cb?.({ event: "Progress", data: { chunkLength: 40 } });
        cb?.({ event: "Progress", data: { chunkLength: 60 } });
        cb?.({ event: "Finished" });
        return Promise.resolve();
      },
    );
    mockCheck.mockResolvedValue({
      version: "0.2.0",
      currentVersion: "0.1.0",
      body: "修复若干问题",
      downloadAndInstall,
    });

    const res = await checkForUpdate();
    expect(res.kind).toBe("available");
    if (res.kind !== "available") throw new Error("unreachable");
    expect(res.version).toBe("0.2.0");
    expect(res.currentVersion).toBe("0.1.0");
    expect(res.notes).toBe("修复若干问题");

    // 进度回调:字节累计 + finished。
    const events: UpdateProgress[] = [];
    await res.downloadAndInstall((p) => events.push(p));
    expect(downloadAndInstall).toHaveBeenCalledTimes(1);
    expect(events).toEqual([
      { phase: "started", contentLength: 100 },
      { phase: "downloading", downloaded: 40, contentLength: 100 },
      { phase: "downloading", downloaded: 100, contentLength: 100 },
      { phase: "finished" },
    ]);
  });

  it("check() throws → error with readable message (no crash)", async () => {
    markDesktop();
    mockCheck.mockRejectedValue(new Error("network unreachable"));
    const res = await checkForUpdate();
    expect(res.kind).toBe("error");
    if (res.kind !== "error") throw new Error("unreachable");
    expect(res.message).toMatch(/网络/);
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
