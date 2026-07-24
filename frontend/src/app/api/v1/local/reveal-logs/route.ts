import { NextResponse } from "next/server";
import * as fs from "node:fs/promises";

import { isDesktopRuntime } from "@/server/activation/is-desktop";
import { launchRevealPlan } from "./launcher";
import { planRevealLogs, resolveLogsDir } from "./plan";

// [T-259/T-485] 「打开诊断日志目录」route —— 照 T-257 open-url / T-055d reveal 的 sidecar `open` 范式:
// sidecar(Next server,与用户同机)直接跑平台命令,在文件管理器打开 `<appDataDir>/logs/` 目录,
// 让用户一键定位 sidecar.log.enc / sidecar.prev.log.enc 发给开发者排障。
//
// 桌面专属:web 部署 isDesktopRuntime=false → {desktop:false},前端退回原生提示(不假装能打开)。
// 无鉴权:打开的是本机日志目录,无敏感面;且日志已在 Rust 侧落盘前脱敏(见 src-tauri/src/logging.rs)。
export const dynamic = "force-dynamic";

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
    // 不能 mkdir 一个“推导出来但其实错误”的空目录冒充日志导出成功；只打开壳层 logger
    // 已经真实创建的目录。不存在说明日志初始化/路径注入本身有问题，应诚实失败并留日志。
    const stat = await fs.stat(dir);
    if (!stat.isDirectory()) {
      throw new Error(`日志路径不是目录:${dir}`);
    }
    const plan = planRevealLogs(dir, process.platform);
    await launchRevealPlan(plan);
    return NextResponse.json({ ok: true, dir });
  } catch (err) {
    console.error("[local/reveal-logs] failed:", err);
    return NextResponse.json(
      { error: "reveal failed", dir },
      { status: 500 },
    );
  }
}
