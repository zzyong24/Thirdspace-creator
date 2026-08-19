const TRANSIENT_SUBMIT_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

/**
 * 只识别 provider 已经明确返回的、可重试的提交拒绝。网络断开、客户端超时、响应无法解析
 * 都不属于这里，因为它们可能已经被上游受理，自动重放会造成重复计费。
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

export async function retryExplicitRejectedSubmit<T>(input: {
  operation: () => Promise<T>;
  sleep?: (ms: number) => Promise<void>;
  onRetry?: (attempt: number, error: unknown) => Promise<void> | void;
  delaysMs?: readonly number[];
}): Promise<T> {
  const delays = input.delaysMs ?? [1_000, 3_000];
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await input.operation();
    } catch (error) {
      const delay = delays[attempt];
      if (delay === undefined || !isExplicitRetryableSubmitRejection(error)) {
        throw error;
      }
      await input.onRetry?.(attempt + 1, error);
      await (input.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms))))(
        delay,
      );
    }
  }
}
