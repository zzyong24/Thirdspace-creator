// [T-459] Bytenode 与 Playwright 函数序列化的兼容门。
// Playwright 会读取 callback.toString() 并在浏览器重建；进入 .jsc 后源码会变成
// Bytenode 占位字符，必须在字节码选择阶段硬排除。

import { describe, expect, it } from "vitest";
import { shouldBytecode } from "./bytecode.mjs";

describe("shouldBytecode — Playwright serializable callbacks", () => {
  it("含页内函数序列化 API 的 chunk 不进 .jsc", () => {
    const serializerCalls = [
      `page.evaluate(() => "ok")`,
      `frame.evaluateHandle(() => document.body)`,
      `locator.evaluateAll((nodes) => nodes.length)`,
      `page.$eval("main", (node) => node.textContent)`,
      `page.$$eval("li", (nodes) => nodes.length)`,
      `page.waitForFunction(() => window.ready)`,
      `context.addInitScript(() => window.ready = true)`,
    ];
    for (const code of serializerCalls) {
      expect(shouldBytecode(code, "chunks/playwright-flow.js"), code).toBe(
        false,
      );
    }
  });

  it("普通业务 chunk 仍进入 .jsc，保护范围不被整体关闭", () => {
    expect(
      shouldBytecode(
        `export function score(input){ return input.value * 2; }`,
        "chunks/business-score.js",
      ),
    ).toBe(true);
  });
});
