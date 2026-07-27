import { describe, it, expect } from "vitest";
import { createCipheriv, randomBytes } from "node:crypto";
import {
  decodeLicenseVerdict,
  deriveLicenseKey,
  readLicenseVerdict,
  resolveLicenseFilePath,
  type LicenseVerdict,
} from "./license-file.server";

// [T-372 L2] `.license` 放行权威文件读端单测(不真读盘,fs 注桩)。
//
// 封包格式与 Rust 写端(src-tauri/src/license.rs encrypt_snapshot)逐字对齐:
//   `enc:v1:` + base64(iv12 | tag16 | ct),AES-256-GCM,
//   key = SHA-256(masterKeyRaw32 ‖ "creatoros-license-v1")。
// 本测试用 Node crypto 按同一封包规格造密文,验证读端解得开(格式契约锚点);
// Rust 侧 roundtrip 由 cargo test snapshot_encrypt_roundtrip 锚另一半。

const MASTER = Buffer.alloc(32, 7);

function snapshotFixture(over: Partial<LicenseVerdict> = {}): LicenseVerdict {
  return {
    v: 1,
    allowed: true,
    status: "active",
    machineId: "machine-1",
    licenseMode: "TIME",
    expiresAt: "2026-07-20T12:00:00Z",
    graceSeconds: 86400,
    revoked: false,
    signatureVerified: true,
    message: "已激活",
    ...over,
  };
}

/** 按 Rust encrypt_snapshot 同规格封包(iv ‖ tag ‖ ct)。 */
function encryptLikeRust(payload: unknown, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const plain = Buffer.from(JSON.stringify(payload), "utf8");
  const ct = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = cipher.getAuthTag();
  return "enc:v1:" + Buffer.concat([iv, tag, ct]).toString("base64");
}

describe("license-file 读端 —— 解密与判定", () => {
  it("enc:v1: 密文(派生 key)→ 解出放行判定", () => {
    const key = deriveLicenseKey(MASTER);
    const packed = encryptLikeRust(snapshotFixture(), key);
    const verdict = decodeLicenseVerdict(packed, key);
    expect(verdict.allowed).toBe(true);
    expect(verdict.status).toBe("active");
    expect(verdict.signatureVerified).toBe(true);
  });

  it("[T-538] 反馈 sidecar 只在解密后取得 code/project/machine，明文封包之外不可读", () => {
    const key = deriveLicenseKey(MASTER);
    const packed = encryptLikeRust(
      snapshotFixture({
        code: "ACTIVATION-SECRET",
        machineId: "machine-secret",
        projectKey: "creatoros",
      }),
      key,
    );
    expect(packed).not.toContain("ACTIVATION-SECRET");
    const verdict = decodeLicenseVerdict(packed, key);
    expect(verdict).toMatchObject({
      code: "ACTIVATION-SECRET",
      machineId: "machine-secret",
      projectKey: "creatoros",
    });
  });

  it("错 key → auth tag 校验失败 throw(readLicenseVerdict 收敛为 null)", async () => {
    const key = deriveLicenseKey(MASTER);
    const wrong = deriveLicenseKey(Buffer.alloc(32, 1));
    const packed = encryptLikeRust(snapshotFixture(), key);
    expect(() => decodeLicenseVerdict(packed, wrong)).toThrow();
    const verdict = await readLicenseVerdict({
      env: { CREATOROS_LICENSE_FILE: "/x/.license" },
      readFileImpl: async () => packed,
      masterKey: wrong,
    });
    expect(verdict).toBeNull();
  });

  it("明文降级快照(无 enc:v1: 前缀)→ 可读(极端无 master key 环境)", () => {
    const verdict = decodeLicenseVerdict(
      JSON.stringify(snapshotFixture({ allowed: false, status: "expired" })),
      null,
    );
    expect(verdict.allowed).toBe(false);
    expect(verdict.status).toBe("expired");
  });

  it("坏内容(缺 allowed / 版本不符)→ throw", () => {
    expect(() => decodeLicenseVerdict(JSON.stringify({ v: 1 }), null)).toThrow();
    expect(() =>
      decodeLicenseVerdict(JSON.stringify({ v: 2, allowed: true }), null),
    ).toThrow();
  });

  it("readLicenseVerdict:文件不存在 → null(尚无 Rust 放行判定)", async () => {
    const verdict = await readLicenseVerdict({
      env: { CREATOROS_LICENSE_FILE: "/nonexistent/.license" },
      readFileImpl: async () => {
        throw new Error("ENOENT");
      },
      masterKey: null,
    });
    expect(verdict).toBeNull();
  });
});

describe("license-file 路径解析", () => {
  it("CREATOROS_LICENSE_FILE 显式注入优先(Rust 壳注入的权威路径)", () => {
    expect(
      resolveLicenseFilePath({ CREATOROS_LICENSE_FILE: "/data/.license" }),
    ).toBe("/data/.license");
  });

  it("回退 <CREATOROS_DB_DIR 父目录>/.license(与 machine-id 同位面)", () => {
    expect(resolveLicenseFilePath({ CREATOROS_DB_DIR: "/data/db" })).toBe(
      "/data/.license",
    );
  });

  it("web/dev(两者皆无)→ null(门在 web 本就不触发)", () => {
    expect(resolveLicenseFilePath({})).toBeNull();
  });
});
