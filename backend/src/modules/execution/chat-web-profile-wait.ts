import {executionTimeoutMs} from "@creatoros/contract/timeout-policy";
import { setTimeout as delay } from "node:timers/promises";
import { BrowserProfileBusyError } from "./execution-browser-profile-lease.service";

/** 对话网页资源获取；等待期间不执行网页、模型或释放已有资源。 */
export async function waitForChatWebProfile<T>(
  acquire: () => Promise<T>,
  signal: AbortSignal,
  options: { timeoutMs?: number; pollMs?: number } = {},
): Promise<T> {
  const started = performance.now(), deadline = started + (executionTimeoutMs(options.timeoutMs));
  let waited = false;
  for (;;) {
    signal.throwIfAborted();
    try {
      const receipt = await acquire();
      if (waited) console.info("[chat-web-profile-wait] 网站资源已释放，取得租约", { waitedMs: Math.round(performance.now() - started) });
      return receipt;
    }
    catch (error) {
      signal.throwIfAborted();
      if (!(error instanceof BrowserProfileBusyError)) throw error;
      if (!waited) console.info("[chat-web-profile-wait] 网站资源占用，等待实际持有者释放");
      waited = true;
      const remaining = deadline - performance.now();
      if (remaining <= 0) throw error;
      // 事务已经退出，仅等待真实持有者释放。每轮获取重新验证执行租约与归属。
      await delay(Math.min(options.pollMs ?? 250, remaining), undefined, { signal });
      if (performance.now() >= deadline) throw error;
    }
  }
}
