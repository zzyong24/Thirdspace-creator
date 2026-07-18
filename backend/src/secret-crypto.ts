import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { readSync } from "node:fs";

// T-147 P2 本地加密 —— 模型 API key 的静态加密工具(收口在 settings.repository 层做透明加解密)。
//
// 设计(见 docs/superpowers/specs/2026-07-05-desktop-app-architecture-overview.md P2):
//   - 算法:AES-256-GCM(密文 + 12B iv + 16B auth tag,一起 base64 打包)。
//   - master key 来源:桌面 = OS keychain(Rust keyring crate 取/建)[T-391 H-key]**经 ChildStdin
//     (fd 0)传给 sidecar**,env 只放非机密的 fd 号 `CREATOROS_MASTER_KEY_FD`(不再 env 明文注入
//     key 本体);web = 运维可显式配 env `CREATOROS_MASTER_KEY`(向后兼容),无则**开发降级**
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

export type MasterKeySource = "fd" | "env" | "dev-fallback";

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

// [T-416 P0-A] 开发降级 key:改「**每进程随机**」(去掉确定性常量)。原为
//   `SHA256("creatoros-dev-fallback-master-key-v1")` —— 任何人可推导,正版偶发降级态
//   (fd 竞态/keychain 打嗝)写的模型 key 就能被这个公开常量解密。改随机后:模块级
//   `randomBytes` 在**同进程内稳定**(能解回本次会话自己写的 blob,app 不崩),跨进程/重启
//   即变(降级态数据重启解不开 = 可接受:降级本不该在真桌面出现,fd 通道才是常态;dev 每次
//   新进程换 key)。仍弱于 keychain(内存可 dump),但已灭「公开常量一把解密」这个最弱点。
const DEV_FALLBACK_KEY = randomBytes(32);

// [T-391 H-key] 从指定 fd(桌面端 = ChildStdin,fd 0)同步读 master key(base64),读到**换行符**
//   或 EOF 即停 —— 不依赖 EOF(Win/Linux 的 tauri-plugin-shell 写端不关,靠换行终止;macOS std 写完
//   关 stdin 会给 EOF,同样终止)。key 很小(~44B),已被 Rust 在 spawn 后立即写入管道缓冲,故此处
//   同步读不会长阻塞。结果**按 fd 记忆化**(fd 可能读到 EOF,二次读为空;memo 保证只读一次)。
const fdKeyCache = new Map<number, string>();

// 同步小睡(非 busy-wait):Atomics.wait 阻塞当前线程 ms 毫秒。仅用于 fd 竞态等待。
function sleepSyncMs(ms: number): void {
  try {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
  } catch {
    // SharedArrayBuffer 不可用(极老 runtime)→ 退回极短 busy-wait(仅 startup 偶发一次)。
    const end = Date.now() + ms;
    while (Date.now() < end) {
      /* spin */
    }
  }
}

// [T-408 fd 竞态修复] Rust 在 spawn sidecar 后**异步**往 stdin(fd 0)写 master key + 换行;若
//   sidecar 首个消费者(DB 初始化)抢先在 Rust 写入前读 fd,非阻塞读连吃 EAGAIN → 4096 次微秒级
//   空转后拿空 → 降级 → .license 解不开 → **偶发跳转激活页**(真机实测 ~1/4 启动会中招)。
//   修:①EAGAIN / 未就绪的 0 返回时**同步小睡后重试**(给 Rust 写入留最多 3s 窗口,而非微秒空转);
//   ②**空结果不缓存**(key 仍在管道,允许后续消费者——如激活门——重读到)。已读到主体后的
//   EAGAIN/EOF 视为 key 结束正常收尾。
function readMasterKeyFromFd(fd: number): string {
  const cached = fdKeyCache.get(fd);
  if (cached !== undefined) return cached;
  const bytes: number[] = [];
  const one = Buffer.alloc(1);
  const deadline = Date.now() + 3000;
  let sawData = false;
  while (Date.now() < deadline) {
    let n = 0;
    try {
      n = readSync(fd, one, 0, 1, null);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "EAGAIN") {
        if (sawData) break; // 已读到 key 主体后的 EAGAIN = 写端暂停,视为结束
        sleepSyncMs(10); // key 还没到 → 等 Rust 写(不微秒空转)
        continue;
      }
      break; // 其它错误 → 停(交由上层降级)
    }
    if (n === 0) {
      if (sawData) break; // 真 EOF(key 已读完)
      sleepSyncMs(10); // 写端尚未就绪的 0 返回 → 等一下重试
      continue;
    }
    sawData = true;
    const b = one.readUInt8(0);
    if (b === 0x0a) break; // 换行 → key 结束
    bytes.push(b);
    if (bytes.length > 4096) break; // 上限保护(base64 32B≈44 字符,远小于此)
  }
  const key = Buffer.from(bytes).toString("utf8").trim();
  // 只缓存**非空**:竞态拿空不缓存,后续消费者可重读到 Rust 已写入的 key(修跳转环根因)。
  if (key) fdKeyCache.set(fd, key);
  return key;
}

/** @internal 测试专用:清空 fd → key 记忆化缓存。 */
export function __resetFdKeyCacheForTest(): void {
  fdKeyCache.clear();
}

function toKeyResult(
  raw: string | undefined,
  source: Exclude<MasterKeySource, "dev-fallback">,
  label: string,
): ResolvedMasterKey | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  try {
    const key = Buffer.from(trimmed, "base64");
    if (key.length === KEY_LEN) {
      return { key, source, degraded: false };
    }
    console.warn(
      `[secret-crypto] ${label} 长度 ${key.length}≠${KEY_LEN}B,忽略 → 降级 dev key`,
    );
  } catch {
    console.warn(`[secret-crypto] ${label} 非法 base64,忽略 → 降级 dev key`);
  }
  return null;
}

/**
 * 解析 master key(32B)。
 *   1) [T-391 H-key] env `CREATOROS_MASTER_KEY_FD`(fd 号,非机密)在场 → 从该 fd 读 key
 *      (桌面端 = Rust 经 ChildStdin 传的通道,**不再走 env 明文**)。合法 → source="fd"。
 *   2) env `CREATOROS_MASTER_KEY`(base64 32 字节)—— **web 部署运维显式配**的向后兼容路径
 *      (桌面端已不再注入此 env)。合法 → source="env"。
 *   3) 缺失 / 非法(非 32 字节)→ **开发降级**:固定 dev key + 一条警告,degraded=true。
 *      **web 路径绝不抛**(加密是 best-effort at rest;没 key 也不能让 app 崩)。
 *
 * @param opts.readFd 可注入的 fd 读取器(测试用;默认走真 fs.readSync)。
 */
export function resolveMasterKey(
  env: Record<string, string | undefined>,
  opts?: { readFd?: (fd: number) => string },
): ResolvedMasterKey {
  // ① fd 通道(桌面端首选)。
  const fdRaw = env.CREATOROS_MASTER_KEY_FD?.trim();
  if (fdRaw) {
    const fd = Number(fdRaw);
    if (Number.isInteger(fd) && fd >= 0) {
      let keyStr: string | undefined;
      try {
        keyStr = (opts?.readFd ?? readMasterKeyFromFd)(fd);
      } catch {
        console.warn(
          `[secret-crypto] 从 fd ${fd} 读 master key 失败 → 尝试 env/降级`,
        );
      }
      const res = toKeyResult(keyStr, "fd", `master key(fd ${fd})`);
      if (res) return res;
    } else {
      console.warn(
        `[secret-crypto] CREATOROS_MASTER_KEY_FD=${fdRaw} 非法 fd 号,忽略`,
      );
    }
  }

  // ② env 明文(web 运维显式配的向后兼容;桌面端不再走此路)。
  const envRes = toKeyResult(
    env.CREATOROS_MASTER_KEY,
    "env",
    "CREATOROS_MASTER_KEY",
  );
  if (envRes) return envRes;

  // ③ 降级(dev 或无 keychain 的 web)。不抛,保证 app 不崩。
  console.warn(
    "[secret-crypto] 未取到 master key(fd 通道 / CREATOROS_MASTER_KEY 均缺失或非法)—— " +
      "使用开发降级 key。桌面端应由 Tauri 经 ChildStdin 注入随机 key;此降级安全性弱于 keychain。",
  );
  return { key: DEV_FALLBACK_KEY, source: "dev-fallback", degraded: true };
}
