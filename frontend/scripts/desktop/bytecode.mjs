#!/usr/bin/env node
// [T-419 L3] V8 字节码化 —— 把 L1 混淆后的业务 chunk 编成 .jsc(bytenode),.js 换成加载 stub。
// SPEC: docs/research/2026-07-18-anti-reversing-defense-ladder-design.md §5。
//
// 落点(流水线):**obfuscate(L1)之后、tauri build 之前**跑(package.mjs 步 2.5)。顺序铁律
//   L1→L3:先 rc4 加密字符串(L1),再编字节码(L3)——反了字节码常量池就是明文串(V8 字节码
//   **不隐藏字符串**,只隐藏逻辑/控制流;字符串保密全靠 L1 的 rc4)。
//
// 版本铁律:V8 字节码与 node/V8 强绑定。sidecar 打包的 node = build-sidecar `copyFileSync(process.
//   execPath)` = **本机 node**(libnode.<NODE_MODULE_VERSION>.dylib 实证)。故**必须用跑本脚本的
//   同一 node 编译**(= 打包进 sidecar 的那个)。node 升级 → 必重编全部 .jsc(进 CI)。
//
// 靶:obfuscate 判为 **chunk-stringarray** 的 chunk(chunks/ 里无字面 require 的业务 chunk = 皇冠)。
//   排除:[turbopack]_runtime(chunk 加载器基础设施)、含字面 require/import 的 rename-only chunk
//   (bytecode 里 require 仍工作,但这些是 glue/动态解析,保守留 .js)、node_modules、app/** route
//   (加载路径与 chunks/ 不同,首波不动;chunks/ 业务逻辑收益最大)。
//
// turbopack 加载兼容:服务端 runtime 用 `require(chunkPath.js)` 加载 chunk(实测)。把 xxx.js 换成
//   stub(`require('bytenode'); module.exports = require('./xxx.jsc')`)→ turbopack require xxx.js →
//   跑 stub → bytenode 加载 xxx.jsc 字节码 → 返回真 `[id, factory]`(spike 实证结构一致)。
//   bytenode 无运行时第三方依赖(只用 v8/vm/module builtin),整包实拷进 sidecar node_modules。
//
// 诚实边界:字节码可被 V8 反汇编工具(View8 等)部分还原(无变量名、版本特定)——把「读混淆 JS」
//   抬到「逆 V8 字节码」,周级成本,非不可破(客户端天花板)。

import bytenode from "bytenode";
import {
  readFileSync,
  writeFileSync,
  copyFileSync,
  rmSync,
  existsSync,
  cpSync,
  mkdirSync,
} from "node:fs";
import { dirname, join, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { walkTargets, pickPreset } from "./obfuscate.mjs";

const FRONTEND = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SIDECAR = join(FRONTEND, "src-tauri", "sidecar");
const SERVER_DIR = join(SIDECAR, "frontend", ".next", "server");
const SIDECAR_FE_NODE_MODULES = join(SIDECAR, "frontend", "node_modules");
const HOST_BYTENODE = join(FRONTEND, "node_modules", "bytenode");

// stub 幂等标记(重跑跳过;正常一 build 一次)。
const STUB_MARK = "/* creatoros-bytecode-stub */";

/**
 * 生成 stub .js 内容:加载同名 .jsc 字节码,原样透传 module.exports([id, factory])。
 * bytenode require('bytenode') 注册 .jsc 扩展;require 相对 .jsc(同目录)。
 * @param {string} jscBase 同目录 .jsc 文件名(如 "ai-worker_src_runtime_1thr-z9._.jsc")
 */
export function makeStub(jscBase) {
  return `${STUB_MARK}\nrequire('bytenode');\nmodule.exports=require('./${jscBase}');\n`;
}

/**
 * 判该 target 是否该字节码化 = **chunks/ 里的全部业务 chunk**(chunk-stringarray + rename-only)。
 * [turbopack]_runtime / node_modules / wasm / .node 已被 walkTargets 的 shouldExclude 挡在 toObfuscate
 * 外,不会到这里。为何连 rename-only(含字面 require)也编:V8 字节码**保留 require**(不像 stringArray
 * 会编码模块名字面量崩)——字节码里的 `require("node:fs")` 运行时照常执行;且字节码本身藏源码 + 中文
 * 串按 UTF-16 存进常量池(UTF-8 grep 不到,spike 实证),把 rename-only chunk 里漏的 prompt 也盖掉。
 * app/** route(非 chunks/,full 预设)首波不动——加载路径与 chunks/ 不同,收益/风险后评。冒烟护栏兜底。
 */
export function shouldBytecode(code, rel) {
  const parts = rel.split(/[\\/]/).filter(Boolean);
  const preset = pickPreset(code, rel);
  return (
    parts.includes("chunks") &&
    (preset === "chunk-stringarray" || preset === "rename-only")
  );
}

/** 把 bytenode 整包实拷进 sidecar frontend/node_modules(stub 运行时 require 它)。 */
function bundleBytenode() {
  if (!existsSync(HOST_BYTENODE)) {
    throw new Error(
      `[bytecode] 本机未装 bytenode(${HOST_BYTENODE})——先 pnpm add -D bytenode。`,
    );
  }
  const dest = join(SIDECAR_FE_NODE_MODULES, "bytenode");
  mkdirSync(SIDECAR_FE_NODE_MODULES, { recursive: true });
  rmSync(dest, { recursive: true, force: true });
  cpSync(HOST_BYTENODE, dest, { recursive: true, dereference: true });
  console.log(`[bytecode]   ✂ bytenode 实拷 → ${dest}`);
}

/** 主流程(副作用):字节码化 SERVER_DIR 的 chunk-stringarray chunk。返回统计。
 *
 * [T-452] worker_threads 并行:每 worker 独立 V8 isolate,bytenode.compileFile 天然可并行。
 *   CREATOROS_BYTECODE_WORKERS 覆盖 worker 数(默认 min(6, cpu-2)),CREATOROS_BYTECODE_SERIAL=1
 *   强制串行(排障)。
 */
export async function runBytecode(root = SERVER_DIR) {
  const { toObfuscate } = walkTargets(root);
  // 主线程一次读+判 shouldBytecode,得到 worker 任务队列(worker 不读文件,直接 compileFile
  //   以路径为参数;bytenode 内部会自己 read)。
  const tasks = [];
  let skipped = 0;
  const failures = [];
  for (const { abs, rel } of toObfuscate) {
    let code;
    try {
      code = readFileSync(abs, "utf8");
    } catch (e) {
      failures.push({ rel, error: String(e) });
      continue;
    }
    if (code.startsWith(STUB_MARK)) {
      skipped++;
      continue;
    }
    if (!shouldBytecode(code, rel)) continue;
    const jscAbs = abs.replace(/\.(js|cjs)$/, ".jsc");
    tasks.push({ abs, rel, jscAbs, jscBase: basename(jscAbs) });
  }

  const shouldSerial = process.env.CREATOROS_BYTECODE_SERIAL === "1";
  let compiled = 0;
  if (shouldSerial) {
    for (const t of tasks) {
      try {
        bytenode.compileFile({ filename: t.abs, output: t.jscAbs });
        writeFileSync(t.abs, makeStub(t.jscBase), "utf8");
        compiled++;
      } catch (e) {
        if (existsSync(t.jscAbs)) {
          try {
            rmSync(t.jscAbs);
          } catch {
            /* noop */
          }
        }
        failures.push({ rel: t.rel, error: e instanceof Error ? e.message : String(e) });
      }
    }
  } else {
    const os = await import("node:os");
    const envWorkers = Number.parseInt(process.env.CREATOROS_BYTECODE_WORKERS ?? "", 10);
    const workerCount = Number.isFinite(envWorkers) && envWorkers > 0
      ? envWorkers
      : Math.max(1, Math.min(6, os.cpus().length - 2));
    console.log(`[bytecode] worker pool: ${workerCount} 个 worker × ${tasks.length} 任务`);

    const shards = Array.from({ length: workerCount }, () => []);
    tasks.forEach((t, i) => shards[i % workerCount].push(t));

    const workerScript = new URL("./bytecode.worker.mjs", import.meta.url);
    await Promise.all(
      shards.map(async (shard) => {
        if (shard.length === 0) return;
        const { Worker } = await import("node:worker_threads");
        const worker = new Worker(workerScript);
        try {
          for (const task of shard) {
            await new Promise((resolve, reject) => {
              const onMsg = (msg) => {
                if (msg.status === "ok") compiled++;
                else failures.push({ rel: task.rel, error: msg.error });
                worker.off("message", onMsg);
                worker.off("error", onErr);
                resolve();
              };
              const onErr = (err) => {
                worker.off("message", onMsg);
                worker.off("error", onErr);
                failures.push({ rel: task.rel, error: err.message ?? String(err) });
                resolve();
              };
              worker.on("message", onMsg);
              worker.on("error", onErr);
              worker.postMessage({
                abs: task.abs,
                jscAbs: task.jscAbs,
                jscBase: task.jscBase,
                stubMark: STUB_MARK,
              });
            });
          }
        } finally {
          await worker.terminate();
        }
      }),
    );
  }

  if (compiled > 0) bundleBytenode();

  return { compiled, skipped, failures };
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI 入口。
// ─────────────────────────────────────────────────────────────────────────────
function isMain() {
  return process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

if (isMain()) {
  console.log("[bytecode] ▶ L3 V8 字节码化开始(L1 混淆后的业务 chunk)。");
  console.log(`[bytecode]   靶目录: ${SERVER_DIR}`);
  console.log(`[bytecode]   编译 node: ${process.execPath}(${process.version}, modules=${process.versions.modules})`);

  // [T-452] runBytecode 现在是 async(内部 worker pool);ESM 顶层 await。
  const stat = await runBytecode();

  console.log(
    `[bytecode] ✅ 字节码化 ${stat.compiled} 个 chunk → .jsc + stub` +
      (stat.skipped ? ` · 幂等跳过 ${stat.skipped}` : ""),
  );
  if (stat.failures.length) {
    console.warn(`[bytecode] ⚠️ ${stat.failures.length} 个 chunk 编译失败(保原 .js,仍受 L1 保护):`);
    for (const f of stat.failures.slice(0, 10)) {
      console.warn(`[bytecode]     ✗ ${f.rel}: ${f.error}`);
    }
    // 失败即 fail-fast:字节码化不该有编不过的(编译器吃不下=可能更深问题);别静默半做。
    process.exit(1);
  }
}
