import "server-only";

// [T-326·RT-H04] SSRF URL 守卫 —— web-reader / web-capture 共用的目标地址阻断层。
//
// 背景:两处原本「只查 http/https 就 page.goto」,恶意链接可让服务端无头浏览器去打
// 127.0.0.1 / 10.x / 169.254.169.254(云元数据)等内网地址,把内网/本机服务内容读回给模型或
// 截成图(SSRF)。本模块提供:
//   ① assertUrlAllowed —— 导航前置检查:协议白名单 http/https;hostname 是 IP 字面量
//      (含 IPv6、8 进制/16 进制/纯整数等绕过形式,WHATWG URL 解析会把这些归一化成标准
//      点分十进制,与 Node 连接器使用同一套解析语义)直接按解析结果判;是域名则先过黑名单
//      (localhost/.internal/.local/无点单标签/云元数据域名),再 DNS 解析全部地址逐个判。
//   ② fetchUrlSafely —— 禁用自动重定向；每一跳先完成全部 DNS 地址检查，再把连接固定到
//      已验证 IP，并核对 socket.remoteAddress。解析失败、空结果、混入保留地址、连接地址
//      不一致一律 fail closed，正文只在整条链通过后交给渲染/抽取层。
//   ③ collectRedirectChainUrls —— 仅为旧测试注入的浏览器导航兼容路径保留；生产路径不依赖
//      事后链审计，也不允许浏览器直接访问外部 URL。

import { isIP } from "node:net";
import * as http from "node:http";
import * as https from "node:https";

/** SSRF 阻断错误 —— message 已是人话(可直接进工具结果转述)。调用方(web-reader/web-capture)
 *  会把它转成各自的 WebCaptureError 以保持三墙错误分类;这里不 import 它们(避免循环依赖)。 */
export class UrlBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UrlBlockedError";
  }
}

/** DNS 解析端口(可注入,单测不打真 DNS)。返回该主机名解析出的全部地址。 */
export type LookupFn = (hostname: string) => Promise<{ address: string }[]>;

export interface UrlGuardOptions {
  lookup?: LookupFn;
}

export interface SafeHttpResponse {
  status: number;
  headers: Record<string, string | undefined>;
  body: Buffer;
  remoteAddress: string | undefined;
}

export type SafeHttpRequest = (
  url: URL,
  pinnedAddress: string,
  signal?: AbortSignal,
) => Promise<SafeHttpResponse>;

export interface SafeFetchResult {
  status: number;
  headers: Record<string, string | undefined>;
  body: Buffer;
  finalUrl: string;
}

const realLookup: LookupFn = async (hostname) => {
  const { lookup } = await import("node:dns/promises");
  // all:true 拿全部 A/AAAA(公网域名混挂内网 IP 也要看见);verbatim 保持系统返回顺序。
  return lookup(hostname, { all: true, verbatim: true });
};

// ── IPv4 判定 ────────────────────────────────────────────────────────────────

/** 标准点分十进制 → 4 字节;不是则 null。(8/16 进制、纯整数等形式在 new URL 阶段已被
 *  WHATWG 解析归一化成点分十进制,到这里只需处理标准形。) */
function parseDottedIpv4(s: string): number[] | null {
  const parts = s.split(".");
  if (parts.length !== 4) return null;
  const out: number[] = [];
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const v = Number(p);
    if (v > 255) return null;
    out.push(v);
  }
  return out;
}

/** RFC2544 基准测试保留段；无论 IP 字面量还是 DNS 结果都拒绝，代理 fake-ip 不构成公网证明。 */
export const FAKE_IP_BENCH_REASON = "198.18.0.0/15 基准测试保留地址";

/** IPv4 阻断段判定:命中返回原因(人话),否则 null。 */
function blockedIpv4Reason(bytes: number[]): string | null {
  const [a, b] = bytes;
  if (a === 0) return "0.0.0.0/8 保留地址";
  if (a === 10) return "10.0.0.0/8 私网地址";
  if (a === 100 && b >= 64 && b <= 127)
    return "100.64.0.0/10 运营商级 NAT/云内网地址"; // 含阿里云元数据 100.100.100.200
  if (a === 127) return "127.0.0.0/8 本机回环地址";
  if (a === 169 && b === 254) return "169.254.0.0/16 链路本地/云元数据地址"; // 含 169.254.169.254
  if (a === 172 && b >= 16 && b <= 31) return "172.16.0.0/12 私网地址";
  if (a === 192 && b === 168) return "192.168.0.0/16 私网地址";
  if (a === 198 && (b === 18 || b === 19)) return FAKE_IP_BENCH_REASON;
  if (a >= 224 && a <= 239) return "224.0.0.0/4 组播地址";
  if (a >= 240) return "240.0.0.0/4 保留/广播地址";
  return null;
}

// ── IPv6 判定 ────────────────────────────────────────────────────────────────

/** IPv6 文本(可含 zone index / 尾部内嵌 IPv4)→ 16 字节;解析不了返回 null。 */
function ipv6ToBytes(raw: string): number[] | null {
  let ip = raw;
  const pct = ip.indexOf("%"); // zone index(fe80::1%en0)不参与判定
  if (pct >= 0) ip = ip.slice(0, pct);
  // 尾部内嵌 IPv4(::ffff:127.0.0.1)→ 换算成两个 16 位组再走统一展开。
  const lastColon = ip.lastIndexOf(":");
  const tail = ip.slice(lastColon + 1);
  if (tail.includes(".")) {
    const v4 = parseDottedIpv4(tail);
    if (!v4) return null;
    const g1 = ((v4[0] << 8) | v4[1]).toString(16);
    const g2 = ((v4[2] << 8) | v4[3]).toString(16);
    ip = `${ip.slice(0, lastColon + 1)}${g1}:${g2}`;
  }
  const dc = ip.indexOf("::");
  let groups: string[];
  if (dc >= 0) {
    if (ip.indexOf("::", dc + 1) !== -1) return null; // 只允许一个 ::
    const left = ip.slice(0, dc).split(":").filter(Boolean);
    const right = ip.slice(dc + 2).split(":").filter(Boolean);
    const fill = 8 - left.length - right.length;
    if (fill < 0) return null;
    groups = [...left, ...Array<string>(fill).fill("0"), ...right];
  } else {
    groups = ip.split(":");
  }
  if (groups.length !== 8) return null;
  const bytes: number[] = [];
  for (const g of groups) {
    if (!/^[0-9a-fA-F]{1,4}$/.test(g)) return null;
    const v = parseInt(g, 16);
    bytes.push(v >> 8, v & 0xff);
  }
  return bytes;
}

/** IPv6 阻断段判定:命中返回原因(人话),否则 null。 */
function blockedIpv6Reason(bytes: number[]): string | null {
  if (bytes.every((x) => x === 0)) return ":: 未指定地址";
  if (bytes.slice(0, 15).every((x) => x === 0) && bytes[15] === 1)
    return "::1 本机回环地址";
  // IPv4-mapped(::ffff:a.b.c.d)/ IPv4-compatible(::a.b.c.d,已废弃)→ 按内嵌 IPv4 判。
  if (
    bytes.slice(0, 10).every((x) => x === 0) &&
    ((bytes[10] === 0xff && bytes[11] === 0xff) ||
      (bytes[10] === 0 && bytes[11] === 0))
  ) {
    const v4 = bytes.slice(12);
    const r = blockedIpv4Reason(v4);
    return r ? `IPv4 映射地址(${v4.join(".")}):${r}` : null;
  }
  // NAT64 前缀 64:ff9b::/96 → 按内嵌 IPv4 判(可把私网 v4 编进 v6)。
  if (
    bytes[0] === 0 &&
    bytes[1] === 0x64 &&
    bytes[2] === 0xff &&
    bytes[3] === 0x9b &&
    bytes.slice(4, 12).every((x) => x === 0)
  ) {
    const v4 = bytes.slice(12);
    const r = blockedIpv4Reason(v4);
    return r ? `NAT64 映射地址(${v4.join(".")}):${r}` : null;
  }
  if (bytes[0] === 0xfe && (bytes[1] & 0xc0) === 0x80)
    return "fe80::/10 链路本地地址";
  if ((bytes[0] & 0xfe) === 0xfc) return "fc00::/7 私有(ULA)地址";
  if (bytes[0] === 0xff) return "ff00::/8 组播地址";
  if (
    bytes[0] === 0x20 &&
    bytes[1] === 0x01 &&
    bytes[2] === 0x0d &&
    bytes[3] === 0xb8
  ) {
    return "2001:db8::/32 文档保留地址";
  }
  return null;
}

/** 任意 IP 文本的阻断判定:命中返回原因,放行/解析不了返回 null(解析不了交给上层语义)。 */
export function blockedIpReason(ip: string): string | null {
  // zone index(fe80::1%en0)剥掉再判:net.isIP 不认带 zone 的写法,但地址段语义不变。
  const bare = ip.includes("%") ? ip.slice(0, ip.indexOf("%")) : ip;
  const kind = isIP(bare);
  if (kind === 4) {
    const bytes = parseDottedIpv4(bare);
    return bytes ? blockedIpv4Reason(bytes) : null;
  }
  if (kind === 6) {
    const bytes = ipv6ToBytes(bare);
    return bytes ? blockedIpv6Reason(bytes) : null;
  }
  return null;
}

// ── 域名黑名单 ───────────────────────────────────────────────────────────────

/** 不查 DNS 就能判死的主机名:本机域名 / 内部专用后缀 / 云元数据域名 / 无点单标签
 *  (单标签走本地搜索域,不可能是公网站点)。命中返回原因,否则 null。 */
function blockedHostnameReason(hostname: string): string | null {
  const h = hostname.toLowerCase().replace(/\.$/, "");
  if (h === "localhost" || h.endsWith(".localhost")) return "localhost 本机域名";
  if (h === "metadata.google.internal" || h === "metadata.goog")
    return "云元数据服务域名";
  if (h.endsWith(".internal")) return "内部专用域名(.internal)";
  if (h.endsWith(".local")) return "局域网 mDNS 域名(.local)";
  if (!h.includes(".")) return "无点单标签主机名(非公网域名)";
  return null;
}

// ── 主入口 ──────────────────────────────────────────────────────────────────

/**
 * 判一个 URL 是否允许服务端浏览器访问;不允许则抛 UrlBlockedError(message 人话)。
 * 判定顺序:URL 合法性 → 协议白名单 → IP 字面量直接判 → 域名黑名单 → DNS 解析逐地址判。
 * DNS 解析失败或空结果 → fail closed；无法证明是公网就不发请求。
 */
export async function assertUrlAllowed(
  rawUrl: string,
  opts: UrlGuardOptions = {},
): Promise<void> {
  let u: URL;
  try {
    u = new URL(rawUrl.trim());
  } catch {
    throw new UrlBlockedError(
      `页面打不开:不是合法的 URL(收到「${rawUrl.slice(0, 80)}」)`,
    );
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new UrlBlockedError(
      `页面打不开:只支持 http/https 链接(收到「${u.protocol}」协议)`,
    );
  }
  // WHATWG URL 已把 8/16 进制、纯整数等 IPv4 形式归一化成点分十进制;IPv6 带 [] 需剥壳。
  const host =
    u.hostname.startsWith("[") && u.hostname.endsWith("]")
      ? u.hostname.slice(1, -1)
      : u.hostname;
  if (isIP(host)) {
    const reason = blockedIpReason(host);
    if (reason) {
      throw new UrlBlockedError(
        `该链接指向「${host}」(${reason})——为防内网探测(SSRF)已阻止访问,只支持公网网页。`,
      );
    }
    return; // 公网 IP 字面量放行
  }
  const hostReason = blockedHostnameReason(host);
  if (hostReason) {
    throw new UrlBlockedError(
      `该链接指向「${host}」(${hostReason})——为防内网探测(SSRF)已阻止访问,只支持公网网页。`,
    );
  }
  const lookup = opts.lookup ?? realLookup;
  let addrs: { address: string }[];
  try {
    addrs = await lookup(host);
  } catch {
    throw new UrlBlockedError(
      `无法确认目标「${host}」是公网地址，已阻止访问。`,
    );
  }
  if (addrs.length === 0) {
    throw new UrlBlockedError(
      `无法确认目标「${host}」是公网地址，已阻止访问。`,
    );
  }
  for (const a of addrs) {
    const reason = blockedIpReason(a.address);
    if (reason) {
      throw new UrlBlockedError(
        `「${host}」解析到「${a.address}」(${reason})——为防内网探测(SSRF)已阻止访问,只支持公网网页。`,
      );
    }
  }
}

async function resolvePinnedTarget(
  rawUrl: string,
  lookup: LookupFn,
): Promise<{ url: URL; addresses: string[] }> {
  await assertUrlAllowed(rawUrl, { lookup });
  const url = new URL(rawUrl);
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host)) return { url, addresses: [host] };
  const rows = await lookup(host).catch(() => []);
  if (rows.length === 0) {
    throw new UrlBlockedError(`无法确认目标「${host}」是公网地址，已阻止访问。`);
  }
  const addresses = rows.map((row) => row.address);
  // 第二次解析也必须完整通过，避免第一次检查后 rebinding 到内网。
  for (const address of addresses) {
    const reason = blockedIpReason(address);
    if (reason) {
      throw new UrlBlockedError(
        `「${host}」解析到「${address}」(${reason})——为防内网探测(SSRF)已阻止访问,只支持公网网页。`,
      );
    }
  }
  return { url, addresses };
}

const realSafeHttpRequest: SafeHttpRequest = (url, pinnedAddress, signal) =>
  new Promise((resolve, reject) => {
    const transport = url.protocol === "https:" ? https : http;
    const req = transport.request(
      {
        protocol: url.protocol,
        hostname: pinnedAddress,
        port: url.port || undefined,
        path: `${url.pathname}${url.search}`,
        method: "GET",
        headers: {
          host: url.host,
          accept: "text/html,application/xhtml+xml",
          "accept-encoding": "identity",
          "user-agent": "CreatorOS/1.0 safe-web-reader",
        },
        servername: url.hostname,
        signal,
      },
      (response) => {
        const chunks: Buffer[] = [];
        let size = 0;
        response.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > 12 * 1024 * 1024) {
            req.destroy(new Error("网页响应超过 12 MiB 安全上限"));
            return;
          }
          chunks.push(Buffer.from(chunk));
        });
        response.on("end", () => {
          const headers: Record<string, string | undefined> = {};
          for (const [key, value] of Object.entries(response.headers)) {
            headers[key] = Array.isArray(value) ? value[0] : value;
          }
          resolve({
            status: response.statusCode ?? 0,
            headers,
            body: Buffer.concat(chunks),
            remoteAddress: response.socket.remoteAddress,
          });
        });
      },
    );
    req.on("error", reject);
    req.end();
  });

/**
 * 不使用浏览器自动重定向。每一跳先解析全部 IP 并拒绝混合/保留地址，再把真实连接固定到
 * 已验证 IP；socket.remoteAddress 不匹配也拒绝。最多 10 跳，正文才交给渲染/抽取层。
 */
export async function fetchUrlSafely(
  rawUrl: string,
  opts: {
    lookup?: LookupFn;
    request?: SafeHttpRequest;
    signal?: AbortSignal;
    maxRedirects?: number;
  } = {},
): Promise<SafeFetchResult> {
  const lookup = opts.lookup ?? realLookup;
  const request = opts.request ?? realSafeHttpRequest;
  const maxRedirects = opts.maxRedirects ?? 10;
  let current = rawUrl;
  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    const { url, addresses } = await resolvePinnedTarget(current, lookup);
    const response = await request(url, addresses[0]!, opts.signal);
    const connected = response.remoteAddress?.replace(/^::ffff:/, "");
    const allowed = addresses.map((address) => address.replace(/^::ffff:/, ""));
    if (!connected || !allowed.includes(connected)) {
      throw new UrlBlockedError("实际连接地址不在已校验公网结果中，已阻止访问。");
    }
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.location;
      if (!location) throw new UrlBlockedError("重定向响应缺少 Location，已阻止访问。");
      if (hop === maxRedirects) throw new UrlBlockedError("网页重定向超过 10 次，已阻止访问。");
      current = new URL(location, url).toString();
      continue;
    }
    return { ...response, finalUrl: url.toString() };
  }
  throw new UrlBlockedError("网页重定向超过安全上限，已阻止访问。");
}

// ── 重定向链收集(Playwright Response → 每一跳 URL)──────────────────────────

/**
 * 从 Playwright Response 沿 request().redirectedFrom() 往回收整条重定向链的每一跳 URL
 * (含最初请求与最终请求)。鸭子类型访问:单测的 fake response 没有 request() → 返回空数组
 * (此时只复检 finalUrl);任何一步取值抛错都吞掉(复检是加固,不能反过来弄崩正常读取)。
 */
export function collectRedirectChainUrls(resp: unknown): string[] {
  const urls: string[] = [];
  const r = resp as { request?: () => unknown } | null | undefined;
  if (!r || typeof r.request !== "function") return urls;
  let cur: unknown;
  try {
    cur = r.request();
  } catch {
    return urls;
  }
  const seen = new Set<unknown>();
  let hops = 0;
  while (cur && typeof cur === "object" && !seen.has(cur) && hops < 32) {
    seen.add(cur);
    hops += 1;
    const req = cur as {
      url?: () => string;
      redirectedFrom?: () => unknown;
    };
    try {
      if (typeof req.url === "function") {
        const u = req.url();
        if (typeof u === "string" && u) urls.push(u);
      }
    } catch {
      // 单跳取 URL 失败 → 跳过该跳,继续往回走
    }
    try {
      cur = typeof req.redirectedFrom === "function" ? req.redirectedFrom() : null;
    } catch {
      break;
    }
  }
  return urls.reverse(); // 按时间序:最初请求 → … → 最终请求
}
