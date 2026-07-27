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
  rmSync,
  existsSync,
  cpSync,
  mkdirSync,
} from "node:fs";
import { dirname, join, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";
import {
  walkTargets,
  classifyTransform,
  normalizeTransformPolicyPath,
  readTransformPolicy,
  transformCodeSha256,
} from "./obfuscate.mjs";

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
 * 纯函数兼容入口：在原始源码上计算字节码资格，或直接消费混淆前 policy entry。
 * 生产 runBytecode 只走后者，并同时校验混淆产物 hash；禁止扫描变形源码补猜。
 */
export function shouldBytecode(code, rel, policyEntry) {
  // 纯函数兼容入口只用于“仍是原始源码”的单测/规划；生产 runBytecode 必须传并验证
  // obfuscate 阶段落盘的 policy，不会调用这条源码重判分支。
  if (policyEntry) return policyEntry.bytecodeEligible === true;
  return classifyTransform(code, rel, "server").bytecodeEligible;
}

/**
 * [T-566] 最终 sidecar 产物自检：policy 说可字节码的必须是 stub+.jsc；
 * 所有需保留源码/rename-only/app route 则必须仍是 JS 且没有同名 .jsc。
 */
export function verifyBytecodePolicyArtifacts(root, policy = readTransformPolicy(root)) {
  if (!policy || policy.targetKind !== "server") {
    return [
      {
        rel: "<transform-policy>",
        error: "无法校验字节码产物：server transform policy 缺失或损坏",
      },
    ];
  }
  const failures = [];
  for (const [rel, entry] of Object.entries(policy.files)) {
    const abs = join(root, ...rel.split("/"));
    const jscAbs = abs.replace(/\.(js|cjs)$/, ".jsc");
    const jsExists = existsSync(abs);
    const code = jsExists ? readFileSync(abs, "utf8") : "";
    const isStub = code.includes(STUB_MARK);
    const jscExists = existsSync(jscAbs);
    if (entry.bytecodeEligible === true) {
      if (!jsExists || !isStub || !jscExists) {
        failures.push({
          rel,
          error: "policy 要求字节码化，但最终产物不是 stub + .jsc",
        });
      }
    } else if (!jsExists || isStub || jscExists) {
      failures.push({
        rel,
        error:
          "policy 要求保留 JavaScript 源码，但最终产物出现 bytecode stub 或 .jsc",
      });
    }
  }
  return failures;
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
  const policy = readTransformPolicy(root);
  if (!policy || policy.targetKind !== "server") {
    return {
      compiled: 0,
      skipped: 0,
      failures: [
        {
          rel: "<transform-policy>",
          error:
            "缺少有效的 server transform policy；拒绝从已混淆源码重新猜测字节码资格",
        },
      ],
    };
  }
  // 主线程读取并按 policy + 产物 hash 组装 worker 任务队列；worker 直接 compileFile。
  const tasks = [];
  let skipped = 0;
  const failures = [];
  // [T-462] 记录被跳过的 chunk(preset + 大小)—— 打包 log 里能一眼看到哪些 chunk 因含
  //   可序列化 callback 而保留 JS,防"下次 evaluate 崩了不知道是不是护栏漏"。
  const preservedForCallback = [];
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
    const key = normalizeTransformPolicyPath(rel);
    const policyEntry = policy.files[key];
    if (!policyEntry) {
      failures.push({
        rel,
        error: "transform policy 缺少当前文件，拒绝字节码化",
      });
      continue;
    }
    if (
      typeof policyEntry.transformedSha256 !== "string" ||
      policyEntry.transformedSha256 !== transformCodeSha256(code)
    ) {
      failures.push({
        rel,
        error: "transform policy 与当前混淆产物 hash 不匹配，拒绝字节码化",
      });
      continue;
    }
    if (!shouldBytecode(code, rel, policyEntry)) {
      const staleJsc = abs.replace(/\.(js|cjs)$/, ".jsc");
      if (existsSync(staleJsc)) rmSync(staleJsc);
      if (policyEntry.preserveFunctionSource === true) {
        preservedForCallback.push({ rel, size: code.length });
      }
      continue;
    }
    const jscAbs = abs.replace(/\.(js|cjs)$/, ".jsc");
    tasks.push({ abs, rel, jscAbs, jscBase: basename(jscAbs) });
  }
  if (preservedForCallback.length > 0) {
    console.log(
      `[bytecode] [T-459/T-462] 保留 ${preservedForCallback.length} 个 chunk 不字节码化(含 Playwright evaluate 等可序列化 callback):`,
    );
    for (const { rel, size } of preservedForCallback) {
      console.log(`[bytecode]   · ${rel} (${size} B)`);
    }
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
            await new Promise((resolve) => {
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

  if (failures.length === 0) {
    failures.push(...verifyBytecodePolicyArtifacts(root, policy));
  }

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
