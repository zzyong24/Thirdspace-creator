import "server-only";
import { NextResponse } from "next/server";

// [RT-H01·部分] Loopback API 防护:有副作用的路由只接受来自本机应用自身的请求(Host + Origin 双校验)。
//
// 装机版拓扑(见 src-tauri/src/lib.rs):Tauri WebView 从 `http://127.0.0.1:<port>/` 加载页面,
//   前端 fetch 全走**相对路径**(`/api/v1/dispatch`、`/api/chat`、`/api/web-session`)= 同源请求,
//   Host 与 Origin 皆为 `127.0.0.1:<port>`(port 每次启动动态分配,不可硬编码)。据此:
//
//   · Host 白名单(必须 loopback)—— 挡 **DNS rebinding**:攻击页把自己域名重绑到 127.0.0.1 时,
//     浏览器仍按原域名发 `Host: evil.com`,不在白名单 → 拒。
//   · Origin 存在时必须 loopback —— 挡**跨站 CSRF**:浏览器对跨源 POST 强制附真实 Origin
//     (`https://evil.com`),攻击者伪造不了 → 拒。
//   · Origin 缺失 → 放行:同源 webview 的部分请求、curl/脚本、非浏览器调用不带 Origin;而浏览器
//     **无法**在跨源 POST 上省略 Origin,故「无 Origin」可靠地代表「非跨站浏览器请求」。
//
// 只挂在**有副作用**的路由(dispatch/chat/web-session);纯读路由不强制(避免误伤 & 保持宽松)。
// 完整的启动级 nonce 令牌(WebView 与 sidecar 握手,彻底身份绑定)需 Tauri 侧协作,列为 follow-up。

// 集合用无括号形式(`::1` 而非 `[::1]`)——hostnameOf 统一剥方括号后再查表。`localhost` 兼容 dev 与
//   vitest(`new Request("http://localhost/...")`)。
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);

// 从「授权串」(Host 头 `host:port` 或 Origin `scheme://host:port`)解析出纯 hostname(小写)。
// 无 scheme 时补 `http://` 让 URL 解析器统一剥端口;**Node 的 URL.hostname 对 IPv6 保留方括号**
//   (`new URL("http://[::1]:5000").hostname === "[::1]"`,实测),故此处显式剥 `[...]` 归一成
//   `::1` 再交白名单查表。解析失败 → null(视为不可信)。
function hostnameOf(value: string | null): string | null {
  if (!value) return null;
  try {
    const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(value);
    const u = new URL(hasScheme ? value : `http://${value}`);
    const h = u.hostname.toLowerCase();
    return h.startsWith("[") && h.endsWith("]") ? h.slice(1, -1) : h;
  } catch {
    return null;
  }
}

function urlHost(url: string): string | null {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

/** 请求是否来自本机应用自身(loopback Host + 非跨站 Origin)。true=放行,false=拒。 */
export function isLoopbackRequest(req: Request): boolean {
  // Host:优先请求头(Next 由 Host 头构造请求),缺省回退 URL host(vitest 用 new Request(url) 无 Host 头)。
  const host = hostnameOf(req.headers.get("host") ?? urlHost(req.url));
  if (!host || !LOOPBACK_HOSTS.has(host)) return false;

  // Origin:存在则必须 loopback(`Origin: null` 等 opaque 源 hostname 解析为 "null",不在白名单 → 拒);
  //   缺省放行(见上方说明)。
  const origin = req.headers.get("origin");
  if (origin) {
    const oHost = hostnameOf(origin);
    if (!oHost || !LOOPBACK_HOSTS.has(oHost)) return false;
  }
  return true;
}

/** 统一的 403 拒答(跨站/异常 Origin/非 loopback Host)。 */
export function loopbackForbidden(): NextResponse {
  return NextResponse.json(
    { error: "forbidden: request must originate from the local application" },
    { status: 403 },
  );
}
