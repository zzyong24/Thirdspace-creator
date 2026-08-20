const TRANSIENT_SUBMIT_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

/**
 * 只识别 provider 已经明确返回的、可重试的提交拒绝。
 *
 * SEMANTIC_BOUNDARY_ALLOW: 这里只按 HTTP/生成协议执行可靠性策略，不参与内容创作判断。
 */
export function isExplicitRetryableSubmitRejection(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const value = error as Record<string, unknown>;
  const status = typeof value.status === "number" ? value.status : 0;
  return (
    value.stage === "submit" &&
    value.retryable === true &&
    TRANSIENT_SUBMIT_STATUSES.has(status)
  );
}

/**
 * 无 HTTP 响应的提交断连可能已经被上游受理。只有调用方已确认目标是支持 Idempotency-Key
 * 的官方受管网关，且会沿用同一幂等号时，才允许把这种结果未知的提交纳入有界重放。
 * 用户自配中转站不得开启此能力。
 *
 * SEMANTIC_BOUNDARY_ALLOW: 这里只判断真实传输阶段与错误类型，不做模型或内容语义判断。
 */
export function isUnknownNetworkSubmit(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const value = error as Record<string, unknown>;
  const hasHttpStatus =
    typeof value.status === "number" && Number.isFinite(value.status) && value.status > 0;
  return (
    value.stage === "submit" &&
    value.reason === "network" &&
    !hasHttpStatus
  );
}

export async function retryExplicitRejectedSubmit<T>(input: {
  operation: () => Promise<T>;
  sleep?: (ms: number) => Promise<void>;
  onRetry?: (attempt: number, error: unknown) => Promise<void> | void;
  delaysMs?: readonly number[];
  /** 仅限已验签且承诺识别同一 Idempotency-Key 的官方受管网关。 */
  allowIdempotentUnknownSubmitRetry?: boolean;
}): Promise<T> {
  const delays = input.delaysMs ?? [1_000, 3_000];
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await input.operation();
    } catch (error) {
      const delay = delays[attempt];
      const retryable =
        isExplicitRetryableSubmitRejection(error) ||
        (input.allowIdempotentUnknownSubmitRetry === true &&
          isUnknownNetworkSubmit(error));
      if (delay === undefined || !retryable) {
        throw error;
      }
      await input.onRetry?.(attempt + 1, error);
      await (input.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms))))(
        delay,
      );
    }
  }
}
