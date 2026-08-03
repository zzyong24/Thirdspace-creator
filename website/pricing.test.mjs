import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const html = await readFile(new URL("./index.html", import.meta.url), "utf8");
const visibleText = html
  .replace(/<style[\s\S]*?<\/style>/gi, " ")
  .replace(/<script[\s\S]*?<\/script>/gi, " ")
  .replace(/<[^>]+>/g, " ")
  .replace(/&nbsp;/g, " ")
  .replace(/\s+/g, " ")
  .trim();

test("官网展示用户确认的定价、设备与购买口径", () => {
  for (const expected of [
    "内测共创价",
    "599",
    "2026年8月10日",
    "一机一码",
    "每个激活码仅绑定 1 台设备",
    "Apple 芯片 Mac",
    "Windows",
    "Intel Mac",
    "适配推进中",
    "正式版（内测结束后）",
    "899",
    "次年续费",
    "199",
    "不再提供永久买断",
    "内测共创群",
  ]) {
    assert.ok(visibleText.includes(expected), `缺少公开文案：${expected}`);
  }
});

test("官网不再展示已失效的价格、更新与版本承诺", () => {
  for (const forbidden of [
    "1499",
    "没有订阅、没有续费",
    "后续版本 免费 自动更新",
    "买一次,一直新",
    "永久属于你",
    "Mac 与 Windows 桌面端",
    "基础版 / Plus / Pro",
    "换机请联系作者迁移",
    "概念稿",
  ]) {
    assert.ok(!visibleText.includes(forbidden), `仍存在失效文案：${forbidden}`);
  }
});

test("价格区先说明通用设备规则，再展示购买方案", () => {
  const pricingStart = html.indexOf('<section class="price" id="price">');
  const deviceInfo = html.indexOf("purchase-facts", pricingStart);
  const pricingGrid = html.indexOf('class="pricing-grid"', pricingStart);

  assert.ok(pricingStart >= 0, "缺少定价区");
  assert.ok(deviceInfo > pricingStart, "缺少购买与设备说明");
  assert.ok(pricingGrid > deviceInfo, "购买方案必须位于通用设备说明之后");
});
