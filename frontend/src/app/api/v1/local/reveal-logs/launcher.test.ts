import { EventEmitter } from "node:events";
import type { ChildProcess, spawn } from "node:child_process";
import { describe, expect, it, vi } from "vitest";

import { launchRevealPlan } from "./launcher";

describe("launchRevealPlan", () => {
  it("Windows Explorer 成功 spawn 即返回，不把随后非 0 退出误判成打开失败", async () => {
    const child = new EventEmitter() as EventEmitter &
      Pick<ChildProcess, "once" | "unref">;
    child.unref = vi.fn();
    const spawnFake = vi.fn(() => {
      queueMicrotask(() => {
        child.emit("spawn");
        child.emit("exit", 1);
      });
      return child as ChildProcess;
    }) as unknown as typeof spawn;

    await expect(
      launchRevealPlan(
        {
          cmd: "explorer.exe",
          args: ["C:\\Users\\Alice\\AppData\\Roaming\\CreatorOS\\logs"],
          completion: "spawn",
        },
        { spawn: spawnFake },
      ),
    ).resolves.toBeUndefined();
    expect(child.unref).toHaveBeenCalled();
    expect(spawnFake).toHaveBeenCalledWith(
      "explorer.exe",
      ["C:\\Users\\Alice\\AppData\\Roaming\\CreatorOS\\logs"],
      {
        detached: true,
        stdio: "ignore",
        windowsHide: false,
      },
    );
  });

  it("spawn 本身失败仍诚实 reject", async () => {
    const child = new EventEmitter() as EventEmitter &
      Pick<ChildProcess, "once" | "unref">;
    child.unref = vi.fn();
    const spawnFake = vi.fn(() => {
      queueMicrotask(() => child.emit("error", new Error("ENOENT")));
      return child as ChildProcess;
    }) as unknown as typeof spawn;

    await expect(
      launchRevealPlan(
        {
          cmd: "explorer.exe",
          args: ["C:\\missing"],
          completion: "spawn",
        },
        { spawn: spawnFake },
      ),
    ).rejects.toThrow("ENOENT");
  });
});
