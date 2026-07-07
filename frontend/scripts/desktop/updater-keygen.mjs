#!/usr/bin/env node
// [T-147 P6 / T-164] updater 签名 keypair 生成 —— minisign/Ed25519(不需 Apple 证书)。
// SPEC §3.2。参考 skills-manager 的 `plugins.updater.pubkey` + GitHub endpoints 姿态。
//
// 生成一对 minisign keypair(用 `tauri signer generate`):
//   - 私钥:输出到文件(默认 ~/.creatoros/updater.key,0600),并打印「进 env / keychain」引导。
//            **绝不入 git**(脚本不写进 repo,只提示 export TAURI_SIGNING_PRIVATE_KEY)。
//   - 公钥:打印;`--write-conf` 时写进 src-tauri/tauri.conf.json 的 plugins.updater.pubkey。
//
// 用法:
//   node scripts/desktop/updater-keygen.mjs                 # 生成到默认路径,打印公钥
//   node scripts/desktop/updater-keygen.mjs --write-conf    # 顺带写公钥进 tauri.conf.json
//   node scripts/desktop/updater-keygen.mjs --out <path> -p <password>

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync, chmodSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

const FRONTEND = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const TAURI_CLI = join(FRONTEND, "node_modules", "@tauri-apps", "cli", "tauri.js");
const TAURI_CONF = join(FRONTEND, "src-tauri", "tauri.conf.json");

function parseArgs(argv) {
  const args = { writeConf: false, out: join(homedir(), ".creatoros", "updater.key"), password: "" };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--write-conf") args.writeConf = true;
    else if (a === "--out") args.out = argv[++i];
    else if (a === "-p" || a === "--password") args.password = argv[++i];
  }
  return args;
}

/**
 * 抽公钥(minisign base64,以 dW50cnVzdGVk = "untrusted comment" 开头)。
 * `tauri signer generate -w <path>` 把公钥写到 <path>.pub 文件、stdout 只打路径 —— 优先读文件;
 * stdout 兜底(旧版/无 -w 时直接打 base64)。
 * @param {string} stdout tauri signer 输出
 * @param {string} [pubFile] <out>.pub 路径(存在则优先读)
 */
export function extractPubkey(stdout, pubFile) {
  if (pubFile && existsSync(pubFile)) {
    const content = readFileSync(pubFile, "utf8").trim();
    const m = content.match(/dW50cnVzdGVk[A-Za-z0-9+/=\r\n]+/);
    if (m) return m[0].replace(/\s+/g, "");
  }
  const m = (stdout ?? "").match(/dW50cnVzdGVk[A-Za-z0-9+/=\r\n]+/);
  return m ? m[0].replace(/\s+/g, "") : null;
}

function main() {
  const args = parseArgs(process.argv);

  if (!existsSync(TAURI_CLI)) {
    console.error("[updater-keygen] 未找到 @tauri-apps/cli(pnpm install 后重试)。");
    process.exit(1);
  }

  mkdirSync(dirname(args.out), { recursive: true });

  console.log("[updater-keygen] ▶ 生成 minisign/Ed25519 updater keypair(tauri signer generate)…");
  const cliArgs = ["signer", "generate", "--ci", "-w", args.out, "-f"];
  if (args.password) cliArgs.push("-p", args.password);
  const r = spawnSync(process.execPath, [TAURI_CLI, ...cliArgs], { encoding: "utf8" });

  if (r.status !== 0) {
    console.error("[updater-keygen] ✗ tauri signer generate 失败:");
    console.error(r.stdout ?? "");
    console.error(r.stderr ?? "");
    process.exit(r.status ?? 1);
  }

  // 私钥落文件(tauri -w 已写);收紧权限。
  if (existsSync(args.out)) chmodSync(args.out, 0o600);

  // 公钥在 <out>.pub 文件(tauri signer -w 的产物);优先读它,stdout 兜底。
  const pubkey = extractPubkey(r.stdout ?? "", `${args.out}.pub`);
  if (!pubkey) {
    console.error("[updater-keygen] ⚠️ 未能从输出解析公钥;原始输出:");
    console.error(r.stdout);
    process.exit(1);
  }

  console.log(`\n[updater-keygen] ✅ 私钥已写: ${args.out}(权限 0600)`);
  console.log("[updater-keygen] 🔑 公钥(base64):");
  console.log(pubkey);
  console.log("\n[updater-keygen] ⚠️ 分发前请:");
  console.log("  1) 私钥进 env / OS keychain,绝不入 git:");
  console.log(`       export TAURI_SIGNING_PRIVATE_KEY="$(cat ${args.out})"`);
  console.log("       (若设了密码)export TAURI_SIGNING_PRIVATE_KEY_PASSWORD=<password>");
  console.log("  2) 公钥进 tauri.conf.json 的 plugins.updater.pubkey(可 --write-conf 自动写)。");

  if (args.writeConf) {
    writePubkeyToConf(pubkey);
  }
}

/** 把公钥写进 tauri.conf.json 的 plugins.updater.pubkey(保持 JSON 合法)。 */
export function writePubkeyToConf(pubkey, confPath = TAURI_CONF) {
  const conf = JSON.parse(readFileSync(confPath, "utf8"));
  conf.plugins = conf.plugins ?? {};
  conf.plugins.updater = conf.plugins.updater ?? {};
  conf.plugins.updater.pubkey = pubkey;
  writeFileSync(confPath, JSON.stringify(conf, null, 2) + "\n", "utf8");
  console.log(`[updater-keygen] ✅ 已写公钥进 ${confPath}(plugins.updater.pubkey)。`);
}

function isMain() {
  return process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}
if (isMain()) main();
