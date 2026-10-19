import {executionTimeoutMs} from "@creatoros/contract/timeout-policy";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { readFileSync, readSync } from "node:fs";

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

export type MasterKeySource = "fd" | "env" | "file" | "dev-fallback";

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
//   修:①真正未就绪的 EAGAIN 按原有限执行预算同步小睡后重试；0 是 EOF，立即交既有兜底。
//   ②**空结果不缓存**(key 仍在管道,允许后续消费者——如激活门——重读到)。已读到主体后的
//   EAGAIN/EOF 视为 key 结束正常收尾。
// [T-460 后修 2026-07-22] Windows tauri-plugin-shell:stdin 是**阻塞管道**,readSync 一次会
//   block 60 秒+(等下一个字节写入),导致 `while (Date.now() < deadline)` 3s deadline **完全失效**
//   —— 单次 read 就吃掉了整个 deadline。sidecar 启动早期主线程被 pin 在这里 5-10 分钟,Next
//   server listen 但不处理请求 = webview 白屏。**修**:①设 fd 为 non-blocking(fcntl F_SETFL O_NONBLOCK)
//   开 fd 时就设,即便 Windows 也生效(Node.js libuv 抽象);②失败降级:硬顶单次 read 用短 timeout wrapper
//   (setTimeoutSync 不存在,用 spawn 独立线程 + AbortController 兜底)。最实用做法:**改 fs.read
//   with callback + Promise.race + timeout,不用 readSync**——彻底解耦 event loop 阻塞。
function readMasterKeyFromFd(fd: number): string {
  const cached = fdKeyCache.get(fd);
  if (cached !== undefined) return cached;
  // [T-460 2026-07-22] Windows tauri-plugin-shell 短路:该场景 fd 0 不是真 stdin pipe,而是
  //   tauri-plugin-shell 的 IPC 抽象——CommandChild.write 通过 IPC 通道发字节,不落到 sidecar
  //   的 fd 0 上,故 readSync(fd 0) 会**阻塞等真 stdin 输入**(数十秒/永远,取决 Node 内 fd 0 是否
  //   attached to console)。真机实证:sidecar 启动早期主线程被 pin 6+ 分钟,Next server listen
  //   却不处理请求 → webview 白屏。修:Windows 直接不走 fd 通道,让上层降到文件兜底(T-425 已在)。
  //   mac/Linux 分支下 Rust 用 std::process::Command::stdin + write_all + drop(close),fd 0 是真
  //   pipe,readSync EAGAIN 语义正常 —— 保留有界读取循环。
  if (process.platform === "win32") {
    fdKeyCache.set(fd, ""); // 缓存空,不再重试;上层会走 CREATOROS_MASTER_KEY_FILE 文件兜底
    return "";
  }
  const bytes: number[] = [];
  const one = Buffer.alloc(1);
  const deadline = Date.now() + executionTimeoutMs();
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
    if (n === 0) break; // 真 EOF：已关闭的管道不会再来数据，立即走原兜底。
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

// [T-425] `.master-key` 文件兜底 —— 与 Rust 壳 `src-tauri/src/lib.rs` 的
//   `deobfuscate_master_key_file`/`master_key_keystream_xor` **逐字节同算法**:
//     v2 格式 = `v2:` + base64( nonce[16] ‖ (明文base64key XOR keystream) );
//     keystream 块 = SHA-256( SALT ‖ machineSeed ‖ nonce ‖ counter(LE u32) ),counter 从 0。
//   动机(SPEC 根修):master key 原本**只**经 fd(ChildStdin)注入 sidecar,fd 竞态失败(T-408
//   实测 ~1/4)→ sidecar 退随机 dev key → 授权/模型密钥/登录态/激活码**全部解不开**(静默失效)。
//   这里给 sidecar 一条与 Rust 同源的稳定兜底:fd/env 都拿不到时,自己反混淆同一份 `.master-key`。
//   machineSeed = `machine_uid::get()`(硬件 UUID,任何本机进程 `ioreg` 可得,**非机密**),由 Rust
//   经 env `CREATOROS_MACHINE_SEED` 注入;文件路径经 env `CREATOROS_MASTER_KEY_FILE` 注入。
const MASTER_KEY_FILE_SALT = Buffer.from("creatoros-master-key-file-v2");

function masterKeyKeystreamXor(
  data: Buffer,
  machineSeed: string,
  nonce: Buffer,
): void {
  const seedBuf = Buffer.from(machineSeed, "utf8");
  let counter = 0;
  let i = 0;
  while (i < data.length) {
    const ctr = Buffer.alloc(4);
    ctr.writeUInt32LE(counter, 0);
    const block = createHash("sha256")
      .update(MASTER_KEY_FILE_SALT)
      .update(seedBuf)
      .update(nonce)
      .update(ctr)
      .digest();
    for (let j = 0; j < block.length && i < data.length; j++, i++) {
      data[i] = data[i]! ^ block[j]!;
    }
    counter += 1;
  }
}

/** @internal 反混淆 `.master-key` 内容 → 明文 base64 key 串(与 Rust 同算法)。抽出供单测。 */
export function deobfuscateMasterKeyFile(
  stored: string,
  machineSeed: string,
): string | null {
  const s = stored.trim();
  if (!s.startsWith("v2:")) {
    // 存量明文(无前缀,老版本直接写 base64 key)→ 原样返回,调用方 toKeyResult 再校验 32B。
    return s || null;
  }
  let packed: Buffer;
  try {
    packed = Buffer.from(s.slice(3), "base64");
  } catch {
    return null;
  }
  if (packed.length < 16) return null;
  const nonce = packed.subarray(0, 16);
  const body = Buffer.from(packed.subarray(16));
  masterKeyKeystreamXor(body, machineSeed, nonce);
  const out = body.toString("utf8").trim();
  return out || null;
}

// 从 Rust 注入的 `.master-key` 反混淆读 master key(base64 串)。env 任一缺 / 文件读不到 /
//   反混淆失败 → 返回空串(上层继续降级)。machineSeed 允许空串(headless;与 Rust
//   `machine_uid::get().unwrap_or_default()` 一致),故只判 undefined 不判空。
function readMasterKeyFromFile(
  env: Record<string, string | undefined>,
): string {
  const filePath = env.CREATOROS_MASTER_KEY_FILE?.trim();
  const seed = env.CREATOROS_MACHINE_SEED;
  if (!filePath || seed === undefined) return "";
  let raw: string;
  try {
    raw = readFileSync(filePath, "utf8");
  } catch {
    return "";
  }
  return deobfuscateMasterKeyFile(raw, seed) ?? "";
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

  // ②.5 [T-425] `.master-key` 文件兜底(桌面端根修):fd 竞态/挂起拿不到 key 时,与 Rust 同源
  //   反混淆同一份 `.master-key` 拿真 key —— fd 注入从此不再是单点,授权/模型密钥/登录态/激活码
  //   不会因偶发 fd 失败而集体解不开。dev / web 无 Rust 注入这两个 env → 兜底自然休眠(零影响)。
  const fileRes = toKeyResult(
    readMasterKeyFromFile(env),
    "file",
    ".master-key 文件兜底",
  );
  if (fileRes) return fileRes;

  // ③ 降级(dev 或无 keychain 的 web)。不抛,保证 app 不崩。
  console.warn(
    "[secret-crypto] 未取到 master key(fd 通道 / CREATOROS_MASTER_KEY / .master-key 文件兜底均" +
      "缺失或非法)—— 使用开发降级 key。桌面端应由 Tauri 经 ChildStdin 或文件兜底提供;此降级弱于 keychain。",
  );
  return { key: DEV_FALLBACK_KEY, source: "dev-fallback", degraded: true };
}
