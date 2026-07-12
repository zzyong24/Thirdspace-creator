#!/usr/bin/env node
// [T-147 P1] 桌面端一键打包流水线 —— 「以后 pnpm desktop:package 一键重打」(用户硬要求)。
//
// 全链:① sidecar 二进制化(next standalone build + 组装 + node runtime)→ ② tauri build 出
//       未签名 .app/.dmg。业务代码每次改完,跑这一条命令即可重出桌面包。
//
// 参照 skills-manager/scripts/run-rust-cli.mjs 的 cargo 解析健壮性(cargo 不在 PATH 时回退
// rustup which)。sidecar 二进制化是 CreatorOS 自研(Next SSR,非 skills-manager 的 Rust CLI)。
//
// 诚实边界:
//   - 未签名/未公证。codesign/notarize(mac)+ Authenticode(win)需**用户的证书**,不在 P1。
//     签名接入见 tauri.conf.json bundle.macOS.signingIdentity / bundle.windows.certificateThumbprint。
//   - 仅产本机 target。跨平台(win/mac-x64)需在对应平台跑本脚本。

import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, rmSync } from "node:fs";
import { dirname, join, resolve, delimiter } from "node:path";
import { fileURLToPath } from "node:url";

const FRONTEND = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

// cargo 解析(skills-manager 模式):PATH 上有就用;否则 rustup which rustc 推 cargo。
function canRun(cmd, args = ["--version"]) {
  return spawnSync(cmd, args, { stdio: "ignore" }).status === 0;
}
function resolveCargo() {
  if (process.env.CARGO && existsSync(process.env.CARGO)) return process.env.CARGO;
  if (canRun("cargo")) return "cargo";
  const r = spawnSync("rustup", ["which", "rustc"], { encoding: "utf8" });
  if (r.status === 0 && r.stdout.trim()) {
    const cargoPath = join(dirname(r.stdout.trim()), "cargo");
    if (existsSync(cargoPath)) return cargoPath;
  }
  console.error("[desktop:package] cargo 未找到。装 Rust 或确保 cargo/rustup 在 PATH。");
  process.exit(127);
}

function step(name, cmd, args, extraEnv = {}) {
  console.log(`\n[desktop:package] ▶ ${name}\n[desktop:package]   $ ${cmd} ${args.join(" ")}`);
  const r = spawnSync(cmd, args, {
    stdio: "inherit",
    cwd: FRONTEND,
    env: { ...process.env, ...extraEnv },
  });
  if (r.status !== 0) {
    console.error(`[desktop:package] ✗ 步骤失败:${name}(exit ${r.status})`);
    process.exit(r.status ?? 1);
  }
}

const cargo = resolveCargo();
const cargoBinDir = cargo === "cargo" ? "" : dirname(cargo);
const pathEnv = cargoBinDir ? { PATH: `${cargoBinDir}${delimiter}${process.env.PATH ?? ""}` } : {};

console.log("[desktop:package] CreatorOS 桌面端打包开始。");

// [T-226] DMG 打包前清残留挂载/临时镜像。bundle_dmg.sh 一次中途崩(AppleScript/Finder 步)
// 会留下 rw.PID.*.dmg 临时镜像 + 挂着的 /Volumes/CreatorOS* 卷;之后每次 DMG 打包都会因
// 残留卷再崩,自我固化成「DMG 永远打不出来」(T-226 真因;报错里的 EcmaScript 警告是
// next build 的无关 WARN)。此处 best-effort 预清:只 detach 镜像路径在本仓 bundle 目录
// 下的挂载,并删两处 rw.*.dmg 残留;清不掉只告警不 fail(不动主线 app/updater 打包)。
// 手动解卡:node scripts/desktop/package.mjs --preclean-only
function precleanDmgLeftovers() {
  const bundleDir = join(FRONTEND, "src-tauri", "target", "release", "bundle");
  const info = spawnSync("hdiutil", ["info"], { encoding: "utf8" });
  if (info.status === 0 && info.stdout) {
    // hdiutil info 按 image 分段:image-path 行 + 其下 /dev/diskN 行。
    let currentImage = "";
    for (const line of info.stdout.split("\n")) {
      const imgMatch = line.match(/^image-path\s*:\s*(.+)$/);
      if (imgMatch) currentImage = imgMatch[1].trim();
      const devMatch = line.match(/^(\/dev\/disk\d+)/);
      if (devMatch && currentImage.startsWith(bundleDir)) {
        const dev = devMatch[1].replace(/s\d+$/, "");
        console.log(`[desktop:package] [T-226] 预清残留挂载:${dev}(${currentImage})`);
        const r = spawnSync("hdiutil", ["detach", dev, "-force"], { stdio: "inherit" });
        if (r.status !== 0) console.warn(`[desktop:package] ⚠ detach ${dev} 失败(继续,不阻塞)`);
        currentImage = "";
      }
    }
  }
  for (const sub of ["macos", "dmg"]) {
    const dir = join(bundleDir, sub);
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir)) {
      if (/^rw\.\d+\..*\.dmg$/.test(f)) {
        console.log(`[desktop:package] [T-226] 删残留临时镜像:${join(sub, f)}`);
        try {
          rmSync(join(dir, f), { force: true });
        } catch (e) {
          console.warn(`[desktop:package] ⚠ 删除失败(继续):${e?.message ?? e}`);
        }
      }
    }
  }
}
precleanDmgLeftovers();
if (process.argv.includes("--preclean-only")) {
  console.log("[desktop:package] [T-226] --preclean-only:预清完成,退出。");
  process.exit(0);
}

// 1) sidecar 二进制化(内部会跑 CREATOROS_DESKTOP=1 next build)。
step("sidecar 二进制化", process.execPath, [join("scripts", "desktop", "build-sidecar.mjs")]);

// 2) [T-164 P6] sidecar bundle JS 混淆(build-sidecar 之后、tauri build 之前)。
//    幂等 + 硬排除 + symlink 逃逸防护;失败 fail-fast(见 obfuscate.mjs)。
//    ⚠️ tauri.conf.json beforeBuildCommand 会在 tauri build 里**再跑一次 build-sidecar**(重建
//    干净 sidecar),那次重建会覆盖此处混淆结果。故这里改成:先禁 beforeBuildCommand 的重建冲突——
//    通过 CREATOROS_SKIP_SIDECAR_REBUILD env 让 build-sidecar 在 tauri build 阶段跳过(见下 step 3
//    注入)。混淆放在 build-sidecar(步1)之后、tauri build(步3)之前,tauri build 不再重建即保住混淆。
step("sidecar JS 混淆(§3.1)", process.execPath, [join("scripts", "desktop", "obfuscate.mjs")]);

// 2.5) [T-164] 混淆后运行时冒烟(真起 sidecar:TCP ready + GET / 200 + 一条 ai-runtime 路由不崩)。
//    §3.1 验收闸 / gate ④:ready-probe 只证 boot,冒烟证运行时没被混淆炸。失败 → fail-fast + 回滚
//    (回滚 = 重跑 build-sidecar 拿干净源;此处仅 fail,提示重建)。
//    真机/CI 必跑;本地若嫌重可 CREATOROS_SKIP_SMOKE=1 跳过(默认跑)。
if (process.env.CREATOROS_SKIP_SMOKE !== "1") {
  step("混淆后运行时冒烟(真起 sidecar)", process.execPath, [
    join("scripts", "desktop", "obfuscate.mjs"),
    "--smoke-only",
  ]);
} else {
  console.log("[desktop:package] ⏭ CREATOROS_SKIP_SMOKE=1 → 跳过运行时冒烟(真机/CI 必跑)。");
}

// 3) tauri build。beforeBuildCommand(build-sidecar)会重建 sidecar → 覆盖步2的混淆。
//    注入 CREATOROS_SKIP_SIDECAR_REBUILD=1 让 build-sidecar 在此阶段短路(保住已混淆的 sidecar)。
step("tauri build(含 updater 签名/占位)", process.execPath, [
  join("node_modules", "@tauri-apps", "cli", "tauri.js"),
  "build",
], { ...pathEnv, CREATOROS_SKIP_SIDECAR_REBUILD: "1" });

// 4) [T-164 P6] 代码签名占位(未配 env → skip 退 0 + 标 signed:false)。
step("代码签名(占位)", process.execPath, [join("scripts", "desktop", "codesign.mjs")]);

// 5) [T-164 P6] 公证占位(未配 env → skip 退 0 + 标 notarized:false)。
step("公证(占位)", process.execPath, [join("scripts", "desktop", "notarize.mjs")]);

console.log(
  "\n[desktop:package] ✅ 完成。产物在 src-tauri/target/release/bundle/(macos/*.app + dmg/*.dmg)。",
);
console.log("[desktop:package] 签名/公证状态见 bundle/creatoros-release-manifest.json(未配证书则 signed:false)。");
