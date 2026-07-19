import { NextResponse, type NextRequest } from "next/server";
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
//   · /api/v1/blob —— <img>/<video> 子资源走浏览器原生请求,**无法附自定义头**,不放行会裂图/裂视频。
//   · /api/v1/activate、/api/v1/auth —— 授权/登录入口各有服务端校验(Ed25519 license / 凭据);放行以防
//     bootstrap 期(token 全局尚未注入)激活页/登录页白屏(BACKLOG 明确「防又一个 /activate 白屏」)。
const PUBLIC_API_PREFIXES = ["/api/v1/blob/", "/api/v1/activate", "/api/v1/auth/"];

function forbidden(): NextResponse {
  return NextResponse.json(
    { error: "forbidden: request must originate from the local application" },
    { status: 403 },
  );
}

export function proxy(req: NextRequest): NextResponse {
  const { pathname } = req.nextUrl;
  const isApi = pathname.startsWith("/api/");
  // server action:JS 态(桌面 webview 恒 JS)经 fetch 带 `Next-Action` 头 POST 到页面路由 ——
  //   与 /api 并列的另一条 prompt 调用面 + 白嫖面,必须一并强制。
  const isServerAction = req.method === "POST" && req.headers.has("next-action");

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
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  // 扩到含 /api(原先排除 api)——default-deny 需要看到 /api 请求;仍跳过静态资源与 Next 内部。
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
