#!/usr/bin/env node
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
import { existsSync, mkdirSync, rmSync, cpSync, chmodSync, copyFileSync, lstatSync, readdirSync, readlinkSync, symlinkSync, writeFileSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { platform, arch } from "node:process";
import { homedir } from "node:os";
// [T-326 RT-H09] 静态 ffmpeg 拉取(缓存 + GitHub release 下载 + 冒烟),供 bundleFfmpeg 实拷进 sidecar。
import { ensureFfmpegStatic } from "./fetch-ffmpeg.mjs";
// [T-372 W2] Playwright 浏览器缓存根目录按平台映射(mac/win/linux;纯函数,平台分支可单测)。
import { playwrightBrowsersCacheRoot } from "./platform-paths.mjs";

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

// [T-169] 把组装好的 sidecar/ 打成单文件 tarball `src-tauri/sidecar.tar.gz`,供 Tauri 当 resource 带上。
//   为何 tarball 而非整目录:Tauri 的 resource 拷贝器**丢 symlink**(实测源 180 → bundle 0),
//   sidecar 靠 pnpm 相对 symlink 解析 node_modules → 丢了必崩。tarball 把 symlink 原样存档,首启由
//   lib.rs 用系统 tar 解压到可写目录(原生保 symlink)。
//   `-C <dir> .`:进 sidecar/ 后打其内容(不含 sidecar/ 前缀),解压到 dest 即 dest/frontend/server.js。
//   tar 默认把 symlink 存为 symlink(不 -h 解引用)—— 正是所需。
function packSidecarTarball() {
  const tarball = join(SRC_TAURI, "sidecar.tar.gz");
  // [T-372 L2] 入口完整性链:本脚本(beforeBuildCommand)先产 tarball → 随后的 cargo 构建里
  //   src-tauri/build.rs 对它算 SHA-256 并经 rustc-env 内嵌进壳二进制 → 运行时 lib.rs 解压前
  //   比对,不匹配拒绝 spawn(改 JS 必先动 Rust)。哈希不在此处算 —— 单一实现在 build.rs。
  console.log(`[build-sidecar] 打 sidecar.tar.gz(保留 symlink,供 bundle resource;解压见 lib.rs)…`);
  const r = spawnSync("tar", ["-czf", tarball, "-C", SIDECAR_RUNTIME, "."], { stdio: "inherit" });
  if (r.status !== 0) throw new Error(`[build-sidecar] tar 打包失败(exit ${r.status})`);
  console.log(`[build-sidecar]   → ${tarball}`);
}

// [T-170] 采集/扫码依赖 Playwright,但 Next output-tracing **漏掉** douyin-cdp/web-capture 里的
//   动态 `import("@playwright/test")`(playwright-core 的 .pnpm 被拖进来了,但 frontend/node_modules/
//   下没建解析链)→ 打包版一点扫码就 ERR_MODULE_NOT_FOUND → loginDouyin 抛错「扫码登录失败」。
//   修:把 @playwright/test → playwright → playwright-core 三个包**解引用实拷**进 sidecar 的
//   frontend/node_modules/(全在顶层,node 从 frontend/ walk-up 即解析)。依赖链已核实只此三包
//   (@playwright/test deps playwright;playwright deps playwright-core;playwright-core 自包含)。
//   注:chromium **浏览器二进制**(rev 1223,344M)在 ~/Library/Caches/ms-playwright,**不**在此拷
//   (bundle 体积决策留产品定;用户机有缓存即可用,分发到无缓存机器需另 bundle/首启下载,见 T-170②)。
function bundlePlaywright() {
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
    // ① frontend/node_modules 直拷(直接 import 路径 / 自检走这)。
    const destDir = join(destNm, pkg);
    rmSync(destDir, { recursive: true, force: true });
    mkdirSync(dirname(destDir), { recursive: true });
    cpSync(srcDir, destDir, { recursive: true, dereference: true });
    // ② **覆盖 Next-traced 的 .pnpm 残缺版**(关键):Next serverExternalPackages 运行时从
    //   `.pnpm/<pkg>@ver/node_modules/<pkg>` 解析这些外置包,而 Next tracing 只带了 JS、**漏了
    //   browsers.json 等数据文件** → chromium.launch 报「Cannot find module …/browsers.json」→ 扫码崩。
    //   (T-170 首版只拷 frontend/node_modules,Next 不从那解析 → 真机仍崩;真 app dispatch 才暴露。)
    //   用完整仓库版整体覆盖 .pnpm 下每个匹配条目。
    const key = pkg.replace("/", "+"); // @playwright/test → @playwright+test
    if (existsSync(pnpmDir)) {
      for (const e of readdirSync(pnpmDir).filter((x) => x.startsWith(key + "@"))) {
        const d2 = join(pnpmDir, e, "node_modules", pkg);
        rmSync(d2, { recursive: true, force: true });
        mkdirSync(dirname(d2), { recursive: true });
        cpSync(srcDir, d2, { recursive: true, dereference: true });
        pnpmOverwrote++;
      }
    }
    console.log(`[build-sidecar]   实拷 ${pkg} ← ${srcDir}`);
  }
  console.log(`[build-sidecar]   覆盖 .pnpm 残缺版 ${pnpmOverwrote} 处`);
  // [T-284] 顺带把 Chromium 浏览器二进制打进 sidecar(见 bundleChromiumBrowser 注释)。
  bundleChromiumBrowser();
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

// [T-289 真机逮到根因] 实拷 gsap + hyperframes 完整包(补 Next tracing 漏的 dist 文件)。
//   病根:视频渲染的 gsap.min.js / hyperframes dist/cli.js 是 executor **运行时 require 的文件**,
//   Next tracing 追不到 → 打包后 sidecar 的 .pnpm 里这俩包只剩 package.json、dist 全缺 → executor
//   `resolveGsapMinJs/resolveHyperframesCli` 拿不到文件(且打包混淆 runtime 里 require.resolve 还
//   返回数字模块 ID → path.dirname(number) 崩「path 收到 number 371609」)。**视频渲染在打包版
//   从没成功过**。这里从源仓 .pnpm 整份实拷覆盖(dereference,把 hyperframes 的 dep 符号链接也拷成
//   真目录),补齐 dist + deps。与 bundlePlaywright 同款手法。
function bundleRenderDeps() {
  console.log("[build-sidecar] 实拷 gsap/hyperframes(补 Next tracing 漏的 dist/cli.js,T-289)…");
  const srcPnpm = join(REPO, "node_modules", ".pnpm");
  const destPnpm = join(SIDECAR_RUNTIME, "node_modules", ".pnpm");
  if (!existsSync(srcPnpm) || !existsSync(destPnpm)) {
    throw new Error(`[build-sidecar] .pnpm 目录缺(src=${existsSync(srcPnpm)} dest=${existsSync(destPnpm)})`);
  }
  const srcEntries = readdirSync(srcPnpm);
  for (const pkg of ["gsap", "hyperframes"]) {
    const match = srcEntries.find((e) => e.startsWith(`${pkg}@`));
    if (!match) {
      throw new Error(`[build-sidecar] 源 .pnpm 无 ${pkg}@*(装依赖?)`);
    }
    const src = join(srcPnpm, match);
    const dest = join(destPnpm, match);
    rmSync(dest, { recursive: true, force: true });
    mkdirSync(dirname(dest), { recursive: true });
    cpSync(src, dest, { recursive: true, dereference: true });
    console.log(`[build-sidecar]   实拷 ${match}`);
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
  console.log("[build-sidecar]   ✓ 自检:gsap.min.js + hyperframes cli.js 到位");
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

// .pnpm entry 名 → 包名(@scope+name@ver → @scope/name;name@ver → name)。
function pkgNameOfEntry(entry) {
  if (entry.startsWith("@")) {
    const at2 = entry.indexOf("@", 1);
    return entry.slice(0, at2).replace("+", "/");
  }
  return entry.slice(0, entry.indexOf("@"));
}

// [T-372 W] npm 经典嵌套物化:把 .pnpm entry 的包真身 + 其依赖**递归嵌套**拷到 destPkgDir
// (每个包的 node_modules 里放自己依赖的真拷贝;全真文件,零 symlink/junction)。
//   为何 Windows 需要它(CI W-diag 2026-07-18 实证):cpSync 对 pnpm 的 junction 会**静默
//   解引用成真目录且只展平一层**——entry 的 node_modules 下依赖变真拷贝,但真拷贝内部没有
//   自己的依赖 → 传递依赖(如 onnxruntime-node→onnxruntime-common)walk-up 找不到即崩。
//   嵌套布局是 Node 解析的原生语义,tar/用户机无 symlink 权限需求,天然可搬。
//   防环:seenChain 记当前链上 entry,再遇即跳(walk-up 自然命中祖先层,npm 同语义)。
//   体积:树内共享依赖重复拷(浅树可接受);mac 保持 .pnpm+相对链方案不走此路。
function materializeNestedEntryTree(srcPnpm, entryName, destPkgDir, seenChain) {
  const pkgName = pkgNameOfEntry(entryName);
  const srcPkgDir = join(srcPnpm, entryName, "node_modules", ...pkgName.split("/"));
  if (!existsSync(srcPkgDir)) {
    throw new Error(`[build-sidecar] 嵌套物化:entry 真身缺失 ${srcPkgDir}`);
  }
  cpSync(srcPkgDir, destPkgDir, { recursive: true, dereference: true });
  for (const depEntry of pnpmDepsOfEntry(srcPnpm, entryName)) {
    const depName = pkgNameOfEntry(depEntry);
    if (depName === pkgName) continue; // pnpm 的 self-link,跳过
    if (seenChain.has(depEntry)) continue; // 环:祖先层已有,walk-up 可命中
    const depDest = join(destPkgDir, "node_modules", ...depName.split("/"));
    seenChain.add(depEntry);
    materializeNestedEntryTree(srcPnpm, depEntry, depDest, seenChain);
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

// [T-313 打包实拷] 实拷 Pi 引擎(@earendil-works/pi-coding-agent)运行时依赖闭包进 sidecar。
//   病根:pi-engine.ts 运行时**深文件导入** `dist/core/sdk.js`(+ model-registry/auth-storage/
//   session-manager),而 pi 是 serverExternalPackages + 动态 import → Next standalone tracing
//   **整棵 pi 树没拖进 sidecar**(实测:打包 sidecar 的 .pnpm 里 0 个 pi-coding-agent / openai / chalk
//   / debug / ws)→ locatePiCoreDir() 找不到 sdk.js → Pi 引擎永远退确定性兜底,「点亮」名存实亡。
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
//     只产 "anthropic-messages" / "openai-completions" 两种 api → bedrock/google/mistral 三个 provider
//     **永不被 import**。故剪掉这三个 provider 顶包(连带其独占传递依赖 @smithy/@protobufjs/google-auth
//     等,省 ~91MB);**openai + @anthropic-ai/sdk 必留**(两种格式各需其一,均在闭包内)。剪枝安全网 =
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
  const isCut = (entry) => CUT_PKG.includes(pkgNameOfEntry(entry)); // pkgNameOfEntry 已提模块级

  // 定位 pi-coding-agent 根 entry;缺 → pi 没装(feature 层可退兜底)→ 警告跳过,不硬阻塞打包。
  const rootEntry = readdirSync(srcPnpm).find((x) => x.startsWith(`${PI_PNPM}@`));
  if (!rootEntry) {
    console.warn(
      `[build-sidecar] ⚠ 源 .pnpm 无 ${PI_PKG}@*(未装?)—— 跳过 Pi 实拷。打包版 Pi 引擎将退确定性兜底。`,
    );
    return;
  }

  // BFS 算闭包(剪掉 provider 顶包子树)。
  const visited = collectPnpmClosure(srcPnpm, rootEntry, isCut);

  // 逐 entry 实拷(verbatimSymlinks 保相对链;整份闭包在同一 .pnpm/ 内自洽解析)。
  //   覆盖已存在条目无害:同版本源自同一仓库 .pnpm,内容一致(complete ⊇ Next 部分 trace),app 不受损。
  let copied = 0;
  for (const e of visited) {
    const src = join(srcPnpm, e);
    const dest = join(destPnpm, e);
    rmSync(dest, { recursive: true, force: true });
    mkdirSync(dirname(dest), { recursive: true });
    cpSync(src, dest, { recursive: true, verbatimSymlinks: true });
    copied++;
  }
  console.log(`[build-sidecar]   实拷 ${copied} 个 pi 闭包 entry(剪 bedrock/google/mistral;含 openai+@anthropic-ai/sdk)`);

  // photon-node 的 .wasm 特殊资源核实(纯文件,verbatim 应已覆盖;缺则 pi 图像工具会崩)。
  const photonEntry = [...visited].find((e) => e.startsWith("@silvia-odwyer+photon-node@"));
  if (photonEntry) {
    const wasm = join(destPnpm, photonEntry, "node_modules", "@silvia-odwyer", "photon-node", "photon_rs_bg.wasm");
    if (!existsSync(wasm)) {
      throw new Error(`[build-sidecar] 自检失败[T-313]:photon-node .wasm 未随实拷到位(${wasm})`);
    }
    console.log("[build-sidecar]   ✓ photon-node photon_rs_bg.wasm 到位");
  }

  // HARD 自检:sidecar node **真深导入** sdk.js + 三个兄弟(与 pi-engine locatePiCoreDir 同路径),
  //   断言 createAgentSession 是函数 + ModelRegistry/AuthStorage/SessionManager 均在。这条同时验证:
  //   ①闭包完整(任一 entry 漏 → 相对 symlink 悬空 → import 崩)②剪枝安全(cut 的 provider 不在静态图)。
  //   假通过零容忍(教训同 playwright 自检②):import 崩则 throw,宁 build 失败也不出「点亮却失活」的包。
  const coreDir = join(destPnpm, rootEntry, "node_modules", PI_PKG, "dist", "core");
  const selfCheck = `
    import { pathToFileURL } from 'node:url';
    import path from 'node:path';
    const base = ${JSON.stringify(coreDir)};
    const imp = (f) => import(pathToFileURL(path.join(base, f)).href);
    const [sdk, mr, as, sm] = await Promise.all([imp('sdk.js'), imp('model-registry.js'), imp('auth-storage.js'), imp('session-manager.js')]);
    const ok = typeof sdk.createAgentSession === 'function' && !!mr.ModelRegistry && !!as.AuthStorage && !!sm.SessionManager;
    console.log('PI createAgentSession=' + typeof sdk.createAgentSession + ' ModelRegistry=' + !!mr.ModelRegistry + ' AuthStorage=' + !!as.AuthStorage + ' SessionManager=' + !!sm.SessionManager);
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
  cpSync(srcBrowser, destBrowser, { recursive: true, dereference: true });
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
//   运行时已改 resolveFfmpegPath 四级解析链(ai-worker/src/runtime/ffmpeg-path.ts),其第②级
//   约定随包位置 = `<cwd>/bin/ffmpeg`(打包版 server.js 的 cwd = sidecar/frontend,与 T-284
//   PLAYWRIGHT_BROWSERS_PATH=<cwd>/browsers 同款约定)。本函数把它放到位。
//   二进制源:eugeneware/ffmpeg-static release 的静态构建(fetch-ffmpeg.mjs 拉取+缓存+冒烟;
//   **不能**拷 Homebrew ffmpeg —— 那是动态链接,无 Homebrew 的用户机 dyld 必崩,同 libnode 坑)。
//   失败姿态(与 bundleChromiumBrowser 一致):拉不到 → warn + 跳过,不阻塞打包 —— 打包版
//   回落解析链③(PATH/常见目录)= 依赖用户自装 ffmpeg;全 miss 时运行时诚实报错引导安装。
//   ⚠️ 许可:ffmpeg-static 是 GPL 构建,随包分发需在第三方许可声明里带 ffmpeg(GPL)条目。
function bundleFfmpeg(triple) {
  const isWinTarget = triple.includes("windows");
  const destDir = join(SIDECAR_RUNTIME, "frontend", "bin");
  const dest = join(destDir, isWinTarget ? "ffmpeg.exe" : "ffmpeg");
  let src;
  try {
    src = ensureFfmpegStatic(triple);
  } catch (e) {
    console.warn(
      `[build-sidecar] ⚠ [RT-H09] 静态 ffmpeg 未就绪(${e.message})—— 跳过随包。打包版将回落` +
        ` resolveFfmpegPath 解析链(PATH/常见目录/env),无 ffmpeg 的用户机上转录/抽音会诚实报错引导安装。`,
    );
    return;
  }
  mkdirSync(destDir, { recursive: true });
  rmSync(dest, { force: true });
  copyFileSync(src, dest);
  if (!isWinTarget) chmodSync(dest, 0o755);
  // 硬自检:实拷后必须存在;host 可跑的 target 再跑一次 -version(不容半截二进制进包 ——
  //   教训同 playwright 自检②:只拷不验会假通过)。交叉 target 跑不动,诚实标注留待目标机验证。
  if (!existsSync(dest)) {
    throw new Error(`[build-sidecar] 自检失败[RT-H09]:ffmpeg 实拷后不存在(${dest})`);
  }
  const hostTriple = targetTriple();
  if (triple === hostTriple) {
    const r = spawnSync(dest, ["-version"], { encoding: "utf8" });
    if (r.status !== 0 || !`${r.stdout}`.startsWith("ffmpeg version")) {
      throw new Error(
        `[build-sidecar] 自检失败[RT-H09]:sidecar 内 ffmpeg -version 未通过(status=${r.status})→ 不出必崩的包`,
      );
    }
    console.log(
      `[build-sidecar]   ✓ [RT-H09] 静态 ffmpeg 随包就绪 → sidecar/frontend/bin/(${`${r.stdout}`.split("\n")[0]})`,
    );
  } else {
    console.log(
      `[build-sidecar]   ✓ [RT-H09] 静态 ffmpeg 已实拷(交叉 target ${triple},-version 冒烟留待目标机验证 —— 诚实标注)`,
    );
  }
}

function main() {
  // [T-383] 开发验证开关:只跑 @xenova/transformers 拷贝段(against 已组装的 sidecar,不重建
  //   standalone / 不打 tarball)。全量 build 很慢;这个开关让「拷贝 + 自检」段可独立真跑验证。
  //   正式出包仍走完整流程(main 里 bundleXenovaTransformers 常规在链上)。
  if (process.env.CREATOROS_SIDECAR_XENOVA_ONLY === "1") {
    if (!existsSync(join(SIDECAR_RUNTIME, "frontend", "server.js"))) {
      throw new Error("[build-sidecar] CREATOROS_SIDECAR_XENOVA_ONLY=1 需已存在组装好的 sidecar(先跑一次完整 build)");
    }
    bundleXenovaTransformers();
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
      console.log(
        "[build-sidecar] ⏭ CREATOROS_SKIP_SIDECAR_REBUILD=1 且 sidecar 已存在 → 跳过重建(保住 obfuscate 步的混淆结果)。",
      );
      // [T-169] 即便跳过重建,也从当前(已混淆的)sidecar/ 重打 tarball —— tauri build 要 bundle 它。
      packSidecarTarball();
      return;
    }
    console.warn(
      "[build-sidecar] ⚠️ CREATOROS_SKIP_SIDECAR_REBUILD=1 但 sidecar 不存在 → 仍重建(否则打包缺 sidecar)。",
    );
  }

  const triple = targetTriple();
  const isWin = platform === "win32";
  console.log(`[build-sidecar] target triple = ${triple}`);

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
  rmSync(SIDECAR_RUNTIME, { recursive: true, force: true });
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

  // [T-392 安全] 剥离 standalone trace 混进的源码/文档/测试产物(2026-07-18 实包盘点:
  //   src/ 269 个 .ts 明文源码 + docs/ 47MB 设计文档截图 + specs/ + SPEC.md 等 —— 源码进包
  //   = 混淆白做,设计文档 = 给逆向者的地图)。已验运行时零引用(编译产物 grep 这些路径
  //   0 命中,仅 nextjs.org/docs URL 假命中);删后有混淆步的运行时冒烟兜底,删坏必炸不出包。
  {
    const fe = join(SIDECAR_RUNTIME, "frontend");
    const leaks = [
      "src", "docs", "specs", "tests", "scripts", "playwright-report", "test-results",
      "SPEC.md", "AGENT-PROTOCOL.md", "IMPLEMENTATION-ARCHITECTURE.md",
      "TDD-PLAN.md", "TESTING.md", "README.md",
      "eslint.config.mjs", "playwright.config.ts", "vitest.config.ts",
    ];
    let pruned = 0;
    for (const name of leaks) {
      const p = join(fe, name);
      if (existsSync(p)) { rmSync(p, { recursive: true, force: true }); pruned++; }
    }
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
    const otool = spawnSync("otool", ["-L", sidecarPath], { encoding: "utf8" });
    if (otool.status === 0) {
      const libs = otool.stdout
        .split("\n")
        .map((l) => l.trim().split(" ")[0])
        .filter((p) => p.includes("libnode") || p.includes("@rpath/"));
      const nodeLibDir = join(dirname(process.execPath), "..", "lib");
      for (const ref of libs) {
        const base = ref.split("/").pop();
        if (!base) continue;
        const src = join(nodeLibDir, base);
        if (existsSync(src)) {
          const dst = join(libDir, base);
          rmSync(dst, { force: true }); // 覆盖只读旧文件(Homebrew dylib r--r--r--)避免 EACCES
          copyFileSync(src, dst);
          chmodSync(dst, 0o644);
          console.log(`[build-sidecar]   co-shipped dylib → sidecar/lib/${base}`);
        }
      }
    }
  }

  // [T-172] macOS:把 node 二进制额外包进 sidecar 内的一个 mini `.app`,让它在 Dock 里隐身。
  //   根因:裸 node 被 macOS LaunchServices 注册成 GUI app → 在 Dock 显通用图标(用户看到「两个图标」)。
  //   实测(lsappinfo):把 node 放进带 `LSUIElement=true` + `LSBackgroundOnly=true` 的 Info.plist 的
  //   `.app` 里、运行其内层二进制 → `lsappinfo info -only ApplicationType <pid>` 返回 NULL(=不进 Dock);
  //   裸 node 则注册为 GUI app。故打包版 macOS 走 server.app,由 lib.rs 直接 spawn 其内层二进制(见 lib.rs
  //   #[cfg(target_os = "macos")] 分支)。dylib 仍 co-ship 到 sidecar/lib/(lib.rs 注 DYLD 指过去,绝对路径)。
  //   Win/Linux 不受影响:那边 Dock 图标不是问题,仍走 externalBin 的 binaries/creatoros-server(见下)。
  if (platform === "darwin") {
    buildServerApp();
  }

  // [T-170] 实拷 Playwright 包进 sidecar(修 Next tracing 漏 @playwright/test → 打包扫码崩)。
  //   放在打 tarball 之前,让 playwright 包进 tarball。
  bundlePlaywright();

  // [T-289] 实拷 gsap/hyperframes 完整包(补 Next tracing 漏的 dist/cli.js/gsap.min.js)——
  //   视频渲染「生成合成模板」步的依赖,不补齐必崩(见 bundleRenderDeps 注释)。放打 tarball 前。
  bundleRenderDeps();

  // [T-313] 实拷 Pi 引擎依赖闭包(补 Next tracing 漏的整棵 @earendil-works/pi-coding-agent 树)——
  //   pi-engine.ts 运行时深导入 dist/core/sdk.js;不实拷则打包版 Pi 引擎永退兜底(见 bundlePiEngine 注释)。放打 tarball 前。
  bundlePiEngine();

  // [T-383] 实拷 @xenova/transformers 完整闭包(修 T-356 worker 化后打包版 whisper-local
  //   「Cannot find module '@xenova/transformers'」)—— 放 T-225/T-225b 安全网之前、打 tarball 前。
  bundleXenovaTransformers();

  // [T-225] onnxruntime 原生库补拷(修 whisper-local 逐字稿转录 dlopen 崩)—— 在打 tarball 前，让 dylib 进包。
  ensureOnnxRuntimeDylib();
  // [T-225b] sharp 0.32.x 原生补拷(修 @xenova/transformers 顶层 import 连坐崩,同上第二层)。
  ensureSharpNative();

  // [T-326 RT-H09] 静态 ffmpeg 实拷(douyin 抽音 + whisper-local 解码的运行时解析链第②级)——
  //   放打 tarball 前,让 sidecar/frontend/bin/ffmpeg 进包。拉不到 → warn 跳过(回落用户自装)。
  bundleFfmpeg(triple);

  // [T-169] dylib co-ship + playwright 实拷之后打 tarball(含 lib/ 里的 libnode)。tauri build
  //   bundle 的是这个单文件,规避 Tauri resource 拷贝丢 symlink 的坑;首启由 lib.rs 系统 tar 解压。
  packSidecarTarball();

  console.log(`[build-sidecar] ✅ 完成。`);
  console.log(`    sidecar bin (=node runtime): ${sidecarPath}`);
  if (platform === "darwin") {
    console.log(`    [T-172] mac Dock 隐身 wrapper: ${join(SIDECAR_RUNTIME, "server.app", "Contents", "MacOS", "creatoros-server")}`);
  }
  console.log(`    standalone 运行目录         : ${SIDECAR_RUNTIME}`);
  console.log(`    server.js                  : ${join(SIDECAR_RUNTIME, "frontend", "server.js")}`);
  console.log(`    bundle tarball             : ${join(SRC_TAURI, "sidecar.tar.gz")}`);
  console.log(
    "    Tauri bundle 会把 src-tauri/sidecar.tar.gz 作 resource 带上;Rust 侧首启解压到 appDataDir/runtime/<version>/sidecar(保 symlink)后跑其 frontend/server.js。",
  );
}

main();
