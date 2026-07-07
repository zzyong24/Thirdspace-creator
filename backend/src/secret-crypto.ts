import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

// T-147 P2 本地加密 —— 模型 API key 的静态加密工具(收口在 settings.repository 层做透明加解密)。
//
// 设计(见 docs/superpowers/specs/2026-07-05-desktop-app-architecture-overview.md P2):
//   - 算法:AES-256-GCM(密文 + 12B iv + 16B auth tag,一起 base64 打包)。
//   - master key 来源:桌面 = OS keychain(Rust keyring crate 取/建,经 env
//     `CREATOROS_MASTER_KEY` base64 注入 sidecar);web/dev = 同一 env,无则**开发降级**
//     (固定 dev key + 警告,只 dev,web 路径绝不崩)。
//   - 前缀标记 `enc:v1:`:读时有前缀→解密,无前缀→当**存量明文透传**(向后兼容,过渡期)。
//
// 密钥永不落日志:本文件不 console.log 任何 key/明文;调用方(repo)拿到的是解密后的明文,
// 也只用于 provider 认证,不落日志。

// 密文前缀标记(版本化,便于将来 v2 换算法而不误判存量)。
export const ENC_PREFIX = "enc:v1:";

const ALGO = "aes-256-gcm";
const IV_LEN = 12; // GCM 推荐 96-bit iv
const TAG_LEN = 16; // GCM auth tag 128-bit
const KEY_LEN = 32; // AES-256

export type MasterKeySource = "env" | "dev-fallback";

export interface ResolvedMasterKey {
  key: Buffer; // 32 字节
  source: MasterKeySource;
  // true = 用的是开发降级 key(非 keychain 派生),安全性弱于 keychain,不应在真桌面端出现。
  degraded: boolean;
}

/** 一个值是否已是本工具产出的密文(有 enc:v1: 前缀)。null/明文 → false。 */
export function isEncrypted(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith(ENC_PREFIX);
}

/**
 * 加密明文 → `enc:v1:<base64(iv | tag | ciphertext)>`。key 必须 32 字节。
 * 每次随机 iv → 同一明文每次密文不同(GCM 语义安全)。
 */
export function encryptSecret(plaintext: string, key: Buffer): string {
  if (key.length !== KEY_LEN) {
    throw new Error(`master key 必须 ${KEY_LEN} 字节,实际 ${key.length}`);
  }
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  const packed = Buffer.concat([iv, tag, ciphertext]).toString("base64");
  return ENC_PREFIX + packed;
}

/**
 * 解密。
 *   - null → 原样返回(未配 key 的 NULL 列)。
 *   - 无 enc:v1: 前缀 → 当**存量明文透传**(向后兼容,过渡期未迁移的旧行)。
 *   - 有前缀 → AES-256-GCM 解密(key 不对 / 数据被篡改 → auth tag 校验失败,抛错)。
 */
export function decryptSecret<T extends string | null>(
  stored: T,
  key: Buffer,
): T extends null ? null : string;
export function decryptSecret(
  stored: string | null,
  key: Buffer,
): string | null {
  if (stored === null || stored === undefined) return stored ?? null;
  if (!isEncrypted(stored)) return stored; // 存量明文透传
  const packed = Buffer.from(stored.slice(ENC_PREFIX.length), "base64");
  const iv = packed.subarray(0, IV_LEN);
  const tag = packed.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const ciphertext = packed.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}

// 开发降级 key:从固定字符串派生(SHA-256 → 32B)。**只在 dev / 无 keychain 时用**,
// 目的是让 web/dev 路径永不崩、且同一 dev 环境跨重启能解回自己写的 blob。安全性弱
// (固定值,任何人可推导)——真桌面端必须用 keychain 注入的随机 key。
const DEV_FALLBACK_KEY = createHash("sha256")
  .update("creatoros-dev-fallback-master-key-v1")
  .digest();

/**
 * 解析 master key(32B)。
 *   1) env `CREATOROS_MASTER_KEY`(base64 32 字节)—— 桌面端由 Rust keyring 取/建后注入;
 *      web 部署也可用它(运维显式配)。合法 → source="env",degraded=false。
 *   2) 缺失 / 非法(非 32 字节)→ **开发降级**:固定 dev key + 一条警告,degraded=true。
 *      **web 路径绝不抛**(加密是 best-effort at rest;没 key 也不能让 app 崩)。
 */
export function resolveMasterKey(
  env: Record<string, string | undefined>,
): ResolvedMasterKey {
  const raw = env.CREATOROS_MASTER_KEY?.trim();
  if (raw) {
    try {
      const key = Buffer.from(raw, "base64");
      if (key.length === KEY_LEN) {
        return { key, source: "env", degraded: false };
      }
      console.warn(
        `[secret-crypto] CREATOROS_MASTER_KEY 长度 ${key.length}≠${KEY_LEN}B,忽略 → 降级 dev key`,
      );
    } catch {
      console.warn(
        "[secret-crypto] CREATOROS_MASTER_KEY 非法 base64,忽略 → 降级 dev key",
      );
    }
  }
  // 降级(dev 或无 keychain 的 web)。不抛,保证 app 不崩。
  console.warn(
    "[secret-crypto] 未取到 keychain master key(CREATOROS_MASTER_KEY 缺失/非法)—— " +
      "使用开发降级 key。桌面端应由 Tauri keyring 注入随机 key;此降级安全性弱于 keychain。",
  );
  return { key: DEV_FALLBACK_KEY, source: "dev-fallback", degraded: true };
}
