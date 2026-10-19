/** 第一方执行/结果等待的统一下限；poll、heartbeat、TTL 和输入时长不适用。 */
export const MIN_EXECUTION_TIMEOUT_MS = 120_000;
export const TIMEOUT_COMPLETION_GRACE_MS = 10_000;
const MAX_TIMER_MS = 2_147_483_647;

/** 调整新单次预算；0/null 禁用由调用者原契约显式处理，不能偷偷变成无限。 */
export function executionTimeoutMs(requested?: number, fallback = MIN_EXECUTION_TIMEOUT_MS): number {
  const value = requested ?? fallback;
  if (!Number.isSafeInteger(value) || value <= 0 || value > MAX_TIMER_MS) {
    throw new RangeError("EXECUTION_TIMEOUT_INVALID");
  }
  return Math.max(MIN_EXECUTION_TIMEOUT_MS, value);
}

/** 外层必须覆盖串行内层、重试等全部预算，并给结算和传输留出余量。 */
export function completionWaitMs(innerBudgets: readonly number[], overheadMs = TIMEOUT_COMPLETION_GRACE_MS): number {
  if (!Number.isSafeInteger(overheadMs) || overheadMs < 0) throw new RangeError("TIMEOUT_OVERHEAD_INVALID");
  const total = innerBudgets.reduce((sum, value) => sum + executionTimeoutMs(value), 0)
    + Math.max(TIMEOUT_COMPLETION_GRACE_MS, overheadMs);
  if (total > MAX_TIMER_MS) throw new RangeError("EXECUTION_TIMEOUT_INVALID");
  return Math.max(MIN_EXECUTION_TIMEOUT_MS + TIMEOUT_COMPLETION_GRACE_MS, total);
}

/** 原持久任务的绝对deadline不能被两分钟下限重置或延长。null表示continuous。 */
export function remainingDeadlineMs(deadlineAt: number | null, now = Date.now()): number | undefined {
  if (deadlineAt === null) return undefined;
  if (!Number.isFinite(deadlineAt) || !Number.isFinite(now)) throw new RangeError("EXECUTION_DEADLINE_INVALID");
  return Math.max(0, deadlineAt - now);
}
