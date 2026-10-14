import { executionTimeoutMs } from "@creatoros/contract/timeout-policy";
import { readCurrentGroupId, readCurrentAccountId } from "@/lib/http-transport";
import { handshakeHeaders } from "@/lib/handshake-client";

const USER_CREDIT_PATHS = new Set(["/credits/connect", "/credits/launch"]);

export function validateAiCreditCenterUrl(rawUrl: string): URL {
  const target = new URL(rawUrl);
  if (
    target.protocol !== "https:" ||
    target.username ||
    target.password ||
    target.search ||
    !target.hash ||
    !USER_CREDIT_PATHS.has(target.pathname)
  ) {
    throw new Error("额度页面地址未通过安全校验");
  }
  return target;
}

/**
 * 统一打开 Growth 用户额度页。一次性码只在 URL fragment 中短暂传递；绝不接受管理端、
 * 渠道端或 query 凭据。设置页和 Copilot 错误态必须复用这一条安全链路。
 */
export const AI_CREDIT_CENTER_OPEN_WAIT_MS = executionTimeoutMs(600_000);
function cancelledWait(): DOMException {
  return new DOMException("本次等待已结束或取消，请保留原操作后重试", "AbortError");
}
/** 只结束当前观察者等待；已发出的底层任务/共享GET仍保原身份与真实状态。 */
export function waitForAiCreditCenter<T>(operation: () => T | PromiseLike<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(cancelledWait());
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const finish = (result: { value: T } | { error: unknown }) => {
      if (settled) return;
      settled = true; signal.removeEventListener("abort", abort);
      if ("error" in result) reject(result.error); else resolve(result.value);
    };
    const abort = () => finish({ error: cancelledWait() });
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) { abort(); return; }
    try {
      Promise.resolve(operation()).then(value => {
        if (signal.aborted) abort(); else finish({ value });
      }, error => finish({ error }));
    } catch (error) { finish({ error }); }
  });
}
/** 单个阶段只创建一次预算，父signal更早耗尽则停止，不续原持久任务期限。 */
export async function withAiCreditCenterBudget<T>(
  budgetMs: number, parentSignal: AbortSignal | undefined,
  operation: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController(), cancel = () => controller.abort();
  const timer = setTimeout(cancel, executionTimeoutMs(budgetMs));
  parentSignal?.addEventListener("abort", cancel, { once: true });
  if (parentSignal?.aborted) cancel();
  try { return await waitForAiCreditCenter(() => operation(controller.signal), controller.signal); }
  finally { clearTimeout(timer); parentSignal?.removeEventListener("abort", cancel); }
}
export type AiCreditCenterOpenOptions = {
  readonly signal?: AbortSignal;
  readonly isCurrent?: () => boolean;
};
export async function openAiCreditCenter(options: AiCreditCenterOpenOptions = {}): Promise<void> {
  const scope = JSON.stringify([readCurrentGroupId(), readCurrentAccountId()]);
  const sameScope = () => scope === JSON.stringify([readCurrentGroupId(), readCurrentAccountId()]);
  const controller = new AbortController();
  const cancel = () => controller.abort();
  const checkScope = () => { if (!sameScope()) cancel(); };
  // 覆盖普通票据v3、有限v2兼容和Growth连接的完整串行预算；原outer signal更早耗尽就立即停。
  // 不读取/写入开户operation deadline，更不续原资金操作期限。
  const timer = setTimeout(cancel, AI_CREDIT_CENTER_OPEN_WAIT_MS);
  options.signal?.addEventListener("abort", cancel, { once: true });
  if (options.signal?.aborted) cancel();
  if (typeof window !== "undefined") {
    window.addEventListener("creatoros:accounts-changed", checkScope);
    window.addEventListener("storage", checkScope);
  }
  const assertCurrent = () => {
    if (controller.signal.aborted || !sameScope() || options.isCurrent?.() === false) {
      throw new DOMException("本次额度页面打开已取消，请在当前账号组重新打开", "AbortError");
    }
  };
  try {
    assertCurrent();
    const response = await waitForAiCreditCenter(() => globalThis.fetch("/api/v1/local/ai-credits/connect", {
      method: "POST", headers: handshakeHeaders(), cache: "no-store", redirect: "manual",
      signal: controller.signal,
    }), controller.signal);
    assertCurrent();
    const value = (await waitForAiCreditCenter(() => response.json(), controller.signal)) as { openUrl?: unknown; error?: unknown };
    assertCurrent();
    if (!response.ok || typeof value.openUrl !== "string") {
      throw new Error(typeof value.error === "string" ? value.error : "暂时无法打开 AI 额度，请稍后重试");
    }
    const target = validateAiCreditCenterUrl(value.openUrl);
    try {
      const { openUrl } = await waitForAiCreditCenter(() => import("@tauri-apps/plugin-opener"), controller.signal);
      assertCurrent();
      await waitForAiCreditCenter(() => openUrl(target.toString()), controller.signal);
      assertCurrent();
    } catch (cause) {
      assertCurrent();
      // AbortError不是宿主不可用，任何取消都禁止再走浏览器fallback。
      if ((cause as { name?: string } | null)?.name === "AbortError") throw cause;
      const opened = window.open(target.toString(), "_blank", "noopener,noreferrer");
      if (!opened) throw new Error("没有打开额度页面，请稍后再试");
    }
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", cancel);
    if (typeof window !== "undefined") {
      window.removeEventListener("creatoros:accounts-changed", checkScope);
      window.removeEventListener("storage", checkScope);
    }
  }
}
