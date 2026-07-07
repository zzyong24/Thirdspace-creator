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
import { existsSync } from "node:fs";
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

console.log("[desktop:package] CreatorOS 桌面端打包(未签名)开始。");

// 1) sidecar 二进制化(内部会跑 CREATOROS_DESKTOP=1 next build)。
step("sidecar 二进制化", process.execPath, [join("scripts", "desktop", "build-sidecar.mjs")]);

// 2) tauri build(beforeBuildCommand 会再跑一次 build-sidecar 以保证最新;幂等)。
step("tauri build(出未签名 .app/.dmg)", process.execPath, [
  join("node_modules", "@tauri-apps", "cli", "tauri.js"),
  "build",
], pathEnv);

console.log(
  "\n[desktop:package] ✅ 完成。产物在 src-tauri/target/release/bundle/(macos/*.app + dmg/*.dmg)。",
);
console.log("[desktop:package] 注意:未签名/未公证 —— 首次打开需右键「打开」绕过 Gatekeeper;正式分发待用户证书。");
