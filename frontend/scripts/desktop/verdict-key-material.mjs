import {
  createPrivateKey,
  createPublicKey,
  timingSafeEqual,
} from "node:crypto";

const ED25519_PKCS8_SEED_PREFIX = Buffer.from(
  "302e020100300506032b657004220420",
  "hex",
);

function fail(code, error) {
  return { ok: false, code, error };
}

function decodeCanonicalBase64(value, { urlSafe, allowSentinel = false }) {
  let input = String(value ?? "").trim();
  if (allowSentinel) {
    input = input.replaceAll("[T451-BOUND]", "").replace(/[\r\n]/g, "");
  }
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
 * 校验桌面壳签名私钥与 sidecar 验签公钥。
 * 只返回状态和规范化公钥，不打印、不落盘、也不在错误里回显任何密钥材料。
 */
export function validateVerdictKeyMaterial(env = process.env) {
  const signingText = String(env.CREATOROS_VERDICT_SIGNING_KEY_B64 ?? "").trim();
  const publicText = String(env.CREATOROS_VERDICT_PUBKEY_B64 ?? "").trim();
  if (!signingText) {
    return fail(
      "missing-signing-key",
      "缺少 CREATOROS_VERDICT_SIGNING_KEY_B64，拒绝生成安装后必白屏的桌面包。",
    );
  }
  if (!publicText) {
    return fail(
      "missing-public-key",
      "缺少 CREATOROS_VERDICT_PUBKEY_B64，拒绝生成安装后必白屏的桌面包。",
    );
  }

  const signingSeed = decodeCanonicalBase64(signingText, {
    urlSafe: true,
    allowSentinel: true,
  });
  if (!signingSeed || signingSeed.length !== 32) {
    return fail(
      "invalid-signing-key",
      "CREATOROS_VERDICT_SIGNING_KEY_B64 必须是规范的 32B Ed25519 seed（base64url、无 padding）。",
    );
  }
  const configuredPublic = decodeCanonicalBase64(publicText, { urlSafe: false });
  if (!configuredPublic || configuredPublic.length !== 32) {
    return fail(
      "invalid-public-key",
      "CREATOROS_VERDICT_PUBKEY_B64 必须是规范的 32B Ed25519 公钥（标准 base64）。",
    );
  }

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
