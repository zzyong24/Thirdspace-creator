import {
  createPublicKey,
  generateKeyPairSync,
  verify as cryptoVerify,
} from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  assertVerdictPublicKey,
  assertVerdictKeyMaterial,
  createBuildSmokeVerdictToken,
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

  it("拒绝旧哨兵、换行与 padding，构建输入只接受 canonical base64url seed", () => {
    const env = makePair();
    for (const signingKey of [
      `${env.CREATOROS_VERDICT_SIGNING_KEY_B64}[T451-BOUND]`,
      `${env.CREATOROS_VERDICT_SIGNING_KEY_B64}\n`,
      `${env.CREATOROS_VERDICT_SIGNING_KEY_B64}=`,
    ]) {
      expect(
        validateVerdictKeyMaterial({
          ...env,
          CREATOROS_VERDICT_SIGNING_KEY_B64: signingKey,
        }),
      ).toMatchObject({ ok: false, code: "invalid-signing-key" });
    }
  });

  it("给打包冒烟签发绑定端口的短时真实 verdict token", () => {
    const env = makePair();
    const token = createBuildSmokeVerdictToken(
      {
        sidecarPort: 43123,
        nowMs: Date.parse("2026-08-02T12:00:00.000Z"),
        ttlMs: 5 * 60_000,
      },
      env,
    );
    const [payloadB64, signatureB64] = token.split(".");
    const payloadJson = Buffer.from(payloadB64, "base64url").toString("utf8");
    const payload = JSON.parse(payloadJson);
    const publicKey = createPublicKey({
      key: {
        kty: "OKP",
        crv: "Ed25519",
        x: Buffer.from(env.CREATOROS_VERDICT_PUBKEY_B64, "base64").toString(
          "base64url",
        ),
      },
      format: "jwk",
    });

    expect(payload).toMatchObject({
      v: 1,
      mode: "licensed",
      machineId: "build-smoke",
      sidecarPort: 43123,
      issuedAt: "2026-08-02T12:00:00.000Z",
      expiresAt: "2026-08-02T12:05:00.000Z",
    });
    expect(payload.nonce).toMatch(/^[a-f0-9]{32}$/);
    expect(
      cryptoVerify(
        null,
        Buffer.from(payloadJson, "utf8"),
        publicKey,
        Buffer.from(signatureB64, "base64url"),
      ),
    ).toBe(true);
    expect(() =>
      createBuildSmokeVerdictToken(
        { sidecarPort: 43123, ttlMs: 5 * 60_000 + 1 },
        env,
      ),
    ).toThrow(/有效期非法/);
  });
});
