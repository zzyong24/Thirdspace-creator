import "server-only";

// [T-326·RT-H04] SSRF URL 守卫 —— web-reader / web-capture 共用的目标地址阻断层。
//
// 背景:两处原本「只查 http/https 就 page.goto」,恶意链接可让服务端无头浏览器去打
// 127.0.0.1 / 10.x / 169.254.169.254(云元数据)等内网地址,把内网/本机服务内容读回给模型或
// 截成图(SSRF)。本模块提供:
//   ① assertUrlAllowed —— 导航前置检查:协议白名单 http/https;hostname 是 IP 字面量
//      (含 IPv6、8 进制/16 进制/纯整数等绕过形式,WHATWG URL 解析会把这些归一化成标准
//      点分十进制,与 Chromium 同一套解析语义,不会「守卫看到的」≠「浏览器实际去的」)
//      直接按解析结果判;是域名则先过黑名单(localhost/.internal/.local/无点单标签/云元数据
//      域名),再 DNS 解析全部地址逐个判。
//   ② collectRedirectChainUrls —— 从 Playwright Response 沿 request().redirectedFrom()
//      往回收整条重定向链的每一跳 URL,供导航后逐跳复检(选型见下)。
//
// 重定向复检选型(如实):Playwright 的 page.route **不会**在重定向跳转上再次触发
// (route 只拦截链条的首个请求,redirect 由浏览器自动跟随),所以做不到「逐跳事前阻断」。
// 采用的方案 = 事后链审计:goto 完成后用 response.request().redirectedFrom() 拿到全部跳转
// 请求,对每一跳 URL 重跑 assertUrlAllowed —— 命中即抛错,**内容绝不返回给模型/落素材**。
// 残留(诚实):被重定向指向的内网地址,那个 HTTP 请求本身已被浏览器发出(GET 的副作用无法
// 撤销);以及 DNS rebinding(浏览器解析到的 IP 与我们复核解析到的 IP 可能不同)无法根治。
//
// DNS 失败语义(用户是本机装机版、目标是公开网页,**别误杀正常公网站**):
//   · 解析失败(ENOTFOUND/超时)→ **放行**:解析不到 ≠ 恶意,后续 page.goto 自己会以
//     「页面打不开」诚实失败;若是重定向跳复检时解析失败,说明我们复核不了,但浏览器已经
//     打开过它 —— 同样放行(保守起见不误杀 CDN 多级跳)。
//   · 解析成功但任一地址命中阻断段 → 拒绝(fail-closed:公网域名混挂内网 IP 也挡)。

import { isIP } from "node:net";

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

/**
 * [T-438] RFC2544 基准测试段(198.18.0.0/15)的阻断原因 —— 单独抽常量,因为它在两种场景下判定不同:
 *   · **直接 IP 字面量**(`http://198.18.2.1`)→ 仍阻断(没有正当理由直接访问该段 = 可疑探测);
 *   · **域名 DNS 解析结果**命中它 → **例外放行**(见 assertPublicUrl)。原因:Clash/Surge 等代理的
 *     **fake-ip 模式默认池正是 198.18.0.0/16**,开代理时所有公网域名(kimi.com/wikipedia.org…)
 *     都解析到这里,一刀切会让**网页截图对所有代理用户全废**(2026-07-20 真机 4 连失败);且 fake-ip
 *     下这个地址根本不代表真实连接目标 —— 实际连接由代理发起,本机不会真连内网,该层检查已失去意义。
 */
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
 * DNS 解析失败 → 放行(解析不到 ≠ 恶意,page.goto 会自己诚实失败;语义详见文件头注释)。
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
    return; // DNS 解析失败放行:page.goto 会以「页面打不开」诚实失败(解析不到 ≠ 恶意)
  }
  for (const a of addrs) {
    const reason = blockedIpReason(a.address);
    // [T-438] fake-ip 例外:域名解析到 198.18.0.0/15 时放行 —— 那几乎必然是 Clash/Surge 的 fake-ip
    //   假地址(其默认池就是 198.18.0.0/16),不是真的内网目标;实际连接由代理发起。不放行则所有开
    //   代理的用户网页截图全废。**其余保留段(回环/私网/链路本地/云元数据)一律照拦**,上面两层
    //   (IP 字面量、hostname)也全部保留 —— 那才是防内网探测的真防线。
    if (reason === FAKE_IP_BENCH_REASON) continue;
    if (reason) {
      throw new UrlBlockedError(
        `「${host}」解析到「${a.address}」(${reason})——为防内网探测(SSRF)已阻止访问,只支持公网网页。`,
      );
    }
  }
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
