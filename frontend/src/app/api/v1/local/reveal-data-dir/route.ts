import { NextResponse } from "next/server";

import { isDesktopRuntime } from "@/server/activation/is-desktop";
import { launchRevealPlan } from "../reveal-logs/launcher";
// 复用 T-259 reveal-logs 的平台「打开目录」命令选择(open / explorer / xdg-open)。
import { planRevealLogs } from "../reveal-logs/plan";
// 复用 T-332 reset-workspace 的 appData 目录解析(= CREATOROS_DB_DIR 的父级)。
import { resolveAppDataDir } from "../reset-workspace/plan";

// [T-332 S5] 「在 Finder 查看数据目录」route —— 重置工作区确认弹层里的轻量导出入口:
// 用户重置前可先打开 appData 目录(内含 db/、.auth/、logs/)自行拷贝备份。照 T-259
// reveal-logs 同款 sidecar `open` 姿态,只是目标换成 appData 根目录。
//
// 桌面专属:web 部署 isDesktopRuntime=false → {desktop:false}。无鉴权:打开的是本机
// 数据目录,与 reveal-logs 同级敏感面(sidecar 只 listen 127.0.0.1)。
export const dynamic = "force-dynamic";

export async function POST(): Promise<Response> {
  if (!isDesktopRuntime(process.env)) {
    return NextResponse.json({ ok: false, desktop: false });
  }

  const dir = resolveAppDataDir(process.env);
  if (!dir) {
    // 桌面态但未注入 CREATOROS_DB_DIR(理论不会到):诚实报错,不静默乱指。
    return NextResponse.json(
      { error: "data directory unavailable" },
      { status: 500 },
    );
  }

  try {
    const plan = planRevealLogs(dir, process.platform);
    await launchRevealPlan(plan);
    return NextResponse.json({ ok: true, dir });
  } catch (err) {
    console.error("[local/reveal-data-dir] failed:", err);
    return NextResponse.json({ error: "reveal failed" }, { status: 500 });
  }
}
