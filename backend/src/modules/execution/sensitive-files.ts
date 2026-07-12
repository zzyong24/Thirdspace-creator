// 敏感文件 denylist(T-255a;T-253 web-reader/文件读工具将共用这份常量 —— 单一真值,
// 别在各处复刻模式串)。命中即拒:输入物化不落、产物收割不收、采纳不入库。
//
// 语义(SPEC 2026-07-11 execution-layer §2):`.env` 家族 / *key* / *secret* /
// 常见凭证文件名。按**文件名**(basename)判,大小写不敏感;宁可误杀(诚实拒绝 +
// 明确报因)不可漏放。

/** 精确/前缀命中的敏感文件名(小写比较)。 */
const EXACT_OR_PREFIX = [".env"] as const;

/** 子串命中的敏感词(小写比较):*key* / *secret* / 凭证家族。 */
const SUBSTRINGS = [
  "key",
  "secret",
  "credential",
  "token",
  "passwd",
  "password",
  "id_rsa",
  "id_ed25519",
] as const;

/**
 * 文件名是否命中敏感 denylist(只看 basename,大小写不敏感)。
 * `.env` 与 `.env.*` 前缀命中;其余按子串命中(`api-key.txt`/`my_secrets.json`…)。
 */
export function isSensitiveFileName(fileName: string): boolean {
  const base = fileName.replace(/\\/g, "/").split("/").pop() ?? "";
  const lower = base.trim().toLowerCase();
  if (!lower) return false;
  for (const p of EXACT_OR_PREFIX) {
    if (lower === p || lower.startsWith(`${p}.`)) return true;
  }
  return SUBSTRINGS.some((s) => lower.includes(s));
}
