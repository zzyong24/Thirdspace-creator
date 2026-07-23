import * as path from "node:path";
import { describe, expect, it } from "vitest";

import { planRevealLogs, resolveLogsDir } from "./plan";

// [T-259] 诊断日志目录定位 + 平台「打开目录」命令。
describe("resolveLogsDir", () => {
  it("优先由 canonical CREATOROS_APP_DATA_DIR 派生，避免多套路径漂移", () => {
    expect(
      resolveLogsDir({
        CREATOROS_APP_DATA_DIR: "/data/app",
        CREATOROS_LOG_DIR: "/wrong/logs",
      }),
    ).toBe(path.join("/data/app", "logs"));
  });

  it("兼容旧壳：没有 APP_DATA_DIR 时才使用显式 CREATOROS_LOG_DIR", () => {
    expect(resolveLogsDir({ CREATOROS_LOG_DIR: "/legacy/logs" })).toBe(
      "/legacy/logs",
    );
  });

  it("不再从 DB_DIR 猜 logs 路径，缺少壳层日志真值就诚实失败", () => {
    expect(resolveLogsDir({ CREATOROS_DB_DIR: "/data/app/db" })).toBeNull();
  });

  it("两者都无(非桌面 / 未注入)→ null", () => {
    expect(resolveLogsDir({})).toBeNull();
  });

  it("空白值当作未设置", () => {
    expect(resolveLogsDir({ CREATOROS_LOG_DIR: "   " })).toBeNull();
  });
});

describe("planRevealLogs", () => {
  it("darwin → open <dir>", () => {
    expect(planRevealLogs("/x/logs", "darwin")).toEqual({
      cmd: "open",
      args: ["/x/logs"],
      completion: "exit",
    });
  });

  it("win32 → explorer.exe <dir>，只等成功 spawn（Explorer 非 0 退出不等于打开失败）", () => {
    expect(planRevealLogs("C:/x/logs", "win32")).toEqual({
      cmd: "explorer.exe",
      args: ["C:/x/logs"],
      completion: "spawn",
    });
  });

  it("linux → xdg-open <dir>", () => {
    expect(planRevealLogs("/x/logs", "linux")).toEqual({
      cmd: "xdg-open",
      args: ["/x/logs"],
      completion: "exit",
    });
  });
});
