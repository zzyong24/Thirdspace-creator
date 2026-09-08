import { classifyLlmError, getRetryAfterMs } from "../runtime/retry-policy";

/** 只传白名单诊断，不保留原始供应商请求、响应或凭据。 */
export class GenerationFailure extends Error {
  constructor(
    readonly outcome: "retry_wait" | "waiting_user" | "failed" | "unknown_result",
    readonly errorCode: string,
    readonly retryAfterMs?: number,
  ) {super(errorCode);}
}

export function generationFailure(error: unknown, hasOutput: boolean): GenerationFailure {
  const classified = classifyLlmError(error);
  // 仅明确 HTTP 拒绝可据响应分类。网络断开或已出流均可能已计费，不推测为未提交。
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
