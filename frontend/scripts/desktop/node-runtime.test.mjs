import { describe, expect, it, vi } from "vitest";
import {
  defaultNodeCandidates,
  enforceDesktopBuildNode25,
  parseNodeMajor,
  planNodeRuntime,
} from "./node-runtime.mjs";

describe("desktop package Node 25 runtime guard", () => {
  it("解析带或不带 v 前缀的 Node 版本", () => {
    expect(parseNodeMajor("v25.9.0")).toBe(25);
    expect(parseNodeMajor("22.22.2")).toBe(22);
    expect(parseNodeMajor("unknown")).toBeNull();
  });

  it("当前已是 Node 25 时直接继续", () => {
    expect(
      planNodeRuntime({ currentVersion: "25.9.0", candidates: [] }),
    ).toEqual({ action: "continue", currentMajor: 25 });
  });

  it("Node 22 会选择探针确认过的 Node 25，而不是继续构建", () => {
    const plan = planNodeRuntime({
      currentVersion: "22.22.2",
      candidates: ["/node-24", "/node-25"],
      probe: (candidate) => (candidate === "/node-25" ? 25 : 24),
    });
    expect(plan).toEqual({
      action: "reexec",
      currentMajor: 22,
      executable: "/node-25",
    });
  });

  it("找不到 Node 25 时硬失败，不以 engines 警告冒充门禁", () => {
    expect(
      planNodeRuntime({
        currentVersion: "22.22.2",
        candidates: ["/node-22"],
        probe: () => 22,
      }),
    ).toEqual({
      action: "error",
      currentMajor: 22,
      reason: "runtime-not-found",
    });
  });

  it("macOS 默认覆盖 Homebrew node 与显式覆盖路径", () => {
    expect(
      defaultNodeCandidates({
        env: { CREATOROS_NODE25_BIN: "/custom/node25" },
        plat: "darwin",
      }),
    ).toEqual([
      "/custom/node25",
      "/opt/homebrew/opt/node/bin/node",
      "/usr/local/opt/node/bin/node",
    ]);
  });

  it("重启到 Node 25 时把其目录置于 PATH 最前并贯穿原参数", () => {
    const spawn = vi.fn(() => ({ status: 0 }));
    const exit = vi.fn();
    enforceDesktopBuildNode25({
      env: { PATH: "/old/bin" },
      argv: ["/node22", "/repo/package.mjs", "--flag"],
      currentVersion: "22.22.2",
      candidates: ["/opt/node25/bin/node"],
      probe: () => 25,
      spawn,
      exit,
    });
    expect(spawn).toHaveBeenCalledWith(
      "/opt/node25/bin/node",
      ["/repo/package.mjs", "--flag"],
      expect.objectContaining({
        stdio: "inherit",
        env: expect.objectContaining({
          PATH: `/opt/node25/bin${process.platform === "win32" ? ";" : ":"}/old/bin`,
          CREATOROS_NODE25_REEXEC: "1",
        }),
      }),
    );
    expect(exit).toHaveBeenCalledWith(0);
  });
});
