// [T-372 W-core §14] 平台路径纯函数单测 —— 本机(macOS)注入平台标识验证 Windows 分支,
// 不依赖 Windows 实机(真机行为验证归 W-ci)。
import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { playwrightBrowsersCacheRoot } from "./platform-paths.mjs";

describe("playwrightBrowsersCacheRoot(W2 平台分支)", () => {
  it("darwin → ~/Library/Caches/ms-playwright(与旧实现逐字节一致,mac 零回归)", () => {
    expect(playwrightBrowsersCacheRoot("darwin", {}, "/Users/u")).toBe(
      join("/Users/u", "Library", "Caches", "ms-playwright"),
    );
  });

  it("win32 → %LOCALAPPDATA%\\ms-playwright(playwright registry 默认约定)", () => {
    expect(
      playwrightBrowsersCacheRoot("win32", { LOCALAPPDATA: "C:\\Users\\u\\AppData\\Local" }, "C:\\Users\\u"),
    ).toBe(join("C:\\Users\\u\\AppData\\Local", "ms-playwright"));
  });

  it("win32 且 LOCALAPPDATA 缺省/空白 → 回退 <home>/AppData/Local/ms-playwright", () => {
    expect(playwrightBrowsersCacheRoot("win32", {}, "C:\\Users\\u")).toBe(
      join("C:\\Users\\u", "AppData", "Local", "ms-playwright"),
    );
    expect(playwrightBrowsersCacheRoot("win32", { LOCALAPPDATA: "  " }, "C:\\Users\\u")).toBe(
      join("C:\\Users\\u", "AppData", "Local", "ms-playwright"),
    );
  });

  it("linux → $XDG_CACHE_HOME/ms-playwright,缺省回退 ~/.cache", () => {
    expect(playwrightBrowsersCacheRoot("linux", { XDG_CACHE_HOME: "/xdg" }, "/home/u")).toBe(
      join("/xdg", "ms-playwright"),
    );
    expect(playwrightBrowsersCacheRoot("linux", {}, "/home/u")).toBe(
      join("/home/u", ".cache", "ms-playwright"),
    );
  });

  it("未知平台 → null(调用方跳过随包,回落运行时下载,不阻塞打包)", () => {
    expect(playwrightBrowsersCacheRoot("freebsd", {}, "/home/u")).toBeNull();
  });
});
