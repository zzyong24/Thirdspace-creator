import { executionTimeoutMs } from "@creatoros/contract/timeout-policy";

/** 覆盖 Playwright 的隐式 30 秒动作、导航、截图默认。测试窄端口可省略设置方法。 */
export function applyBrowserTimeoutPolicy(page: unknown): void {
  const browserPage = page as {
    setDefaultTimeout?: (timeout: number) => void;
    setDefaultNavigationTimeout?: (timeout: number) => void;
  };
  browserPage.setDefaultTimeout?.(executionTimeoutMs());
  browserPage.setDefaultNavigationTimeout?.(executionTimeoutMs());
}
