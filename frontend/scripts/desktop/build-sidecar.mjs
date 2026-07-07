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
import { existsSync, mkdirSync, rmSync, cpSync, chmodSync, copyFileSync, lstatSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { platform, arch } from "node:process";

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
    throw new Error(`[build-sidecar] 命令失败(exit ${r.status}): ${cmd} ${args.join(" ")}`);
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
  console.log(`[build-sidecar] 打 sidecar.tar.gz(保留 symlink,供 bundle resource;解压见 lib.rs)…`);
  const r = spawnSync("tar", ["-czf", tarball, "-C", SIDECAR_RUNTIME, "."], { stdio: "inherit" });
  if (r.status !== 0) throw new Error(`[build-sidecar] tar 打包失败(exit ${r.status})`);
  console.log(`[build-sidecar]   → ${tarball}`);
}

function main() {
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
  console.log("[build-sidecar] 1/3 next standalone build (CREATOROS_DESKTOP=1)…");
  run("pnpm", ["exec", "next", "build"], { env: { ...process.env, CREATOROS_DESKTOP: "1" } });
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

  // [T-169] dylib co-ship 之后打 tarball(含 lib/ 里的 libnode)。tauri build bundle 的是这个单文件,
  //   规避 Tauri resource 拷贝丢 symlink 的坑;首启由 lib.rs 系统 tar 解压(保 symlink)。
  packSidecarTarball();

  console.log(`[build-sidecar] ✅ 完成。`);
  console.log(`    sidecar bin (=node runtime): ${sidecarPath}`);
  console.log(`    standalone 运行目录         : ${SIDECAR_RUNTIME}`);
  console.log(`    server.js                  : ${join(SIDECAR_RUNTIME, "frontend", "server.js")}`);
  console.log(`    bundle tarball             : ${join(SRC_TAURI, "sidecar.tar.gz")}`);
  console.log(
    "    Tauri bundle 会把 src-tauri/sidecar.tar.gz 作 resource 带上;Rust 侧首启解压到 appDataDir/runtime/<version>/sidecar(保 symlink)后跑其 frontend/server.js。",
  );
}

main();
