#!/usr/bin/env node
// [T-147 P6 / T-164] 发布流水线 —— SPEC §3.2/§3.4。
//   desktop:package(build-sidecar → obfuscate → tauri build → codesign → notarize)
//   + updater 签名(tauri build 用 TAURI_SIGNING_PRIVATE_KEY 自动签,产 .sig)
//   + 生成/更新 latest.json(version + 签名 + url)。
//
// **私钥缺失 fail-fast**:不产未签更新包(SPEC §3.2 验收)。
//
// latest.json 结构(与 Tauri updater plugin + skills-manager 一致):
//   { version, notes, pub_date, platforms: { "<updater-target>": { signature, url } } }
//
// endpoint(url 前缀)默认 GitHub-releases 式,可经 env CREATOROS_UPDATE_BASE_URL 覆盖(P5 定 R2/CDN)。

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { platform, arch } from "node:process";
import { readManifest, writeManifest } from "./release-manifest.mjs";

const FRONTEND = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SRC_TAURI = join(FRONTEND, "src-tauri");
const BUNDLE_DIR = join(SRC_TAURI, "target", "release", "bundle");
const TAURI_CONF = join(SRC_TAURI, "tauri.conf.json");

// Tauri updater target key(与 latest.json platforms 键一致)。
function updaterTarget() {
  const map = {
    "darwin-arm64": "darwin-aarch64",
    "darwin-x64": "darwin-x86_64",
    "win32-x64": "windows-x86_64",
    "linux-x64": "linux-x86_64",
  };
  return map[`${platform}-${arch}`] ?? `${platform}-${arch}`;
}

function readVersion() {
  const conf = JSON.parse(readFileSync(TAURI_CONF, "utf8"));
  return conf.version ?? "0.0.0";
}

/**
 * 在 bundle 目录找 updater 产物(.app.tar.gz / .msi.zip / .nsis.zip)及其 .sig。
 * createUpdaterArtifacts:true 时 Tauri 产这些 + 对应 .sig。
 * @returns {{artifact:string, sig:string}|null}
 */
export function findUpdaterArtifact(bundleDir = BUNDLE_DIR) {
  if (!existsSync(bundleDir)) return null;
  const results = [];
  const walk = (dir) => {
    for (const n of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, n.name);
      if (n.isDirectory()) walk(p);
      else if (/\.(app\.tar\.gz|msi\.zip|nsis\.zip)$/.test(n.name)) results.push(p);
    }
  };
  walk(bundleDir);
  for (const art of results) {
    const sig = `${art}.sig`;
    if (existsSync(sig)) return { artifact: art, sig };
  }
  return null;
}

/** 构造 latest.json 内容(纯函数,便于测)。 */
export function buildLatestJson({ version, signature, url, notes = "", pubDate = new Date().toISOString(), target }) {
  return {
    version,
    notes,
    pub_date: pubDate,
    platforms: {
      [target]: { signature, url },
    },
  };
}

function run(name, cmd, args, env = {}) {
  console.log(`\n[release] ▶ ${name}\n[release]   $ ${cmd} ${args.join(" ")}`);
  const r = spawnSync(cmd, args, { stdio: "inherit", cwd: FRONTEND, env: { ...process.env, ...env } });
  if (r.status !== 0) {
    console.error(`[release] ✗ 失败:${name}(exit ${r.status})`);
    process.exit(r.status ?? 1);
  }
}

function main() {
  // 私钥缺失 fail-fast(不产未签更新包)。
  if (!process.env.TAURI_SIGNING_PRIVATE_KEY) {
    console.error("[release] ✗ 未设 TAURI_SIGNING_PRIVATE_KEY —— 不产未签更新包(SPEC §3.2)。");
    console.error("[release]   先跑 pnpm desktop:updater-keygen 生成 keypair,再:");
    console.error('[release]     export TAURI_SIGNING_PRIVATE_KEY="$(cat ~/.creatoros/updater.key)"');
    console.error("[release]   (若设了密码)export TAURI_SIGNING_PRIVATE_KEY_PASSWORD=<password>");
    process.exit(1);
  }

  const version = readVersion();
  const target = updaterTarget();
  console.log(`[release] CreatorOS 发布打包开始(version=${version}, target=${target})。`);

  // 1) 走 package 流水线(build-sidecar → obfuscate → tauri build → codesign → notarize)。
  //    tauri build 期检测到 TAURI_SIGNING_PRIVATE_KEY + createUpdaterArtifacts → 自动签 + 产 .sig。
  run("package 流水线(含 updater 签名)", process.execPath, [join("scripts", "desktop", "package.mjs")]);

  // 2) 定位 updater 产物 + .sig。
  const found = findUpdaterArtifact();
  if (!found) {
    console.error("[release] ✗ 未找到 updater 产物(.app.tar.gz/.msi.zip/.nsis.zip)+ 对应 .sig。");
    console.error("[release]   确认 tauri.conf.json bundle.createUpdaterArtifacts:true 且签名 env 生效。");
    process.exit(1);
  }
  const signature = readFileSync(found.sig, "utf8").trim();
  const artifactName = found.artifact.split("/").pop();
  const baseUrl =
    process.env.CREATOROS_UPDATE_BASE_URL ??
    `https://github.com/OWNER/REPO/releases/download/v${version}`;
  const url = `${baseUrl.replace(/\/$/, "")}/${artifactName}`;

  // 3) 生成/更新 latest.json。
  const latest = buildLatestJson({ version, signature, url, target });
  const latestPath = join(BUNDLE_DIR, "latest.json");
  writeFileSync(latestPath, JSON.stringify(latest, null, 2) + "\n", "utf8");
  console.log(`\n[release] ✅ latest.json 已生成: ${latestPath}`);
  console.log(`[release]   version=${version} · target=${target}`);
  console.log(`[release]   url=${url}`);
  if (baseUrl.includes("OWNER/REPO")) {
    console.log("[release]   ⚠️ url 用了占位 OWNER/REPO;分发前 export CREATOROS_UPDATE_BASE_URL=<真实前缀>。");
  }

  // 4) release manifest 记 updater 状态。
  const m = readManifest();
  m.updater = { signed: true, version, target, artifact: artifactName, latestJson: latestPath };
  m.version = version;
  writeManifest(m);

  console.log("\n[release] ✅ 发布产物 + latest.json 就绪(签名已由 tauri build 完成)。");
  console.log("[release]   分发:把产物 + latest.json + .sig 传到 endpoint(GitHub releases / R2 / CDN)。");
}

function isMain() {
  return process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}
if (isMain()) main();
