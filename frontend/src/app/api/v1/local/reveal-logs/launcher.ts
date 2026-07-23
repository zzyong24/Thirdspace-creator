import {
  execFile as nodeExecFile,
  spawn as nodeSpawn,
  type ChildProcess,
} from "node:child_process";

import type { RevealPlan } from "./plan";

export interface RevealLauncherDeps {
  execFile?: typeof nodeExecFile;
  spawn?: typeof nodeSpawn;
}

/** 执行打开目录计划；Windows Explorer 只等 spawn，避免“已打开但 exit=1”被误判失败。 */
export function launchRevealPlan(
  plan: RevealPlan,
  deps: RevealLauncherDeps = {},
): Promise<void> {
  if (plan.completion === "spawn") {
    const spawnImpl = deps.spawn ?? nodeSpawn;
    return new Promise((resolve, reject) => {
      const child = spawnImpl(plan.cmd, plan.args, {
        detached: true,
        stdio: "ignore",
        windowsHide: true,
      });
      child.once("error", reject);
      child.once("spawn", () => {
        child.unref();
        resolve();
      });
    });
  }

  const execFileImpl = deps.execFile ?? nodeExecFile;
  return new Promise((resolve, reject) => {
    execFileImpl(
      plan.cmd,
      plan.args,
      { windowsHide: true },
      (error: Error | null) => {
        if (error) reject(error);
        else resolve();
      },
    );
  });
}

// 仅让 fake 测试可用 ChildProcess 结构类型，不在运行时产生额外逻辑。
export type RevealChildProcess = Pick<ChildProcess, "once" | "unref">;
