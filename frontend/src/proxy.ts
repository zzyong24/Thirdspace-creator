import { NextResponse, type NextRequest } from "next/server";
import { randomBytes } from "node:crypto";
import { isTrustedLocalRequest } from "@/lib/loopback-core";

// Proxy / request middleware (Next 16 renamed the `middleware` file convention to
// `proxy`; it runs in the **Node.js runtime**, so it can read Rust-injected runtime
// env like `CREATOROS_SIDECAR_HANDSHAKE_TOKEN` — Edge middleware cannot).
//
// Two concerns live here:
//
//  1. [Module 00, Task 11] x-pathname 注解:Next server components(the (creator)
//     layout session guard)拿不到当前 pathname,故转发成 `x-pathname` 请求头,guard 据此构造
//     `redirect("/login?from=<pathname>")`。仅页面路由需要。
//
//  2. [T-415 P0-B] 全局 default-deny —— 堵「解压 sidecar + 裸 node server.js」白嫖门。
//     背景(T-413 复测实测):此前 handshake 逐路由手贴 `isTrustedLocalRequest`,只覆盖 5 处;
//     knowledge/* 等 18 条路由裸奔——裸 node 打 `/api/knowledge/distill` 直接进业务、运行时解密
//     prompt、白嫖功能。此处把强制点从「散落在部分 route」升级为「全局默认拒 + allowlist」,一处收口,
//     新增路由天然被守。判定逻辑与 route handler 共用 `loopback-core`(同一份,防覆盖漂移)。

// allowlist:缺 handshake 也放行的 /api 前缀。刻意最小化——只放「自带服务端校验」或「浏览器无法附头」的面:
//   · /api/v1/local/execution-preview —— <img>/<video> 子资源走浏览器原生请求,
//     **无法附自定义头**,不放行会裂图/裂视频。execution-preview 仍由 route + execution service
//     双重校验当前用户、待确认状态和 manifest 精确路径，不是任意文件读取口。
//   · blob 因大文件 body 不能经过 proxy clone，继续由 matcher 排除；但 route 自身执行同一
//     isTrustedLocalRequest 校验，因此不属于公开 allowlist。
//   · /api/v1/activate、/api/v1/auth —— 授权/登录入口各有服务端校验(Ed25519 license / 凭据);放行以防
//     bootstrap 期(token 全局尚未注入)激活页/登录页白屏(BACKLOG 明确「防又一个 /activate 白屏」)。
const PUBLIC_API_PREFIXES = [
  "/api/v1/local/execution-preview/",
  "/api/v1/activate",
  "/api/v1/auth/",
];

// [T-451 gate-F1] activation-only 模式下的**页面路径**允许 GET 访问的 allowlist。
//   sidecar 起来但 verdict-token 是 activation-only(licensed=false)时,只放行:
//     · /activate/*      —— 激活页本体
//     · /_next/static/*  —— 已由 config.matcher 排除,但显式再列一条防漂移
//     · /favicon.ico     —— 浏览器默认请求
//     · /robots.txt      —— 无害
//   其他页面路由一律 302 到 /activate,前端就是回不到主应用直到激活成功。/api 面照 T-415
//   loopback-core 判定(激活流本身的 IPC 是走 Tauri command 而非 /api,不受此影响)。
const ACTIVATION_ONLY_PAGE_ALLOWLIST = ["/activate", "/favicon.ico", "/robots.txt"];

function forbidden(): NextResponse {
  return NextResponse.json(
    { error: "forbidden: request must originate from the local application" },
    { status: 403 },
  );
}

function isActivationOnlyMode(): boolean {
  // instrumentation.ts verify verdict-token 通过后写 CREATOROS_VERDICT_MODE:
  //   · "licensed" → 完整放行
  //   · "activation-only" → 只放激活页
  //   · undefined → 该 sidecar 走 dev 分支(NODE_ENV≠production + CREATOROS_DEV_MODE=1),此处
  //     不启用 activation-only 收紧(等价于 licensed;dev 本就没 verdict-token)。
  return process.env.CREATOROS_VERDICT_MODE === "activation-only";
}

export function proxy(req: NextRequest): NextResponse {
  const { pathname } = req.nextUrl;
  const isApi = pathname.startsWith("/api/");
  // server action:JS 态(桌面 webview 恒 JS)经 fetch 带 `Next-Action` 头 POST 到页面路由 ——
  //   与 /api 并列的另一条 prompt 调用面 + 白嫖面,必须一并强制。
  const isServerAction = req.method === "POST" && req.headers.has("next-action");

  // [T-451] activation-only 模式:页面路由只放激活页 + 静态无害路径,其余强 302 到 /activate。
  //   放在 T-415 判定**之前**(先判 mode,再判 handshake)—— 未激活时用户根本进不了主应用,
  //   连尝试白嫖 handshake 都无路径可走。/api 面仍走下面的 T-415 default-deny(licensed 路径与
  //   本判定正交:handshake 头有就放,没就 403;不叠加"未激活也放行 /api")。
  //
  //   本判定只覆盖**页面 GET**(server-side render + 客户端 hydration 都从这里进),不动 /api/
  //   —— /api 已由 loopback-core 严守,attacker 拿不到 handshake token 就 403,不需要这层。
  if (isActivationOnlyMode() && !isApi && !isServerAction) {
    const allowed = ACTIVATION_ONLY_PAGE_ALLOWLIST.some(
      (p) => pathname === p || pathname.startsWith(`${p}/`),
    );
    if (!allowed) {
      const redirect = new URL("/activate", req.url);
      return NextResponse.redirect(redirect, 302);
    }
  }

  // [T-415] 只有桌面打包态(烘焙 REQUIRED="1",裸 node 关不掉)或已注入 token 时才强制;
  //   dev/web(未烘焙、无 token)→ 强制整体不启用,行为与改动前完全一致。
  const enforce =
    process.env.CREATOROS_HANDSHAKE_REQUIRED === "1" ||
    !!process.env.CREATOROS_SIDECAR_HANDSHAKE_TOKEN?.trim();
  if (enforce && (isApi || isServerAction)) {
    const isPublic =
      isApi && PUBLIC_API_PREFIXES.some((p) => pathname.startsWith(p));
    if (!isPublic && !isTrustedLocalRequest(req)) return forbidden();
  }

  // /api 只需强制、不需 x-pathname(那是页面 session guard 的事),放行。
  if (isApi) return NextResponse.next();

  // [Module 00, Task 11] 页面路由:注解 x-pathname 供 session guard 构造 redirect。
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-pathname", pathname);
  // T-731：每个 HTML/RSC 响应独立 nonce。Next 从 request CSP 读取 nonce 并自动标到
  // framework scripts；response CSP 由浏览器执行。应用自身不再渲染内联脚本。
  const nonce = randomBytes(16).toString("base64");
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    "style-src 'self' 'unsafe-inline'",
    "connect-src 'self'",
    "img-src 'self' blob: data: asset:",
    "media-src 'self' blob: data: asset:",
    "font-src 'self' data:",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-src 'none'",
    "frame-ancestors 'none'",
  ].join("; ");
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("content-security-policy", csp);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  // 扩到含 /api(原先排除 api)——default-deny 需要看到 /api 请求;仍跳过静态资源与 Next 内部。
  // blob 自带 HMAC + path-traversal 硬门，且视频 PUT 必须绕开 Next proxy 的 request-body clone：
  // clone 默认只保留前 10MB，会把大视频静默截断成无法解析的残片。
  matcher: ["/((?!api/v1/blob|_next/static|_next/image|favicon.ico).*)"],
};
