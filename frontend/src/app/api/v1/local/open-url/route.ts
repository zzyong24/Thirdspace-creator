import { NextResponse } from "next/server";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { isDesktopRuntime } from "@/server/activation/is-desktop";
import { planOpenUrl } from "./plan";

// [T-257 v4] 外链开系统浏览器 —— 照 local/reveal 范式:sidecar(Next server,与用户同机)直接跑
// 平台 open 命令。**为什么不走 client 端 Tauri openUrl**:本架构下 webview 加载的是 http://localhost
// 的 sidecar,client 端 `__TAURI_INTERNALS__` 不可靠(T-241/252/257 三次踩空),而 reveal 证明
// 「client fetch → sidecar open」是这个架构已验证的桌面集成正解。
//
// 安全:
//   - 只允许 http/https(new URL 校验 protocol)—— 防 `open` 被喂 file://、自定义 scheme 而启动
//     本地 app / 打开本地文件;
//   - execFile(非 shell)+ 数组参数 —— 无 shell 注入面;
//   - **不鉴权**:开一个公开 URL 无敏感面,且激活页(未激活/未登录态)也必须能点「联系授权方」。
export const dynamic = "force-dynamic";

const execFileAsync = promisify(execFile);

export async function POST(req: Request): Promise<Response> {
  // web 部署:不在服务端替用户开浏览器 → 让 client 退回原生 target=_blank。
  if (!isDesktopRuntime(process.env)) {
    return NextResponse.json({ ok: false, desktop: false });
  }

  let body: { url?: unknown };
  try {
    body = (await req.json()) as { url?: unknown };
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const plan = planOpenUrl(body.url, process.platform);
  if (!plan.ok) {
    return NextResponse.json({ error: plan.error }, { status: plan.status });
  }
  try {
    // [T-372 W5] windowsHide:win32 计划是 `cmd /c start`(console 程序),不抑制会闪黑窗。
    await execFileAsync(plan.cmd, plan.args, { windowsHide: true });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[local/open-url] failed:", err);
    return NextResponse.json({ error: "open failed" }, { status: 500 });
  }
}
