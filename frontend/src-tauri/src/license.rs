//! [T-372 L2] Rust 校验门纵切 —— 激活校验决策链从 sidecar JS 迁到壳层。
//!
//! SPEC:docs/superpowers/specs/2026-07-17-license-hardening-and-dual-platform-design.md §5/§6/§9/§13/§14。
//!
//! 决策链(本模块 `run_license_chain`,全端口注入、单测不真联网):
//!   取本地激活态(.license 解密)→ 组装带随机 nonce 的请求 → 调 activate/status
//!   → Ed25519 验签(内嵌公钥,签名串 = `(request-target)\nhost\ndate\ndigest` 四段)
//!   → 防重放(nonce 回显必须一致;X-License-Date 与可信时间偏差 >300s 拒)
//!   → last-seen 回拨检测(双点冗余取 max,容差 3600s)→ 决定放行。
//!
//! 放行权威 = `<appDataDir>/.license`(AES-256-GCM 加密快照,Rust 独占写;sidecar 门只读它,
//! 不读 activation_state 表)。领域记录(activation_state)仍由 sidecar backend 独占写,
//! Rust 放行后经 loopback RPC `/api/v1/local/license-sync` 触发同步(仅供设置页展示,BR-01)。
//!
//! 诚实边界(SPEC §18):本模块防的是 hosts 劫持/假服务器/MITM/重放/改 JS/改时钟六类低成本
//! 攻击;patch 本 Rust 二进制可绕,不假装防专业逆向。

use std::path::{Path, PathBuf};
use std::sync::Mutex;

use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes256Gcm, Nonce};
use base64::Engine as _;
use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

// ─────────────────────────────────────────────────────────────────────────────
// 内嵌公钥 + 常量
// ─────────────────────────────────────────────────────────────────────────────

/// 授权服务响应签名的 Ed25519 公钥(raw 32 字节的 base64)。
///
/// TODO(L1s 公钥):**占位常量,尚未填真钥**。真实公钥由 L1s(activation-manager 服务端签名
/// 端点)的密钥生成脚本产出后填入此处。占位空串下强验签(CREATOROS_LICENSE_STRICT_VERIFY=1)
/// 会**诚实地全部拒绝**并打人话日志(见 `resolve_public_key`)——绝不硬编码假密钥冒充真钥。
pub const LICENSE_SERVER_PUBLIC_KEY_B64: &str = "";

/// 响应 date 头与可信时间的最大允许偏差(SPEC §5:300 秒)。
const MAX_DATE_SKEW_MS: i64 = 300_000;
/// last-seen 回拨容差(SPEC §6:3600 秒,容忍 DST 与合法小幅校时)。
const ROLLBACK_TOLERANCE_MS: i64 = 3_600_000;
/// 服务端未下发 graceSeconds 时的兜底宽限(P5 现状 7 天;L1s 上线后由服务端按码型下发)。
const DEFAULT_GRACE_SECONDS: i64 = 7 * 86_400;
/// `.license` 快照封包版本。
const SNAPSHOT_VERSION: u32 = 1;
/// `.license` 加密密钥派生上下文(与 sidecar 侧 license-file.server.ts 必须一致)。
const LICENSE_KEY_CONTEXT: &[u8] = b"creatoros-license-v1";
/// 与 sidecar secret-crypto 一致的密文前缀(enc:v1: + base64(iv12|tag16|ct))。
const ENC_PREFIX: &str = "enc:v1:";

// ─────────────────────────────────────────────────────────────────────────────
// 端口(单测不真联网/不真读钟,SPEC §14)
// ─────────────────────────────────────────────────────────────────────────────

/// HTTP 响应(只保留决策链关心的三个签名头 + 原始 body 字节)。
pub struct LicenseHttpResponse {
    pub status: u16,
    /// X-License-Signature(base64 Ed25519 签名)。
    pub signature: Option<String>,
    /// X-License-Date(RFC1123 服务端时间)。
    pub date: Option<String>,
    /// X-License-Digest(`SHA-256=<base64(sha256(body))>`)。
    pub digest: Option<String>,
    /// 响应体**确切字节**(digest/签名都对它算,不能先 parse 再序列化)。
    pub body: Vec<u8>,
}

/// HTTP 端口:Err = 网络不可达(走离线宽限分支);Ok = 拿到了响应(哪怕 4xx/5xx)。
pub trait LicenseHttp {
    fn post(&self, url: &str, body_json: &str) -> Result<LicenseHttpResponse, String>;
}

/// 墙钟端口(Unix ms)。会话内单调计时用 `std::time::Instant`(见 `SessionMonotonic`),不走此口。
pub trait LicenseClock {
    fn wall_ms(&self) -> i64;
}

/// last-seen 存储点端口(双点冗余,SPEC §6:①appDataDir 文件 ②macOS defaults plist)。
pub trait LastSeenStore {
    fn read(&self) -> Option<i64>;
    fn write(&self, ms: i64);
}

// ─────────────────────────────────────────────────────────────────────────────
// 配置
// ─────────────────────────────────────────────────────────────────────────────

pub struct LicenseConfig {
    pub base_url: String,
    pub project_key: String,
    /// [gate-F2] env `CREATOROS_LICENSE_STRICT_VERIFY`,默认 "1" 强验签;
    /// "0" = 退回仅校 success+valid(P5 现状)+ 结果带「签名校验未启用」诚实标注。
    pub strict_verify: bool,
    /// 验签公钥(base64 raw 32B)。生产 = 内嵌常量;单测注入测试公钥。
    pub public_key_b64: String,
    pub machine_id: String,
}

impl LicenseConfig {
    pub fn from_env(machine_id: String) -> Self {
        let base_url = std::env::var("CREATOROS_LICENSE_BASE_URL")
            .ok()
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| "https://license.aitongban.cloud".to_string());
        let project_key = std::env::var("CREATOROS_LICENSE_PROJECT_KEY")
            .ok()
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| "test".to_string());
        let strict_verify = std::env::var("CREATOROS_LICENSE_STRICT_VERIFY")
            .map(|v| v.trim() != "0")
            .unwrap_or(true);
        LicenseConfig {
            base_url,
            project_key,
            strict_verify,
            public_key_b64: LICENSE_SERVER_PUBLIC_KEY_B64.to_string(),
            machine_id,
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// `.license` 放行快照(Rust 独占写;sidecar 门只读)
// ─────────────────────────────────────────────────────────────────────────────

/// `.license` 明文形状(加密前 JSON,camelCase 与 sidecar 读端约定一致)。
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct LicenseSnapshot {
    pub v: u32,
    /// 放行权威布尔:sidecar 激活门只认它。
    pub allowed: bool,
    /// active | grace | expired | inactive | untrusted。
    pub status: String,
    /// 激活码明文(整个文件 AES 加密,故不再单独套一层)。
    pub code: String,
    pub machine_id: String,
    pub license_mode: String,
    pub project_key: String,
    /// ISO;None = 永久(买断)。
    pub expires_at: Option<String>,
    pub activated_at: String,
    /// 最后一次在线校验成功(Unix ms)。离线宽限窗从这里算。
    pub last_online_check_ms: i64,
    /// 防回拨单调递增 last-seen(Unix ms;与双冗余点一起取 max)。
    pub last_seen_ms: i64,
    /// 服务端下发的离线宽限秒数(内测 86400 / 买断 2592000;未下发用兜底)。
    pub grace_seconds: i64,
    pub revoked: bool,
    /// 本快照是否经过强验签(gate-F2 诚实标注;false = 「签名校验未启用」)。
    pub signature_verified: bool,
    /// 本判定产生时刻(Unix ms,展示/排障)。
    pub verdict_at_ms: i64,
    pub message: String,
}

/// 暴露给前端(Tauri IPC)/写进判定的放行结果 —— 前端只拿结果,不拿判定逻辑(SPEC §9)。
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct GateDecision {
    pub licensed: bool,
    pub status: String,
    /// "trial"(有到期)| "perpetual"(expiresAt=null 买断)。码型细分支为 L3 接口。
    pub mode: String,
    pub expires_at: Option<String>,
    pub revoked: bool,
    /// false + strict_verify=false ⇒ 前端应显示「签名校验未启用」诚实标注(gate-F2)。
    pub signature_verified: bool,
    pub strict_verify: bool,
    pub message: String,
}

fn mode_of(expires_at: &Option<String>) -> String {
    if expires_at.is_none() {
        "perpetual".to_string()
    } else {
        "trial".to_string()
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// 密码学原语
// ─────────────────────────────────────────────────────────────────────────────

fn sha256_bytes(data: &[u8]) -> [u8; 32] {
    let mut h = Sha256::new();
    h.update(data);
    h.finalize().into()
}

/// digest 段:`SHA-256=` + base64(sha256(body 确切字节))。
pub fn compute_digest(body: &[u8]) -> String {
    format!(
        "SHA-256={}",
        base64::engine::general_purpose::STANDARD.encode(sha256_bytes(body))
    )
}

/// 签名串 = 四段按序 `\n` 连接(无尾随换行):
///   `(request-target)`(小写 method + 空格 + pathname)、host、date、digest。
pub fn build_signing_string(request_target: &str, host: &str, date: &str, digest: &str) -> String {
    format!("{request_target}\n{host}\n{date}\n{digest}")
}

/// 解析内嵌公钥。占位空串/坏值 → Err(人话),强验签下由调用方诚实拒绝。
pub fn resolve_public_key(b64: &str) -> Result<VerifyingKey, String> {
    let trimmed = b64.trim();
    if trimmed.is_empty() {
        return Err(
            "授权验签公钥尚未配置(L1s 服务端公钥待填,当前为占位常量)——强验签模式下无法信任任何响应"
                .to_string(),
        );
    }
    let raw = base64::engine::general_purpose::STANDARD
        .decode(trimmed)
        .map_err(|e| format!("授权验签公钥 base64 解码失败: {e}"))?;
    let raw32: [u8; 32] = raw
        .as_slice()
        .try_into()
        .map_err(|_| format!("授权验签公钥长度 {} ≠ 32 字节", raw.len()))?;
    VerifyingKey::from_bytes(&raw32).map_err(|e| format!("授权验签公钥非法: {e}"))
}

/// 验签 + 头完整性:缺任一签名头 / digest 与 body 不符 / 签名不过 → Err(人话)。
pub fn verify_response_signature(
    key: &VerifyingKey,
    request_target: &str,
    host: &str,
    resp: &LicenseHttpResponse,
) -> Result<(), String> {
    let sig_b64 = resp
        .signature
        .as_deref()
        .ok_or("响应缺少 X-License-Signature 头(不可信响应)")?;
    let date = resp
        .date
        .as_deref()
        .ok_or("响应缺少 X-License-Date 头(不可信响应)")?;
    let digest_header = resp
        .digest
        .as_deref()
        .ok_or("响应缺少 X-License-Digest 头(不可信响应)")?;

    let computed = compute_digest(&resp.body);
    if digest_header != computed {
        return Err("响应体摘要与 X-License-Digest 不符(响应体被篡改)".to_string());
    }

    let sig_raw = base64::engine::general_purpose::STANDARD
        .decode(sig_b64.trim())
        .map_err(|_| "X-License-Signature 非法 base64".to_string())?;
    let sig = Signature::from_slice(&sig_raw).map_err(|_| "X-License-Signature 长度非法".to_string())?;

    let signing_string = build_signing_string(request_target, host, date, &computed);
    key.verify(signing_string.as_bytes(), &sig)
        .map_err(|_| "Ed25519 验签失败(签名伪造或响应被篡改)".to_string())
}

// ─────────────────────────────────────────────────────────────────────────────
// 时间:RFC1123 / ISO 解析 + 回拨检测
// ─────────────────────────────────────────────────────────────────────────────

fn parse_rfc1123_ms(s: &str) -> Result<i64, String> {
    let t = httpdate::parse_http_date(s).map_err(|e| format!("X-License-Date 解析失败: {e}"))?;
    Ok(t.duration_since(std::time::UNIX_EPOCH)
        .map_err(|_| "X-License-Date 早于 Unix epoch".to_string())?
        .as_millis() as i64)
}

/// 极简 ISO-8601 UTC 解析(serverTime / expiresAt;形如 2026-07-17T12:00:00(.sss)Z)。
/// 不引 chrono(壳层依赖克制);解析失败返回 None,调用方按「无该字段」降级。
pub fn parse_iso_ms(s: &str) -> Option<i64> {
    let s = s.trim();
    let bytes = s.as_bytes();
    if bytes.len() < 20 || bytes[4] != b'-' || bytes[7] != b'-' || bytes[10] != b'T' {
        return None;
    }
    if !s.ends_with('Z') {
        return None; // 契约:服务端下发 ISO UTC(BR-05);带时区偏移的非 UTC 形态不接受
    }
    let year: i64 = s.get(0..4)?.parse().ok()?;
    let month: i64 = s.get(5..7)?.parse().ok()?;
    let day: i64 = s.get(8..10)?.parse().ok()?;
    let hour: i64 = s.get(11..13)?.parse().ok()?;
    let minute: i64 = s.get(14..16)?.parse().ok()?;
    let second: i64 = s.get(17..19)?.parse().ok()?;
    let millis: i64 = match s.get(19..s.len() - 1) {
        Some(frac) if frac.starts_with('.') => {
            let digits: String = frac[1..].chars().take(3).collect();
            let padded = format!("{digits:0<3}");
            padded.parse().ok()?
        }
        _ => 0,
    };
    if !(1..=12).contains(&month) || !(1..=31).contains(&day) {
        return None;
    }
    // 天数算法(civil days from epoch,Howard Hinnant 公式)。
    let y = if month <= 2 { year - 1 } else { year };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = y - era * 400;
    let mp = (month + 9) % 12;
    let doy = (153 * mp + 2) / 5 + day - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    let days = era * 146_097 + doe - 719_468;
    Some(((days * 86_400) + hour * 3600 + minute * 60 + second) * 1000 + millis)
}

fn format_iso_ms(ms: i64) -> String {
    // 只用于日志/展示副本;精度到秒即可。逆运算同上公式。
    let secs = ms.div_euclid(1000);
    let days = secs.div_euclid(86_400);
    let sod = secs.rem_euclid(86_400);
    let z = days + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = if m <= 2 { y + 1 } else { y };
    format!(
        "{year:04}-{m:02}-{d:02}T{:02}:{:02}:{:02}Z",
        sod / 3600,
        (sod % 3600) / 60,
        sod % 60
    )
}

/// 双点 + 快照三处 last-seen 取 max(SPEC §6:抗删除还原 —— 删单点另一点仍拦)。
pub fn max_last_seen(points: &[&dyn LastSeenStore], snapshot_ms: Option<i64>) -> Option<i64> {
    let mut best = snapshot_ms;
    for p in points {
        if let Some(v) = p.read() {
            best = Some(best.map_or(v, |b| b.max(v)));
        }
    }
    best
}

/// 回拨判定:当前墙钟 < max(last_seen) − 3600s ⇒ 视同过期(SPEC §6)。
pub fn is_clock_rollback(wall_ms: i64, max_seen_ms: Option<i64>) -> bool {
    matches!(max_seen_ms, Some(seen) if wall_ms < seen - ROLLBACK_TOLERANCE_MS)
}

/// 会话内单调时钟(SPEC §6 第 3 源):进程内计时用 `Instant`,不受墙钟回拨影响。
/// L2 记录会话起点供 L3 的宽限倒计时/心跳 cadence 使用(L3 接口,当前尚无调用方 → allow)。
#[allow(dead_code)]
pub struct SessionMonotonic {
    started: std::time::Instant,
}

#[allow(dead_code)]
impl SessionMonotonic {
    pub fn new() -> Self {
        SessionMonotonic {
            started: std::time::Instant::now(),
        }
    }
    /// 本会话已流逝毫秒(单调,墙钟无关)。
    pub fn elapsed_ms(&self) -> i64 {
        self.started.elapsed().as_millis() as i64
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// last-seen 双冗余点生产实现
// ─────────────────────────────────────────────────────────────────────────────

/// 冗余点 ①:`<appDataDir>/.license-seen` 明文毫秒文件(与 .license 分离,删 .license 不丢它)。
pub struct FileLastSeen {
    pub path: PathBuf,
}

impl LastSeenStore for FileLastSeen {
    fn read(&self) -> Option<i64> {
        std::fs::read_to_string(&self.path)
            .ok()
            .and_then(|s| s.trim().parse::<i64>().ok())
    }
    fn write(&self, ms: i64) {
        if let Some(parent) = self.path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        if let Err(e) = std::fs::write(&self.path, ms.to_string()) {
            eprintln!("[license] 写 last-seen 文件失败({}): {e}", self.path.display());
        }
    }
}

/// 冗余点 ②(macOS):`defaults` 域 `cloud.aitongban.creatoros.license`(落
/// `~/Library/Preferences/cloud.aitongban.creatoros.license.plist`,由 Rust 写)。
/// 走 defaults CLI 而非手写 plist:cfprefsd 有缓存,直接改文件可能读不一致。
#[cfg(target_os = "macos")]
pub struct DefaultsLastSeen {
    pub domain: String,
    pub key: String,
}

#[cfg(target_os = "macos")]
impl LastSeenStore for DefaultsLastSeen {
    fn read(&self) -> Option<i64> {
        let out = std::process::Command::new("defaults")
            .args(["read", &self.domain, &self.key])
            .output()
            .ok()?;
        if !out.status.success() {
            return None;
        }
        String::from_utf8_lossy(&out.stdout).trim().parse::<i64>().ok()
    }
    fn write(&self, ms: i64) {
        let r = std::process::Command::new("defaults")
            .args(["write", &self.domain, &self.key, "-string", &ms.to_string()])
            .status();
        if !matches!(r, Ok(s) if s.success()) {
            eprintln!("[license] 写 defaults last-seen 失败(域 {})", self.domain);
        }
    }
}

/// 非 macOS 的冗余点 ②:home 目录隐藏文件(Windows 注册表点属 Part II W 簇,暂用文件)。
#[cfg(not(target_os = "macos"))]
pub struct HomeFileLastSeen {
    pub path: PathBuf,
}

#[cfg(not(target_os = "macos"))]
impl LastSeenStore for HomeFileLastSeen {
    fn read(&self) -> Option<i64> {
        std::fs::read_to_string(&self.path)
            .ok()
            .and_then(|s| s.trim().parse::<i64>().ok())
    }
    fn write(&self, ms: i64) {
        let _ = std::fs::write(&self.path, ms.to_string());
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// `.license` 加解密落盘(enc:v1: 封包,与 sidecar secret-crypto 同格式)
// ─────────────────────────────────────────────────────────────────────────────

/// 从 master key(base64 32B,keychain/文件兜底先例见 lib.rs resolve_or_create_master_key)
/// 派生 .license 专用 32B 密钥:SHA-256(masterKeyRaw ‖ "creatoros-license-v1")。
/// 派生而非直用:避免同一 key 在「激活码列加密」与「放行快照加密」两个语境间复用。
pub fn derive_license_key(master_key_b64: &str) -> Option<[u8; 32]> {
    let raw = base64::engine::general_purpose::STANDARD
        .decode(master_key_b64.trim())
        .ok()?;
    if raw.len() != 32 {
        return None;
    }
    let mut h = Sha256::new();
    h.update(&raw);
    h.update(LICENSE_KEY_CONTEXT);
    Some(h.finalize().into())
}

/// 加密快照 → `enc:v1:` + base64(iv12 | tag16 | ct)(sidecar decryptSecret 可直接解)。
pub fn encrypt_snapshot(snap: &LicenseSnapshot, key: &[u8; 32]) -> Result<String, String> {
    let plain = serde_json::to_vec(snap).map_err(|e| format!("快照序列化失败: {e}"))?;
    use rand::RngCore as _;
    let mut iv = [0u8; 12];
    rand::rngs::OsRng.fill_bytes(&mut iv);
    let cipher = Aes256Gcm::new(key.into());
    // aes-gcm 输出 = ct ‖ tag(tag 在尾);secret-crypto 封包序 = iv ‖ tag ‖ ct → 重排。
    let out = cipher
        .encrypt(Nonce::from_slice(&iv), plain.as_ref())
        .map_err(|_| "快照加密失败".to_string())?;
    let (ct, tag) = out.split_at(out.len() - 16);
    let mut packed = Vec::with_capacity(12 + 16 + ct.len());
    packed.extend_from_slice(&iv);
    packed.extend_from_slice(tag);
    packed.extend_from_slice(ct);
    Ok(format!(
        "{ENC_PREFIX}{}",
        base64::engine::general_purpose::STANDARD.encode(packed)
    ))
}

/// 解密 `.license` 内容(无前缀 = 明文降级快照,兼容无 master key 的极端环境)。
pub fn decrypt_snapshot(stored: &str, key: Option<&[u8; 32]>) -> Result<LicenseSnapshot, String> {
    let trimmed = stored.trim();
    let plain: Vec<u8> = if let Some(rest) = trimmed.strip_prefix(ENC_PREFIX) {
        let key = key.ok_or("缺 master key,无法解密 .license")?;
        let packed = base64::engine::general_purpose::STANDARD
            .decode(rest)
            .map_err(|_| ".license 密文 base64 非法".to_string())?;
        if packed.len() < 12 + 16 {
            return Err(".license 密文过短".to_string());
        }
        let (iv, rest) = packed.split_at(12);
        let (tag, ct) = rest.split_at(16);
        let mut sealed = Vec::with_capacity(ct.len() + 16);
        sealed.extend_from_slice(ct);
        sealed.extend_from_slice(tag);
        let cipher = Aes256Gcm::new(key.into());
        cipher
            .decrypt(Nonce::from_slice(iv), sealed.as_ref())
            .map_err(|_| ".license 解密失败(master key 不符或文件被篡改)".to_string())?
    } else {
        trimmed.as_bytes().to_vec()
    };
    let snap: LicenseSnapshot =
        serde_json::from_slice(&plain).map_err(|e| format!(".license 内容解析失败: {e}"))?;
    if snap.v != SNAPSHOT_VERSION {
        return Err(format!(".license 版本 {} 不受支持", snap.v));
    }
    Ok(snap)
}

pub fn license_file_path(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join(".license")
}

pub fn read_snapshot_file(path: &Path, key: Option<&[u8; 32]>) -> Option<LicenseSnapshot> {
    let content = std::fs::read_to_string(path).ok()?;
    match decrypt_snapshot(&content, key) {
        Ok(s) => Some(s),
        Err(e) => {
            eprintln!("[license] {e} → 视为无有效放行快照(需重新激活)");
            None
        }
    }
}

pub fn write_snapshot_file(path: &Path, snap: &LicenseSnapshot, key: Option<&[u8; 32]>) {
    let content = match key {
        Some(k) => match encrypt_snapshot(snap, k) {
            Ok(c) => c,
            Err(e) => {
                eprintln!("[license] {e} → 本次不落 .license");
                return;
            }
        },
        None => {
            // 无 master key(headless 极端环境)→ 明文降级落盘(与 repo 缺 key 透传语义一致,诚实弱安全)。
            eprintln!("[license] 无 master key,.license 以明文降级落盘(弱安全)");
            match serde_json::to_string(snap) {
                Ok(s) => s,
                Err(_) => return,
            }
        }
    };
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    if let Err(e) = std::fs::write(path, content) {
        eprintln!("[license] 写 .license 失败({}): {e}", path.display());
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt as _;
        let _ = std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600));
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// 决策链本体(纯逻辑 + 端口,可单测)
// ─────────────────────────────────────────────────────────────────────────────

pub enum LicenseOp<'a> {
    Activate { code: &'a str },
    Status,
}

pub struct ChainDeps<'a> {
    pub config: &'a LicenseConfig,
    pub http: &'a dyn LicenseHttp,
    pub clock: &'a dyn LicenseClock,
    pub points: &'a [&'a dyn LastSeenStore],
}

pub struct ChainOutcome {
    pub decision: GateDecision,
    /// Some = 应写入 `.license` 的新快照(调用方负责加密落盘);None = 不动现有文件。
    pub snapshot: Option<LicenseSnapshot>,
}

fn gen_nonce() -> String {
    use rand::RngCore as _;
    let mut raw = [0u8; 16];
    rand::rngs::OsRng.fill_bytes(&mut raw);
    raw.iter().map(|b| format!("{b:02x}")).collect()
}

fn host_of(base_url: &str) -> String {
    // "https://license.aitongban.cloud[:port]/x" → "license.aitongban.cloud[:port]"(签名串 host 段)。
    let no_scheme = base_url
        .split_once("://")
        .map(|(_, rest)| rest)
        .unwrap_or(base_url);
    no_scheme
        .split('/')
        .next()
        .unwrap_or(no_scheme)
        .to_string()
}

fn is_expired(expires_at: &Option<String>, trusted_now_ms: i64) -> bool {
    match expires_at {
        None => false, // null = 永久(买断)
        Some(s) => match parse_iso_ms(s) {
            Some(t) => t <= trusted_now_ms,
            None => false, // 脏值不当过期(宽松,避免误锁,与 P5 一致)
        },
    }
}

fn decision(
    licensed: bool,
    status: &str,
    expires_at: Option<String>,
    revoked: bool,
    signature_verified: bool,
    strict: bool,
    message: &str,
) -> GateDecision {
    GateDecision {
        licensed,
        status: status.to_string(),
        mode: mode_of(&expires_at),
        expires_at,
        revoked,
        signature_verified,
        strict_verify: strict,
        message: if !strict && !signature_verified {
            // gate-F2 诚实标注:弱验签模式下所有结果都带这句(前端可显示)。
            format!("{message}(签名校验未启用)")
        } else {
            message.to_string()
        },
    }
}

/// 服务端响应 body(宽容解析,字段可缺)。
#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct WireBody {
    success: Option<bool>,
    valid: Option<bool>,
    message: Option<String>,
    #[serde(alias = "expires_at")]
    expires_at: Option<String>,
    #[serde(alias = "license_mode")]
    license_mode: Option<String>,
    server_time: Option<String>,
    revoked: Option<bool>,
    grace_seconds: Option<i64>,
    nonce: Option<String>,
}

/// 校验决策链(SPEC §9):这是放行判定的唯一权威实现,sidecar/前端不再持有判定逻辑。
pub fn run_license_chain(
    deps: &ChainDeps<'_>,
    op: LicenseOp<'_>,
    existing: Option<&LicenseSnapshot>,
) -> ChainOutcome {
    let cfg = deps.config;
    let strict = cfg.strict_verify;
    let wall = deps.clock.wall_ms();
    let seen_max = max_last_seen(deps.points, existing.map(|s| s.last_seen_ms));

    // ① 回拨检测先行(SPEC §6:墙钟 < max(last_seen) − 1h ⇒ 视同过期,回激活页)。
    if is_clock_rollback(wall, seen_max) {
        let snap = existing.map(|s| LicenseSnapshot {
            allowed: false,
            status: "expired".to_string(),
            verdict_at_ms: wall,
            message: "检测到系统时间回拨,授权视同过期".to_string(),
            ..s.clone()
        });
        return ChainOutcome {
            decision: decision(
                false,
                "expired",
                existing.and_then(|s| s.expires_at.clone()),
                existing.map(|s| s.revoked).unwrap_or(false),
                false,
                strict,
                "检测到系统时间被回拨,请校准系统时间并联网重新校验授权",
            ),
            snapshot: snap,
        };
    }

    // ② 取激活码:Activate 用入参;Status 用本地快照(无快照 = 未激活)。
    let (code, path, target): (String, &str, &str) = match &op {
        LicenseOp::Activate { code } => {
            let c = code.trim();
            if c.is_empty() {
                return ChainOutcome {
                    decision: decision(false, "inactive", None, false, false, strict, "请输入激活码"),
                    snapshot: None,
                };
            }
            (c.to_string(), "/api/license/activate", "post /api/license/activate")
        }
        LicenseOp::Status => match existing {
            Some(s) => (s.code.clone(), "/api/license/status", "post /api/license/status"),
            None => {
                return ChainOutcome {
                    decision: decision(false, "inactive", None, false, false, strict, "尚未激活"),
                    snapshot: None,
                };
            }
        },
    };

    // ③ 组装带随机 nonce 的请求(防重放第一半:请求 nonce 进 JSON body)。
    let nonce = gen_nonce();
    let req_body = serde_json::json!({
        "code": code,
        "machineId": cfg.machine_id,
        "projectKey": cfg.project_key,
        "nonce": nonce,
    })
    .to_string();
    let url = format!("{}{}", cfg.base_url.trim_end_matches('/'), path);
    let host = host_of(&cfg.base_url);

    // ④ 在线调用。网络不可达 → 离线分支(Status 走宽限;Activate 直接失败)。
    let resp = match deps.http.post(&url, &req_body) {
        Ok(r) => r,
        Err(net_err) => {
            return offline_outcome(deps, &op, existing, wall, seen_max, strict, &net_err);
        }
    };

    // ⑤ 验签 + 防重放(强验签模式;gate-F2 flag=0 退回仅校 success+valid = P5 现状)。
    let mut signature_verified = false;
    if strict {
        let key = match resolve_public_key(&cfg.public_key_b64) {
            Ok(k) => k,
            Err(e) => {
                eprintln!("[license] {e}");
                return untrusted_outcome(existing, wall, strict, &e);
            }
        };
        if let Err(e) = verify_response_signature(&key, target, &host, &resp) {
            eprintln!("[license] 验签拒绝: {e}");
            return untrusted_outcome(existing, wall, strict, &e);
        }
        // date 偏移防重放:X-License-Date 与可信时间(max(墙钟, last_seen))偏差 > 300s 拒。
        let date_ms = match resp.date.as_deref().map(parse_rfc1123_ms) {
            Some(Ok(ms)) => ms,
            _ => {
                return untrusted_outcome(existing, wall, strict, "X-License-Date 头缺失或不可解析");
            }
        };
        let trusted_ref = seen_max.map_or(wall, |s| s.max(wall));
        if (date_ms - trusted_ref).abs() > MAX_DATE_SKEW_MS {
            return untrusted_outcome(
                existing,
                wall,
                strict,
                "响应时间戳与可信时间偏差超过 5 分钟(疑似重放)",
            );
        }
        signature_verified = true;
    }

    // ⑥ 解析业务 body(宽容;确切字节已在 ⑤ 做过摘要校验)。
    let body: WireBody = serde_json::from_slice(&resp.body).unwrap_or_default();

    // nonce 回显必须一致(防重放第二半)。强验签下硬性;弱验签(P5 现状契约无 nonce)跳过。
    if strict {
        if body.nonce.as_deref() != Some(nonce.as_str()) {
            return untrusted_outcome(existing, wall, strict, "响应 nonce 与请求不一致(疑似重放)");
        }
    }

    let success = body.success == Some(true) && (200..300).contains(&resp.status);
    let valid = success && body.valid == Some(true);
    let revoked = body.revoked == Some(true);
    let server_msg = body.message.clone().unwrap_or_default();

    // ⑦ 可信当前时间:强验签用签过名的 serverTime(缺则 date 头);弱验签只有墙钟。
    let server_time_ms = body
        .server_time
        .as_deref()
        .and_then(parse_iso_ms)
        .or_else(|| {
            if signature_verified {
                resp.date.as_deref().and_then(|d| parse_rfc1123_ms(d).ok())
            } else {
                None
            }
        })
        .unwrap_or(wall);
    let trusted_now = server_time_ms;

    // ⑧ last-seen 单调推进:max(已存, 墙钟, 服务端时间)→ 写双冗余点(SPEC §6)。
    let new_seen = seen_max.unwrap_or(i64::MIN).max(wall).max(server_time_ms);
    for p in deps.points {
        p.write(new_seen);
    }

    if !valid {
        // 在线明确判无效(过期/被他机用/码不存在/HTTP 4xx)。
        let msg = if server_msg.is_empty() {
            if matches!(op, LicenseOp::Activate { .. }) {
                "激活失败".to_string()
            } else {
                "授权无效,请重新激活".to_string()
            }
        } else {
            server_msg
        };
        let snap = existing.map(|s| LicenseSnapshot {
            allowed: false,
            status: "expired".to_string(),
            last_seen_ms: new_seen,
            revoked,
            signature_verified,
            verdict_at_ms: wall,
            message: msg.clone(),
            ..s.clone()
        });
        return ChainOutcome {
            decision: decision(
                false,
                "expired",
                body.expires_at.clone().or(existing.and_then(|s| s.expires_at.clone())),
                revoked,
                signature_verified,
                strict,
                &msg,
            ),
            snapshot: snap,
        };
    }

    let expires_at = body.expires_at.clone();
    let license_mode = body
        .license_mode
        .clone()
        .or(existing.map(|s| s.license_mode.clone()))
        .unwrap_or_else(|| "TIME".to_string());
    let grace_seconds = body
        .grace_seconds
        .filter(|g| *g > 0)
        .or(existing.map(|s| s.grace_seconds).filter(|g| *g > 0))
        .unwrap_or(DEFAULT_GRACE_SECONDS);
    let activated_at = match (&op, existing) {
        (LicenseOp::Activate { .. }, _) => format_iso_ms(trusted_now),
        (LicenseOp::Status, Some(s)) => s.activated_at.clone(),
        (LicenseOp::Status, None) => format_iso_ms(trusted_now),
    };

    // ⑨ 吊销:签名响应 revoked=true → 不放行(L2 统一语义;买断「停更新不锁功能」为 L3 码型分支)。
    if revoked {
        let msg = if server_msg.is_empty() {
            "授权已被吊销".to_string()
        } else {
            server_msg
        };
        let snap = LicenseSnapshot {
            v: SNAPSHOT_VERSION,
            allowed: false,
            status: "expired".to_string(),
            code,
            machine_id: cfg.machine_id.clone(),
            license_mode,
            project_key: cfg.project_key.clone(),
            expires_at: expires_at.clone(),
            activated_at,
            last_online_check_ms: trusted_now,
            last_seen_ms: new_seen,
            grace_seconds,
            revoked: true,
            signature_verified,
            verdict_at_ms: wall,
            message: msg.clone(),
        };
        return ChainOutcome {
            decision: decision(false, "expired", expires_at, true, signature_verified, strict, &msg),
            snapshot: Some(snap),
        };
    }

    // ⑩ 到期判定(用可信时间,非本机墙钟;买断 expiresAt=null 永不到此)。
    if is_expired(&expires_at, trusted_now) {
        let msg = "授权已过期,请重新激活".to_string();
        let snap = LicenseSnapshot {
            v: SNAPSHOT_VERSION,
            allowed: false,
            status: "expired".to_string(),
            code,
            machine_id: cfg.machine_id.clone(),
            license_mode,
            project_key: cfg.project_key.clone(),
            expires_at: expires_at.clone(),
            activated_at,
            last_online_check_ms: trusted_now,
            last_seen_ms: new_seen,
            grace_seconds,
            revoked: false,
            signature_verified,
            verdict_at_ms: wall,
            message: msg.clone(),
        };
        return ChainOutcome {
            decision: decision(false, "expired", expires_at, false, signature_verified, strict, &msg),
            snapshot: Some(snap),
        };
    }

    // ⑪ 放行:写放行快照(.license 权威)。
    let msg = if matches!(op, LicenseOp::Activate { .. }) {
        "激活成功".to_string()
    } else {
        "已激活".to_string()
    };
    let snap = LicenseSnapshot {
        v: SNAPSHOT_VERSION,
        allowed: true,
        status: "active".to_string(),
        code,
        machine_id: cfg.machine_id.clone(),
        license_mode,
        project_key: cfg.project_key.clone(),
        expires_at: expires_at.clone(),
        activated_at,
        last_online_check_ms: trusted_now,
        last_seen_ms: new_seen,
        grace_seconds,
        revoked: false,
        signature_verified,
        verdict_at_ms: wall,
        message: msg.clone(),
    };
    ChainOutcome {
        decision: decision(true, "active", expires_at, false, signature_verified, strict, &msg),
        snapshot: Some(snap),
    }
}

/// 网络不可达分支:Status 走离线宽限(SPEC §7 语义,L2 用服务端下发/兜底 graceSeconds);
/// Activate 无法离线完成 → 诚实失败。
fn offline_outcome(
    deps: &ChainDeps<'_>,
    op: &LicenseOp<'_>,
    existing: Option<&LicenseSnapshot>,
    wall: i64,
    seen_max: Option<i64>,
    strict: bool,
    net_err: &str,
) -> ChainOutcome {
    if matches!(op, LicenseOp::Activate { .. }) {
        return ChainOutcome {
            decision: decision(
                false,
                "inactive",
                None,
                false,
                false,
                strict,
                &format!("无法连接授权服务,请检查网络后重试({net_err})"),
            ),
            snapshot: None,
        };
    }
    let Some(s) = existing else {
        return ChainOutcome {
            decision: decision(false, "inactive", None, false, false, strict, "尚未激活"),
            snapshot: None,
        };
    };
    // 可信时间 = max(墙钟, last_seen)(墙钟被前拨会缩短宽限 → 保守方向,可接受)。
    let trusted_now = seen_max.map_or(wall, |m| m.max(wall));
    if is_expired(&s.expires_at, trusted_now) {
        return ChainOutcome {
            decision: decision(
                false,
                "expired",
                s.expires_at.clone(),
                s.revoked,
                false,
                strict,
                "授权已过期,请重新激活",
            ),
            snapshot: Some(LicenseSnapshot {
                allowed: false,
                status: "expired".to_string(),
                verdict_at_ms: wall,
                message: "授权已过期".to_string(),
                ..s.clone()
            }),
        };
    }
    let grace_ms = s.grace_seconds.max(0) * 1000;
    let within = trusted_now - s.last_online_check_ms <= grace_ms;
    // 离线也推进 last-seen(墙钟正常前行时保持单调点新鲜,抗后续回拨)。
    let new_seen = seen_max.unwrap_or(i64::MIN).max(wall);
    for p in deps.points {
        p.write(new_seen);
    }
    if within {
        ChainOutcome {
            decision: decision(
                true,
                "grace",
                s.expires_at.clone(),
                s.revoked,
                s.signature_verified,
                strict,
                "离线宽限期内(暂无法连接授权服务)",
            ),
            snapshot: Some(LicenseSnapshot {
                allowed: true,
                status: "grace".to_string(),
                last_seen_ms: new_seen,
                verdict_at_ms: wall,
                message: "离线宽限期内".to_string(),
                ..s.clone()
            }),
        }
    } else {
        ChainOutcome {
            decision: decision(
                false,
                "expired",
                s.expires_at.clone(),
                s.revoked,
                false,
                strict,
                "离线宽限期已过,请联网重新校验授权",
            ),
            snapshot: Some(LicenseSnapshot {
                allowed: false,
                status: "expired".to_string(),
                last_seen_ms: new_seen,
                verdict_at_ms: wall,
                message: "离线宽限期已过".to_string(),
                ..s.clone()
            }),
        }
    }
}

/// 不可信响应(验签失败/缺头/nonce 不符/date 偏移):视同校验失败,不放行、不落 active
/// (SPEC §5)。保留原快照的领域字段但 allowed=false —— 假服务器不能延命也不能抹除激活记录。
fn untrusted_outcome(
    existing: Option<&LicenseSnapshot>,
    wall: i64,
    strict: bool,
    reason: &str,
) -> ChainOutcome {
    let msg = format!("授权响应不可信:{reason}");
    let snap = existing.map(|s| LicenseSnapshot {
        allowed: false,
        status: "untrusted".to_string(),
        verdict_at_ms: wall,
        message: msg.clone(),
        ..s.clone()
    });
    ChainOutcome {
        decision: decision(
            false,
            "untrusted",
            existing.and_then(|s| s.expires_at.clone()),
            existing.map(|s| s.revoked).unwrap_or(false),
            false,
            strict,
            &msg,
        ),
        snapshot: snap,
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// 生产端口实现 + 壳层上下文(Tauri command 层)
// ─────────────────────────────────────────────────────────────────────────────

pub struct SystemClock;
impl LicenseClock for SystemClock {
    fn wall_ms(&self) -> i64 {
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis() as i64)
            .unwrap_or(0)
    }
}

pub struct ReqwestHttp {
    pub timeout: std::time::Duration,
}

impl LicenseHttp for ReqwestHttp {
    fn post(&self, url: &str, body_json: &str) -> Result<LicenseHttpResponse, String> {
        let client = reqwest::blocking::Client::builder()
            .timeout(self.timeout)
            .build()
            .map_err(|e| format!("http client 构建失败: {e}"))?;
        let resp = client
            .post(url)
            .header("Content-Type", "application/json")
            .body(body_json.to_string())
            .send()
            .map_err(|e| format!("网络请求失败: {e}"))?;
        let status = resp.status().as_u16();
        let header = |name: &str| {
            resp.headers()
                .get(name)
                .and_then(|v| v.to_str().ok())
                .map(|s| s.to_string())
        };
        let signature = header("x-license-signature");
        let date = header("x-license-date");
        let digest = header("x-license-digest");
        let body = resp.bytes().map_err(|e| format!("读响应体失败: {e}"))?.to_vec();
        Ok(LicenseHttpResponse {
            status,
            signature,
            date,
            digest,
            body,
        })
    }
}

/// 壳层许可上下文(lib.rs setup 时装配进 Tauri state)。
pub struct ShellLicenseCtx {
    pub app_data_dir: PathBuf,
    pub machine_id: String,
    pub master_key_b64: Option<String>,
    /// 启动级 nonce 握手 token(注入 sidecar env + WebView 全局;loopback-guard 校验)。
    pub handshake_token: String,
    pub sidecar_port: u16,
    /// 决策链互斥(启动线程与 IPC command 可能并发跑链;串行化避免 .license 写竞争)。
    pub chain_lock: Mutex<()>,
    /// 会话内单调时钟(L3 心跳/宽限倒计时接口,当前尚无读方 → allow)。
    #[allow(dead_code)]
    pub session: SessionMonotonic,
}

/// Tauri managed state 包装。
pub struct LicenseState(pub std::sync::Arc<ShellLicenseCtx>);

fn prod_points(ctx: &ShellLicenseCtx) -> Vec<Box<dyn LastSeenStore>> {
    let mut points: Vec<Box<dyn LastSeenStore>> = vec![Box::new(FileLastSeen {
        path: ctx.app_data_dir.join(".license-seen"),
    })];
    #[cfg(target_os = "macos")]
    points.push(Box::new(DefaultsLastSeen {
        domain: "cloud.aitongban.creatoros.license".to_string(),
        key: "lastSeenMs".to_string(),
    }));
    #[cfg(not(target_os = "macos"))]
    {
        let home = std::env::var("HOME")
            .or_else(|_| std::env::var("USERPROFILE"))
            .unwrap_or_else(|_| ".".to_string());
        points.push(Box::new(HomeFileLastSeen {
            path: PathBuf::from(home).join(".creatoros-seen"),
        }));
    }
    points
}

/// 在生产端口下跑一次决策链并落 `.license` + 触发 sidecar 展示副本同步。
pub fn run_chain_and_persist(ctx: &ShellLicenseCtx, op: LicenseOp<'_>) -> GateDecision {
    let _guard = ctx.chain_lock.lock().unwrap();
    let config = LicenseConfig::from_env(ctx.machine_id.clone());
    let http = ReqwestHttp {
        timeout: std::time::Duration::from_secs(10),
    };
    let clock = SystemClock;
    let points_owned = prod_points(ctx);
    let points: Vec<&dyn LastSeenStore> = points_owned.iter().map(|b| b.as_ref()).collect();

    let key = ctx.master_key_b64.as_deref().and_then(derive_license_key);
    let path = license_file_path(&ctx.app_data_dir);
    let existing = read_snapshot_file(&path, key.as_ref());

    let deps = ChainDeps {
        config: &config,
        http: &http,
        clock: &clock,
        points: &points,
    };
    let outcome = run_license_chain(&deps, op, existing.as_ref());
    if let Some(snap) = &outcome.snapshot {
        write_snapshot_file(&path, snap, key.as_ref());
        sync_mirror_to_sidecar(ctx, snap);
    }
    outcome.decision
}

/// BR-01 领域记录同步:放行判定后,把展示副本经 sidecar loopback RPC 写回
/// activation_state(machineId/code/…/last_seen_at/grace_seconds/revoked)。
/// best-effort:同步失败只记日志,不影响放行(表只是展示副本,.license 才是权威)。
pub fn sync_mirror_to_sidecar(ctx: &ShellLicenseCtx, snap: &LicenseSnapshot) {
    if snap.code.is_empty() {
        return;
    }
    let url = format!(
        "http://127.0.0.1:{}/api/v1/local/license-sync",
        ctx.sidecar_port
    );
    let body = serde_json::json!({
        "machineId": snap.machine_id,
        "code": snap.code,
        "licenseMode": snap.license_mode,
        "projectKey": snap.project_key,
        "expiresAt": snap.expires_at,
        "activatedAt": snap.activated_at,
        "lastOnlineCheckAt": format_iso_ms(snap.last_online_check_ms),
        "lastSeenAt": format_iso_ms(snap.last_seen_ms),
        "graceSeconds": snap.grace_seconds,
        "revoked": snap.revoked,
    })
    .to_string();
    let client = match reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()
    {
        Ok(c) => c,
        Err(_) => return,
    };
    match client
        .post(&url)
        .header("Content-Type", "application/json")
        .header("x-creatoros-handshake", &ctx.handshake_token)
        .body(body)
        .send()
    {
        Ok(r) if r.status().is_success() => {}
        Ok(r) => eprintln!("[license] 同步展示副本到 sidecar 失败(HTTP {})", r.status()),
        Err(e) => eprintln!("[license] 同步展示副本到 sidecar 失败(sidecar 未就绪?): {e}"),
    }
}

/// 启动期授权校验任务(应用启动必查一次,SPEC §7):
///   ① 立即跑一次 Status 决策链(不依赖 sidecar;在线校验 + 落 .license 放行快照);
///   ② 等 sidecar 端口就绪后补一次展示副本同步(①里的同步大概率因 sidecar 未启而落空)。
/// 心跳 cadence(内测 60min / 买断 30d)按码型分支属 L3;本任务是它的挂载点。
pub fn startup_license_task(ctx: std::sync::Arc<ShellLicenseCtx>) {
    std::thread::spawn(move || {
        let d = run_chain_and_persist(&ctx, LicenseOp::Status);
        eprintln!(
            "[license] 启动校验: licensed={} status={} mode={} 验签={}({})",
            d.licensed, d.status, d.mode, d.signature_verified, d.message
        );
        // 等 sidecar 就绪 → 补同步展示副本(TCP 通后再缓 1s 让 Next 路由热身,best-effort)。
        let addr = format!("127.0.0.1:{}", ctx.sidecar_port);
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(90);
        while std::time::Instant::now() < deadline {
            if std::net::TcpStream::connect(&addr).is_ok() {
                std::thread::sleep(std::time::Duration::from_secs(1));
                let key = ctx.master_key_b64.as_deref().and_then(derive_license_key);
                if let Some(snap) =
                    read_snapshot_file(&license_file_path(&ctx.app_data_dir), key.as_ref())
                {
                    sync_mirror_to_sidecar(&ctx, &snap);
                }
                return;
            }
            std::thread::sleep(std::time::Duration::from_millis(500));
        }
    });
}

/// 生成启动级 nonce 握手 token(32B hex)。
pub fn gen_handshake_token() -> String {
    use rand::RngCore as _;
    let mut raw = [0u8; 32];
    rand::rngs::OsRng.fill_bytes(&mut raw);
    raw.iter().map(|b| format!("{b:02x}")).collect()
}

// ─────────────────────────────────────────────────────────────────────────────
// Tauri commands(前端只拿结果,SPEC §9)
// ─────────────────────────────────────────────────────────────────────────────

/// 激活:前端激活页(桌面态)经 IPC 调这里,而非 sidecar 路由 —— 验签/防重放/防回拨
/// 全在 Rust 完成,sidecar 只收展示副本。
#[tauri::command]
pub async fn license_activate(
    state: tauri::State<'_, LicenseState>,
    code: String,
) -> Result<GateDecision, String> {
    let ctx = state.0.clone();
    tauri::async_runtime::spawn_blocking(move || {
        run_chain_and_persist(&ctx, LicenseOp::Activate { code: &code })
    })
    .await
    .map_err(|e| format!("激活任务执行失败: {e}"))
}

/// 复校:读 .license → 决策链(在线 status / 离线宽限 / 回拨检测)→ 返回放行结果。
#[tauri::command]
pub async fn license_check(
    state: tauri::State<'_, LicenseState>,
) -> Result<GateDecision, String> {
    let ctx = state.0.clone();
    tauri::async_runtime::spawn_blocking(move || run_chain_and_persist(&ctx, LicenseOp::Status))
        .await
        .map_err(|e| format!("授权校验任务执行失败: {e}"))
}

// ─────────────────────────────────────────────────────────────────────────────
// 单测(SPEC §14:不真联网,fake http / fake clock / temp 存储点)
// ─────────────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use ed25519_dalek::{Signer, SigningKey};
    use std::cell::{Cell, RefCell};

    /// 固定 seed 的测试签名密钥(不引 rand feature;公钥经 config 注入,非内嵌常量)。
    fn test_keypair() -> (SigningKey, String) {
        let seed: [u8; 32] = [7u8; 32];
        let sk = SigningKey::from_bytes(&seed);
        let pk_b64 =
            base64::engine::general_purpose::STANDARD.encode(sk.verifying_key().to_bytes());
        (sk, pk_b64)
    }

    const TEST_HOST: &str = "license.test";
    /// 2026-07-17T12:00:00Z。
    const NOW_MS: i64 = 1_784_289_600_000;

    struct FixedClock(i64);
    impl LicenseClock for FixedClock {
        fn wall_ms(&self) -> i64 {
            self.0
        }
    }

    /// 内存 last-seen 点(Cell 模拟一个可删的存储点)。
    struct MemPoint(RefCell<Option<i64>>);
    impl MemPoint {
        fn new(v: Option<i64>) -> Self {
            MemPoint(RefCell::new(v))
        }
    }
    impl LastSeenStore for MemPoint {
        fn read(&self) -> Option<i64> {
            *self.0.borrow()
        }
        fn write(&self, ms: i64) {
            *self.0.borrow_mut() = Some(ms);
        }
    }

    /// 假授权服务:按脚本对请求(读出 nonce)构造签名响应;各种篡改开关模拟攻击面。
    struct FakeServer {
        sk: SigningKey,
        body_template: serde_json::Value,
        date: String,
        /// 攻击开关。
        drop_signature: bool,
        tamper_body_after_sign: bool,
        wrong_nonce: bool,
        network_error: bool,
        no_signature_headers: bool,
        last_request: RefCell<Option<serde_json::Value>>,
        calls: Cell<u32>,
    }

    impl FakeServer {
        fn ok(sk: SigningKey, body: serde_json::Value) -> Self {
            FakeServer {
                sk,
                body_template: body,
                // NOW_MS 对应的 RFC1123。
                date: "Fri, 17 Jul 2026 12:00:00 GMT".to_string(),
                drop_signature: false,
                tamper_body_after_sign: false,
                wrong_nonce: false,
                network_error: false,
                no_signature_headers: false,
                last_request: RefCell::new(None),
                calls: Cell::new(0),
            }
        }
    }

    impl LicenseHttp for FakeServer {
        fn post(&self, url: &str, body_json: &str) -> Result<LicenseHttpResponse, String> {
            self.calls.set(self.calls.get() + 1);
            if self.network_error {
                return Err("connect refused".to_string());
            }
            let req: serde_json::Value = serde_json::from_str(body_json).unwrap();
            *self.last_request.borrow_mut() = Some(req.clone());
            let req_nonce = req["nonce"].as_str().unwrap_or("").to_string();
            let mut body = self.body_template.clone();
            body["nonce"] = serde_json::Value::String(if self.wrong_nonce {
                "deadbeef".to_string()
            } else {
                req_nonce
            });
            let body_bytes = serde_json::to_vec(&body).unwrap();
            let path = url.split(TEST_HOST).nth(1).unwrap_or("/api/license/status");
            let target = format!("post {path}");
            let digest = compute_digest(&body_bytes);
            let signing = build_signing_string(&target, TEST_HOST, &self.date, &digest);
            let sig = self.sk.sign(signing.as_bytes());
            let sig_b64 = base64::engine::general_purpose::STANDARD.encode(sig.to_bytes());
            let final_body = if self.tamper_body_after_sign {
                // 签名后偷改 body(假服务器/中间人改字段延命)。
                let mut t = body.clone();
                t["expiresAt"] = serde_json::Value::String("2999-01-01T00:00:00Z".to_string());
                serde_json::to_vec(&t).unwrap()
            } else {
                body_bytes.clone()
            };
            Ok(LicenseHttpResponse {
                status: 200,
                signature: if self.drop_signature || self.no_signature_headers {
                    None
                } else {
                    Some(sig_b64)
                },
                date: if self.no_signature_headers {
                    None
                } else {
                    Some(self.date.clone())
                },
                digest: if self.no_signature_headers {
                    None
                } else {
                    Some(digest)
                },
                body: final_body,
            })
        }
    }

    fn valid_body() -> serde_json::Value {
        serde_json::json!({
            "success": true,
            "valid": true,
            "message": "ok",
            "expiresAt": "2026-07-20T12:00:00Z",
            "licenseMode": "TIME",
            "serverTime": "2026-07-17T12:00:00Z",
            "revoked": false,
            "graceSeconds": 86400,
        })
    }

    fn config(pk_b64: &str, strict: bool) -> LicenseConfig {
        LicenseConfig {
            base_url: format!("https://{TEST_HOST}"),
            project_key: "test".to_string(),
            strict_verify: strict,
            public_key_b64: pk_b64.to_string(),
            machine_id: "machine-1".to_string(),
        }
    }

    fn snapshot_active() -> LicenseSnapshot {
        LicenseSnapshot {
            v: SNAPSHOT_VERSION,
            allowed: true,
            status: "active".to_string(),
            code: "CODE-1".to_string(),
            machine_id: "machine-1".to_string(),
            license_mode: "TIME".to_string(),
            project_key: "test".to_string(),
            expires_at: Some("2026-07-20T12:00:00Z".to_string()),
            activated_at: "2026-07-17T00:00:00Z".to_string(),
            last_online_check_ms: NOW_MS - 3_600_000,
            last_seen_ms: NOW_MS - 3_600_000,
            grace_seconds: 86_400,
            revoked: false,
            signature_verified: true,
            verdict_at_ms: NOW_MS - 3_600_000,
            message: String::new(),
        }
    }

    fn run(
        cfg: &LicenseConfig,
        server: &FakeServer,
        clock_ms: i64,
        points: &[&dyn LastSeenStore],
        op: LicenseOp<'_>,
        existing: Option<&LicenseSnapshot>,
    ) -> ChainOutcome {
        let clock = FixedClock(clock_ms);
        let deps = ChainDeps {
            config: cfg,
            http: server,
            clock: &clock,
            points,
        };
        run_license_chain(&deps, op, existing)
    }

    // ① 合法签名 → 放行 + 写 active 快照。
    #[test]
    fn valid_signature_allows() {
        let (sk, pk) = test_keypair();
        let server = FakeServer::ok(sk, valid_body());
        let cfg = config(&pk, true);
        let p1 = MemPoint::new(None);
        let out = run(
            &cfg,
            &server,
            NOW_MS,
            &[&p1],
            LicenseOp::Activate { code: "CODE-1" },
            None,
        );
        assert!(out.decision.licensed, "验签合法应放行: {:?}", out.decision);
        assert!(out.decision.signature_verified);
        let snap = out.snapshot.expect("应写放行快照");
        assert!(snap.allowed);
        assert_eq!(snap.status, "active");
        assert_eq!(snap.grace_seconds, 86_400);
        // last-seen 已写点。
        assert_eq!(p1.read(), Some(NOW_MS));
    }

    // ② 篡改响应体 → digest/签名对不上 → 拒绝,不落 active。
    #[test]
    fn tampered_body_rejected() {
        let (sk, pk) = test_keypair();
        let mut server = FakeServer::ok(sk, valid_body());
        server.tamper_body_after_sign = true;
        let cfg = config(&pk, true);
        let existing = snapshot_active();
        let out = run(&cfg, &server, NOW_MS, &[], LicenseOp::Status, Some(&existing));
        assert!(!out.decision.licensed);
        assert_eq!(out.decision.status, "untrusted");
        let snap = out.snapshot.expect("应把快照置为不放行");
        assert!(!snap.allowed);
    }

    // ③ 缺签名头 → 拒绝(强验签下缺失即不可信)。
    #[test]
    fn missing_signature_headers_rejected() {
        let (sk, pk) = test_keypair();
        let mut server = FakeServer::ok(sk, valid_body());
        server.no_signature_headers = true;
        let cfg = config(&pk, true);
        let out = run(
            &cfg,
            &server,
            NOW_MS,
            &[],
            LicenseOp::Activate { code: "CODE-1" },
            None,
        );
        assert!(!out.decision.licensed);
        assert_eq!(out.decision.status, "untrusted");
        assert!(out.snapshot.is_none(), "未激活时不落快照");
    }

    // ④ nonce 回显不一致 → 拒绝(防重放)。
    #[test]
    fn nonce_mismatch_rejected() {
        let (sk, pk) = test_keypair();
        let mut server = FakeServer::ok(sk, valid_body());
        server.wrong_nonce = true;
        let cfg = config(&pk, true);
        let out = run(
            &cfg,
            &server,
            NOW_MS,
            &[],
            LicenseOp::Activate { code: "CODE-1" },
            None,
        );
        assert!(!out.decision.licensed);
        assert_eq!(out.decision.status, "untrusted");
    }

    // ⑤ date 偏移 > 300s → 拒绝(重放旧响应)。
    #[test]
    fn date_skew_rejected() {
        let (sk, pk) = test_keypair();
        let mut server = FakeServer::ok(sk, valid_body());
        // 响应时间戳落后可信时间 10 分钟(重放 10 分钟前抓的合法响应)。
        server.date = "Fri, 17 Jul 2026 11:50:00 GMT".to_string();
        let cfg = config(&pk, true);
        let out = run(
            &cfg,
            &server,
            NOW_MS,
            &[],
            LicenseOp::Activate { code: "CODE-1" },
            None,
        );
        assert!(!out.decision.licensed);
        assert!(out.decision.message.contains("偏差"), "{}", out.decision.message);
    }

    // ⑥ 回拨:墙钟 < last-seen − 1h → 判过期(网络都不必发起)。
    #[test]
    fn clock_rollback_expires() {
        let (sk, pk) = test_keypair();
        let server = FakeServer::ok(sk, valid_body());
        let cfg = config(&pk, true);
        let existing = snapshot_active();
        // 墙钟被回拨 2 小时(超 1h 容差)。
        let rolled_back = NOW_MS - 2 * 3_600_000 - 3_600_000;
        let p1 = MemPoint::new(Some(NOW_MS));
        let out = run(&cfg, &server, rolled_back, &[&p1], LicenseOp::Status, Some(&existing));
        assert!(!out.decision.licensed);
        assert_eq!(out.decision.status, "expired");
        assert!(out.decision.message.contains("回拨"));
        assert_eq!(server.calls.get(), 0, "回拨判定应在联网前拦截");
    }

    // ⑥b 容差内小幅回拨(< 1h)不误伤。
    #[test]
    fn small_rollback_within_tolerance_ok() {
        let (sk, pk) = test_keypair();
        let server = FakeServer::ok(sk, valid_body());
        let cfg = config(&pk, true);
        let existing = snapshot_active();
        let slightly_back = NOW_MS - 30 * 60_000; // 回拨 30 分钟,容差内
        let p1 = MemPoint::new(Some(NOW_MS));
        // 响应 date 与可信时间(max(墙钟, last_seen)=NOW_MS)一致 → 不触发偏移拒。
        let out = run(&cfg, &server, slightly_back, &[&p1], LicenseOp::Status, Some(&existing));
        assert!(out.decision.licensed, "{:?}", out.decision);
    }

    // ⑦ 双点取 max:文件点被改小,defaults 点仍新 → 以大者判回拨。
    #[test]
    fn dual_points_take_max() {
        let (sk, pk) = test_keypair();
        let server = FakeServer::ok(sk, valid_body());
        let cfg = config(&pk, true);
        let existing = {
            let mut s = snapshot_active();
            s.last_seen_ms = 0; // 快照点被抹小
            s
        };
        let p_file = MemPoint::new(Some(0)); // 文件点被抹小
        let p_plist = MemPoint::new(Some(NOW_MS)); // 平台点仍是真值
        let rolled_back = NOW_MS - 2 * 3_600_000 - 3_600_000;
        let out = run(
            &cfg,
            &server,
            rolled_back,
            &[&p_file, &p_plist],
            LicenseOp::Status,
            Some(&existing),
        );
        assert!(!out.decision.licensed, "取 max 后仍应识破回拨");
    }

    // ⑧ 删单点(文件点被删),另一点仍拦。
    #[test]
    fn deleting_one_point_still_blocks() {
        let (sk, pk) = test_keypair();
        let server = FakeServer::ok(sk, valid_body());
        let cfg = config(&pk, true);
        let existing = {
            let mut s = snapshot_active();
            s.last_seen_ms = 0;
            s
        };
        let p_file = MemPoint::new(None); // 已被删除
        let p_plist = MemPoint::new(Some(NOW_MS));
        let rolled_back = NOW_MS - 4 * 3_600_000;
        let out = run(
            &cfg,
            &server,
            rolled_back,
            &[&p_file, &p_plist],
            LicenseOp::Status,
            Some(&existing),
        );
        assert!(!out.decision.licensed, "删单点后另一点仍应拦");
        assert_eq!(out.decision.status, "expired");
    }

    // ⑨ strict flag=0 降级:无签名头也按 success+valid 放行(P5 现状)+ 诚实标注。
    #[test]
    fn strict_off_falls_back_to_p5_with_honest_flag() {
        let (sk, pk) = test_keypair();
        let mut server = FakeServer::ok(sk, valid_body());
        server.no_signature_headers = true; // L1s 未上线:无任何签名头
        let cfg = config(&pk, false);
        let out = run(
            &cfg,
            &server,
            NOW_MS,
            &[],
            LicenseOp::Activate { code: "CODE-1" },
            None,
        );
        assert!(out.decision.licensed, "{:?}", out.decision);
        assert!(!out.decision.signature_verified);
        assert!(!out.decision.strict_verify);
        assert!(
            out.decision.message.contains("签名校验未启用"),
            "降级必须诚实标注: {}",
            out.decision.message
        );
        let snap = out.snapshot.unwrap();
        assert!(!snap.signature_verified);
    }

    // ⑩ 占位公钥 + 强验签 → 诚实失败(不冒充有真钥)。
    #[test]
    fn placeholder_pubkey_fails_honestly_in_strict() {
        let (sk, _) = test_keypair();
        let server = FakeServer::ok(sk, valid_body());
        let cfg = config(LICENSE_SERVER_PUBLIC_KEY_B64, true); // 占位空串
        let out = run(
            &cfg,
            &server,
            NOW_MS,
            &[],
            LicenseOp::Activate { code: "CODE-1" },
            None,
        );
        assert!(!out.decision.licensed);
        assert!(out.decision.message.contains("公钥"), "{}", out.decision.message);
    }

    // ⑪ 网络不可达 → 宽限窗内放行(grace),超窗拒;Activate 离线直接失败。
    #[test]
    fn offline_grace_semantics() {
        let (sk, pk) = test_keypair();
        let mut server = FakeServer::ok(sk, valid_body());
        server.network_error = true;
        let cfg = config(&pk, true);
        // 窗内:上次在线校 1h 前,grace 86400s。
        let existing = snapshot_active();
        let out = run(&cfg, &server, NOW_MS, &[], LicenseOp::Status, Some(&existing));
        assert!(out.decision.licensed);
        assert_eq!(out.decision.status, "grace");
        // 超窗:上次在线校 25h 前 > 86400s。
        let mut stale = snapshot_active();
        stale.last_online_check_ms = NOW_MS - 25 * 3_600_000;
        stale.last_seen_ms = NOW_MS - 25 * 3_600_000;
        let out2 = run(&cfg, &server, NOW_MS, &[], LicenseOp::Status, Some(&stale));
        assert!(!out2.decision.licensed);
        assert_eq!(out2.decision.status, "expired");
        // Activate 离线 → 失败(不写快照)。
        let out3 = run(
            &cfg,
            &server,
            NOW_MS,
            &[],
            LicenseOp::Activate { code: "C" },
            None,
        );
        assert!(!out3.decision.licensed);
        assert!(out3.snapshot.is_none());
    }

    // ⑫ 在线明确 revoked=true(签名可信)→ 不放行。
    #[test]
    fn revoked_response_blocks() {
        let (sk, pk) = test_keypair();
        let mut body = valid_body();
        body["revoked"] = serde_json::Value::Bool(true);
        let server = FakeServer::ok(sk, body);
        let cfg = config(&pk, true);
        let existing = snapshot_active();
        let out = run(&cfg, &server, NOW_MS, &[], LicenseOp::Status, Some(&existing));
        assert!(!out.decision.licensed);
        assert!(out.decision.revoked);
        let snap = out.snapshot.unwrap();
        assert!(snap.revoked);
        assert!(!snap.allowed);
    }

    // ⑬ 到期(用签过名的 serverTime 判,非墙钟)→ expired;买断 expiresAt=null 永不到期。
    #[test]
    fn expiry_uses_trusted_time_and_perpetual_never_expires() {
        let (sk, pk) = test_keypair();
        let mut body = valid_body();
        body["expiresAt"] = serde_json::Value::String("2026-07-17T11:00:00Z".to_string()); // 已过
        let server = FakeServer::ok(sk.clone(), body);
        let cfg = config(&pk, true);
        let out = run(
            &cfg,
            &server,
            NOW_MS,
            &[],
            LicenseOp::Activate { code: "C" },
            None,
        );
        assert!(!out.decision.licensed);
        assert_eq!(out.decision.status, "expired");
        // 买断:expiresAt=null。
        let mut body2 = valid_body();
        body2["expiresAt"] = serde_json::Value::Null;
        let server2 = FakeServer::ok(sk, body2);
        let out2 = run(
            &cfg,
            &server2,
            NOW_MS,
            &[],
            LicenseOp::Activate { code: "C" },
            None,
        );
        assert!(out2.decision.licensed);
        assert_eq!(out2.decision.mode, "perpetual");
    }

    // ⑭ .license 加解密 roundtrip(enc:v1: 封包,与 sidecar secret-crypto 同格式)。
    #[test]
    fn snapshot_encrypt_roundtrip() {
        let master = base64::engine::general_purpose::STANDARD.encode([9u8; 32]);
        let key = derive_license_key(&master).unwrap();
        let snap = snapshot_active();
        let packed = encrypt_snapshot(&snap, &key).unwrap();
        assert!(packed.starts_with(ENC_PREFIX));
        let back = decrypt_snapshot(&packed, Some(&key)).unwrap();
        assert_eq!(back.code, snap.code);
        assert!(back.allowed);
        // 错 key 解不开(auth tag 校验失败)。
        let wrong = derive_license_key(
            &base64::engine::general_purpose::STANDARD.encode([1u8; 32]),
        )
        .unwrap();
        assert!(decrypt_snapshot(&packed, Some(&wrong)).is_err());
    }

    // ⑮ ISO 解析健壮性(决策链的时间地基)。
    #[test]
    fn iso_parse_basics() {
        assert_eq!(parse_iso_ms("2026-07-17T12:00:00Z"), Some(NOW_MS));
        assert_eq!(
            parse_iso_ms("2026-07-17T12:00:00.500Z"),
            Some(NOW_MS + 500)
        );
        assert!(parse_iso_ms("not-a-date").is_none());
        assert!(parse_iso_ms("2026-07-17T12:00:00+08:00").is_none());
        assert_eq!(format_iso_ms(NOW_MS), "2026-07-17T12:00:00Z");
    }
}
