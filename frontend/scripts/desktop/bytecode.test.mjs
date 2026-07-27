// [T-459] Bytenode 与 Playwright 函数序列化的兼容门。
// Playwright 会读取 callback.toString() 并在浏览器重建；进入 .jsc 后源码会变成
// Bytenode 占位字符，必须在字节码选择阶段硬排除。

import { describe, expect, it } from "vitest";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runBytecode, shouldBytecode } from "./bytecode.mjs";
import {
  classifyTransform,
  obfuscateCode,
  readTransformPolicy,
  runObfuscation,
} from "./obfuscate.mjs";

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

  // [T-462] 兜底护栏:rename-only 触发一切条件 → 都不字节码。
  //   ① 字面 require/import(rename-only 分档条件之二)。
  //   ② requiresSerializable(第一层已挡,但这里再验兜底逻辑本身)。
  //   防未来第一层护栏被绕(如打包后 chunk 内容漂移)时,第二层仍能兜住。
  it("含字面 require 的 rename-only chunk 也不进 .jsc(双护栏)", () => {
    // 含字面 require(动态 require)会被 pickPreset 判 rename-only;此时不上字节码。
    expect(
      shouldBytecode(
        `require('node:fs'); export function foo(){ return 1; }`,
        "chunks/dyn-require.js",
      ),
    ).toBe(false);
  });

  it("[T-566] Playwright chunk 经真实 rename-only 混淆后仍不得进 .jsc", () => {
    const original =
      `export async function run(page){ return page.evaluate(() => document.body.innerText); }`;
    const policyEntry = classifyTransform(
      original,
      "chunks/playwright-flow.js",
      "server",
    );
    const transformed = obfuscateCode(original, "rename-only");

    // javascript-obfuscator 会把 `.evaluate(` 改写成 `['evaluate'](`；资格来自
    // 混淆前 policy，不能再从 transformed 文本重算。
    expect(transformed).toContain("['evaluate']");
    expect(
      shouldBytecode(
        transformed,
        "chunks/playwright-flow.js",
        policyEntry,
      ),
    ).toBe(false);
  });

  it("[T-566] 真实 obfuscate→bytecode 工序保留 Playwright chunk 且不生成 .jsc", async () => {
    const root = mkdtempSync(join(tmpdir(), "creatoros-transform-policy-"));
    const chunks = join(root, "chunks");
    const target = join(chunks, "playwright-flow.js");
    mkdirSync(chunks, { recursive: true });
    writeFileSync(
      target,
      `export async function run(page){ return page.evaluate(() => document.body.innerText); }`,
      "utf8",
    );
    const previousSerial = process.env.CREATOROS_OBFUSCATE_SERIAL;
    process.env.CREATOROS_OBFUSCATE_SERIAL = "1";
    try {
      const obfuscation = await runObfuscation(root, "server");
      expect(obfuscation.failures).toEqual([]);

      const policy = readTransformPolicy(root);
      expect(policy?.files["chunks/playwright-flow.js"]).toMatchObject({
        preset: "rename-only",
        preserveFunctionSource: true,
        bytecodeEligible: false,
      });
      expect(readFileSync(target, "utf8")).toContain("['evaluate']");

      const bytecode = await runBytecode(root);
      expect(bytecode.failures).toEqual([]);
      expect(bytecode.compiled).toBe(0);
      expect(existsSync(join(chunks, "playwright-flow.jsc"))).toBe(false);
      expect(readFileSync(target, "utf8")).not.toContain(
        "creatoros-bytecode-stub",
      );
    } finally {
      if (previousSerial === undefined) {
        delete process.env.CREATOROS_OBFUSCATE_SERIAL;
      } else {
        process.env.CREATOROS_OBFUSCATE_SERIAL = previousSerial;
      }
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("[T-566] 缺少混淆前 policy 时 bytecode fail-closed", async () => {
    const root = mkdtempSync(join(tmpdir(), "creatoros-policy-missing-"));
    const chunks = join(root, "chunks");
    const target = join(chunks, "business.js");
    mkdirSync(chunks, { recursive: true });
    writeFileSync(target, `export const answer = 42;`, "utf8");
    try {
      const result = await runBytecode(root);
      expect(result.compiled).toBe(0);
      expect(result.failures[0]?.rel).toBe("<transform-policy>");
      expect(existsSync(join(chunks, "business.jsc"))).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("[T-566] policy 与混淆产物 hash 不一致时拒绝字节码化", async () => {
    const root = mkdtempSync(join(tmpdir(), "creatoros-policy-stale-"));
    const chunks = join(root, "chunks");
    const target = join(chunks, "business.js");
    mkdirSync(chunks, { recursive: true });
    writeFileSync(target, `export const answer = 42;`, "utf8");
    const previousSerial = process.env.CREATOROS_OBFUSCATE_SERIAL;
    process.env.CREATOROS_OBFUSCATE_SERIAL = "1";
    try {
      const obfuscation = await runObfuscation(root, "server");
      expect(obfuscation.failures).toEqual([]);
      writeFileSync(
        target,
        `${readFileSync(target, "utf8")}\n/* unexpected mutation */\n`,
        "utf8",
      );

      const result = await runBytecode(root);
      expect(result.compiled).toBe(0);
      expect(result.failures[0]?.error).toMatch(/hash 不匹配/);
      expect(existsSync(join(chunks, "business.jsc"))).toBe(false);
    } finally {
      if (previousSerial === undefined) {
        delete process.env.CREATOROS_OBFUSCATE_SERIAL;
      } else {
        process.env.CREATOROS_OBFUSCATE_SERIAL = previousSerial;
      }
      rmSync(root, { recursive: true, force: true });
    }
  });
});
