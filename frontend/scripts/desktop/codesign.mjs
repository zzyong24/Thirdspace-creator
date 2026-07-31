#!/usr/bin/env node
// [T-147 P6 / T-164] 代码签名占位 —— SPEC §3.3。
// 原则:**未配零副作用(且如实标 signed:false)、配了零改码**。拿到证书只填 env,不动脚本。
//
// mac:读 env APPLE_SIGNING_IDENTITY → codesign --deep --force --sign <identity> <app>。
// win:读 env WINDOWS_CERTIFICATE_THUMBPRINT(+ signtool)→ signtool sign。
// 未配 → skip 退 0 + 打印引导 + 在 release manifest 标 signed:false(防未签被下游误当已签)。

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

/** 判断该平台是否配了签名 env。返回 { configured, identity/thumbprint }。 */
export function codesignConfig(env = process.env, plat = platform) {
  if (plat === "darwin") {
    const identity = env.APPLE_SIGNING_IDENTITY;
    return { platform: "darwin", configured: Boolean(identity), identity: identity ?? null };
  }
  if (plat === "win32") {
    const thumb = env.WINDOWS_CERTIFICATE_THUMBPRINT;
    return { platform: "win32", configured: Boolean(thumb), thumbprint: thumb ?? null };
  }
  return { platform: plat, configured: false };
}

/** 找 .app(mac)/ .exe(win)产物路径(best-effort)。 */
function findArtifacts() {
  const out = [];
  if (platform === "darwin") {
    const macDir = join(BUNDLE_DIR, "macos");
    if (existsSync(macDir)) {
      for (const n of readdirSync(macDir)) if (n.endsWith(".app")) out.push(join(macDir, n));
    }
  } else if (platform === "win32") {
    // Tauri Windows 产物在 bundle/nsis 或 msi。
    for (const sub of ["nsis", "msi"]) {
      const d = join(BUNDLE_DIR, sub);
      if (existsSync(d)) for (const n of readdirSync(d)) if (/\.(exe|msi)$/.test(n)) out.push(join(d, n));
    }
  }
  return out;
}

function printSkipGuide(cfg) {
  console.log("[codesign] ⏭ 未配代码签名证书,跳过(退 0)。");
  if (cfg.platform === "darwin") {
    console.log("[codesign]   拿到 Apple Developer ID 证书后,零改码启用:");
    console.log('[codesign]     export APPLE_SIGNING_IDENTITY="Developer ID Application: <你的名字> (<TEAMID>)"');
  } else if (cfg.platform === "win32") {
    console.log("[codesign]   拿到 Authenticode 证书后:export WINDOWS_CERTIFICATE_THUMBPRINT=<thumbprint>");
  }
  console.log("[codesign]   已在 release manifest 标 signed:false(防未签被下游/自动更新链误当已签)。");
}

export function main() {
  const cfg = codesignConfig();

  if (!cfg.configured) {
    printSkipGuide(cfg);
    // 标 signed:false(gate ⑥)。
    const m = readManifest();
    m.codesign = { signed: false, platform: cfg.platform, reason: "env 未配签名证书" };
    writeManifest(m);
    process.exit(0);
  }

  const artifacts = findArtifacts();
  if (artifacts.length === 0) {
    console.warn(`[codesign] ⚠️ 未找到可签名产物(${BUNDLE_DIR} 下无 .app/.exe)。先跑 desktop:build/package。`);
    process.exit(0);
  }

  let allOk = true;
  for (const art of artifacts) {
    console.log(`[codesign] ▶ 签名 ${art}`);
    let r;
    if (cfg.platform === "darwin") {
      r = spawnSync("codesign", ["--deep", "--force", "--options", "runtime", "--sign", cfg.identity, art], {
        stdio: "inherit",
      });
    } else if (cfg.platform === "win32") {
      r = spawnSync("signtool", ["sign", "/sha1", cfg.thumbprint, "/fd", "sha256", "/tr", "http://timestamp.digicert.com", "/td", "sha256", art], {
        stdio: "inherit",
      });
    }
    if (r && r.status !== 0) {
      console.error(`[codesign] ✗ 签名失败: ${art}(exit ${r.status})`);
      allOk = false;
    }
  }

  const m = readManifest();
  m.codesign = {
    signed: allOk,
    platform: cfg.platform,
    identity: cfg.platform === "darwin" ? cfg.identity : cfg.thumbprint,
    artifacts,
  };
  writeManifest(m);

  if (!allOk) process.exit(1);
  console.log("[codesign] ✅ 代码签名完成。");
}

function isMain() {
  return process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}
if (isMain()) main();
