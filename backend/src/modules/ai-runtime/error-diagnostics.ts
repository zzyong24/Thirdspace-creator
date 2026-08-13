import { classifyLlmError } from "./llm/retry-policy";

const MAX_DIAGNOSTIC_MESSAGE_CHARS = 500;
const MANAGED_AI_CREDIT_EXHAUSTED_MESSAGE = "AI 额度不足，请充值后再试。";

function isManagedAiCreditExhausted(err: unknown): boolean {
  const e =
    err && typeof err === "object"
      ? (err as {
          name?: unknown;
          message?: unknown;
          code?: unknown;
          status?: unknown;
          statusCode?: unknown;
          responseBody?: unknown;
          cause?: unknown;
        })
      : {};
  const values = [
    typeof err === "string" ? err : "",
    e.name,
    e.message,
    e.code,
    e.status,
    e.statusCode,
    e.responseBody,
    e.cause instanceof Error ? e.cause.message : e.cause,
  ]
    .filter((value) => typeof value === "string" || typeof value === "number")
    .map(String);
  if (values.some((value) => value.trim() === "402")) return true;
  return /\bAI_CREDIT_(?:EXHAUSTED|INSUFFICIENT)\b|ManagedAiCreditExhaustedError|insufficient[\s_-]*(?:balance|quota|credit)|(?:balance|quota|credit)[\s_-]*(?:exhausted|insufficient|depleted)|\b1008\b|余额不足|额度不足|积分不足/i.test(
    values.join(" | "),
  );
}

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

/**
 * 用户主动查看的脱敏原始错误：尽量保留 HTTP 状态、provider 文案、模型返回与节点原因，
 * 只移除秘密和私有地址。它不是“人话翻译”，也不应被模型拿来推断错误之外的系统状态。
 */
export function redactedRawErrorMessage(err: unknown): string {
  return safeErrorMessage(err);
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
  if (spec?.displayModelKey !== "channel-managed") return safeErrorMessage(err);
  if (isManagedAiCreditExhausted(err)) {
    return MANAGED_AI_CREDIT_EXHAUSTED_MESSAGE;
  }
  const code =
    err && typeof err === "object" && typeof (err as { code?: unknown }).code === "string"
      ? (err as { code: string }).code
      : "";
  const stage =
    err &&
    typeof err === "object" &&
    typeof (err as { stage?: unknown }).stage === "string"
      ? (err as { stage: string }).stage
      : "";
  const safeMessages: Record<string, string> = {
    CHANNEL_MODEL_AUTHENTICATION:
      "模型服务授权已失效，请重新校验激活权益后重试。",
    CHANNEL_MODEL_RATE_LIMITED: "当前生成请求较多，请稍后再试。",
    CHANNEL_MODEL_UPSTREAM: "生成服务暂时不可用，请稍后重试。",
    CHANNEL_MODEL_RESPONSE_CONTRACT:
      "生成服务已经返回结果，但当前版本无法识别该结果，请联系官方处理。",
    CHANNEL_MODEL_DOWNLOAD:
      "内容已经生成，但下载保存失败，请稍后重试或联系官方处理。",
    CHANNEL_MODEL_NETWORK:
      err &&
      typeof err === "object" &&
      (err as { stage?: unknown }).stage === "submit"
        ? "生成请求的提交结果未知，为避免重复计费已停止自动重试，请联系官方处理。"
        : "查询生成结果时网络中断，请稍后重试。",
    CHANNEL_MODEL_TIMEOUT:
      "生成仍在处理中或查询超时，系统没有重复发起生成，请稍后重试。",
  };
  const message =
    safeMessages[code] ??
    (stage === "submit"
      ? "生成请求的提交结果未知，为避免重复计费已停止自动重试，请联系官方处理。"
      : stage === "local_persist"
        ? "内容已经生成，但本地保存未完成。为避免重复计费已停止自动重试，请联系官方处理。"
        : "模型调用失败，请稍后重试或联系官方处理");
  const reference =
    err &&
    typeof err === "object" &&
    typeof (err as { reference?: unknown }).reference === "string" &&
    /^[a-z][a-z0-9-]{4,40}$/i.test(
      (err as { reference: string }).reference,
    )
      ? (err as { reference: string }).reference
      : null;
  return reference ? `${message}（参考号：${reference}）` : message;
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
          reason?: unknown;
          stage?: unknown;
          reference?: unknown;
          retryable?: unknown;
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
  const providerReason =
    typeof e.reason === "string" && /^[a-z_]{3,40}$/.test(e.reason)
      ? e.reason
      : null;
  const stage =
    typeof e.stage === "string" && /^[a-z_]{3,40}$/.test(e.stage)
      ? e.stage
      : null;
  const reference =
    typeof e.reference === "string" && /^[a-z][a-z0-9-]{4,40}$/i.test(e.reference)
      ? e.reference
      : null;
  const cls = classifyLlmError(err);
  return [
    `class=${errorClass}`,
    `reason=${cls.reason}`,
    ...(providerReason ? [`provider_reason=${providerReason}`] : []),
    ...(stage ? [`stage=${stage}`] : []),
    ...(status === null ? [] : [`status=${status}`]),
    ...(code ? [`code=${code}`] : []),
    ...(reference ? [`reference=${reference}`] : []),
    ...(typeof e.retryable === "boolean"
      ? [`retryable=${String(e.retryable)}`]
      : []),
    ...(options.omitMessage
      ? []
      : [`message=${JSON.stringify(safeErrorMessage(err))}`]),
  ].join(" ");
}
