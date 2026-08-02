import {
  createPrivateKey,
  createPublicKey,
  randomBytes,
  sign as cryptoSign,
  timingSafeEqual,
} from "node:crypto";

const ED25519_PKCS8_SEED_PREFIX = Buffer.from(
  "302e020100300506032b657004220420",
  "hex",
);

function fail(code, error) {
  return { ok: false, code, error };
}

function decodeCanonicalBase64(value, { urlSafe }) {
  const rawInput = String(value ?? "");
  if (rawInput !== rawInput.trim()) return null;
  const input = rawInput;
  if (!input) return null;

  if (urlSafe) {
    if (!/^[A-Za-z0-9_-]+$/.test(input)) return null;
    const raw = Buffer.from(input, "base64url");
    return raw.toString("base64url") === input ? raw : null;
  }

  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(input) || input.length % 4 !== 0) {
    return null;
  }
  const raw = Buffer.from(input, "base64");
  return raw.toString("base64") === input ? raw : null;
}

/**
 * 校验 sidecar 构建/缓存复用所需的验签公钥。
 * 该阶段不签发 verdict，不应接触签名私钥。
 */
export function validateVerdictPublicKey(env = process.env) {
  const publicText = String(env.CREATOROS_VERDICT_PUBKEY_B64 ?? "").trim();
  if (!publicText) {
    return fail(
      "missing-public-key",
      "缺少 CREATOROS_VERDICT_PUBKEY_B64，拒绝生成安装后必白屏的桌面包。",
    );
  }

  const configuredPublic = decodeCanonicalBase64(publicText, { urlSafe: false });
  if (!configuredPublic || configuredPublic.length !== 32) {
    return fail(
      "invalid-public-key",
      "CREATOROS_VERDICT_PUBKEY_B64 必须是规范的 32B Ed25519 公钥（标准 base64）。",
    );
  }

  return { ok: true, publicKeyB64: configuredPublic.toString("base64") };
}

export function assertVerdictPublicKey(env = process.env) {
  const result = validateVerdictPublicKey(env);
  if (!result.ok) {
    const error = new Error(`[T-535] ${result.error}`);
    error.code = result.code;
    throw error;
  }
  return result;
}

/**
 * 校验桌面壳签名私钥与 sidecar 验签公钥。
 * 只返回状态和规范化公钥，不打印、不落盘、也不在错误里回显任何密钥材料。
 */
export function validateVerdictKeyMaterial(env = process.env) {
  const signingText = String(env.CREATOROS_VERDICT_SIGNING_KEY_B64 ?? "");
  if (!signingText) {
    return fail(
      "missing-signing-key",
      "缺少 CREATOROS_VERDICT_SIGNING_KEY_B64，拒绝生成安装后必白屏的桌面包。",
    );
  }
  const signingSeed = decodeCanonicalBase64(signingText, { urlSafe: true });
  if (!signingSeed || signingSeed.length !== 32) {
    return fail(
      "invalid-signing-key",
      "CREATOROS_VERDICT_SIGNING_KEY_B64 必须是规范的 32B Ed25519 seed（base64url、无 padding）。",
    );
  }
  const publicResult = validateVerdictPublicKey(env);
  if (!publicResult.ok) return publicResult;
  const configuredPublic = Buffer.from(publicResult.publicKeyB64, "base64");

  try {
    const privateKey = createPrivateKey({
      key: Buffer.concat([ED25519_PKCS8_SEED_PREFIX, signingSeed]),
      format: "der",
      type: "pkcs8",
    });
    const publicDer = createPublicKey(privateKey).export({
      format: "der",
      type: "spki",
    });
    const derivedPublic = publicDer.subarray(publicDer.length - 32);
    if (
      derivedPublic.length !== configuredPublic.length ||
      !timingSafeEqual(derivedPublic, configuredPublic)
    ) {
      return fail(
        "key-pair-mismatch",
        "CREATOROS_VERDICT_SIGNING_KEY_B64 与 CREATOROS_VERDICT_PUBKEY_B64 不属于同一 Ed25519 密钥对。",
      );
    }
    return { ok: true, publicKeyB64: configuredPublic.toString("base64") };
  } catch {
    return fail(
      "invalid-signing-key",
      "CREATOROS_VERDICT_SIGNING_KEY_B64 无法构造 Ed25519 私钥。",
    );
  } finally {
    signingSeed.fill(0);
  }
}

export function assertVerdictKeyMaterial(env = process.env) {
  const result = validateVerdictKeyMaterial(env);
  if (!result.ok) {
    const error = new Error(`[T-535] ${result.error}`);
    error.code = result.code;
    throw error;
  }
  return result;
}

/**
 * 只供打包驱动进程使用：签发短时、端口绑定的真实 verdict token。
 * token 可传入冒烟 sidecar；签名 seed 不得进入其 env。
 */
export function createBuildSmokeVerdictToken(
  {
    sidecarPort,
    nowMs = Date.now(),
    ttlMs = 5 * 60_000,
    machineId = "build-smoke",
  },
  env = process.env,
) {
  assertVerdictKeyMaterial(env);
  if (!Number.isInteger(sidecarPort) || sidecarPort < 1 || sidecarPort > 65_535) {
    throw new Error("[T-656] 打包冒烟 sidecarPort 非法。");
  }
  if (
    !Number.isFinite(nowMs) ||
    !Number.isFinite(ttlMs) ||
    ttlMs <= 0 ||
    ttlMs > 5 * 60_000
  ) {
    throw new Error("[T-656] 打包冒烟 verdict 有效期非法。");
  }

  const signingSeed = decodeCanonicalBase64(
    env.CREATOROS_VERDICT_SIGNING_KEY_B64,
    { urlSafe: true },
  );
  const privateDer = Buffer.concat([ED25519_PKCS8_SEED_PREFIX, signingSeed]);
  let privateKey;
  try {
    privateKey = createPrivateKey({
      key: privateDer,
      format: "der",
      type: "pkcs8",
    });
  } finally {
    signingSeed.fill(0);
    privateDer.fill(0);
  }
  const payloadJson = JSON.stringify({
    v: 1,
    mode: "licensed",
    machineId,
    sidecarPort,
    issuedAt: new Date(nowMs).toISOString(),
    expiresAt: new Date(nowMs + ttlMs).toISOString(),
    nonce: randomBytes(16).toString("hex"),
    licenseMode: "build_smoke",
  });
  const signature = cryptoSign(null, Buffer.from(payloadJson, "utf8"), privateKey);
  return `${Buffer.from(payloadJson, "utf8").toString("base64url")}.${signature.toString("base64url")}`;
}
