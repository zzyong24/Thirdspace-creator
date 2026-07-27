import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  assertVerdictPublicKey,
  assertVerdictKeyMaterial,
  validateVerdictPublicKey,
  validateVerdictKeyMaterial,
} from "./verdict-key-material.mjs";

function makePair() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const publicJwk = publicKey.export({ format: "jwk" });
  const privateJwk = privateKey.export({ format: "jwk" });
  return {
    CREATOROS_VERDICT_SIGNING_KEY_B64: privateJwk.d,
    CREATOROS_VERDICT_PUBKEY_B64: Buffer.from(publicJwk.x, "base64url").toString("base64"),
  };
}

describe("桌面 verdict 密钥材料门禁", () => {
  it("sidecar 子步骤只持有规范公钥时通过，不要求暴露签名私钥", () => {
    const env = makePair();
    const publicOnly = {
      CREATOROS_VERDICT_PUBKEY_B64: env.CREATOROS_VERDICT_PUBKEY_B64,
    };
    expect(validateVerdictPublicKey(publicOnly)).toEqual({
      ok: true,
      publicKeyB64: env.CREATOROS_VERDICT_PUBKEY_B64,
    });
    expect(() => assertVerdictPublicKey(publicOnly)).not.toThrow();
  });

  it("sidecar 公钥缺失或格式非法时仍硬失败", () => {
    expect(validateVerdictPublicKey({})).toMatchObject({
      ok: false,
      code: "missing-public-key",
    });
    expect(
      validateVerdictPublicKey({
        CREATOROS_VERDICT_PUBKEY_B64: "not-a-32-byte-public-key",
      }),
    ).toMatchObject({
      ok: false,
      code: "invalid-public-key",
    });
  });

  it("签名私钥和验签公钥属于同一 Ed25519 密钥对时通过", () => {
    const env = makePair();
    expect(validateVerdictKeyMaterial(env)).toEqual({
      ok: true,
      publicKeyB64: env.CREATOROS_VERDICT_PUBKEY_B64,
    });
    expect(() => assertVerdictKeyMaterial(env)).not.toThrow();
  });

  it("任一密钥缺失时在重构建前硬失败", () => {
    const env = makePair();
    expect(validateVerdictKeyMaterial({})).toMatchObject({
      ok: false,
      code: "missing-signing-key",
    });
    expect(
      validateVerdictKeyMaterial({
        CREATOROS_VERDICT_SIGNING_KEY_B64: env.CREATOROS_VERDICT_SIGNING_KEY_B64,
      }),
    ).toMatchObject({
      ok: false,
      code: "missing-public-key",
    });
  });

  it("长度非法或不是同一密钥对时失败，错误中不回显密钥", () => {
    const left = makePair();
    const right = makePair();
    const mismatch = validateVerdictKeyMaterial({
      CREATOROS_VERDICT_SIGNING_KEY_B64: left.CREATOROS_VERDICT_SIGNING_KEY_B64,
      CREATOROS_VERDICT_PUBKEY_B64: right.CREATOROS_VERDICT_PUBKEY_B64,
    });
    expect(mismatch).toMatchObject({ ok: false, code: "key-pair-mismatch" });
    expect(JSON.stringify(mismatch)).not.toContain(left.CREATOROS_VERDICT_SIGNING_KEY_B64);
    expect(JSON.stringify(mismatch)).not.toContain(right.CREATOROS_VERDICT_PUBKEY_B64);

    expect(
      validateVerdictKeyMaterial({
        CREATOROS_VERDICT_SIGNING_KEY_B64: "not-a-32-byte-key",
        CREATOROS_VERDICT_PUBKEY_B64: left.CREATOROS_VERDICT_PUBKEY_B64,
      }),
    ).toMatchObject({ ok: false, code: "invalid-signing-key" });
  });
});
