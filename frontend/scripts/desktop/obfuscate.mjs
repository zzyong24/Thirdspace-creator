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
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const FRONTEND = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SIDECAR = join(FRONTEND, "src-tauri", "sidecar");
// 混淆靶目录:standalone 里的 Next server 编译产物。
const SERVER_DIR = join(SIDECAR, "frontend", ".next", "server");

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
  if (/\[turbopack\]_runtime\.js$/.test(base)) return "Turbopack runtime chunk 加载器(碰坏 chunk 加载,SPEC §4 排除)";

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
 * 决定文件用哪档混淆。rename-only(不碰字符串/控制流)当以下任一命中:
 *   ① 路径在 turbopack `chunks/**` 下 —— [T-164 真机踩点] turbopack chunk 靠 chunk 路径字符串 +
 *      数字模块 ID 互相 loadChunkAsync 加载(不走显式 require);stringArray base64 编码这些
 *      路径/ID → 运行时 ChunkLoadError。故整个 chunks/ 树降 rename-only(局部标识符 rename 不
 *      触碰 chunk 互链字符串,安全)。SPEC §3.1 gate ③ + §4「Next runtime chunk 保守」授权。
 *   ② 含 require(<字面量>) / import(<字面量>) —— 动态 require 的模块名字面量若被编码 → 崩。
 * 其余(app/** 等 first-party route handler,无 turbopack chunk 互链 + 无字面 require)→ full。
 *
 * @param {string} code 文件内容
 * @param {string} [relPath] 相对靶目录路径(判 chunks/)
 * @returns {"rename-only"|"full"}
 */
export function pickPreset(code, relPath = "") {
  const parts = relPath.split(/[\\/]/).filter(Boolean);
  // ① turbopack chunk 树(chunks/ 或 chunks/ssr/ 下)→ rename-only。
  if (parts.includes("chunks")) return "rename-only";
  // ② 显式动态 require/import 字面量 → rename-only。
  const dynLiteral = /(?:require|import)\s*\(\s*["'`]/;
  return dynLiteral.test(code) ? "rename-only" : "full";
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
  const opts = preset === "rename-only" ? RENAME_ONLY_OPTIONS : FULL_OPTIONS;
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

/** 主流程(副作用):混淆 SERVER_DIR。返回统计。 */
export function runObfuscation(root = SERVER_DIR) {
  const { toObfuscate, excluded } = walkTargets(root);

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
    const preset = pickPreset(code, rel);
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

  // 逐类原因汇总。
  const reasonCounts = {};
  for (const { reason } of excluded) {
    reasonCounts[reason] = (reasonCounts[reason] ?? 0) + 1;
  }

  return { obfuscated, full, renameOnly, skippedIdempotent, excluded, reasonCounts, failures };
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

  const child = spawn(process.execPath, [serverJs], {
    env: {
      ...process.env,
      PORT: String(port),
      HOSTNAME: "127.0.0.1",
      NODE_ENV: "production",
      CREATOROS_DESKTOP: "1",
      DYLD_LIBRARY_PATH: libDir,
      LD_LIBRARY_PATH: libDir,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr.on("data", (d) => (stderr += d.toString()));

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
  console.log("[obfuscate] ▶ sidecar bundle 混淆开始。");
  console.log(`[obfuscate]   靶目录: ${SERVER_DIR}`);

  const stat = runObfuscation();

  console.log(
    `[obfuscate] ✅ 混淆 ${stat.obfuscated} 个 .js(full=${stat.full} / rename-only=${stat.renameOnly})` +
      (stat.skippedIdempotent ? ` · 幂等跳过 ${stat.skippedIdempotent}` : ""),
  );
  console.log(`[obfuscate] 排除 ${stat.excluded.length} 个(逐类原因):`);
  for (const [reason, n] of Object.entries(stat.reasonCounts)) {
    console.log(`[obfuscate]   - ${n} × ${reason}`);
  }
  if (stat.failures.length) {
    console.warn(`[obfuscate] ⚠️ ${stat.failures.length} 个文件混淆失败(保原文件不动):`);
    for (const f of stat.failures.slice(0, 10)) {
      console.warn(`[obfuscate]     ✗ ${f.rel}: ${f.error}`);
    }
    // 失败即 fail-fast(混淆器吃不下某 chunk 意味着可能有更深问题;别静默放行破坏产物)。
    process.exit(1);
  }

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
