import { NextResponse } from "next/server";

import { getWebSessionRuntime } from "@/server/persistence-client";
import { readSessionCookie } from "../v1/auth/_session";
import { resolveRequestContext } from "@/lib/request-context.server";

// [T-217a] Web Session Vault 管理入口(SPEC §2.1)—— 同 /api/knowledge/* 逃生口:登录态保管库
// 无 DB 层(sidecar 浏览器 + `.auth/web/` 文件系统,per-machine 全局),不走 dispatch 契约
// transport,由本专用 route 直调 webSessionRuntime。action 分派四个操作:
//   · list   —— 列已保存站点会话(域名 + 上次登录时间);
//   · login  —— 有头弹独立 Chromium 让用户**自己**登录某 URL 的域名(阻塞至登录成功/超时);
//   · status —— headless 被动探针查某域名是否已登录 / 过期(不弹窗);
//   · remove —— 删除某域名的持久 profile(登出 + 删本地登录态)。
//
// 铁律/隐私:登录全程由用户在弹出的浏览器里自己完成,系统不碰凭据;cookie/session 只落本机
// `.auth/web/`(已在 .gitignore),绝不外传。鉴权同 /api/knowledge/distill(session cookie →
// RequestContext,单机免登录直通)——虽是 per-machine 全局能力,仍要求已鉴权会话才准操作。

export const dynamic = "force-dynamic";

interface WebSessionBody {
  action?: "list" | "login" | "status" | "remove";
  url?: string;
  domain?: string;
}

export async function POST(req: Request): Promise<Response> {
  let body: WebSessionBody;
  try {
    body = (await req.json()) as WebSessionBody;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const rawToken = readSessionCookie(req);
  try {
    await resolveRequestContext(rawToken);
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const runtime = await getWebSessionRuntime();
  try {
    switch (body.action) {
      case "list": {
        const sessions = await runtime.listSessions();
        return NextResponse.json({ sessions });
      }
      case "login": {
        const url = typeof body.url === "string" ? body.url.trim() : "";
        if (!url) {
          return NextResponse.json(
            { error: "url 不能为空:请给一个要登录的网站链接" },
            { status: 400 },
          );
        }
        // 有头登录阻塞(用户在弹窗里自己登;默认最长 300s)。非法 URL → webDomainFromUrl 抛 → 400。
        const result = await runtime.loginSession(url);
        return NextResponse.json(result);
      }
      case "status": {
        const domain = typeof body.domain === "string" ? body.domain.trim() : "";
        if (!domain) {
          return NextResponse.json(
            { error: "domain 不能为空" },
            { status: 400 },
          );
        }
        const result = await runtime.sessionStatus(domain);
        return NextResponse.json(result);
      }
      case "remove": {
        const domain = typeof body.domain === "string" ? body.domain.trim() : "";
        if (!domain) {
          return NextResponse.json(
            { error: "domain 不能为空" },
            { status: 400 },
          );
        }
        const result = await runtime.removeSession(domain);
        return NextResponse.json(result);
      }
      default:
        return NextResponse.json(
          { error: "unknown action(需 list/login/status/remove)" },
          { status: 400 },
        );
    }
  } catch (err) {
    // 非法 URL(webDomainFromUrl 抛)→ 400 诚实;其余 → 500。
    const msg = err instanceof Error ? err.message : String(err);
    const isBadUrl = /无法从链接解析域名|只支持 http/.test(msg);
    console.error("[api/web-session] failed:", err);
    return NextResponse.json({ error: msg }, { status: isBadUrl ? 400 : 500 });
  }
}
