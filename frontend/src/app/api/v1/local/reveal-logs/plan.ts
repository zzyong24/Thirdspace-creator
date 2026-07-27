// [T-259/T-485] 定位 canonical logs 目录 + 选平台「打开目录」命令。
//
// 照 T-257 open-url 的 route/plan 分离范式:route 只做 isDesktopRuntime 判定 + I/O(stat + launch),
// 这里做无副作用的目录解析与命令选择,方便针对各平台 + 环境变量组合写单测。

import * as path from "node:path";

export interface RevealPlan {
  cmd: string;
  args: string[];
  completion: "spawn" | "exit";
}

/**
 * 定位诊断日志目录。新壳只认 Rust 注入的 canonical `CREATOROS_APP_DATA_DIR` 并派生
 * `<appDataDir>/logs`；`CREATOROS_LOG_DIR` 仅供旧壳兼容。绝不再从 DB 路径猜目录。
 */
export function resolveLogsDir(
  env: Record<string, string | undefined>,
): string | null {
  const appDataDir = env.CREATOROS_APP_DATA_DIR?.trim();
  if (appDataDir) return path.join(appDataDir, "logs");
  // 旧壳兼容：新壳始终注入 APP_DATA_DIR，只有旧版本 sidecar 才走这条。
  const explicit = env.CREATOROS_LOG_DIR?.trim();
  if (explicit) return explicit;
  return null;
}

/** 平台「在文件管理器打开目录」命令(macOS Finder / Windows Explorer / Linux xdg-open)。 */
export function planRevealLogs(
  dir: string,
  platform: NodeJS.Platform,
): RevealPlan {
  // Explorer 经常在目录已经打开后以非 0 退出；这里只把“进程成功创建”当完成。
  if (platform === "win32") {
    return { cmd: "explorer.exe", args: [dir], completion: "spawn" };
  }
  if (platform === "linux") {
    return { cmd: "xdg-open", args: [dir], completion: "exit" };
  }
  // macOS(darwin)及其它:`open <dir>` 在 Finder 打开目录。
  return { cmd: "open", args: [dir], completion: "exit" };
}
