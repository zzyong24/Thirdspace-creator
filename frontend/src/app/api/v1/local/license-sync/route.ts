import { NextResponse } from "next/server";

import { isDesktopRuntime } from "@/server/activation/is-desktop";
import { getActivationService } from "@/server/persistence-client";
import {
  HANDSHAKE_HEADER,
  isLoopbackRequest,
} from "@/lib/loopback-guard.server";
import type { ActivationSecurityMirror } from "@/server/activation/activation-service";

// [T-372 L2] Rust 壳 → sidecar 的**窄同步入口**(BR-01 领域记录同步,SPEC §9/§13)。
//
// 语义:Rust 校验决策链(license.rs)放行判定后,把安全态展示副本(machineId/code/…/
// last_seen_at/grace_seconds/revoked)POST 到这里;route 调 activation service 的
// syncFromShell → repo.writeMirror 落 activation_state。表的写者仍是 sidecar backend
// (本 route 进程内),Rust 绝不跨模块直改表;放行判定读 Rust 侧 `.license`,不读本表
// (本表纯展示,设置页「激活状态」面板用)。
//
// 防护(仅接受本机 Rust 壳调用,三重):
//   ① isDesktopRuntime —— web/dev 无 Rust 壳,此入口无意义 → 403;
//   ② loopback Host/Origin 校验(同 dispatch);
//   ③ **握手 token 硬性要求**:env 无 token(非壳启动)或头不匹配 → 403。与 dispatch 等
//     「无 token 则跳过」不同,本入口只该被持有 token 的 Rust 壳调用,fail closed。
export const dynamic = "force-dynamic";

function parseMirror(raw: unknown): ActivationSecurityMirror | null {
  if (typeof raw !== "object" || raw === null) return null;
  const o = raw as Record<string, unknown>;
  const str = (k: string): string | null =>
    typeof o[k] === "string" && (o[k] as string).length > 0
      ? (o[k] as string)
      : null;
  const machineId = str("machineId");
  const code = str("code");
  const licenseMode = str("licenseMode");
  const projectKey = str("projectKey");
  const activatedAt = str("activatedAt");
  const lastOnlineCheckAt = str("lastOnlineCheckAt");
  if (
    !machineId ||
    !code ||
    !licenseMode ||
    !projectKey ||
    !activatedAt ||
    !lastOnlineCheckAt
  ) {
    return null;
  }
  return {
    machineId,
    code,
    licenseMode,
    projectKey,
    expiresAt: typeof o.expiresAt === "string" ? o.expiresAt : null,
    activatedAt,
    lastOnlineCheckAt,
    lastSeenAt: typeof o.lastSeenAt === "string" ? o.lastSeenAt : null,
    graceSeconds:
      typeof o.graceSeconds === "number" && Number.isFinite(o.graceSeconds)
        ? o.graceSeconds
        : null,
    revoked: o.revoked === true,
  };
}

export async function POST(req: Request): Promise<Response> {
  if (!isDesktopRuntime(process.env)) {
    return NextResponse.json({ error: "desktop only" }, { status: 403 });
  }
  if (!isLoopbackRequest(req)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  // 握手 token 硬性要求(fail closed;区别于 dispatch 的「无 token 跳过」语义)。
  const token = process.env.CREATOROS_SIDECAR_HANDSHAKE_TOKEN?.trim();
  if (!token || req.headers.get(HANDSHAKE_HEADER) !== token) {
    return NextResponse.json({ error: "handshake required" }, { status: 403 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const mirror = parseMirror(raw);
  if (!mirror) {
    return NextResponse.json({ error: "invalid mirror shape" }, { status: 400 });
  }

  const service = await getActivationService();
  await service.syncFromShell(mirror);
  // 不回显 code(敏感凭证不出现在响应/日志)。
  return NextResponse.json({ ok: true });
}
