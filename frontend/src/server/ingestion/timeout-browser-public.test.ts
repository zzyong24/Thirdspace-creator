// @vitest-environment node
import { chromium } from "@playwright/test";
import { describe, expect, it } from "vitest";
import { completionWaitMs } from "@creatoros/contract/timeout-policy";
import { applyBrowserTimeoutPolicy } from "./browser-timeouts";
import { readDouyinTrafficPage } from "./douyin-traffic";

// 真实隔离 Chromium + 本地拦截页面，验证公共读取调用；不是平台/安装版 E2E。
describe("T-1066 真实浏览器公共调用", () => {
  it.skipIf(process.env.CREATOROS_BROWSER_TIMEOUT_SMOKE !== "1")("慢于旧30秒的页面仍完成，用户已取消时立即停止", async () => {
    console.info("[timeout-browser] launch isolated Chromium");
    const browser = await chromium.launch({ headless: true, timeout: 180_000 });
    console.info("[timeout-browser] browser launched");
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      console.info("[timeout-browser] fixture page ready");
      applyBrowserTimeoutPolicy(page);
      const controller = new AbortController();
      controller.abort();
      const cancelledAt = Date.now();
      await expect(readDouyinTrafficPage(page, "7683770599029640448", controller.signal)).rejects.toThrow();
      expect(Date.now() - cancelledAt).toBeLessThan(1000);
      await context.route("**/*", async route => {
        await new Promise(resolve => setTimeout(resolve, 31_000));
        await route.fulfill({ contentType: "text/html; charset=utf-8", body: '<meta charset="utf-8"><div role="tab" aria-selected="true">流量分析</div><table><tr><th>抖音 App</th><th>来源占比</th></tr><tr><td>推荐页</td><td>90%</td></tr></table>' });
      });
      console.info("[timeout-browser] invoke public traffic reader with delayed fixture");
      const started = Date.now();
      const result = await readDouyinTrafficPage(page, "7683770599029640448");
      console.info("[timeout-browser] public reader completed", Date.now() - started);
      expect(Date.now() - started).toBeGreaterThan(30_000);
      expect(result).toMatchObject({ complete: true, entries: [{ label: "推荐页", percentage: 90 }] });
    } finally {
      await context.close();
      await browser.close();
    }
  }, completionWaitMs([180_000, 120_000, 120_000, 120_000]));
});
