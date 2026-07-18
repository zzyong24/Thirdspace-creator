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
// endpoint(url 前缀)必须经 env CREATOROS_UPDATE_BASE_URL 提供(https,无 OWNER/REPO 占位残留);
// 缺失/非法 → 硬失败(T-326 ENG-H03)。本地开发预览可 CREATOROS_UPDATE_ALLOW_PLACEHOLDER=1 显式放行占位。

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

// ── [T-372 W-core §11.2-5] 双端 latest.json 合并(纯函数,便于单测)──────────────
//
// 旧行为:latest.json 每次整写单平台 platforms 键 → 双端分发时后打的平台**覆盖**先打的
// (mac 包发完再打 Win 包,latest.json 只剩 windows-x86_64,mac 客户端升级 404)。
// 新行为:同版本 → platforms 键合并(darwin-aarch64 + windows-x86_64 …并存);
// 版本不同 → 新版本整体替换(旧版本的 platforms 不该混进新版本元数据)。
// 双端产物在各自平台打包后,把 bundle 目录的 latest.json 汇到同一 endpoint 前跑本合并
// (W-ci 的 matrix 汇合步骤用;本机单平台打包行为不变——没有已存在文件时 merge 即恒等)。
//
// @param {{version:string, platforms:Record<string,{signature:string,url:string}>}|null} existing
// @param {{version:string, platforms:Record<string,{signature:string,url:string}>}} next
export function mergeLatestJson(existing, next) {
  if (!existing || typeof existing !== "object" || existing.version !== next.version) {
    return next;
  }
  return {
    ...next,
    platforms: { ...(existing.platforms ?? {}), ...next.platforms },
  };
}

// ── [T-326 ENG-H03] updater base URL 解析 + 校验(纯函数,便于单测)─────────────
//
// 旧行为:未设 CREATOROS_UPDATE_BASE_URL 时默认 `https://github.com/OWNER/REPO/...`,
// 只 warning 不失败 → 签名更新包配着不可下载的正式元数据出厂,客户端升级必失败。
// 新行为:
//   1. 未设 env → **硬失败**(exit 非 0),除非显式 opt-out CREATOROS_UPDATE_ALLOW_PLACEHOLDER=1
//      (本地开发预览专用,占位 URL + 显眼警告)。
//   2. 设了 env → 必须是合法 https URL,且路径不得残留 OWNER/REPO 字面占位段。
//      opt-out 变量**不放行**显式设置的非法值 —— 它只覆盖「本地没配 URL」这一种场景。
//
// @param {NodeJS.ProcessEnv} env
// @param {string} version
// @returns {{ok:true, baseUrl:string, placeholder:boolean} | {ok:false, error:string}}
export function resolveUpdateBaseUrl(env, version) {
  const raw = (env.CREATOROS_UPDATE_BASE_URL ?? "").trim();
  const allowPlaceholder = env.CREATOROS_UPDATE_ALLOW_PLACEHOLDER === "1";

  if (!raw) {
    if (allowPlaceholder) {
      return {
        ok: true,
        baseUrl: `https://github.com/OWNER/REPO/releases/download/v${version}`,
        placeholder: true,
      };
    }
    return {
      ok: false,
      error:
        "未设 CREATOROS_UPDATE_BASE_URL —— 拒绝产出带占位下载地址的 latest.json(客户端升级必失败)。\n" +
        "  正式发布:export CREATOROS_UPDATE_BASE_URL=<真实下载前缀,如 https://github.com/<owner>/<repo>/releases/download/v" +
        version +
        ">\n" +
        "  本地开发预览(明知 URL 不可下载):export CREATOROS_UPDATE_ALLOW_PLACEHOLDER=1",
    };
  }

  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return { ok: false, error: `CREATOROS_UPDATE_BASE_URL 不是合法 URL:${raw}` };
  }
  if (parsed.protocol !== "https:") {
    return {
      ok: false,
      error: `CREATOROS_UPDATE_BASE_URL 必须是 https(updater 元数据走明文/其它协议不接受):${raw}`,
    };
  }
  // 路径段级检查:字面 OWNER / REPO 段视为模板残留(真实 owner/repo 不会全大写恰为这两个词)。
  const segments = parsed.pathname.split("/");
  if (segments.includes("OWNER") || segments.includes("REPO")) {
    return {
      ok: false,
      error: `CREATOROS_UPDATE_BASE_URL 残留 OWNER/REPO 占位段,请替换为真实 owner/repo:${raw}`,
    };
  }
  return { ok: true, baseUrl: raw.replace(/\/+$/, ""), placeholder: false };
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

  // [T-326 ENG-H03] base URL 缺失/占位/非法 → 开工前就硬失败(别等一轮打包跑完才报)。
  const resolved = resolveUpdateBaseUrl(process.env, version);
  if (!resolved.ok) {
    console.error(`[release] ✗ ${resolved.error}`);
    process.exit(1);
  }

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
  const url = `${resolved.baseUrl}/${artifactName}`;

  // 3) 生成/更新 latest.json。[T-372 §11.2-5] 同版本已有文件(另一平台先打)→ platforms 合并,
  //    不再整写覆盖;无已存在文件/版本变了 → 行为与旧实现一致。
  const latestPath = join(BUNDLE_DIR, "latest.json");
  let existing = null;
  if (existsSync(latestPath)) {
    try {
      existing = JSON.parse(readFileSync(latestPath, "utf8"));
    } catch {
      console.warn(`[release] ⚠ 已存在的 latest.json 解析失败,按全新生成处理:${latestPath}`);
    }
  }
  const latest = mergeLatestJson(existing, buildLatestJson({ version, signature, url, target }));
  writeFileSync(latestPath, JSON.stringify(latest, null, 2) + "\n", "utf8");
  console.log(`\n[release] ✅ latest.json 已生成: ${latestPath}`);
  console.log(`[release]   version=${version} · target=${target}`);
  console.log(`[release]   url=${url}`);
  if (resolved.placeholder) {
    // 只有显式 CREATOROS_UPDATE_ALLOW_PLACEHOLDER=1 才会走到这里 —— 刷屏级警告,防止误分发。
    console.warn("[release] ⚠️⚠️⚠️ 本次 latest.json 的 url 是占位 OWNER/REPO(CREATOROS_UPDATE_ALLOW_PLACEHOLDER=1)。");
    console.warn("[release] ⚠️⚠️⚠️ 仅限本地开发预览 —— **严禁分发**;正式发布必须设 CREATOROS_UPDATE_BASE_URL。");
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
