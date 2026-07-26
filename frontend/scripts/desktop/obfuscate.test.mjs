// [T-147 P6 / T-164] obfuscate.mjs 决策单测 —— SPEC §5「混淆」。
// 纯函数化的决策(shouldExclude / isSymlinkEscape / pickPreset / obfuscateCode)单测,
// 不端到端(端到端的真起 sidecar 走 package.mjs --smoke / CI)。
//
// 覆盖:
//   - 排除规则命中 server.js / node_modules / wasm / node;first-party chunk 不排除。
//   - symlink 逃逸:symlink 本体 → 跳过;realpath 落在 .pnpm/node_modules → 跳过;真 first-party → 不跳。
//   - pickPreset:含 require(<字面量>)/import(<字面量>) → rename-only;纯逻辑 → full。
//   - obfuscateCode:rename-only 不编码字符串字面量(保 require 参数);full 会改标识符。

import { describe, it, expect } from "vitest";
import {
  shouldExclude,
  isSymlinkEscape,
  requiresSerializableFunctionSource,
  pickPreset,
  obfuscateCode,
  FULL_OPTIONS,
  RENAME_ONLY_OPTIONS,
} from "./obfuscate.mjs";

describe("shouldExclude(硬排除 §3.1 ①②③)", () => {
  it("排除 server.js 入口", () => {
    expect(shouldExclude("frontend/server.js")).toMatch(/server\.js 入口/);
    expect(shouldExclude("server.js")).toMatch(/server\.js 入口/);
  });

  it("排除 node_modules 下任意层第三方", () => {
    expect(shouldExclude("chunks/node_modules/ai/dist/index.js")).toMatch(/node_modules/);
    expect(shouldExclude("node_modules/next/x.js")).toMatch(/node_modules/);
    expect(shouldExclude("a/b/node_modules/c/d.js")).toMatch(/node_modules/);
  });

  it("排除 wasm / native .node", () => {
    expect(shouldExclude("chunks/postgres.wasm")).toMatch(/wasm/);
    expect(shouldExclude("app/foo.node")).toMatch(/native/);
  });

  it("[T-164 真机踩点] 排除 turbopack runtime chunk 加载器", () => {
    expect(shouldExclude("chunks/[turbopack]_runtime.js")).toMatch(/Turbopack server runtime/);
    expect(shouldExclude("chunks/ssr/[turbopack]_runtime.js")).toMatch(/Turbopack server runtime/);
  });

  it("不排除普通 first-party chunk / app .js(它们走 rename-only,不是排除)", () => {
    expect(shouldExclude("chunks/1234.js")).toBeNull();
    expect(shouldExclude("app/api/chat/route.js")).toBeNull();
    expect(shouldExclude("middleware.js")).toBeNull();
  });
});

describe("isSymlinkEscape(§3.1 🔴 symlink 逃逸)", () => {
  const mkFs = ({ isLink = false, realPath = "/x", lstatThrows = false, realThrows = false }) => ({
    lstatSync: () => {
      if (lstatThrows) throw new Error("ENOENT");
      return { isSymbolicLink: () => isLink };
    },
    realpathSync: () => {
      if (realThrows) throw new Error("ELOOP");
      return realPath;
    },
  });

  it("symlink 本体 → 跳过(绝不跟随写)", () => {
    expect(isSymlinkEscape("/s/frontend/node_modules/next", mkFs({ isLink: true }))).toBe(true);
  });

  it("非 symlink 但 realpath 落在 .pnpm → 跳过", () => {
    expect(
      isSymlinkEscape("/s/x.js", mkFs({ isLink: false, realPath: "/repo/node_modules/.pnpm/next@1/x.js" })),
    ).toBe(true);
  });

  it("非 symlink 但 realpath 落在 node_modules → 跳过", () => {
    expect(
      isSymlinkEscape("/s/x.js", mkFs({ isLink: false, realPath: "/repo/node_modules/next/x.js" })),
    ).toBe(true);
  });

  it("真 first-party real file(不在 node_modules/.pnpm)→ 不跳过", () => {
    expect(
      isSymlinkEscape("/s/x.js", mkFs({ isLink: false, realPath: "/s/frontend/.next/server/chunks/1.js" })),
    ).toBe(false);
  });

  it("lstat 失败(dangling)→ 保守跳过", () => {
    expect(isSymlinkEscape("/s/dangling", mkFs({ lstatThrows: true }))).toBe(true);
  });

  it("realpath 失败(ELOOP)→ 保守跳过", () => {
    expect(isSymlinkEscape("/s/x.js", mkFs({ isLink: false, realThrows: true }))).toBe(true);
  });
});

describe("pickPreset(§3.1 gate ③ 动态 require 降级 + turbopack chunk 路径降级)", () => {
  it("[T-459] Playwright 页内回调必须保留可序列化源码 → rename-only", () => {
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
      expect(requiresSerializableFunctionSource(code), code).toBe(true);
      expect(pickPreset(code, "chunks/playwright-flow.js"), code).toBe(
        "rename-only",
      );
    }
    expect(requiresSerializableFunctionSource(`Promise.resolve("ok")`)).toBe(
      false,
    );
  });

  it("含 require(<字面量>) → rename-only", () => {
    expect(pickPreset(`const fs = require("node:fs");`)).toBe("rename-only");
    expect(pickPreset(`const s = require('@aws-sdk/client-s3-abc');`)).toBe("rename-only");
  });

  it("含 import(<字面量>) 动态 import → rename-only", () => {
    expect(pickPreset(`await import("./chunk-123.js");`)).toBe("rename-only");
  });

  it("require(变量) 不算(混淆不碰字符串就安全)→ full", () => {
    expect(pickPreset(`const m = mods[name]; require(m);`)).toBe("full");
  });

  it("纯逻辑无字面 require 且不在 chunks/ → full", () => {
    expect(pickPreset(`export function add(a,b){ return a+b; }`, "app/api/x/route.js")).toBe("full");
  });

  it("[T-417 L1] chunks/ 无字面 require → chunk-stringarray(rc4 加密业务串);有字面 require → rename-only", () => {
    // 突破旧「chunks 一律 rename-only」结论:业务 chunk 模块 ID/引用是**数字**(e.i(958148)),
    // 无 chunk 路径互链字符串,rc4 stringArray + reservedStrings 排除 turbopack glue 后运行时不崩
    // (smoke + 11 路由 + stderr 无 ChunkLoadError 实证)。含字面 require/import 的 chunk 仍降 rename-only。
    expect(pickPreset(`export const x = 1;`, "chunks/abcd.js")).toBe("chunk-stringarray");
    expect(pickPreset(`const y = 2;`, "chunks/ssr/some-chunk._.js")).toBe("chunk-stringarray");
    // 含字面 require/import 的 chunk → 仍 rename-only(编码模块名字面量会崩)。
    expect(pickPreset(`await import("./chunk-123.js");`, "chunks/x.js")).toBe("rename-only");
    expect(pickPreset(`const fs=require("node:fs");`, "chunks/ssr/y._.js")).toBe("rename-only");
  });

  it("relPath 缺省时退回字面量正则(向后兼容)", () => {
    expect(pickPreset(`require("x");`)).toBe("rename-only");
    expect(pickPreset(`const a=1;`)).toBe("full");
  });
});

describe("obfuscateCode(preset 落到不同强度)", () => {
  it("full 档:局部标识符被混淆、字符串进 stringArray、产出可解析", () => {
    const src = `function calcRubricScore(weights, signals){ let total = 0; for (const k of Object.keys(weights)) total += weights[k]*signals[k]; return total; }`;
    const out = obfuscateCode(src, "full");
    // renameGlobals:false → 顶层函数名保留;但局部变量(weights/total)必被改成 hex 标识符。
    expect(out).not.toContain("weights"); // 局部参数被混淆
    expect(out).not.toContain("total");
    expect(out).toMatch(/_0x[0-9a-f]+/); // hexadecimal identifier 生效
    // 混淆产物仍是合法 JS(能被 Function 构造器解析)。
    expect(() => new Function(out)).not.toThrow();
  });

  it("rename-only 档:不编码字符串字面量(保 require 参数)、不 controlFlowFlatten", () => {
    const src = `function x(){ const fs = require("node:fs"); return fs; }`;
    const out = obfuscateCode(src, "rename-only");
    // rename-only 关 stringArray → require 的 "node:fs" 字面量必须原样保留(否则运行时崩)。
    // 混淆器会规范化引号(" → '),故断言字面量内容而非引号形式。
    expect(out).toMatch(/require\((['"])node:fs\1\)/);
    // 且未被 stringArray 拆成 _0x...(idx) 形式。
    expect(out).not.toMatch(/require\(_0x[0-9a-f]+\(/);
    expect(() => new Function(out)).not.toThrow();
  });

  it("[T-459] Playwright callback 经 rename-only 后仍是独立可解析函数", () => {
    const src = `function run(page){ return page.evaluate(async (url) => { const response = await fetch(url, { credentials: "include" }); return response.json(); }, "https://example.com/data"); }`;
    const out = obfuscateCode(src, "rename-only");
    let captured;
    const run = new Function(
      "page",
      `${out}; return run(page);`,
    );
    run({
      evaluate(fn) {
        captured = fn;
      },
    });
    const callbackSource = Function.prototype.toString.call(captured);
    expect(() => new Function(`(${callbackSource})`)).not.toThrow();
    expect(callbackSource).toContain("include");
  });

  it("preset 常量档位正确(防误配)", () => {
    expect(FULL_OPTIONS.stringArray).toBe(true);
    expect(FULL_OPTIONS.controlFlowFlattening).toBe(true);
    expect(FULL_OPTIONS.selfDefending).toBe(false);
    expect(FULL_OPTIONS.debugProtection).toBe(false);
    expect(FULL_OPTIONS.renameGlobals).toBe(false);
    expect(RENAME_ONLY_OPTIONS.stringArray).toBe(false);
    expect(RENAME_ONLY_OPTIONS.controlFlowFlattening).toBe(false);
  });
});

describe("[T-544 client] WKWebView 安全的 client static chunks 混淆", () => {
  it("client turbopack 运行时 turbopack-<hash>.js 被硬排除(碰坏 chunk 加载)", () => {
    expect(shouldExclude("chunks/turbopack-1yotr_13s-5mt.js")).toMatch(/client runtime/);
    expect(shouldExclude("static/chunks/turbopack-abc.js")).toMatch(/client runtime/);
  });
  it("client 业务 chunk(static/chunks/<hash>.js)不被排除", () => {
    expect(shouldExclude("static/chunks/1_g9h2qn8jscx.js")).toBeNull();
  });
  it("client 业务 chunk 强制走 rename-only，不执行 RC4 stringArray", () => {
    // macOS 真机证明：RC4 stringArray 会让 WKWebView 的 JavaScriptCore 长时间高负载，
    // hydration 永远停在骨架屏。客户端 chunk 必须保留 Next/Turbopack 可直接执行形态。
    const clientChunk = '(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push([document.currentScript,695816,e=>{var t=e.i(302524);}]);';
    // 真实打包以 `.next/static` 为遍历根，传给 pickPreset 的相对路径只有 `chunks/...`。
    expect(pickPreset(clientChunk, "chunks/1_g9h2qn8jscx.js", "client")).toBe("rename-only");
  });
  it("含 static/chunks/ 路径串的 client chunk 仍强制走 rename-only", () => {
    const withPath = 'e.push(["static/chunks/22r33t9q3kaf3.js"]);var x="license";';
    expect(pickPreset(withPath, "chunks/213zzjvt-0azo.js", "client")).toBe("rename-only");
  });
  it("server chunks 继续保留 chunk-stringarray 防护", () => {
    expect(
      pickPreset(
        "export const internalPrompt = 'server-only-secret';",
        "chunks/ssr/213zzjvt-0azo.js",
        "server",
      ),
    ).toBe("chunk-stringarray");
  });
});
