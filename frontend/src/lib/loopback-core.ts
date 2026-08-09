// [T-372 L2 / T-415 P0-B] Loopback + handshake 判定的**纯逻辑核**(无 `server-only`、无 NextResponse 依赖)。
//
// 为什么单独成核:同一套判定被两处消费,runtime 不同——
//   · route handler(`loopback-guard.server.ts` 再包一层 `server-only` + `loopbackForbidden`);
//   · 全局代理 `proxy.ts`(Next 16 的 proxy = 原 middleware,Node runtime)。
// 两处必须**同一份判定**,否则会像 T-413 复测里发现的那样出现「per-route 覆盖漂移」。故提纯到此,勿复制。
//
// 装机版拓扑(见 src-tauri/src/lib.rs):Tauri WebView 从 `http://127.0.0.1:<port>/` 加载页面,
//   前端 fetch 全走**相对路径** = 同源请求,Host 与 Origin 皆为 `127.0.0.1:<port>`(port 动态分配)。

// 集合用无括号形式(`::1` 而非 `[::1]`)——hostnameOf 统一剥方括号后再查表。`localhost` 兼容 dev 与 vitest。
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);

// 从「授权串」(Host 头 `host:port` 或 Origin `scheme://host:port`)解析出纯 hostname(小写)。
// 无 scheme 时补 `http://` 让 URL 解析器统一剥端口;**Node 的 URL.hostname 对 IPv6 保留方括号**
//   (`new URL("http://[::1]:5000").hostname === "[::1]"`,实测),故此处显式剥 `[...]` 归一成 `::1`。
//   解析失败 → null(视为不可信)。
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

  // Origin:存在则必须 loopback(`Origin: null` 等 opaque 源解析为 "null",不在白名单 → 拒);缺省放行
  //   —— 浏览器**无法**在跨源 POST 上省略 Origin,故「无 Origin」可靠代表「非跨站浏览器请求」。
  const origin = req.headers.get("origin");
  if (origin) {
    const oHost = hostnameOf(origin);
    if (!oHost || !LOOPBACK_HOSTS.has(oHost)) return false;
  }
  return true;
}

/** [T-372 L2] 握手 token 请求头名(Rust sync_mirror_to_sidecar / 前端 handshake-client / proxy 共用)。 */
export const HANDSHAKE_HEADER = "x-creatoros-handshake";
export const HANDSHAKE_COOKIE = "creatoros_loopback_boot";

function cookieValue(req: Request, name: string): string | null {
  const raw = req.headers.get("cookie");
  if (!raw) return null;
  for (const part of raw.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

/**
 * [T-372 L2 / T-415 P0-B] 启动级 nonce 握手校验:桌面态(env 有 token)要求请求头逐字节一致。
 *
 * 缺 token 的处置(fail-closed 命门):
 *   · 桌面**打包产物**:next.config 对 isDesktopBuild 把 `process.env.CREATOROS_HANDSHAKE_REQUIRED`
 *     烘焙成字面量 "1"(裸 node 省不掉)→ **fail-CLOSED**。真机永远有 Rust 注入的 token,走不到这里;
 *     只有「解压 sidecar + 裸 node server.js」白嫖才缺 token → 403(堵 T-413 复测证实的白嫖门)。
 *   · web/dev/单测:未烘焙 → undefined → **fail-open**(P5 行为不变,pnpm dev 无 Rust token 仍跑)。
 *   env 参数分支供单测注入;`process.env.CREATOROS_HANDSHAKE_REQUIRED` 字面量是打包烘焙的真门(勿改成变量,否则不被 Next 内联)。
 */
export function hasValidHandshake(
  req: Request,
  env: Record<string, string | undefined> = process.env,
): boolean {
  const token = env.CREATOROS_SIDECAR_HANDSHAKE_TOKEN?.trim();
  if (token) {
    return (
      req.headers.get(HANDSHAKE_HEADER) === token ||
      cookieValue(req, HANDSHAKE_COOKIE) === token
    );
  }
  const required =
    (env.CREATOROS_HANDSHAKE_REQUIRED ??
      process.env.CREATOROS_HANDSHAKE_REQUIRED) === "1";
  return !required;
}

/**
 * [T-372 L2] 有副作用调用面的统一判据 = loopback(Host/Origin)+ 握手 token。
 * route handler 与全局 proxy 共用。
 */
export function isTrustedLocalRequest(
  req: Request,
  env: Record<string, string | undefined> = process.env,
): boolean {
  return isLoopbackRequest(req) && hasValidHandshake(req, env);
}
