import * as path from "node:path";

import type { RevealPlan } from "../reveal-logs/plan";

export type RevealTargetKind = "asset" | "project";

/**
 * 将“在系统文件管理器中显示”转换为无副作用、可全平台测试的执行计划。
 * 路径始终作为独立 argv 传给进程，不经过 shell；Windows Explorer 只等成功 spawn。
 */
export function planRevealTarget(
  targetPath: string,
  kind: RevealTargetKind,
  platform: NodeJS.Platform,
): RevealPlan {
  if (platform === "win32") {
    return kind === "asset"
      ? {
          cmd: "explorer.exe",
          args: [`/select,${targetPath}`],
          completion: "spawn",
        }
      : {
          cmd: "explorer.exe",
          args: [targetPath],
          completion: "spawn",
        };
  }

  if (platform === "darwin") {
    return {
      cmd: "open",
      args: kind === "asset" ? ["-R", targetPath] : [targetPath],
      completion: "exit",
    };
  }

  if (platform === "linux") {
    // xdg-open 没有跨桌面环境统一的“选中文件”协议；打开父目录是诚实且稳定的降级。
    const openPath =
      kind === "asset" ? path.posix.dirname(targetPath) : targetPath;
    return {
      cmd: "xdg-open",
      args: [openPath],
      completion: "exit",
    };
  }

  throw new Error(`unsupported reveal platform: ${platform}`);
}
