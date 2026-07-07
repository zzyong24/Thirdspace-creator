#!/usr/bin/env node
// T-147 P2 本地加密 —— master key 初始化 / 轮换 / 查看脚本。
//
// master key(32 字节,AES-256-GCM 主密钥)的**两条来源**:
//   桌面端:Tauri Rust 侧 keyring crate 自动取/建(存 OS keychain),经 env
//           CREATOROS_MASTER_KEY 注入 sidecar —— **无需本脚本**(壳启动即自动)。
//   web/服务器部署:没有 Tauri 壳 → 由运维**显式**把 32B base64 key 配进 env
//           CREATOROS_MASTER_KEY。本脚本就是给这条路用的:生成 / 查看 / 轮换该 key。
//
// 用法:
//   node scripts/desktop/master-key.mjs generate     # 生成一个新随机 32B base64 key(打印,不落盘)
//   node scripts/desktop/master-key.mjs show          # 查看当前 env 里的 key 是否合法(不打印明文)
//   node scripts/desktop/master-key.mjs keychain-set  # (仅 macOS)把新 key 写进 login keychain
//   node scripts/desktop/master-key.mjs keychain-get  # (仅 macOS)从 login keychain 读出并打印 export 行
//
// ⚠️ 轮换须知:换 master key 后,**用旧 key 加密的存量 secret 解不开**。轮换正确姿势 =
//    ①先用旧 key 把 secret 解密回明文(或先跑迁移前导出)②换 key ③用新 key 重新加密
//    (跑 migrate-model-secrets 前先把库里密文用旧 key 解回明文)。简单场景:轮换后让用户
//    在设置页重填一次 key 即可(putModel 会用新 master key 重新加密)。

import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";

const KEYCHAIN_SERVICE = "com.creatoros.desktop";
const KEYCHAIN_ACCOUNT = "master-key";
const ENV_NAME = "CREATOROS_MASTER_KEY";

const cmd = process.argv[2];

function genKeyB64() {
  return randomBytes(32).toString("base64");
}

function isValidB64Key(v) {
  if (!v) return false;
  try {
    return Buffer.from(v.trim(), "base64").length === 32;
  } catch {
    return false;
  }
}

function generate() {
  const key = genKeyB64();
  console.log("# 新 master key(32B base64)。配进部署环境 env(勿提交进仓库):");
  console.log(`export ${ENV_NAME}='${key}'`);
  console.log(
    "\n# 桌面端不用手配:Tauri Rust keyring 自动管理(见 src-tauri/src/lib.rs)。",
  );
}

function show() {
  const v = process.env[ENV_NAME];
  if (!v) {
    console.log(`${ENV_NAME} 未设置 → sidecar/web 会走开发降级 key(弱安全,不崩)。`);
    return;
  }
  console.log(
    isValidB64Key(v)
      ? `${ENV_NAME} 合法(base64 32B)✓ —— 加密走 keychain/env key(强)。`
      : `${ENV_NAME} 非法(非 base64 32B)✗ —— 会被忽略并降级 dev key。`,
  );
}

function keychainSet() {
  if (process.platform !== "darwin") {
    console.error("keychain-set 仅 macOS 支持(Windows/Linux 由 Tauri keyring 自动管理)。");
    process.exit(1);
  }
  const key = genKeyB64();
  // 先删旧条目(存在才删,忽略 not found),再加。-U 更新已存在。
  try {
    execFileSync("security", [
      "delete-generic-password",
      "-s",
      KEYCHAIN_SERVICE,
      "-a",
      KEYCHAIN_ACCOUNT,
    ]);
  } catch {
    // 无旧条目 → 忽略。
  }
  execFileSync("security", [
    "add-generic-password",
    "-s",
    KEYCHAIN_SERVICE,
    "-a",
    KEYCHAIN_ACCOUNT,
    "-w",
    key,
  ]);
  console.log(
    `✓ 新 master key 已写入 login keychain(service=${KEYCHAIN_SERVICE}, account=${KEYCHAIN_ACCOUNT})。`,
  );
  console.log(
    "  桌面壳与本脚本 keychain-get 读的是同一条目(与 Rust keyring 同 service/account)。",
  );
}

function keychainGet() {
  if (process.platform !== "darwin") {
    console.error("keychain-get 仅 macOS 支持。");
    process.exit(1);
  }
  try {
    const key = execFileSync("security", [
      "find-generic-password",
      "-s",
      KEYCHAIN_SERVICE,
      "-a",
      KEYCHAIN_ACCOUNT,
      "-w",
    ])
      .toString()
      .trim();
    if (!isValidB64Key(key)) {
      console.error("keychain 里的 key 非法(非 base64 32B)。");
      process.exit(1);
    }
    console.log(`export ${ENV_NAME}='${key}'`);
  } catch {
    console.error(
      `keychain 无条目(service=${KEYCHAIN_SERVICE})。先跑 keychain-set,或让桌面壳首启自动建。`,
    );
    process.exit(1);
  }
}

switch (cmd) {
  case "generate":
    generate();
    break;
  case "show":
    show();
    break;
  case "keychain-set":
    keychainSet();
    break;
  case "keychain-get":
    keychainGet();
    break;
  default:
    console.log(
      "用法: master-key.mjs <generate|show|keychain-set|keychain-get>\n" +
        "  generate      生成新 32B base64 key(打印 export 行,不落盘)\n" +
        "  show          检查当前 env CREATOROS_MASTER_KEY 是否合法\n" +
        "  keychain-set  (macOS)把新 key 写进 login keychain\n" +
        "  keychain-get  (macOS)从 login keychain 读出打印 export 行",
    );
    process.exit(cmd ? 1 : 0);
}
