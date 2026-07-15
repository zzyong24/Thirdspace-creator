import { NextResponse } from "next/server";

import { getWebSessionRuntime } from "@/server/persistence-client";
import { readSessionCookie } from "../v1/auth/_session";
import { resolveRequestContext } from "@/lib/request-context.server";
import {
  isLoopbackRequest,
  loopbackForbidden,
} from "@/lib/loopback-guard.server";
import { isSafeWebDomain } from "@/lib/web-domain";

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
  action?: "list" | "login" | "loginConfirm" | "loginCancel" | "status" | "remove";
  url?: string;
  domain?: string;
}

// [B-01] domain 入口校验(纵深防御第①层):空 → 400「不能为空」;非空但非法(路径穿越字符
//   `../`、`..\\`、`/`、绝对路径、`%2e%2e%2f` 编码分隔符等)→ 400「非法域名」,绝不下传到
//   persistence-client 的文件系统操作(remove/status)。合法 hostname → 放行(返回 null)。
//   persistence-client 侧还有 containment + realpath 两层兜底(见 webAuthDirFor / removeSession)。
function rejectBadDomain(domain: string): NextResponse | null {
  if (!domain) {
    return NextResponse.json({ error: "domain 不能为空" }, { status: 400 });
  }
  if (!isSafeWebDomain(domain)) {
    return NextResponse.json(
      { error: "非法域名(疑似路径穿越,已拒绝)" },
      { status: 400 },
    );
  }
  return null;
}

export async function POST(req: Request): Promise<Response> {
  // [RT-H01] 登录态保管库入口(有头开窗 / 删本地登录态,per-machine 敏感):先挡非本机/跨站请求。
  if (!isLoopbackRequest(req)) return loopbackForbidden();

  let body: WebSessionBody;
  try {
    body = (await req.json()) as WebSessionBody;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const rawToken = readSessionCookie(req);
  try {
    // 状态变更类(login/remove)→ present-but-invalid cookie 明确拒;缺失 cookie 仍单机直通(不锁死 app)。
    await resolveRequestContext(rawToken, null, { rejectInvalidToken: true });
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
        // [T-221] 开窗即返(不阻塞、不赌 cookie 自动关):弹独立 Chromium 让用户自己登,返回
        //   { domain, pending:true }。登好由前端触发 loginConfirm 才关窗持久化。非法 URL → 抛 → 400。
        const result = await runtime.loginSession(url);
        return NextResponse.json(result);
      }
      case "loginConfirm": {
        // [T-221] 用户显式「我登好了」→ 关登录窗 + 持久化 profile,认可成功。
        const domain = typeof body.domain === "string" ? body.domain.trim() : "";
        const bad = rejectBadDomain(domain);
        if (bad) return bad;
        const result = await runtime.confirmSession(domain);
        return NextResponse.json(result);
      }
      case "loginCancel": {
        // [T-221] 用户「取消」→ 关登录窗,不留登录承诺。
        const domain = typeof body.domain === "string" ? body.domain.trim() : "";
        const bad = rejectBadDomain(domain);
        if (bad) return bad;
        const result = await runtime.cancelSession(domain);
        return NextResponse.json(result);
      }
      case "status": {
        const domain = typeof body.domain === "string" ? body.domain.trim() : "";
        const bad = rejectBadDomain(domain);
        if (bad) return bad;
        const result = await runtime.sessionStatus(domain);
        return NextResponse.json(result);
      }
      case "remove": {
        const domain = typeof body.domain === "string" ? body.domain.trim() : "";
        const bad = rejectBadDomain(domain);
        if (bad) return bad;
        const result = await runtime.removeSession(domain);
        return NextResponse.json(result);
      }
      default:
        return NextResponse.json(
          {
            error:
              "unknown action(需 list/login/loginConfirm/loginCancel/status/remove)",
          },
          { status: 400 },
        );
    }
  } catch (err) {
    // 非法 URL(webDomainFromUrl 抛)/ 非法域名(login 分支域名由 URL 派生、绕过入口校验,
    //   webAuthDirFor 白名单硬拒抛 WebDomainError,结构化 code 识别跨 bundle 稳定)→ 400 诚实;其余 → 500。
    const msg = err instanceof Error ? err.message : String(err);
    const isBadUrl = /无法从链接解析域名|只支持 http/.test(msg);
    const isBadDomain =
      (err as { code?: unknown })?.code === "WebDomainError" ||
      (err as { name?: unknown })?.name === "WebDomainError";
    console.error("[api/web-session] failed:", err);
    return NextResponse.json(
      { error: msg },
      { status: isBadUrl || isBadDomain ? 400 : 500 },
    );
  }
}
