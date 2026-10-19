/** 项目执行超时下限；poll/TTL和原绝对deadline剩余值不能使用此归一。 */
export const MIN_EXECUTION_TIMEOUT_MS = 120_000;
export const BROWSER_LAUNCH_TIMEOUT_MS = 180_000; // 保留Playwright原有更长启动预算。
export function executionTimeoutMs(value = MIN_EXECUTION_TIMEOUT_MS) {
  if (!Number.isSafeInteger(value) || value <= 0 || value > 2_147_483_647) {
    throw new RangeError("执行超时必须是可用的正整数毫秒");
  }
  return Math.max(MIN_EXECUTION_TIMEOUT_MS, value);
}
// 有限观察共用绝对deadline。已耗尽不重置两分钟；子请求可能仅剩更短预算。
export function remainingObservationMs(deadlineMs, nowMs = Date.now()) {
  const remaining = deadlineMs - nowMs;
  if (remaining <= 0) throw new Error("观察预算已耗尽");
  return Math.min(2_147_483_647, Math.ceil(remaining));
}
export function configureProbePage(page, timeoutMs = MIN_EXECUTION_TIMEOUT_MS) {
  const budget = executionTimeoutMs(timeoutMs);
  page.setDefaultTimeout(budget);
  page.setDefaultNavigationTimeout(budget);
  return budget;
}
export async function withinExecution(promise, timeoutMs = MIN_EXECUTION_TIMEOUT_MS, timers = globalThis) {
  const budget = executionTimeoutMs(timeoutMs);
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = timers.setTimeout(() => reject(new Error(`执行等待超过 ${budget} 毫秒`)), budget);
    })]);
  } finally { timers.clearTimeout(timer); }
}
