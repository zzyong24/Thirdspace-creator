import { createHash, createDecipheriv } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { resolveMasterKey } from "@creatoros/backend";

// [T-372 L2] `.license` 放行权威文件的**只读**端(SPEC §9/§13)。
//
// 写者唯一 = Rust 壳(src-tauri/src/license.rs):校验决策链(验签/防重放/防回拨)在 Rust
// 完成后,把「放行快照」AES-256-GCM 加密落 `<appDataDir>/.license`。桌面态激活门只读本文件
// 的 `allowed` 布尔判放行,**不读 activation_state 表**(表只是展示副本)。
//
// 加密封包与 backend secret-crypto 同格式(`enc:v1:` + base64(iv12|tag16|ct)),但密钥是
// **派生密钥** SHA-256(masterKeyRaw ‖ "creatoros-license-v1")(避免 master key 跨语境复用),
// 与 Rust 侧 derive_license_key 逐字对齐。无前缀 = 明文降级快照(无 master key 的极端环境)。
//
// 诚实边界:sidecar 读端本身是 JS,可被 patch —— 但 sidecar 入口(sidecar.tar.gz)已由 Rust
// 做 SHA-256 完整性校验(改 JS 必先动 Rust);这是 gate-F4 声明的防御链,不假装防逆向。

const ENC_PREFIX = "enc:v1:";
const IV_LEN = 12;
const TAG_LEN = 16;
const LICENSE_KEY_CONTEXT = "creatoros-license-v1";

/** Rust 快照(LicenseSnapshot serde camelCase)在 JS 侧的可读形状(宽容解析)。 */
export interface LicenseVerdict {
  v: number;
  /** 放行权威布尔(门只认它)。 */
  allowed: boolean;
  status: string; // active | grace | expired | inactive | untrusted
  machineId?: string;
  licenseMode?: string;
  expiresAt?: string | null;
  activatedAt?: string;
  graceSeconds?: number;
  revoked?: boolean;
  /** false = 弱验签(gate-F2「签名校验未启用」诚实标注,UI 可显示)。 */
  signatureVerified?: boolean;
  verdictAtMs?: number;
  message?: string;
}

/** 从 master key(32B)派生 .license 解密密钥(与 Rust derive_license_key 一致)。 */
export function deriveLicenseKey(masterKey: Buffer): Buffer {
  return createHash("sha256")
    .update(masterKey)
    .update(LICENSE_KEY_CONTEXT)
    .digest();
}

/**
 * `.license` 路径解析:①env `CREATOROS_LICENSE_FILE`(Rust 显式注入,权威);
 * ②回退 `<CREATOROS_DB_DIR 父目录>/.license`(与 machine-id / .auth 同位面);③都没有 → null。
 */
export function resolveLicenseFilePath(
  env: Record<string, string | undefined> = process.env,
): string | null {
  const explicit = env.CREATOROS_LICENSE_FILE?.trim();
  if (explicit) return explicit;
  const dbDir = env.CREATOROS_DB_DIR?.trim();
  if (dbDir) return join(dirname(dbDir), ".license");
  return null;
}

/** 解密 + 解析 `.license` 内容。坏封包/错 key/坏 JSON → throw(调用方按「无有效判定」降级)。 */
export function decodeLicenseVerdict(
  content: string,
  licenseKey: Buffer | null,
): LicenseVerdict {
  const trimmed = content.trim();
  let plain: string;
  if (trimmed.startsWith(ENC_PREFIX)) {
    if (!licenseKey) throw new Error("缺 master key,无法解密 .license");
    const packed = Buffer.from(trimmed.slice(ENC_PREFIX.length), "base64");
    const iv = packed.subarray(0, IV_LEN);
    const tag = packed.subarray(IV_LEN, IV_LEN + TAG_LEN);
    const ciphertext = packed.subarray(IV_LEN + TAG_LEN);
    const decipher = createDecipheriv("aes-256-gcm", licenseKey, iv);
    decipher.setAuthTag(tag);
    plain = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString("utf8");
  } else {
    plain = trimmed; // 明文降级快照
  }
  const parsed = JSON.parse(plain) as LicenseVerdict;
  if (parsed.v !== 1) throw new Error(`.license 版本 ${parsed.v} 不受支持`);
  if (typeof parsed.allowed !== "boolean") {
    throw new Error(".license 缺 allowed 字段");
  }
  return parsed;
}

export interface ReadLicenseVerdictOptions {
  env?: Record<string, string | undefined>;
  /** 注入读文件(测试传桩;不真读盘)。 */
  readFileImpl?: (path: string) => Promise<string>;
  /** 注入 master key(测试传桩;运行时默认 env CREATOROS_MASTER_KEY base64)。 */
  masterKey?: Buffer | null;
}

/**
 * 读放行判定。任何失败(无路径/文件不存在/解不开/坏内容)→ null(诚实降级,由调用方
 * 决定语义:激活门把 null 当「无有效放行」处理)。绝不 throw(门在 RSC 渲染路径上,崩 = 白屏)。
 */
export async function readLicenseVerdict(
  options: ReadLicenseVerdictOptions = {},
): Promise<LicenseVerdict | null> {
  const env = options.env ?? process.env;
  const path = resolveLicenseFilePath(env);
  if (!path) return null;
  let content: string;
  try {
    content = options.readFileImpl
      ? await options.readFileImpl(path)
      : await readFile(path, "utf8");
  } catch {
    return null; // 文件不存在 = 尚无 Rust 放行判定
  }
  let key: Buffer | null;
  if (options.masterKey !== undefined) {
    key = options.masterKey;
  } else {
    // [T-408] master key 经 Tauri ChildStdin(fd 0)注入(T-391 H-key),env 里只剩非机密 fd 号。
    //   必须走 resolveMasterKey(fd 通道 + fdKeyCache,与 persistence-client/DB 同源同缓存),
    //   **不能**直读 env.CREATOROS_MASTER_KEY —— 那是 T-391 前的旧路径,现已 undefined → 「缺
    //   master key」解不开 .license → 激活成功后 sidecar 门仍判未激活 → 无限跳转激活页
    //   (2026-07-18 真机:激活链首次真正跑通、.license 首次写盘,才暴露此 T-391 漏改)。
    const { key: master } = resolveMasterKey(env);
    key = master.length === 32 ? deriveLicenseKey(master) : null;
  }
  try {
    return decodeLicenseVerdict(content, key);
  } catch (e) {
    console.warn(
      "[activation] .license 解析失败(master key 不符或文件损坏)→ 视为无有效放行判定。",
      e instanceof Error ? e.message : e,
    );
    return null;
  }
}
