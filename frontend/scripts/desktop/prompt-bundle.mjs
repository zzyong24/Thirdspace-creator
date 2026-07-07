#!/usr/bin/env node
// [T-166 / T-147 P3] Prompt 远程更新包 —— 产品方 op 工具:生成 Ed25519 keypair + 签名 bundle。
//
// D1 降级后 P3 = 纯远程可更新性(产品方不发新版即迭代 prompt),非防泄漏。本脚本是**产品方侧**
// 的打包签名工具(客户端拉取+验签侧在 backend/ai-runtime/remote-prompt-bundle.ts)。
//
// 用 node:crypto 原生 Ed25519(裸 detached 签名,base64),非复用 minisign 格式(避 .sig 解析,
// SPEC §3.1 允许「裸 Ed25519 简化」)。私钥产品方保管(绝不入 git/客户端);公钥内置进客户端配置
// (env PROMPT_BUNDLE_PUBLIC_KEY)。托管:把 bundle.json + bundle.json.sig 传到你选的 endpoint
// (R2/CDN/activation-manager/GitHub release),客户端配 PROMPT_BUNDLE_URL 指向 bundle.json。
//
// 用法:
//   node scripts/desktop/prompt-bundle.mjs keygen                 # 生成 keypair(私钥+公钥 PEM)
//   node scripts/desktop/prompt-bundle.mjs sign <bundle.json>     # 用 PROMPT_BUNDLE_PRIVATE_KEY 签
//     环境:PROMPT_BUNDLE_PRIVATE_KEY = 私钥 PEM(或 --key <file> 指私钥文件)
//
// bundle.json 形状(与 skill_config_overrides 同字段,产品方本地维护):
//   { "version": "1.2", "signedAt": "<ISO>", "overrides": [ { "id": "chatbox.topic",
//     "system": "...", "template": "...", "tools": ["..."], "requiredFacets": ["..."],
//     "outputSchema": {...} }, ... ] }

import {
  generateKeyPairSync,
  sign,
  createPrivateKey,
} from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const [cmd, arg] = process.argv.slice(2);

function keygen() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const pub = publicKey.export({ type: "spki", format: "pem" });
  const priv = privateKey.export({ type: "pkcs8", format: "pem" });
  console.log(
    "[prompt-bundle] 已生成 Ed25519 keypair。\n\n" +
      "① 私钥(**产品方保管,绝不入 git / 绝不进客户端**;签 bundle 时经 PROMPT_BUNDLE_PRIVATE_KEY 或 --key):\n" +
      `${priv}\n` +
      "② 公钥(内置进客户端配置 —— 设 env PROMPT_BUNDLE_PUBLIC_KEY 为下面整段 PEM):\n" +
      `${pub}`,
  );
}

function resolvePrivateKey() {
  const keyIdx = process.argv.indexOf("--key");
  if (keyIdx >= 0 && process.argv[keyIdx + 1]) {
    return readFileSync(process.argv[keyIdx + 1], "utf8");
  }
  const env = process.env.PROMPT_BUNDLE_PRIVATE_KEY;
  if (env && env.trim()) return env;
  console.error(
    "[prompt-bundle] ✗ 缺私钥。设 PROMPT_BUNDLE_PRIVATE_KEY(PEM)或传 --key <私钥文件>。" +
      "没有就先跑 `prompt-bundle keygen` 生成。",
  );
  process.exit(2);
}

function signBundle(bundlePath) {
  if (!bundlePath) {
    console.error("[prompt-bundle] ✗ 用法:sign <bundle.json>");
    process.exit(2);
  }
  const bytes = readFileSync(bundlePath); // 签**原始字节**(客户端也对原始字节验签)。
  // 校验 bundle 至少是合法 JSON + 有 overrides 数组(诚实:不签坏包)。
  try {
    const parsed = JSON.parse(bytes.toString("utf8"));
    if (!Array.isArray(parsed.overrides)) {
      throw new Error("bundle 缺 overrides 数组");
    }
  } catch (err) {
    console.error(
      `[prompt-bundle] ✗ ${bundlePath} 不是合法 prompt bundle: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    process.exit(1);
  }
  const priv = createPrivateKey(resolvePrivateKey());
  const sig = sign(null, bytes, priv).toString("base64");
  const sigPath = `${bundlePath}.sig`;
  writeFileSync(sigPath, sig);
  console.log(
    `[prompt-bundle] ✅ 已签:${sigPath}\n` +
      "下一步(你的 op):把 bundle.json + .sig 传到你的 endpoint(R2/CDN/activation-manager/\n" +
      "GitHub release);客户端配 PROMPT_BUNDLE_URL 指向 bundle.json、PROMPT_BUNDLE_PUBLIC_KEY 填公钥。\n" +
      "客户端启动拉取→验签→套用(skill 粒度锁:用户本地手改过的 skill,远程不碰)。",
  );
}

switch (cmd) {
  case "keygen":
    keygen();
    break;
  case "sign":
    signBundle(arg);
    break;
  default:
    console.error(
      "[prompt-bundle] 用法:\n" +
        "  keygen              生成 Ed25519 keypair\n" +
        "  sign <bundle.json>  用私钥签(PROMPT_BUNDLE_PRIVATE_KEY 或 --key <file>)",
    );
    process.exit(2);
}
