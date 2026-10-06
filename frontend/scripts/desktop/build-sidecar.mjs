#!/usr/bin/env node
import { stageExecutionWorkerRuntime,assertExecutionWorkerRuntime,assertWorkerExternalPackages,workerExternalPackages } from "./execution-worker-runtime.mjs";
// [T-147 P1] sidecar 二进制化 —— 桌面化「唯一中风险」(RFC §8.1)。
//
// 目标:产出 Tauri externalBin 需要的、按 target-triple 命名的可执行体
//       `src-tauri/binaries/creatoros-server-<triple>`,启动即跑 Next standalone server.js。
//
// 选型(RFC §8.1 (b)「随包带 node runtime + standalone 目录」):
//   不用 pkg/SEA 打单 blob —— next standalone 依赖真实文件树(server.js + traced node_modules
//   + PGlite 的 postgres.wasm/.data 相对自身 fs.readFile 读),单 blob 快照放不进这套相对资产,
//   是原型早已识别的坑。稳的做法:standalone 目录整包当 bundle resource 随包带;sidecar 可执行体
//   = **随包 node runtime 本体**(process.execPath 的拷贝,按 triple 命名)。Rust 侧把 server.js
//   绝对路径作 arg 传给它跑(见 src-tauri/src/lib.rs)。
//
//   ⚠️ 与参照项目 skills-manager 的差异:它前端是 Vite 静态 dist + sidecar 是 Rust CLI
//     (cargo 编);CreatorOS 是 Next.js SSR,不能编成 Rust CLI → sidecar 必须是跑 server.js 的
//     node runtime。所以借鉴 skills-manager 的 tauri conf/双配/updater/脚本模式,但 Next standalone
//     的 sidecar 二进制化是本项目自研(本脚本)。
//
// 本脚本做三件事:
//   1. CREATOROS_DESKTOP=1 下跑 next standalone build(产 .next/standalone + PGlite WASM traced)。
//   2. 组装 standalone 运行目录(补 .next/static + public;deref symlink + 剪 pnpm hoist 层)。
//   3. 产出 sidecar 可执行体(node runtime)+ co-ship 其依赖 dylib 到 sidecar/lib/。
//
// 诚实边界:
//   - 本脚本产本机 target(macOS aarch64-apple-darwin)。Windows / mac x64 需在对应平台/交叉
//     环境跑本脚本产各自 sidecar —— 跨平台 triple 表已留(targetTriple),但不在本机产出。
//   - 未签名/未公证(证书=用户的,P6 补)。

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, cpSync, chmodSync, copyFileSync, lstatSync, statSync, readdirSync, readlinkSync, realpathSync, symlinkSync, writeFileSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { platform, arch } from "node:process";
import { homedir, tmpdir } from "node:os";
// [T-326/T-485] 静态 ffmpeg+ffprobe 拉取(缓存 + GitHub release 下载 + 冒烟)并实拷进 sidecar。
import { ensureFfmpegStatic, ensureFfprobeStatic } from "./fetch-ffmpeg.mjs";
// [T-372 W2] Playwright 浏览器缓存根目录按平台映射(mac/win/linux;纯函数,平台分支可单测)。
import { playwrightBrowsersCacheRoot } from "./platform-paths.mjs";
import { assertVerdictPublicKey } from "./verdict-key-material.mjs";
import { assertMacosRuntimeCompatibility } from "./macos-runtime-compat.mjs";
import { signMacRuntimePayloadForNotarization } from "./macos-runtime-signing.mjs";
import {
  assertCreatorOsCliRuntime,
  stageCreatorOsCliRuntime,
} from "./creatoros-cli-runtime.mjs";

export { assertCreatorOsCliRuntime };

// 统计目录树里的 symlink 数(诊断/日志用)。
function countSymlinks(root) {
  let n = 0;
  for (const name of readdirSync(root)) {
    const p = join(root, name);
    let st;
    try {
      st = lstatSync(p);
    } catch {
      continue;
    }
    if (st.isSymbolicLink()) n++;
    else if (st.isDirectory()) n += countSymlinks(p);
  }
  return n;
}

const FRONTEND = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const REPO = resolve(FRONTEND, "..");
const SRC_TAURI = join(FRONTEND, "src-tauri");
const BINARIES = join(SRC_TAURI, "binaries");
const STANDALONE_SRC = join(FRONTEND, ".next", "standalone");
const SIDECAR_RUNTIME = join(SRC_TAURI, "sidecar"); // 组装好的 standalone 运行目录(bundle resource)

const STANDALONE_FRONTEND_LEAKS = [
  "src", "src-tauri", "docs", "specs", "tests", "scripts", "playwright-report", "test-results",
  "SPEC.md", "AGENT-PROTOCOL.md", "IMPLEMENTATION-ARCHITECTURE.md",
  "TDD-PLAN.md", "TESTING.md", "README.md",
  "eslint.config.mjs", "playwright.config.ts", "vitest.config.ts",
  // [T-417 隐私] `.auth/douyin` = 开发机登录 session；.env* 同理不得进入安装包。
  ".auth", ".env", ".env.local", ".env.production", ".env.development",
];

/**
 * [T-487] 剥离 Next output tracing 误带入的工作区文件。
 * 尤其禁止 frontend/src-tauri：它包含 target、旧 sidecar 和旧安装包，复制后会递归膨胀。
 */
export function pruneStandaloneLeaks(runtimeRoot) {
  const frontendRoot = join(runtimeRoot, "frontend");
  let pruned = 0;
  for (const name of STANDALONE_FRONTEND_LEAKS) {
    const path = join(frontendRoot, name);
    if (!existsSync(path)) continue;
    rmSync(path, { recursive: true, force: true });
    pruned++;
  }
  return pruned;
}

/**
 * [T-487] tar 前的 fail-closed 哨兵。只要 runtime 里仍有壳构建树或安装包，就拒绝打包。
 */
export function assertNoPackagedBuildArtifacts(runtimeRoot) {
  const forbidden = [];
  const visit = (dir) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      const rel = relative(runtimeRoot, path).replaceAll("\\", "/");
      const st = lstatSync(path);
      if (st.isSymbolicLink()) continue;
      if (st.isDirectory()) {
        if (rel === "frontend/src-tauri" || rel.startsWith("frontend/src-tauri/")) {
          forbidden.push(rel);
          continue;
        }
        visit(path);
        continue;
      }
      if (
        name === "sidecar.tar.gz"
        || name.endsWith(".app.tar.gz")
        || name.endsWith(".dmg")
        || name.endsWith(".msi")
        || name.endsWith("-setup.exe")
      ) {
        forbidden.push(rel);
      }
    }
  };
  visit(runtimeRoot);
  if (forbidden.length > 0) {
    throw new Error(
      `[build-sidecar] [T-487] 拒绝递归打包壳构建产物：${forbidden.slice(0, 8).join(", ")}`,
    );
  }
}

/** macOS copyfile/bsdtar 会把 xattr 编成 `._*` AppleDouble 条目；Rust tar 解压后这些条目
 * 会变成 signed `server.app` 内的新增文件，AMFI 随即用 SIGKILL 拦截 sidecar。 */
export function portableTarEnv(baseEnv = process.env, targetPlatform = platform) {
  return targetPlatform === "darwin"
    ? { ...baseEnv, COPYFILE_DISABLE: "1" }
    : { ...baseEnv };
}

function collectPortableMetadataFiles(root) {
  const found = [];
  const visit = (dir) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      const rel = relative(root, path).replaceAll("\\", "/");
      let stat;
      try {
        stat = lstatSync(path);
      } catch {
        continue;
      }
      if (name === ".DS_Store" || name.startsWith("._")) {
        found.push(rel);
        continue;
      }
      if (stat.isDirectory() && !stat.isSymbolicLink()) visit(path);
    }
  };
  visit(root);
  return found;
}

export function prunePortableMetadataFiles(root) {
  const found = collectPortableMetadataFiles(root);
  for (const rel of found) rmSync(join(root, rel), { recursive: true, force: true });
  return found;
}

export function assertNoPortableMetadataFiles(root) {
  const found = collectPortableMetadataFiles(root);
  if (found.length > 0) {
    throw new Error(
      `[build-sidecar] 拒绝把 macOS AppleDouble/Finder 元数据打进 runtime：${found.slice(0, 12).join(", ")}`,
    );
  }
}

export function assertNoAppleDoubleTarEntries(tarball, tarBin = "tar") {
  // COPYFILE_DISABLE=1 对“读取”同样重要：否则 macOS bsdtar 会把 `._*` 当 xattr 隐藏，
  // 普通 `tar -tzf` 看起来是干净的，Rust tar 却会把它们真实展开。
  const listed = spawnSync(tarBin, ["-tzf", tarball], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    env: portableTarEnv(process.env, "darwin"),
  });
  if (listed.status !== 0) {
    throw new Error(
      `[build-sidecar] 无法校验 sidecar.tar.gz AppleDouble 条目(exit ${listed.status ?? "null"})\n${listed.stderr ?? ""}`,
    );
  }
  const bad = listed.stdout
    .split("\n")
    .map((entry) => entry.replace(/^\.\//, ""))
    .filter((entry) => entry && entry.split("/").some((part) => part === ".DS_Store" || part.startsWith("._")));
  if (bad.length > 0) {
    throw new Error(
      `[build-sidecar] sidecar.tar.gz 含 AppleDouble/Finder 条目，解压后会破坏签名：${bad.slice(0, 12).join(", ")}`,
    );
  }
}

function verifyMacSidecarSignatureAfterTar(tarball, tarBin) {
  if (platform !== "darwin" || process.env.CREATOROS_PACKAGE_BUILD_ONLY === "1") return;
  const root = mkdtempSync(join(tmpdir(), "creatoros-sidecar-signature-"));
  try {
    // 用 COPYFILE_DISABLE=1 模拟 Rust tar：AppleDouble 不会被“聪明地”还原成 xattr，
    // 而会像用户机一样成为真实文件；只解 server.app，门禁成本很低。
    const extracted = spawnSync(
      tarBin,
      ["-xzf", tarball, "-C", root, "./server.app"],
      { encoding: "utf8", env: portableTarEnv(process.env, "darwin") },
    );
    if (extracted.status !== 0) {
      throw new Error(
        `[build-sidecar] 无法回放解压 server.app(exit ${extracted.status ?? "null"})\n${extracted.stderr ?? ""}`,
      );
    }
    const app = join(root, "server.app");
    const verified = spawnSync("codesign", ["--verify", "--deep", "--strict", "--verbose=2", app], {
      encoding: "utf8",
    });
    if (verified.status !== 0) {
      throw new Error(
        `[build-sidecar] tar 解压后的 server.app 签名失效；拒绝出包\n${verified.stderr ?? verified.stdout ?? ""}`,
      );
    }
    console.log("[build-sidecar]   ✓ tar 回放：解压后的 server.app 仍通过 codesign --deep --strict");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

// Rust target triple(externalBin 命名要求)。P1 只覆盖本机;其余留位。
function targetTriple() {
  const map = {
    "darwin-arm64": "aarch64-apple-darwin",
    "darwin-x64": "x86_64-apple-darwin",
    "win32-x64": "x86_64-pc-windows-msvc",
    "linux-x64": "x86_64-unknown-linux-gnu",
  };
  const key = `${platform}-${arch}`;
  const triple = map[key];
  if (!triple) throw new Error(`[build-sidecar] 未映射的平台 ${key};在 targetTriple() 补表。`);
  return triple;
}

function run(cmd, args, opts = {}) {
  console.log(`[build-sidecar] $ ${cmd} ${args.join(" ")}`);
  const r = spawnSync(cmd, args, { stdio: "inherit", cwd: FRONTEND, ...opts });
  if (r.status !== 0) {
    // status=null = 进程被信号杀/未能 spawn(非正常退出码);把 signal/error 一并暴露,
    // 否则「exit null」无从诊断(Windows 首次构建曾因此看不出崩因)。
    const detail =
      r.status === null
        ? `信号=${r.signal ?? "?"}${r.error ? ` error=${r.error.code ?? r.error.message}` : ""}`
        : `exit ${r.status}`;
    throw new Error(`[build-sidecar] 命令失败(${detail}): ${cmd} ${args.join(" ")}`);
  }
}

// [T-843] CLI 与 MCP 从同一 contract bundle 产出。用户机不需要 Node：CLI 启动器只调用
// 随 CreatorOS 一起交付的 runtime（macOS 复用 server.app；Windows/Linux 在 cli/ 带一份）。
function bundleCreatorOsCli() {
  const { bundle: cliScript } = stageCreatorOsCliRuntime({
    repoRoot: REPO,
    runtimeRoot: SIDECAR_RUNTIME,
    nodeExecutablePath: process.execPath,
    targetPlatform: platform,
  });
  console.log(`[build-sidecar]   ✓ CreatorOS CLI 已进入 runtime: ${relative(SIDECAR_RUNTIME, cliScript)}`);
}

// [T-426 W4] Windows 上上次中断留下的断裂 junction 可能让 fs.rm 报 ENOTEMPTY/EPERM。
// 先走可重试的标准删除；只对经过精确路径校验的 sidecar 目录使用 cmd 原生 rd 兜底，且删后复查。
function removeSidecarRuntime() {
  try {
    rmSync(SIDECAR_RUNTIME, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    return;
  } catch (e) {
    const retryable = new Set(["ENOTEMPTY", "EBUSY", "EPERM"]);
    if (platform !== "win32" || !retryable.has(e?.code)) throw e;
    const target = resolve(SIDECAR_RUNTIME);
    const expected = resolve(SRC_TAURI, "sidecar");
    if (target !== expected) {
      throw new Error(`[build-sidecar] 拒绝清理未通过路径校验的目录:${target}`);
    }
    console.log(`[build-sidecar]   rmSync 失败(${e.code}),用 Windows rd 清理断裂 junction…`);
    const winTarget = target.replace(/\//g, "\\");
    const r = spawnSync("cmd.exe", ["/d", "/s", "/c", `rd /s /q "${winTarget}"`], { stdio: "inherit" });
    if (r.status !== 0 || existsSync(target)) {
      throw new Error(
        `[build-sidecar] Windows rd 清理 sidecar 失败(status=${r.status ?? "null"},残留=${existsSync(target)}):${target}`,
      );
    }
  }
}

// [T-169] 把组装好的 sidecar/ 打成单文件 tarball `src-tauri/sidecar.tar.gz`,供 Tauri 当 resource 带上。
//   为何 tarball 而非整目录:Tauri 的 resource 拷贝器**丢 symlink**(实测源 180 → bundle 0),
//   sidecar 靠 pnpm 相对 symlink 解析 node_modules → 丢了必崩。tarball 把 symlink 原样存档,首启由
//   lib.rs 用系统 tar 解压到可写目录(原生保 symlink)。
//   `-C <dir> .`:进 sidecar/ 后打其内容(不含 sidecar/ 前缀),解压到 dest 即 dest/frontend/server.js。
//   tar 默认把 symlink 存为 symlink(不 -h 解引用)—— 正是所需。
// [T-441] 打 tarball 前的**最后一道闸**:修掉所有「指向 sidecar 之外」的 symlink。
//   病根(2026-07-20 盘点实测,mac/win 通用):包里有 22 个 symlink 指向**构建机绝对路径** ——
//   ①`node_modules/.pnpm/hyperframes@…/node_modules/` 下 17 个依赖 → 构建机仓库 `.pnpm`;
//   ②随包 Chromium 的 `Framework.framework/{Resources,Libraries,主二进制}` 5 个 → 构建机
//     `~/Library/Caches/ms-playwright/…`。用户机上这些路径不存在 → hyperframes 视频渲染依赖缺失、
//     **随包浏览器 Framework 主体缺失**(截图/渲染/抖音采集全靠它)。「至今没报错」只是因为 T-438 的
//     截图失败停在 SSRF 守卫、压根没走到启动浏览器那步 —— 雷没排,只是没踩。
//   两类分别处理(省几百 MB):
//     · 目标**已在包内**(如 Chromium 的 Versions/<ver>/… 真身全在)→ 只把绝对链**改写成相对链**,
//       零体积增长(macOS Framework 本来就是 Resources → Versions/Current/Resources 这套相对结构);
//     · 目标**在包外**(如 hyperframes 那 17 个,包内 .pnpm 确实没有)→ 实拷真身;命中 .pnpm 结构的
//       走 materializeNestedEntryTree(带传递依赖 + 防环,同 T-440),否则 cpSync 实拷。
//   收尾**硬自检**:全树零「指向包外」的 symlink,失败即 build 炸 —— 以后再混进这类链,构建期就拦下,
//   不必再靠人工 tar tvzf 盘点(T-437/T-440/T-441 都是这么被人肉发现的)。
/** [T-441] 单个包外源超过此体积即视为「重依赖」,不物化(删链+告警),防包体积失控。 */
const T441_HEAVY_SRC_MB = 30;
/** [T-441] 本轮物化总预算(MB);超出后剩余包外链一律删链+告警。 */
const T441_BUDGET_MB = 150;

/** 目录/文件体积(MB,取整);du 失败退 0(视为轻量,宁可物化)。 */
function dirSizeMB(p) {
  const r = spawnSync("du", ["-sm", p], { encoding: "utf8" });
  const n = Number.parseInt(`${r.stdout}`.trim().split(/\s+/)[0] ?? "", 10);
  return Number.isFinite(n) ? n : 0;
}

function fixOutOfTreeSymlinks() {
  const rootReal = realpathSync(SIDECAR_RUNTIME);
  const inTree = (p) => p === rootReal || p.startsWith(rootReal + "/");
  // 先收集(边遍历边改会把新拷进来的真目录再走一遍)。
  const links = [];
  const collect = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      const st = lstatSync(p);
      if (st.isSymbolicLink()) links.push(p);
      else if (st.isDirectory()) collect(p);
    }
  };
  collect(SIDECAR_RUNTIME);

  let rewired = 0;
  let nested = 0;
  let copied = 0;
  let dangling = 0;
  let spentMB = 0;
  const skipped = [];
  const srcPnpm = join(REPO, "node_modules", ".pnpm");
  for (const p of links) {
    const raw = readlinkSync(p);
    let target = null;
    try { target = realpathSync(p); } catch { target = null; } // 解析不了 = 已是死链
    if (target && inTree(target)) {
      // 目标在包内:绝对链改写成相对链(相对链本就自洽,不动)。
      if (isAbsolute(raw)) {
        const rel = relative(dirname(p), target);
        rmSync(p, { force: true });
        symlinkSync(rel, p);
        rewired++;
      }
      continue;
    }
    // 目标在包外(或死链)→ 必须实拷,否则用户机必崩。
    const src = target ?? (isAbsolute(raw) ? raw : resolve(dirname(p), raw));
    if (!existsSync(src)) {
      // [T-441] 断链(目标源不存在):绝大多数是 bundleXXX 按需**剪枝**掉的 lazy-only 子树
      //   (如 bundlePiEngine 剪掉 pi 的 bedrock 等云 provider —— isCut 的既定行为)。这种链留在
      //   包里本就是坏的、且无人 require → 删掉记账即可;**不能 throw**,否则正常剪枝会被当成故障
      //   把整个 build 炸掉(实测 pi-ai 的 @aws-sdk/client-bedrock-runtime 即此类)。
      rmSync(p, { force: true });
      dangling++;
      continue;
    }
    // [T-441] **体积保护**:重包不盲目物化。实测无脑全拷 hyperframes 那 16 个 deps(含
    //   puppeteer-core/onnxruntime-node/sharp/esbuild)会沿多条路径重复展开 → **+1.2GB**。
    //   而 hyperframes 我们只用 `dist/cli.js`(9.3MB **bundled** 单文件,纯 JS 依赖多已内联)。
    //   故:单源超阈值或超总预算 → **删链 + 记账告警**(该链现状本就是死的,删掉行为不变、包不变大),
    //   日志列出跳过项以便**针对性**补(而不是为几个可能用不到的依赖付一个 GB)。
    const srcMB = dirSizeMB(src);
    if (srcMB > T441_HEAVY_SRC_MB || spentMB + srcMB > T441_BUDGET_MB) {
      rmSync(p, { recursive: true, force: true });
      skipped.push(`${relative(SIDECAR_RUNTIME, p)} (${srcMB}MB)`);
      continue;
    }
    const norm = src.replace(/\\/g, "/");
    const idx = norm.indexOf("/.pnpm/");
    rmSync(p, { recursive: true, force: true });
    const entry = idx >= 0 ? norm.slice(idx + "/.pnpm/".length).split("/node_modules/")[0] : "";
    if (entry && existsSync(join(srcPnpm, entry))) {
      materializeNestedEntryTree(srcPnpm, entry, p, new Set([entry])); // 带传递依赖 + 防环
      nested++;
    } else {
      cpSync(src, p, { recursive: true, dereference: true });
      copied++;
    }
    spentMB += srcMB;
  }

  // 硬自检:**可解析却指向包外**的链 = 构建机能用、用户机必坏 → 一个都不许留(fail)。
  //   断链另计:本就是坏的(多为剪枝残留),只告警不阻塞 —— 二者性质不同,别混为一谈。
  const bad = [];
  const dead = [];
  const scan = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      const st = lstatSync(p);
      if (st.isSymbolicLink()) {
        let t = null;
        try { t = realpathSync(p); } catch { t = null; }
        if (!t) dead.push(`${p} → ${readlinkSync(p)}`);
        else if (!inTree(t)) bad.push(`${p} → ${readlinkSync(p)}`);
      } else if (st.isDirectory()) scan(p);
    }
  };
  scan(SIDECAR_RUNTIME);
  if (bad.length) {
    throw new Error(
      `[build-sidecar] [T-441] 自检失败:仍有 ${bad.length} 个 symlink 指向包外(构建机能用/用户机必死链)\n${bad.slice(0, 8).join("\n")}`,
    );
  }
  console.log(
    `[build-sidecar]   [T-441] 包外 symlink 修复:改相对链 ${rewired} + 嵌套物化 ${nested} + 实拷 ${copied} + 删断链 ${dangling} + 跳过重依赖 ${skipped.length}(物化 ${spentMB}MB),自检零包外链`,
  );
  if (dead.length) {
    console.log(`[build-sidecar]   [T-441] ⚠ 残留断链 ${dead.length} 个(剪枝残留,不阻塞):${dead[0]}`);
  }
  if (skipped.length) {
    // 显式列出「因体积跳过」的包 —— 它们原本就是死链(用户机上从来就不可用),删掉行为不变;
    // 但若将来发现某功能确实需要,按这份清单**针对性**补,而不是把整棵依赖树塞进包里。
    console.log(`[build-sidecar]   [T-441] ⚠ 因体积跳过物化 ${skipped.length} 个包外链(原本即死链,行为不变):`);
    for (const s of skipped.slice(0, 20)) console.log(`[build-sidecar]        · ${s}`);
  }
}

// [T-454/T-487] 全平台 bundle 都走单个 tarball。Windows 不再让 NSIS 递归处理 15 万+
//   小文件（20-60 分钟且静默），而是在官方 POSTINSTALL hook 中调用应用内置 Rust 解压器，
//   将 tar 物化到用户选择的 $INSTDIR/runtime-images，再删 tar；首次启动直接读取 current
//   指针，零二次解压。macOS/Linux 暂保留 appData 原子解压兼容路径。
export function shouldPackSidecarTarball(_targetPlatform = platform) {
  return true;
}

function packSidecarTarball() {
  assertNoPackagedBuildArtifacts(SIDECAR_RUNTIME);
  assertCreatorOsCliRuntime(SIDECAR_RUNTIME);
  assertExecutionWorkerRuntime(SIDECAR_RUNTIME);
  assertWorkerExternalPackages(SIDECAR_RUNTIME);
  const prunedPortableMetadata = prunePortableMetadataFiles(SIDECAR_RUNTIME);
  if (prunedPortableMetadata.length > 0) {
    console.log(
      `[build-sidecar]   ✂ tar 前删除 ${prunedPortableMetadata.length} 个 AppleDouble/.DS_Store 元数据文件`,
    );
  }
  assertNoPortableMetadataFiles(SIDECAR_RUNTIME);
  // [T-441] 打包前最后一道闸(两个调用点都覆盖):清掉指向构建机的 symlink。
  fixOutOfTreeSymlinks();
  const tarball = join(SRC_TAURI, "sidecar.tar.gz");
  // Windows 普通用户默认无“创建符号链接”权限。安装期 Rust tar 即使能展开普通文件，
  // 遇到 symlink 也可能失败；Windows 闭包本就应全部物化成真目录，因此这里硬拦而非把
  // 一颗只会在用户机爆炸的包交给付费构建。
  if (platform === "win32") {
    const leftoverLinks = countSymlinks(SIDECAR_RUNTIME);
    if (leftoverLinks !== 0) {
      throw new Error(
        `[build-sidecar] Windows tarball 必须零 symlink/junction，当前残留 ${leftoverLinks} 个`,
      );
    }
  }
  if (!shouldPackSidecarTarball()) {
    const leftoverLinks = countSymlinks(SIDECAR_RUNTIME);
    if (leftoverLinks !== 0) {
      throw new Error(
        `[build-sidecar] [T-446] Windows direct resource 必须零 symlink/junction，当前残留 ${leftoverLinks} 个`,
      );
    }
    // 防同一工作区先打 mac、再打 win 时误把旧 tar 混进 Windows bundle/build.rs。
    rmSync(tarball, { force: true });
    console.log(
      "[build-sidecar] [T-446] Windows 跳过 sidecar.tar.gz：Tauri 直接携带已展开 sidecar/ 到安装目录。",
    );
    return;
  }
  // [T-372 L2] 入口完整性链:本脚本(beforeBuildCommand)先产 tarball → 随后的 cargo 构建里
  //   src-tauri/build.rs 对它算 SHA-256 并经 rustc-env 内嵌进壳二进制 → Windows 安装期 /
  //   其他平台运行时在解压前比对，不匹配拒绝物化。哈希只在 build.rs 计算。
  console.log(`[build-sidecar] 打 sidecar.tar.gz(供 bundle resource)…`);
  // win 上必须显式用系统 bsdtar(System32\tar.exe):CI 的 bash 环境里 Git 的 GNU tar 排 PATH
  // 前面,它把 `D:\...` 的盘符当远程主机名(实测「Cannot connect to D: resolve failed」)。
  // 系统 bsdtar 处理 win 路径正确,且与用户机 lib.rs 解压器同源(W-spike 方案本意)。
  const tarBin =
    platform === "win32"
      ? join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe")
      : "tar";
  const r = spawnSync(tarBin, ["-czf", tarball, "-C", SIDECAR_RUNTIME, "."], {
    stdio: "inherit",
    env: portableTarEnv(process.env),
  });
  if (r.status !== 0) throw new Error(`[build-sidecar] tar 打包失败(exit ${r.status})`);
  assertNoAppleDoubleTarEntries(tarball, tarBin);
  verifyMacSidecarSignatureAfterTar(tarball, tarBin);
  console.log(`[build-sidecar]   → ${tarball}`);
}

// [T-413 §4 安全] 脱敏构建绝对路径 —— 消除包内 `<REPO>`(本机 `/Users/zyongzhu/…`,CI `/Users/runner/work/…`)
//   泄露的**开发者用户名 + 目录布局**。落点(实包盘点):frontend/server.js 的 outputFileTracingRoot /
//   turbopack.root、.next/required-server-files.json 的同二字段 + appDir、以及 pnpm `.bin` shim 里烘死的
//   NODE_PATH。这些绝对路径在**用户机上本就失效**(运行时全走相对/__dirname,已 boot+卡口实证替换后仍 200)
//   → 换成中性占位 `/creatoros` 零运行时风险。跨平台纯 node 实现,跳 symlink/大文件/browsers 大目录。
function sanitizeBuildPaths(root) {
  const needle = REPO; // 构建机绝对根
  const placeholder = "/creatoros";
  let count = 0;
  const sanitizeFile = (file) => {
    let st;
    try { st = lstatSync(file); } catch { return; }
    if (!st.isFile() || st.size > 1024 * 1024) return; // 跳 symlink / 大文件(路径泄露只在小文本文件)
    let text;
    try { text = readFileSync(file, "utf8"); } catch { return; }
    if (!text.includes(needle)) return;
    writeFileSync(file, text.split(needle).join(placeholder));
    count++;
  };
  // 1) 运行时配置文件(server.js + manifest)。
  for (const rel of [
    ["frontend", "server.js"],
    ["frontend", ".next", "required-server-files.json"],
  ]) {
    const f = join(root, ...rel);
    if (existsSync(f)) sanitizeFile(f);
  }
  // 2) 所有 `.bin` shim(pnpm 在 shebang/NODE_PATH 烘死构建绝对路径)。遍历只读目录元数据(廉价),
  //    仅进 `.bin` 时读小文件;不跟 symlink(pnpm 大量相对链,e.isDirectory() 对 symlink 返 false)。
  const walk = (dir) => {
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const p = join(dir, e.name);
      if (e.name === ".bin") {
        for (const f of readdirSync(p)) sanitizeFile(join(p, f));
      } else if (e.name !== "browsers") {
        walk(p); // 跳 chromium 大目录(二进制,无文本路径泄露)
      }
    }
  };
  walk(join(root, "node_modules"));
  walk(join(root, "frontend", "node_modules"));
  console.log(`[build-sidecar] 🕶 脱敏构建绝对路径 ${count} 文件(${needle} → ${placeholder};消 server.js/manifest/.bin shim 的用户名+布局泄露)`);
}

// [T-451] 烘焙 verdict-token 校验公钥。CI 从 secret CREATOROS_VERDICT_PUBKEY_B64 注入(64 字符
//   base64 → raw 32B Ed25519 公钥);写 sidecar/frontend/.next/server/verdict-verify-key.json。
//   sidecar 侧 instrumentation.ts 启动最早期读它 verify Rust 壳签发的 verdict-bound token。
//   边界处理:
//     · env 缺失(dev / 本地打包 / 未配 CI secret)→ **不写文件** + 警告日志(sidecar 起来会因文件
//       缺失 exit(1),这是设计:dev 应走 CREATOROS_DEV_MODE=1 分支,不该到 verify 路径)。
//     · env 存在但 base64 长度非 32B → throw(打包配置错,硬失败,别产不合规产物)。
//     · 目标目录 `.next/server/` 不存在 → 意味着 obfuscate/bytecode 步没跑完,硬失败。
export function bakeVerdictPublicKey() {
  const b64 = (process.env.CREATOROS_VERDICT_PUBKEY_B64 ?? "").trim();
  if (!b64) {
    console.warn(
      "[build-sidecar] ⚠ [T-451] CREATOROS_VERDICT_PUBKEY_B64 未设 —— **本次产物无 verdict 公钥文件**。" +
        "\n    · dev / 本地测试:sidecar 靠 CREATOROS_DEV_MODE=1 豁免,不影响。" +
        "\n    · 正式打包(CI):必须设 secret,否则装机用户 sidecar 起不来(instrumentation exit(1))。" +
        "\n    · 忘设的话,`gh secret set CREATOROS_VERDICT_PUBKEY_B64` 一次即可。",
    );
    return;
  }
  const raw = Buffer.from(b64, "base64");
  if (raw.length !== 32) {
    throw new Error(
      `[build-sidecar] [T-451] CREATOROS_VERDICT_PUBKEY_B64 长度非法:期望 base64 → raw 32B,得 ${raw.length}B。` +
        " 检查 secret 是否是 verdict-keygen.mjs 输出的原样(不加多余空格/换行)。",
    );
  }
  const targetDir = join(SIDECAR_RUNTIME, "frontend", ".next", "server");
  if (!existsSync(targetDir)) {
    throw new Error(
      `[build-sidecar] [T-451] 目标目录不存在,烘焙 verdict 公钥失败:${targetDir}\n` +
        "  期望顺序:build-sidecar → obfuscate → bytecode → …(此处).next/server 应已存在)。",
    );
  }
  const payload = {
    publicKeyB64: b64,
    algorithm: "ed25519",
    bakedBy: "build-sidecar.mjs T-451",
  };
  const dest = join(targetDir, "verdict-verify-key.json");
  writeFileSync(dest, JSON.stringify(payload, null, 2), "utf8");
  console.log(`[build-sidecar]   ✓ [T-451] verdict 公钥已烘焙 → ${dest}`);
}

export function assertBakedVerdictPublicKey() {
  const verified = assertVerdictPublicKey();
  const dest = join(
    SIDECAR_RUNTIME,
    "frontend",
    ".next",
    "server",
    "verdict-verify-key.json",
  );
  let baked = "";
  try {
    baked = String(JSON.parse(readFileSync(dest, "utf8")).publicKeyB64 ?? "").trim();
  } catch {
    throw new Error(
      `[build-sidecar] [T-535] 缓存 runtime 缺少或无法读取 verdict 公钥文件:${dest}`,
    );
  }
  if (baked !== verified.publicKeyB64) {
    throw new Error(
      "[build-sidecar] [T-535] 缓存 runtime 的 verdict 公钥与本轮密钥对不一致，拒绝复用；请重建 sidecar。",
    );
  }
  console.log("[build-sidecar] ✓ [T-535] 缓存 runtime verdict 公钥与本轮密钥对一致。");
}

// [T-170] 采集/扫码依赖 Playwright,但 Next output-tracing **漏掉** douyin-cdp/web-capture 里的
//   动态 `import("@playwright/test")`(playwright-core 的 .pnpm 被拖进来了,但 frontend/node_modules/
//   下没建解析链)→ 打包版一点扫码就 ERR_MODULE_NOT_FOUND → loginDouyin 抛错「扫码登录失败」。
//   修:把 @playwright/test → playwright → playwright-core 三个包**解引用实拷**进 sidecar 的
//   frontend/node_modules/(全在顶层,node 从 frontend/ walk-up 即解析)。依赖链已核实只此三包
//   (@playwright/test deps playwright;playwright deps playwright-core;playwright-core 自包含)。
//   注:chromium **浏览器二进制**(rev 1223,344M)在 ~/Library/Caches/ms-playwright,**不**在此拷
//   (bundle 体积决策留产品定;用户机有缓存即可用,分发到无缓存机器需另 bundle/首启下载,见 T-170②)。
export function linkPackageAnchor(targetDir, anchorDir) {
  rmSync(anchorDir, { recursive: true, force: true });
  mkdirSync(dirname(anchorDir), { recursive: true });
  symlinkSync(relative(dirname(anchorDir), targetDir), anchorDir, "dir");
}

export function bundlePlaywright() {
  console.log("[build-sidecar] 实拷 Playwright 包(修 Next tracing 漏 @playwright/test → 打包扫码崩)…");
  const destNm = join(SIDECAR_RUNTIME, "frontend", "node_modules");
  // 解析包真实目录:从 fromPkgJson 的上下文 require.resolve,再 walk-up 到含 package.json 的目录。
  const resolvePkgDir = (pkg, fromPkgJson) => {
    const entry = createRequire(fromPkgJson).resolve(pkg);
    let d = dirname(entry);
    while (d !== dirname(d) && !existsSync(join(d, "package.json"))) d = dirname(d);
    return d;
  };
  // **按依赖链逐级解析**:playwright/playwright-core 是传递依赖,不在 frontend/node_modules 顶层,
  //   从 frontend 直接 resolve 会 Cannot find module。故:@playwright/test(frontend 直依)→ 从它的
  //   上下文解析 playwright → 再从 playwright 上下文解析 playwright-core。
  let testDir, pwDir, coreDir;
  try {
    testDir = resolvePkgDir("@playwright/test", join(FRONTEND, "package.json"));
    pwDir = resolvePkgDir("playwright", join(testDir, "package.json"));
    coreDir = resolvePkgDir("playwright-core", join(pwDir, "package.json"));
  } catch (e) {
    throw new Error(`[build-sidecar] 解析 Playwright 包失败: ${e.message}`);
  }
  const pnpmDir = join(SIDECAR_RUNTIME, "node_modules", ".pnpm");
  let pnpmOverwrote = 0;
  for (const [pkg, srcDir] of [
    ["@playwright/test", testDir],
    ["playwright", pwDir],
    ["playwright-core", coreDir],
  ]) {
    // ① 覆盖 Next-traced 的 .pnpm 残缺版(关键):Next serverExternalPackages 运行时从
    //   `.pnpm/<pkg>@ver/node_modules/<pkg>` 解析这些外置包,而 Next tracing 只带了 JS、**漏了
    //   browsers.json 等数据文件** → chromium.launch 报「Cannot find module …/browsers.json」→ 扫码崩。
    //   (T-170 首版只拷 frontend/node_modules,Next 不从那解析 → 真机仍崩;真 app dispatch 才暴露。)
    //   用完整仓库版整体覆盖 .pnpm 下每个匹配条目。
    const destDir = join(destNm, pkg);
    const key = pkg.replace("/", "+"); // @playwright/test → @playwright+test
    const pnpmTargets = [];
    if (existsSync(pnpmDir)) {
      for (const e of readdirSync(pnpmDir).filter((x) => x.startsWith(key + "@"))) {
        const d2 = join(pnpmDir, e, "node_modules", pkg);
        rmSync(d2, { recursive: true, force: true });
        mkdirSync(dirname(d2), { recursive: true });
        cpSync(srcDir, d2, { recursive: true, dereference: true });
        pnpmTargets.push(d2);
        pnpmOverwrote++;
      }
    }
    // ② frontend/node_modules 只做解析锚。macOS/Linux 的 tar 会保留相对 symlink，
    //   直接复用上面的 .pnpm 真身；Windows 不依赖 symlink 权限，继续实拷。
    if (platform !== "win32" && pnpmTargets.length > 0) {
      linkPackageAnchor(pnpmTargets[0], destDir);
      console.log(`[build-sidecar]   链接 ${pkg} → .pnpm 真身(不再双份实拷)`);
    } else {
      rmSync(destDir, { recursive: true, force: true });
      mkdirSync(dirname(destDir), { recursive: true });
      cpSync(srcDir, destDir, { recursive: true, dereference: true });
      console.log(`[build-sidecar]   实拷 ${pkg} ← ${srcDir}`);
    }
  }
  console.log(`[build-sidecar]   覆盖 .pnpm 残缺版 ${pnpmOverwrote} 处`);
  // [T-284] 顺带把 Chromium 浏览器二进制打进 sidecar(见 bundleChromiumBrowser 注释)。
  // [T-452] CREATOROS_SKIP_CHROMIUM=1 跳,省 2-5 分钟 + 340MB 体积;视频渲染/网页截图/抖音采集
  //   会回落到运行时下载(用户机首次会等下载)。
  if (process.env.CREATOROS_SKIP_CHROMIUM === "1") {
    console.log("[build-sidecar] ⏭ [T-452] CREATOROS_SKIP_CHROMIUM=1 → 跳 bundleChromiumBrowser(用户机运行时下载 Chromium)");
  } else {
    bundleChromiumBrowser();
  }
  if (process.env.CREATOROS_PACKAGE_BUILD_ONLY === "1") {
    console.log("[build-sidecar] 资源已组装；额外运行时探针未运行。");
    return;
  }
  // 自检①:sidecar node 从 frontend/ 能否解析 @playwright/test。
  const check = spawnSync(
    process.execPath,
    ["-e", "require.resolve('@playwright/test'); console.log('OK')"],
    { cwd: join(SIDECAR_RUNTIME, "frontend"), encoding: "utf8" },
  );
  if (check.status !== 0 || !`${check.stdout}`.includes("OK")) {
    throw new Error(
      `[build-sidecar] 自检①失败:sidecar 内仍解析不到 @playwright/test\n${check.stdout}${check.stderr}`,
    );
  }
  // 自检②(硬):**每个** .pnpm playwright-core 必须有 browsers.json(chromium.launch 依赖的浏览器
  //   注册表;缺它=扫码必崩)。这条是上一版假通过的教训 —— 只查 resolve 不查数据文件不够。
  if (existsSync(pnpmDir)) {
    const cores = readdirSync(pnpmDir).filter((x) => x.startsWith("playwright-core@"));
    for (const e of cores) {
      const bj = join(pnpmDir, e, "node_modules", "playwright-core", "browsers.json");
      if (!existsSync(bj)) {
        throw new Error(`[build-sidecar] 自检②失败:.pnpm/${e} 缺 browsers.json → chromium 起不来`);
      }
    }
    console.log(`[build-sidecar]   ✓ 自检②:${cores.length} 个 .pnpm playwright-core 均含 browsers.json`);
  }
  console.log("[build-sidecar]   ✓ 自检①:sidecar 内 @playwright/test 可解析");
}

// [T-289 真机逮到根因] 实拷 gsap + hyperframes 生产闭包(补 Next tracing 漏的 dist 文件)。
//   病根:视频渲染的 gsap.min.js / hyperframes dist/cli.js 是 executor **运行时 require 的文件**,
//   Next tracing 追不到 → 打包后 sidecar 的 .pnpm 里这俩包只剩 package.json、dist 全缺 → executor
//   `resolveGsapMinJs/resolveHyperframesCli` 拿不到文件(且打包混淆 runtime 里 require.resolve 还
//   返回数字模块 ID → path.dirname(number) 崩「path 收到 number 371609」)。
//   旧修法对整个 hyperframes entry 做 dereference，会把共享依赖沿每条路径重复展开：
//   基线实测 sidecar 44,082 文件、1.21GB，其中可识别重复内容 183MB，绝大多数来自这棵嵌套树。
//   新修法复用 pnpm 图计算：
//     · macOS/Linux：闭包 entry 各一份 + 原样保留相对 symlink；
//     · Windows：闭包 hoist 成真目录，避免构建机绝对 junction，同时共享依赖只复制一次。
export function bundleRenderDeps() {
  console.log("[build-sidecar] 实拷 gsap/hyperframes 去重生产闭包(T-289/T-487)…");
  const srcPnpm = join(REPO, "node_modules", ".pnpm");
  const destPnpm = join(SIDECAR_RUNTIME, "node_modules", ".pnpm");
  if (!existsSync(srcPnpm) || !existsSync(destPnpm)) {
    throw new Error(`[build-sidecar] .pnpm 目录缺(src=${existsSync(srcPnpm)} dest=${existsSync(destPnpm)})`);
  }
  const srcEntries = readdirSync(srcPnpm);
  const roots = [];
  for (const pkg of ["gsap", "hyperframes"]) {
    const match = srcEntries.find((e) => e.startsWith(`${pkg}@`));
    if (!match) {
      throw new Error(`[build-sidecar] 源 .pnpm 无 ${pkg}@*(装依赖?)`);
    }
    roots.push(match);
  }
  if (platform === "win32") {
    for (const rootEntry of roots) {
      const destEntry = join(destPnpm, rootEntry);
      rmSync(destEntry, { recursive: true, force: true });
      const result = materializeHoistedEntryClosure(
        srcPnpm,
        [rootEntry],
        join(destEntry, "node_modules"),
      );
      console.log(
        `[build-sidecar]   [Windows] ${rootEntry}:hoist ${result.hoisted} 包` +
          `(+${result.nested} 次版本嵌套,零 junction)`,
      );
    }
  } else {
    const closure = copyPnpmClosureVerbatim(srcPnpm, destPnpm, roots);
    console.log(
      `[build-sidecar]   [${platform}] 线性实拷 ${closure.size} 个闭包 entry` +
        "(共享依赖只存一份,保留相对链)",
    );
  }
  // 自检(硬):关键 dist 文件必须到位(上一版渲染崩的教训 —— 只拷目录不查文件不够)。
  const destEntries = readdirSync(destPnpm);
  for (const [pkg, sub] of [["gsap", "dist/gsap.min.js"], ["hyperframes", "dist/cli.js"]]) {
    const m = destEntries.find((e) => e.startsWith(`${pkg}@`));
    const f = m ? join(destPnpm, m, "node_modules", pkg, sub) : "";
    if (!f || !existsSync(f)) {
      throw new Error(`[build-sidecar] 自检失败:${pkg}/${sub} 实拷后仍缺 → 视频渲染必崩`);
    }
  }
  const hyperframesEntry = destEntries.find((e) => e.startsWith("hyperframes@"));
  const hyperframesCli = join(
    destPnpm,
    hyperframesEntry,
    "node_modules",
    "hyperframes",
    "dist",
    "cli.js",
  );
  if (process.env.CREATOROS_PACKAGE_BUILD_ONLY === "1") {
    console.log("[build-sidecar] gsap 与 HyperFrames 资源已组装；CLI 启动自检未运行。");
    return;
  }
  const cliCheck = spawnSync(process.execPath, [hyperframesCli, "--help"], {
    cwd: join(SIDECAR_RUNTIME, "frontend"),
    encoding: "utf8",
  });
  if (cliCheck.status !== 0) {
    throw new Error(
      `[build-sidecar] 自检失败:HyperFrames CLI 无法启动(exit=${cliCheck.status})` +
        `\n${cliCheck.stdout}${cliCheck.stderr}`,
    );
  }
  console.log("[build-sidecar]   ✓ 自检:gsap.min.js 到位 + HyperFrames CLI --help 通过");
}

// ── pnpm 依赖闭包工具(T-313 抽出;T-383 复用)────────────────────────────────
// 某 .pnpm entry 的直接依赖 entry(读其 node_modules 下所有 symlink 的目标 → 兄弟 entry 名)。
function pnpmDepsOfEntry(srcPnpm, entryName) {
  const nm = join(srcPnpm, entryName, "node_modules");
  const out = new Set();
  if (!existsSync(nm)) return out;
  const walk = (dir) => {
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const p = join(dir, e.name);
      if (e.isSymbolicLink()) {
        let target;
        try { target = resolve(dir, readlinkSync(p)); } catch { continue; }
        // Windows 的 readlink/junction 目标是反斜杠路径,硬编码 "/.pnpm/" 会匹配失败 →
        // 整个闭包只剩根 entry(Windows 首次构建实测:xenova 闭包只拷 1 个 → onnxruntime-common
        // 缺失)。归一化为正斜杠后再匹配,pi/xenova 两处闭包共用此函数,一并修好。
        const norm = target.replace(/\\/g, "/");
        const idx = norm.indexOf("/.pnpm/");
        if (idx >= 0) {
          const entry = norm.slice(idx + "/.pnpm/".length).split("/node_modules/")[0];
          if (entry) out.add(entry);
        }
      } else if (e.isDirectory() && e.name.startsWith("@")) {
        walk(p); // scope 目录(@earendil-works 等)下继续找 symlink;真实包目录不含 symlink,无害
      }
    }
  };
  walk(nm);
  return out;
}

// [T-426 W4] .pnpm entry 的目录名**不能**当包名解析:
//   pnpm 10 在 Windows 把 virtual-store-dir-max-length 默认压到 60,长 entry 会变成
//   `@csstools+css-parser-algori_<32hex>`（版本号和完整包名都已被截掉）。旧逻辑靠第二个 `@`
//   切包名,会得到错误路径,导致 Next/Turbopack/Xenova/Pi 的嵌套物化随机漏依赖。
// 真身目录是 entry/node_modules 下唯一一个「非 symlink 且带 package.json」的包；依赖都是
// symlink/junction。直接读真身 package.json.name,同时校验目录相对路径,不再猜 pnpm 内部编码。
const entryPackageCache = new Map();

export function resolveEntryPackage(srcPnpm, entryName) {
  const cacheKey = join(resolve(srcPnpm), entryName);
  const cached = entryPackageCache.get(cacheKey);
  if (cached) return cached;

  const nmDir = join(srcPnpm, entryName, "node_modules");
  if (!existsSync(nmDir)) {
    throw new Error(`[build-sidecar] .pnpm entry 无 node_modules:${nmDir}`);
  }
  const candidates = [];
  const inspect = (pkgDir) => {
    let st;
    try { st = lstatSync(pkgDir); } catch { return; }
    if (!st.isDirectory() || st.isSymbolicLink()) return;
    const manifestPath = join(pkgDir, "package.json");
    if (!existsSync(manifestPath)) return;
    let manifest;
    try { manifest = JSON.parse(readFileSync(manifestPath, "utf8")); } catch (e) {
      throw new Error(`[build-sidecar] .pnpm entry 真身 package.json 损坏:${manifestPath}\n${e.message}`);
    }
    const name = typeof manifest.name === "string" ? manifest.name : "";
    const dirName = relative(nmDir, pkgDir).replace(/\\/g, "/");
    if (!name || name !== dirName) {
      throw new Error(
        `[build-sidecar] .pnpm entry 真身名称不一致:${manifestPath} name=${name || "<空>"} dir=${dirName}`,
      );
    }
    candidates.push({ name, dir: pkgDir });
  };

  for (const entry of readdirSync(nmDir, { withFileTypes: true })) {
    const p = join(nmDir, entry.name);
    if (entry.name.startsWith("@") && entry.isDirectory()) {
      for (const child of readdirSync(p, { withFileTypes: true })) inspect(join(p, child.name));
    } else {
      inspect(p);
    }
  }
  if (candidates.length !== 1) {
    throw new Error(
      `[build-sidecar] .pnpm entry 真身应唯一但找到 ${candidates.length} 个:${join(srcPnpm, entryName)}` +
        (candidates.length ? `\n${candidates.map((x) => `  - ${x.name}: ${x.dir}`).join("\n")}` : ""),
    );
  }
  entryPackageCache.set(cacheKey, candidates[0]);
  return candidates[0];
}

// [T-372 W] npm 经典嵌套物化:把 .pnpm entry 的包真身 + 其依赖**递归嵌套**拷到 destPkgDir
// (每个包的 node_modules 里放自己依赖的真拷贝;全真文件,零 symlink/junction)。
//   为何 Windows 需要它(CI W-diag 2026-07-18 实证):cpSync 对 pnpm 的 junction 会**静默
//   解引用成真目录且只展平一层**——entry 的 node_modules 下依赖变真拷贝,但真拷贝内部没有
//   自己的依赖 → 传递依赖(如 onnxruntime-node→onnxruntime-common)walk-up 找不到即崩。
//   嵌套布局是 Node 解析的原生语义,tar/用户机无 symlink 权限需求,天然可搬。
//   防环:seenChain 记当前链上 entry,再遇即跳(walk-up 自然命中祖先层,npm 同语义)。
//   体积:树内共享依赖重复拷(浅树可接受);mac 保持 .pnpm+相对链方案不走此路。
export function materializeNestedEntryTree(srcPnpm, entryName, destPkgDir, seenChain, isCut = () => false) {
  const srcPkg = resolveEntryPackage(srcPnpm, entryName);
  cpSync(srcPkg.dir, destPkgDir, { recursive: true, dereference: true });
  for (const depEntry of pnpmDepsOfEntry(srcPnpm, entryName)) {
    if (isCut(depEntry)) continue; // [T-426] 剪枝子树(pi 的 lazy-only provider);默认不剪(xenova 调用)
    if (depEntry === entryName) continue; // pnpm 的 self-link,跳过
    if (seenChain.has(depEntry)) continue; // 环:祖先层已有,walk-up 可命中
    const depName = resolveEntryPackage(srcPnpm, depEntry).name;
    const depDest = join(destPkgDir, "node_modules", ...depName.split("/"));
    seenChain.add(depEntry);
    materializeNestedEntryTree(srcPnpm, depEntry, depDest, seenChain, isCut);
    seenChain.delete(depEntry);
  }
}

// 从 rootEntry 出发走 pnpm symlink 依赖图 BFS 收全可达 entry(isCut 可剪子树)。
// 不硬编码版本名:与安装现场一致,自适应版本(T-313 注释详述)。
function collectPnpmClosure(srcPnpm, rootEntry, isCut = () => false) {
  const visited = new Set([rootEntry]);
  const q = [rootEntry];
  while (q.length) {
    const cur = q.shift();
    for (const d of pnpmDepsOfEntry(srcPnpm, cur)) {
      if (isCut(d)) continue;
      if (!visited.has(d)) { visited.add(d); q.push(d); }
    }
  }
  return visited;
}

// macOS/Linux 的 pnpm 链是相对 symlink。把闭包 entry 各复制一次并保留链，可让共享依赖复用
// 同一份真身；禁止对整个 entry dereference，否则一个共享依赖会沿每条依赖路径重复展开。
export function copyPnpmClosureVerbatim(
  srcPnpm,
  destPnpm,
  rootEntries,
  isCut = () => false,
) {
  const closure = new Set();
  for (const rootEntry of rootEntries) {
    for (const entry of collectPnpmClosure(srcPnpm, rootEntry, isCut)) closure.add(entry);
  }
  for (const entry of closure) {
    const src = join(srcPnpm, entry);
    const dest = join(destPnpm, entry);
    rmSync(dest, { recursive: true, force: true });
    mkdirSync(dirname(dest), { recursive: true });
    cpSync(src, dest, { recursive: true, verbatimSymlinks: true });
  }
  return closure;
}

// Windows 的 pnpm 依赖通常是指向构建机绝对路径的 junction，不能原样进安装包。把闭包按包名
// hoist 成 Node 原生可解析的真目录：每个主版本一份，共享依赖不再沿依赖树重复复制；只有同名
// 多版本时，才把次版本放到实际依赖者的 node_modules 下。
export function materializeHoistedEntryClosure(
  srcPnpm,
  rootEntries,
  destNodeModules,
  isCut = () => false,
) {
  const closure = new Set();
  for (const rootEntry of rootEntries) {
    for (const entry of collectPnpmClosure(srcPnpm, rootEntry, isCut)) closure.add(entry);
  }

  const dependedBy = new Map();
  for (const entry of closure) {
    for (const depEntry of pnpmDepsOfEntry(srcPnpm, entry)) {
      if (!closure.has(depEntry)) continue;
      if (!dependedBy.has(depEntry)) dependedBy.set(depEntry, new Set());
      dependedBy.get(depEntry).add(entry);
    }
  }

  const byName = new Map();
  for (const entry of closure) {
    const name = resolveEntryPackage(srcPnpm, entry).name;
    if (!byName.has(name)) byName.set(name, []);
    byName.get(name).push(entry);
  }

  const copyBody = (entry, destPkgDir) => {
    const src = resolveEntryPackage(srcPnpm, entry).dir;
    rmSync(destPkgDir, { recursive: true, force: true });
    mkdirSync(dirname(destPkgDir), { recursive: true });
    cpSync(src, destPkgDir, { recursive: true, dereference: true });
  };

  mkdirSync(destNodeModules, { recursive: true });
  const mainEntry = new Map();
  let hoisted = 0;
  for (const [name, entries] of byName) {
    const main = entries
      .slice()
      .sort(
        (a, b) =>
          ((dependedBy.get(a)?.size ?? 0) - (dependedBy.get(b)?.size ?? 0)) ||
          (a < b ? -1 : 1),
      )
      .pop();
    mainEntry.set(name, main);
    copyBody(main, join(destNodeModules, ...name.split("/")));
    hoisted++;
  }

  let nested = 0;
  for (const [name, entries] of byName) {
    for (const entry of entries) {
      if (entry === mainEntry.get(name)) continue;
      for (const dependent of dependedBy.get(entry) ?? []) {
        const dependentName = resolveEntryPackage(srcPnpm, dependent).name;
        copyBody(
          entry,
          join(
            destNodeModules,
            ...dependentName.split("/"),
            "node_modules",
            ...name.split("/"),
          ),
        );
        nested++;
      }
    }
  }
  return { closure, hoisted, nested };
}

// Next 对 serverExternalPackages 只追踪「本次构建实际看见的入口」。pdf-parse 在运行时还会
// 动态加载 @napi-rs/canvas 及平台原生包；开发机 node_modules 完整时不会暴露问题，但 standalone
// 可能只留下 pdf-parse 的 JS，安装包读 PDF 才报模块/原生 binding 缺失。这里从 pnpm 的真实依赖
// 图补齐整个闭包，并给 sidecar/frontend 建立 Node 可解析的顶层锚点。不是按版本硬编码文件名，
// 依赖升级后仍从 package.json 真身识别。
export function findPnpmEntryForPackage(srcPnpm, packageName, expectedVersion) {
  if (!existsSync(srcPnpm)) return null;
  // SEMANTIC_BOUNDARY_ALLOW: Codex 平台 alias 只按锁定来源版本及真实 name/os/cpu 定位原 entry。
  const codexTarget = /^@openai\/codex-(darwin|linux|win32)-(arm64|x64)$/.exec(packageName);
  if (codexTarget && (!expectedVersion || !expectedVersion.endsWith(`-${codexTarget[1]}-${codexTarget[2]}`))) return null;
  const actualName = codexTarget ? "@openai/codex" : packageName;
  for (const entry of readdirSync(srcPnpm)) {
    try {
      const body = resolveEntryPackage(srcPnpm, entry);
      if (body.name !== actualName) continue;
      const identity = JSON.parse(readFileSync(join(body.dir, "package.json"), "utf8"));
      if (expectedVersion && identity.version !== expectedVersion) continue;
      if (codexTarget && (identity.os?.length !== 1 || identity.os[0] !== codexTarget[1] ||
          identity.cpu?.length !== 1 || identity.cpu[0] !== codexTarget[2])) continue;
      return entry;
    } catch {
      // .pnpm 中允许存在 lock/元数据目录；它们不是包 entry，跳过即可。
    }
  }
  return null;
}

export function materializeRuntimePackageClosure({
  srcPnpm,
  runtimeRoot,
  packageName,
  targetPlatform = platform,
}) {
  const rootEntry = findPnpmEntryForPackage(srcPnpm, packageName);
  if (!rootEntry) {
    throw new Error(`[build-sidecar] 源 .pnpm 缺 ${packageName}，无法补齐桌面运行时依赖`);
  }

  const frontendNodeModules = join(runtimeRoot, "frontend", "node_modules");
  mkdirSync(frontendNodeModules, { recursive: true });
  if (targetPlatform === "win32") {
    return {
      rootEntry,
      ...materializeHoistedEntryClosure(srcPnpm, [rootEntry], frontendNodeModules),
    };
  }

  const destPnpm = join(runtimeRoot, "node_modules", ".pnpm");
  mkdirSync(destPnpm, { recursive: true });
  const closure = copyPnpmClosureVerbatim(srcPnpm, destPnpm, [rootEntry]);
  // 不只锚定根包。pdf-parse 的运行时会动态 import @napi-rs/canvas，而 canvas
  // 又会动态加载目标平台的原生包；这些动态依赖不会沿静态 import trace 自动获得
  // frontend/node_modules 顶层入口。为整个闭包建立相对 symlink，既保留 pnpm 的
  // 单份真身，也保证 standalone 里的任一动态 import 都能按 Node 规则解析。
  for (const entry of closure) {
    const entryPackage = resolveEntryPackage(destPnpm, entry);
    const anchor = join(
      frontendNodeModules,
      ...entryPackage.name.split("/"),
    );
    rmSync(anchor, { recursive: true, force: true });
    mkdirSync(dirname(anchor), { recursive: true });
    symlinkSync(relative(dirname(anchor), entryPackage.dir), anchor, "dir");
  }
  return { rootEntry, closure };
}

/** Worker 的外置纯 JS 解析器，复用原闭包复制工具，不依赖 Next 的导入追踪。 */
function bundleWorkerExternalPackages() {
  const srcPnpm = join(REPO, "node_modules", ".pnpm");
  const destPnpm = join(SIDECAR_RUNTIME, "node_modules", ".pnpm");
  const declared = JSON.parse(readFileSync(join(REPO, "ai-worker/package.json"), "utf8")).dependencies;
  for (const request of workerExternalPackages) {
    const packageName = request.replace(/\/package\.json$/, "");
    const codexNative = packageName === `@openai/codex-${platform}-${arch}`;
    const version = declared["@openai/codex"];
    const expectedVersion = codexNative && /^\d+\.\d+\.\d+$/.test(version ?? "")
      ? `${version}-${platform}-${arch}`
      : /^\d+\.\d+\.\d+$/.test(declared[packageName] ?? "") ? declared[packageName] : undefined;
    if (codexNative) {
      const ownerEntry = findPnpmEntryForPackage(srcPnpm, "@openai/codex", version);
      if (!ownerEntry) throw new Error("[build-sidecar] Codex 根包缺失或版本不匹配");
      const nativeOwner = JSON.parse(readFileSync(join(resolveEntryPackage(srcPnpm, ownerEntry).dir, "package.json"), "utf8"));
      if (!expectedVersion || nativeOwner.optionalDependencies?.[packageName] !== `npm:@openai/codex@${expectedVersion}`) {
        throw new Error(`[build-sidecar] Codex npm alias 声明不匹配：${packageName}`);
      }
    }
    const entry = findPnpmEntryForPackage(srcPnpm, packageName, expectedVersion);
    if (!entry) throw new Error(`[build-sidecar] Worker 必备依赖缺失：${packageName}`);
    const anchor = join(SIDECAR_RUNTIME, "frontend/node_modules", ...packageName.split("/"));
    rmSync(anchor, { recursive: true, force: true });
    mkdirSync(dirname(anchor), { recursive: true });
    if (platform === "win32") {
      materializeNestedEntryTree(srcPnpm, entry, anchor, new Set([entry]));
    } else {
      mkdirSync(destPnpm, { recursive: true });
      copyPnpmClosureVerbatim(srcPnpm, destPnpm, [entry]);
      const body = resolveEntryPackage(destPnpm, entry).dir;
      symlinkSync(relative(dirname(anchor), body), anchor, "dir");
    }
  }
  assertWorkerExternalPackages(SIDECAR_RUNTIME);
}

export function canvasNativePackageFor(
  targetPlatform = platform,
  targetArch = arch,
) {
  const key = `${targetPlatform}-${targetArch}`;
  return {
    "darwin-arm64": "@napi-rs/canvas-darwin-arm64",
    "darwin-x64": "@napi-rs/canvas-darwin-x64",
    "win32-x64": "@napi-rs/canvas-win32-x64-msvc",
    "linux-x64": "@napi-rs/canvas-linux-x64-gnu",
    "linux-arm64": "@napi-rs/canvas-linux-arm64-gnu",
  }[key] ?? null;
}

function bundlePdfAttachmentRuntime() {
  console.log(
    "[build-sidecar] 补齐 PDF/Word 附件解析运行时(pdf-parse → canvas 原生闭包)…",
  );
  const srcPnpm = join(REPO, "node_modules", ".pnpm");
  const result = materializeRuntimePackageClosure({
    srcPnpm,
    runtimeRoot: SIDECAR_RUNTIME,
    packageName: "pdf-parse",
    targetPlatform: platform,
  });
  const nativePackage = canvasNativePackageFor(platform, arch);
  if (!nativePackage) {
    throw new Error(
      `[build-sidecar] @napi-rs/canvas 暂未声明 ${platform}/${arch} 的随包原生闭包`,
    );
  }

  const frontendNodeModules = join(SIDECAR_RUNTIME, "frontend", "node_modules");
  for (const packageName of ["pdf-parse", "@napi-rs/canvas", nativePackage]) {
    const packageJson = join(frontendNodeModules, ...packageName.split("/"), "package.json");
    if (!existsSync(packageJson)) {
      throw new Error(`[build-sidecar] PDF 运行时闭包缺 ${packageName}/package.json`);
    }
  }

  if (process.env.CREATOROS_PACKAGE_BUILD_ONLY === "1") {
    console.log("[build-sidecar] 资源已组装；额外运行时探针未运行。");
    return;
  }
  // 真 import，而不是只看文件存在：会连带加载平台 .node binding。缺原生包时构建当场失败，
  // 不把“开发环境能读 PDF、安装包不能读”的假绿包交给用户。
  const probe = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      "await import('pdf-parse'); await import('@napi-rs/canvas'); process.stdout.write('PDF-RUNTIME-OK')",
    ],
    { cwd: join(SIDECAR_RUNTIME, "frontend"), encoding: "utf8" },
  );
  if (probe.status !== 0 || !probe.stdout.includes("PDF-RUNTIME-OK")) {
    throw new Error(
      `[build-sidecar] PDF 运行时真加载失败:\n${probe.stderr || probe.stdout}`,
    );
  }
  const count = result.closure?.size ?? result.hoisted ?? 0;
  console.log(`[build-sidecar]   ✓ PDF 附件解析闭包 ${count} 个包，原生加载通过`);
}

// CreatorOS 的 transformers 运行在 Node sidecar，后端会固定选择 onnxruntime-node。
// onnxruntime-web 仍是包级静态依赖，但其 *.wasm 仅浏览器后端按需加载；@xenova/transformers
// 自己的 dist 里还保留一套浏览器资产。删掉依赖包中的第二套 WASM，并在后续 Node 真加载
// 自检中兜底，避免四个 9-10MB 文件重复进入安装包。
export function pruneOnnxRuntimeWebWasm(pnpmRoot) {
  if (!existsSync(pnpmRoot)) return 0;
  let pruned = 0;
  for (const entry of readdirSync(pnpmRoot)) {
    if (!entry.startsWith("onnxruntime-web@")) continue;
    const dist = join(
      pnpmRoot,
      entry,
      "node_modules",
      "onnxruntime-web",
      "dist",
    );
    if (!existsSync(dist)) continue;
    for (const file of readdirSync(dist)) {
      if (!/^ort-wasm.*\.wasm$/.test(file)) continue;
      rmSync(join(dist, file), { force: true });
      pruned++;
    }
  }
  return pruned;
}

function sha256FileSync(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

// onnxruntime-node 的 macOS/Linux 包会把同一动态库同时保存为“完整版本名”和“ABI 名”两个
// 真文件。动态加载器确实需要两个名字，但不需要两份字节；确认内容完全相同后把 ABI 名改成
// 相对 symlink。Windows DLL 没有这组别名，因此保持不动。
export function dedupeIdenticalOnnxAliases(
  pnpmRoot,
  targetPlatform = platform,
  targetArch = arch,
) {
  if (targetPlatform === "win32" || !existsSync(pnpmRoot)) return 0;
  let deduped = 0;
  for (const entry of readdirSync(pnpmRoot)) {
    if (!entry.startsWith("onnxruntime-node@")) continue;
    const binRoot = join(
      pnpmRoot,
      entry,
      "node_modules",
      "onnxruntime-node",
      "bin",
    );
    if (!existsSync(binRoot)) continue;
    for (const napi of readdirSync(binRoot)) {
      const leaf = join(binRoot, napi, targetPlatform, targetArch);
      if (!existsSync(leaf)) continue;
      const files = readdirSync(leaf);
      const full =
        targetPlatform === "darwin"
          ? files.find((file) => /^libonnxruntime\.\d+\.\d+\.\d+\.dylib$/.test(file))
          : files.find((file) => /^libonnxruntime\.so\.\d+\.\d+\.\d+$/.test(file));
      const alias =
        targetPlatform === "darwin"
          ? files.find((file) => /^libonnxruntime\.\d+\.dylib$/.test(file))
          : files.find((file) => /^libonnxruntime\.so\.\d+$/.test(file));
      if (!full || !alias) continue;
      const fullPath = join(leaf, full);
      const aliasPath = join(leaf, alias);
      const fullStat = lstatSync(fullPath);
      const aliasStat = lstatSync(aliasPath);
      if (
        !fullStat.isFile() ||
        !aliasStat.isFile() ||
        fullStat.size !== aliasStat.size ||
        sha256FileSync(fullPath) !== sha256FileSync(aliasPath)
      ) {
        continue;
      }
      rmSync(aliasPath, { force: true });
      symlinkSync(full, aliasPath);
      deduped++;
    }
  }
  return deduped;
}

// [T-426 W] Windows:把主 standalone 的 next 运行时闭包**扁平 hoist** 物化进 frontend/node_modules。
//   病根(2026-07-19 阿里云无影真机实证):main() 的
//   `cpSync(STANDALONE_SRC, SIDECAR_RUNTIME, {verbatimSymlinks:true})` 在 mac(pnpm 用**相对**
//   symlink)拷完自洽,但 **Windows pnpm 用绝对 junction**(frontend/node_modules/next →
//   `D:\a\<repo>\node_modules\.pnpm\next@…`,指向 CI 构建机盘符);verbatim 原样保留字面目标 → tar
//   存绝对路径 → 用户机解压后 junction 指向不存在的 `D:\` → `frontend/server.js:16` 的
//   `require('next')` 抛 `MODULE_NOT_FOUND` → sidecar 不 listen → webview「127.0.0.1 拒绝连接」白屏。
//   顶层 6 包里 playwright/xenova 已各自 bundleXXX(有 win 分支)物化为真文件,**唯 next/bytenode 仍走
//   verbatim → 断链**。
//   修:从源 REPO .pnpm 以 next+bytenode 为根 BFS 收运行时闭包(实测 64 entry),每包**真身**扁平拷进
//   frontend/node_modules 顶层(线性 ~349MB,零链;node 从 sidecar/frontend walk-up 即命中 —— spike
//   实测扁平结构可 require next/react/react-dom)。为何**不**嵌套物化(materializeNestedEntryTree):
//   64-entry 深依赖图按路径展开次数指数级、next 真身 169MB 会沿多条路径重复拷 → 体积爆炸;扁平每包
//   一份=线性。多版本冲突(实测仅 semver×2):主版本(闭包内被依赖最多者)hoist 顶层 + 次版本嵌套到
//   其依赖者的 node_modules(npm 经典 hoist 语义,保各自解析到正确版本)。硬自检真 require('next')
//   (失败即 build 炸,不出必白屏的包 —— 教训同 playwright/xenova 自检②)。
//   mac/linux **不走此路**(platform 守卫;main 的 line 986 verbatim .pnpm 原方案逐字节零改动)。
//   ⚠️ Windows junction 拷贝行为 mac 无法复现:本函数逻辑靠 spike(解析正确性,平台无关)+ CI 出包
//   自检 + 用户真机三重验证。
function materializeStandaloneWin() {
  const srcPnpm = join(REPO, "node_modules", ".pnpm");
  const feNm = join(SIDECAR_RUNTIME, "frontend", "node_modules");
  if (!existsSync(srcPnpm)) {
    throw new Error(`[build-sidecar] [T-426 W] 源 .pnpm 缺(${srcPnpm})—— 无法物化 next 闭包`);
  }
  // 闭包根:主 standalone 顶层走 verbatim 的坏 junction 包(next 必有;bytenode=T-419 L3,可缺)。
  //   自适应版本 hash:从源 .pnpm 找 <name>@ 开头 entry(不硬编码版本 → 升级不失配)。
  const roots = [];
  for (const n of ["next", "bytenode"]) {
    const e = readdirSync(srcPnpm).find((x) => x.startsWith(n + "@"));
    if (e) roots.push(e);
    else if (n === "next") {
      throw new Error(`[build-sidecar] [T-426 W] 源 .pnpm 无 next@*(装依赖?)→ 打包版必白屏,不出包`);
    }
  }
  // BFS 收运行时闭包。
  const closure = new Set();
  for (const r of roots) for (const e of collectPnpmClosure(srcPnpm, r)) closure.add(e);
  // 闭包内反向依赖图(选主版本 + 定次版本嵌套位置)。
  const dependedBy = new Map(); // entry → Set(闭包内依赖它的 entry)
  for (const e of closure) {
    for (const d of pnpmDepsOfEntry(srcPnpm, e)) {
      if (!closure.has(d)) continue;
      if (!dependedBy.has(d)) dependedBy.set(d, new Set());
      dependedBy.get(d).add(e);
    }
  }
  // 按包名分组(同名多 entry = 多版本)。
  const byName = new Map();
  for (const e of closure) {
    const name = resolveEntryPackage(srcPnpm, e).name;
    if (!byName.has(name)) byName.set(name, []);
    byName.get(name).push(e);
  }
  // 取 entry 的包真身目录(entry/node_modules/<pkgName>;不含它对兄弟 dep 的链,dep 从 hoist 顶层解析)。
  const copyBody = (entry, destPkgDir) => {
    const src = resolveEntryPackage(srcPnpm, entry).dir;
    rmSync(destPkgDir, { recursive: true, force: true });
    mkdirSync(dirname(destPkgDir), { recursive: true });
    cpSync(src, destPkgDir, { recursive: true, dereference: true });
  };
  // ① 每包名主版本(闭包内被依赖最多者;并列取 entry 名较大)hoist 到 frontend/node_modules 顶层。
  const mainEntry = new Map(); // name → 主 entry
  let hoisted = 0;
  for (const [name, entries] of byName) {
    const main = entries
      .slice()
      .sort((a, b) => ((dependedBy.get(a)?.size ?? 0) - (dependedBy.get(b)?.size ?? 0)) || (a < b ? -1 : 1))
      .pop();
    mainEntry.set(name, main);
    copyBody(main, join(feNm, ...name.split("/")));
    hoisted++;
  }
  // ② 次版本嵌套到其(闭包内)依赖者的顶层 hoist 包下 → 依赖者就近命中它需要的那个版本。
  let nested = 0;
  for (const [name, entries] of byName) {
    for (const e of entries) {
      if (e === mainEntry.get(name)) continue;
      for (const dep of dependedBy.get(e) ?? []) {
        const depName = resolveEntryPackage(srcPnpm, dep).name;
        copyBody(e, join(feNm, ...depName.split("/"), "node_modules", ...name.split("/")));
        nested++;
      }
    }
  }
  console.log(
    `[build-sidecar]   [T-426 W] 扁平 hoist next 闭包 ${hoisted} 包(+${nested} 次版本嵌套;替坏 junction 为真身,零链)`,
  );
  // [T-426 补] 再物化 .next/node_modules/ 下 Turbopack external 的 hash symlink（pglite-*/pg-* → 死链）。
  materializeNextExternalsWin();
  if (process.env.CREATOROS_PACKAGE_BUILD_ONLY === "1") {
    console.log("[build-sidecar] 资源已组装；额外运行时探针未运行。");
    return;
  }
  // ③ 硬自检:sidecar 内真 require next + react/react-dom(server.js 启动关键路径)。失败即 build 炸,
  //    不出必白屏的包(教训同 playwright/xenova 自检②:只拷不验会假通过,装机才暴露)。
  const check = spawnSync(
    process.execPath,
    ["-e", "require('next'); require('react'); require('react-dom'); console.log('WIN-NEXT-OK ' + require.resolve('next'))"],
    { cwd: join(SIDECAR_RUNTIME, "frontend"), encoding: "utf8" },
  );
  if (check.status !== 0 || !`${check.stdout}`.includes("WIN-NEXT-OK")) {
    throw new Error(
      `[build-sidecar] 自检失败[T-426 W]:hoist 后 sidecar 内 require('next') 未通过 → Windows 打包版必白屏\n${check.stdout}${check.stderr}`,
    );
  }
  console.log(`[build-sidecar]   ✓ 自检[T-426 W]:sidecar 内 require('next')/react/react-dom 通过`);
}

// [T-313 打包实拷] 实拷 Pi 引擎(@earendil-works/pi-coding-agent)运行时依赖闭包进 sidecar。
//   病根:pi-engine.ts 运行时**深文件导入** `dist/core/sdk.js`(+ model-registry/auth-storage/
//   session-manager),而 pi 是 serverExternalPackages + 动态 import → Next standalone tracing
//   **整棵 pi 树没拖进 sidecar**(实测:打包 sidecar 的 .pnpm 里 0 个 pi-coding-agent / openai / chalk
//   / debug / ws)→ locatePiCoreDir() 找不到 sdk.js → Agent Worker 无法启动,「点亮」名存实亡。
//   修:照 playwright/gsap 三件套,把 pi 的**完整依赖闭包**实拷进 sidecar node_modules/.pnpm。
//
//   闭包如何算(不硬编码版本名 —— pi 版本一升,peer-suffix 目录名全变,硬编码会静默失配):
//     从源 .pnpm 的 pi-coding-agent 条目出发,**走 pnpm 的 symlink 依赖图**(每个 <entry>/node_modules/
//     下的相对 symlink → 兄弟 entry),BFS 收全可达 entry。→ 与安装现场一致,自适应版本。
//   为何**保留 symlink**(verbatimSymlinks,不 dereference):pi 树是深传递依赖(pi-coding-agent →
//     pi-ai → openai → ws …),pnpm 靠每个 entry 的 `../../<dep>@ver` 相对 symlink 逐级解析。整份闭包
//     都拷进同一个 .pnpm/ 后,这些相对链在 sidecar 内自洽解析(与主 standalone 树同款 verbatim 拷法),
//     且**共享依赖只存一份**(实测 ~90MB;若 dereference 会因逐 entry 展平既撑大体积又断传递解析链)。
//   L3 剪枝(控体积):pi-ai 的 provider api 是 `*.lazy.js` → 运行时才动态 import 具体 provider `.js`
//     (静态图**不**引 @aws-sdk/@google/@mistralai;装 0.80.7 现场核实)。CreatorOS 的 piApiForFormat
//     只产 "anthropic-messages" / "openai-completions" / "openai-responses" 三种 api →
//     bedrock/google/mistral 三个 provider
//     **永不被 import**。故剪掉这三个 provider 顶包(连带其独占传递依赖 @smithy/@protobufjs/google-auth
//     等,省 ~91MB);**openai + @anthropic-ai/sdk 必留**(三种格式共用这两项,均在闭包内)。剪枝安全网 =
//     下面 HARD 自检真深导入 sdk.js:若剪多了导致 import 崩,build 直接失败(不假通过)。
function bundlePiEngine() {
  console.log("[build-sidecar] 实拷 Pi 引擎依赖闭包(修 Next tracing 漏整棵 pi 树 → 打包版 Pi 引擎失活,T-313)…");
  const srcPnpm = join(REPO, "node_modules", ".pnpm");
  const destPnpm = join(SIDECAR_RUNTIME, "node_modules", ".pnpm");
  if (!existsSync(srcPnpm) || !existsSync(destPnpm)) {
    throw new Error(`[build-sidecar] .pnpm 目录缺(src=${existsSync(srcPnpm)} dest=${existsSync(destPnpm)})`);
  }
  const PI_PKG = "@earendil-works/pi-coding-agent";
  const PI_PNPM = PI_PKG.replace("/", "+"); // scope "/"→"+"(pnpm 目录名编码)
  // lazy-only 且 CreatorOS 永不用的 provider 顶包 —— 剪掉不进闭包(连带其独占传递依赖)。
  const CUT_PKG = ["@aws-sdk/client-bedrock-runtime", "@google/genai", "@mistralai/mistralai"];
  const isCut = (entry) => CUT_PKG.includes(resolveEntryPackage(srcPnpm, entry).name);

  // Pi 是独立 Agent Worker 的必备运行时；缺包时不能产出残缺安装包。
  const rootEntry = readdirSync(srcPnpm).find((x) => x.startsWith(`${PI_PNPM}@`));
  if (!rootEntry) throw new Error(`[build-sidecar] 缺少必备 Pi 运行时 ${PI_PKG}`);

  // BFS 算闭包(剪掉 provider 顶包子树)。
  const visited = collectPnpmClosure(srcPnpm, rootEntry, isCut);

  let copied = 0;
  if (platform === "win32") {
    // [T-426 W] Windows:pnpm 的相对 symlink 在 Win 是**绝对 junction**,verbatim 拷进 .pnpm 后指向
    //   构建机 D:\a\ → 用户机死链 → pi-engine 深导入 sdk.js 的传递依赖(pi-ai/pi-agent-core/ws…)断
    //   → pi 引擎失活(现有 HARD 自检在**构建机** junction 有效故假过,只有用户机才崩,同 next 白屏根因)。
    //   改**嵌套物化**整棵 pi 树到 pi-engine locatePiCoreDir 找的确切位置
    //   (destPnpm/<rootEntry>/node_modules/PI_PKG,= 下方 coreDir 的父父父),全真文件零链、isCut 同剪
    //   provider(spike 实测 177MB、深导入 sdk.js+3 兄弟通过)。mac 走下方 verbatim .pnpm 闭包原方案。
    const piBody = join(destPnpm, rootEntry, "node_modules", ...PI_PKG.split("/"));
    rmSync(piBody, { recursive: true, force: true });
    mkdirSync(dirname(piBody), { recursive: true });
    materializeNestedEntryTree(srcPnpm, rootEntry, piBody, new Set([rootEntry]), isCut);
    copied = 1;
    console.log(`[build-sidecar]   [T-426 W] 嵌套物化 pi 闭包 → .pnpm/${rootEntry}/…/${PI_PKG}(全真文件零链,剪 provider)`);
  } else {
    // 逐 entry 实拷(verbatimSymlinks 保相对链;整份闭包在同一 .pnpm/ 内自洽解析)。
    //   覆盖已存在条目无害:同版本源自同一仓库 .pnpm,内容一致(complete ⊇ Next 部分 trace),app 不受损。
    for (const e of visited) {
      const src = join(srcPnpm, e);
      const dest = join(destPnpm, e);
      rmSync(dest, { recursive: true, force: true });
      mkdirSync(dirname(dest), { recursive: true });
      cpSync(src, dest, { recursive: true, verbatimSymlinks: true });
      copied++;
    }
    console.log(`[build-sidecar]   实拷 ${copied} 个 pi 闭包 entry(剪 bedrock/google/mistral;含 openai+@anthropic-ai/sdk)`);
  }

  // photon-node 的 .wasm 特殊资源核实(纯文件,mac verbatim 布局在 destPnpm/<photonEntry>;缺则 pi
  //   图像工具会崩)。Windows 走嵌套物化,photon 落在 pi 树内深处、路径不定 → 跳过此定点自检,由下方
  //   HARD 深导入 sdk.js(嵌套树完整性总检)兜底。
  const photonEntry = [...visited].find((e) => e.startsWith("@silvia-odwyer+photon-node@"));
  if (photonEntry && platform !== "win32") {
    const wasm = join(destPnpm, photonEntry, "node_modules", "@silvia-odwyer", "photon-node", "photon_rs_bg.wasm");
    if (!existsSync(wasm)) {
      throw new Error(`[build-sidecar] 自检失败[T-313]:photon-node .wasm 未随实拷到位(${wasm})`);
    }
    console.log("[build-sidecar]   ✓ photon-node photon_rs_bg.wasm 到位");
  }

  if (process.env.CREATOROS_PACKAGE_BUILD_ONLY === "1") {
    console.log("[build-sidecar] 资源已组装；额外运行时探针未运行。");
    return;
  }
  // HARD 自检:sidecar node **真深导入** sdk.js + 三个兄弟 + CreatorOS 会用的三种 wire API,
  //   断言 createAgentSession / provider factory 都是函数。这条同时验证:
  //   ①闭包完整(任一 entry 漏 → 相对 symlink 悬空 → import 崩)②剪枝安全(cut 的 provider 不在静态图)。
  //   假通过零容忍(教训同 playwright 自检②):import 崩则 throw,宁 build 失败也不出 Agent Worker 无法启动的包。
  const coreDir = join(destPnpm, rootEntry, "node_modules", PI_PKG, "dist", "core");
  const selfCheck = `
    import { existsSync } from 'node:fs';
    import { pathToFileURL } from 'node:url';
    import path from 'node:path';
    const base = ${JSON.stringify(coreDir)};
    const imp = (f) => import(pathToFileURL(path.join(base, f)).href);
    const [sdk, mr, as, sm] = await Promise.all([imp('sdk.js'), imp('model-registry.js'), imp('auth-storage.js'), imp('session-manager.js')]);
    const packageRoot = path.dirname(path.dirname(base));
    const apiDir = [
      path.join(packageRoot, 'node_modules', '@earendil-works', 'pi-ai', 'dist', 'api'),
      path.join(base, '..', '..', '..', '..', '@earendil-works', 'pi-ai', 'dist', 'api'),
    ].find(existsSync);
    if (!apiDir) { console.error('PI-API-DIR-MISSING'); process.exit(1); }
    const apiImp = (f) => import(pathToFileURL(path.join(apiDir, f)).href);
    const [responses, completions, anthropic] = await Promise.all([
      apiImp('openai-responses.lazy.js'),
      apiImp('openai-completions.lazy.js'),
      apiImp('anthropic-messages.lazy.js'),
    ]);
    const apiOk =
      typeof responses.openAIResponsesApi === 'function' &&
      typeof completions.openAICompletionsApi === 'function' &&
      typeof anthropic.anthropicMessagesApi === 'function';
    const ok = typeof sdk.createAgentSession === 'function' && !!mr.ModelRegistry && !!as.AuthStorage && !!sm.SessionManager && apiOk;
    console.log('PI createAgentSession=' + typeof sdk.createAgentSession + ' ModelRegistry=' + !!mr.ModelRegistry + ' AuthStorage=' + !!as.AuthStorage + ' SessionManager=' + !!sm.SessionManager + ' APIs=' + apiOk);
    if (!ok) { console.error('PI-SELFCHECK-FAIL'); process.exit(1); }
    console.log('PI-SELFCHECK-OK');
  `;
  const r = spawnSync(process.execPath, ["--input-type=module", "-e", selfCheck], {
    cwd: join(SIDECAR_RUNTIME, "frontend"),
    encoding: "utf8",
  });
  if (r.status !== 0 || !`${r.stdout}`.includes("PI-SELFCHECK-OK")) {
    throw new Error(
      `[build-sidecar] 自检失败[T-313]:sidecar 内深导入 pi sdk.js 未通过 → 打包版 Pi 引擎会失活\n${r.stdout}${r.stderr}`,
    );
  }
  console.log(`[build-sidecar]   ✓ 自检:sidecar 深导入 pi sdk.js 通过(${`${r.stdout}`.trim().split("\n").pop()})`);
}

// [T-383] 实拷 @xenova/transformers 完整闭包(修打包版 whisper-local 崩
//   「Cannot find module '@xenova/transformers'」)。
//   病根:T-356 把 whisper 推理挪进 worker_threads(eval 内联源码,worker 内
//   `createRequire(<cwd>/package.json)` 解析 @xenova/transformers,cwd = sidecar/frontend)→
//   Next standalone tracing ①追不到 eval 字符串里的 require;②对主线程惰性 import 只 trace 出
//   **残缺包**(sidecar .pnpm 里只剩 package.json + src,dist 全缺);③frontend/node_modules 顶层
//   没有 @xenova 解析锚 → 打包版 worker require 必崩。此前 T-225/T-225b 只补拷了它的原生**依赖**
//   (onnxruntime dylib / sharp .node),主包本体一直没进 sidecar。
//   修(照 playwright/pi 三件套先例):
//     ① 从源 .pnpm 以 @xenova+transformers 为根 BFS 收依赖闭包(@huggingface/jinja、
//        onnxruntime-node/web/common、sharp@0.32.x 及其传递依赖),verbatimSymlinks 整拷覆盖
//        sidecar .pnpm 残缺版(相对 symlink 在闭包内自洽解析,同 bundlePiEngine 拷法;含 sharp
//        build/Release 与 onnxruntime bin/ 原生产物 —— 后续 ensureOnnxRuntimeDylib/ensureSharpNative
//        仍作安全网跑一遍)。
//     ② 建解析锚:sidecar/frontend/node_modules/@xenova/transformers → 相对 symlink 指进 .pnpm
//        真身(与 sidecar 里 next 的链同款;worker 从 cwd=sidecar/frontend walk-up 即命中;tar 打包
//        原样保留 symlink)。
//     ③ HARD 自检:sidecar node 以**与 worker 完全相同的调用路径**(cwd=sidecar/frontend,
//        createRequire(<cwd>/package.json) → req('@xenova/transformers'))真加载主包,断言 pipeline
//        是函数 —— 真加载会连带 dlopen onnxruntime binding + sharp .node,把 T-225/T-225b 层一并
//        验掉;失败即 build 炸(教训同 playwright 自检②:只拷不验会假通过,装机后才发现)。
function bundleXenovaTransformers() {
  console.log("[build-sidecar] 实拷 @xenova/transformers 闭包(修 T-356 worker 化后打包版 whisper-local 崩,T-383)…");
  const srcPnpm = join(REPO, "node_modules", ".pnpm");
  const destPnpm = join(SIDECAR_RUNTIME, "node_modules", ".pnpm");
  if (!existsSync(srcPnpm) || !existsSync(destPnpm)) {
    throw new Error(`[build-sidecar] .pnpm 目录缺(src=${existsSync(srcPnpm)} dest=${existsSync(destPnpm)})`);
  }
  const PKG = "@xenova/transformers";
  const PNPM_KEY = PKG.replace("/", "+"); // @xenova/transformers → @xenova+transformers
  const rootEntry = readdirSync(srcPnpm).find((x) => x.startsWith(`${PNPM_KEY}@`));
  if (!rootEntry) {
    // whisper-local 是产品内置 ASR 默认档;缺它不出「转录必崩」的包 —— 硬失败,不学 pi 的软跳过。
    throw new Error(`[build-sidecar] 源 .pnpm 无 ${PKG}@*(装依赖?)→ 打包版 whisper-local 必崩,不出包`);
  }
  const anchorDir = join(SIDECAR_RUNTIME, "frontend", "node_modules", "@xenova");
  const anchor = join(anchorDir, "transformers");
  mkdirSync(anchorDir, { recursive: true });
  rmSync(anchor, { recursive: true, force: true });
  const napiRoots = []; // onnxruntime-node/bin/napi-v3 位置(两种布局各自登记,统一剪枝)
  if (platform === "win32") {
    // [T-372 W] Windows:cpSync 对 pnpm junction 静默 deref 且只展平一层 → 传递依赖断
    //   (CI W-diag 实证:@xenova entry 下 onnxruntime-node 成真目录,其 require
    //   'onnxruntime-common' walk-up 无处命中)。改 npm 经典嵌套物化直接落 anchor 位置:
    //   全真文件零链,tar/用户机无 symlink 权限需求。mac 走下方 .pnpm+相对链原方案不动。
    materializeNestedEntryTree(srcPnpm, rootEntry, anchor, new Set([rootEntry]));
    console.log(`[build-sidecar]   嵌套物化 @xenova/transformers 全树 → frontend/node_modules(win 无链布局)`);
    const walk = (dir, depth) => {
      if (depth > 8) return;
      for (const n of readdirSync(dir, { withFileTypes: true })) {
        if (!n.isDirectory()) continue;
        const p = join(dir, n.name);
        if (n.name === "onnxruntime-node") {
          const cand = join(p, "bin", "napi-v3");
          if (existsSync(cand)) napiRoots.push(cand);
        } else walk(p, depth + 1);
      }
    };
    walk(anchor, 0);
  } else {
    // ① BFS 闭包 + verbatim 整拷覆盖(不剪枝:sharp/onnxruntime 树都是运行时真用的)。
    const closure = collectPnpmClosure(srcPnpm, rootEntry);
    let copied = 0;
    for (const e of closure) {
      const src = join(srcPnpm, e);
      const dest = join(destPnpm, e);
      rmSync(dest, { recursive: true, force: true });
      mkdirSync(dirname(dest), { recursive: true });
      cpSync(src, dest, { recursive: true, verbatimSymlinks: true });
      copied++;
    }
    console.log(`[build-sidecar]   实拷 ${copied} 个 transformers 闭包 entry(覆盖 Next-traced 残缺版)`);
    for (const e of closure) {
      const cand = join(destPnpm, e, "node_modules", "onnxruntime-node", "bin", "napi-v3");
      if (existsSync(cand)) napiRoots.push(cand);
    }
    // ② 解析锚:frontend/node_modules/@xenova/transformers → .pnpm 真身(相对链;worker cwd walk-up 命中)。
    symlinkSync(
      join("..", "..", "..", "node_modules", ".pnpm", rootEntry, "node_modules", "@xenova", "transformers"),
      anchor,
    );
  }
  // ①b [T-383 修打包炸] 平台剪枝:onnxruntime-node 自带**全平台** bin(linux/win32/x64…),
  //   T-225 自检遍历所有 binding 目录要求本机 libExt → 异平台目录必炸(且分发包不该带异平台二进制,
  //   剪掉省体积)。只留 bin/napi-v3/<本机 platform>/<本机 arch>,其余目录整删。
  {
    let pruned = 0;
    for (const root of napiRoots) {
      for (const plat of readdirSync(root)) {
        const platDir = join(root, plat);
        if (plat !== platform) { rmSync(platDir, { recursive: true, force: true }); pruned++; continue; }
        for (const a of readdirSync(platDir)) {
          if (a !== arch) { rmSync(join(platDir, a), { recursive: true, force: true }); pruned++; }
        }
      }
    }
    if (pruned > 0) console.log(`[build-sidecar]   ✂ onnxruntime 异平台 bin 剪枝 ${pruned} 个目录(只留 ${platform}/${arch})`);
  }
  const prunedWebWasm = pruneOnnxRuntimeWebWasm(destPnpm);
  if (prunedWebWasm > 0) {
    console.log(
      `[build-sidecar]   ✂ Node sidecar 剪除 onnxruntime-web 重复 WASM ${prunedWebWasm} 个` +
        "(@xenova dist 浏览器资产仍保留)",
    );
  }
  if (process.env.CREATOROS_PACKAGE_BUILD_ONLY === "1") {
    console.log("[build-sidecar] 资源已组装；额外运行时探针未运行。");
    return;
  }
  // ③ HARD 自检:worker 同路径真加载(见函数头注释③)。
  const selfCheck = `
    const { createRequire } = require('node:module');
    const path = require('node:path');
    const req = createRequire(path.join(process.cwd(), 'package.json'));
    const resolved = req.resolve('@xenova/transformers');
    const m = req('@xenova/transformers');
    if (typeof m.pipeline !== 'function' || !m.env) { console.error('XENOVA-SELFCHECK-FAIL'); process.exit(1); }
    console.log('XENOVA-SELFCHECK-OK ' + resolved);
  `;
  const r = spawnSync(process.execPath, ["-e", selfCheck], {
    cwd: join(SIDECAR_RUNTIME, "frontend"),
    encoding: "utf8",
  });
  if (r.status !== 0 || !`${r.stdout}`.includes("XENOVA-SELFCHECK-OK")) {
    // [W-diag] 失败时 dump 关键位置的 node_modules 链状态(Windows junction 拷贝行为
    // 无法本机复现,只有 CI 真机能给证据:每项是 symlink/junction/真目录?目标是什么?解析到吗?)
    const probes =
      platform === "win32"
        ? [join(anchor, "node_modules"), join(anchor, "node_modules", "onnxruntime-node", "node_modules")]
        : [join(destPnpm, rootEntry, "node_modules"),
           (() => { const e = readdirSync(destPnpm).find((x) => x.startsWith("onnxruntime-node@")); return e ? join(destPnpm, e, "node_modules") : null; })()];
    for (const nm of probes) {
      if (!nm) continue;
      console.error(`[W-diag] ${nm.slice(SIDECAR_RUNTIME.length)} 链状态:`);
      try {
        const dump = (dir, prefix) => {
          for (const n of readdirSync(dir, { withFileTypes: true })) {
            const p = join(dir, n.name);
            if (n.name.startsWith("@") && n.isDirectory() && !lstatSync(p).isSymbolicLink()) {
              dump(p, `${n.name}/`);
              continue;
            }
            const st = lstatSync(p);
            const kind = st.isSymbolicLink()
              ? `link → ${(() => { try { return readlinkSync(p); } catch (e) { return `readlink失败:${e.code}`; } })()}`
              : st.isDirectory() ? "真目录" : "文件";
            console.error(`[W-diag]   ${prefix}${n.name}: ${kind}; 解析=${existsSync(p)}`);
          }
        };
        dump(nm, "");
      } catch (e) {
        console.error(`[W-diag]   dump 失败:${e.message}`);
      }
    }
    throw new Error(
      `[build-sidecar] 自检失败[T-383]:sidecar 内与 worker 同路径 require('@xenova/transformers') 未通过 → 打包版 whisper-local 必崩\n${r.stdout}${r.stderr}`,
    );
  }
  console.log(`[build-sidecar]   ✓ 自检[T-383]:sidecar 内 @xenova/transformers 可解析+真加载(worker 同路径,连带 onnx/sharp 原生 dlopen)`);
}

// [T-284] 把 Chromium 浏览器二进制打进 sidecar(用户拍板:视频渲染永不下载 / 永不「Chromium
//   未就绪」)。根因:打包版 sidecar 的 playwright 在混淆 bundle runtime 里对默认缓存
//   `~/Library/Caches/ms-playwright` 的浏览器路径解析失效(即便机器上有 chromium-<rev> 也找不到),
//   自动下载注入也因同层 bundle 问题没跑起来。正解:随包打 Chromium + 运行时
//   `PLAYWRIGHT_BROWSERS_PATH` 显式指向 bundle 内目录(见 frontend/src/instrumentation.ts)。
//   revision 从**已实拷进 sidecar 的 playwright-core browsers.json** 读(与 executablePath 同源,
//   保证版本一致)。~341MB(headed chromium)—— 换 app 体积保渲染稳,用户已认。放在打 tarball 前,
//   让浏览器进 tarball。本机未装该 rev / 非 mac → 跳过(不阻塞打包;渲染回落运行时下载兜底)。
export function copyPortableBundleTree(src, dest) {
  // macOS .app/.framework 用相对 symlink 描述 Versions/Current、Resources、Helpers 等标准布局。
  // Node cpSync 的非 verbatim 模式会把它们改写为构建机绝对路径；公证签名会解析到缓存目录，
  // 用户机则直接断链。保留链接字面值，才能让副本既可搬运又可被 codesign 正确封装。
  cpSync(src, dest, {
    recursive: true,
    dereference: false,
    verbatimSymlinks: true,
  });
}

function bundleChromiumBrowser() {
  const bj = join(
    SIDECAR_RUNTIME,
    "frontend",
    "node_modules",
    "playwright-core",
    "browsers.json",
  );
  let rev = null;
  try {
    const data = JSON.parse(readFileSync(bj, "utf8"));
    const chr = (data.browsers || []).find((b) => b.name === "chromium");
    rev = chr?.revision ?? null;
  } catch (e) {
    console.warn(
      `[build-sidecar] ⚠ 读 browsers.json revision 失败,跳过 Chromium 打包(渲染回落运行时下载):${e.message}`,
    );
    return;
  }
  if (!rev) {
    console.warn("[build-sidecar] ⚠ browsers.json 无 chromium revision,跳过 Chromium 打包");
    return;
  }
  // [T-372 W2] 缓存根目录按平台映射(mac ~/Library/Caches / Win %LOCALAPPDATA% / Linux XDG),
  //   映射不到的平台才跳过(回落运行时下载)。mac 路径与旧实现逐字节一致(零回归)。
  const cacheRoot = playwrightBrowsersCacheRoot(platform, process.env, homedir());
  if (!cacheRoot) {
    console.warn(`[build-sidecar] ⚠ 平台 ${platform} 无 Playwright 缓存路径映射,跳过 Chromium 打包(渲染回落运行时下载)`);
    return;
  }
  const srcBrowser = join(cacheRoot, `chromium-${rev}`);
  if (!existsSync(srcBrowser)) {
    console.warn(
      `[build-sidecar] ⚠ 本机未装 chromium-${rev}(${srcBrowser} 不存在)—— 先跑 \`pnpm -C frontend exec playwright install chromium\` 再打包。跳过 Chromium 打包(渲染回落运行时下载)。`,
    );
    return;
  }
  const destBrowsers = join(SIDECAR_RUNTIME, "frontend", "browsers");
  const destBrowser = join(destBrowsers, `chromium-${rev}`);
  rmSync(destBrowser, { recursive: true, force: true });
  mkdirSync(destBrowsers, { recursive: true });
  console.log(
    `[build-sidecar] 打包 Chromium 浏览器 chromium-${rev}(~341MB)→ sidecar/frontend/browsers/…`,
  );
  copyPortableBundleTree(srcBrowser, destBrowser);
  console.log(
    `[build-sidecar]   ✓ Chromium 已打进 bundle(运行时 instrumentation 设 PLAYWRIGHT_BROWSERS_PATH → frontend/browsers)`,
  );
}

// [T-172] macOS：产出 sidecar 内的 mini `.app`，让 node sidecar 在 Dock 里隐身。
//   结构（随 sidecar.tar.gz 一起打包，首启由 lib.rs 系统 tar 解压到可写 runtime 目录）：
//     <SIDECAR_RUNTIME>/server.app/Contents/MacOS/creatoros-server   ← node 二进制（0755）
//     <SIDECAR_RUNTIME>/server.app/Contents/Info.plist               ← LSUIElement=true 隐身声明
//   为何有效：LaunchServices 读 .app 的 Info.plist；LSUIElement/LSBackgroundOnly 让进程不注册为 GUI app
//     → 不进 Dock（实测 lsappinfo ApplicationType=NULL）。dylib 不放这里（仍在 sidecar/lib/，lib.rs 注
//     DYLD_LIBRARY_PATH 指过去，绝对路径可用），故 .app 里只放 node 本体，保持精简。
function buildServerApp() {
  const appRoot = join(SIDECAR_RUNTIME, "server.app");
  const macosDir = join(appRoot, "Contents", "MacOS");
  rmSync(appRoot, { recursive: true, force: true });
  mkdirSync(macosDir, { recursive: true });
  const innerBin = join(macosDir, "creatoros-server");
  copyFileSync(process.execPath, innerBin); // node 二进制即内层可执行体
  chmodSync(innerBin, 0o755);
  // Info.plist：LSUIElement + LSBackgroundOnly 双保险（agent 型进程，无 Dock、无菜单栏）。
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleExecutable</key>
  <string>creatoros-server</string>
  <key>CFBundleIdentifier</key>
  <string>cloud.aitongban.creatoros.sidecar</string>
  <key>CFBundleName</key>
  <string>creatoros-server</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>LSUIElement</key>
  <true/>
  <key>LSBackgroundOnly</key>
  <true/>
</dict>
</plist>
`;
  writeFileSync(join(appRoot, "Contents", "Info.plist"), plist);
  console.log(`[build-sidecar]   [T-172] 产出 sidecar/server.app（LSUIElement，Dock 隐身）→ ${innerBin}`);
}

// [T-437] mac：递归 co-ship node 二进制的**全部**非系统 dylib 依赖 → sidecar/lib/，并把二进制与
//   库里的 /opt/homebrew|/usr/local 绝对引用改写成 @rpath（+ rpath 指向 sidecar/lib）→ **自包含**，
//   不再要求用户机装 Homebrew，也不单靠 DYLD_LIBRARY_PATH（hardened runtime 会剥离 DYLD_*）。
//   旧实现（被本函数替换）三处致命窄化:①filter 只留 `libnode`/`@rpath/` → 那 17 个 /opt/homebrew/opt/*
//   （libuv/simdjson/simdutf/brotli(dec·enc)/c-ares/nghttp2·3/ngtcp2/sqlite/uvwasi/zstd/openssl@3
//   (crypto·ssl)/icu4c@78(i18n·uc)）全被滤掉;②只从单一 nodeLibDir 找（libuv 其实在各自 formula 的
//   lib/，根本不在那）;③无递归（libnode 自身那串依赖从未处理）;④existsSync 静默跳过（找不到不报错）。
//   → 无 Homebrew 的用户机 dyld「Library not loaded: /opt/homebrew/opt/libuv/...」→ sidecar 崩 →
//   白屏（2026-07-19 真机实证;开发机自带 Homebrew，dyld fallback 命中掩盖了此 bug 至今）。
function bundleMacDylibs(libDir, binaries) {
  const nodeLibDir = join(dirname(process.execPath), "..", "lib"); // 打包机 node/../lib（libnode 真身兜底）
  const isSystem = (p) => p.startsWith("/usr/lib/") || p.startsWith("/System/");
  const otoolDeps = (f) => {
    const r = spawnSync("otool", ["-L", f], { encoding: "utf8" });
    if (r.status !== 0) throw new Error(`[build-sidecar] [T-437] otool -L 失败: ${f}\n${r.stderr ?? ""}`);
    // 首行是文件自身路径（LC_ID_DYLIB）；其余每行首 token 是依赖引用。
    return r.stdout.split("\n").slice(1).map((l) => l.trim().split(" ")[0]).filter(Boolean);
  };
  const inTool = (args) => {
    const r = spawnSync("install_name_tool", args, { encoding: "utf8" });
    if (r.status !== 0) throw new Error(`[build-sidecar] [T-437] install_name_tool 失败: ${args.join(" ")}\n${r.stderr ?? ""}`);
  };
  // ① BFS 递归收集所有非系统依赖真身 → collected: base → 拷贝后路径。
  const collected = new Map();
  const seen = new Set();
  const queue = binaries.map((b) => ({ file: b, ownerDir: dirname(b) }));
  while (queue.length) {
    const { file, ownerDir } = queue.shift();
    if (seen.has(file)) continue;
    seen.add(file);
    for (const ref of otoolDeps(file)) {
      if (isSystem(ref)) continue;
      const base = ref.split("/").pop();
      if (!base || collected.has(base)) continue;
      // resolve 真身源：绝对路径（/opt/homebrew/...）直用；@rpath/@loader_path/裸名 → 在 nodeLibDir/ownerDir 找 basename。
      let src = null;
      if (ref.startsWith("/")) {
        if (existsSync(ref)) src = ref;
      } else {
        for (const d of [nodeLibDir, ownerDir]) {
          const c = join(d, base);
          if (existsSync(c)) { src = c; break; }
        }
      }
      if (!src) throw new Error(`[build-sidecar] [T-437] 依赖源未找到（拒绝静默漏库→白屏）: ref=${ref} owner=${file}`);
      const dst = join(libDir, base);
      rmSync(dst, { force: true }); // 覆盖只读旧文件（Homebrew dylib r--r--r--）避免 EACCES
      copyFileSync(src, dst);
      chmodSync(dst, 0o644);
      collected.set(base, dst);
      queue.push({ file: dst, ownerDir: dirname(src) }); // 递归：拷进来的库继续收集其依赖
      console.log(`[build-sidecar]   [T-437] co-shipped dylib → sidecar/lib/${base}`);
    }
  }
  if (collected.size === 0) {
    // [T-458] 打包机 node 自包含（官方预编译版，如 CI 的 actions/setup-node）：otool -L 只返回
    //   /usr/lib|/System 系统库，无 /opt/homebrew 外部 dylib 可 co-ship —— 这是**合法**状态
    //   （自包含 node 本就不依赖任何随包库，dyld 从 OS 解析系统库即可），非异常。
    //   T-437 旧守卫假定打包机 node 一定 Homebrew 链接（19 库），把 0 误判为 execPath 异常
    //   → mac CI 打包必炸。此处 otool 已成功执行（otoolDeps 内部 status!=0 会先抛），
    //   到达此分支即证明是自包含 node → 无库可拷、无引用可改写、无需 rpath/重签/自检，直接返回。
    console.log("[build-sidecar]   [T-437/T-458] node 自包含（otool 仅系统库，0 外部 dylib）→ 跳过 co-ship（CI/官方 node 正常路径）");
    return;
  }
  // ② install_name 改写：非系统引用 → @rpath/<base>，让 dyld 走各自 rpath（指 sidecar/lib）解析。
  const rewriteRefs = (f) => {
    const args = [];
    for (const ref of otoolDeps(f)) {
      if (isSystem(ref)) continue;
      const base = ref.split("/").pop();
      if (base && collected.has(base)) args.push("-change", ref, `@rpath/${base}`);
    }
    if (args.length) inTool([...args, f]);
  };
  for (const [base, dst] of collected) {
    inTool(["-id", `@rpath/${base}`, dst]);
    rewriteRefs(dst);
    spawnSync("install_name_tool", ["-add_rpath", "@loader_path", dst]); // 兄弟库同目录；已存在则 no-op（容忍失败）
  }
  for (const b of binaries) {
    rewriteRefs(b);
    // server.app/Contents/MacOS/creatoros-server → sidecar/lib = 上溯 3 层。
    spawnSync("install_name_tool", ["-add_rpath", "@loader_path/../../../lib", b]);
  }
  // ③ 改了 load command → adhoc 重签（arm64 二进制/库必须有效签名才能加载）。
  for (const f of [...collected.values(), ...binaries]) {
    const cs = spawnSync("codesign", ["--force", "--sign", "-", f], { encoding: "utf8" });
    if (cs.status !== 0) throw new Error(`[build-sidecar] [T-437] adhoc 重签失败: ${f}\n${cs.stderr ?? ""}`);
  }
  // ④ 硬自检：二进制/库的所有非系统依赖必须已改成 @rpath（无残留 /opt|/usr/local）+ 二进制签名有效。
  //    否则干净机仍白屏 —— 失败即 build 炸，不出坏包（同 WIN-NEXT-OK 思路）。
  for (const b of [...binaries, ...collected.values()]) {
    const bad = otoolDeps(b).filter((p) => p.startsWith("/opt/") || p.startsWith("/usr/local/"));
    if (bad.length) throw new Error(`[build-sidecar] [T-437] 自检失败：${b} 残留未改写外部依赖:\n${bad.join("\n")}`);
  }
  for (const b of [...binaries, ...collected.values()]) {
    const v = spawnSync("codesign", ["-v", "--strict", b], { encoding: "utf8" });
    if (v.status !== 0) throw new Error(`[build-sidecar] [T-437] 自检失败：${b} 签名无效\n${v.stderr ?? ""}`);
  }
  console.log(`[build-sidecar]   [T-437] ✓ 自检：co-ship ${collected.size} 个 dylib + 全 @rpath 自包含 + 全库 adhoc 重签，二进制零 /opt 依赖`);
}

// [T-440] Windows：.next/node_modules/ 下 Turbopack 给 serverExternalPackages 生成的带 hash 别名
//   （pg-<hash>/pglite-<hash>/ai-<hash>/@xenova… 实测 13 个）全是指向 .pnpm 的 symlink/junction，
//   verbatim 拷到用户机即死链 → server.js require 这些 external 包 MODULE_NOT_FOUND → 白屏。
//   materializeStandaloneWin 只管 frontend/node_modules 的 next 闭包，漏了这一处。
//
//   ⚠️ **不能用 cpSync(dereference) 物化**（T-440 第一版就栽在这，用户 Windows 真机报「依赖树不断
//   展开 / 没递归到包内部」）：Windows 上 cpSync 对 junction 只**展平一层** —— 包真身拷过来了，但它
//   自己的依赖（pnpm 靠兄弟 symlink 解析）没跟过来 → 传递依赖 walk-up 找不到即崩；而在 mac 上用
//   dereference 硬展开又会撞 pnpm 的循环依赖（a→b→a）无限套娃、体积爆炸。两边都是死路。
//   正解 = 复用 materializeNestedEntryTree：npm 经典嵌套物化，真身 + 传递依赖一次到位，seenChain
//   防环（与 T-372 W 给 xenova/pi 用的是同一套，已在 Windows 验证过）。
//
//   源 .pnpm 必须用 **REPO 的**（结构完整）而非 sidecar 内那份 —— 后者在 Windows 上已被主 verbatim
//   拷贝把 junction 解引用成一层真目录，依赖图信息已丢失，从它出发收不全闭包。
function materializeNextExternalsWin() {
  const srcPnpm = join(REPO, "node_modules", ".pnpm");
  const nnm = join(SIDECAR_RUNTIME, "frontend", ".next", "node_modules");
  if (!existsSync(nnm)) {
    console.log("[build-sidecar]   [T-440] 无 .next/node_modules（无 external 别名）→ 跳过");
    return;
  }
  if (!existsSync(srcPnpm)) {
    throw new Error(`[build-sidecar] [T-440] 源 .pnpm 缺(${srcPnpm})—— 无法嵌套物化 external 包`);
  }
  let nested = 0;
  let copied = 0;
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      const st = lstatSync(p);
      if (st.isSymbolicLink()) {
        // 链目标 → .pnpm entry 名(Windows junction 目标是反斜杠,先归一化;同 pnpmDepsOfEntry)。
        let tgt = "";
        try { tgt = readlinkSync(p).replace(/\\/g, "/"); } catch { tgt = ""; }
        const idx = tgt.indexOf("/.pnpm/");
        if (idx >= 0) {
          const entry = tgt.slice(idx + "/.pnpm/".length).split("/node_modules/")[0];
          if (!entry || !existsSync(join(srcPnpm, entry))) {
            throw new Error(
              `[build-sidecar] [T-440] external 链指向的 entry 在源 .pnpm 缺失:${entry || "?"}(${p})`,
            );
          }
          rmSync(p, { recursive: true, force: true });
          // 递归嵌套物化:真身 + 传递依赖一次到位(seenChain 防环),而非只展平一层。
          materializeNestedEntryTree(srcPnpm, entry, p, new Set([entry]));
          nested++;
        } else {
          // 非 .pnpm 链(罕见):退回真身实拷。
          let real = null;
          try { real = realpathSync(p); } catch { real = null; }
          if (!real || !existsSync(real)) {
            throw new Error(`[build-sidecar] [T-440] external 链无法解析:${p} → ${tgt || "?"}`);
          }
          rmSync(p, { recursive: true, force: true });
          cpSync(real, p, { recursive: true, dereference: true });
          copied++;
        }
      } else if (st.isDirectory()) {
        walk(p); // scope 目录（@electric-sql/… 等）继续下探
      }
    }
  };
  walk(nnm);
  // 硬自检:物化后该子树必须**零 symlink** —— 留一个都可能在用户机成死链(失败即 build 炸)。
  const left = [];
  const scan = (dir) => {
    for (const n of readdirSync(dir)) {
      const q = join(dir, n);
      const s = lstatSync(q);
      if (s.isSymbolicLink()) left.push(q);
      else if (s.isDirectory()) scan(q);
    }
  };
  scan(nnm);
  if (left.length) {
    throw new Error(
      `[build-sidecar] [T-440] 自检失败:.next/node_modules 物化后仍有 ${left.length} 个 symlink\n${left.slice(0, 5).join("\n")}`,
    );
  }
  console.log(
    `[build-sidecar]   [T-440] .next/node_modules 物化:嵌套 ${nested} 个 + 实拷 ${copied} 个,自检零 symlink`,
  );
}

// [T-225b] sharp(旧版 0.32.x,@xenova/transformers 依赖)原生库 co-ship —— 同 onnxruntime 的
//   tracing 盲区第二层:sidecar 里 sharp@0.32.x 只有 JS(build/Release/*.node + vendor/libvips 缺)
//   → require('sharp') 崩 → @xenova/transformers 顶层 import 连坐 → whisper-local 全崩(真机 T-225
//   第二轮实测:onnx dylib 修复后转录仍败于「Cannot find module ../build/Release/sharp-darwin-arm64v8.node」)。
//   注意:根 node_modules 的 sharp@0.32.x 也可能没编译过(pnpm 跳过其 postinstall)——那种情况需先在
//   根跑一次 `node install/libvips && npx prebuild-install -r napi`(本仓已跑过,产物已落根)。此函数
//   只做「根有 → sidecar 缺 → 补拷」,根也缺则 throw(不容 build 出必崩转录的包)。
function ensureSharpNative() {
  // 找 sidecar 里所有旧结构 sharp 包(有 install/libvips.js 的是 0.32.x;0.34+ 走 @img/* 分包不归这管)。
  const sharpPkgs = [];
  const pnpmDirSidecar = join(SIDECAR_RUNTIME, "node_modules", ".pnpm");
  let entries = [];
  try { entries = readdirSync(pnpmDirSidecar).filter((x) => x.startsWith("sharp@0.32")); } catch { return; }
  for (const e of entries) {
    const pkg = join(pnpmDirSidecar, e, "node_modules", "sharp");
    if (existsSync(join(pkg, "package.json"))) sharpPkgs.push({ version: e, dir: pkg });
  }
  if (sharpPkgs.length === 0) return; // sidecar 没带旧 sharp → 无需处理
  let copied = 0;
  for (const { version, dir } of sharpPkgs) {
    const hasNode = existsSync(join(dir, "build", "Release")) &&
      readdirSync(join(dir, "build", "Release")).some((f) => f.endsWith(".node"));
    if (hasNode) continue;
    const src = join(REPO, "node_modules", ".pnpm", version, "node_modules", "sharp");
    const srcOk = existsSync(join(src, "build", "Release")) &&
      readdirSync(join(src, "build", "Release")).some((f) => f.endsWith(".node"));
    if (!srcOk) {
      throw new Error(
        `[build-sidecar] 自检失败[T-225b]:根 node_modules 的 ${version} 也缺原生二进制 —— 先在 ` +
        `node_modules/.pnpm/${version}/node_modules/sharp 跑 \`node install/libvips && npx prebuild-install -r napi\``,
      );
    }
    for (const sub of ["build", "vendor"]) {
      const s = join(src, sub);
      if (existsSync(s)) cpSync(s, join(dir, sub), { recursive: true, dereference: true });
    }
    copied++;
  }
  console.log(`[build-sidecar]   ✓ [T-225b] sharp 0.32.x 原生补拷 ${copied} 处(修 @xenova/transformers 连坐崩)`);
  // 硬自检:补完每个旧 sharp 必须有 .node。
  for (const { dir } of sharpPkgs) {
    const ok = existsSync(join(dir, "build", "Release")) &&
      readdirSync(join(dir, "build", "Release")).some((f) => f.endsWith(".node"));
    if (!ok) throw new Error(`[build-sidecar] 自检失败[T-225b]:${dir} 仍缺 build/Release/*.node`);
  }
}

// [T-225] onnxruntime-node 原生库 co-ship —— Next standalone tracing 拷了 onnxruntime_binding.node，
//   但**漏了它运行时 dlopen 的 libonnxruntime.<ver>.dylib**(同 @playwright/test 那类 tracing 盲区)。
//   缺它 → whisper-local ASR「Library not loaded: @rpath/libonnxruntime.*.dylib」→ 逐字稿转录**全失败**
//   (真机 T-225 实测:transcribe.douyin 49/49 failed→reconstruct 全崩→飞轮无真内容→编导编造)。
//   修:把 dylib(mac)/so(linux)/dll(win) 补拷进 sidecar 内每个 onnxruntime-node 的 bin/napi-v3/<plat>/<arch>/
//   与 .node 同目录(rpath 首选就近查同目录)。硬自检:补完仍缺则 throw(不容假通过,教训同 playwright 自检②)。
function ensureOnnxRuntimeDylib() {
  const libExt = platform === "darwin" ? ".dylib" : platform === "win32" ? ".dll" : ".so";
  // Windows 的 DLL 无 lib 前缀(MSVC 惯例:onnxruntime.dll)——硬套 libonnxruntime* 会假阴性:
  // 文件在、dlopen 已通过(T-383 真加载自检),T-225 却报缺(CI 实测「补拷 0 + 仍缺」)。
  const isLib = (f) =>
    platform === "win32"
      ? f.startsWith("onnxruntime") && f.endsWith(".dll")
      : f.startsWith("libonnxruntime") && f.endsWith(libExt);
  // 递归找 sidecar 里所有 onnxruntime_binding.node 所在目录(可能多份:frontend/ 与根 node_modules)。
  const bindingDirs = [];
  const walk = (dir) => {
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.isSymbolicLink()) continue;
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name === "onnxruntime_binding.node") bindingDirs.push(dir);
    }
  };
  walk(SIDECAR_RUNTIME);
  if (bindingDirs.length === 0) return; // sidecar 没用到 onnxruntime → 无需处理
  // [T-372 W] 异平台 binding 目录剪除:win 的 junction deref 展平会把 onnxruntime 全平台
  // bin 目录物化成真目录(linux/darwin 的 binding.node 也进来;npm 包自带全平台 binding,
  // 仅 DLL 按平台 postinstall 下载)。异平台目录既不该进分发包,也永远补不齐本平台库——
  // 此前对它们报缺即炸 = 假阳性(第 8 轮 CI 实证)。按 <platform>/<arch> 尾段过滤,异平台
  // 整叶剪掉省体积。mac 上闭包已有平台剪枝 + hyperframes 是 symlink 被 walk 跳过 → no-op。
  {
    const keep = [];
    let prunedForeign = 0;
    for (const bd of bindingDirs) {
      const segs = bd.split(/[/\\]/).filter(Boolean);
      const a = segs[segs.length - 1];
      const p = segs[segs.length - 2];
      if (p === platform && a === arch) {
        keep.push(bd);
        continue;
      }
      rmSync(bd, { recursive: true, force: true });
      prunedForeign++;
    }
    if (prunedForeign > 0) {
      console.log(
        `[build-sidecar]   ✂ [T-225] 剪除异平台 onnx binding 目录 ${prunedForeign} 个(只留 ${platform}/${arch})`,
      );
    }
    bindingDirs.length = 0;
    bindingDirs.push(...keep);
  }
  // 源库:从 REPO/node_modules/.pnpm 找同尾路径(bin/napi-v3/<plat>/<arch>)的 libonnxruntime*.<ext>。
  const findSourceLibs = (bindingDir) => {
    const tail = bindingDir.split(/onnxruntime-node[/\\]/).pop(); // e.g. bin/napi-v3/darwin/arm64
    const pnpmRoot = join(REPO, "node_modules", ".pnpm");
    let dirs;
    try { dirs = readdirSync(pnpmRoot).filter((x) => x.startsWith("onnxruntime-node@")); } catch { return []; }
    for (const d of dirs) {
      const cand = join(pnpmRoot, d, "node_modules", "onnxruntime-node", tail);
      try {
        const files = readdirSync(cand).filter(isLib);
        if (files.length) return files.map((f) => join(cand, f));
      } catch { /* 继续找下一个版本目录 */ }
    }
    return [];
  };
  let copied = 0;
  for (const bd of bindingDirs) {
    let have = false;
    try { have = readdirSync(bd).some(isLib); } catch { /* noop */ }
    // 逐目录打印(诊断:CI 上 binding 目录集合与本机不同——win deref 展平会物化出
    // hyperframes 等传递依赖的副本,盲区靠这行日志暴露)。
    console.log(`[build-sidecar]   [T-225] binding: ${bd.slice(SIDECAR_RUNTIME.length)} have=${have}`);
    if (have) continue;
    const srcs = findSourceLibs(bd);
    if (srcs.length === 0) {
      console.warn(`[build-sidecar]   [T-225] ⚠ 源 .pnpm 找不到该目录可补的原生库(tail 不匹配或源也缺)`);
    }
    for (const src of srcs) {
      const dst = join(bd, src.split(/[/\\]/).pop());
      rmSync(dst, { force: true });
      copyFileSync(src, dst);
      if (platform !== "win32") chmodSync(dst, 0o644);
      copied++;
    }
  }
  console.log(`[build-sidecar]   ✓ [T-225] onnxruntime 原生库补拷 ${copied} 个(修 whisper-local 逐字稿转录 dlopen 崩)`);
  // 硬自检:每个 binding 目录现在必须有原生库,否则打包版转录必崩 —— 宁可 build 失败也不假通过。
  for (const bd of bindingDirs) {
    let ok = false;
    try { ok = readdirSync(bd).some(isLib); } catch { /* noop */ }
    if (!ok) {
      throw new Error(`[build-sidecar] 自检失败[T-225]:${bd} 仍缺 libonnxruntime${libExt} → 逐字稿转录会全崩`);
    }
  }
}

// [T-326 RT-H09] 把**静态** ffmpeg 实拷进 sidecar → `sidecar/frontend/bin/ffmpeg[.exe]`。
//   为什么:douyin 抽音(douyin-cdp streamAudioFromVideo)与本地转录(whisper-local PCM 解码)
//   此前默认硬编码 /opt/homebrew/bin/ffmpeg —— Intel Mac / Windows / 无 Homebrew 用户稳定失败。
//   运行时统一走 executable-path 解析链；正式包由 Rust 注入 CREATOROS_BIN_DIR 的绝对路径，
//   开发态才回落 `<cwd>/bin`。本函数把 ffmpeg/ffprobe 两个工具一起放到位。
//   二进制源:eugeneware/ffmpeg-static release 的静态构建(fetch-ffmpeg.mjs 拉取+缓存+冒烟;
//   **不能**拷 Homebrew ffmpeg —— 那是动态链接,无 Homebrew 的用户机 dyld 必崩,同 libnode 坑)。
//   失败姿态:任一拉不到即停止打包。视频渲染是正式功能，不能把“构建机网络失败”变成
//   “用户机器必须碰巧装过依赖”的残缺安装包；离线构建可用两个 BUNDLE_SRC 显式逃生门。
//   ⚠️ 许可:ffmpeg-static 是 GPL 构建,随包分发需在第三方许可声明里带 ffmpeg(GPL)条目。
function bundleMediaTools(triple) {
  const isWinTarget = triple.includes("windows");
  const destDir = join(SIDECAR_RUNTIME, "frontend", "bin");
  mkdirSync(destDir, { recursive: true });
  const hostTriple = targetTriple();
  for (const [tool, ensureStatic] of [
    ["ffmpeg", ensureFfmpegStatic],
    ["ffprobe", ensureFfprobeStatic],
  ]) {
    const dest = join(destDir, isWinTarget ? `${tool}.exe` : tool);
    let src;
    try {
      src = ensureStatic(triple);
    } catch (e) {
      throw new Error(
        `[build-sidecar] [T-485] 静态 ${tool} 未就绪，拒绝产出依赖用户环境的残缺包:` +
          `${e.message}。离线构建请设置 CREATOROS_${tool.toUpperCase()}_BUNDLE_SRC。`,
      );
    }
    rmSync(dest, { force: true });
    copyFileSync(src, dest);
    if (!isWinTarget) chmodSync(dest, 0o755);
    if (!existsSync(dest) || !statSync(dest).isFile() || statSync(dest).size === 0) {
      throw new Error(`[build-sidecar] 自检失败[T-485]:${tool} 实拷后不是非空普通文件(${dest})`);
    }
    if (triple === hostTriple && process.env.CREATOROS_PACKAGE_BUILD_ONLY !== "1") {
      const r = spawnSync(dest, ["-version"], { encoding: "utf8" });
      if (r.status !== 0 || !`${r.stdout}`.startsWith(`${tool} version`)) {
        throw new Error(
          `[build-sidecar] 自检失败[T-485]:sidecar 内 ${tool} -version 未通过(status=${r.status})→ 不出必崩的包`,
        );
      }
      console.log(
        `[build-sidecar]   ✓ [T-485] 静态 ${tool} 随包就绪 → sidecar/frontend/bin/(${`${r.stdout}`.split("\n")[0]})`,
      );
    } else {
      console.log(
        `[build-sidecar]   [T-485] 静态 ${tool} 已实拷(target ${triple},-version 冒烟未运行，待独立验证)`,
      );
    }
  }
}

function main() {
  if (process.env.CREATOROS_SKIP_PI === "1") {
    throw new Error("[build-sidecar] CREATOROS_SKIP_PI 不再允许：独立 Agent Worker 必须随包提供 Pi");
  }

  // [T-586] 必须早于所有局部构建/缓存短路：即使复用 clean runtime，也不能让安装声明与
  // 实际会随包复制的 Node Mach-O 要求漂移。
  assertMacosRuntimeCompatibility();

  // [T-487] 只重建 Playwright 解析锚，用于本地验证双份实拷已消除。
  if (process.env.CREATOROS_SIDECAR_PLAYWRIGHT_ONLY === "1") {
    if (!existsSync(join(SIDECAR_RUNTIME, "frontend", "server.js"))) {
      throw new Error("[build-sidecar] CREATOROS_SIDECAR_PLAYWRIGHT_ONLY=1 需已存在组装好的 sidecar(先跑一次完整 build)");
    }
    bundlePlaywright();
    console.log("[build-sidecar] ✅ PLAYWRIGHT_ONLY 段完成(未重打 tarball;出包请跑完整流程)。");
    return;
  }

  // [T-487] 只重建渲染依赖闭包，用于本地复测去重效果；不跑 Next/Tauri，也不消耗 CI 额度。
  if (process.env.CREATOROS_SIDECAR_RENDER_ONLY === "1") {
    if (!existsSync(join(SIDECAR_RUNTIME, "frontend", "server.js"))) {
      throw new Error("[build-sidecar] CREATOROS_SIDECAR_RENDER_ONLY=1 需已存在组装好的 sidecar(先跑一次完整 build)");
    }
    bundleRenderDeps();
    ensureOnnxRuntimeDylib();
    ensureSharpNative();
    const aliases = dedupeIdenticalOnnxAliases(join(SIDECAR_RUNTIME, "node_modules", ".pnpm"));
    if (aliases > 0) console.log(`[build-sidecar]   ✓ ONNX 动态库 ABI 别名去重 ${aliases} 处`);
    console.log("[build-sidecar] ✅ RENDER_ONLY 段完成(未重打 tarball;出包请跑完整流程)。");
    return;
  }

  // [T-383] 开发验证开关:只跑 @xenova/transformers 拷贝段(against 已组装的 sidecar,不重建
  //   standalone / 不打 tarball)。全量 build 很慢;这个开关让「拷贝 + 自检」段可独立真跑验证。
  //   正式出包仍走完整流程(main 里 bundleXenovaTransformers 常规在链上)。
  if (process.env.CREATOROS_SIDECAR_XENOVA_ONLY === "1") {
    if (!existsSync(join(SIDECAR_RUNTIME, "frontend", "server.js"))) {
      throw new Error("[build-sidecar] CREATOROS_SIDECAR_XENOVA_ONLY=1 需已存在组装好的 sidecar(先跑一次完整 build)");
    }
    bundleXenovaTransformers();
    ensureOnnxRuntimeDylib();
    ensureSharpNative();
    const aliases = dedupeIdenticalOnnxAliases(join(SIDECAR_RUNTIME, "node_modules", ".pnpm"));
    if (aliases > 0) console.log(`[build-sidecar]   ✓ ONNX 动态库 ABI 别名去重 ${aliases} 处`);
    console.log("[build-sidecar] ✅ XENOVA_ONLY 段完成(未重打 tarball;出包请跑完整流程)。");
    return;
  }

  // [T-164 P6] tauri.conf.json beforeBuildCommand 会在 tauri build 阶段再跑本脚本重建 sidecar,
  //   会**覆盖 desktop:package 步2 的 JS 混淆结果**。package.mjs 在 tauri build 前已跑过
  //   build-sidecar + obfuscate,故此阶段注入 CREATOROS_SKIP_SIDECAR_REBUILD=1 让本脚本短路
  //   (保住已混淆的 sidecar)。前提:sidecar 已存在(package.mjs 保证步1先建)。
  //   直接 `pnpm desktop:build` / `desktop:dev`(不经 package.mjs)不设此 env → 照常重建。
  if (process.env.CREATOROS_SKIP_SIDECAR_REBUILD === "1") {
    const existing = join(SIDECAR_RUNTIME, "frontend", "server.js");
    if (existsSync(existing)) {
      assertBakedVerdictPublicKey();
      console.log(
        "[build-sidecar] ⏭ CREATOROS_SKIP_SIDECAR_REBUILD=1 且 sidecar 已存在 → 跳过重建(保住 obfuscate 步的混淆结果)。",
      );
      // package.mjs 的步1只需要确认缓存已恢复，不应在混淆前白压一次约 1GB tar；
      // Tauri beforeBuild 再调用本脚本时不带 SKIP_TARBALL，才从最终变换后的 sidecar 压一次。
      if (process.env.CREATOROS_SKIP_TARBALL !== "1") {
        packSidecarTarball();
      } else {
        console.log("[build-sidecar] ⏭ CREATOROS_SKIP_TARBALL=1 → 当前阶段不压 tarball");
      }
      return;
    }
    console.warn(
      "[build-sidecar] ⚠️ CREATOROS_SKIP_SIDECAR_REBUILD=1 但 sidecar 不存在 → 仍重建(否则打包缺 sidecar)。",
    );
  }

  const triple = targetTriple();
  const isWin = platform === "win32";
  console.log(`[build-sidecar] target triple = ${triple}`);

  // [T-663] 课程发布资产是安装包真值。Next build 由本脚本直接调用，不会触发
  // package.json 的 prebuild，因此桌面链必须在编译前显式校验仓库资产。
  const builtInCourseVerifier = join(FRONTEND, "scripts", "verify-built-in-course.mjs");
  const builtInCourseSource = join(
    FRONTEND,
    "public",
    "courses",
    "xuehui-ip-practical-course",
  );
  if (process.env.CREATOROS_PACKAGE_BUILD_ONLY !== "1") {
    run(process.execPath, [builtInCourseVerifier, "--asset-root", builtInCourseSource]);
  }

  // 1) next standalone build(桌面模式)。
  //    直接 spawn node + next 的 JS 入口(同 package.mjs 跑 tauri.js 的惯例),不走
  //    `pnpm exec` —— Windows 上 pnpm 是 pnpm.cmd 批处理 shim,spawnSync 无 shell 解析不了
  //    → ENOENT、next 零输出直接死(Windows 首次构建实测)。node + JS 入口天然跨平台。
  console.log("[build-sidecar] 1/3 next standalone build (CREATOROS_DESKTOP=1)…");
  const nextBin = join(FRONTEND, "node_modules", "next", "dist", "bin", "next");
  run(process.execPath, [nextBin, "build"], {
    env: { ...process.env, CREATOROS_DESKTOP: "1" },
  });
  if (!existsSync(join(STANDALONE_SRC, "frontend", "server.js"))) {
    throw new Error(
      `[build-sidecar] 未找到 standalone server.js(期望 ${join(STANDALONE_SRC, "frontend", "server.js")})。` +
        " 确认 next.config.ts 在 CREATOROS_DESKTOP=1 下 output:'standalone' 生效。",
    );
  }

  // 2) 组装 standalone 运行目录:**整包保留 monorepo 布局**(frontend/ + backend/ + node_modules/
  //    为兄弟目录)。关键:db.ts 用 `resolve(dirname(import.meta.url), "../drizzle")` 定位迁移,
  //    而 outputFileTracingIncludes 把 backend/drizgle traced 到 <standalone>/backend/drizzle/
  //    (frontend/ 的兄弟)。若只拷 frontend/ 会断了这条 `../backend` 相对链 → 运行时 500
  //    (原型踩坑「Can't find meta/_journal.json」)。故整棵 standalone 树原样拷。
  console.log("[build-sidecar] 2/3 组装 standalone 运行目录(保留 frontend/+backend/ 布局)…");
  removeSidecarRuntime();
  mkdirSync(SIDECAR_RUNTIME, { recursive: true });
  // verbatimSymlinks:true —— **原样保留 symlink 字面目标**(不解引用)。这是唯一正确的 pnpm
  //   standalone 拷贝方式:
  //     · pnpm 虚拟 store(node_modules/.pnpm/<pkg>@ver)+ frontend/node_modules 直链 + Turbopack
  //       的 .next/node_modules/<pkg>-<hash> 别名,**全是相对 symlink**(../../.pnpm/...)。整树
  //       verbatim 拷贝后这些相对链仍指向 sidecar 内真实包 → 结构自洽、runtime 可 require(实测 200)。
  //     · 不能 dereference:true —— 它把相对链改写成指向源 .next/standalone 的**绝对**链,一旦 .next
  //       被清就 dangling;且 Turbopack 的 pglite 别名 deref 后仍是绝对 symlink → sidecar 依赖构建
  //       产物、bundle 后必坏(踩点:@electric-sql/pglite-<hash> ERR_MODULE_NOT_FOUND)。
  //   唯一需善后的是 .pnpm/node_modules/ 冗余 hoist 层(见下 prune)——它含会让 tauri-build 校验失败
  //   的相对链且 runtime 不需要。
  // [T-487] 必须在 cpSync 前先剪生成树；否则即使复制后再删，也会先把 10GB+ 的 Rust target /
  // 旧 sidecar / 旧安装包完整复制一遍，造成磁盘和打包时间灾难。
  const tracedLeaksPruned = pruneStandaloneLeaks(STANDALONE_SRC);
  assertNoPackagedBuildArtifacts(STANDALONE_SRC);
  if (tracedLeaksPruned > 0) {
    console.log(`[build-sidecar] ✂ 复制前剥离 standalone 工作区泄露 ${tracedLeaksPruned} 项(T-487)`);
  }
  cpSync(STANDALONE_SRC, SIDECAR_RUNTIME, { recursive: true, verbatimSymlinks: true });
  // standalone 不自带 .next/static 和 public,补进 frontend/ 下(server.js 从那里读)。
  cpSync(join(FRONTEND, ".next", "static"), join(SIDECAR_RUNTIME, "frontend", ".next", "static"), {
    recursive: true,
    verbatimSymlinks: true,
  });
  if (existsSync(join(FRONTEND, "public"))) {
    cpSync(join(FRONTEND, "public"), join(SIDECAR_RUNTIME, "frontend", "public"), {
      recursive: true,
      verbatimSymlinks: true,
    });
  }
  // [T-663] 再校验一次最终 sidecar 中实际随包的 public 资产，防止复制/裁剪阶段
  // 截断但仍生成安装包。
  if (process.env.CREATOROS_PACKAGE_BUILD_ONLY !== "1") run(process.execPath, [
    builtInCourseVerifier,
    "--asset-root",
    join(
      SIDECAR_RUNTIME,
      "frontend",
      "public",
      "courses",
      "xuehui-ip-practical-course",
    ),
  ]);

  // 校验迁移文件确实在位(否则运行时会 500)。
  if (!existsSync(join(SIDECAR_RUNTIME, "backend", "drizzle", "meta", "_journal.json"))) {
    throw new Error(
      "[build-sidecar] drizzle 迁移未在位(sidecar/backend/drizzle/meta/_journal.json 缺失)。" +
        " 确认 next.config.ts outputFileTracingIncludes 带了 ../backend/drizzle。",
    );
  }

  // 剪除 pnpm 的**冗余 hoist 便利层** `node_modules/.pnpm/node_modules/`(踩点):cpSync(deref)
  //   会把这层里的相对 symlink 改写成指向 .next/standalone 的绝对/dangling symlink,Tauri bundle
  //   逐个校验 resource 时报「.pnpm/node_modules/semver doesn't exist」而 build 失败。这层只是 pnpm
  //   的 hoist 便利再导出,next 运行时按 frontend/node_modules → .pnpm/<pkg>@ver 直链 require,不
  //   依赖它 —— 整层剪掉:①消除全部 dangling symlink(实测剪后 0)②运行时 200 不受影响(已验)。
  const pnpmHoist = join(SIDECAR_RUNTIME, "node_modules", ".pnpm", "node_modules");
  if (existsSync(pnpmHoist)) {
    rmSync(pnpmHoist, { recursive: true, force: true });
    console.log("[build-sidecar] 剪除 pnpm hoist 冗余层 node_modules/.pnpm/node_modules/");
  }

  // [T-426 W] Windows:主 standalone 的 next 闭包在 pnpm junction 下被 line 986 verbatim 拷成
  //   指向构建机(D:\a\…)的死链 → 用户机 `require('next')` MODULE_NOT_FOUND → sidecar 不 listen →
  //   webview「127.0.0.1 拒绝连接」白屏(2026-07-19 真机实证)。扁平 hoist 物化成真身补上。放主
  //   verbatim 之后、源码剥离/bundleXXX/sanitize 之前 —— 让后续 .bin 脱敏与 tarball 都覆盖到 hoist
  //   出来的真身。mac/linux 不进此路(走上方 verbatim .pnpm 原方案,零改动)。
  if (isWin) {
    materializeStandaloneWin();
  }

  // [T-716] Copilot 附件支持不能只在源码开发环境成立。pdf-parse 是 external package，且会
  // 动态加载 canvas 原生 binding；显式补齐并真 import 自检，确保安装包可读 PDF。
  bundlePdfAttachmentRuntime();

  // [T-392 安全] 剥离 standalone trace 混进的源码/文档/测试产物(2026-07-18 实包盘点:
  //   src/ 269 个 .ts 明文源码 + docs/ 47MB 设计文档截图 + specs/ + SPEC.md 等 —— 源码进包
  //   = 混淆白做,设计文档 = 给逆向者的地图)。已验运行时零引用(编译产物 grep 这些路径
  //   0 命中,仅 nextjs.org/docs URL 假命中);删后有混淆步的运行时冒烟兜底,删坏必炸不出包。
  {
    const fe = join(SIDECAR_RUNTIME, "frontend");
    const pruned = pruneStandaloneLeaks(SIDECAR_RUNTIME);
    // 剥离自检:运行必需物必须还在(防手滑加错清单)。
    for (const must of ["server.js", ".next", "package.json", "node_modules", "public"]) {
      if (!existsSync(join(fe, must))) {
        throw new Error(`[build-sidecar] 源码剥离误删运行必需物 frontend/${must} —— 检查 leaks 清单`);
      }
    }
    console.log(`[build-sidecar] ✂ 剥离源码/文档泄露 ${pruned} 项(T-392;冒烟兜底)`);
  }

  // 注:sidecar 内保留 pnpm 的相对 symlink 结构(frontend/node_modules/next → .pnpm/next@ver/…,
  // node 靠此 walk-up 解析 @swc/helpers 等 peer)。**不能物化 symlink**——物化后 next 的真实拷贝
  // 丢了 .pnpm 里的 peer 兄弟目录 → @swc/helpers ERR。dev / 直跑从 src-tauri/sidecar 源目录读
  // (symlink 完好,实测 200)。⚠️ `tauri build` 打 .app 时 Tauri resource 拷贝器对 symlink 的处理
  // 是本 P1 的**已知待验点**(见 README「诚实边界」)——若打包后 symlink 丢失,正式打包切 tar 方案。
  const leftover = countSymlinks(SIDECAR_RUNTIME);
  console.log(`[build-sidecar] 保留 ${leftover} 个 pnpm 相对 symlink(node 解析所需,dev/直跑完好)`);

  // 3) sidecar 可执行体 = 随包 node runtime 本体(按 target-triple 命名)。
  //    路线取舍:externalBin 只需一个「按 triple 命名的可执行体」。最稳的做法 = 直接把 node
  //    二进制当 sidecar bin(不引启动脚本的相对路径脆弱性)。Rust 侧 spawn 时把 server.js 的
  //    绝对路径(经 Tauri resource resolver 解析,dev/bundle 都对)作为 arg 传进来 —— 见 lib.rs。
  //    → 无「../sidecar 相对定位」假设,dev 与 .app bundle 两种布局都成立。
  console.log("[build-sidecar] 3/3 产出 sidecar(= 随包 node runtime)…");
  mkdirSync(BINARIES, { recursive: true });

  const sidecarName = `creatoros-server-${triple}${isWin ? ".exe" : ""}`;
  const sidecarPath = join(BINARIES, sidecarName);
  copyFileSync(process.execPath, sidecarPath); // node 二进制即 sidecar bin
  if (!isWin) chmodSync(sidecarPath, 0o755);

  // sidecar 二进制化关键坑(踩点):Homebrew/系统 node 是**动态链接**的(macOS:
  //  `@rpath/libnode.NNN.dylib`;linux 同理有 libnode.so),裸拷 node 二进制会 dyld
  //  「Library not loaded」。修:把 node 依赖的非系统 dylib co-ship 到 **sidecar/lib/**
  //  (resource-resolvable 目录),Rust 侧 spawn 时注入 DYLD_LIBRARY_PATH=<解析后的 sidecar/lib>。
  //  为何不放 binaries/:dev 下 Tauri 把 externalBin 拷到 target/debug/ 跑,dylib 不跟着走 →
  //  dyld 找不到。放 sidecar/(整目录作 resource)并显式给 DYLD 路径,dev/bundle 两布局都成立。
  const libDir = join(SIDECAR_RUNTIME, "lib");
  mkdirSync(libDir, { recursive: true });
  if (platform === "darwin") {
    // [T-172] 先产 server.app：把 node 包进带 LSUIElement/LSBackgroundOnly 的 mini .app（Dock 隐身，
    //   否则裸 node 被 LaunchServices 注册成 GUI app 显通用图标）；lib.rs mac 分支 spawn 其内层二进制。
    buildServerApp();
    // [T-437] 再对该内层二进制递归 co-ship **全部**非系统 dylib + 改 @rpath 自包含（替换旧「只拷 libnode」
    //   漏 17 个 /opt/homebrew 库的实现 → 无 Homebrew 用户机白屏）。只处理实际 spawn 的 server.app 版；
    //   binaries/ 版 mac 不 spawn（Win/Linux externalBin 才用）。
    bundleMacDylibs(libDir, [join(SIDECAR_RUNTIME, "server.app", "Contents", "MacOS", "creatoros-server")]);
  }

  bundleCreatorOsCli();
  stageExecutionWorkerRuntime({repoRoot:REPO,runtimeRoot:SIDECAR_RUNTIME});

  // [T-170] 实拷 Playwright 包进 sidecar(修 Next tracing 漏 @playwright/test → 打包扫码崩)。
  //   放在打 tarball 之前,让 playwright 包进 tarball。
  // [T-452] 按需跳过:内测/快打场景可 CREATOROS_SKIP_PLAYWRIGHT=1 省 1-3 分钟(扫码/网页截图会
  //   在真机上回落到"需要安装 Playwright"提示)。**发布分发包时不要跳**。
  if (process.env.CREATOROS_SKIP_PLAYWRIGHT === "1") {
    console.log("[build-sidecar] ⏭ [T-452] CREATOROS_SKIP_PLAYWRIGHT=1 → 跳 bundlePlaywright(扫码/网页截图将失效)");
  } else {
    bundlePlaywright();
  }

  // [T-289] 实拷 gsap/hyperframes 完整包(补 Next tracing 漏的 dist/cli.js/gsap.min.js)——
  //   视频渲染「生成合成模板」步的依赖,不补齐必崩(见 bundleRenderDeps 注释)。放打 tarball 前。
  // [T-452] CREATOROS_SKIP_RENDER=1 跳,省 30-60 秒;视频渲染功能会失效。
  if (process.env.CREATOROS_SKIP_RENDER === "1") {
    console.log("[build-sidecar] ⏭ [T-452] CREATOROS_SKIP_RENDER=1 → 跳 bundleRenderDeps(视频渲染将失效)");
  } else {
    bundleRenderDeps();
  }

  // Pi 缺席时 Agent Worker 会拒绝启动，不能作为可选功能跳过。
  bundlePiEngine();
  bundleWorkerExternalPackages();

  // [T-383] 实拷 @xenova/transformers 完整闭包(修 T-356 worker 化后打包版 whisper-local
  //   「Cannot find module '@xenova/transformers'」)—— 放 T-225/T-225b 安全网之前、打 tarball 前。
  // [T-452] CREATOROS_SKIP_XENOVA=1 跳,省 1-3 分钟;whisper-local ASR 会失效(云端 ASR 不受影响)。
  if (process.env.CREATOROS_SKIP_XENOVA === "1") {
    console.log("[build-sidecar] ⏭ [T-452] CREATOROS_SKIP_XENOVA=1 → 跳 bundleXenovaTransformers(whisper-local 失效)");
  } else {
    bundleXenovaTransformers();
  }

  // [T-225] onnxruntime 原生库补拷(修 whisper-local 逐字稿转录 dlopen 崩)—— 在打 tarball 前，让 dylib 进包。
  ensureOnnxRuntimeDylib();
  // [T-225b] sharp 0.32.x 原生补拷(修 @xenova/transformers 顶层 import 连坐崩,同上第二层)。
  ensureSharpNative();
  const dedupedOnnxAliases = dedupeIdenticalOnnxAliases(
    join(SIDECAR_RUNTIME, "node_modules", ".pnpm"),
  );
  if (dedupedOnnxAliases > 0) {
    console.log(`[build-sidecar]   ✓ ONNX 动态库 ABI 别名去重 ${dedupedOnnxAliases} 处`);
  }

  // [T-326 RT-H09] 静态 ffmpeg 实拷(douyin 抽音 + whisper-local 解码的运行时解析链第②级)——
  //   放打 tarball 前,让 sidecar/frontend/bin/ffmpeg 进包。拉不到 → warn 跳过(回落用户自装)。
  bundleMediaTools(triple);

  // [T-413 §4 安全] 打 tarball 前脱敏构建绝对路径(server.js/manifest/.bin shim 里的用户名+布局)。
  //   放最后:确保 playwright/xenova/ffmpeg 等后续步引入的 .bin shim 也一并脱敏。
  sanitizeBuildPaths(SIDECAR_RUNTIME);

  // [T-451] verdict-token 公钥烘焙 —— 从 CI secret 读 CREATOROS_VERDICT_PUBKEY_B64,写入
  //   sidecar/frontend/.next/server/verdict-verify-key.json。sidecar 侧 instrumentation.ts 读它
  //   校验 Rust 壳签发的 verdict-bound token(Ed25519)。
  //   位置选择:sanitizeBuildPaths 之后(避免脱敏误伤 JSON 里的 base64 串)、packSidecarTarball
  //   之前(公钥要进 tarball / Windows 直装目录)。
  bakeVerdictPublicKey();

  // [T-640] Apple 公证会递归扫描 sidecar.tar.gz。仅签外层 CreatorOS.app 不会触达压缩包内的
  // Chromium、Node、原生 addon 与 dylib，因此必须在 tar 前按“Mach-O → 嵌套 bundle 由内到外”
  // 使用同一 Developer ID + secure timestamp + hardened runtime 重签。保留 Chromium entitlements，
  // 但不保留原厂 designated requirements（否则换签后 requirement 与新证书冲突）。
  // [T-441] 必须先把 cpSync 改写成绝对路径的 Chromium Framework symlink 恢复为包内相对链；
  // 否则 codesign 会把链接目标解析回构建机缓存，并以“framework 根目录含未封装内容”拒签。
  // packSidecarTarball 内仍保留同一道闸作为最终防线；此处提前执行是签名前置条件。
  fixOutOfTreeSymlinks();
  const prunedPortableMetadata = prunePortableMetadataFiles(SIDECAR_RUNTIME);
  if (prunedPortableMetadata.length > 0) {
    console.log(
      `[build-sidecar]   ✂ 删除 ${prunedPortableMetadata.length} 个 AppleDouble/.DS_Store 元数据文件（签名前）`,
    );
  }
  signMacRuntimePayloadForNotarization(SIDECAR_RUNTIME, {
    identity: process.env.APPLE_SIGNING_IDENTITY,
    jitEntitlementsPath: join(SRC_TAURI, "runtime-jit-entitlements.plist"),
  });

  // [T-169] dylib co-ship + playwright 实拷之后打 tarball(含 lib/ 里的 libnode)。tauri build
  //   bundle 的是这个单文件,规避 Tauri resource 拷贝丢 symlink 的坑;首启由 lib.rs 系统 tar 解压。
  if (process.env.CREATOROS_SKIP_TARBALL !== "1") {
    packSidecarTarball();
  } else {
    console.log(
      "[build-sidecar] ⏭ CREATOROS_SKIP_TARBALL=1 → 只产 clean runtime，tar 留到最终变换后压一次。",
    );
  }

  console.log(`[build-sidecar] ✅ 完成。`);
  console.log(`    sidecar bin (=node runtime): ${sidecarPath}`);
  if (platform === "darwin") {
    console.log(`    [T-172] mac Dock 隐身 wrapper: ${join(SIDECAR_RUNTIME, "server.app", "Contents", "MacOS", "creatoros-server")}`);
  }
  console.log(`    standalone 运行目录         : ${SIDECAR_RUNTIME}`);
  console.log(`    server.js                  : ${join(SIDECAR_RUNTIME, "frontend", "server.js")}`);
  if (shouldPackSidecarTarball() && process.env.CREATOROS_SKIP_TARBALL !== "1") {
    console.log(`    bundle tarball             : ${join(SRC_TAURI, "sidecar.tar.gz")}`);
    console.log(platform === "win32"
      ? "    Windows NSIS 安装期由应用内置 Rust 解压器物化到 $INSTDIR/runtime-images；首启零解压。"
      : "    Tauri bundle 携带 tar resource；Rust 侧在 appData 原子解压后运行。");
  } else {
    console.log(`    Windows direct resource    : ${SIDECAR_RUNTIME}`);
    console.log("    Tauri/NSIS 安装时展开到安装目录；首启不再调用 tar、不再写 C 盘 runtime 缓存。");
  }
}

function isDirectExecution() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isDirectExecution()) main();
