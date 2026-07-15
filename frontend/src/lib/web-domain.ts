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
