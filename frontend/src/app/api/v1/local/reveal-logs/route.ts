import { NextResponse } from "next/server";
import * as fs from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { isDesktopRuntime } from "@/server/activation/is-desktop";
import { planRevealLogs, resolveLogsDir } from "./plan";

// [T-259] 「导出诊断日志」route —— 照 T-257 open-url / T-055d reveal 的 sidecar `open` 范式:
// sidecar(Next server,与用户同机)直接跑平台命令,在文件管理器打开 `<appDataDir>/logs/` 目录,
// 让用户一键定位 sidecar.log / sidecar.prev.log 发给开发者排障。
//
// 桌面专属:web 部署 isDesktopRuntime=false → {desktop:false},前端退回原生提示(不假装能打开)。
// 无鉴权:打开的是本机日志目录,无敏感面;且日志已在 Rust 侧落盘前脱敏(见 src-tauri/src/logging.rs)。
export const dynamic = "force-dynamic";

const execFileAsync = promisify(execFile);

export async function POST(): Promise<Response> {
  // web 部署:不在服务端替用户开文件管理器 → 前端据 desktop:false 提示「桌面端专属」。
  if (!isDesktopRuntime(process.env)) {
    return NextResponse.json({ ok: false, desktop: false });
  }

  const dir = resolveLogsDir(process.env);
  if (!dir) {
    // 桌面态但未注入 LOG_DIR/DB_DIR(理论不会到):诚实报错,不静默乱指。
    return NextResponse.json(
      { error: "logs directory unavailable" },
      { status: 500 },
    );
  }

  try {
    // 目录可能还没建(首启即导出 / 落盘失败)→ 先建出来再开,用户预期「总能打开」。
    await fs.mkdir(dir, { recursive: true });
    const plan = planRevealLogs(dir, process.platform);
    await execFileAsync(plan.cmd, plan.args);
    return NextResponse.json({ ok: true, dir });
  } catch (err) {
    console.error("[local/reveal-logs] failed:", err);
    return NextResponse.json({ error: "reveal failed" }, { status: 500 });
  }
}
