#!/usr/bin/env node
// [T-451] verdict-token 签名 Ed25519 密钥对生成 —— **一次性**跑,产出私钥（塞 CI secret）+ 公钥
// （塞 CI secret,构建期烘焙进 sidecar）。
//
// 用途:授权判定 verdict-bound handshake token 的密码学根:
//   · 私钥只签,不进包(明文不进 git、不进制品、不进用户机器磁盘的独立文件);
//   · 公钥进 sidecar 常量(经 rc4 + bytecode 保护),仅用于校验签名;
//   · 攻击者伪造 token 需私钥,拿不到就伪造不了 → 挡随包 node 裸启 sidecar 白嫖(SPEC §4.1)。
//
// SPEC: docs/superpowers/specs/2026-07-21-license-verdict-native-verdict-design.md
//
// 用法:
//   node scripts/desktop/verdict-keygen.mjs
//
// 产出(stdout,不落文件防私钥意外进 git):
//   两条 base64 字符串,复制到 GitHub Actions 仓库 secrets:
//     · CREATOROS_VERDICT_SIGNING_KEY_B64 —— 私钥 raw 32B url-safe base64(no padding)
//     · CREATOROS_VERDICT_PUBKEY_B64     —— 公钥 raw 32B 标准 base64
//
// 之后所有 CI 构建复用这一对 secret,**不要重跑本脚本**(重跑会让所有已发出的用户机 verdict-token
// 立即失效——除非你在做密钥轮换,那属于独立流程)。
//
// 兼容性:纯 Node.js 原生 crypto,无第三方依赖;要求 Node ≥ 20(Ed25519 支持稳定)。
// 密钥格式:Ed25519 seed = raw 32B;Node crypto 只暴露 JWK/PEM/DER,故用 JWK 取 `d` (私钥) + `x`
//   (公钥) 直接是 base64url raw 32B。这是社区标准姿势(RFC 8037)。

import { generateKeyPairSync } from "node:crypto";

const { publicKey, privateKey } = generateKeyPairSync("ed25519");

// JWK 是 Ed25519 raw key 唯一稳妥的 Node crypto 导出格式:
//   · publicKey.jwk.x = base64url(raw 32B 公钥)
//   · privateKey.jwk.d = base64url(raw 32B 私钥 seed)
// 与 Rust `ed25519-dalek` `SigningKey::from_bytes(&raw_arr)` 直接兼容。
const pubJwk = publicKey.export({ format: "jwk" });
const privJwk = privateKey.export({ format: "jwk" });

const priv_b64url = privJwk.d; // 已经是 url-safe base64 no padding(RFC 7515)
const pub_b64_raw = Buffer.from(pubJwk.x, "base64url"); // 反解成 raw 32B
const pub_b64 = pub_b64_raw.toString("base64"); // 再标准 base64 编码,给 sidecar 侧 Buffer.from(b64, "base64")

// 自校验:两把钥匙长度必须都是 32B raw。
if (Buffer.from(priv_b64url, "base64url").length !== 32) {
  console.error("✗ 私钥长度非 32B（Node crypto 产出异常）");
  process.exit(1);
}
if (pub_b64_raw.length !== 32) {
  console.error("✗ 公钥长度非 32B（Node crypto 产出异常）");
  process.exit(1);
}

console.log("=".repeat(72));
console.log("[T-451] verdict-token 签名密钥对已生成");
console.log("=".repeat(72));
console.log();
console.log("私钥（塞进 GitHub Actions 仓库 secrets → 名为 CREATOROS_VERDICT_SIGNING_KEY_B64）:");
console.log();
console.log(`CREATOROS_VERDICT_SIGNING_KEY_B64=${priv_b64url}`);
console.log();
console.log("公钥（塞进同一 secrets → 名为 CREATOROS_VERDICT_PUBKEY_B64）:");
console.log();
console.log(`CREATOROS_VERDICT_PUBKEY_B64=${pub_b64}`);
console.log();
console.log("=".repeat(72));
console.log("下一步:");
console.log("  1. GitHub 仓库 Settings → Secrets and variables → Actions → New repository secret");
console.log("     分别加上面两条,名字**逐字对齐** CREATOROS_VERDICT_SIGNING_KEY_B64 /");
console.log("     CREATOROS_VERDICT_PUBKEY_B64。");
console.log("  2. .github/workflows/desktop-release.yml 里在 cargo build 步骤前:");
console.log("     env:");
console.log("       CREATOROS_VERDICT_SIGNING_KEY_B64: ${{ secrets.CREATOROS_VERDICT_SIGNING_KEY_B64 }}");
console.log("       CREATOROS_VERDICT_PUBKEY_B64:      ${{ secrets.CREATOROS_VERDICT_PUBKEY_B64 }}");
console.log("  3. **本终端里的这两条字符串,复制完立刻清屏**（防旁人扫看私钥）。");
console.log("  4. 私钥别落任何文件、别发 IM、别贴群。丢了 = 所有用户机 verdict-token 一并作废。");
console.log("=".repeat(72));
