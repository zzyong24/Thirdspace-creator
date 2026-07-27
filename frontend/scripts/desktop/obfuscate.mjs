#!/usr/bin/env node
// [T-147 P6 / T-164] sidecar bundle JS 混淆 —— 抬业余逆向门槛 + 防篡改重打包。
// SPEC: docs/superpowers/specs/2026-07-06-desktop-hardening-p6-design.md §3.1。
//
// 落点(流水线):build-sidecar 之后、tauri build 之前跑,原地混淆 sidecar 目录里的
//   first-party .next/server JS。改业务代码后零手动重做(desktop:package 自动串)。
//
// 靶目录 = src-tauri/sidecar/frontend/.next/server/**/*.js(含 chunks/** + app/**)。
//   Next/Turbopack 已把 first-party 应用代码(@creatoros/* + app + traced 的
//   backend/ai-runtime 逻辑)编译内联进这批 chunk —— 真资产 prompt/rubric/编排就在里面。
//
// 硬排除(provably 碰坏,跳过 + log 原因):
//   ① **/server.js 入口 —— 头部硬依赖 __dirname/process.chdir/require('next') 字面量,混淆必崩。
//   ② node_modules/** 全部第三方(含 serverExternalPackages external 化的 ai/@ai-sdk/pglite/pg)。
//   ③ **/*.wasm(pglite postgres.wasm)、**/*.node(fsevents/sharp/onnxruntime native 绑定)。
//
// 🔴 symlink 逃逸防护(P1 verbatimSymlinks 保留 pnpm 相对 symlink,如
//   frontend/node_modules/next → ../../node_modules/.pnpm/...)。遍历时 lstatSync 判 symlink →
//   跳过;realpathSync 若落在任何 node_modules/.pnpm 下 → 跳过。**绝不跟随 symlink 写**
//   (否则污染 .pnpm store 里真实第三方包,把「排除 node_modules」从后门破掉)。
//
// 动态 require 字符串保护(gate ③):含 require(<字面量>) / import(<字面量>) 的文件降级为
//   **rename-only**(关 stringArray/controlFlowFlattening,只做 identifier rename)——否则
//   Turbopack 内联的模块名(如 require("node:fs") / require("@aws-sdk/client-s3-<hash>"))
//   若被 stringArray base64 编码 → 运行时 require 崩。其余纯逻辑文件走 medium-conservative 全强度。
//
// 诚实边界(§3.1 诚实口径):混淆覆盖 .next/server chunk 里的 first-party 编排/prompt/rubric;
//   ai/@ai-sdk/* 因 serverExternalPackages 留 node_modules 明文、不被覆盖(SDK 本体无自有资产)。

import JavaScriptObfuscator from "javascript-obfuscator";
import {
  lstatSync,
  realpathSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const FRONTEND = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
// SIDECAR 可经 env 覆盖(测试/浏览器冒烟指向 standalone 副本;正式打包不设 → 默认 src-tauri/sidecar)。
const SIDECAR = process.env.CREATOROS_OBFUSCATE_SIDECAR
  ? resolve(process.env.CREATOROS_OBFUSCATE_SIDECAR)
  : join(FRONTEND, "src-tauri", "sidecar");
// 混淆靶目录①:standalone 里的 Next **server** 编译产物(之后再被 bytecode 化)。
const SERVER_DIR = join(SIDECAR, "frontend", ".next", "server");
// 混淆靶目录②:[T-417 client] Next **client** 静态 chunks(`static/chunks/*.js`)—— 浏览器执行、无法字节码化,
//   此前只 minify 未混淆 = **前端源码可一键还原的裸奔缺口**。同款 chunk-stringarray(数字模块 ID 不受
//   影响,reservedStrings 已含 `chunks/`/`\.js$` 护住加载串);client turbopack 运行时另行硬排除。
const CLIENT_DIR = join(SIDECAR, "frontend", ".next", "static");

// [T-566] 混淆前的安全决策必须跨工序保存。bytecode.mjs 只消费这份清单，
// 不得再从 javascript-obfuscator 已经改写过的源码猜测 Playwright callback。
export const TRANSFORM_POLICY_FILENAME = ".creatoros-transform-policy.json";
export const TRANSFORM_POLICY_FORMAT_VERSION = 1;

// ─────────────────────────────────────────────────────────────────────────────
// 纯函数化的决策(单测直接测,不必端到端)。
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 硬排除判据(§3.1 硬排除 ①②③)。返回排除原因字符串(逐类),不排除返回 null。
 * @param {string} relPath —— 相对靶目录规范化后的路径(用 posix `/` 或平台 sep 均可,内部按 sep 拆)。
 */
export function shouldExclude(relPath) {
  // 统一成 posix 段比较(测试可传 posix 路径)。
  const parts = relPath.split(/[\\/]/).filter(Boolean);
  const base = parts[parts.length - 1] ?? "";

  // ③ 二进制资产:wasm / native node 绑定。
  if (base.endsWith(".wasm")) return "wasm 二进制(pglite postgres.wasm 等)";
  if (base.endsWith(".node")) return "native .node 绑定(fsevents/sharp/onnxruntime)";

  // 只混淆 .js;其余(.json/.map/.cjs 之外的)不动。.cjs 也纳入 .js 同类处理(下方 walk 已筛)。
  // ① server.js 入口:头部硬 __dirname/process.chdir/require('next') 字面量。
  if (base === "server.js") return "server.js 入口(硬 __dirname/process.chdir/require('next'))";

  // ② node_modules 全部第三方(路径任意层出现 node_modules 即排除)。
  if (parts.includes("node_modules")) return "node_modules 第三方(external 化的 ai/@ai-sdk/pglite/pg 等)";

  // ④ [T-164 真机踩点] Turbopack chunk 加载器核心 —— `[turbopack]_runtime.js` 是 chunk
  //    loadChunkAsync/模块注册表的运行时基础设施,任何混淆(连 rename 都风险)都会破坏 chunk
  //    间加载(实测:混淆后 ChunkLoadError「Unexpected token '['」)。SPEC §4「默认排除 Next
  //    自身 runtime chunk」授权 → 硬排除。
  if (/\[turbopack\]_runtime\.js$/.test(base)) return "Turbopack server runtime chunk 加载器(碰坏 chunk 加载,SPEC §4 排除)";
  // [T-417 client] client 侧 turbopack 运行时:`static/chunks/turbopack-<hash>.js`,含 otherChunks/loadChunk/
  //   registerChunk 的浏览器 chunk 加载器 —— 混淆碰坏 chunk 加载(白屏)。硬排除(业务 chunk 全 `<hash>.js`,
  //   仅运行时带 `turbopack-` 前缀,可靠区分)。
  if (/^turbopack-.*\.js$/.test(base)) return "Turbopack client runtime chunk 加载器(otherChunks/loadChunk,碰坏 chunk 加载)";

  return null;
}

/**
 * symlink 逃逸判据(§3.1 🔴)。目标是 symlink、或 realpath 落在任何 node_modules/.pnpm 下 → true(跳过)。
 * lstat/realpath 通过注入的 fs 门面调用,便于单测 mock。
 * @param {string} absPath 绝对路径
 * @param {{lstatSync:Function, realpathSync:Function}} fsdep
 */
export function isSymlinkEscape(absPath, fsdep = { lstatSync, realpathSync }) {
  let st;
  try {
    st = fsdep.lstatSync(absPath);
  } catch {
    // lstat 失败(dangling 等)→ 保守跳过(算逃逸,绝不写)。
    return true;
  }
  if (st.isSymbolicLink()) return true; // 是 symlink,绝不跟随写。

  // 即便不是 symlink 本体,realpath 若落在 node_modules/.pnpm(经上层 symlink 目录进来)→ 跳过。
  let real;
  try {
    real = fsdep.realpathSync(absPath);
  } catch {
    return true;
  }
  const segs = real.split(sep);
  if (segs.includes("node_modules") || segs.includes(".pnpm")) return true;
  return false;
}

/**
 * [T-459] Playwright 等浏览器自动化 API 会把传入函数 `toString()` 后发送到页面上下文。
 * stringArray 会把 callback 内字面量改写成对 chunk 外部 decoder 的闭包引用；即使语法仍合法，
 * 到浏览器里也会因 decoder 不存在而崩。Bytenode 还会让函数 `toString()` 只剩占位字符。
 * 命中这些「必须保留函数源码」的 API 时，混淆只能走 rename-only，且 bytecode.mjs 会硬排除。
 */
export function requiresSerializableFunctionSource(code) {
  const method =
    String.raw`(?:evaluate|evaluateAll|evaluateHandle|waitForFunction|addInitScript|\$\$?eval)`;
  return new RegExp(
    String.raw`(?:\.${method}|\[\s*["']${method}["']\s*\])\s*\(`,
  ).test(code);
}

/**
 * 决定文件用哪档混淆。rename-only(不碰字符串/控制流)当以下任一命中:
 *   ① 浏览器端 `static/chunks/**` —— [T-544 macOS 真机] RC4 stringArray 会让 WKWebView
 *      的 JavaScriptCore 持续高负载，React hydration 永久停在骨架屏。客户端 chunk 必须走
 *      rename-only；服务端 `server/chunks/**` 仍可保留 chunk-stringarray。
 *   ② 含 require(<字面量>) / import(<字面量>) —— 动态 require 的模块名字面量若被编码 → 崩。
 * 其余(app/** 等 first-party route handler,无 turbopack chunk 互链 + 无字面 require)→ full。
 *
 * @param {string} code 文件内容
 * @param {string} [relPath] 相对靶目录路径(判 chunks/)
 * @param {"server"|"client"} [targetKind] 当前遍历靶目录；真实 client 根是 `.next/static`，
 *   所以相对路径只有 `chunks/**`，不能靠 relPath 猜测运行环境。
 * @returns {"rename-only"|"full"}
 */
export function pickPreset(code, relPath = "", targetKind = "server") {
  const parts = relPath.split(/[\\/]/).filter(Boolean);
  const dynLiteral = /(?:require|import)\s*\(\s*["'`]/;
  const hasDynLiteral = dynLiteral.test(code);
  // [T-459] 必须在 chunks/stringArray 判定之前拦截，保住 pageFunction 的独立源码。
  if (requiresSerializableFunctionSource(code)) return "rename-only";
  // [T-544] 浏览器端 chunks 在 WKWebView 下不得执行 RC4 stringArray。
  // targetKind 由遍历根显式传入；真实相对路径是 `chunks/**`，与 server chunk 同形。
  if (targetKind === "client" && parts[0] === "chunks") {
    return "rename-only";
  }
  // turbopack server chunk 树(chunks/ 或 chunks/ssr/ 下):
  //    · 含字面 require/import → rename-only(编码模块名字面量会 ChunkLoadError)。
  //    · 否则 → [T-417 L1] chunk-stringarray:rc4 加密**业务字符串**(prompt/端点),reservedStrings
  //      排除 turbopack glue(指令前缀 / chunks 路径 / __next / node: / .js 后缀);模块 ID 与引用是
  //      **数字**(`e.i(958148)`),stringArray 天然不碰 → 互链不断。突破旧「chunks 必整体 rename-only」
  //      结论(那是把整棵树一刀切;实测业务 chunk 无 chunk 路径互链字符串,可精确加密)。**冒烟护栏兜底**。
  if (parts.includes("chunks")) {
    return hasDynLiteral ? "rename-only" : "chunk-stringarray";
  }
  // ② 非 chunks 但含字面 require/import → rename-only;否则 full。
  return hasDynLiteral ? "rename-only" : "full";
}

/** 将跨平台相对路径固定为 manifest 的 POSIX key。 */
export function normalizeTransformPolicyPath(relPath) {
  return relPath.replaceAll("\\", "/");
}

/** policy 与实际混淆产物绑定，防旧清单/错目录被静默复用。 */
export function transformCodeSha256(code) {
  return createHash("sha256").update(code).digest("hex");
}

/**
 * 在源码仍未变形时一次性决定混淆档位与字节码资格。
 * 后续工序只允许消费该结果，不得重新扫描已混淆文本。
 */
export function classifyTransform(code, relPath, targetKind = "server") {
  const rel = normalizeTransformPolicyPath(relPath);
  const preset = pickPreset(code, rel, targetKind);
  const preserveFunctionSource = requiresSerializableFunctionSource(code);
  const parts = rel.split("/").filter(Boolean);
  return {
    preset,
    preserveFunctionSource,
    bytecodeEligible:
      targetKind === "server" &&
      parts.includes("chunks") &&
      preset === "chunk-stringarray" &&
      !preserveFunctionSource,
    sourceSha256: transformCodeSha256(code),
  };
}

/** 读取并做最小结构校验；缺失/损坏返回 null，由消费方 fail-closed。 */
export function readTransformPolicy(root) {
  try {
    const parsed = JSON.parse(
      readFileSync(join(root, TRANSFORM_POLICY_FILENAME), "utf8"),
    );
    if (
      parsed?.formatVersion !== TRANSFORM_POLICY_FORMAT_VERSION ||
      (parsed.targetKind !== "server" && parsed.targetKind !== "client") ||
      parsed.files === null ||
      typeof parsed.files !== "object" ||
      Array.isArray(parsed.files)
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 混淆 preset(§3.1 强度档)。
// ─────────────────────────────────────────────────────────────────────────────

/** full 档 = medium-conservative 全强度(§3.1)。 */
export const FULL_OPTIONS = Object.freeze({
  compact: true,
  renameGlobals: false,
  identifierNamesGenerator: "hexadecimal",
  stringArray: true,
  stringArrayEncoding: ["base64"],
  stringArrayThreshold: 0.6, // 调低:少碰字面量,降低误伤动态 require 的概率(纯逻辑文件才走这档)。
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.5,
  deadCodeInjection: false,
  selfDefending: false, // Node 下会崩,禁。
  debugProtection: false, // 同上。
  disableConsoleOutput: false,
  // 保留模块字面量不进 stringArray(双保险:full 只作用于无字面 require 的文件,这里再兜一层)。
  reservedStrings: ["^next", "^@creatoros", "^\\./", "^\\.\\./", "^node:"],
});

/**
 * [T-417 L1] chunk-stringarray 档 = 业务 chunk 字符串 rc4 加密(挡 grep prompt/端点),但**严格
 * 排除 turbopack glue 字符串**(否则 ChunkLoadError)。用于 chunks/ 里**不含字面 require/import**的
 * 业务 chunk。诚实边界:javascript-obfuscator 不编码模板字面量静态段 + 对象属性键 → 部分残留;
 * 只加密常规字符串字面量 = 部分加密,抬 grep 门槛非城墙(完全加密须 L3 字节码)。controlFlow 关
 * (降 turbopack 互链风险)。threshold 0.75(1.0 会把更多 turbopack 关键串卷进 stringArray,抬崩险)。
 * 诚实边界:`"use strict"` 指令前缀可能被编码(reservedStrings 对 Directive 节点不总生效)——编译
 * 产物 sloppy mode 亦可运行(smoke + 11 路由 + stderr 无 ChunkLoadError 实证);真机四主链为最终验收。
 */
export const CHUNK_STRINGARRAY_OPTIONS = Object.freeze({
  compact: true,
  renameGlobals: false,
  identifierNamesGenerator: "hexadecimal",
  stringArray: true,
  stringArrayEncoding: ["rc4"],
  stringArrayThreshold: 0.75,
  controlFlowFlattening: false,
  deadCodeInjection: false,
  selfDefending: false,
  debugProtection: false,
  disableConsoleOutput: false,
  // reservedStrings:turbopack/Next 互链与指令前缀,绝不进 stringArray(编码即崩)。
  reservedStrings: [
    "^use strict$",
    "^use client$",
    "^use server$",
    "chunks/",
    "^__next",
    "^__NEXT",
    "^__turbopack",
    "^node:",
    "\\.js$",
    "\\.node$",
    "\\.wasm$",
  ],
});

/** rename-only 档 = 只 identifier rename,不碰字符串/控制流(§3.1 gate ③ 降级)。 */
export const RENAME_ONLY_OPTIONS = Object.freeze({
  compact: true,
  renameGlobals: false,
  identifierNamesGenerator: "hexadecimal",
  stringArray: false,
  controlFlowFlattening: false,
  deadCodeInjection: false,
  selfDefending: false,
  debugProtection: false,
  disableConsoleOutput: false,
});

/**
 * 混淆单个文件内容(纯函数,便于测)。返回混淆后代码。
 * @param {string} code
 * @param {"rename-only"|"full"} preset
 */
export function obfuscateCode(code, preset) {
  const opts =
    preset === "rename-only"
      ? RENAME_ONLY_OPTIONS
      : preset === "chunk-stringarray"
        ? CHUNK_STRINGARRAY_OPTIONS
        : FULL_OPTIONS;
  return JavaScriptObfuscator.obfuscate(code, opts).getObfuscatedCode();
}

// 幂等标记:混淆后写入的文件头带此标记,重跑跳过(sidecar 每次 build 重建 → 天然从干净源混淆;
// 但同一 build 内误重跑也不叠加)。
const IDEMPOTENT_MARK = "/* creatoros-obfuscated */";

// ─────────────────────────────────────────────────────────────────────────────
// 遍历 + 混淆(副作用)。
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 递归收集靶目录下所有 real regular .js 文件(跳过 symlink 逃逸)。返回 {toObfuscate, excluded}。
 * @param {string} root 靶目录(SERVER_DIR)
 */
export function walkTargets(root) {
  const toObfuscate = []; // { abs, rel }
  const excluded = []; // { rel, reason }

  function recur(dir) {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      const abs = join(dir, ent.name);
      const rel = abs.slice(root.length + 1);

      // symlink 逃逸:是 symlink 或 realpath 落在 node_modules/.pnpm → 跳过(目录/文件都判)。
      if (ent.isSymbolicLink() || isSymlinkEscape(abs)) {
        excluded.push({ rel, reason: "symlink 逃逸(绝不跟随,防污染 .pnpm store)" });
        continue;
      }

      let st;
      try {
        st = lstatSync(abs);
      } catch {
        continue;
      }

      if (st.isDirectory()) {
        recur(abs);
        continue;
      }
      if (!st.isFile()) continue;

      // 硬排除(server.js / node_modules / wasm / node)。
      const exReason = shouldExclude(rel);
      if (exReason) {
        // 只对我们本来会处理的类别 log(.js/.cjs/.wasm/.node/server.js);其余静默跳过。
        if (/\.(js|cjs|wasm|node)$/.test(ent.name) || ent.name === "server.js") {
          excluded.push({ rel, reason: exReason });
        }
        continue;
      }

      // 只混淆 .js / .cjs。
      if (!/\.(js|cjs)$/.test(ent.name)) continue;

      toObfuscate.push({ abs, rel });
    }
  }

  recur(root);
  return { toObfuscate, excluded };
}

/**
 * [T-566] 在任何文件被混淆前生成本轮 transform policy。
 *
 * 幂等重跑只能复用“路径 + 当前产物 hash”都匹配的旧条目；若文件已经带混淆标记却
 * 没有可信旧清单，说明已经失去混淆前证据，必须 fail-closed，不能凭变形文本补猜。
 */
function planTransformPolicy(root, toObfuscate, targetKind) {
  const existing = readTransformPolicy(root);
  const files = {};
  const failures = [];
  for (const { abs, rel } of toObfuscate) {
    const key = normalizeTransformPolicyPath(rel);
    let code;
    try {
      code = readFileSync(abs, "utf8");
    } catch (error) {
      failures.push({ rel, error: String(error) });
      continue;
    }
    if (code.startsWith(IDEMPOTENT_MARK)) {
      const prior = existing?.targetKind === targetKind
        ? existing.files?.[key]
        : null;
      if (
        !prior ||
        prior.transformedSha256 !== transformCodeSha256(code)
      ) {
        failures.push({
          rel,
          error:
            "文件已混淆但缺少匹配的混淆前 transform policy，拒绝从变形源码重建字节码资格",
        });
        continue;
      }
      files[key] = prior;
      continue;
    }
    files[key] = classifyTransform(code, key, targetKind);
  }
  return {
    policy: {
      formatVersion: TRANSFORM_POLICY_FORMAT_VERSION,
      targetKind,
      files,
    },
    failures,
  };
}

/** 将 policy 与实际混淆结果 hash 绑定后原子工序内落盘。 */
function finalizeTransformPolicy(root, policy, toObfuscate) {
  for (const { abs, rel } of toObfuscate) {
    const key = normalizeTransformPolicyPath(rel);
    const entry = policy.files[key];
    if (!entry) continue;
    const transformed = readFileSync(abs, "utf8");
    entry.transformedSha256 = transformCodeSha256(transformed);
  }
  const orderedFiles = Object.fromEntries(
    Object.entries(policy.files).sort(([a], [b]) => a.localeCompare(b)),
  );
  writeFileSync(
    join(root, TRANSFORM_POLICY_FILENAME),
    `${JSON.stringify({ ...policy, files: orderedFiles }, null, 2)}\n`,
    "utf8",
  );
}

/** 主流程(副作用):混淆 SERVER_DIR。返回统计。
 *
 * [T-452] Worker pool 并行化:javascript-obfuscator 是 CPU 密集(AST 变换 + rc4 编码),原串行
 *   `for (const ... of toObfuscate)` 跑 600+ chunk 需 2-5 分钟。用 worker_threads pool 分片,
 *   每 worker 独立跑 obfuscateCode(纯函数,无状态),读写各自文件互不冲突。CPU 核数上限并行,
 *   3-5× 加速(实测)。
 *
 *   环境变量 CREATOROS_OBFUSCATE_WORKERS 可覆盖 worker 数(默认 = min(8, cpu-2))。
 *   CREATOROS_OBFUSCATE_SERIAL=1 强制走旧串行路径(排障)。
 */
export async function runObfuscation(
  root = SERVER_DIR,
  targetKind = root === CLIENT_DIR ? "client" : "server",
) {
  const { toObfuscate, excluded } = walkTargets(root);
  const { policy, failures: policyFailures } = planTransformPolicy(
    root,
    toObfuscate,
    targetKind,
  );
  if (policyFailures.length > 0) {
    return {
      obfuscated: 0,
      full: 0,
      renameOnly: 0,
      skippedIdempotent: 0,
      failures: policyFailures,
      excluded,
      reasonCounts: {},
    };
  }

  const shouldSerial = process.env.CREATOROS_OBFUSCATE_SERIAL === "1";
  const stat = shouldSerial
    ? runObfuscationSerial(toObfuscate, policy)
    : await runObfuscationParallel(toObfuscate, policy);

  if (stat.failures.length === 0) {
    finalizeTransformPolicy(root, policy, toObfuscate);
  }

  // 逐类原因汇总。
  const reasonCounts = {};
  for (const { reason } of excluded) {
    reasonCounts[reason] = (reasonCounts[reason] ?? 0) + 1;
  }

  return { ...stat, excluded, reasonCounts };
}

/** 旧串行路径(保留作 fallback / CREATOROS_OBFUSCATE_SERIAL=1 排障)。 */
function runObfuscationSerial(toObfuscate, policy) {
  let obfuscated = 0;
  let skippedIdempotent = 0;
  let renameOnly = 0;
  let full = 0;
  const failures = [];

  for (const { abs, rel } of toObfuscate) {
    let code;
    try {
      code = readFileSync(abs, "utf8");
    } catch (e) {
      failures.push({ rel, error: String(e) });
      continue;
    }
    if (code.startsWith(IDEMPOTENT_MARK)) {
      skippedIdempotent++;
      continue;
    }
    const preset =
      policy.files[normalizeTransformPolicyPath(rel)]?.preset;
    if (!preset) {
      failures.push({ rel, error: "transform policy 缺少混淆档位" });
      continue;
    }
    try {
      const out = obfuscateCode(code, preset);
      writeFileSync(abs, `${IDEMPOTENT_MARK}\n${out}`, "utf8");
      obfuscated++;
      if (preset === "rename-only") renameOnly++;
      else full++;
    } catch (e) {
      // 单文件混淆失败不整体崩(记录 + 保原文件不动)。总纲:某 chunk 语法混淆器不吃时兜底。
      failures.push({ rel, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return { obfuscated, full, renameOnly, skippedIdempotent, failures };
}

/** [T-452] worker_threads pool 并行版。 */
async function runObfuscationParallel(toObfuscate, policy) {
  const os = await import("node:os");
  const workerScript = new URL("./obfuscate.worker.mjs", import.meta.url);

  const cpuCount = os.cpus().length;
  const envWorkers = Number.parseInt(process.env.CREATOROS_OBFUSCATE_WORKERS ?? "", 10);
  const workerCount = Number.isFinite(envWorkers) && envWorkers > 0
    ? envWorkers
    : Math.max(1, Math.min(8, cpuCount - 2));

  // preset 已由混淆前 policy 一次性决定，随任务派发给 worker。worker 只读取当前文件执行
  // 变换与幂等检查，不再各自重算安全分类。
  const tasks = [];
  for (const { abs, rel } of toObfuscate) {
    const preset =
      policy.files[normalizeTransformPolicyPath(rel)]?.preset;
    if (!preset) {
      tasks.push({
        abs,
        rel,
        __readError: "transform policy 缺少混淆档位",
      });
      continue;
    }
    tasks.push({ abs, rel, preset });
  }

  console.log(`[obfuscate] worker pool: ${workerCount} 个 worker × ${tasks.length} 任务`);
  let obfuscated = 0;
  let skippedIdempotent = 0;
  let renameOnly = 0;
  let full = 0;
  const failures = [];

  // 先处理读失败的直接记 failure,不派 worker。
  const workerTasks = [];
  for (const t of tasks) {
    if (t.__readError) failures.push({ rel: t.rel, error: t.__readError });
    else workerTasks.push(t);
  }

  // 简单 round-robin:worker 数 × 任务队列;每 worker 顺序消费自己那一片。
  const shards = Array.from({ length: workerCount }, () => []);
  workerTasks.forEach((t, i) => shards[i % workerCount].push(t));

  await Promise.all(
    shards.map((shard) => runShard(shard, workerScript, (msg) => {
      if (msg.status === "ok") {
        obfuscated++;
        if (msg.preset === "rename-only") renameOnly++;
        else full++;
      } else if (msg.status === "skipped-idempotent") {
        skippedIdempotent++;
      } else if (msg.status === "failed") {
        failures.push({ rel: msg.rel, error: msg.error });
      }
    })),
  );

  return { obfuscated, full, renameOnly, skippedIdempotent, failures };
}

/** 一个 shard = 一个 worker;顺序发消息,收响应,收完退出。 */
async function runShard(shard, workerScript, onMessage) {
  if (shard.length === 0) return;
  const { Worker } = await import("node:worker_threads");
  const worker = new Worker(workerScript);
  try {
    for (const task of shard) {
      await new Promise((resolve, reject) => {
        const onMsg = (msg) => {
          onMessage(msg);
          worker.off("message", onMsg);
          worker.off("error", onErr);
          resolve();
        };
        const onErr = (err) => {
          worker.off("message", onMsg);
          worker.off("error", onErr);
          reject(err);
        };
        worker.on("message", onMsg);
        worker.on("error", onErr);
        worker.postMessage({ abs: task.abs, rel: task.rel, preset: task.preset });
      });
    }
  } finally {
    await worker.terminate();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 运行时冒烟(§3.1 验收闸 / gate ④)—— 真起 sidecar + GET / 200 + 一条 ai-runtime 路由不崩。
// 独立函数,package.mjs 调它;本环境真起太重时可 skip(标注真机/CI 跑)。
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 混淆后真起 sidecar 冒烟。spawn node server.js → TCP ready-probe → GET / 200 →
 * POST /api/v1/dispatch(经 backend/modules/ai-runtime 的 composite transport;不崩即证
 * 混淆没让运行时动态 require 崩。返回 401/400/200 都算「没崩」——我们只验运行时不因混淆炸,
 * 不验业务鉴权)。任一硬失败(server 起不来 / GET / 非 200 / 路由 500 且 body 含 require 崩)→ throw。
 *
 * @param {{timeoutMs?:number}} opts
 * @returns {Promise<{ready:boolean, rootStatus:number, dispatchStatus:number}>}
 */
export async function smokeBootAfterObfuscation(opts = {}) {
  const { spawn } = await import("node:child_process");
  const net = await import("node:net");
  const timeoutMs = opts.timeoutMs ?? 60_000;

  const serverJs = join(SIDECAR, "frontend", "server.js");
  const libDir = join(SIDECAR, "lib");
  // 空闲端口。
  const port = await new Promise((res, rej) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const p = srv.address().port;
      srv.close(() => res(p));
    });
    srv.on("error", rej);
  });

  // [T-332 S1 配套] 冒烟必须用**全新临时数据目录**:不设 PGLITE_DATA_DIR 会落到持久默认
  // 目录——上次冒烟(旧 schema)遗留的 NULL account_id 行会触发 0042 迁移 guard 正确中止,
  // 冒烟误报为「混淆破坏运行时」。mkdtemp 每次干净,顺带隔离 .auth(不碰真实登录态)。
  const { mkdtempSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const smokeDataRoot = mkdtempSync(join(tmpdir(), "creatoros-smoke-"));

  const child = spawn(process.execPath, [serverJs], {
    env: {
      ...process.env,
      PORT: String(port),
      HOSTNAME: "127.0.0.1",
      NODE_ENV: "production",
      CREATOROS_DESKTOP: "1",
      // [T-451 后修] 冒烟绕过 verdict-token 校验 —— 打包期直起 sidecar 没经 Rust 壳,
      //   无 token。Rust 壳 spawn 时永不设这个 env,攻击者也无从设。见
      //   verdict-token-gate.ts::verifyVerdictTokenOrExit 的 isSmokeBypass 分支。
      CREATOROS_SMOKE_BYPASS_VERDICT: "1",
      DATABASE_URL: "",
      PGLITE_DATA_DIR: join(smokeDataRoot, "db"),
      CREATOROS_DB_DIR: join(smokeDataRoot, "db"),
      DYLD_LIBRARY_PATH: libDir,
      LD_LIBRARY_PATH: libDir,
    },
    // stdin 必须是**保持打开的管道**,不能 "ignore":lifecycle 的 Win 孤儿自检以「stdin 管道
    // 断开」判父进程已死,"ignore" 下 sidecar 启动即判孤儿 → 自觉优雅退出 → 首个请求
    // ECONNRESET(第 11 轮 CI 实证)。真实 Tauri spawn 的 stdin 本就是管道(H-key 传 key 用),
    // pipe 让冒烟更贴真实调用路径;mac 用 ppid 判定不受影响。
    stdio: ["pipe", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr.on("data", (d) => (stderr += d.toString()));
  // stdout 必须消费:①Next standalone 部分报错走 stdout;②pipe 不读会背压堵死 server。
  let stdout = "";
  child.stdout.on("data", (d) => (stdout += d.toString()));

  const cleanup = () => {
    try {
      child.kill();
    } catch {
      /* noop */
    }
  };

  try {
    // TCP ready-probe。
    const deadline = Date.now() + timeoutMs;
    let ready = false;
    while (Date.now() < deadline) {
      const ok = await new Promise((res) => {
        const s = net.connect(port, "127.0.0.1");
        s.on("connect", () => {
          s.destroy();
          res(true);
        });
        s.on("error", () => res(false));
      });
      if (ok) {
        ready = true;
        break;
      }
      if (child.exitCode !== null) break; // 进程已退(崩了)。
      await new Promise((r) => setTimeout(r, 150));
    }
    if (!ready) {
      throw new Error(
        `[obfuscate:smoke] sidecar 未就绪(混淆可能破坏了运行时 require)。stderr:\n${stderr.slice(-2000)}`,
      );
    }

    // GET / —— 2xx 或 3xx 都算「运行时没崩」。桌面下 CREATOROS_DESKTOP=1 + 未激活 → P5 激活门
    //   307 → /activate(正常业务重定向,非混淆 bug)。若重定向,跟随一跳验证目标真能 200 渲染
    //   (证混淆后的 first-party route SSR 没崩)。只有 5xx / 连接失败才算混淆破坏运行时。
    const { status: rootStatus, location } = await httpProbe(`http://127.0.0.1:${port}/`, "GET");
    if (rootStatus >= 500) {
      throw new Error(`[obfuscate:smoke] GET / 返回 ${rootStatus}(5xx=运行时崩)。stderr:\n${stderr.slice(-2000)}`);
    }
    let renderedStatus = rootStatus;
    if (rootStatus >= 300 && rootStatus < 400 && location) {
      const target = location.startsWith("http") ? location : `http://127.0.0.1:${port}${location}`;
      const { status } = await httpProbe(target, "GET");
      renderedStatus = status;
      if (status !== 200) {
        throw new Error(
          `[obfuscate:smoke] GET / → ${rootStatus} ${location},但目标渲染 ${status}(期望 200)。stderr:\n${stderr.slice(-2000)}`,
        );
      }
    }

    // POST /api/v1/dispatch —— 经 backend/modules/ai-runtime 的 composite transport(chunk 里
    //   first-party 逻辑)。404/401/400/200 都算「运行时没被混淆炸」(route 逻辑正常执行到 endpoint
    //   查找);500 且 stderr 含 module/require/chunk 崩 → fail。
    const { status: dispatchStatus } = await httpProbe(
      `http://127.0.0.1:${port}/api/v1/dispatch`,
      "POST",
      JSON.stringify({ id: "smoke.noop", input: {} }),
    );
    if (
      dispatchStatus >= 500 &&
      /Cannot find module|ERR_MODULE|ChunkLoadError|is not a function/i.test(stderr)
    ) {
      throw new Error(
        `[obfuscate:smoke] dispatch 路由 ${dispatchStatus} 且 stderr 含 require/module/chunk 崩:\n${stderr.slice(-2000)}`,
      );
    }

    return { ready: true, rootStatus, renderedStatus, dispatchStatus };
  } catch (e) {
    // httpProbe 的网络错(如 ECONNRESET=进程处理请求中途崩)会不带 sidecar 输出直接冒泡,
    // 只见「read ECONNRESET」无从诊断(win 首跑实测)——统一附上 stderr/stdout 尾部。
    if (/stderr:/.test(`${e?.message}`)) throw e; // 三处显式 throw 已带诊断,原样
    const tail = (label, s) => (s.trim() ? `\n${label}(尾部):\n${s.slice(-2000)}` : "");
    throw new Error(`${e?.message ?? e}${tail("stderr", stderr)}${tail("stdout", stdout)}`);
  } finally {
    cleanup();
  }
}

/** 最小 HTTP 探针(不引第三方 http client)。返回 { status, location }。 */
async function httpProbe(url, method, body) {
  const http = await import("node:http");
  return new Promise((res, rej) => {
    const u = new URL(url);
    const req = http.request(
      {
        hostname: u.hostname,
        port: u.port,
        path: u.pathname + u.search,
        method,
        headers: body ? { "content-type": "application/json", "content-length": Buffer.byteLength(body) } : {},
      },
      (r) => {
        r.resume();
        res({ status: r.statusCode ?? 0, location: r.headers.location });
      },
    );
    req.on("error", rej);
    if (body) req.write(body);
    req.end();
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI 入口。
// ─────────────────────────────────────────────────────────────────────────────
function isMain() {
  return process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

if (isMain()) {
  const withSmoke = process.argv.includes("--smoke");
  const smokeOnly = process.argv.includes("--smoke-only");

  // --smoke-only:跳过混淆,只跑运行时冒烟(package.mjs 分两步调,避免重复混淆破坏幂等语义)。
  if (smokeOnly) {
    console.log("[obfuscate] ▶ 运行时冒烟(真起 sidecar,--smoke-only)…");
    smokeBootAfterObfuscation()
      .then((r) => {
        console.log(
          `[obfuscate] ✅ 冒烟通过:ready · GET / = ${r.rootStatus}` +
            (r.renderedStatus !== r.rootStatus ? ` → 渲染 ${r.renderedStatus}` : "") +
            ` · dispatch = ${r.dispatchStatus}(非崩即过)。`,
        );
      })
      .catch((e) => {
        console.error(`[obfuscate] ✗ 冒烟失败:${e.message}`);
        process.exit(1);
      });
  } else {
  console.log("[obfuscate] ▶ sidecar bundle 混淆开始(server + client)。");

  // [T-417 client] server(后续 bytecode 化)+ client(浏览器执行,堵前端源码裸奔)两靶目录都混淆。
  let anyFailure = false;
  for (const [label, dir] of [["server", SERVER_DIR], ["client", CLIENT_DIR]]) {
    console.log(`[obfuscate]   靶目录[${label}]: ${dir}`);
    // [T-452] runObfuscation 现在是 async(内部走 worker pool);ESM 顶层允许 await。
    const stat = await runObfuscation(dir, label);
    console.log(
      `[obfuscate] ✅ [${label}] 混淆 ${stat.obfuscated} 个 .js(full=${stat.full} / rename-only=${stat.renameOnly})` +
        (stat.skippedIdempotent ? ` · 幂等跳过 ${stat.skippedIdempotent}` : ""),
    );
    for (const [reason, n] of Object.entries(stat.reasonCounts)) {
      console.log(`[obfuscate]   - ${n} × ${reason}`);
    }
    if (stat.failures.length) {
      anyFailure = true;
      console.warn(`[obfuscate] ⚠️ [${label}] ${stat.failures.length} 个文件混淆失败(保原文件不动):`);
      for (const f of stat.failures.slice(0, 10)) {
        console.warn(`[obfuscate]     ✗ ${f.rel}: ${f.error}`);
      }
    }
  }
  // 失败即 fail-fast(混淆器吃不下某 chunk 意味着可能有更深问题;别静默放行破坏产物)。
  if (anyFailure) process.exit(1);

  if (withSmoke) {
    console.log("[obfuscate] ▶ 运行时冒烟(真起 sidecar)…");
    smokeBootAfterObfuscation()
      .then((r) => {
        console.log(
          `[obfuscate] ✅ 冒烟通过:ready · GET / = ${r.rootStatus}` +
            (r.renderedStatus !== r.rootStatus ? ` → 渲染 ${r.renderedStatus}` : "") +
            ` · dispatch = ${r.dispatchStatus}(非崩即过)。`,
        );
      })
      .catch((e) => {
        console.error(`[obfuscate] ✗ 冒烟失败:${e.message}`);
        process.exit(1);
      });
  }
  }
}
