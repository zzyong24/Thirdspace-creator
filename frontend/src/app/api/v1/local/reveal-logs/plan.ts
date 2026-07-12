// [T-259] 「导出诊断日志」纯逻辑(与 route 分离,好单测):定位 logs 目录 + 选平台「打开目录」命令。
//
// 照 T-257 open-url 的 route/plan 分离范式:route 只做 isDesktopRuntime 判定 + I/O(mkdir + execFile),
// 这里做无副作用的目录解析与命令选择,方便针对各平台 + 环境变量组合写单测。

import * as path from "node:path";

/**
 * 定位诊断日志目录。优先用 Rust 壳注入的 `CREATOROS_LOG_DIR`(lib.rs setup 里注入,
 * 指向 `<appDataDir>/logs`);缺省时从 `CREATOROS_DB_DIR`(= `<appDataDir>/db`)推导其
 * 同级 `logs`(兜底,避免 env 漂移时拿不到)。都没有 → null(非桌面 / 未注入)。
 */
export function resolveLogsDir(
  env: Record<string, string | undefined>,
): string | null {
  const explicit = env.CREATOROS_LOG_DIR?.trim();
  if (explicit) return explicit;
  const dbDir = env.CREATOROS_DB_DIR?.trim();
  if (dbDir) return path.join(path.dirname(dbDir), "logs");
  return null;
}

/** 平台「在文件管理器打开目录」命令(macOS Finder / Windows Explorer / Linux xdg-open)。 */
export function planRevealLogs(
  dir: string,
  platform: NodeJS.Platform,
): { cmd: string; args: string[] } {
  if (platform === "win32") return { cmd: "explorer", args: [dir] };
  if (platform === "linux") return { cmd: "xdg-open", args: [dir] };
  // macOS(darwin)及其它:`open <dir>` 在 Finder 打开目录。
  return { cmd: "open", args: [dir] };
}
