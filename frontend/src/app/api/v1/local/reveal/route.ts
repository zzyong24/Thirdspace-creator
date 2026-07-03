import { NextResponse } from "next/server";
import * as fs from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import {
  getLocalFileRuntime,
  getStorageRootForRequest,
} from "@/server/persistence-client";
import { readSessionCookie } from "../../auth/_session";
import { resolveRequestContext } from "@/lib/request-context.server";
import {
  LocalPathViolation,
  realpathInsideRoot,
  resolveInsideRoot,
} from "../local-reveal-security";

// [T-055d SPEC §7.2] 「在 Finder 打开/显示」route。单机产品:Next server 与用户同机,
// 这里对解析出的安全路径执行 macOS `open`(素材 → `open -R` 定位文件;项目 → `open` 目录)。
//   - 归属:assetId/projectId 都经用户 scoped 服务解析(越权 → 404,不泄露存在性);
//   - 路径:gate-F1 三重防护(resolveInsideRoot 纯函数 + realpath 复检),见
//     ../local-reveal-security.ts 与其 payload 测试;
//   - 项目目录可能还没建(没倒过素材)→ mkdir -p 后再开(用户预期:总能打开)。

export const dynamic = "force-dynamic";

const execFileAsync = promisify(execFile);

interface RevealBody {
  assetId?: string;
  projectId?: string;
}

export async function POST(req: Request): Promise<Response> {
  let body: RevealBody;
  try {
    body = (await req.json()) as RevealBody;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const rawToken = readSessionCookie(req);
  let ctx;
  try {
    ctx = await resolveRequestContext(rawToken);
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const runtime = await getLocalFileRuntime();
    const root = await getStorageRootForRequest(ctx);

    if (body.assetId) {
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
      await execFileAsync("open", ["-R", real]);
      return NextResponse.json({ ok: true, revealed: "asset" });
    }

    if (body.projectId) {
      const folder = await runtime.projectFolder(ctx, body.projectId);
      if (!folder) {
        return NextResponse.json({ error: "project not found" }, { status: 404 });
      }
      const abs = resolveInsideRoot(root, folder);
      // 目录还没建(项目没倒过素材)→ 建出标准结构再开,用户预期「总能打开」。
      await fs.mkdir(abs, { recursive: true });
      const real = await realpathInsideRoot(root, abs);
      if (!real) {
        return NextResponse.json({ error: "directory unavailable" }, { status: 404 });
      }
      await execFileAsync("open", [real]);
      return NextResponse.json({ ok: true, revealed: "project" });
    }

    return NextResponse.json(
      { error: "assetId or projectId required" },
      { status: 400 },
    );
  } catch (err) {
    if (err instanceof LocalPathViolation) {
      return NextResponse.json({ error: "path rejected" }, { status: 403 });
    }
    // OwnershipError 等 → 404(不泄露存在性);其余 → 500 诚实报错。
    const name = (err as { name?: string }).name;
    if (name === "OwnershipError") {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    console.error("[local/reveal] failed:", err);
    return NextResponse.json({ error: "reveal failed" }, { status: 500 });
  }
}
