// [B-01] Web Session 域名 → 目录名 的安全净化 + 校验(防路径穿越)。
//
// 背景(架构师上线审计 Blocker B-01):`/api/web-session` 的 status/remove 直接把 HTTP body 里的
//   `domain` 拼进 `.auth/web/<domain>` 再 `rm(recursive, force)`。装机版 `.auth/web` 落在
//   `<appDataDir>/.auth/web`,与 DB(`db/`)、master key(`.master-key`)、日志(`logs/`)、浏览器
//   profile 同盘。`domain="../.."` 会从 `<appDataDir>/.auth/web` 解析回 `<appDataDir>`,递归删除
//   整个应用数据(删库 / 删 master key / 删登录态)。此模块是**纵深防御第①层**(白名单校验)。
//
// 纯函数、无副作用、无 `server-only`——路由(入口拦截返 400)与 persistence-client(FS 边界再校验)
//   共用同一份判定,且可独立单测。

/** 域名校验失败(疑似路径穿越)。route 据此转 400,不触碰文件系统。 */
export class WebDomainError extends Error {
  readonly code = "WebDomainError";
  constructor(message: string) {
    super(message);
    this.name = "WebDomainError";
  }
}

// 合法 hostname 白名单:首字符必须是字母/数字(挡前导 `.`/`-`/`/`/绝对路径),其余仅 [a-z0-9.-],
//   总长 ≤ 253(RFC 1035)。因字符集不含 `/`、`\`、`%`、`:`,故路径分隔符、编码分隔符
//   (`%2e`/`%2f`)、盘符(`c:`)天然落选;`..` 再由下方显式禁连缀兜底。
const HOSTNAME_RE = /^[a-z0-9][a-z0-9.-]{0,252}$/;

// [T-378] 惰性迁移(T-370a)归档旧 profile 目录 = 改名加 `.migrated-<ts>` 后缀。该后缀全是
//   [a-z0-9.-] 合法字符 → 曾通过 HOSTNAME_RE 被当成「域名」列出/探针/再迁移,造成
//   `x.migrated-a.migrated-b` 无限增殖 + DB 脏行。归档目录名**永远不是合法域名**,统一在此拒。
const ARCHIVE_MARKER = ".migrated-";

/** [T-378] 是否为惰性迁移归档目录名(`<domain>.migrated-<ts>`,可能嵌套多层)。 */
export function isArchivedWebProfileName(raw: string): boolean {
  return normalizeWebDomain(raw).includes(ARCHIVE_MARKER);
}

/** [T-378] 是否为**嵌套**归档目录名(`x.migrated-a.migrated-b`,归档的归档,无价值可删)。 */
export function isNestedArchivedWebProfileName(raw: string): boolean {
  const d = normalizeWebDomain(raw);
  return d.split(ARCHIVE_MARKER).length > 2;
}

/** 归一化:trim + 转小写(是否 strip `www.` 由调用方各自决定,此处不动结构)。 */
export function normalizeWebDomain(raw: string): string {
  return raw.trim().toLowerCase();
}

/** 是否可安全用作 `.auth/web/<domain>` 目录名(防路径穿越白名单)。 */
export function isSafeWebDomain(raw: string): boolean {
  const d = normalizeWebDomain(raw);
  if (!d || d.length > 253) return false;
  if (!HOSTNAME_RE.test(d)) return false;
  // 冗余显式禁(白名单已覆盖,双保险,便于审计意图):`..` 连缀、路径分隔符、编码分隔符。
  if (d.includes("..")) return false;
  if (d.includes("/") || d.includes("\\")) return false;
  if (d.includes("%")) return false;
  // [T-378] 归档目录名(`.migrated-` 后缀)不是域名:挡「归档目录被当域名探针 → 再触发迁移
  //   → 再归档」的增殖链(listSessions 目录过滤 / route 入口 400 / webAuthDirFor 硬拒同享此判定)。
  if (d.includes(ARCHIVE_MARKER)) return false;
  return true;
}

/** 校验并返回归一域名;不合法抛 WebDomainError(供 FS 边界处硬拒)。 */
export function assertSafeWebDomain(raw: string): string {
  if (!isSafeWebDomain(raw)) {
    throw new WebDomainError(
      `非法域名(疑似路径穿越,已拒绝):${JSON.stringify(raw)}`,
    );
  }
  return normalizeWebDomain(raw);
}

// ── 域名归一 ────────────────────────────────────────────────────────────────
/**
 * 从 URL 解析出稳定的域名 key(保管库目录名 + 会话归属键)。小写、去掉前导 `www.`,
 * 让 `https://www.chatgpt.com/share/x` 与 `https://chatgpt.com/share/y` 归到同一保管库目录。
 * 非法/非 http(s) URL → 抛错(调用方接住转人话)。
 */
export function webDomainFromUrl(url: string): string {
  const trimmed = (url ?? "").trim();
  let host: string;
  try {
    const u = new URL(trimmed);
    if (u.protocol !== "http:" && u.protocol !== "https:") {
      throw new Error("only http/https");
    }
    host = u.hostname;
  } catch {
    throw new Error(
      `无法从链接解析域名(只支持 http/https):「${trimmed.slice(0, 80)}」`,
    );
  }
  const normalized = host.toLowerCase().replace(/^www\./, "");
  // T-488：抖音分享短链会从 v.douyin.com / iesdouyin.com 跳到主站。如果按输入
  // hostname 分库存储，用户在短链登录后，长链读取会查不到同一份 state。这里只合并
  // 已知属于同一抖音产品身份边界的域；其他站点仍严格按域隔离。
  if (
    normalized === "douyin.com" ||
    normalized.endsWith(".douyin.com") ||
    normalized === "iesdouyin.com" ||
    normalized.endsWith(".iesdouyin.com")
  ) {
    return "douyin.com";
  }
  return normalized;
}

/**
 * 查登录态时允许读取的历史域键。第一项永远是当前 canonical key；后续项只用于把
 * T-488 修复前可能写入的抖音短链 state 惰性搬到主键，不扩大其他站点的会话边界。
 */
export function webSessionLookupDomains(domain: string): string[] {
  const canonical = webDomainFromUrl(`https://${domain}`);
  if (canonical !== "douyin.com") return [canonical];
  return [
    canonical,
    "v.douyin.com",
    "iesdouyin.com",
    "www.iesdouyin.com",
  ];
}
