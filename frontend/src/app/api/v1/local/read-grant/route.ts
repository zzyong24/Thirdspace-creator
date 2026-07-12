import { NextResponse } from "next/server";
import * as fs from "node:fs/promises";
import * as nodePath from "node:path";
import { homedir } from "node:os";

import {
  normalizeLocalPath,
  sensitivePathReason,
} from "@creatoros/backend/modules/ai-runtime";
import {
  grantOnce,
  grantAlwaysDir,
} from "@/server/local-read-grants";
import { readSessionCookie } from "../../auth/_session";
import { resolveRequestContext } from "@/lib/request-context.server";

// [T-253] local.read 授权 route —— 对话确认卡的「允许一次 / 总是允许该目录」落点(与
// /api/v1/local/reveal 同款 endpoint-less escape hatch:单机产品,Next server 与用户同机)。
//   - 授权对象是 **realpath**(与读取端口同一形态,symlink 不会造成「授权 A 读到 B」);
//   - 敏感 denylist 在授权之前复检:哪怕用户被诱导点了允许,敏感路径也不进授权表(403 明说);
//   - mode='once' → 一次授权(内存,读一次即耗);mode='dir' → 该文件所在目录(目录路径则自身)
//     持久化「总是允许」。拒绝不需要 server 状态 —— 前端本地渲「已拒绝」并告知编导即可。

export const dynamic = "force-dynamic";

interface GrantBody {
  path?: string;
  mode?: "once" | "dir";
}

export async function POST(req: Request): Promise<Response> {
  let body: GrantBody;
  try {
    body = (await req.json()) as GrantBody;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const rawPath = typeof body.path === "string" ? body.path : "";
  const mode = body.mode === "dir" ? "dir" : body.mode === "once" ? "once" : null;
  if (!rawPath || !mode) {
    return NextResponse.json(
      { error: "path 与 mode('once'|'dir') 必填" },
      { status: 400 },
    );
  }

  const rawToken = readSessionCookie(req);
  let ctx;
  try {
    ctx = await resolveRequestContext(rawToken);
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const normalized = normalizeLocalPath(rawPath, homedir());
  if (!normalized) {
    return NextResponse.json({ error: "路径必须是绝对路径" }, { status: 400 });
  }
  let real: string;
  try {
    real = await fs.realpath(normalized);
  } catch {
    return NextResponse.json({ error: "路径不存在" }, { status: 404 });
  }
  // 敏感硬门:授权之前复检(归一形态 + realpath 形态都过)—— 敏感路径不进授权表。
  const reason = sensitivePathReason(normalized) ?? sensitivePathReason(real);
  if (reason) {
    return NextResponse.json({ error: reason }, { status: 403 });
  }

  if (mode === "once") {
    grantOnce(ctx.userId, real);
    return NextResponse.json({ ok: true, granted: "once", path: real });
  }
  // mode === 'dir':文件 → 授它所在目录;目录 → 授自身。
  const st = await fs.stat(real);
  const dir = st.isDirectory() ? real : nodePath.dirname(real);
  grantAlwaysDir(ctx.userId, dir);
  return NextResponse.json({ ok: true, granted: "dir", dir });
}
