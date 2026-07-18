//! T-259 桌面日志系统 —— sidecar stdout/stderr tee 落盘 + 脱敏 + 轮转。
//!
//! 背景:打包 app 的 sidecar 日志此前只 `eprintln!` 给 app stderr,`open -a` 打包态
//! 全丢 —— 真实用户撞 bug(如 favorites ZodError)开发者拿不到日志没法排障。sidecar 的
//! stderr 管道能抓到 Next.js 未捕获错误,故在 Rust 读取循环处**同时** tee 到
//! `appDataDir/logs/sidecar.log` 是最全的捕获点。
//!
//! 本模块提供四件事,均为可单测的纯逻辑 + 薄封装:
//!   ① [`redact_log_line`] —— 落盘前对每行过一遍脱敏(遮机密,master key / cookie /
//!      token / authorization 等绝不明文落日志);纯函数,大量单测覆盖各机密模式。
//!   ② [`format_rfc3339_utc`] —— 无第三方 time 依赖的 UTC RFC3339 时间戳(civil-from-days
//!      算法);每行日志带 `[时间戳] [通道]` 前缀。
//!   ③ [`SidecarLogger`] + [`init_sidecar_logger`] —— 共享**加密**写入器(`Arc<Mutex<EncState>>`,
//!      两读取线程 clone 同一把,Mutex 串行化写,避免交错写坏行 + 保证 AEAD nonce counter 不复用)+
//!      启动轮转(`sidecar.log.enc` → `sidecar.prev.log.enc`,只留当前 + 上一次会话两份)。
//!   ④ [`decrypt_log`] —— 开发者侧解密(供 `creatoros-logdec` bin 复用),按 key_id 匹配私钥、
//!      解会话密钥、逐帧解;尾部截断/损坏时输出已解全部行且不 panic(部分可解密)。
//!
//! T-391 H-log 加密日志(framed hybrid,SPEC §5):落盘从明文改**非对称信封加密**。每个日志
//! 文件生成随机 32B `session_key`;临时 X25519 密钥对与**内嵌开发者公钥** ECDH → HKDF-SHA256
//! 派生 `K_wrap` → AES-256-GCM 包裹 `session_key` 写进 HEADER(一次);正文每次 flush 一帧
//! `AES-256-GCM(session_key, nonce=counter||0x00, aad=counter, 脱敏后一行)`。机器内**无任何解密
//! 秘密**(只内嵌开发者公钥),攻击者拿到日志文件只是密文。脱敏(`redact_log_line`)在加密**前**
//! 跑,二者正交叠加(纵深):私钥若失守,脱敏仍是最后一道墙。
//!
//! 诚实降级:内嵌公钥占位空串(用户后续用 `creatoros-logkeygen` 生成填入);公钥为空/无效 →
//! **全降级为不写日志**(宁缺毋滥,绝不悄悄明文,不破坏机密性承诺)。

use std::fs::{self, File, OpenOptions};
use std::io::{BufWriter, Write};
use std::path::Path;
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

use aes_gcm::aead::{Aead, KeyInit, Payload};
use aes_gcm::{Aes256Gcm, Nonce};
use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine;
use hkdf::Hkdf;
use rand::rngs::OsRng;
use rand::RngCore;
use sha2::{Digest, Sha256};
use x25519_dalek::{EphemeralSecret, PublicKey, StaticSecret};

// ---------------------------------------------------------------------------
// T-391 加密日志封包格式(framed hybrid,SPEC §5)
// ---------------------------------------------------------------------------
//
// 文件 = HEADER || FRAME*
// HEADER(写一次):
//   magic(6B) | recip_count(u8) | wrap_block[]{ key_id(4B) | eph_pubkey(32B) | wrap_nonce(12B) | wrapped_key(48B=32ct+16tag) }
//   K_wrap = HKDF-SHA256(ikm = X25519(eph_priv, dev_pubkey), info = "creatoros-log-v1|" + key_id)
// FRAME(每 flush append):
//   len(u32 LE) | ct = AES-256-GCM(session_key, nonce = counter(u64 LE) || 0x00×4, aad = counter(u64 LE), plaintext = 脱敏后一整行)
//
// 说明(与 SPEC §5 的偏差,见交付报告):SPEC §5 magic 字面量写作 `"CRLOG\x01"` 并注「(7B)」,
// 但该字面量实际是 6 字节(C R L O G + 0x01);"(7B)" 系其自身的字节计数笔误。此处以**字面量为准**
// 用 6 字节 magic。`counter||0x00`:counter 取 u64 LE(8B)后补 4×0x00 凑满 AES-GCM 的 12B nonce;
// aad 取同一 counter 的 u64 LE(8B)。

/// HEADER 魔数:`"CRLOG" + 0x01`(6 字节,版本 1)。见上方偏差说明。
const MAGIC: &[u8] = b"CRLOG\x01";
/// HKDF info 前缀;后接 4B `key_id` 做域分离(不同收件人派生不同 `K_wrap`)。
const HKDF_INFO_PREFIX: &[u8] = b"creatoros-log-v1|";
/// 单个 wrap_block 字节长度:key_id(4) + eph_pubkey(32) + wrap_nonce(12) + wrapped_key(48)。
const WRAP_BLOCK_LEN: usize = 4 + 32 + 12 + 48;

/// **内嵌开发者 X25519 日志公钥**(standard-base64 编码的 32B raw 公钥)。
///
/// 占位空串 —— 用户后续用 `creatoros-logkeygen` 生成密钥对,把打印出的公钥 base64 填进本数组
/// (私钥文件自己冷备,**从不进 app**)。支持多个(多开发者 / 轮换):同 `session_key` 用每个
/// 公钥各包一次 wrap_block,任一私钥可解;`key_id=sha256(pubkey)[:4]` 选钥。
///
/// **全为空 / 全无效 → [`init_sidecar_logger`] 返回 `None`,全降级为不写日志**(诚实,不假装加密)。
const DEV_LOG_PUBKEYS_B64: &[&str] = &[
    // 例:"kQf3...=="(用户生成后填入;为空则本次会话不落盘日志)
    "",
];

/// 一个收件人(开发者)= 其公钥 + 由公钥派生的 4B `key_id`。
struct Recipient {
    pubkey: PublicKey,
    key_id: [u8; 4],
}

/// `key_id = sha256(pubkey)[:4]` —— 用于 HEADER 里定位「哪个私钥能解这块」。
fn key_id_of(pubkey_bytes: &[u8; 32]) -> [u8; 4] {
    let d = Sha256::digest(pubkey_bytes);
    [d[0], d[1], d[2], d[3]]
}

/// 从 base64 公钥串解析一个收件人;空串 / 非法 base64 / 长度≠32 → `None`(用于全降级判定)。
fn recipient_from_b64(s: &str) -> Option<Recipient> {
    let t = s.trim();
    if t.is_empty() {
        return None;
    }
    let bytes = B64.decode(t).ok()?;
    let arr: [u8; 32] = bytes.try_into().ok()?;
    Some(Recipient {
        key_id: key_id_of(&arr),
        pubkey: PublicKey::from(arr),
    })
}

/// 解析内嵌公钥数组为收件人列表(过滤掉空/无效项)。空 → 全降级。
fn embedded_recipients() -> Vec<Recipient> {
    DEV_LOG_PUBKEYS_B64
        .iter()
        .filter_map(|s| recipient_from_b64(s))
        .collect()
}

/// `K_wrap = HKDF-SHA256(ikm = ECDH 共享秘密, salt = 无, info = "creatoros-log-v1|" + key_id)`。
fn derive_wrap_key(ikm: &[u8], key_id: &[u8; 4]) -> [u8; 32] {
    let hk = Hkdf::<Sha256>::new(None, ikm);
    let mut info = Vec::with_capacity(HKDF_INFO_PREFIX.len() + 4);
    info.extend_from_slice(HKDF_INFO_PREFIX);
    info.extend_from_slice(key_id);
    let mut okm = [0u8; 32];
    // 32B OKM 远小于 HKDF-SHA256 上限(255*32),不会失败。
    hk.expand(&info, &mut okm)
        .expect("32-byte OKM 对 HKDF-SHA256 恒合法");
    okm
}

/// 第 `counter` 帧的 12B AES-GCM nonce:`counter(u64 LE)(8B) || 0x00×4`。counter 由
/// [`EncState`] 在 `Arc<Mutex<>>` 下串行单调递增,保证同一 `session_key` 下 nonce 绝不复用。
fn frame_nonce(counter: u64) -> [u8; 12] {
    let mut n = [0u8; 12];
    n[..8].copy_from_slice(&counter.to_le_bytes());
    n
}

/// 封一帧:`len(u32 LE) | AES-256-GCM(session_key, nonce=counter, aad=counter, plaintext)`,返回该帧字节。
/// 流式写(`write_frame`)与批量编码(`encrypt_lines`)共用此函数,保证封包格式单一真相、绝不漂移。
fn seal_frame(cipher: &Aes256Gcm, counter: u64, plaintext: &[u8]) -> Option<Vec<u8>> {
    let ct = cipher
        .encrypt(
            Nonce::from_slice(&frame_nonce(counter)),
            Payload {
                msg: plaintext,
                aad: &counter.to_le_bytes(),
            },
        )
        .ok()?;
    let mut buf = Vec::with_capacity(4 + ct.len());
    buf.extend_from_slice(&u32::try_from(ct.len()).ok()?.to_le_bytes());
    buf.extend_from_slice(&ct);
    Some(buf)
}

/// (开发者/测试用)把若干明文行加密成完整 `.enc` 字节流(HEADER + 每行一帧),用给定 X25519 公钥。
/// 生产落盘走 [`SidecarLogger`](流式,每 flush 一帧);此函数供 `creatoros-logdec` 的 `encrypt`
/// 子命令与测试造夹具复用**同一封包逻辑**(经 [`build_header`]/[`seal_frame`],与流式路径零漂移)。
/// 无有效公钥或任一 AEAD 步失败 → `None`。
pub fn encrypt_lines(pubkeys: &[[u8; 32]], lines: &[&[u8]]) -> Option<Vec<u8>> {
    let recipients: Vec<Recipient> = pubkeys
        .iter()
        .map(|pk| Recipient {
            key_id: key_id_of(pk),
            pubkey: PublicKey::from(*pk),
        })
        .collect();
    if recipients.is_empty() {
        return None;
    }
    let mut session_key = [0u8; 32];
    OsRng.fill_bytes(&mut session_key);
    let mut out = build_header(&session_key, &recipients)?;
    let cipher = Aes256Gcm::new_from_slice(&session_key).ok()?;
    for (i, line) in lines.iter().enumerate() {
        out.extend_from_slice(&seal_frame(&cipher, i as u64, line)?);
    }
    session_key.iter_mut().for_each(|b| *b = 0);
    Some(out)
}

/// 组装 HEADER:magic + recip_count + 每个收件人一个 wrap_block(临时 ECDH 包裹同一 `session_key`)。
/// 任一 AEAD/长度异常 → `None`(上层全降级不落盘)。
fn build_header(session_key: &[u8; 32], recipients: &[Recipient]) -> Option<Vec<u8>> {
    let mut out = Vec::with_capacity(MAGIC.len() + 1 + recipients.len() * WRAP_BLOCK_LEN);
    out.extend_from_slice(MAGIC);
    out.push(u8::try_from(recipients.len()).ok()?);
    for r in recipients {
        // 每个收件人一对**临时** X25519 密钥;先取公钥再消费私钥做 ECDH。
        let eph_secret = EphemeralSecret::random_from_rng(OsRng);
        let eph_pub = PublicKey::from(&eph_secret);
        let shared = eph_secret.diffie_hellman(&r.pubkey);
        let k_wrap = derive_wrap_key(shared.as_bytes(), &r.key_id);

        let cipher = Aes256Gcm::new_from_slice(&k_wrap).ok()?;
        let mut wrap_nonce = [0u8; 12];
        OsRng.fill_bytes(&mut wrap_nonce);
        let wrapped = cipher
            .encrypt(
                Nonce::from_slice(&wrap_nonce),
                Payload {
                    msg: session_key,
                    aad: &[],
                },
            )
            .ok()?;
        if wrapped.len() != 48 {
            return None; // 32B session_key + 16B tag = 48B,恒等式不成立说明库异常
        }
        out.extend_from_slice(&r.key_id);
        out.extend_from_slice(eph_pub.as_bytes());
        out.extend_from_slice(&wrap_nonce);
        out.extend_from_slice(&wrapped);
    }
    Some(out)
}

// ---------------------------------------------------------------------------
// SidecarLogger —— 共享加密写入器(两读取线程 clone 同一把)
// ---------------------------------------------------------------------------

/// 加密写入器内部状态:`session_key` 装进 `cipher`(不再单独持有明文密钥),`counter` 单调递增
/// 供每帧 nonce。`Arc<Mutex<>>` 串行化写入 + 保证 nonce 不复用。
struct EncState {
    file: BufWriter<File>,
    cipher: Aes256Gcm,
    counter: u64,
}

impl EncState {
    /// 写一帧:`len(u32 LE) | AES-256-GCM(session_key, nonce=counter, aad=counter, plaintext)`,立即 flush。
    /// **counter 仅在整帧成功写盘 + flush 后才 +1** —— 解密侧靠帧序号(0,1,2…)重建 counter,故写盘失败
    /// 时绝不推进(下一帧复用同一 counter,不产生序号空洞)。任一步失败吞掉丢该行(best-effort,绝不崩)。
    fn write_frame(&mut self, plaintext: &[u8]) -> Option<()> {
        let frame = seal_frame(&self.cipher, self.counter, plaintext)?;
        self.file.write_all(&frame).ok()?;
        self.file.flush().ok()?;
        self.counter = self.counter.checked_add(1)?;
        Some(())
    }
}

/// 共享加密日志写入器。stdout / stderr 两个读取线程 clone 同一把 `Arc`,内部 `Mutex` 串行化写入
/// (避免两线程交错写坏帧 + 保证 AEAD nonce counter 不复用)。每帧写完立刻 `flush` —— 排障场景
/// 「崩溃时最后几帧也要落盘」比吞吐更重要,丢的仅未 flush 那一行(与原明文实现同等保证)。
#[derive(Clone)]
pub struct SidecarLogger {
    inner: Arc<Mutex<EncState>>,
}

impl SidecarLogger {
    /// 写一行:脱敏 → 加一帧密文。channel 形如 `sidecar`(stdout)/ `sidecar:err`(stderr)/ `shell`。
    /// **脱敏在加密前**(顺序不动):`redact_log_line` 遮掉永不该存在的机密,加密再护住正文。
    /// 锁中毒或写失败一律吞掉(日志 best-effort,绝不因落盘失败拖垮主流程)。
    pub fn log(&self, channel: &str, line: &str) {
        // 注意:帧内不含结尾 `\n`(每帧即一行);解密器逐帧输出时补 `\n`。
        let stamped = format!(
            "[{}] [{}] {}",
            format_rfc3339_utc_now(),
            channel,
            redact_log_line(line)
        );
        if let Ok(mut st) = self.inner.lock() {
            let _ = st.write_frame(stamped.as_bytes());
        }
    }
}

/// 用给定收件人开一个加密写入器:生成随机 `session_key` → 写 HEADER → 建 `cipher`。
/// 任一步失败 → `None`(上层全降级)。session_key 用后就地清零(best-effort)。
fn open_encrypted_writer(mut file: File, recipients: &[Recipient]) -> Option<EncState> {
    let mut session_key = [0u8; 32];
    OsRng.fill_bytes(&mut session_key);
    let header = build_header(&session_key, recipients)?;
    // HEADER 直接写底层 File 并 flush,再交给 BufWriter 接管后续帧。
    file.write_all(&header).ok()?;
    file.flush().ok()?;
    let cipher = Aes256Gcm::new_from_slice(&session_key).ok()?;
    session_key.iter_mut().for_each(|b| *b = 0); // best-effort zeroize
    Some(EncState {
        file: BufWriter::new(file),
        cipher,
        counter: 0,
    })
}

/// 初始化 sidecar **加密**日志:校验内嵌公钥 → 建 `logs/` → 轮转上次会话 → 开新 `sidecar.log.enc` +
/// 写 HEADER。
///
/// 轮转策略(防无限增长,只留两份):每次 app 启动把上次的 `sidecar.log.enc` 改名
/// `sidecar.prev.log.enc`(覆盖更旧的 prev),再全新开 `sidecar.log.enc`。
///
/// **全降级(诚实,SPEC §5)**:内嵌公钥为空/无效 → 返回 `None`(不写日志,绝不明文);建目录/开文件/
/// 写 HEADER 失败 → 同样 `None`。调用方(`lib.rs`)对 `None` 降级为不落盘。
pub fn init_sidecar_logger(logs_dir: &Path) -> Option<SidecarLogger> {
    let recipients = embedded_recipients();
    if recipients.is_empty() {
        eprintln!(
            "[shell] 加密日志开发者公钥未配置/无效 —— 诚实全降级:本次会话不落盘日志(避免明文泄露)"
        );
        return None;
    }
    if let Err(e) = fs::create_dir_all(logs_dir) {
        eprintln!("[shell] 建日志目录失败 {}: {e}", logs_dir.display());
        return None;
    }
    let current = logs_dir.join("sidecar.log.enc");
    let prev = logs_dir.join("sidecar.prev.log.enc");
    // 轮转:上次会话的 sidecar.log.enc → sidecar.prev.log.enc(先删更旧的 prev 再改名)。
    if current.exists() {
        let _ = fs::remove_file(&prev);
        let _ = fs::rename(&current, &prev);
    }
    // truncate:即便上面 rename 失败(current 仍在),也保证本次会话从空文件起(不追加旧密文)。
    let file = match OpenOptions::new()
        .create(true)
        .write(true)
        .truncate(true)
        .open(&current)
    {
        Ok(f) => f,
        Err(e) => {
            eprintln!("[shell] 开日志文件失败 {}: {e}", current.display());
            return None;
        }
    };
    match open_encrypted_writer(file, &recipients) {
        Some(st) => Some(SidecarLogger {
            inner: Arc::new(Mutex::new(st)),
        }),
        None => {
            eprintln!("[shell] 加密日志初始化失败(信封组装) —— 全降级不落盘");
            None
        }
    }
}

// ---------------------------------------------------------------------------
// 解密(开发者侧,供 `creatoros-logdec` bin 复用)
// ---------------------------------------------------------------------------

/// 解密失败原因(结构化,供 CLI 区分退出码:这些都是「0 字节可读」的硬失败)。
#[derive(Debug, PartialEq, Eq)]
pub enum DecryptError {
    /// 魔数不匹配 / 文件过短:不是本格式的加密日志。
    BadMagic,
    /// HEADER 结构不完整(recip_count 或 wrap_block 被截断):无法取会话密钥。
    HeaderTruncated,
    /// HEADER 完整但无一 wrap_block 的 key_id 匹配本私钥(私钥错误/缺失)。
    NoMatchingKey,
    /// key_id 匹配但会话密钥 AEAD 解包失败(文件损坏)。
    WrapDecryptFailed,
}

/// 解密结果:已成功解出的各帧明文(脱敏后原始字节)+ 是否因尾部截断/损坏提前停止。
#[derive(Debug)]
pub struct DecryptOutcome {
    /// 逐帧解出的明文(不含结尾 `\n`;CLI 输出时每行补 `\n`)。
    pub lines: Vec<Vec<u8>>,
    /// `true` = 遇半截帧 / tag 失败提前停止(前面的行已全部解出,**部分可解密**);`false` = 干净读完。
    pub truncated: bool,
}

/// 解密一个 `.enc` 日志:校验 magic → 按 `key_id` 匹配私钥 → ECDH+HKDF 解会话密钥 → 逐帧解。
///
/// **部分可解密(SPEC §5 硬约束)**:遇半截帧(len 或 ct 不够)/ AEAD tag 失败 → 停在此处,返回已成功
/// 解出的**全部**前序行且 `truncated=true`,**绝不 panic**。私钥不匹配/缺失 → `Err`(CLI 0 字节输出)。
pub fn decrypt_log(data: &[u8], private_key: &[u8; 32]) -> Result<DecryptOutcome, DecryptError> {
    if data.len() < MAGIC.len() || &data[..MAGIC.len()] != MAGIC {
        return Err(DecryptError::BadMagic);
    }
    let mut pos = MAGIC.len();
    if pos >= data.len() {
        return Err(DecryptError::HeaderTruncated);
    }
    let recip_count = data[pos] as usize;
    pos += 1;

    let secret = StaticSecret::from(*private_key);
    let our_pub = PublicKey::from(&secret);
    let our_key_id = key_id_of(our_pub.as_bytes());

    let mut session_key: Option<[u8; 32]> = None;
    for _ in 0..recip_count {
        if pos + WRAP_BLOCK_LEN > data.len() {
            return Err(DecryptError::HeaderTruncated);
        }
        let block = &data[pos..pos + WRAP_BLOCK_LEN];
        pos += WRAP_BLOCK_LEN;
        // 已找到会话密钥后仍需继续步进 pos 到帧区起点,但不必再解。
        if session_key.is_none() && block[0..4] == our_key_id {
            let eph_pub_bytes: [u8; 32] = block[4..36].try_into().expect("32B slice");
            let wrap_nonce = &block[36..48];
            let wrapped = &block[48..96];
            let eph_pub = PublicKey::from(eph_pub_bytes);
            let shared = secret.diffie_hellman(&eph_pub);
            let k_wrap = derive_wrap_key(shared.as_bytes(), &our_key_id);
            let cipher =
                Aes256Gcm::new_from_slice(&k_wrap).map_err(|_| DecryptError::WrapDecryptFailed)?;
            let sk = cipher
                .decrypt(
                    Nonce::from_slice(wrap_nonce),
                    Payload {
                        msg: wrapped,
                        aad: &[],
                    },
                )
                .map_err(|_| DecryptError::WrapDecryptFailed)?;
            let sk: [u8; 32] = sk.try_into().map_err(|_| DecryptError::WrapDecryptFailed)?;
            session_key = Some(sk);
        }
    }
    let session_key = session_key.ok_or(DecryptError::NoMatchingKey)?;
    let cipher =
        Aes256Gcm::new_from_slice(&session_key).map_err(|_| DecryptError::WrapDecryptFailed)?;

    let mut lines: Vec<Vec<u8>> = Vec::new();
    let mut counter: u64 = 0;
    let mut truncated = false;
    while pos < data.len() {
        if pos + 4 > data.len() {
            truncated = true; // len 头被截断
            break;
        }
        let len = u32::from_le_bytes(data[pos..pos + 4].try_into().expect("4B slice")) as usize;
        pos += 4;
        if pos + len > data.len() {
            truncated = true; // ct 体被截断
            break;
        }
        let ct = &data[pos..pos + len];
        pos += len;
        let nonce_bytes = frame_nonce(counter);
        let aad = counter.to_le_bytes();
        match cipher.decrypt(
            Nonce::from_slice(&nonce_bytes),
            Payload { msg: ct, aad: &aad },
        ) {
            Ok(pt) => {
                lines.push(pt);
                counter += 1;
            }
            Err(_) => {
                truncated = true; // tag 失败 = 帧损坏,停在此处
                break;
            }
        }
    }
    Ok(DecryptOutcome { lines, truncated })
}

// ---------------------------------------------------------------------------
// 脱敏(best-effort 纯函数)
// ---------------------------------------------------------------------------

/// 机密关键词命中后紧随其后的「值」用 `***REDACTED***` 遮盖。分两档:
///   · **tier1(always)**:高信号关键词(authorization / cookie / sessionid / password /
///     master_key / bearer / api_key / access_token …)→ 值无论长短一律遮(cookie/JWT 都不长也危险)。
///   · **tier2(仅长串)**:泛化关键词(token / secret / key / credential)→ 仅当值是 ≥32 位
///     的 hex/base64 串时才遮 —— 避免误遮 `"tokens": 1523`(LLM token 计数)这类正常日志。
///
/// 关键词按「长度降序」匹配以优先命中更具体的(`access_token` 优先于 `token`)。要求关键词
/// 前后都是**词边界**(非 `[A-Za-z0-9]`),避免 `mytoken` / `tokens` 这类子串误命中。
///
/// 铁律:宁可多遮不可泄露;但对泛化词做了长串约束以保日志可读性。master key 明文由「上游
/// 从不打印 key 值」+ 本函数对 `master_key=` 值兜底双保险。
const TIER1_KEYWORDS: &[&str] = &[
    "authorization",
    "proxy-authorization",
    "set-cookie",
    "cookie",
    "sessionid",
    "session_id",
    "session-id",
    "x-api-key",
    "api_key",
    "api-key",
    "apikey",
    "access_token",
    "access-token",
    "refresh_token",
    "refresh-token",
    "id_token",
    "password",
    "passwd",
    "pwd",
    "master_key",
    "master-key",
    "masterkey",
    "secret_key",
    "secret-key",
    "private_key",
    "private-key",
    "bearer",
];

const TIER2_KEYWORDS: &[&str] = &["credential", "secret", "token", "key"];

/// 认证方案前缀:`Authorization: Bearer <jwt>` 里,值以 `Bearer ` 打头,真正的机密在其后。
/// 命中关键词后跳过这些前缀词(连同其后的分隔符),再对真正的值遮盖,避免只遮了 `Bearer`
/// 却把 JWT 明文留下。
const SCHEME_PREFIXES: &[&str] = &["bearer", "basic", "token"];

/// 词边界判定:ASCII 字母 / 数字算「词内」,其余(含 `_`、`-`、`:`、空格、多字节 UTF-8 起始/续
/// 字节 ≥0x80)都算边界。用 ASCII 判定即可 —— 关键词全 ASCII,中文等多字节字符每个字节都 ≥0x80,
/// 绝不与 ASCII 关键词碰撞。
fn is_word_byte(b: u8) -> bool {
    b.is_ascii_alphanumeric()
}

/// key 与 value 之间的分隔符(冒号 / 等号 / 空格 / 引号 / tab)。遮盖前先跳过这些并原样保留。
fn is_separator(b: u8) -> bool {
    matches!(b, b':' | b'=' | b' ' | b'\t' | b'"' | b'\'')
}

/// 值的终止符:遇到这些即认为一个机密值结束(空白 / 分号 / 逗号 / 引号 / 括号等)。
/// 其余(含 `.` `/` `+` `-` `_` `=`)都算值的一部分 —— 这样 JWT(含 `.`)、base64(含 `+/=`)
/// 会被完整消费遮掉。
fn is_value_terminator(b: u8) -> bool {
    matches!(
        b,
        b' ' | b'\t'
            | b'\n'
            | b'\r'
            | b';'
            | b','
            | b'"'
            | b'\''
            | b'&'
            | b')'
            | b'('
            | b'}'
            | b'{'
            | b']'
            | b'['
            | b'<'
            | b'>'
            | b'|'
            | b'`'
    )
}

/// 在 `bytes[i..]` 起点尝试匹配一个关键词(ASCII 大小写不敏感 + 前后词边界)。
/// 返回 `(关键词字节长度, always_mask)`;取「最长匹配」以优先更具体的关键词。
fn match_keyword_at(bytes: &[u8], i: usize) -> Option<(usize, bool)> {
    // 前边界:i==0 或前一字节非词内字节。
    if i > 0 && is_word_byte(bytes[i - 1]) {
        return None;
    }
    let mut best: Option<(usize, bool)> = None;
    for (kw, always) in TIER1_KEYWORDS
        .iter()
        .map(|k| (*k, true))
        .chain(TIER2_KEYWORDS.iter().map(|k| (*k, false)))
    {
        let kb = kw.as_bytes();
        let end = i + kb.len();
        if end > bytes.len() {
            continue;
        }
        // ASCII 大小写不敏感逐字节比较。
        if !bytes[i..end]
            .iter()
            .zip(kb)
            .all(|(a, b)| a.eq_ignore_ascii_case(b))
        {
            continue;
        }
        // 后边界:关键词后一字节非词内字节(排除 `tokens` 命中 `token`)。
        if end < bytes.len() && is_word_byte(bytes[end]) {
            continue;
        }
        // 取最长匹配(access_token 优先 token)。
        if best.map(|(len, _)| kb.len() > len).unwrap_or(true) {
            best = Some((kb.len(), always));
        }
    }
    best
}

/// 判断某个值是否该在 tier2(泛化关键词)下遮盖:值是 ≥32 位、且全为 hex/base64 允许字符
/// (`A-Za-z0-9 + / = _ -`)的串才算机密,否则放行(保住 `token: 3` 这类正常日志)。
fn is_long_secret_value(val: &[u8]) -> bool {
    val.len() >= 32
        && val
            .iter()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'+' | b'/' | b'=' | b'_' | b'-'))
}

/// 尝试在 `bytes[j..]` 跳过一个认证方案前缀词(如 `Bearer`)+ 其后分隔符;返回跳过后的新位置。
/// 未命中前缀 → 原样返回 j。命中的前缀词与分隔符会被 append 到 `out`(原样保留,不遮)。
fn skip_scheme_prefix(bytes: &[u8], mut j: usize, out: &mut Vec<u8>) -> usize {
    for scheme in SCHEME_PREFIXES {
        let sb = scheme.as_bytes();
        let end = j + sb.len();
        if end <= bytes.len()
            && bytes[j..end].iter().zip(sb).all(|(a, b)| a.eq_ignore_ascii_case(b))
            && (end == bytes.len() || !is_word_byte(bytes[end]))
        {
            out.extend_from_slice(&bytes[j..end]);
            j = end;
            while j < bytes.len() && is_separator(bytes[j]) {
                out.push(bytes[j]);
                j += 1;
            }
            return j;
        }
    }
    j
}

/// 脱敏纯函数:遮盖行内机密值,返回脱敏后的新串。见 [`TIER1_KEYWORDS`] / [`TIER2_KEYWORDS`] 档位说明。
/// 无副作用、无 I/O —— 可单测(见文件底部 `mod tests`)。
pub fn redact_log_line(line: &str) -> String {
    let bytes = line.as_bytes();
    let mut out: Vec<u8> = Vec::with_capacity(bytes.len() + 16);
    let mut i = 0;
    while i < bytes.len() {
        if let Some((kw_len, always)) = match_keyword_at(bytes, i) {
            // ① 原样拷贝关键词本身。
            out.extend_from_slice(&bytes[i..i + kw_len]);
            let mut j = i + kw_len;
            // ② 跳过 key/value 分隔符(原样保留)。
            while j < bytes.len() && is_separator(bytes[j]) {
                out.push(bytes[j]);
                j += 1;
            }
            // ③ 跳过认证方案前缀(如 Bearer),原样保留,让真正的值暴露给下一步。
            j = skip_scheme_prefix(bytes, j, &mut out);
            // ④ 提取值 run:消费到下一个终止符(或行尾)。终止符全是 ASCII(<0x80),而 UTF-8 多字节
            //   字符的每个字节都 ≥0x80,故循环只会停在 ASCII 终止符或行尾 —— 都是字符边界,不会切坏
            //   多字节字符;值里含中文/多字节也会被整段消费遮盖(宁可多遮)。
            let val_start = j;
            let mut k = j;
            while k < bytes.len() && !is_value_terminator(bytes[k]) {
                k += 1;
            }
            let val = &bytes[val_start..k];
            if !val.is_empty() && (always || is_long_secret_value(val)) {
                out.extend_from_slice(b"***REDACTED***");
            } else {
                out.extend_from_slice(val);
            }
            i = k;
        } else {
            out.push(bytes[i]);
            i += 1;
        }
    }
    // out 始终是合法 UTF-8(只在 ASCII 边界切割 + 遮盖串是 ASCII),lossy 只作兜底。
    String::from_utf8_lossy(&out).into_owned()
}

// ---------------------------------------------------------------------------
// RFC3339 时间戳(无第三方 time 依赖)
// ---------------------------------------------------------------------------

/// 当前时刻的 UTC RFC3339 串(用 `SystemTime`)。时钟异常(早于 epoch)→ 兜底 epoch。
fn format_rfc3339_utc_now() -> String {
    let dur = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    format_rfc3339_utc(dur.as_secs(), dur.subsec_millis())
}

/// 把 Unix 秒 + 毫秒格式化成 UTC RFC3339:`YYYY-MM-DDTHH:MM:SS.mmmZ`。
/// 用 Howard Hinnant 的 civil-from-days 算法(无闰秒、格里高利历),纯计算、可单测。
pub fn format_rfc3339_utc(secs: u64, millis: u32) -> String {
    let days = (secs / 86_400) as i64;
    let rem = secs % 86_400;
    let (y, m, d) = civil_from_days(days);
    let hh = rem / 3_600;
    let mm = (rem % 3_600) / 60;
    let ss = rem % 60;
    format!("{y:04}-{m:02}-{d:02}T{hh:02}:{mm:02}:{ss:02}.{millis:03}Z")
}

/// days(自 1970-01-01 起的天数)→ (year, month[1..12], day[1..31])。
/// 参考 http://howardhinnant.github.io/date_algorithms.html#civil_from_days
fn civil_from_days(z: i64) -> (i64, u32, u32) {
    let z = z + 719_468;
    let era = (if z >= 0 { z } else { z - 146_096 }) / 146_097;
    let doe = (z - era * 146_097) as i64; // [0, 146096]
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365; // [0, 399]
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100); // [0, 365]
    let mp = (5 * doy + 2) / 153; // [0, 11]
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32; // [1, 31]
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32; // [1, 12]
    (if m <= 2 { y + 1 } else { y }, m, d)
}

// ---------------------------------------------------------------------------
// 单测
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn redact_authorization_bearer_jwt() {
        // Authorization: Bearer <jwt> —— Bearer 前缀保留,JWT(含 `.`)被完整遮盖。
        let out = redact_log_line(
            "GET /x Authorization: Bearer eyJhbGciOi.eyJzdWIiOiIxIn0.SflKxwRJ done",
        );
        assert!(out.contains("Bearer ***REDACTED***"), "got: {out}");
        assert!(!out.contains("eyJhbGciOi"), "JWT 泄露: {out}");
        assert!(out.contains("done"));
    }

    #[test]
    fn redact_cookie_and_sessionid() {
        let out = redact_log_line("Cookie: sessionid=abc123def; other=keep");
        assert!(!out.contains("abc123def"), "cookie 值泄露: {out}");
        assert!(out.contains("Cookie"));
    }

    #[test]
    fn redact_standalone_sessionid() {
        let out = redact_log_line("set sessionid=SECRET_SESSION_VALUE now");
        assert!(!out.contains("SECRET_SESSION_VALUE"), "got: {out}");
        assert!(out.contains("now"));
    }

    #[test]
    fn redact_master_key_env() {
        // CREATOROS_MASTER_KEY=<b64> —— master_key 是 tier1,值一律遮。
        let out = redact_log_line("env CREATOROS_MASTER_KEY=aGVsbG8gd29ybGQgc2VjcmV0Cg== spawned");
        assert!(!out.contains("aGVsbG8gd29ybGQ"), "master key 泄露: {out}");
        assert!(out.contains("spawned"));
    }

    #[test]
    fn redact_api_key_and_token() {
        let out = redact_log_line("api_key=sk-1234567890 access_token=tok_ABCDEFG end");
        assert!(!out.contains("sk-1234567890"), "api_key 泄露: {out}");
        assert!(!out.contains("tok_ABCDEFG"), "access_token 泄露: {out}");
        assert!(out.contains("end"));
    }

    #[test]
    fn keep_token_count_not_secret() {
        // 泛化词 token,值是短数字 → 不遮(保住 LLM token 计数日志可读)。
        let out = redact_log_line(r#"usage: {"tokens": 1523, "cost": 0.02}"#);
        assert!(out.contains("1523"), "误遮了 token 计数: {out}");
    }

    #[test]
    fn redact_long_secret_after_generic_key() {
        // 泛化词 key,值是 ≥32 位 hex → 遮。
        let long = "a".repeat(40);
        let out = redact_log_line(&format!("key={long} tail"));
        assert!(!out.contains(&long), "长机密未遮: {out}");
        assert!(out.contains("tail"));
    }

    #[test]
    fn keep_short_value_after_generic_key() {
        // 泛化词 key,值短 → 不遮(避免误遮 `key: value` 普通日志)。
        let out = redact_log_line("map key=name value=foo");
        assert!(out.contains("name"), "误遮短值: {out}");
    }

    #[test]
    fn keyword_needs_word_boundary() {
        // `mytoken` / `tokens` 不应命中 token。
        let out = redact_log_line("mytoken tokens=1523 brokenkey=x");
        assert!(out.contains("mytoken"));
        assert!(out.contains("1523"), "tokens 误命中: {out}");
    }

    #[test]
    fn redact_preserves_chinese() {
        // 含中文(多字节)行脱敏后仍合法可读,机密仍被遮。
        let out = redact_log_line("中文日志 password=超级密码secret123456 结束");
        assert!(out.contains("中文日志"));
        assert!(out.contains("结束"));
        assert!(!out.contains("超级密码secret123456"), "got: {out}");
    }

    #[test]
    fn redact_no_keyword_is_identity() {
        let line = "[sidecar] Next.js ZodError at /api/favorites line 42";
        assert_eq!(redact_log_line(line), line);
    }

    #[test]
    fn rfc3339_epoch() {
        assert_eq!(format_rfc3339_utc(0, 0), "1970-01-01T00:00:00.000Z");
    }

    #[test]
    fn rfc3339_y2k() {
        // 2000-01-01T00:00:00Z = 946684800(闰年边界前一天),外加 500ms。
        assert_eq!(
            format_rfc3339_utc(946_684_800, 500),
            "2000-01-01T00:00:00.500Z"
        );
    }

    #[test]
    fn rfc3339_known_datetime() {
        // 2021-03-01T12:34:56Z = 1614602096(验证月/日/时分秒 + 闰年 2 月后进位)。
        assert_eq!(
            format_rfc3339_utc(1_614_602_096, 0),
            "2021-03-01T12:34:56.000Z"
        );
    }

    // -----------------------------------------------------------------------
    // T-391 加密日志测试(TDD,SPEC §12)
    // -----------------------------------------------------------------------

    /// 生成一对测试密钥:返回(私钥 32B, 对应公钥 32B, Recipient)。测试自带,不依赖用户生产公钥。
    fn test_keypair() -> ([u8; 32], [u8; 32], Recipient) {
        let secret = StaticSecret::random_from_rng(OsRng);
        let priv_bytes = secret.to_bytes();
        let pub_bytes = PublicKey::from(&secret).to_bytes();
        let r = Recipient {
            key_id: key_id_of(&pub_bytes),
            pubkey: PublicKey::from(pub_bytes),
        };
        (priv_bytes, pub_bytes, r)
    }

    fn unique_temp_path(suffix: &str) -> std::path::PathBuf {
        use std::sync::atomic::{AtomicU64, Ordering};
        static C: AtomicU64 = AtomicU64::new(0);
        let n = C.fetch_add(1, Ordering::SeqCst);
        std::env::temp_dir().join(format!(
            "creatoros-logtest-{}-{}-{}",
            std::process::id(),
            n,
            suffix
        ))
    }

    #[test]
    fn enc_header_frame_roundtrip() {
        // HEADER 包裹/解包往返 + 每帧独立可解(含中文多字节)。
        let (priv_b, pub_b, _r) = test_keypair();
        let lines: [&[u8]; 3] = [b"line one", "第二行 中文".as_bytes(), b"third"];
        let bytes = encrypt_lines(&[pub_b], &lines).expect("encrypt");
        let out = decrypt_log(&bytes, &priv_b).expect("decrypt");
        assert!(!out.truncated, "完整文件不应标截断");
        assert_eq!(out.lines.len(), 3);
        assert_eq!(out.lines[0], b"line one");
        assert_eq!(String::from_utf8_lossy(&out.lines[1]), "第二行 中文");
        assert_eq!(out.lines[2], b"third");
    }

    #[test]
    fn enc_wrong_key_zero_readable() {
        // 私钥错误 → NoMatchingKey,0 行可读(验收 §13.1)。
        let (_p1, pub1, _r1) = test_keypair();
        let (p2, _pub2, _r2) = test_keypair();
        let bytes = encrypt_lines(&[pub1], &[b"secret line" as &[u8]]).unwrap();
        let err = decrypt_log(&bytes, &p2).unwrap_err();
        assert_eq!(err, DecryptError::NoMatchingKey);
    }

    #[test]
    fn enc_partial_decrypt_on_tail_truncation() {
        // 部分可解密:尾部截断 → 解出前 N 行、truncated=true、不 panic(SPEC §5 / 验收 §13.3)。
        let (priv_b, pub_b, _r) = test_keypair();
        let lines: [&[u8]; 4] = [b"aaa", b"bbb", b"ccc", b"ddd"];
        let mut bytes = encrypt_lines(&[pub_b], &lines).unwrap();
        // 砍掉尾部若干字节 → 最后一帧不完整。
        bytes.truncate(bytes.len() - 5);
        let out = decrypt_log(&bytes, &priv_b).expect("截断仍应 Ok(不 panic)");
        assert!(out.truncated, "尾部截断应标 truncated");
        assert_eq!(out.lines.len(), 3, "应解出前 3 行");
        assert_eq!(out.lines[0], b"aaa");
        assert_eq!(out.lines[2], b"ccc");
    }

    #[test]
    fn enc_mid_frame_corruption_stops_cleanly() {
        // 帧体被篡改(tag 失败)→ 停在该帧,输出之前全部行,不 panic。
        let (priv_b, pub_b, _r) = test_keypair();
        let lines: [&[u8]; 3] = [b"first", b"second", b"third"];
        let mut bytes = encrypt_lines(&[pub_b], &lines).unwrap();
        // 翻转最后一个字节(落在最后一帧的 tag 里)。
        let last = bytes.len() - 1;
        bytes[last] ^= 0xff;
        let out = decrypt_log(&bytes, &priv_b).expect("损坏仍应 Ok");
        assert!(out.truncated);
        assert_eq!(out.lines.len(), 2, "损坏帧前的 2 行应解出");
        assert_eq!(out.lines[1], b"second");
    }

    #[test]
    fn enc_counter_monotonic_no_nonce_reuse() {
        // counter 单调不复用:同明文两帧密文必不同(nonce=counter 递增)。
        let (_p, pub_b, _r) = test_keypair();
        let bytes = encrypt_lines(&[pub_b], &[b"same" as &[u8], b"same" as &[u8]]).unwrap();
        let header_len = MAGIC.len() + 1 + WRAP_BLOCK_LEN;
        let mut pos = header_len;
        let l0 = u32::from_le_bytes(bytes[pos..pos + 4].try_into().unwrap()) as usize;
        pos += 4;
        let ct0 = bytes[pos..pos + l0].to_vec();
        pos += l0;
        let l1 = u32::from_le_bytes(bytes[pos..pos + 4].try_into().unwrap()) as usize;
        pos += 4;
        let ct1 = bytes[pos..pos + l1].to_vec();
        assert_ne!(ct0, ct1, "同明文两帧密文相同 → nonce 复用!");
    }

    #[test]
    fn enc_redaction_happens_before_encryption() {
        // 脱敏在加密前:密文解开后仍是脱敏文本(机密不入密文)。走真实 SidecarLogger.log 流式路径。
        let (priv_b, _pub_b, r) = test_keypair();
        let path = unique_temp_path("redact.enc");
        {
            let file = OpenOptions::new()
                .create(true)
                .write(true)
                .truncate(true)
                .open(&path)
                .unwrap();
            let st = open_encrypted_writer(file, &[r]).unwrap();
            let logger = SidecarLogger {
                inner: Arc::new(Mutex::new(st)),
            };
            logger.log(
                "sidecar",
                "GET /x Authorization: Bearer eyJhbGciOi.eyJzdWIi.SflKx done",
            );
            // write_frame 每帧 flush,数据已落盘。
        }
        let bytes = fs::read(&path).unwrap();
        let out = decrypt_log(&bytes, &priv_b).unwrap();
        let line = String::from_utf8_lossy(&out.lines[0]);
        assert!(line.contains("***REDACTED***"), "解密后应含遮盖标记: {line}");
        assert!(!line.contains("eyJhbGciOi"), "JWT 泄进密文: {line}");
        assert!(line.contains("[sidecar]"), "应保留通道前缀: {line}");
        let _ = fs::remove_file(&path);
    }

    #[test]
    fn enc_downgrade_when_no_pubkey_writes_nothing() {
        // 降级路径:内嵌公钥占位空 → init 返回 None 且不写任何文件(诚实全降级,SPEC §5)。
        assert!(
            embedded_recipients().is_empty(),
            "占位公钥应为空(用户尚未填);若此断言失败说明已填入生产公钥,需同步调整该测试"
        );
        let dir = unique_temp_path("downgrade-dir");
        let logger = init_sidecar_logger(&dir);
        assert!(logger.is_none(), "空公钥应全降级返回 None");
        assert!(
            !dir.join("sidecar.log.enc").exists(),
            "全降级不应写任何日志文件"
        );
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn enc_multi_recipient_either_key_decrypts() {
        // 多开发者/轮换:两公钥各包一次 wrap_block,任一私钥可解同一 session_key。
        let (p1, pub1, _r1) = test_keypair();
        let (p2, pub2, _r2) = test_keypair();
        let bytes = encrypt_lines(&[pub1, pub2], &[b"multi" as &[u8]]).unwrap();
        assert_eq!(decrypt_log(&bytes, &p1).unwrap().lines[0], b"multi");
        assert_eq!(decrypt_log(&bytes, &p2).unwrap().lines[0], b"multi");
    }

    #[test]
    fn enc_bad_magic_rejected() {
        let (p, _pub, _r) = test_keypair();
        assert_eq!(
            decrypt_log(b"not-an-enc-file", &p).unwrap_err(),
            DecryptError::BadMagic
        );
    }

    #[test]
    fn enc_empty_body_ok_no_frames() {
        // 只有 HEADER 无帧(会话未写任何行即结束)→ 解出 0 行、不截断、不报错。
        let (p, pub_b, _r) = test_keypair();
        let bytes = encrypt_lines(&[pub_b], &[]).unwrap();
        let out = decrypt_log(&bytes, &p).unwrap();
        assert_eq!(out.lines.len(), 0);
        assert!(!out.truncated);
    }
}
