import * as path from "node:path";
import { describe, expect, it } from "vitest";

import { planRevealLogs, resolveLogsDir } from "./plan";

// [T-259] 诊断日志目录定位 + 平台「打开目录」命令。
describe("resolveLogsDir", () => {
  it("优先用 CREATOROS_LOG_DIR", () => {
    expect(
      resolveLogsDir({ CREATOROS_LOG_DIR: "/data/app/logs" }),
    ).toBe("/data/app/logs");
  });

  it("缺 LOG_DIR → 从 CREATOROS_DB_DIR 同级推导 logs", () => {
    expect(resolveLogsDir({ CREATOROS_DB_DIR: "/data/app/db" })).toBe(
      path.join("/data/app", "logs"),
    );
  });

  it("LOG_DIR 优先级高于 DB_DIR", () => {
    expect(
      resolveLogsDir({
        CREATOROS_LOG_DIR: "/explicit/logs",
        CREATOROS_DB_DIR: "/data/app/db",
      }),
    ).toBe("/explicit/logs");
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
    });
  });

  it("win32 → explorer <dir>", () => {
    expect(planRevealLogs("C:/x/logs", "win32")).toEqual({
      cmd: "explorer",
      args: ["C:/x/logs"],
    });
  });

  it("linux → xdg-open <dir>", () => {
    expect(planRevealLogs("/x/logs", "linux")).toEqual({
      cmd: "xdg-open",
      args: ["/x/logs"],
    });
  });
});
