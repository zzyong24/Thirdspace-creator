import { describe, it, expect, vi, afterEach } from "vitest";
import { createHash } from "node:crypto";
import { closeSync, mkdtempSync, openSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  resolveMasterKey,
  encryptSecret,
  decryptSecret,
  isEncrypted,
  ENC_PREFIX,
  __resetFdKeyCacheForTest,
} from "./secret-crypto";

// A deterministic 32-byte key (base64) for round-trip tests.
const KEY = Buffer.alloc(32, 7); // 32 bytes of 0x07
const KEY_B64 = KEY.toString("base64");

afterEach(() => {
  vi.restoreAllMocks();
  __resetFdKeyCacheForTest();
});

describe("secret-crypto AES-256-GCM round-trip", () => {
  it("encrypts to an enc:v1: prefixed blob and decrypts back to plaintext", () => {
    const plain = "sk-super-secret-key-1234567890";
    const blob = encryptSecret(plain, KEY);
    expect(blob.startsWith(ENC_PREFIX)).toBe(true);
    expect(blob).not.toContain(plain); // ciphertext, not plaintext
    expect(decryptSecret(blob, KEY)).toBe(plain);
  });

  it("produces a different ciphertext each call (random iv) but same plaintext", () => {
    const plain = "sk-abc";
    const a = encryptSecret(plain, KEY);
    const b = encryptSecret(plain, KEY);
    expect(a).not.toBe(b); // random iv → different blob
    expect(decryptSecret(a, KEY)).toBe(plain);
    expect(decryptSecret(b, KEY)).toBe(plain);
  });

  it("round-trips empty string and unicode", () => {
    for (const plain of ["", "密钥-测试-🔐", "a".repeat(500)]) {
      expect(decryptSecret(encryptSecret(plain, KEY), KEY)).toBe(plain);
    }
  });

  it("throws when decrypting with the wrong key (GCM auth tag mismatch)", () => {
    const blob = encryptSecret("sk-real", KEY);
    const wrong = Buffer.alloc(32, 9);
    expect(() => decryptSecret(blob, wrong)).toThrow();
  });
});

describe("prefix marker — encrypted vs legacy plaintext", () => {
  it("isEncrypted true only for the enc:v1: prefix", () => {
    expect(isEncrypted(encryptSecret("x", KEY))).toBe(true);
    expect(isEncrypted("sk-plaintext-legacy")).toBe(false);
    expect(isEncrypted("")).toBe(false);
    expect(isEncrypted(null)).toBe(false);
  });

  it("decryptSecret passes legacy plaintext through unchanged (no prefix)", () => {
    // Backward-compat: existing rows are raw plaintext with NO prefix →透传.
    expect(decryptSecret("sk-legacy-plaintext", KEY)).toBe("sk-legacy-plaintext");
    expect(decryptSecret("", KEY)).toBe("");
  });

  it("decryptSecret returns null unchanged", () => {
    expect(decryptSecret(null, KEY)).toBe(null);
  });
});

describe("resolveMasterKey — desktop keychain env vs web/dev fallback", () => {
  it("reads a base64 32-byte key from CREATOROS_MASTER_KEY (desktop keychain path)", () => {
    const res = resolveMasterKey({ CREATOROS_MASTER_KEY: KEY_B64 });
    expect(res.key.equals(KEY)).toBe(true);
    expect(res.source).toBe("env");
    expect(res.degraded).toBe(false);
  });

  it("ignores a malformed (non-32-byte) env key and falls back", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const res = resolveMasterKey({
      CREATOROS_MASTER_KEY: Buffer.alloc(16, 1).toString("base64"),
      NODE_ENV: "development",
    });
    // Malformed → not "env"; dev fallback kicks in (never throws in web path).
    expect(res.source).not.toBe("env");
    expect(res.key.length).toBe(32);
    expect(warn).toHaveBeenCalled();
  });

  it("dev fallback: no env key in development → fixed dev key + warning, degraded=true", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const res = resolveMasterKey({ NODE_ENV: "development" });
    expect(res.key.length).toBe(32);
    expect(res.source).toBe("dev-fallback");
    expect(res.degraded).toBe(true);
    expect(warn).toHaveBeenCalled();
  });

  it("web path never throws when the key is absent (returns a usable degraded key)", () => {
    // production without a key must NOT crash the app (additive: encryption is
    // best-effort at rest; the app keeps working). A degraded key is returned.
    expect(() => resolveMasterKey({ NODE_ENV: "production" })).not.toThrow();
    const res = resolveMasterKey({ NODE_ENV: "production" });
    expect(res.key.length).toBe(32);
    expect(res.degraded).toBe(true);
  });

  it("[T-416 P0-A] dev fallback key is stable within a process, but random (not the old hardcoded constant)", () => {
    // 同进程内稳定(能解回本次会话写的 blob),但**不再是**可公开推导的确定性常量
    // (SHA256("creatoros-dev-fallback-master-key-v1"))—— 那会让降级态写的模型 key 被任何人解密。
    const a = resolveMasterKey({ NODE_ENV: "development" });
    const b = resolveMasterKey({ NODE_ENV: "development" });
    expect(a.key.equals(b.key)).toBe(true); // 同进程稳定
    const oldHardcoded = createHash("sha256")
      .update("creatoros-dev-fallback-master-key-v1")
      .digest();
    expect(a.key.equals(oldHardcoded)).toBe(false); // 已去确定性常量
  });
});

describe("[T-391 H-key] master key via ChildStdin fd channel", () => {
  it("reads the key from the injected fd reader (desktop path), source='fd'", () => {
    const res = resolveMasterKey(
      { CREATOROS_MASTER_KEY_FD: "0" },
      { readFd: (fd) => (fd === 0 ? KEY_B64 : "") },
    );
    expect(res.key.equals(KEY)).toBe(true);
    expect(res.source).toBe("fd");
    expect(res.degraded).toBe(false);
  });

  it("desktop path does NOT need CREATOROS_MASTER_KEY env (no plaintext key in env)", () => {
    // The Rust shell injects only the fd NUMBER, never the key itself in env.
    const env = { CREATOROS_MASTER_KEY_FD: "0" } as Record<string, string>;
    expect(env.CREATOROS_MASTER_KEY).toBeUndefined();
    const res = resolveMasterKey(env, { readFd: () => KEY_B64 });
    expect(res.source).toBe("fd");
    expect(res.degraded).toBe(false);
  });

  it("fd channel takes precedence over a legacy env key", () => {
    const otherKey = Buffer.alloc(32, 9).toString("base64");
    const res = resolveMasterKey(
      { CREATOROS_MASTER_KEY_FD: "0", CREATOROS_MASTER_KEY: otherKey },
      { readFd: () => KEY_B64 },
    );
    expect(res.source).toBe("fd");
    expect(res.key.equals(KEY)).toBe(true); // fd key wins
  });

  it("falls back to env when the fd yields a malformed key", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const res = resolveMasterKey(
      { CREATOROS_MASTER_KEY_FD: "0", CREATOROS_MASTER_KEY: KEY_B64 },
      { readFd: () => "not-a-valid-32b-key" },
    );
    expect(res.source).toBe("env"); // fd bad → env backward-compat path
    expect(res.key.equals(KEY)).toBe(true);
    expect(warn).toHaveBeenCalled();
  });

  it("falls back to dev key when fd yields nothing and no env key", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const res = resolveMasterKey(
      { CREATOROS_MASTER_KEY_FD: "0", NODE_ENV: "development" },
      { readFd: () => "" },
    );
    expect(res.degraded).toBe(true);
    expect(res.source).toBe("dev-fallback");
    expect(warn).toHaveBeenCalled();
  });

  it("reads-until-newline from a REAL fd and stops before trailing bytes (Win/Linux: writer stays open)", () => {
    // Write "KEY\nGARBAGE" to a file, open it, and prove the default fd reader
    // returns only the key (stops at \n), not the trailing bytes. This mirrors the
    // shell path where stdin is NOT closed — termination is by newline, not EOF.
    const dir = mkdtempSync(join(tmpdir(), "mkfd-"));
    const file = join(dir, "key.bin");
    writeFileSync(file, `${KEY_B64}\nTRAILING-GARBAGE-SHOULD-NOT-BE-READ`);
    const fd = openSync(file, "r");
    try {
      const res = resolveMasterKey({ CREATOROS_MASTER_KEY_FD: String(fd) });
      expect(res.source).toBe("fd");
      expect(res.key.equals(KEY)).toBe(true);
    } finally {
      closeSync(fd);
    }
  });
});

describe("end-to-end: encrypt under resolved key, decrypt under the same resolved key", () => {
  it("a value written with the env master key decrypts with the same env master key", () => {
    const { key } = resolveMasterKey({ CREATOROS_MASTER_KEY: KEY_B64 });
    const blob = encryptSecret("sk-live-key", key);
    const { key: key2 } = resolveMasterKey({ CREATOROS_MASTER_KEY: KEY_B64 });
    expect(decryptSecret(blob, key2)).toBe("sk-live-key");
  });
});

describe("T-731 正式桌面拒绝可逆文件/MACHINE_SEED 回退", () => {
  it("即使旧 .master-key 文件存在，Node 解析器也完全忽略旧路径与 seed", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const dir = mkdtempSync(join(tmpdir(), "mk-retired-"));
    const file = join(dir, ".master-key");
    writeFileSync(file, KEY_B64);

    const res = resolveMasterKey({
      NODE_ENV: "production",
      CREATOROS_MASTER_KEY_FILE: file,
      CREATOROS_MACHINE_SEED: "legacy-machine-seed",
    });
    expect(res.source).toBe("dev-fallback");
    expect(res.degraded).toBe(true);
    expect(res.key.length).toBe(32);
    expect(warn).toHaveBeenCalled();
  });

  it("旧文件变量不能覆盖显式 web master key", () => {
    const res = resolveMasterKey({
      CREATOROS_MASTER_KEY: KEY_B64,
      CREATOROS_MASTER_KEY_FILE: "/tmp/should-never-be-read",
      CREATOROS_MACHINE_SEED: "ignored",
    });
    expect(res.source).toBe("env");
    expect(res.degraded).toBe(false);
    expect(res.key.equals(KEY)).toBe(true);
  });

  it("旧文件变量不能覆盖桌面 fd 通道", () => {
    const res = resolveMasterKey(
      {
        CREATOROS_MASTER_KEY_FD: "0",
        CREATOROS_MASTER_KEY_FILE: "/tmp/should-never-be-read",
        CREATOROS_MACHINE_SEED: "ignored",
      },
      { readFd: () => KEY_B64 },
    );
    expect(res.source).toBe("fd");
    expect(res.degraded).toBe(false);
    expect(res.key.equals(KEY)).toBe(true);
  });

  it("负数 fd 被拒绝且不会尝试读取任意文件描述符", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const readFd = vi.fn(() => KEY_B64);
    const res = resolveMasterKey(
      { CREATOROS_MASTER_KEY_FD: "-1", NODE_ENV: "development" },
      { readFd },
    );
    expect(readFd).not.toHaveBeenCalled();
    expect(res.source).toBe("dev-fallback");
    expect(warn).toHaveBeenCalled();
  });

  it("非整数 fd 被拒绝且不会截断后误读", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const readFd = vi.fn(() => KEY_B64);
    const res = resolveMasterKey(
      { CREATOROS_MASTER_KEY_FD: "1.5", NODE_ENV: "development" },
      { readFd },
    );
    expect(readFd).not.toHaveBeenCalled();
    expect(res.degraded).toBe(true);
    expect(warn).toHaveBeenCalled();
  });

  it("fd 读取器抛错时仅回退到显式 env，不接触文件路径", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const res = resolveMasterKey(
      {
        CREATOROS_MASTER_KEY_FD: "0",
        CREATOROS_MASTER_KEY: KEY_B64,
        CREATOROS_MASTER_KEY_FILE: "/tmp/should-never-be-read",
      },
      {
        readFd: () => {
          throw new Error("fd closed");
        },
      },
    );
    expect(res.source).toBe("env");
    expect(res.key.equals(KEY)).toBe(true);
    expect(warn).toHaveBeenCalled();
  });

  it("加密拒绝非 32 字节 key，不产生可误判的密文", () => {
    expect(() => encryptSecret("secret", Buffer.alloc(31))).toThrow(/32/);
  });

  it("损坏的 enc:v1 载荷必须认证失败，不能当旧明文透传", () => {
    expect(() => decryptSecret("enc:v1:not-valid-ciphertext", KEY)).toThrow();
  });
});
