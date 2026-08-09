#!/usr/bin/env node
// [T-147 P6 / T-164 / T-640] macOS 公证 —— SPEC §3.3(mac notarization)。
// 优先读 APPLE_NOTARY_KEYCHAIN_PROFILE（凭据由 notarytool 存进 macOS 钥匙串）。
// 兼容旧的 APPLE_ID / APPLE_TEAM_ID / APPLE_APP_PASSWORD 环境变量方式。
//   未配 → skip 退 0 + 引导 + release manifest 标 notarized:false。
//   配了 → xcrun notarytool submit --wait + xcrun stapler staple。
// Windows 无公证概念(签名即可),win 直接 skip。

import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { platform } from "node:process";
import { readManifest, writeManifest } from "./release-manifest.mjs";

const FRONTEND = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const CARGO_PROFILE_DIR =
  process.env.CREATOROS_CARGO_PROFILE_DIR ?? "release";
const BUNDLE_DIR = join(
  FRONTEND,
  "src-tauri",
  "target",
  CARGO_PROFILE_DIR,
  "bundle",
);

/** 判断是否配了公证 env。 */
export function notarizeConfig(env = process.env, plat = platform) {
  if (plat !== "darwin") return { platform: plat, applicable: false, configured: false };
  const keychainProfile = env.APPLE_NOTARY_KEYCHAIN_PROFILE?.trim();
  const keychainPath = env.APPLE_NOTARY_KEYCHAIN_PATH?.trim();
  const appleId = env.APPLE_ID;
  const teamId = env.APPLE_TEAM_ID;
  const appPassword = env.APPLE_APP_PASSWORD;
  if (keychainProfile) {
    return {
      platform: "darwin",
      applicable: true,
      configured: true,
      method: "keychain-profile",
      keychainProfile,
      keychainPath: keychainPath || null,
      appleId: null,
      teamId: null,
      appPassword: null,
    };
  }
  return {
    platform: "darwin",
    applicable: true,
    configured: Boolean(appleId && teamId && appPassword),
    method: "apple-id",
    keychainProfile: null,
    keychainPath: null,
    appleId: appleId ?? null,
    teamId: teamId ?? null,
    appPassword: appPassword ?? null,
  };
}

/** 生成 notarytool 参数。钥匙串模式不会把任何密码放进进程参数或日志。 */
export function notarytoolSubmitArgs(artifact, cfg) {
  const args = ["notarytool", "submit", artifact];
  if (cfg.method === "keychain-profile") {
    args.push("--keychain-profile", cfg.keychainProfile);
    if (cfg.keychainPath) args.push("--keychain", cfg.keychainPath);
  } else {
    args.push(
      "--apple-id", cfg.appleId,
      "--team-id", cfg.teamId,
      "--password", cfg.appPassword,
    );
  }
  args.push("--wait");
  return args;
}

/** 找 .dmg / .app 公证靶(dmg 优先,notarytool 吃 dmg/zip)。 */
function findArtifacts() {
  const out = [];
  const dmgDir = join(BUNDLE_DIR, "dmg");
  if (existsSync(dmgDir)) for (const n of readdirSync(dmgDir)) if (n.endsWith(".dmg")) out.push(join(dmgDir, n));
  return out;
}

function printSkipGuide() {
  console.log("[notarize] ⏭ 未配公证凭据,跳过(退 0)。");
  console.log("[notarize]   推荐先用 notarytool store-credentials 把凭据存进 macOS 钥匙串:");
  console.log("[notarize]     export APPLE_NOTARY_KEYCHAIN_PROFILE=<profile-name>");
  console.log("[notarize]   也兼容 Apple ID + app-specific password:");
  console.log("[notarize]     export APPLE_ID=<你的 apple id>");
  console.log("[notarize]     export APPLE_TEAM_ID=<TEAMID>");
  console.log("[notarize]     export APPLE_APP_PASSWORD=<app-specific-password>");
  console.log("[notarize]   已在 release manifest 标 notarized:false。");
}

export function main() {
  const cfg = notarizeConfig();

  if (!cfg.applicable) {
    console.log(`[notarize] ⏭ ${cfg.platform} 无公证概念(仅 macOS 需公证),跳过。`);
    const m = readManifest();
    m.notarize = { notarized: false, platform: cfg.platform, reason: "非 macOS,不适用" };
    writeManifest(m);
    process.exit(0);
  }

  if (!cfg.configured) {
    printSkipGuide();
    const m = readManifest();
    m.notarize = { notarized: false, platform: "darwin", reason: "env 未配公证凭据" };
    writeManifest(m);
    process.exit(0);
  }

  const artifacts = findArtifacts();
  if (artifacts.length === 0) {
    console.warn(`[notarize] ⚠️ 未找到 .dmg 产物(${join(BUNDLE_DIR, "dmg")})。先跑 desktop:build/package。`);
    process.exit(0);
  }

  let allOk = true;
  for (const art of artifacts) {
    console.log(`[notarize] ▶ 公证 ${art}(xcrun notarytool submit --wait)…`);
    const sub = spawnSync(
      "xcrun",
      notarytoolSubmitArgs(art, cfg),
      { stdio: "inherit" },
    );
    if (sub.status !== 0) {
      console.error(`[notarize] ✗ 公证失败: ${art}`);
      allOk = false;
      continue;
    }
    console.log(`[notarize] ▶ staple ${art}…`);
    const staple = spawnSync("xcrun", ["stapler", "staple", art], { stdio: "inherit" });
    if (staple.status !== 0) {
      console.error(`[notarize] ✗ staple 失败: ${art}`);
      allOk = false;
    }
  }

  const m = readManifest();
  m.notarize = {
    notarized: allOk,
    platform: "darwin",
    method: cfg.method,
    keychainProfile: cfg.keychainProfile ?? undefined,
    artifacts,
  };
  writeManifest(m);

  if (!allOk) process.exit(1);
  console.log("[notarize] ✅ 公证 + staple 完成。");
}

function isMain() {
  return process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}
if (isMain()) main();
