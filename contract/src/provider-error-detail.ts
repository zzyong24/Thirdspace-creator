/** 供应商诊断只保留短消息；不接受请求、响应头或任意 JSON 正文。 */
export function redactProviderErrorDetail(value: string, secrets: readonly string[] = []): string {
  let text = value;
  for (const secret of secrets) if (secret) text = text.replaceAll(secret, "[REDACTED]");
  return text
    .replace(/https?:\/\/[^\s"'<>]+/gi, "[URL]")
    .replace(/bearer\s+[^\s,;"']+/gi, "Bearer [REDACTED]")
    .replace(/\b(?:sk-|sk_|key-)[a-z0-9_-]+/gi, "[REDACTED]")
    .replace(/(["']?(?:api[_-]?key|secret(?:_value)?|token|authorization|password)["']?\s*[:=]\s*)(?:"[^"\n]*"|'[^'\n]*'|[^\s,;}]+)/gi, "$1[REDACTED]")
    .replace(/[\x00-\x1f\x7f<>]/g, " ")
    .replace(/\s+/g, " ").trim().slice(0, 512);
}

/** 只投影 error.message / error.code；解析失败仅接受 SDK 的短错误消息。 */
export function providerErrorDetail(status: number, raw: string, secrets: readonly string[] = []): string {
  let detail = raw;
  try {
    const parsed = JSON.parse(raw.replace(/^\d{3}[:\s]+/, ""));
    const error = parsed?.error ?? parsed;
    detail = [error?.code, error?.message].filter(v => typeof v === "string" || typeof v === "number").join(": ");
  } catch {
    // SDK 常返回“400 message”，不保留可能含完整请求或响应对象的 JSON。
    if (/[{}]/.test(raw)) detail = "";
  }
  const safe = redactProviderErrorDetail(detail, secrets);
  return `http_${status}${safe ? ": " + safe : ""}`.slice(0, 512);
}
