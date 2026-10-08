import { classifyLlmError, getRetryAfterMs } from "../runtime/retry-policy";

/** 只传白名单诊断，不保留原始供应商请求、响应或凭据。 */
export class GenerationFailure extends Error {
  constructor(
    readonly outcome: "retry_wait" | "waiting_user" | "failed" | "unknown_result",
    readonly errorCode: string,
    readonly retryAfterMs?: number,
  ) {super(errorCode);}
}

export function generationFailure(error: unknown, hasOutput: boolean, options: {allowUnconfirmedModelRetry?: boolean} = {}): GenerationFailure {
  const classified = classifyLlmError(error);
  // 默认只有明确 HTTP 拒绝可据响应分类；模型候选调用可显式选择废弃后续跑。
  if (!hasOutput && error && typeof error === "object") {
    const e = error as {statusCode?: unknown; status?: unknown; code?: unknown; retryAfterMs?: unknown};
    if (e.code === "AI_CREDIT_EXHAUSTED") return new GenerationFailure("waiting_user", "AI_CREDIT_EXHAUSTED");
    const status = e.statusCode ?? e.status;
    if (typeof status === "number" && status >= 400 && status <= 599) {
      if (status === 401 || status === 402 || status === 403) return new GenerationFailure("waiting_user", classified.reason);
      const delay = typeof e.retryAfterMs === "number" && Number.isFinite(e.retryAfterMs) && e.retryAfterMs >= 0
        ? e.retryAfterMs : getRetryAfterMs(error, Date.now, Infinity) ?? undefined;
      if (classified.retryable) return new GenerationFailure("retry_wait", classified.reason, delay);
      return new GenerationFailure("failed", classified.reason);
    }
  }
  // 模型文本是可丢弃的候选。即使流里已有未完成文本，连接故障仍可废弃本次候选并由原任务续跑；
  // 默认保持保守，素材、工具和其他可能有副作用的调用不得借此重放。
  if (options.allowUnconfirmedModelRetry && classified.retryable)
    return new GenerationFailure("retry_wait", classified.reason, getRetryAfterMs(error, Date.now, Infinity) ?? undefined);
  return new GenerationFailure("unknown_result", "MODEL_RESULT_UNKNOWN");
}

/** 包装错误不得抹去账本已知的暂停/未知回执状态。 */
export function findGenerationFailure(error: unknown): GenerationFailure | undefined {
  const seen = new Set<unknown>();
  let current = error;
  while (current && typeof current === "object" && !seen.has(current)) {
    if (current instanceof GenerationFailure) return current;
    seen.add(current);
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}
