import { classifyLlmError } from "./llm/retry-policy";

const MAX_DIAGNOSTIC_MESSAGE_CHARS = 500;

/** 诊断日志/任务失败原因共用的脱敏：保留可排障正文，但不记录 token、API key 或密码。 */
export function safeErrorMessage(err: unknown): string {
  const raw =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : String(err);
  const singleLine = raw.replace(/\s+/g, " ").trim();
  const redacted = singleLine
    .replace(/\bBearer\s+[^\s,;]+/gi, "Bearer [REDACTED]")
    .replace(/\bsk-[A-Za-z0-9_-]{6,}\b/g, "[REDACTED]")
    .replace(/https?:\/\/[^\s,;)"']+/gi, "[REDACTED_URL]")
    .replace(
      /((?:api[-_ ]?key|token|secret|password)\s*[:=]\s*)[^\s,;]+/gi,
      "$1[REDACTED]",
    )
    .replace(
      /((?:model(?:name|id)?|provider|base[-_ ]?url)\s*[:=]\s*)[^\s,;]+/gi,
      "$1[REDACTED]",
    );
  if (!redacted) return "unknown error";
  return redacted.length <= MAX_DIAGNOSTIC_MESSAGE_CHARS
    ? redacted
    : `${redacted.slice(0, MAX_DIAGNOSTIC_MESSAGE_CHARS)}…`;
}

export function observableModelKey(spec: {
  model: string;
  displayModelKey?: "channel-managed";
}): string {
  return spec.displayModelKey ?? spec.model;
}

/** 渠道托管模式下不允许把 provider 返回的 model、URL、key 等正文带到任务失败原因。 */
export function safeModelFailureMessage(
  err: unknown,
  spec?: { displayModelKey?: "channel-managed" } | null,
): string {
  return spec?.displayModelKey === "channel-managed"
    ? "渠道模型调用失败，请稍后重试或联系官方处理"
    : safeErrorMessage(err);
}

/**
 * 结构化错误摘要：不落 headers/response/request 对象，只记录错误类、分类、状态码、错误码和
 * 脱敏后的短消息。适合写入 sidecar 诊断日志。
 */
export function formatErrorDiagnostic(
  err: unknown,
  options: { omitMessage?: boolean } = {},
): string {
  const e =
    err && typeof err === "object"
      ? (err as {
          name?: unknown;
          statusCode?: unknown;
          status?: unknown;
          code?: unknown;
        })
      : {};
  const errorClass =
    typeof e.name === "string" && e.name.trim() ? e.name.trim() : typeof err;
  const status =
    typeof e.statusCode === "number"
      ? e.statusCode
      : typeof e.status === "number"
        ? e.status
        : null;
  const code =
    typeof e.code === "string" && /^[A-Za-z0-9_.-]{1,80}$/.test(e.code)
      ? e.code
      : null;
  const cls = classifyLlmError(err);
  return [
    `class=${errorClass}`,
    `reason=${cls.reason}`,
    ...(status === null ? [] : [`status=${status}`]),
    ...(code ? [`code=${code}`] : []),
    ...(options.omitMessage
      ? []
      : [`message=${JSON.stringify(safeErrorMessage(err))}`]),
  ].join(" ");
}
