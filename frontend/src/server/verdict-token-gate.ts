// [T-451] verdict-token 校验(Node runtime 独占)—— **只被 instrumentation.ts 在 nodejs
// runtime 下 dynamic import**,让 Next 编译 edge runtime chunks 时天然跳过整个文件,不再撞
// 「Edge Runtime 禁 eval/node:crypto」编译错。
//
// 逻辑与 SPEC §4.4 一致:签名 + 过期 + 端口 + machineId 任一不通过 → process.exit(1)。
// 通过 → 写 CREATOROS_VERDICT_MODE 全局 flag(proxy.ts + activation-gate 用)。

import { createPublicKey, verify as cryptoVerify } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

interface VerdictPayload {
  v: number;
  mode: "licensed" | "activation_only";
  machineId: string;
  sidecarPort: number;
  expiresAt: string;
  issuedAt: string;
  nonce: string;
  licenseMode?: string;
}

export function verifyVerdictTokenOrExit(): void {
  const isDev =
    process.env.NODE_ENV !== "production" && process.env.CREATOROS_DEV_MODE === "1";
  if (isDev) {
    // dev 分支豁免:pnpm dev 场景无 Rust 壳、无 token。此路径打包版永不进入(NODE_ENV=production)。
    return;
  }
  const token = process.env.CREATOROS_SIDECAR_VERDICT_TOKEN;
  if (!token) {
    console.error(
      "[T-451] verdict-token 缺失(未由 CreatorOS Rust 壳启动) → 拒绝 spawn。",
    );
    process.exit(1);
  }
  const [payloadB64, sigB64] = token.split(".");
  if (!payloadB64 || !sigB64) {
    console.error("[T-451] verdict-token 格式非法 → 拒绝 spawn。");
    process.exit(1);
  }
  let payloadJson: string;
  try {
    payloadJson = Buffer.from(payloadB64, "base64url").toString("utf-8");
  } catch {
    console.error("[T-451] verdict-token payload 解码失败 → 拒绝 spawn。");
    process.exit(1);
    return;
  }
  let payload: VerdictPayload;
  try {
    payload = JSON.parse(payloadJson) as VerdictPayload;
  } catch {
    console.error("[T-451] verdict-token payload JSON 解析失败 → 拒绝 spawn。");
    process.exit(1);
    return;
  }
  // 有效期检查(墙钟;token TTL 24h,足够单次进程寿命)。
  const now = Date.now();
  const exp = Date.parse(payload.expiresAt);
  if (!Number.isFinite(exp) || now > exp) {
    console.error(
      `[T-451] verdict-token 已过期(expiresAt=${payload.expiresAt}) → 拒绝 spawn。`,
    );
    process.exit(1);
  }
  // 端口匹配:token 绑定本次 sidecar 端口,防跨端口复用。
  const port = Number(process.env.PORT ?? "0");
  if (port !== payload.sidecarPort) {
    console.error(
      `[T-451] verdict-token 端口不匹配(token=${payload.sidecarPort} vs env PORT=${port}) → 拒绝 spawn。`,
    );
    process.exit(1);
  }
  // Ed25519 签名验证:公钥在 build-sidecar 期间烘焙进 sidecar 常量(见 verdict-verify-key.json)。
  //   打包版 process.cwd() = …/sidecar/frontend,故相对 .next/server/verdict-verify-key.json。
  //   dev 分支上面已经 return,不进这里。
  const pubKeyFile = join(
    process.cwd(),
    ".next",
    "server",
    "verdict-verify-key.json",
  );
  let pubKeyB64 = "";
  try {
    const raw = readFileSync(pubKeyFile, "utf-8");
    const parsed = JSON.parse(raw) as { publicKeyB64?: string };
    pubKeyB64 = String(parsed.publicKeyB64 ?? "").trim();
  } catch {
    console.error(
      `[T-451] verdict-token 公钥文件不可读(${pubKeyFile}) → 拒绝 spawn。`,
    );
    process.exit(1);
  }
  if (!pubKeyB64) {
    console.error("[T-451] verdict-token 公钥为空(打包配置错) → 拒绝 spawn。");
    process.exit(1);
  }
  const pubKeyDer = Buffer.from(pubKeyB64, "base64");
  // Node 的 crypto 需要 SPKI DER 格式的 Ed25519 公钥,而 build-sidecar 烘焙的是 raw 32B。
  //   包装:SPKI header (12B) + raw 32B = 44B。这是 X.509 spec 的固定 header for Ed25519 OID。
  const spkiHeader = Buffer.from([
    0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x03, 0x21, 0x00,
  ]);
  const spkiKey = pubKeyDer.length === 32 ? Buffer.concat([spkiHeader, pubKeyDer]) : pubKeyDer;
  let pubKey: ReturnType<typeof createPublicKey>;
  try {
    pubKey = createPublicKey({
      key: spkiKey,
      format: "der",
      type: "spki",
    });
  } catch (e) {
    console.error(
      `[T-451] verdict-token 公钥加载失败(${e instanceof Error ? e.message : String(e)}) → 拒绝 spawn。`,
    );
    process.exit(1);
    return;
  }
  const sig = Buffer.from(sigB64, "base64url");
  const ok = cryptoVerify(null, Buffer.from(payloadJson, "utf-8"), pubKey, sig);
  if (!ok) {
    console.error("[T-451] verdict-token 签名验证失败 → 拒绝 spawn。");
    process.exit(1);
  }
  // 通过:挂 CREATOROS_VERDICT_MODE 全局 flag,activation-gate + proxy.ts 据此判放行/allowlist。
  process.env.CREATOROS_VERDICT_MODE =
    payload.mode === "licensed" ? "licensed" : "activation-only";
  console.log(
    `[T-451] verdict-token 通过 mode=${process.env.CREATOROS_VERDICT_MODE} machineId=${payload.machineId.slice(0, 8)}... expires=${payload.expiresAt}`,
  );
}
