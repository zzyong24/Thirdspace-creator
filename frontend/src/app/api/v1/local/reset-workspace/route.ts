import { NextResponse } from "next/server";
import * as fs from "node:fs/promises";

import { isDesktopRuntime } from "@/server/activation/is-desktop";
import {
  checkConfirmWord,
  isLoopbackHost,
  resetPendingMarkerPath,
  resolveAppDataDir,
} from "./plan";

// [T-332 S5] 「重置工作区」route —— 设置页危险区卡的执行端点(SPEC 账号全域隔离 §5.4)。
//
// 语义:**只落「待重置」标记,不动数据一个字节**。PGlite 单写者 —— db 目录被当前
// sidecar 进程持有,活库 rename 有损坏风险。真正的归档改名(`db → db.archived-<ts>`、
// `.auth → .auth.archived-<ts>`,fs rename 不物理删除)在**下次启动**由 Tauri Rust 壳
// 在 spawn sidecar 之前执行(src-tauri/src/workspace_reset.rs:检测标记 → 归档 → 清标记),
// 然后 sidecar 面对全新空目录跑全量迁移 + seed = 干净首启。
//
// 防护(破坏性操作,三重):
//   ① isDesktopRuntime —— web 部署无「本机数据目录」概念,诚实返回 desktop:false;
//   ② loopback Host 校验 —— sidecar 虽只 listen 127.0.0.1,仍拒一切非回环 Host(fail closed);
//   ③ 确认词 —— 必须逐字提交「重置」(前端弹层强制输入,route 再验一遍,不信任 UI)。
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  // ① web 部署:没有本机数据目录可重置 → 前端据 desktop:false 显「桌面端专属」。
  if (!isDesktopRuntime(process.env)) {
    return NextResponse.json({ ok: false, desktop: false });
  }

  // ② loopback 防护:非本机回环 Host 一律拒(缺失也拒,fail closed)。
  if (!isLoopbackHost(req.headers.get("host"))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: { confirm?: unknown };
  try {
    body = (await req.json()) as { confirm?: unknown };
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  // ③ 确认词校验(route 侧兜底,不信任前端弹层)。
  const check = checkConfirmWord(body.confirm);
  if (!check.ok) {
    return NextResponse.json({ error: check.error }, { status: check.status });
  }

  const appDataDir = resolveAppDataDir(process.env);
  if (!appDataDir) {
    // 桌面态但未注入 CREATOROS_DB_DIR(理论不会到):诚实报错,不猜路径。
    return NextResponse.json(
      { error: "data directory unavailable" },
      { status: 500 },
    );
  }

  try {
    // 落标记文件(幂等:重复请求覆盖写,时间戳取最新一次)。内容仅作排障可读性,
    // Rust 侧只认「文件存在」。
    const markerPath = resetPendingMarkerPath(appDataDir);
    await fs.writeFile(
      markerPath,
      JSON.stringify(
        {
          requestedAt: new Date().toISOString(),
          source: "settings/reset-workspace",
        },
        null,
        2,
      ),
      "utf8",
    );
    return NextResponse.json({ ok: true, pending: true });
  } catch (err) {
    console.error("[local/reset-workspace] 落标记失败:", err);
    return NextResponse.json({ error: "reset scheduling failed" }, { status: 500 });
  }
}
