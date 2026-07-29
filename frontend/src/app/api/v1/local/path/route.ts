import { NextResponse } from "next/server";

import {
  getLocalFileRuntime,
  getStorageRootForRequest,
} from "@/server/persistence-client";
import { readSessionCookie } from "../../auth/_session";
import {
  readRequestAccountId,
  resolveRequestContext,
} from "@/lib/request-context.server";
import {
  LocalPathViolation,
  realpathInsideRoot,
  resolveInsideRoot,
} from "../local-reveal-security";

// [T-381] 「复制地址」route —— 返回某 asset 原始文件的**文件系统绝对路径**(media-root +
// storageKey 安全解析,与 ../reveal 同一套 gate-F1 三重防护/归属门),供前端写剪贴板。
// 单机桌面产品语义:Next server 与用户同机,路径只在本机有意义(用户把它喂给外部 AI 工具)。
//   - 归属:assetId 经用户 scoped 服务解析(越权 → 404,不泄露存在性);
//   - 路径:resolveInsideRoot 纯函数 + realpath 复检(symlink 穿越防护),文件不在盘上 → 404;
//   - 只读:不执行任何命令(与 reveal 的 `open -R` 不同,这里只回路径字符串)。

export const dynamic = "force-dynamic";

interface PathBody {
  assetId?: string;
}

export async function POST(req: Request): Promise<Response> {
  let body: PathBody;
  try {
    body = (await req.json()) as PathBody;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  if (!body.assetId) {
    return NextResponse.json({ error: "assetId required" }, { status: 400 });
  }
  const rawToken = readSessionCookie(req);
  const accountId = readRequestAccountId(req);
  let ctx;
  try {
    ctx = await resolveRequestContext(rawToken, accountId);
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const runtime = await getLocalFileRuntime();
    const root = await getStorageRootForRequest(ctx);
    const key = await runtime.assetStorageKey(ctx, body.assetId);
    if (!key) {
      return NextResponse.json({ error: "file not found" }, { status: 404 });
    }
    const abs = resolveInsideRoot(root, key);
    const real = await realpathInsideRoot(root, abs);
    if (!real) {
      return NextResponse.json(
        { error: "file missing on disk" },
        { status: 404 },
      );
    }
    return NextResponse.json({ ok: true, path: real });
  } catch (err) {
    if (err instanceof LocalPathViolation) {
      return NextResponse.json({ error: "path rejected" }, { status: 403 });
    }
    // OwnershipError 等 → 404(不泄露存在性);其余 → 500 诚实报错。
    const name = (err as { name?: string }).name;
    if (name === "OwnershipError") {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    console.error("[local/path] failed:", err);
    return NextResponse.json({ error: "path lookup failed" }, { status: 500 });
  }
}
