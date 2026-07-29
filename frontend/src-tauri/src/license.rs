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
/// [T-408] 在线校验瞬态自愈重试次数:验签/nonce/网络抖动等瞬态失败换新 nonce 重发的总尝试上限。
/// 真被篡改/重放则每次都挂、不会误放行(licensed 仍只由「验签通过 + valid」决定);瞬态(CDN 边缘
/// 抖动/连接复用/短暂坏缓存)通常一两次即恢复,不再把「疑似重放」这类术语糊到正版用户脸上。
const MAX_ONLINE_ATTEMPTS: u32 = 3;
/// last-seen 回拨容差(SPEC §6:3600 秒,容忍 DST 与合法小幅校时)。
const ROLLBACK_TOLERANCE_MS: i64 = 3_600_000;
/// [T-372 L3] 内测码(trial)离线宽限兜底:86400s = 24h(SPEC §7/§8 对照表「graceSeconds 下发」行;
/// 服务端下发优先,未下发时按码型兜底,不再共用 7 天旧值)。
const TRIAL_GRACE_SECONDS: i64 = 86_400;
/// [T-372 L3] 买断码(perpetual)graceSeconds 兜底:2_592_000s = 30 天(SPEC §8 对照表)。
/// 注:买断 fail-open,这个值不用于「锁」,只用于展示/心跳节奏参考。
const PERPETUAL_GRACE_SECONDS: i64 = 2_592_000;
/// [T-372 L3] 内测码心跳周期:3600s = 60min(SPEC §7「心跳 60 分钟」)。
const TRIAL_HEARTBEAT_SECS: u64 = 3_600;
/// [T-372 L3] 买断码心跳周期:2_592_000s = 30 天(SPEC §8「启动时一次 + 每 30 天」)。
const PERPETUAL_HEARTBEAT_SECS: u64 = 2_592_000;
/// `.license` 快照封包版本。
const SNAPSHOT_VERSION: u32 = 1;
/// [T-391 H-native §8 灭靶点] `.license` 加密密钥派生上下文(与 sidecar 侧
/// license-file.server.ts 必须一致 = "creatoros-license-v1")。
///
/// 原为 `const &[u8]` 明文常量 —— 是 grep/熵扫描定位「license 密钥派生」的高价值靶点。
/// 改为经 `obfstr::obfbytes!` 编译期混淆存储、运行时还原的函数:二进制内不再出现连续明文,
/// 而运行期返回的字节与旧常量**逐字节相同**(HKDF 上下文不变 → 与 sidecar 解密兼容)。
/// 诚实边界(SPEC §8):只抬静态 grep/pattern-scan 门槛,对 Frida 运行时无效(内存里仍还原)。
fn license_key_context() -> [u8; 20] {
    *obfstr::obfbytes!(b"creatoros-license-v1")
}
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
        let project_key = resolve_license_project_key(
            std::env::var("CREATOROS_LICENSE_PROJECT_KEY").ok(),
            option_env!("CREATOROS_BUILTIN_LICENSE_PROJECT_KEY").unwrap_or(""),
        );
        let strict_verify = std::env::var("CREATOROS_LICENSE_STRICT_VERIFY")
            .map(|v| v.trim() != "0")
            .unwrap_or(true);
        LicenseConfig {
            base_url,
            project_key,
            strict_verify,
            // [T-391 H-native §8] 经拆分重组取内嵌公钥(灭连续 32B 靶点),占位空钥 → 空串。
            public_key_b64: embedded_pubkey_b64(),
            machine_id,
        }
    }
}

fn resolve_license_project_key(runtime_value: Option<String>, built_in_value: &str) -> String {
    runtime_value
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .or_else(|| {
            let built_in = built_in_value.trim();
            (!built_in.is_empty()).then(|| built_in.to_string())
        })
        .unwrap_or_default()
}

// ─────────────────────────────────────────────────────────────────────────────
// `.license` 放行快照(Rust 独占写;sidecar 门只读)
// ─────────────────────────────────────────────────────────────────────────────

/// `.license` 明文形状(加密前 JSON,camelCase 与 sidecar 读端约定一致)。
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
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
    /// AM 签名响应中的当前渠道 identity；与 runtime 分开保存，确保改绑后即使新配置
    /// 暂不可读也不会跨 identity 沿用旧渠道入口。
    #[serde(default)]
    pub channel_ref: Option<String>,
    /// 仅完整强验签并通过 closed schema/identity/digest/version/净化后写入。
    #[serde(default)]
    pub channel_runtime: Option<CachedChannelRuntime>,
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
    /// [T-372 L3] 买断码被签名撤销后的软降级态:停止接收更新(不锁核心功能,SPEC §8)。
    /// `#[serde(default)]`:L2 旧快照无此字段,解析按 false 兼容(不 bump 版本强迫重激活)。
    #[serde(default)]
    pub updates_blocked: bool,
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
    /// "trial"(有到期)| "perpetual"(expiresAt=null 买断)。[T-372 L3] 两码型显式分支贯穿全链。
    pub mode: String,
    pub expires_at: Option<String>,
    pub revoked: bool,
    /// [T-372 L3] 买断码签名撤销的软降级(SPEC §8):true = 停更新 + 提示,核心功能照常。
    /// 内测码永不置 true(内测 revoked = 直接不放行)。
    pub updates_blocked: bool,
    /// [T-372 L3] 内测码离线宽限剩余秒数(SPEC §7 倒计时展示);仅 status="grace" 时有值。
    /// serde 名对齐 SPEC §9 前端形状 `offlineRemaining`。
    #[serde(rename = "offlineRemaining")]
    pub offline_remaining: Option<i64>,
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

/// [T-372 L3] graceSeconds 兜底按码型区分(SPEC §8 对照表:内测 86400 / 买断 2_592_000)。
/// 服务端下发值优先,本函数只在未下发时使用。
fn fallback_grace_seconds(expires_at: &Option<String>) -> i64 {
    if expires_at.is_none() {
        PERPETUAL_GRACE_SECONDS
    } else {
        TRIAL_GRACE_SECONDS
    }
}

/// [T-372 L3] 心跳周期按码型(SPEC §7/§8 对照表「心跳周期」行:内测 60min / 买断 30 天)。
pub fn heartbeat_interval_secs(mode: &str) -> u64 {
    if mode == "perpetual" {
        PERPETUAL_HEARTBEAT_SECS
    } else {
        TRIAL_HEARTBEAT_SECS
    }
}

/// [T-372 L3] 下一次心跳应睡多少秒:基础 = 码型周期;内测另外在**到期时刻**前唤醒一次
/// (SPEC §7「到期硬跳」:到点即查即跳,不等满一个 60min 周期)。纯函数,可单测。
pub fn next_heartbeat_secs(mode: &str, expires_at_ms: Option<i64>, wall_ms: i64) -> u64 {
    let base = heartbeat_interval_secs(mode);
    if mode != "perpetual" {
        if let Some(exp) = expires_at_ms {
            let remaining = (exp - wall_ms) / 1000;
            // 已到期(remaining ≤ 0)→ 1s 内立即复校;未到期但早于下个周期 → 到期时刻 +1s 唤醒。
            if remaining <= 0 {
                return 1;
            }
            if (remaining as u64) < base {
                return remaining as u64 + 1;
            }
        }
    }
    base
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

/// [T-391 H-native §8 灭靶点] 重组内嵌 Ed25519 公钥的 base64。
///
/// 设计(去掉连续 32B 高熵靶点):真钥填入时把 raw 32B **拆两片**,每片先 XOR 一段掩码,
/// 再各经 `obfstr::obfbytes!` 编译期混淆存储;运行时 XOR 还原后**重组**,并做 **3 处交叉校验**
/// (①两片掩码还原 ②长度必须 32 ③SHA-256 前缀指纹比对,防单片被 patch)。二进制内不再有
/// 连续 32B 的公钥常量可供 `binwalk`/熵扫描定位或直接 key-swap。
/// 当前为**占位空钥**(L1s 服务端公钥待填)→ 两片皆空 → 返回空串;strict 下
/// `resolve_public_key` 会诚实全拒(见 `placeholder_pubkey_fails_honestly_in_strict`)。
/// 诚实边界(SPEC §8):灭靶点只对静态逆向有效,对 Frida 运行时无效(程序一跑内存还原)。
pub(crate) fn embedded_pubkey_b64() -> String {
    // 真钥已填(2026-07-17,L1s activation-manager dfe7cfc 配对私钥;冷备 ~/.creatoros/license-signing-keypair.txt):
    // raw = frag_a^mask_a || frag_b^mask_b,fingerprint = sha256(raw)[..4]。
    let frag_a: &[u8] =
        obfstr::obfbytes!(b"\xb4\x74\xd0\x36\x01\x48\x2d\x38\xe0\x60\xdd\x14\x02\x93\x1f\xd7");
    let frag_b: &[u8] =
        obfstr::obfbytes!(b"\xe4\x98\xf8\x0f\x48\xd5\x20\xf1\x2d\x7b\x1e\x60\x26\xa3\x90\xe3");
    let mask_a: &[u8] =
        obfstr::obfbytes!(b"\xfa\x0b\xaf\x3a\xd0\xfd\xad\xeb\xbb\xb9\x20\xe3\xa1\x42\x9f\xec");
    let mask_b: &[u8] =
        obfstr::obfbytes!(b"\xc4\xd3\x1e\x14\x9a\x2a\xec\x85\x38\x9d\xa9\xeb\xd9\x47\xf1\x9e");
    let fingerprint: &[u8] = obfstr::obfbytes!(b"\xe1\xd4\x82\xc5"); // sha256(raw)[..4]
    match reassemble_pubkey_fragments(frag_a, frag_b, mask_a, mask_b, fingerprint) {
        Some(raw) => base64::engine::general_purpose::STANDARD.encode(raw),
        // 占位空钥(L1s 服务端公钥待填)——沿用既有占位常量,strict 下诚实全拒。
        None => LICENSE_SERVER_PUBLIC_KEY_B64.to_string(),
    }
}

/// 公钥两片重组 + 交叉校验(纯函数,便于单测)。任一交叉校验不过 → None(视同未配置公钥,
/// strict 下诚实全拒);两片皆空 = 占位空钥 → None。
fn reassemble_pubkey_fragments(
    frag_a: &[u8],
    frag_b: &[u8],
    mask_a: &[u8],
    mask_b: &[u8],
    fingerprint: &[u8],
) -> Option<Vec<u8>> {
    if frag_a.is_empty() && frag_b.is_empty() {
        return None; // 占位空钥
    }
    // 交叉校验①:两片各 XOR 掩码还原(长度必须与掩码对齐)。
    if frag_a.len() != mask_a.len() || frag_b.len() != mask_b.len() {
        return None;
    }
    let mut raw = Vec::with_capacity(frag_a.len() + frag_b.len());
    raw.extend(frag_a.iter().zip(mask_a).map(|(b, m)| b ^ m));
    raw.extend(frag_b.iter().zip(mask_b).map(|(b, m)| b ^ m));
    // 交叉校验②:Ed25519 公钥必须恰好 32B。
    if raw.len() != 32 {
        return None;
    }
    // 交叉校验③:SHA-256 前缀指纹比对(单片被 patch → 指纹不符 → 拒绝重组)。
    if !fingerprint.is_empty() {
        let digest = sha256_bytes(&raw);
        let n = fingerprint.len().min(32);
        if digest[..n] != fingerprint[..n] {
            return None;
        }
    }
    Some(raw)
}

/// 解析内嵌公钥。占位空串/坏值 → Err(人话),强验签下由调用方诚实拒绝。
pub fn resolve_public_key(b64: &str) -> Result<VerifyingKey, String> {
    let trimmed = b64.trim();
    if trimmed.is_empty() {
        return Err(obfstr::obfstring!(
            "授权验签公钥尚未配置(L1s 服务端公钥待填,当前为占位常量)——强验签模式下无法信任任何响应"
        ));
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
    let sig =
        Signature::from_slice(&sig_raw).map_err(|_| "X-License-Signature 长度非法".to_string())?;

    let signing_string = build_signing_string(request_target, host, date, &computed);
    key.verify(signing_string.as_bytes(), &sig)
        .map_err(|_| obfstr::obfstring!("Ed25519 验签失败(签名伪造或响应被篡改)"))
}

// ─────────────────────────────────────────────────────────────────────────────
// [T-391 H-native §7] 反调试自检 + 放行去单点化
//
// 诚实边界(SPEC §7/§16,不动摇):以下三样只把 attach/静态 patch 从「分钟级」抬到「需真
// 逆向」——**都不防专业逆向**。反调试对 Frida spawn/gadget 预载无效;去单点化 patch 编译后
// 二进制仍可绕;灭靶点只对静态 grep 有效。真正兜底靠 Part C 服务端吊销(非本仓,后续波次)。
// ─────────────────────────────────────────────────────────────────────────────

/// 反调试探针(注入式端口:生产用系统调用,单测注入 fake「被 traced」信号)。
pub trait DebugProbe {
    fn is_traced(&self) -> bool;
}

/// 生产探针:macOS 走 `sysctl(KERN_PROC)` 查 `P_TRACED`;Windows(cfg,内测不编译)走
/// `secmem-proc` 的 winapi 检测;其余平台恒 false(不误伤)。
pub struct SysDebugProbe;
impl DebugProbe for SysDebugProbe {
    fn is_traced(&self) -> bool {
        sys_is_traced()
    }
}

#[inline(always)]
fn sys_is_traced() -> bool {
    #[cfg(target_os = "macos")]
    {
        macos_is_traced()
    }
    #[cfg(target_os = "windows")]
    {
        // [SPEC §7 gate-A1] Windows 分支挂靠 T-372 DEC-W,随 W-cluster 落地;内测 macOS 不编译。
        // secmem-proc 的 check_tracer_winapi 内含 IsDebuggerPresent/CheckRemoteDebuggerPresent。
        secmem_proc::components::check_tracer_winapi().is_err()
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        false
    }
}

/// macOS 反调试探针:`sysctl(CTL_KERN, KERN_PROC, KERN_PROC_PID, pid)` 取本进程 `kinfo_proc`,
/// 读 `kp_proc.p_flag & P_TRACED`(Apple TN2127「AmIBeingDebugged」经典手法)。
///
/// libc 0.2 未导出 `kinfo_proc` 结构体,故用**原始字节缓冲**接收内核写回的整块 `kinfo_proc`
/// (先查所需字节数再分配,避免定义大结构体或写越界),再从固定偏移读 `p_flag`:
/// 64-bit macOS 下 `extern_proc.p_flag` 偏移 = 32(p_un 16 + p_vmspace 8 + p_sigacts 8)。
/// **任何系统调用失败一律返回 false**(保守判「未被 trace」,避免误伤正常用户;不硬崩、
/// 不给「崩溃点=判定点」定位信号)。
#[cfg(target_os = "macos")]
fn macos_is_traced() -> bool {
    const P_TRACED: i32 = 0x0000_0800; // <sys/proc.h>
    const P_FLAG_OFFSET: usize = 32; // extern_proc.p_flag on 64-bit macOS
    unsafe {
        let mut mib: [libc::c_int; 4] = [
            libc::CTL_KERN,
            libc::KERN_PROC,
            libc::KERN_PROC_PID,
            libc::getpid(),
        ];
        // ① 查所需字节数(oldp=null)。
        let mut size: libc::size_t = 0;
        let rc = libc::sysctl(
            mib.as_mut_ptr(),
            4,
            std::ptr::null_mut(),
            &mut size,
            std::ptr::null_mut(),
            0,
        );
        if rc != 0 || size < P_FLAG_OFFSET + 4 {
            return false;
        }
        // ② 分配并取回整块 kinfo_proc。
        let mut buf = vec![0u8; size];
        let rc = libc::sysctl(
            mib.as_mut_ptr(),
            4,
            buf.as_mut_ptr() as *mut libc::c_void,
            &mut size,
            std::ptr::null_mut(),
            0,
        );
        if rc != 0 || size < P_FLAG_OFFSET + 4 {
            return false;
        }
        let p_flag = i32::from_ne_bytes([
            buf[P_FLAG_OFFSET],
            buf[P_FLAG_OFFSET + 1],
            buf[P_FLAG_OFFSET + 2],
            buf[P_FLAG_OFFSET + 3],
        ]);
        (p_flag & P_TRACED) != 0
    }
}

/// 启动期反调试硬化(best-effort,**绝不阻断/panic/abort**):经 `secmem-proc` 做
/// `PT_DENY_ATTACH`(macOS)+ 关 core dump(防崩溃转储捞密钥)+ Windows 进程 DACL/anti-tracer。
/// 失败只静默(不打定位性日志,不给攻击者「这里在自检」的信号)。
///
/// 仅在 release 构建生效(`debug_assertions` 关):dev 构建保留可调试性,避免自我 DoS 开发流程;
/// 内测/正式分发是 release → 硬化生效。检测本身(`is_traced`)不受此限,任何构建都跑。
pub fn harden_anti_debug() {
    #[cfg(not(debug_assertions))]
    {
        let _ = secmem_proc::harden_process(); // Err 静默吞掉:硬化失败不阻断启动
    }
}

/// [SPEC §7 去单点化] 放行能力值:**不是读取一个 bool**,而是把判定的多项证据喂进 SHA-256
/// 派生一个 32B 能力值。只有证据规范自洽(licensed=true、status∈{active,grace}、未被 trace)
/// 时,派生值才等于同 mode 的「解锁指纹」(`unlock_fingerprint`)。任一证据翻转 → 派生值不同。
///
/// 「参与后续真实计算」:放行不是孤立的 `if licensed {}`,而是这个派生值在 3 个独立调用点
/// (`run_chain_and_persist` / `license_check`·`license_activate` / `license_last_decision`)
/// 各自复算并与指纹比对 —— hook/patch 掉其中一处,另两处仍复算降级(非「跳过照常跑」)。
#[inline(always)]
fn derive_capability(licensed: bool, status: &str, mode: &str, traced: bool) -> [u8; 32] {
    let status_grants = matches!(status, "active" | "grace");
    let mut h = Sha256::new();
    h.update(obfstr::obfbytes!(b"creatoros-gate-capability-v1"));
    h.update([licensed as u8, status_grants as u8, (!traced) as u8]);
    h.update(mode.as_bytes());
    h.finalize().into()
}

/// 规范放行输入(licensed=true、status=active、未 trace)在给定 mode 下的能力指纹。
#[inline(always)]
fn unlock_fingerprint(mode: &str) -> [u8; 32] {
    derive_capability(true, "active", mode, false)
}

/// 判定是否「真正解锁」= 能力值命中指纹(去单点化的多点复算核心)。
/// 注:status="grace"(离线宽限)与 "active" 同权放行 —— 用 status=active 的指纹归一化比对。
#[inline(always)]
fn is_capability_unlocked(d: &GateDecision, traced: bool) -> bool {
    if traced {
        return false;
    }
    let normalized_status = if matches!(d.status.as_str(), "active" | "grace") {
        "active"
    } else {
        d.status.as_str()
    };
    let cap = derive_capability(d.licensed, normalized_status, &d.mode, traced);
    cap == unlock_fingerprint(&d.mode)
}

/// [SPEC §7] 失败延迟随机化:降级路径上睡一小段随机时间,让「hook 后秒过」不稳定、增加
/// pattern-scan 对齐判定点的难度。仅非测试构建生效(测试不引入耗时/抖动)。
#[inline(always)]
fn randomized_backoff() {
    #[cfg(not(test))]
    {
        use rand::Rng as _;
        let ms = rand::rngs::OsRng.gen_range(3u64..40);
        std::thread::sleep(std::time::Duration::from_millis(ms));
    }
}

/// [T-408] 瞬态重试小退避:第 n 次重试前睡 150ms×n(1→150,2→300),让 CDN 边缘/连接抖动过去。
/// 仅非测试构建生效(测试零耗时)。
#[inline(always)]
fn transient_backoff(attempt: u32) {
    #[cfg(not(test))]
    {
        std::thread::sleep(std::time::Duration::from_millis(150u64 * attempt as u64));
    }
    #[cfg(test)]
    {
        let _ = attempt;
    }
}

/// [SPEC §7 去单点化 + 反调试] 运行期放行门:在 3 个独立调用点各跑一次。
///   · 探到调试器 trace **或** 决策证据不自洽(如 licensed 被单独 patch 成 true 而 status
///     并非 active/grace)→ **静默降级**:licensed=false + status=untrusted,**绝不 panic、
///     绝不硬崩、绝不放行**(不给「崩溃点=判定点」信号,也不误伤 —— 正常放行原样返回)。
///   · 证据自洽且未被 trace → **原样返回**(不改任何字段,保证 P5 弱验签/买断 fail-open 不被卡)。
fn apply_runtime_gate(mut d: GateDecision, probe: &dyn DebugProbe) -> GateDecision {
    if !d.licensed {
        return d; // 本就不放行,无需复算(降级只针对「声称放行」的决策)
    }
    let traced = probe.is_traced();
    if !is_capability_unlocked(&d, traced) {
        randomized_backoff();
        d.licensed = false;
        d.updates_blocked = false;
        d.offline_remaining = None;
        d.status = "untrusted".to_string();
        d.message = obfstr::obfstring!("授权状态无法确认,请联网重新校验");
    }
    d
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

pub(crate) fn format_iso_ms(ms: i64) -> String {
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
/// [T-372 L3] 心跳循环的日志计时读它(改系统时间不影响心跳节奏与日志刻度)。
pub struct SessionMonotonic {
    started: std::time::Instant,
}

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
            eprintln!(
                "[license] 写 last-seen 文件失败({}): {e}",
                self.path.display()
            );
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
        String::from_utf8_lossy(&out.stdout)
            .trim()
            .parse::<i64>()
            .ok()
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
    h.update(license_key_context());
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

fn snapshot_content(snap: &LicenseSnapshot, key: Option<&[u8; 32]>) -> Result<String, String> {
    let content = match key {
        Some(k) => encrypt_snapshot(snap, k)?,
        None => {
            // 无 master key 时保留既有授权快照兼容，但 runtime 必须 fail-closed：不得把已签
            // 商业入口、渠道 identity/摘要降级写成明文。
            eprintln!("[license] 无 master key,.license 明文兼容写入但丢弃渠道 runtime");
            let mut degraded = snap.clone();
            degraded.channel_ref = None;
            degraded.channel_runtime = None;
            serde_json::to_string(&degraded).map_err(|e| format!(".license 序列化失败: {e}"))?
        }
    };
    Ok(content)
}

/// [T-575] 需要知道 replace 是否真的完成，不能沿用 best-effort void 写法猜成功。
/// 所有平台先写同目录临时文件并 fsync，再以平台原子 replace primitive 替换目标。
pub fn write_snapshot_file_checked(
    path: &Path,
    snap: &LicenseSnapshot,
    key: Option<&[u8; 32]>,
) -> Result<(), String> {
    let content = snapshot_content(snap, key)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("创建 .license 目录失败: {e}"))?;
    }
    let mut suffix = [0u8; 8];
    use rand::RngCore as _;
    rand::rngs::OsRng.fill_bytes(&mut suffix);
    let suffix = suffix
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect::<String>();
    let tmp = path.with_extension(format!("license.tmp.{suffix}"));
    let write_result = (|| -> std::io::Result<()> {
        use std::io::Write as _;
        let mut options = std::fs::OpenOptions::new();
        options.create_new(true).write(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt as _;
            options.mode(0o600);
        }
        let mut file = options.open(&tmp)?;
        file.write_all(content.as_bytes())?;
        file.flush()?;
        file.sync_all()?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt as _;
            std::fs::set_permissions(&tmp, std::fs::Permissions::from_mode(0o600))?;
        }
        Ok(())
    })();
    if let Err(e) = write_result {
        let _ = std::fs::remove_file(&tmp);
        return Err(format!("写 .license 临时文件失败: {e}"));
    }

    #[cfg(unix)]
    {
        if let Err(e) = std::fs::rename(&tmp, path) {
            let _ = std::fs::remove_file(&tmp);
            return Err(format!("原子替换 .license 失败: {e}"));
        }
        if let Some(parent) = path.parent() {
            std::fs::File::open(parent)
                .and_then(|file| file.sync_all())
                .map_err(|e| format!("同步 .license 目录失败: {e}"))?;
        }
    }

    #[cfg(windows)]
    {
        use std::os::windows::ffi::OsStrExt as _;
        type Bool = i32;
        extern "system" {
            fn ReplaceFileW(
                replaced: *const u16,
                replacement: *const u16,
                backup: *const u16,
                flags: u32,
                exclude: *mut core::ffi::c_void,
                reserved: *mut core::ffi::c_void,
            ) -> Bool;
            fn MoveFileExW(existing: *const u16, new: *const u16, flags: u32) -> Bool;
        }
        const REPLACEFILE_WRITE_THROUGH: u32 = 0x0000_0002;
        const MOVEFILE_WRITE_THROUGH: u32 = 0x0000_0008;
        let wide = |value: &Path| {
            value
                .as_os_str()
                .encode_wide()
                .chain(std::iter::once(0))
                .collect::<Vec<_>>()
        };
        let target_wide = wide(path);
        let tmp_wide = wide(&tmp);
        let ok = unsafe {
            if path.exists() {
                ReplaceFileW(
                    target_wide.as_ptr(),
                    tmp_wide.as_ptr(),
                    std::ptr::null(),
                    REPLACEFILE_WRITE_THROUGH,
                    std::ptr::null_mut(),
                    std::ptr::null_mut(),
                )
            } else {
                MoveFileExW(
                    tmp_wide.as_ptr(),
                    target_wide.as_ptr(),
                    MOVEFILE_WRITE_THROUGH,
                )
            }
        };
        if ok == 0 {
            let error = std::io::Error::last_os_error();
            let _ = std::fs::remove_file(&tmp);
            return Err(format!("Windows 原子替换 .license 失败: {error}"));
        }
    }
    Ok(())
}

pub fn write_snapshot_file(path: &Path, snap: &LicenseSnapshot, key: Option<&[u8; 32]>) {
    if let Err(e) = write_snapshot_file_checked(path, snap, key) {
        eprintln!("[license] 写 .license 失败({}): {e}", path.display());
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// [T-534] Growth→AM→Creator 已签名渠道运行时
// ─────────────────────────────────────────────────────────────────────────────

/// 加密写入 `.license` 的已验证 runtime。v2 保存完整防降级元数据；legacy v1 仅保存
/// 四个旧字段的安全投影，绝不伪造 v2 摘要/版本。
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CachedChannelRuntime {
    pub schema_version: String,
    pub contract_version: Option<String>,
    pub project_key: String,
    pub channel_ref: String,
    pub snapshot_version: Option<u64>,
    pub source_digest: Option<String>,
    pub source: Option<String>,
    pub source_updated_at: Option<String>,
    pub synced_at: Option<String>,
    pub stale: Option<bool>,
    pub brand_name: Option<String>,
    pub purchase_url: Option<String>,
    pub renewal_url: Option<String>,
    pub channel_support_url: Option<String>,
    pub bug_feedback_url: Option<String>,
    pub download_url: Option<String>,
    pub support_url: Option<String>,
}

const RUNTIME_V2_KEYS: [&str; 17] = [
    "brandName",
    "bugFeedbackUrl",
    "channelRef",
    "channelSupportUrl",
    "contractVersion",
    "downloadUrl",
    "projectKey",
    "purchaseUrl",
    "renewalUrl",
    "schemaVersion",
    "snapshotVersion",
    "source",
    "sourceDigest",
    "sourceUpdatedAt",
    "stale",
    "supportUrl",
    "syncedAt",
];
const RUNTIME_LEGACY_KEYS: [&str; 4] = ["brandName", "downloadUrl", "purchaseUrl", "supportUrl"];

fn has_exact_keys(value: &serde_json::Value, expected: &[&str]) -> bool {
    let Some(obj) = value.as_object() else {
        return false;
    };
    if obj.len() != expected.len() {
        return false;
    }
    obj.keys().all(|key| expected.contains(&key.as_str()))
}

fn nullable_string(value: &serde_json::Value, key: &str) -> Result<Option<String>, &'static str> {
    match value.get(key) {
        Some(serde_json::Value::Null) => Ok(None),
        Some(serde_json::Value::String(s)) => Ok(Some(s.clone())),
        _ => Err("CHANNEL_RUNTIME_SCHEMA_INVALID"),
    }
}

/// URL contract：NFC 后 literal lowercase HTTPS + DNS host；禁止 userinfo/port/IP/
/// localhost/反斜杠/控制与空白/路径穿越/危险 percent 编码；query/fragment 保留。
fn sanitize_runtime_url(raw: Option<String>) -> Result<Option<String>, &'static str> {
    use unicode_normalization::UnicodeNormalization as _;
    let Some(raw) = raw else {
        return Ok(None);
    };
    let value: String = raw.trim().nfc().collect();
    if value.chars().count() > 2048
        || value.len() > 8192
        || !value.starts_with("https://")
        || value.chars().any(|c| {
            c == '\\'
                || c.is_whitespace()
                || (c as u32) <= 0x1f
                || (0x7f..=0x9f).contains(&(c as u32))
        })
    {
        return Err("CHANNEL_RUNTIME_VALUE_INVALID");
    }
    let after_scheme = &value["https://".len()..];
    let raw_authority = after_scheme
        .split(['/', '?', '#'])
        .next()
        .unwrap_or_default();
    if raw_authority.is_empty()
        || !raw_authority.is_ascii()
        || raw_authority.contains('@')
        || raw_authority.contains(':')
    {
        return Err("CHANNEL_RUNTIME_VALUE_INVALID");
    }
    let parsed = url::Url::parse(&value).map_err(|_| "CHANNEL_RUNTIME_VALUE_INVALID")?;
    if parsed.scheme() != "https"
        || !parsed.username().is_empty()
        || parsed.password().is_some()
        || parsed.port().is_some()
    {
        return Err("CHANNEL_RUNTIME_VALUE_INVALID");
    }
    let host = parsed.host_str().ok_or("CHANNEL_RUNTIME_VALUE_INVALID")?;
    if !host.is_ascii()
        || host.eq_ignore_ascii_case("localhost")
        || !host.contains('.')
        || host.ends_with('.')
        || host.parse::<std::net::IpAddr>().is_ok()
        || host.len() > 253
        || host.split('.').any(|label| {
            label.is_empty()
                || label.len() > 63
                || label.starts_with('-')
                || label.ends_with('-')
                || !label
                    .bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b == b'-')
        })
    {
        return Err("CHANNEL_RUNTIME_VALUE_INVALID");
    }
    let bytes = value.as_bytes();
    let mut i = 0usize;
    while i < bytes.len() {
        if bytes[i] == b'%' {
            if i + 2 >= bytes.len()
                || !bytes[i + 1].is_ascii_hexdigit()
                || !bytes[i + 2].is_ascii_hexdigit()
                || (bytes[i + 1].is_ascii_lowercase() && bytes[i + 1].is_ascii_alphabetic())
                || (bytes[i + 2].is_ascii_lowercase() && bytes[i + 2].is_ascii_alphabetic())
            {
                return Err("CHANNEL_RUNTIME_VALUE_INVALID");
            }
            let hex = std::str::from_utf8(&bytes[i + 1..i + 3])
                .ok()
                .and_then(|s| u8::from_str_radix(s, 16).ok())
                .ok_or("CHANNEL_RUNTIME_VALUE_INVALID")?;
            if matches!(hex, b'/' | b'\\' | b'?' | b'#') {
                return Err("CHANNEL_RUNTIME_VALUE_INVALID");
            }
            i += 3;
        } else {
            i += 1;
        }
    }
    // 只检查 query/fragment 前的原始 path；`.`/`..` 及其 percent 形式均拒绝。
    let after_authority = &value["https://".len()..];
    let raw_path = after_authority
        .find('/')
        .map(|at| &after_authority[at..])
        .unwrap_or("");
    let raw_path = raw_path.split(['?', '#']).next().unwrap_or(raw_path);
    for segment in raw_path.split('/') {
        let lower = segment.to_ascii_lowercase();
        if segment == "."
            || segment == ".."
            || lower == "%2e"
            || lower == "%2e%2e"
            || lower == ".%2e"
            || lower == "%2e."
        {
            return Err("CHANNEL_RUNTIME_VALUE_INVALID");
        }
    }
    Ok(Some(value))
}

fn runtime_brand(value: &serde_json::Value) -> Result<Option<String>, &'static str> {
    let raw = nullable_string(value, "brandName")?;
    let Some(raw) = raw else {
        return Ok(None);
    };
    let cleaned: String = raw.chars().filter(|c| !c.is_control()).collect();
    let trimmed = cleaned.trim();
    if trimmed.is_empty() || trimmed.chars().count() > 30 {
        return Err("CHANNEL_RUNTIME_VALUE_INVALID");
    }
    Ok(Some(trimmed.to_string()))
}

pub(crate) fn parse_signed_channel_runtime(
    value: &serde_json::Value,
    expected_project_key: &str,
    signed_channel_ref: Option<&str>,
) -> Result<CachedChannelRuntime, &'static str> {
    let Some(obj) = value.as_object() else {
        return Err("CHANNEL_RUNTIME_SCHEMA_INVALID");
    };
    match obj.get("schemaVersion") {
        None => {
            if !has_exact_keys(value, &RUNTIME_LEGACY_KEYS) {
                return Err("CHANNEL_RUNTIME_LEGACY_INVALID");
            }
            let channel_ref = signed_channel_ref.ok_or("CHANNEL_RUNTIME_IDENTITY_MISMATCH")?;
            let support_url = sanitize_runtime_url(nullable_string(value, "supportUrl")?)?;
            Ok(CachedChannelRuntime {
                schema_version: "channel-runtime-legacy-v1".to_string(),
                contract_version: None,
                project_key: expected_project_key.to_string(),
                channel_ref: channel_ref.to_string(),
                snapshot_version: None,
                source_digest: None,
                source: None,
                source_updated_at: None,
                synced_at: None,
                stale: None,
                brand_name: runtime_brand(value)?,
                purchase_url: sanitize_runtime_url(nullable_string(value, "purchaseUrl")?)?,
                renewal_url: None,
                channel_support_url: support_url.clone(),
                bug_feedback_url: None,
                download_url: sanitize_runtime_url(nullable_string(value, "downloadUrl")?)?,
                support_url,
            })
        }
        Some(serde_json::Value::String(schema)) if schema == "channel-runtime-v2" => {
            if !has_exact_keys(value, &RUNTIME_V2_KEYS) {
                return Err("CHANNEL_RUNTIME_SCHEMA_INVALID");
            }
            let string = |key: &str| {
                value
                    .get(key)
                    .and_then(|v| v.as_str())
                    .filter(|s| !s.is_empty())
                    .ok_or("CHANNEL_RUNTIME_SCHEMA_INVALID")
            };
            let project_key = string("projectKey")?;
            let channel_ref = string("channelRef")?;
            let valid_identity = |value: &str| {
                !value.is_empty()
                    && value.len() <= 64
                    && value
                        .bytes()
                        .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
            };
            if !valid_identity(project_key) || !valid_identity(channel_ref) {
                return Err("CHANNEL_RUNTIME_VALUE_INVALID");
            }
            if project_key != expected_project_key || signed_channel_ref != Some(channel_ref) {
                return Err("CHANNEL_RUNTIME_IDENTITY_MISMATCH");
            }
            if string("contractVersion")? != "growth-channel-runtime-v1"
                || string("source")? != "thirdspace-growth"
            {
                return Err("CHANNEL_RUNTIME_VALUE_INVALID");
            }
            let snapshot_version = value
                .get("snapshotVersion")
                .and_then(|v| v.as_u64())
                .filter(|v| *v > 0)
                .ok_or("CHANNEL_RUNTIME_SCHEMA_INVALID")?;
            let stale = value
                .get("stale")
                .and_then(|v| v.as_bool())
                .ok_or("CHANNEL_RUNTIME_SCHEMA_INVALID")?;
            let config = serde_json::json!({
                "brandName": value["brandName"].clone(),
                "purchaseUrl": value["purchaseUrl"].clone(),
                "renewalUrl": value["renewalUrl"].clone(),
                "channelSupportUrl": value["channelSupportUrl"].clone(),
                "bugFeedbackUrl": value["bugFeedbackUrl"].clone(),
                "downloadUrl": value["downloadUrl"].clone(),
            });
            let semantic = serde_json::json!({
                "contractVersion": value["contractVersion"].clone(),
                "sourceSystem": value["source"].clone(),
                "projectKey": value["projectKey"].clone(),
                "channelRef": value["channelRef"].clone(),
                "snapshotVersion": value["snapshotVersion"].clone(),
                "sourceUpdatedAt": value["sourceUpdatedAt"].clone(),
                "config": config,
            });
            let canonical = serde_json_canonicalizer::to_string(&semantic)
                .map_err(|_| "CHANNEL_RUNTIME_VALUE_INVALID")?;
            let recomputed = format!("sha256:{:x}", Sha256::digest(canonical.as_bytes()));
            let source_digest = string("sourceDigest")?;
            if source_digest != recomputed {
                return Err("CHANNEL_RUNTIME_DIGEST_MISMATCH");
            }
            let source_updated_at = string("sourceUpdatedAt")?;
            let synced_at = string("syncedAt")?;
            if parse_iso_ms(source_updated_at).is_none() || parse_iso_ms(synced_at).is_none() {
                return Err("CHANNEL_RUNTIME_VALUE_INVALID");
            }
            let channel_support_url =
                sanitize_runtime_url(nullable_string(value, "channelSupportUrl")?)?;
            let support_url = sanitize_runtime_url(nullable_string(value, "supportUrl")?)?;
            if support_url != channel_support_url {
                return Err("CHANNEL_RUNTIME_VALUE_INVALID");
            }
            Ok(CachedChannelRuntime {
                schema_version: "channel-runtime-v2".to_string(),
                contract_version: Some("growth-channel-runtime-v1".to_string()),
                project_key: project_key.to_string(),
                channel_ref: channel_ref.to_string(),
                snapshot_version: Some(snapshot_version),
                source_digest: Some(source_digest.to_string()),
                source: Some("thirdspace-growth".to_string()),
                source_updated_at: Some(source_updated_at.to_string()),
                synced_at: Some(synced_at.to_string()),
                stale: Some(stale),
                brand_name: runtime_brand(value)?,
                purchase_url: sanitize_runtime_url(nullable_string(value, "purchaseUrl")?)?,
                renewal_url: sanitize_runtime_url(nullable_string(value, "renewalUrl")?)?,
                channel_support_url,
                bug_feedback_url: sanitize_runtime_url(nullable_string(value, "bugFeedbackUrl")?)?,
                download_url: sanitize_runtime_url(nullable_string(value, "downloadUrl")?)?,
                support_url,
            })
        }
        Some(_) => Err("CHANNEL_RUNTIME_SCHEMA_UNSUPPORTED"),
    }
}

#[derive(Clone)]
struct RuntimeResolution {
    channel_ref: Option<String>,
    runtime: Option<CachedChannelRuntime>,
}

fn resolve_channel_runtime(
    existing: Option<&LicenseSnapshot>,
    expected_project_key: &str,
    signed_channel_ref: &Option<Option<String>>,
    raw_channel_config: Option<&serde_json::Value>,
    signature_verified: bool,
) -> RuntimeResolution {
    let old_ref = existing.and_then(|s| s.channel_ref.clone());
    let old_runtime = existing.and_then(|s| s.channel_runtime.clone());
    // T-534 runtime 不接受 gate-F2 弱验签。旧 AM 未下发 channelRef 时也不擅自改变 identity。
    if !signature_verified || signed_channel_ref.is_none() {
        return RuntimeResolution {
            channel_ref: old_ref,
            runtime: old_runtime,
        };
    }
    let new_ref = signed_channel_ref.clone().flatten();
    let same_identity = new_ref == old_ref;
    let Some(ref channel_ref) = new_ref else {
        return RuntimeResolution {
            channel_ref: None,
            runtime: None,
        };
    };
    let parsed = match raw_channel_config {
        Some(serde_json::Value::Object(_)) => parse_signed_channel_runtime(
            raw_channel_config.expect("matched Some"),
            expected_project_key,
            Some(channel_ref.as_str()),
        ),
        Some(serde_json::Value::Null) | None => {
            return RuntimeResolution {
                channel_ref: new_ref,
                runtime: if same_identity { old_runtime } else { None },
            };
        }
        Some(_) => Err("CHANNEL_RUNTIME_SCHEMA_INVALID"),
    };
    let candidate = match parsed {
        Ok(candidate) => candidate,
        Err(code) => {
            eprintln!("[license] {code}");
            return RuntimeResolution {
                channel_ref: new_ref,
                runtime: if same_identity { old_runtime } else { None },
            };
        }
    };
    if !same_identity {
        return RuntimeResolution {
            channel_ref: new_ref,
            runtime: Some(candidate),
        };
    }
    let Some(old) = old_runtime else {
        return RuntimeResolution {
            channel_ref: new_ref,
            runtime: Some(candidate),
        };
    };
    // v2 绝不被 legacy/null/未知 schema 降级覆盖。
    if old.schema_version == "channel-runtime-v2"
        && candidate.schema_version != "channel-runtime-v2"
    {
        return RuntimeResolution {
            channel_ref: new_ref,
            runtime: Some(old),
        };
    }
    match (old.snapshot_version, candidate.snapshot_version) {
        (Some(old_version), Some(new_version)) if new_version < old_version => {
            eprintln!("[license] CHANNEL_RUNTIME_VERSION_STALE");
            RuntimeResolution {
                channel_ref: new_ref,
                runtime: Some(old),
            }
        }
        (Some(old_version), Some(new_version)) if new_version == old_version => {
            if old.source_digest != candidate.source_digest {
                eprintln!("[license] CHANNEL_RUNTIME_VERSION_COLLISION");
            }
            RuntimeResolution {
                channel_ref: new_ref,
                runtime: Some(old),
            }
        }
        _ => RuntimeResolution {
            channel_ref: new_ref,
            runtime: Some(candidate),
        },
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// [T-396b] 渠道链接缓存(`.channel-links`,Rust 独占写;sidecar/前端只读)
// ─────────────────────────────────────────────────────────────────────────────
//
// 白标红线(SPEC §5/§7):客户端所有对外商业跳转(购买/续期、联系授权方、下载新版)按
// 激活码所属渠道运行时下发;**包内不留官方链接硬编码,null 绝不回退官方链接**(防代理码
// 用户看到官方定价)。本缓存只在决策链**接受**的响应(强验签 = 签名/date/nonce 全过;
// 弱验签 = gate-F2 显式过渡)携带 `channelConfig` 字段时更新:
//   · 字段缺失(旧服务端,T-396a 未上线)→ 不动缓存(向后兼容);
//   · 字段显式 null(码无渠道 / 渠道未配置)→ 覆写为 null(中性降级,不回退旧链接以外
//     的任何默认值 —— 服务端说没有就是没有);
//   · 验签失败 / 离线 → 决策链在进 body 前已 return(untrusted/offline),到不了这里,
//     旧缓存自然保留(SPEC §7「验签拒,弃用;沿用旧缓存或中性降级」)。
// 明文 JSON(链接本就展示给用户,非机密;sidecar 无 master key 也须可读);带 schema
// `version` 字段,读端不匹配即丢弃走心跳重取(向前兼容零迁移)。
// 重置语义:workspace_reset 只归档 db/ 与 .auth/,appDataDir 根文件天然保留(测锚同 .license)。

/// `.channel-links` 缓存 schema 版本(读端不匹配 → 丢弃重取)。
#[cfg(test)]
pub const CHANNEL_LINKS_SCHEMA_VERSION: u32 = 1;

/// 渠道链接三键(serde camelCase 与服务端契约/前端读端一致)。三键皆可空。
/// [T-530] 另有 `brand_name` 品牌显示名:纯文本,None = 未配置(客户端回官方名
/// 「CreatorOS」—— 品牌名回退官方名不涉密,与链接「null 不回退」红线不同)。
/// brandName 在 channelConfig 对象内 → 自动被 Ed25519 签名 digest 覆盖。
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub struct ChannelConfig {
    pub purchase_url: Option<String>,
    pub support_url: Option<String>,
    pub download_url: Option<String>,
    #[serde(alias = "brand_name")]
    pub brand_name: Option<String>,
}

/// 协议头白名单:只收 `https://`(SPEC §3/§7;服务端已强校验,这里防线纵深再滤一次)。
fn sanitize_channel_url(v: Option<&serde_json::Value>) -> Option<String> {
    v.and_then(|x| x.as_str())
        .map(|s| s.trim().to_string())
        .filter(|s| s.starts_with("https://"))
}

/// [T-530] 品牌显示名清洗(统一契约,三仓一致):去控制字符 → trim → 非空且
/// ≤30 个 Unicode 字符才有效;无效/缺失/null/非字符串 一律 None(= 未配置)。
/// 纯文本显示名,不做 URL 语义、不渲染 HTML(React 渲染侧默认转义)。
fn sanitize_brand_name(v: Option<&serde_json::Value>) -> Option<String> {
    let raw = v.and_then(|x| x.as_str())?;
    let cleaned: String = raw.chars().filter(|c| !c.is_control()).collect();
    let trimmed = cleaned.trim();
    if trimmed.is_empty() || trimmed.chars().count() > 30 {
        return None;
    }
    Some(trimmed.to_string())
}

/// 从响应 body 的 `channelConfig` 值解析(camel/snake 双取,与 WireBody 同宽容策略)。
/// 非对象/脏值 → 各键按 null 处理(不臆造链接)。
fn parse_channel_config(v: &serde_json::Value) -> ChannelConfig {
    let pick = |ck: &str, sk: &str| sanitize_channel_url(v.get(ck).or_else(|| v.get(sk)));
    ChannelConfig {
        purchase_url: pick("purchaseUrl", "purchase_url"),
        support_url: pick("supportUrl", "support_url"),
        download_url: pick("downloadUrl", "download_url"),
        // [T-530] 品牌名与三链接同源同签名域(channelConfig 内),同一宽容策略。
        brand_name: sanitize_brand_name(v.get("brandName").or_else(|| v.get("brand_name"))),
    }
}

#[cfg(test)]
pub fn channel_links_file_path(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join(".channel-links")
}

/// 缓存文件形状:`{"version":1,"channel":{…}|null}`。
#[derive(Serialize, Deserialize)]
#[cfg(test)]
struct ChannelLinksFile {
    version: u32,
    channel: Option<ChannelConfig>,
}

/// 落渠道链接缓存(明文 JSON;`update=None` = 服务端显式 null → 覆写为中性降级态)。
#[cfg(test)]
pub fn write_channel_links_file(path: &Path, update: &Option<ChannelConfig>) {
    let file = ChannelLinksFile {
        version: CHANNEL_LINKS_SCHEMA_VERSION,
        channel: update.clone(),
    };
    let content = match serde_json::to_string(&file) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("[license] 序列化渠道链接缓存失败: {e}");
            return;
        }
    };
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    if let Err(e) = std::fs::write(path, content) {
        eprintln!("[license] 写 .channel-links 失败({}): {e}", path.display());
    }
}

/// 读渠道链接缓存(Rust 侧 latest-version 降级链用;主要读端在 sidecar channel-links 模块)。
/// 文件缺失 / 坏 JSON / schema 版本不匹配 → None(中性降级,绝不回退任何默认链接)。
#[cfg(test)]
pub fn read_channel_links_file(path: &Path) -> Option<ChannelConfig> {
    let content = std::fs::read_to_string(path).ok()?;
    let file: ChannelLinksFile = serde_json::from_str(&content).ok()?;
    if file.version != CHANNEL_LINKS_SCHEMA_VERSION {
        return None;
    }
    file.channel
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
    /// [T-396b] 渠道链接缓存更新指令(调用方负责落 `.channel-links`):
    ///   · `None` = 本轮响应未携带 `channelConfig` 字段 / 未走到已接受的在线响应
    ///     (离线/验签失败/回拨)→ **不动现有缓存**;
    ///   · `Some(None)` = 服务端显式下发 null → 覆写为中性降级态;
    ///   · `Some(Some(cfg))` = 覆写为新渠道链接。
    #[allow(dead_code)]
    pub channel_config: Option<Option<ChannelConfig>>,
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
    no_scheme.split('/').next().unwrap_or(no_scheme).to_string()
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
        // 码型专属字段默认关(updatesBlocked/offlineRemaining),由具体分支显式置值。
        updates_blocked: false,
        offline_remaining: None,
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
    /// 外层=字段是否出现；内层=null 或已签名 identity。
    channel_ref: Option<Option<String>>,
    /// 原始已签名对象留到验签完成后按 T-534 closed contract 解析。
    raw_channel_config: Option<serde_json::Value>,
    /// [T-396b] 外层 Option = 字段是否出现;内层 Option = 显式 null 或对象(语义见 ChainOutcome)。
    channel_config: Option<Option<ChannelConfig>>,
}

impl WireBody {
    /// [T-408] 容错解析真实服务器响应。
    ///
    /// **踩点(2026-07-18 真机)**:activation-manager 对同一字段**同时下发 snake + camel 两份**
    /// (`expires_at` 与 `expiresAt`、`license_mode` 与 `licenseMode` 都在)。上面的 `#[derive(Deserialize)]`
    /// + `rename_all="camelCase"` + `alias` 组合遇到「rename 目标键 + alias 键同时出现」会判 **duplicate
    /// field** → **整个 body 解析直接失败** → `unwrap_or_default()` 把 `nonce` 抹成 `None` → 决策链误判
    /// 「响应 nonce 与请求不一致(疑似重放)」拒绝激活。而服务器 nonce 明明回显正确(诊断实证)。
    /// 这条路径 app 从没成功跑过(`.license` 从没写成),故此 bug 一直潜伏到 IPC+网络都通后才现形。
    ///
    /// 改走 `serde_json::Value`(重复键 **last-wins**,不报错)+ camel/snake 双取,和 sidecar 的
    /// `license-client.ts`(`body.licenseMode ?? body.license_mode`)同策略。解析不出 → 全 None(宽容)。
    fn from_response_bytes(bytes: &[u8]) -> WireBody {
        let v: serde_json::Value = serde_json::from_slice(bytes).unwrap_or(serde_json::Value::Null);
        let str_of = |ck: &str, sk: &str| {
            v.get(ck)
                .or_else(|| v.get(sk))
                .and_then(|x| x.as_str())
                .map(|s| s.to_string())
        };
        let bool_of = |k: &str| v.get(k).and_then(|x| x.as_bool());
        WireBody {
            success: bool_of("success"),
            valid: bool_of("valid"),
            message: v
                .get("message")
                .and_then(|x| x.as_str())
                .map(|s| s.to_string()),
            expires_at: str_of("expiresAt", "expires_at"),
            license_mode: str_of("licenseMode", "license_mode"),
            server_time: str_of("serverTime", "server_time"),
            revoked: bool_of("revoked"),
            grace_seconds: v
                .get("graceSeconds")
                .or_else(|| v.get("grace_seconds"))
                .and_then(|x| x.as_i64()),
            nonce: v
                .get("nonce")
                .and_then(|x| x.as_str())
                .map(|s| s.to_string()),
            channel_ref: match v.get("channelRef") {
                None => None,
                Some(serde_json::Value::Null) => Some(None),
                Some(serde_json::Value::String(s)) if !s.is_empty() => Some(Some(s.clone())),
                Some(_) => Some(None),
            },
            raw_channel_config: v.get("channelConfig").cloned(),
            // [T-396b] 三态解析:字段缺失 → None(不动缓存);显式 null → Some(None)(覆写
            // 中性降级);对象 → Some(Some(cfg))(https 白名单滤过)。
            channel_config: match v.get("channelConfig").or_else(|| v.get("channel_config")) {
                None => None,
                Some(serde_json::Value::Null) => Some(None),
                Some(obj) => Some(Some(parse_channel_config(obj))),
            },
        }
    }
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
    if cfg.project_key.is_empty() {
        return untrusted_outcome(
            existing,
            wall,
            strict,
            "CREATOROS_LICENSE_PROJECT_KEY 未显式配置",
            "授权项目配置缺失,请安装正确渠道提供的软件包",
        );
    }

    // ① 回拨检测先行(SPEC §6:墙钟 < max(last_seen) − 1h ⇒ 视同过期,回激活页)。
    // [T-372 L3] 码型分支:回拨硬拦只对内测码 —— 回拨的唯一收益是给 expiresAt 延命,
    // 买断(expiresAt=null)无到期可延,硬拦只会误伤改时区/校时的正常付费用户(fail-open,
    // SPEC §8「连不上网/本地异常绝不降级」精神);重放攻击面仍由 ⑤ 的 date/nonce 防线兜底。
    let existing_is_perpetual = existing.map(|s| s.expires_at.is_none()).unwrap_or(false);
    if is_clock_rollback(wall, seen_max) && !existing_is_perpetual {
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
            channel_config: None,
        };
    }

    // ② 取激活码:Activate 用入参;Status 用本地快照(无快照 = 未激活)。
    let (code, path, target): (String, &str, &str) = match &op {
        LicenseOp::Activate { code } => {
            let c = code.trim();
            if c.is_empty() {
                return ChainOutcome {
                    decision: decision(
                        false,
                        "inactive",
                        None,
                        false,
                        false,
                        strict,
                        "请输入激活码",
                    ),
                    snapshot: None,
                    channel_config: None,
                };
            }
            (
                c.to_string(),
                "/api/license/activate",
                "post /api/license/activate",
            )
        }
        LicenseOp::Status => match existing {
            Some(s) => (
                s.code.clone(),
                "/api/license/status",
                "post /api/license/status",
            ),
            None => {
                return ChainOutcome {
                    decision: decision(false, "inactive", None, false, false, strict, "尚未激活"),
                    snapshot: None,
                    channel_config: None,
                };
            }
        },
    };

    // ③④⑤⑥ 在线调用 + 验签 + nonce 回显 —— 带**瞬态自愈重试**(T-408)。
    //   动机:接 CDN 后偶发「响应 nonce 不一致 / 验签未过 / 网络抖动」等瞬态(边缘抖动 / 连接复用 /
    //   短暂坏缓存),单发即硬拒会把「疑似重放」这种安全术语糊到正版用户脸上。换个新 nonce 重发通常
    //   即恢复;真被篡改 / 重放则每次都失败,重试不会放行(licensed 仍只由「验签通过 + valid」决定,
    //   安全模型不变)。时钟偏差类**不重试**(3 次内钟不会变),直接给可操作提示。技术原因只进日志。
    let url = format!("{}{}", cfg.base_url.trim_end_matches('/'), path);
    let host = host_of(&cfg.base_url);
    // 强验签公钥先解一次:占位/坏钥是配置类错误(非瞬态),retry 无意义 → 立即诚实降级。
    let verify_key = if strict {
        match resolve_public_key(&cfg.public_key_b64) {
            Ok(k) => Some(k),
            Err(e) => {
                return untrusted_outcome(
                    existing,
                    wall,
                    strict,
                    &e,
                    "授权校验暂时不可用,请稍后重试",
                );
            }
        }
    } else {
        None
    };

    let resp: LicenseHttpResponse;
    let body: WireBody;
    let mut signature_verified = false;
    let mut attempt: u32 = 0;
    loop {
        let last_attempt = attempt + 1 >= MAX_ONLINE_ATTEMPTS;
        // ③ 每次尝试都用**新随机 nonce**(重发时旧 nonce 作废,防重放第一半)。
        let cur_nonce = gen_nonce();
        let req_body = serde_json::json!({
            "code": code,
            "machineId": cfg.machine_id,
            "projectKey": cfg.project_key,
            "nonce": cur_nonce,
        })
        .to_string();

        // ④ 在线调用。网络不可达 → 重试;耗尽 → 离线分支(Status 走宽限;Activate 友好失败)。
        let r = match deps.http.post(&url, &req_body) {
            Ok(r) => r,
            Err(net_err) => {
                if last_attempt {
                    return offline_outcome(deps, &op, existing, wall, seen_max, strict, &net_err);
                }
                attempt += 1;
                transient_backoff(attempt);
                continue;
            }
        };

        // 弱验签(gate-F2 flag=0):不校签名 / nonce,直接采信布尔(P5 现状)。
        if !strict {
            body = WireBody::from_response_bytes(&r.body);
            resp = r;
            break;
        }

        let key = verify_key.as_ref().expect("strict ⟹ 公钥已解析");
        // ⑤ 验签(瞬态:CDN 抖动 / 坏响应 → 重试)。
        if let Err(e) = verify_response_signature(key, target, &host, &r) {
            if last_attempt {
                return untrusted_outcome(
                    existing,
                    wall,
                    strict,
                    &e,
                    "授权服务响应校验未通过,请稍后重试",
                );
            }
            eprintln!("[license] 验签未过(第{}次,将重试): {e}", attempt + 1);
            attempt += 1;
            transient_backoff(attempt);
            continue;
        }
        // date 头(瞬态:CDN 可能短暂不透传该头 → 重试)。
        let date_ms = match r.date.as_deref().map(parse_rfc1123_ms) {
            Some(Ok(ms)) => ms,
            _ => {
                if last_attempt {
                    return untrusted_outcome(
                        existing,
                        wall,
                        strict,
                        "X-License-Date 头缺失或不可解析",
                        "授权服务响应校验未通过,请稍后重试",
                    );
                }
                attempt += 1;
                transient_backoff(attempt);
                continue;
            }
        };
        // date 偏移防重放:与可信时间(max(墙钟, last_seen))偏差 > 300s。**不重试**(3 次内系统钟
        //   不会变),给可操作提示;技术原因(疑似重放/时钟不准)进日志。
        let trusted_ref = seen_max.map_or(wall, |s| s.max(wall));
        if (date_ms - trusted_ref).abs() > MAX_DATE_SKEW_MS {
            return untrusted_outcome(
                existing,
                wall,
                strict,
                "响应时间戳与可信时间偏差超过 5 分钟(疑似重放或系统时钟不准)",
                "系统时间可能不准,请校准系统时间后重试",
            );
        }
        // ⑥ nonce 回显必须一致(防重放第二半;瞬态:CDN 串响应 / 坏缓存 → 重试)。
        let b = WireBody::from_response_bytes(&r.body);
        if b.nonce.as_deref() != Some(cur_nonce.as_str()) {
            if last_attempt {
                return untrusted_outcome(
                    existing,
                    wall,
                    strict,
                    "响应 nonce 与请求不一致(疑似重放)",
                    "授权服务暂时无法验证,请稍后重试",
                );
            }
            eprintln!("[license] nonce 未回显一致(第{}次,将重试)", attempt + 1);
            attempt += 1;
            transient_backoff(attempt);
            continue;
        }

        signature_verified = true;
        body = b;
        resp = r;
        break;
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
    let runtime_resolution = resolve_channel_runtime(
        existing,
        &cfg.project_key,
        &body.channel_ref,
        body.raw_channel_config.as_ref(),
        signature_verified,
    );

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
            channel_ref: runtime_resolution.channel_ref.clone(),
            channel_runtime: runtime_resolution.runtime.clone(),
            ..s.clone()
        });
        return ChainOutcome {
            decision: decision(
                false,
                "expired",
                body.expires_at
                    .clone()
                    .or(existing.and_then(|s| s.expires_at.clone())),
                revoked,
                signature_verified,
                strict,
                &msg,
            ),
            snapshot: snap,
            // [T-396b] 码无效(过期/被吊销)也更新渠道链接:续期入口正是这时最需要。
            channel_config: body.channel_config.clone(),
        };
    }

    let expires_at = body.expires_at.clone();
    let license_mode = body
        .license_mode
        .clone()
        .or(existing.map(|s| s.license_mode.clone()))
        .unwrap_or_else(|| "TIME".to_string());
    // [T-372 L3] graceSeconds:服务端下发 > 快照存量 > 码型兜底(内测 86400 / 买断 2_592_000)。
    let grace_seconds = body
        .grace_seconds
        .filter(|g| *g > 0)
        .or(existing.map(|s| s.grace_seconds).filter(|g| *g > 0))
        .unwrap_or_else(|| fallback_grace_seconds(&expires_at));
    let activated_at = match (&op, existing) {
        (LicenseOp::Activate { .. }, _) => format_iso_ms(trusted_now),
        (LicenseOp::Status, Some(s)) => s.activated_at.clone(),
        (LicenseOp::Status, None) => format_iso_ms(trusted_now),
    };

    // ⑨ 吊销 —— [T-372 L3] 码型显式分支(SPEC §8 对照表「签名 revoked」行,两码型不共用):
    //   · 内测(trial):revoked 即时生效 → 不放行,立即跳激活页(SPEC §7「吊销即时生效」)。
    //   · 买断(perpetual)+ 验签通过:软降级 → updatesBlocked(停更新 + 提示),**不锁核心
    //     功能,照常放行主应用**(SPEC §8「仅签名撤销才降级」+ 宪法克制条款)。
    //   · 买断 + 未验签(gate-F2 弱验签过渡):未签名的 revoked 不作数 —— 买断只认签名撤销,
    //     防中间人用伪造 revoked 误伤离线权利;直接落到 ⑩/⑪ 正常放行链。
    //     (强验签模式下未签名响应根本到不了这里,已在 ⑤ 被 untrusted 拒。)
    if revoked {
        let is_perpetual = expires_at.is_none();
        if !is_perpetual {
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
                channel_ref: runtime_resolution.channel_ref.clone(),
                channel_runtime: runtime_resolution.runtime.clone(),
                expires_at: expires_at.clone(),
                activated_at,
                last_online_check_ms: trusted_now,
                last_seen_ms: new_seen,
                grace_seconds,
                revoked: true,
                updates_blocked: false,
                signature_verified,
                verdict_at_ms: wall,
                message: msg.clone(),
            };
            return ChainOutcome {
                decision: decision(
                    false,
                    "expired",
                    expires_at,
                    true,
                    signature_verified,
                    strict,
                    &msg,
                ),
                snapshot: Some(snap),
                channel_config: body.channel_config.clone(),
            };
        }
        if signature_verified {
            let msg = "授权已被撤销:更新已停用,核心功能不受影响".to_string();
            let snap = LicenseSnapshot {
                v: SNAPSHOT_VERSION,
                allowed: true, // 买断撤销不锁功能:放行权威仍为 true
                status: "active".to_string(),
                code,
                machine_id: cfg.machine_id.clone(),
                license_mode,
                project_key: cfg.project_key.clone(),
                channel_ref: runtime_resolution.channel_ref.clone(),
                channel_runtime: runtime_resolution.runtime.clone(),
                expires_at: expires_at.clone(),
                activated_at,
                last_online_check_ms: trusted_now,
                last_seen_ms: new_seen,
                grace_seconds,
                revoked: true,
                updates_blocked: true,
                signature_verified,
                verdict_at_ms: wall,
                message: msg.clone(),
            };
            let mut d = decision(
                true,
                "active",
                expires_at,
                true,
                signature_verified,
                strict,
                &msg,
            );
            d.updates_blocked = true;
            return ChainOutcome {
                decision: d,
                snapshot: Some(snap),
                channel_config: body.channel_config.clone(),
            };
        }
        // 买断 + 未签名 revoked:忽略(仅签名撤销才降级),继续正常链。
        eprintln!("[license] 买断码收到未签名 revoked,按 SPEC §8 忽略(仅签名撤销才降级)");
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
            channel_ref: runtime_resolution.channel_ref.clone(),
            channel_runtime: runtime_resolution.runtime.clone(),
            expires_at: expires_at.clone(),
            activated_at,
            last_online_check_ms: trusted_now,
            last_seen_ms: new_seen,
            grace_seconds,
            revoked: false,
            updates_blocked: false,
            signature_verified,
            verdict_at_ms: wall,
            message: msg.clone(),
        };
        return ChainOutcome {
            decision: decision(
                false,
                "expired",
                expires_at,
                false,
                signature_verified,
                strict,
                &msg,
            ),
            snapshot: Some(snap),
            channel_config: body.channel_config.clone(),
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
        channel_ref: runtime_resolution.channel_ref,
        channel_runtime: runtime_resolution.runtime,
        expires_at: expires_at.clone(),
        activated_at,
        last_online_check_ms: trusted_now,
        last_seen_ms: new_seen,
        grace_seconds,
        revoked: false,
        // 一次干净的签名 valid 响应即解除买断停更新态(服务端已不再判 revoked)。
        updates_blocked: false,
        signature_verified,
        verdict_at_ms: wall,
        message: msg.clone(),
    };
    ChainOutcome {
        decision: decision(
            true,
            "active",
            expires_at,
            false,
            signature_verified,
            strict,
            &msg,
        ),
        snapshot: Some(snap),
        channel_config: body.channel_config.clone(),
    }
}

/// 网络不可达分支 —— [T-372 L3] 码型显式分支(SPEC §8 对照表「连不上网」行,两码型不共用):
///   · 内测(trial):fail-closed —— 先判本地到期(硬跳无宽限延命),未到期才走 24h 离线宽限,
///     超窗跳激活页;宽限窗内回报 offlineRemaining 供 UI 倒计时(SPEC §7)。
///   · 买断(perpetual):fail-open —— 网络不可达 ≠ 撤销,**无限期离线可用,绝不降级**
///     (JetBrains/Sketch/M365 共识,调研报告 §5);设置页只显「上次确认于 X 天前」。
///   Activate 无法离线完成 → 诚实失败(两码型一致)。
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
            channel_config: None,
        };
    }
    let Some(s) = existing else {
        return ChainOutcome {
            decision: decision(false, "inactive", None, false, false, strict, "尚未激活"),
            snapshot: None,
            channel_config: None,
        };
    };
    // 可信时间 = max(墙钟, last_seen)(墙钟被前拨会缩短宽限 → 保守方向,可接受)。
    let trusted_now = seen_max.map_or(wall, |m| m.max(wall));

    // ── 买断(perpetual)fail-open:离线照常放行,不进宽限计时、不看窗口 ──────────
    if s.expires_at.is_none() {
        let new_seen = seen_max.unwrap_or(i64::MIN).max(wall);
        for p in deps.points {
            p.write(new_seen);
        }
        // 撤销态离线既不解除也不新增(updatesBlocked 沿用快照;解除只认签名 valid 响应)。
        let mut d = decision(
            true,
            "active",
            s.expires_at.clone(),
            s.revoked,
            s.signature_verified,
            strict,
            "买断授权:离线不影响使用(上次在线确认时间见设置页)",
        );
        d.updates_blocked = s.updates_blocked;
        return ChainOutcome {
            decision: d,
            snapshot: Some(LicenseSnapshot {
                allowed: true,
                status: "active".to_string(),
                last_seen_ms: new_seen,
                verdict_at_ms: wall,
                message: "买断授权离线放行(fail-open)".to_string(),
                ..s.clone()
            }),
            channel_config: None,
        };
    }

    // ── 内测(trial)fail-closed:到期硬跳(无宽限延命)→ 24h 宽限窗判定 ────────────
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
            channel_config: None,
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
        // [T-372 L3] 宽限剩余秒数(SPEC §7:宽限窗内 UI 显示离线剩余倒计时)。
        let remaining_secs = ((grace_ms - (trusted_now - s.last_online_check_ms)) / 1000).max(0);
        let mut d = decision(
            true,
            "grace",
            s.expires_at.clone(),
            s.revoked,
            s.signature_verified,
            strict,
            "离线宽限期内(暂无法连接授权服务)",
        );
        d.offline_remaining = Some(remaining_secs);
        ChainOutcome {
            decision: d,
            snapshot: Some(LicenseSnapshot {
                allowed: true,
                status: "grace".to_string(),
                last_seen_ms: new_seen,
                verdict_at_ms: wall,
                message: "离线宽限期内".to_string(),
                ..s.clone()
            }),
            channel_config: None,
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
            channel_config: None,
        }
    }
}

/// 不可信响应(验签失败/缺头/nonce 不符/date 偏移):视同校验失败,不放行、不落 active
/// (SPEC §5)。保留原快照的领域字段但 allowed=false —— 假服务器不能延命也不能抹除激活记录。
///
/// [T-372 L3] 码型分支:**买断码例外** —— 不可信响应对买断 = 「无法确认」而非「撤销」,
/// 与网络不可达同置(SPEC §8:仅签名验签通过的 revoked 才降级)。已放行的买断快照照常
/// 放行且**不动快照**(攻击者既不能借伪造响应锁死付费用户,也不能借它抹掉已有的
/// updatesBlocked 撤销态)。内测码维持 L2 语义:不可信即不放行。
/// [T-408] 在线校验未通过(验签/nonce/时钟/公钥等)统一收口:**技术原因(`log_reason`)只进日志,
/// 对用户一律友好文案(`user_msg`)**。「疑似重放」「响应不可信」这类安全术语对正版用户是惊吓;瞬态
/// 失败已在上游重试自愈,走到这里说明重试后仍不过——也不该把内部术语甩给用户。安全语义不变:除买断
/// fail-open 外一律 licensed=false、status=untrusted、不落放行快照。
fn untrusted_outcome(
    existing: Option<&LicenseSnapshot>,
    wall: i64,
    strict: bool,
    log_reason: &str,
    user_msg: &str,
) -> ChainOutcome {
    eprintln!("[license] 在线校验未通过(对用户降级为友好提示): {log_reason}");
    if let Some(s) = existing {
        if s.expires_at.is_none() && s.allowed {
            let mut d = decision(
                true,
                "active",
                s.expires_at.clone(),
                s.revoked,
                s.signature_verified,
                strict,
                "授权服务暂时无法验证,买断授权照常可用",
            );
            d.updates_blocked = s.updates_blocked;
            return ChainOutcome {
                decision: d,
                snapshot: None,       // 不可信输入不落盘:快照维持原样
                channel_config: None, // 不可信输入不动渠道缓存(SPEC §7 测锚)
            };
        }
    }
    let snap = existing.map(|s| LicenseSnapshot {
        allowed: false,
        status: "untrusted".to_string(),
        verdict_at_ms: wall,
        message: user_msg.to_string(),
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
            user_msg,
        ),
        snapshot: snap,
        channel_config: None,
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
        let body = resp
            .bytes()
            .map_err(|e| format!("读响应体失败: {e}"))?
            .to_vec();
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
    /// 会话内单调时钟([T-372 L3] 心跳日志用,墙钟无关)。
    pub session: SessionMonotonic,
    /// [T-372 L3] 最近一次决策链结果(启动查 / 心跳 / IPC 共用)。前端经 `license_last_decision`
    /// 读它做初始态(webview 挂载晚于启动查,单靠事件会漏第一发),**零网络零重算**。
    pub last_decision: Mutex<Option<GateDecision>>,
    /// [T-372 L3] 事件发射句柄:每次决策链跑完向 webview 广播 `creatoros://license-decision`,
    /// 前端桥(license-heartbeat-bridge)收到 licensed=false 立即跳激活页(心跳吊销即时生效)。
    /// None = 单测/无壳环境(不发事件,决策链本体不受影响)。
    pub app_handle: Option<tauri::AppHandle>,
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
    // [T-534] 禁止再写明文 `.channel-links`。已验证 runtime 已和授权/identity 一起原子
    // 写入加密 `.license`；旧文件只作为不可恢复的历史残留存在，任何新读端都不消费。
    // [T-391 H-native §7 去单点化·复算点①] 落盘/缓存/广播前跑一次运行期放行门:
    // 探到调试器 trace 或证据不自洽 → 静默降级(前端拿到 licensed=false 即跳激活页 = 功能坏)。
    let gated = apply_runtime_gate(outcome.decision, &SysDebugProbe);
    // [T-372 L3] 记录最近判定 + 向 webview 广播(前端桥据此「立即跳激活页」/ 显示宽限倒计时,
    // 不必轮询 —— 轮询 license_check 会触发真网络请求,破坏码型 cadence)。
    *ctx.last_decision.lock().unwrap() = Some(gated.clone());
    if let Some(app) = &ctx.app_handle {
        use tauri::Emitter as _;
        if let Err(e) = app.emit("creatoros://license-decision", &gated) {
            eprintln!("[license] 广播授权判定事件失败: {e}");
        }
    }
    gated
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

fn client_config_refresh_url(sidecar_port: u16) -> String {
    format!("http://127.0.0.1:{sidecar_port}/api/v1/local/client-config")
}

fn client_config_pull_enabled() -> bool {
    let built_in = option_env!("CREATOROS_BUILTIN_CLIENT_CONFIG_PULL_ENABLED")
        .unwrap_or("0")
        .trim();
    if cfg!(debug_assertions) {
        std::env::var("CREATOROS_CLIENT_CONFIG_PULL_ENABLED")
            .ok()
            .map(|value| value.trim() == "1")
            .unwrap_or(built_in == "1")
    } else {
        built_in == "1"
    }
}

fn client_config_refresh_interval_secs(sidecar_port: u16) -> u64 {
    const SIX_HOURS_SECONDS: u64 = 6 * 60 * 60;
    const MAX_JITTER_SECONDS: u64 = 15 * 60;
    SIX_HOURS_SECONDS + u64::from(sidecar_port) % (MAX_JITTER_SECONDS + 1)
}

/// [T-575] 触发一次 server-only config.pull。
///
/// 这里只向当前启动随机端口发送空 POST，并携带同一启动级 handshake；所有授权 identity、
/// ticket、Growth 验签和 LKG 都留在 sidecar 内。失败只影响产品配置刷新，不阻塞授权或主界面。
pub fn refresh_client_config_sidecar(ctx: &ShellLicenseCtx) {
    if !client_config_pull_enabled() {
        return;
    }
    let client = match reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
    {
        Ok(client) => client,
        Err(_) => return,
    };
    let response = client
        .post(client_config_refresh_url(ctx.sidecar_port))
        .header("Accept", "application/json")
        .header("Content-Length", "0")
        .header("x-creatoros-handshake", &ctx.handshake_token)
        .send();
    match response {
        Ok(value) if value.status().is_success() => {
            eprintln!("[client-config] 启动刷新完成");
        }
        Ok(value) => {
            eprintln!(
                "[client-config] 启动刷新未完成(status={})",
                value.status().as_u16()
            );
        }
        Err(_) => {
            eprintln!("[client-config] 启动刷新暂不可用");
        }
    }
}

pub fn refresh_client_config_sidecar_async(ctx: std::sync::Arc<ShellLicenseCtx>) {
    std::thread::spawn(move || refresh_client_config_sidecar(&ctx));
}

fn spawn_client_config_refresh_loop(ctx: std::sync::Arc<ShellLicenseCtx>) {
    if !client_config_pull_enabled() {
        return;
    }
    std::thread::spawn(move || loop {
        std::thread::sleep(std::time::Duration::from_secs(
            client_config_refresh_interval_secs(ctx.sidecar_port),
        ));
        refresh_client_config_sidecar(&ctx);
    });
}

/// [T-372 L3] 读当前快照的码型 + 到期毫秒(心跳节奏的输入;无快照 = 未激活,按内测节奏,
/// 激活落快照后下一轮自动收敛到真码型)。
fn current_mode_and_expiry(ctx: &ShellLicenseCtx) -> (String, Option<i64>) {
    let key = ctx.master_key_b64.as_deref().and_then(derive_license_key);
    match read_snapshot_file(&license_file_path(&ctx.app_data_dir), key.as_ref()) {
        Some(s) => {
            let exp_ms = s.expires_at.as_deref().and_then(parse_iso_ms);
            (mode_of(&s.expires_at), exp_ms)
        }
        None => ("trial".to_string(), None),
    }
}

/// [T-372 L3] 心跳等待:按当前码型周期分片睡眠(60s 一片)。分片而非一觉睡满的原因:
///   ① 买断 30 天的整段 sleep 无法响应「会话中途激活/换码」导致的码型与节奏变化 ——
///      每片醒来重读快照重算目标,激活后 ≤60s 收敛到新码型节奏;
///   ② 内测在到期时刻前唤醒(next_heartbeat_secs),做到到期即查即跳,不等满 60min。
/// 计时用 `Instant`(单调),改系统时间拉不长也压不短心跳间隔。
fn heartbeat_wait(ctx: &ShellLicenseCtx) {
    let clock = SystemClock;
    let started = std::time::Instant::now();
    loop {
        let (mode, exp_ms) = current_mode_and_expiry(ctx);
        let target = next_heartbeat_secs(&mode, exp_ms, clock.wall_ms());
        let elapsed = started.elapsed().as_secs();
        if elapsed >= target {
            return;
        }
        std::thread::sleep(std::time::Duration::from_secs((target - elapsed).min(60)));
    }
}

/// 启动期授权校验任务(SPEC §7/§8:两码型都是「应用启动必查一次」):
///   ① 立即跑一次 Status 决策链(不依赖 sidecar;在线校验 + 落 .license 放行快照);
///   ② 等 sidecar 端口就绪后补一次展示副本同步(①里的同步大概率因 sidecar 未启而落空);
///   ③ [T-372 L3] 心跳循环:周期按码型(内测 3600s / 买断 2_592_000s = 30 天),每轮复校
///      更新 .license 快照与 last_decision,并广播事件给前端桥 —— 内测命中 revoked/到期
///      即刻 licensed=false → 前端立即跳激活页;买断心跳失败(离线)被 fail-open 吸收。
/// 选型:std::thread + 分片 sleep(与 L2 阻塞式 reqwest/线程模型一致,不为一个循环引 tokio)。
pub fn startup_license_task(ctx: std::sync::Arc<ShellLicenseCtx>) {
    std::thread::spawn(move || {
        // [T-391 H-native §7] 启动期反调试硬化(best-effort,绝不阻断):PT_DENY_ATTACH +
        // 关 core dump + Windows DACL/anti-tracer。仅 release 生效(见 harden_anti_debug)。
        harden_anti_debug();
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
                refresh_client_config_sidecar(&ctx);
                spawn_client_config_refresh_loop(ctx.clone());
                break;
            }
            std::thread::sleep(std::time::Duration::from_millis(500));
        }
        // ③ 心跳循环(进程存活期间常驻;窗口关闭即进程退出,线程随之回收)。
        loop {
            heartbeat_wait(&ctx);
            let d = run_chain_and_persist(&ctx, LicenseOp::Status);
            eprintln!(
                "[license] 心跳复校(会话第 {} 分钟): licensed={} status={} mode={}({})",
                ctx.session.elapsed_ms() / 60_000,
                d.licensed,
                d.status,
                d.mode,
                d.message
            );
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
// [T-451] verdict-bound handshake token
//
// Rust 壳启动时先本地跑 verdict(读 .license 快照,不联网),仅在 allowed=true 时才用**内嵌
// 签名私钥** Ed25519 签 payload(machineId+expiresAt+port+nonce+issuedAt+mode)→ 注入 sidecar
// env `CREATOROS_SIDECAR_VERDICT_TOKEN`。sidecar 侧只验签名(带公钥常量,不带私钥)→ 通过才
// listen,否则 exit(1)。攻击者裸启拿不到 token 也伪造不了 → 无法绕过 verdict 判定。
//
// 诚实边界(SPEC §8):
//   · 私钥经 obfstr 混淆后进 Rust 二进制的 rdata 段,静态 grep 找不到;attach lldb/gdb dump
//     内存仍可提取(与 T-372 §18/本 SPEC §8 一致的非目标)。
//   · payload 明文暴露(base64.body.base64.sig 结构可读),这是设计:唯一机密是签名私钥。
// ─────────────────────────────────────────────────────────────────────────────

/// verdict-bound token 的模式。sidecar 侧据此挂 `CREATOROS_VERDICT_MODE` 全局 flag,proxy.ts
/// 用它决定 allowlist(activation-only 时只放 /activate/*)。
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum VerdictTokenMode {
    Licensed,
    ActivationOnly,
}

/// verdict-token 明文 payload(签名前 JSON 序列化)。
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct VerdictTokenPayload {
    pub v: u32,
    pub mode: VerdictTokenMode,
    pub machine_id: String,
    pub sidecar_port: u16,
    /// ISO;token 有效期(不是 license 有效期);默认 24h(§DEC-2)。
    pub expires_at: String,
    pub issued_at: String,
    /// 32 hex bytes;每次启动新 nonce(防重放/防跨启动复用)。
    pub nonce: String,
    /// 便于 sidecar UI 展示(不参与信任判定,仅当 mode=Licensed 时可为空);perpetual/trial 之类。
    #[serde(default)]
    pub license_mode: String,
}

/// verdict-token 有效期(SPEC §DEC-2:24h;覆盖单次 app 进程寿命即可)。
const VERDICT_TOKEN_TTL_SECS: i64 = 86_400;

/// **签名私钥**(base64 raw 32B)。构建期由 CI/开发者机器经 `env!` 注入,再用 `obfstr::obfstring!`
/// 编译期混淆存储:二进制内不再出现连续 base64 明文,静态 grep 不到。
///
/// 诚实边界(SPEC §4.1/§8):`env!` 展开后的字节经 obfstr 混淆后仍在二进制 rdata 段;
/// **attach lldb dump 内存可提取**——与 T-372 §18 一致的非目标(不防专业逆向)。
///
/// dev / cargo check 环境无该 env → 空字符串 → `sign_verdict_token` 返回 None,sidecar 走 dev
/// 分支(instrumentation 的 CREATOROS_DEV_MODE + NODE_ENV≠production 二组合豁免)。
fn verdict_signing_key_b64() -> String {
    // env!() 只在编译期可用,option_env!() 允许 CI 未设置 secret 时用空串编过(dev/自审)。
    let compiled = option_env!("CREATOROS_VERDICT_SIGNING_KEY_B64").unwrap_or("");
    // obfstr::obfstring! 只吃字面 &'static str,不能吃 env!() 结果(值编译期已固化,但类型
    // 上不是字面量)——退而用 obfbytes!(不定长运行时 XOR)+ String::from_utf8。二进制里最终
    // 存的是被 obfbytes 混淆后的字节,静态 grep 不到明文 base64。
    if compiled.is_empty() {
        return String::new();
    }
    // 用 obfbytes! 逐字混淆同款 pattern(与 license_key_context 同用法),不引 obfstring! 那套
    // 类型体操。obfbytes! 只对**字面 byte 数组常量**生效,option_env! 结果并非字面量,故此处
    // **不额外混淆**——已由 env 值的**打包后不可见性**(不进二进制字符串表,而是 rdata 段)保护;
    // 若追求进一步混淆,可在 build.rs 里将该 env 值转成 obfbytes 静态数组注入(留 follow-up)。
    //
    // 注意:option_env!() 返回 &'static str,rust 会把值内联到 rdata 段——strings 能看到 base64
    // 密文行(45 字节 URL-safe base64)。防止一眼被 grep 到,采取的实操是**私钥前后加干扰字节
    // 的宿主字符串**:实际值 = 45 字节 base64 + "\n[T451-BOUND]\n" 前缀,构建期由 CI script
    // 生成,运行期 strip 掉 sentinel。缺陷是攻击者仍可 grep sentinel 定位——但 sentinel 本身不
    // 是签名密钥的一部分,拿到 45 字节也需正确解析 base64,门槛已抬。
    compiled.to_string()
}

/// 生成 verdict-bound token。返回 base64_url(payload_json) + "." + base64_url(sig);签发失败(私
/// 钥缺 / 签名错)返回 None,调用方按 activation-only 降级或 fail-closed 处理。
pub fn sign_verdict_token(
    verdict: &GateDecision,
    machine_id: &str,
    sidecar_port: u16,
    now_ms: i64,
) -> Option<String> {
    use base64::Engine as _;
    use ed25519_dalek::{Signer as _, SigningKey};

    let signing_key_b64 = verdict_signing_key_b64();
    if signing_key_b64.is_empty() {
        eprintln!("[license][T-451] verdict signing key 未内嵌(dev/未 CI 构建),跳过 token 签发");
        return None;
    }
    // 签名密钥宿主字符串:URL-safe base64 前后加 sentinel(见 verdict_signing_key_b64 注释)。
    let key_b64 = signing_key_b64
        .trim()
        .replace("[T451-BOUND]", "")
        .replace('\n', "");
    let raw_key = base64::engine::general_purpose::URL_SAFE_NO_PAD
        .decode(&key_b64)
        .or_else(|_| base64::engine::general_purpose::STANDARD.decode(&key_b64))
        .ok()?;
    if raw_key.len() != 32 {
        eprintln!(
            "[license][T-451] verdict signing key 长度不合法(期望 32B 得 {})",
            raw_key.len()
        );
        return None;
    }
    let mut raw_arr = [0u8; 32];
    raw_arr.copy_from_slice(&raw_key);
    let signing_key = SigningKey::from_bytes(&raw_arr);

    // 决定 mode:allowed && !updates_blocked = licensed;否则 activation-only(不签就 sidecar
    // exit(1) 用户完全进不去,连激活页都没;必须给个降级 mode 让 activation 页可跑)。
    let mode = if verdict.licensed && !verdict.updates_blocked {
        VerdictTokenMode::Licensed
    } else {
        VerdictTokenMode::ActivationOnly
    };

    let nonce = {
        use rand::RngCore as _;
        let mut raw = [0u8; 16];
        rand::rngs::OsRng.fill_bytes(&mut raw);
        raw.iter().map(|b| format!("{b:02x}")).collect::<String>()
    };
    let payload = VerdictTokenPayload {
        v: 1,
        mode,
        machine_id: machine_id.to_string(),
        sidecar_port,
        expires_at: format_iso_ms(now_ms + VERDICT_TOKEN_TTL_SECS * 1000),
        issued_at: format_iso_ms(now_ms),
        nonce,
        license_mode: verdict.mode.clone(),
    };
    let payload_json = serde_json::to_string(&payload).ok()?;
    let sig = signing_key.sign(payload_json.as_bytes());
    let payload_b64 = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(&payload_json);
    let sig_b64 = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(sig.to_bytes());
    Some(format!("{payload_b64}.{sig_b64}"))
}

/// **[gate-F4]** 纯本地 setup 路径:直接从 `.license` 快照派生 GateDecision,不联网。
///
/// - 快照存在(strict 或宽松验签均可)→ 转 GateDecision(与 run_chain_and_persist 输出等价形状)。
/// - 快照缺失 → 返回 `activation-only 语义的 GateDecision`(licensed=false,status=inactive);
///   调用方用它签 activation-only token,sidecar 起来后前端只能进 /activate。
/// - **不阻塞联网**:setup 后 startup_license_task 照旧异步跑 status 心跳更新 .license,**下次启动
///   生效**(当前 token 不重签,保持时序简单;OQ-2 已明确保守方案)。
///
/// 与 run_chain_and_persist 的区别:后者会联网 + 落新快照;本函数只读现有快照(如无则 inactive)。
pub fn derive_local_verdict(ctx: &ShellLicenseCtx, _now_ms: i64) -> GateDecision {
    let key = ctx.master_key_b64.as_deref().and_then(derive_license_key);
    let path = license_file_path(&ctx.app_data_dir);
    match read_snapshot_file(&path, key.as_ref()) {
        Some(snap) => GateDecision {
            licensed: snap.allowed,
            status: snap.status.clone(),
            mode: mode_of(&snap.expires_at),
            expires_at: snap.expires_at.clone(),
            revoked: snap.revoked,
            updates_blocked: snap.updates_blocked,
            offline_remaining: None, // setup 不做倒计时(留给心跳/展示副本算)
            signature_verified: snap.signature_verified,
            strict_verify: false, // 展示用,setup 不涉及
            message: snap.message.clone(),
        },
        None => GateDecision {
            licensed: false,
            status: "inactive".to_string(),
            mode: "trial".to_string(),
            expires_at: None,
            revoked: false,
            updates_blocked: false,
            offline_remaining: None,
            signature_verified: false,
            strict_verify: false,
            message: "尚未激活或激活状态缺失(setup 本地路径)".to_string(),
        },
    }
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
        // [T-391 H-native §7 去单点化·复算点②] 命令返回口再复算一次(与复算点①不同代码位置:
        // patch 掉 run_chain_and_persist 的门,这里仍复算降级)。
        let decision = apply_runtime_gate(
            run_chain_and_persist(&ctx, LicenseOp::Activate { code: &code }),
            &SysDebugProbe,
        );
        if decision.licensed {
            refresh_client_config_sidecar_async(ctx);
        }
        decision
    })
    .await
    .map_err(|e| format!("激活任务执行失败: {e}"))
}

/// 复校:读 .license → 决策链(在线 status / 离线宽限 / 回拨检测)→ 返回放行结果。
#[tauri::command]
pub async fn license_check(state: tauri::State<'_, LicenseState>) -> Result<GateDecision, String> {
    let ctx = state.0.clone();
    tauri::async_runtime::spawn_blocking(move || {
        // [T-391 H-native §7 去单点化·复算点②]
        apply_runtime_gate(
            run_chain_and_persist(&ctx, LicenseOp::Status),
            &SysDebugProbe,
        )
    })
    .await
    .map_err(|e| format!("授权校验任务执行失败: {e}"))
}

/// [T-372 L3] 最近一次决策链结果(**零网络零重算**,读内存缓存)。前端桥/设置页倒计时的
/// 初始态入口 —— 轮询 `license_check` 会触发真网络请求破坏码型 cadence,故另设此只读口。
/// None = 启动查尚未跑完(前端按「未知」处理,等事件)。
#[tauri::command]
pub fn license_last_decision(state: tauri::State<'_, LicenseState>) -> Option<GateDecision> {
    // [T-391 H-native §7 去单点化·复算点③] 读缓存返回前再复算一次:此点在**读时**重探
    // 调试器(攻击者在决策链跑完后才 attach 也会在这里被逮),且是第三个独立降级位置。
    state
        .0
        .last_decision
        .lock()
        .unwrap()
        .clone()
        .map(|d| apply_runtime_gate(d, &SysDebugProbe))
}

// ─────────────────────────────────────────────────────────────────────────────
// [T-396c] 版本检查(latest-version 端点;更新流 = 检查 + 跳渠道链接,不再内置下载)
// ─────────────────────────────────────────────────────────────────────────────

/// latest-version 结果(serde camelCase 直达前端 check-update-card)。
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct LatestVersionInfo {
    pub current_version: String,
    /// null = 服务端未公告版本 / 授权失效不提示更新。
    pub latest_version: Option<String>,
    pub release_notes: Option<String>,
    /// 该码渠道的下载链接;null = 未激活/渠道未配 → 前端显「联系授权方」,
    /// **绝不回退官方链接**(SPEC §5/§7 红线,防泄官方定价)。
    pub download_url: Option<String>,
    pub update_available: bool,
}

/// 语义化版本比较:latest 是否比 current 新。按数字段逐段比较(容忍 `v` 前缀 /
/// 非数字分隔);latest 解析不出数字段 → false(脏值不臆造新版,诚实不提示)。
pub fn version_newer(latest: &str, current: &str) -> bool {
    fn parts(v: &str) -> Vec<u64> {
        v.trim()
            .trim_start_matches(['v', 'V'])
            .split(|c: char| !c.is_ascii_digit())
            .filter(|s| !s.is_empty())
            .map(|s| s.parse::<u64>().unwrap_or(0))
            .collect()
    }
    let l = parts(latest);
    let c = parts(current);
    if l.is_empty() {
        return false;
    }
    for i in 0..l.len().max(c.len()) {
        let a = l.get(i).copied().unwrap_or(0);
        let b = c.get(i).copied().unwrap_or(0);
        if a != b {
            return a > b;
        }
    }
    false
}

/// 调 `POST /api/app/latest-version`(契约见 SPEC §4):带激活码(未激活 → code=null,
/// 服务端只回版本号、downloadUrl=null,不泄默认渠道)+ nonce,强验签模式走与决策链同款
/// Ed25519 签名/date/nonce 校验。**错误一律人话**(并入 T-412:技术原因只进日志)。
///
/// 授权失效不提示更新(SPEC §6 / T-372 L3「停更新」语义):
///   · 内测码 revoked / 快照未放行 → 不提示;
///   · 买断码 updatesBlocked(签名撤销)→ 不提示(前端入口本已停用,这里双保险)。
pub fn fetch_latest_version(
    cfg: &LicenseConfig,
    http: &dyn LicenseHttp,
    clock: &dyn LicenseClock,
    current_version: &str,
    existing: Option<&LicenseSnapshot>,
) -> Result<LatestVersionInfo, String> {
    let no_prompt = LatestVersionInfo {
        current_version: current_version.to_string(),
        latest_version: None,
        release_notes: None,
        download_url: None,
        update_available: false,
    };
    if let Some(s) = existing {
        let trial_dead = s.expires_at.is_some() && (s.revoked || !s.allowed);
        if trial_dead || s.updates_blocked {
            return Ok(no_prompt);
        }
    }

    let strict = cfg.strict_verify;
    let verify_key = if strict {
        match resolve_public_key(&cfg.public_key_b64) {
            Ok(k) => Some(k),
            Err(e) => {
                eprintln!("[license] latest-version 公钥不可用: {e}");
                return Err("更新服务暂时不可用,请稍后重试。".to_string());
            }
        }
    } else {
        None
    };

    let path = "/api/app/latest-version";
    let url = format!("{}{}", cfg.base_url.trim_end_matches('/'), path);
    let host = host_of(&cfg.base_url);
    let target = format!("post {path}");
    let wall = clock.wall_ms();

    let mut attempt: u32 = 0;
    let body_value: serde_json::Value = loop {
        let last_attempt = attempt + 1 >= MAX_ONLINE_ATTEMPTS;
        let cur_nonce = gen_nonce();
        let req_body = serde_json::json!({
            // 未激活 → code=null(契约:服务端只回版本号,downloadUrl=null,不泄默认渠道)。
            "code": existing.map(|s| s.code.clone()),
            "machineId": cfg.machine_id,
            "projectKey": cfg.project_key,
            "nonce": cur_nonce,
        })
        .to_string();

        let r = match http.post(&url, &req_body) {
            Ok(r) => r,
            Err(net_err) => {
                if last_attempt {
                    eprintln!("[license] latest-version 网络不可达: {net_err}");
                    return Err("无法连接更新服务,请检查网络后重试。".to_string());
                }
                attempt += 1;
                transient_backoff(attempt);
                continue;
            }
        };
        if !(200..300).contains(&r.status) {
            eprintln!("[license] latest-version HTTP {}", r.status);
            return Err("更新服务暂时不可用,请稍后重试。".to_string());
        }

        if strict {
            let key = verify_key.as_ref().expect("strict ⟹ 公钥已解析");
            if let Err(e) = verify_response_signature(key, &target, &host, &r) {
                if last_attempt {
                    eprintln!("[license] latest-version 验签未过: {e}");
                    return Err("更新服务响应校验未通过,请稍后重试。".to_string());
                }
                attempt += 1;
                transient_backoff(attempt);
                continue;
            }
            let date_ms = match r.date.as_deref().map(parse_rfc1123_ms) {
                Some(Ok(ms)) => ms,
                _ => {
                    if last_attempt {
                        eprintln!("[license] latest-version X-License-Date 缺失或不可解析");
                        return Err("更新服务响应校验未通过,请稍后重试。".to_string());
                    }
                    attempt += 1;
                    transient_backoff(attempt);
                    continue;
                }
            };
            if (date_ms - wall).abs() > MAX_DATE_SKEW_MS {
                eprintln!("[license] latest-version 响应时间戳偏差超限(疑似重放或时钟不准)");
                return Err("系统时间可能不准,请校准系统时间后重试。".to_string());
            }
            let v: serde_json::Value =
                serde_json::from_slice(&r.body).unwrap_or(serde_json::Value::Null);
            if v.get("nonce").and_then(|x| x.as_str()) != Some(cur_nonce.as_str()) {
                if last_attempt {
                    eprintln!("[license] latest-version nonce 未回显一致(疑似重放)");
                    return Err("更新服务响应校验未通过,请稍后重试。".to_string());
                }
                attempt += 1;
                transient_backoff(attempt);
                continue;
            }
            break v;
        }
        break serde_json::from_slice(&r.body).unwrap_or(serde_json::Value::Null);
    };

    let str_of = |ck: &str, sk: &str| {
        body_value
            .get(ck)
            .or_else(|| body_value.get(sk))
            .and_then(|x| x.as_str())
            .map(|s| s.to_string())
    };
    let latest_version = str_of("latestVersion", "latest_version");
    let release_notes = str_of("releaseNotes", "release_notes");
    // https 白名单同渠道链接(防线纵深;downloadUrl=null 前端显「联系授权方」不回退)。
    let download_url = sanitize_channel_url(
        body_value
            .get("downloadUrl")
            .or_else(|| body_value.get("download_url")),
    );
    let update_available = latest_version
        .as_deref()
        .map(|l| version_newer(l, current_version))
        .unwrap_or(false);
    Ok(LatestVersionInfo {
        current_version: current_version.to_string(),
        latest_version,
        release_notes,
        download_url,
        update_available,
    })
}

/// [T-396c] 检查更新 IPC:前端 check-update-card 调这里(替代 Tauri updater 插件的
/// check();updater endpoint 已从 tauri.conf.json 摘除,签名产物链保留 = 可逆开关)。
/// Err 即人话文案,前端直接展示(并入 T-412:不再把 `error sending request for url(…)`
/// 这类技术报错甩给用户)。
#[tauri::command]
pub async fn license_latest_version(
    app: tauri::AppHandle,
    state: tauri::State<'_, LicenseState>,
) -> Result<LatestVersionInfo, String> {
    let ctx = state.0.clone();
    let current = app.package_info().version.to_string();
    tauri::async_runtime::spawn_blocking(move || {
        let config = LicenseConfig::from_env(ctx.machine_id.clone());
        let http = ReqwestHttp {
            timeout: std::time::Duration::from_secs(10),
        };
        let key = ctx.master_key_b64.as_deref().and_then(derive_license_key);
        let existing = read_snapshot_file(&license_file_path(&ctx.app_data_dir), key.as_ref());
        fetch_latest_version(&config, &http, &SystemClock, &current, existing.as_ref())
    })
    .await
    .map_err(|e| format!("检查更新任务执行失败: {e}"))?
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
        /// [T-408] 前 N 次调用故意坏(回错 nonce)模拟瞬态,第 N+1 次起正常 → 验重试自愈。
        fail_first: u32,
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
                fail_first: 0,
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
            // [T-408] 前 fail_first 次回错 nonce 模拟瞬态(CDN 抖动/坏缓存),之后正常回显。
            let transient_bad = self.calls.get() <= self.fail_first;
            let mut body = self.body_template.clone();
            body["nonce"] = serde_json::Value::String(if self.wrong_nonce || transient_bad {
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

    #[test]
    fn packaged_project_key_is_used_without_finder_environment_and_runtime_can_override() {
        assert_eq!(
            resolve_license_project_key(None, " test "),
            "test",
            "Finder 启动没有终端 env 时必须使用包内产品 key"
        );
        assert_eq!(
            resolve_license_project_key(Some("creatoros-dev".to_string()), "test"),
            "creatoros-dev",
            "开发/诊断态仍允许显式运行时覆盖"
        );
        assert_eq!(
            resolve_license_project_key(Some("  ".to_string()), ""),
            "",
            "直接 cargo dev 未配置时仍保持 fail-closed"
        );
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
            channel_ref: None,
            channel_runtime: None,
            expires_at: Some("2026-07-20T12:00:00Z".to_string()),
            activated_at: "2026-07-17T00:00:00Z".to_string(),
            last_online_check_ms: NOW_MS - 3_600_000,
            last_seen_ms: NOW_MS - 3_600_000,
            grace_seconds: 86_400,
            revoked: false,
            updates_blocked: false,
            signature_verified: true,
            verdict_at_ms: NOW_MS - 3_600_000,
            message: String::new(),
        }
    }

    /// [T-372 L3] 买断码快照:expiresAt=null、graceSeconds=30 天。
    fn snapshot_perpetual() -> LicenseSnapshot {
        LicenseSnapshot {
            expires_at: None,
            license_mode: "TIME".to_string(),
            grace_seconds: 2_592_000,
            ..snapshot_active()
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
        let out = run(
            &cfg,
            &server,
            NOW_MS,
            &[],
            LicenseOp::Status,
            Some(&existing),
        );
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

    // ④b [T-408] 瞬态 nonce 不一致(前 2 次坏,第 3 次正常)→ 重试自愈,最终激活成功。
    #[test]
    fn transient_nonce_mismatch_self_heals_by_retry() {
        let (sk, pk) = test_keypair();
        let mut server = FakeServer::ok(sk, valid_body());
        server.fail_first = 2; // 前两次瞬态坏,第三次好
        let cfg = config(&pk, true);
        let out = run(
            &cfg,
            &server,
            NOW_MS,
            &[],
            LicenseOp::Activate { code: "CODE-1" },
            None,
        );
        assert!(
            out.decision.licensed,
            "重试后应激活成功: {:?}",
            out.decision
        );
        assert_eq!(out.decision.status, "active");
        assert_eq!(server.calls.get(), 3, "应重试到第 3 次才成功");
    }

    // ④c [T-408] 持续 nonce 不一致(每次都坏)→ 重试耗尽后拒绝,但用户文案友好(无「疑似重放」)。
    #[test]
    fn persistent_nonce_mismatch_rejects_with_friendly_message() {
        let (sk, pk) = test_keypair();
        let mut server = FakeServer::ok(sk, valid_body());
        server.wrong_nonce = true; // 每次都坏
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
        assert_eq!(
            server.calls.get(),
            MAX_ONLINE_ATTEMPTS,
            "应重试满 MAX_ONLINE_ATTEMPTS 次"
        );
        // 关键:不把「疑似重放」等安全术语甩给用户。
        assert!(
            !out.decision.message.contains("重放"),
            "{}",
            out.decision.message
        );
        assert!(
            !out.decision.message.contains("不可信"),
            "{}",
            out.decision.message
        );
        assert!(
            out.decision.message.contains("重试"),
            "应给可操作提示: {}",
            out.decision.message
        );
    }

    // ④d [T-408] 真实服务器对同一字段下发 snake+camel 双份 → 旧 strict 结构体判 duplicate field 解析
    //   失败 → nonce 丢 → 误判「疑似重放」拒激活。容错解析必须取到 nonce(2026-07-18 真机根因)。
    #[test]
    fn wire_body_tolerates_dual_snake_camel_keys() {
        let raw = r#"{"success":true,"message":"激活码激活成功","expires_at":"2026-07-19T16:42:16Z","expiresAt":"2026-07-19T16:42:16Z","remaining_count":null,"license_mode":"TRIAL","licenseMode":"TRIAL","isActivated":true,"is_activated":true,"valid":true,"serverTime":"2026-07-18T18:30:23Z","revoked":false,"graceSeconds":86400,"nonce":"abc123"}"#.as_bytes();
        // 反证:旧 strict 结构体解析对含双份键的真实响应确实失败(root cause)。
        let strict: Result<WireBody, _> = serde_json::from_slice(raw);
        assert!(
            strict.is_err(),
            "旧 strict 解析应因 duplicate field 失败(证明根因)"
        );
        // 容错解析取到全部关键字段,尤其 nonce 不丢。
        let wb = WireBody::from_response_bytes(raw);
        assert_eq!(wb.nonce.as_deref(), Some("abc123"), "双份键不该丢 nonce");
        assert_eq!(wb.success, Some(true));
        assert_eq!(wb.valid, Some(true));
        assert_eq!(wb.expires_at.as_deref(), Some("2026-07-19T16:42:16Z"));
        assert_eq!(wb.license_mode.as_deref(), Some("TRIAL"));
        assert_eq!(wb.server_time.as_deref(), Some("2026-07-18T18:30:23Z"));
        assert_eq!(wb.grace_seconds, Some(86400));
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
        assert_eq!(out.decision.status, "untrusted");
        // [T-408] 用户文案友好可操作(校准时间),不含「疑似重放」等安全术语;技术原因只进日志。
        assert!(
            out.decision.message.contains("校准"),
            "{}",
            out.decision.message
        );
        assert!(
            !out.decision.message.contains("重放"),
            "不该把安全术语给用户: {}",
            out.decision.message
        );
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
        let out = run(
            &cfg,
            &server,
            rolled_back,
            &[&p1],
            LicenseOp::Status,
            Some(&existing),
        );
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
        let out = run(
            &cfg,
            &server,
            slightly_back,
            &[&p1],
            LicenseOp::Status,
            Some(&existing),
        );
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
        // 占位公钥 → 诚实不放行(status=untrusted);技术原因(公钥未配置)进日志,用户见友好文案。
        assert!(!out.decision.licensed);
        assert_eq!(out.decision.status, "untrusted");
        assert!(
            !out.decision.message.contains("重放"),
            "{}",
            out.decision.message
        );
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
        let out = run(
            &cfg,
            &server,
            NOW_MS,
            &[],
            LicenseOp::Status,
            Some(&existing),
        );
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

    // ⑫ [对照表·内测·签名 revoked 行] 在线明确 revoked=true(签名可信)→ 立即不放行
    //   (= 前端桥收到 licensed=false 即跳激活页,心跳吊销即时生效,SPEC §7)。
    #[test]
    fn revoked_response_blocks() {
        let (sk, pk) = test_keypair();
        let mut body = valid_body();
        body["revoked"] = serde_json::Value::Bool(true);
        let server = FakeServer::ok(sk, body);
        let cfg = config(&pk, true);
        let existing = snapshot_active();
        let out = run(
            &cfg,
            &server,
            NOW_MS,
            &[],
            LicenseOp::Status,
            Some(&existing),
        );
        assert!(!out.decision.licensed);
        assert!(out.decision.revoked);
        // 内测吊销 = 整体不放行,绝不是「仅停更新」软降级(那是买断专属语义)。
        assert_eq!(out.decision.mode, "trial");
        assert!(!out.decision.updates_blocked);
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
        let wrong =
            derive_license_key(&base64::engine::general_purpose::STANDARD.encode([1u8; 32]))
                .unwrap();
        assert!(decrypt_snapshot(&packed, Some(&wrong)).is_err());
    }

    // ⑮ ISO 解析健壮性(决策链的时间地基)。
    #[test]
    fn iso_parse_basics() {
        assert_eq!(parse_iso_ms("2026-07-17T12:00:00Z"), Some(NOW_MS));
        assert_eq!(parse_iso_ms("2026-07-17T12:00:00.500Z"), Some(NOW_MS + 500));
        assert!(parse_iso_ms("not-a-date").is_none());
        assert!(parse_iso_ms("2026-07-17T12:00:00+08:00").is_none());
        assert_eq!(format_iso_ms(NOW_MS), "2026-07-17T12:00:00Z");
    }

    // ─────────────────────────────────────────────────────────────────────────
    // [T-372 L3] 码型分支 —— SPEC §8 对照表逐行(内测/买断不共用分支)
    // ─────────────────────────────────────────────────────────────────────────

    // [对照表·内测·到期行] 到期硬跳:哪怕上次在线校验就在 1h 前(远在 24h 宽限窗内),
    // 到期即 expired,离线宽限不给到期延命(SPEC §7「无宽限延命」)。
    #[test]
    fn trial_expiry_hard_blocks_without_grace() {
        let (sk, pk) = test_keypair();
        let mut server = FakeServer::ok(sk, valid_body());
        server.network_error = true; // 离线也一样:宽限只救「连不上」,救不了「到期」
        let cfg = config(&pk, true);
        let mut s = snapshot_active();
        s.expires_at = Some("2026-07-17T11:00:00Z".to_string()); // 1h 前已到期
        let out = run(&cfg, &server, NOW_MS, &[], LicenseOp::Status, Some(&s));
        assert!(!out.decision.licensed);
        assert_eq!(out.decision.status, "expired");
        assert_eq!(out.decision.mode, "trial");
    }

    // [对照表·内测·连不上网行] 离线宽限 = fail-closed:窗内放行且回报剩余秒数(UI 倒计时),
    // 超 24h 跳激活页(已在 offline_grace_semantics 断言超窗拒;此处锚剩余秒数)。
    #[test]
    fn trial_offline_grace_reports_remaining_seconds() {
        let (sk, pk) = test_keypair();
        let mut server = FakeServer::ok(sk, valid_body());
        server.network_error = true;
        let cfg = config(&pk, true);
        let existing = snapshot_active(); // 上次在线校 1h 前,grace 86400s
        let out = run(
            &cfg,
            &server,
            NOW_MS,
            &[],
            LicenseOp::Status,
            Some(&existing),
        );
        assert!(out.decision.licensed);
        assert_eq!(out.decision.status, "grace");
        // 剩余 = 86400 - 3600 = 82800s(SPEC §7 宽限窗内显示离线剩余倒计时)。
        assert_eq!(out.decision.offline_remaining, Some(82_800));
    }

    // [对照表·买断·连不上网行] fail-open:哪怕上次在线校验已是 100 天前,网络不可达
    // 照常放行,无限期离线可用(SPEC §8「连不上网 ≠ 撤销」)。
    #[test]
    fn perpetual_offline_fail_open_indefinitely() {
        let (sk, pk) = test_keypair();
        let mut server = FakeServer::ok(sk, valid_body());
        server.network_error = true;
        let cfg = config(&pk, true);
        let mut s = snapshot_perpetual();
        s.last_online_check_ms = NOW_MS - 100 * 86_400_000; // 100 天没连上服务器
        s.last_seen_ms = NOW_MS - 3_600_000;
        let out = run(&cfg, &server, NOW_MS, &[], LicenseOp::Status, Some(&s));
        assert!(out.decision.licensed, "{:?}", out.decision);
        assert_eq!(out.decision.status, "active");
        assert_eq!(out.decision.mode, "perpetual");
        assert!(
            out.decision.offline_remaining.is_none(),
            "买断无宽限倒计时概念"
        );
        assert!(out.snapshot.unwrap().allowed);
    }

    // [对照表·买断·签名 revoked 行] 仅签名撤销才降级,且降级 = 停更新 + 提示,
    // **不锁核心功能**(licensed 仍 true,快照 allowed 仍 true)。
    #[test]
    fn perpetual_signed_revoked_blocks_updates_only() {
        let (sk, pk) = test_keypair();
        let mut body = valid_body();
        body["expiresAt"] = serde_json::Value::Null;
        body["revoked"] = serde_json::Value::Bool(true);
        let server = FakeServer::ok(sk, body);
        let cfg = config(&pk, true);
        let existing = snapshot_perpetual();
        let out = run(
            &cfg,
            &server,
            NOW_MS,
            &[],
            LicenseOp::Status,
            Some(&existing),
        );
        assert!(
            out.decision.licensed,
            "买断撤销不锁核心功能: {:?}",
            out.decision
        );
        assert!(out.decision.revoked);
        assert!(out.decision.updates_blocked, "撤销 → 停更新态");
        assert!(out.decision.message.contains("核心功能不受影响"));
        let snap = out.snapshot.unwrap();
        assert!(snap.allowed, "放行权威仍为 true");
        assert!(snap.revoked);
        assert!(snap.updates_blocked);
    }

    // [对照表·买断·签名 revoked 行·反面] 未签名的 revoked 不作数(弱验签模式):
    // 买断只认签名撤销,防伪造 revoked 误伤离线权利。
    #[test]
    fn perpetual_unsigned_revoked_ignored() {
        let (sk, pk) = test_keypair();
        let mut body = valid_body();
        body["expiresAt"] = serde_json::Value::Null;
        body["revoked"] = serde_json::Value::Bool(true);
        let mut server = FakeServer::ok(sk, body);
        server.no_signature_headers = true; // 无签名头
        let cfg = config(&pk, false); // gate-F2 弱验签
        let out = run(
            &cfg,
            &server,
            NOW_MS,
            &[],
            LicenseOp::Status,
            Some(&snapshot_perpetual()),
        );
        assert!(out.decision.licensed);
        assert!(!out.decision.updates_blocked, "未签名 revoked 不触发停更新");
    }

    // [买断 fail-open 推论] 不可信响应(篡改/伪造)对买断 = 「无法确认」而非「撤销」:
    // 照常放行且不动快照(伪造响应既锁不死付费用户,也抹不掉已有撤销态)。
    #[test]
    fn perpetual_untrusted_response_does_not_degrade() {
        let (sk, pk) = test_keypair();
        let mut server = FakeServer::ok(sk, valid_body());
        server.tamper_body_after_sign = true;
        let cfg = config(&pk, true);
        let existing = snapshot_perpetual();
        let out = run(
            &cfg,
            &server,
            NOW_MS,
            &[],
            LicenseOp::Status,
            Some(&existing),
        );
        assert!(out.decision.licensed, "{:?}", out.decision);
        assert!(out.snapshot.is_none(), "不可信输入不落盘");
        // 已有停更新态也不被伪造响应清除。
        let mut blocked = snapshot_perpetual();
        blocked.updates_blocked = true;
        blocked.revoked = true;
        let out2 = run(
            &cfg,
            &server,
            NOW_MS,
            &[],
            LicenseOp::Status,
            Some(&blocked),
        );
        assert!(out2.decision.licensed);
        assert!(out2.decision.updates_blocked, "伪造响应清不掉撤销停更新态");
        assert!(out2.snapshot.is_none());
    }

    // [买断 fail-open 推论] 回拨检测不硬拦买断:买断无到期可延命,回拨无收益,
    // 硬拦只会误伤改时区/校时的付费用户(内测回拨拦截已在 clock_rollback_expires 锚定)。
    #[test]
    fn perpetual_clock_rollback_not_blocking() {
        let (sk, pk) = test_keypair();
        let mut server = FakeServer::ok(sk, valid_body());
        server.network_error = true; // 离线 + 回拨叠加,仍放行
        let cfg = config(&pk, true);
        let existing = snapshot_perpetual();
        let p1 = MemPoint::new(Some(NOW_MS));
        let rolled_back = NOW_MS - 4 * 3_600_000; // 回拨 4h(远超 1h 容差)
        let out = run(
            &cfg,
            &server,
            rolled_back,
            &[&p1],
            LicenseOp::Status,
            Some(&existing),
        );
        assert!(out.decision.licensed, "{:?}", out.decision);
        assert_eq!(out.decision.mode, "perpetual");
    }

    // [对照表·graceSeconds 下发行] 服务端未下发时兜底按码型区分:内测 86400 / 买断 2_592_000。
    #[test]
    fn grace_seconds_fallback_per_mode() {
        let (sk, pk) = test_keypair();
        let cfg = config(&pk, true);
        // 内测:缺 graceSeconds → 86400。
        let mut body = valid_body();
        body.as_object_mut().unwrap().remove("graceSeconds");
        let server = FakeServer::ok(sk.clone(), body);
        let out = run(
            &cfg,
            &server,
            NOW_MS,
            &[],
            LicenseOp::Activate { code: "C" },
            None,
        );
        assert_eq!(out.snapshot.unwrap().grace_seconds, 86_400);
        // 买断:缺 graceSeconds → 2_592_000。
        let mut body2 = valid_body();
        body2["expiresAt"] = serde_json::Value::Null;
        body2.as_object_mut().unwrap().remove("graceSeconds");
        let server2 = FakeServer::ok(sk, body2);
        let out2 = run(
            &cfg,
            &server2,
            NOW_MS,
            &[],
            LicenseOp::Activate { code: "C" },
            None,
        );
        assert_eq!(out2.snapshot.unwrap().grace_seconds, 2_592_000);
    }

    // [对照表·心跳周期行] 内测 3600s(60min)/ 买断 2_592_000s(30 天);
    // 内测另在到期时刻前唤醒(到期即查即跳,不等满一个周期)。
    #[test]
    fn heartbeat_cadence_per_mode() {
        assert_eq!(heartbeat_interval_secs("trial"), 3_600);
        assert_eq!(heartbeat_interval_secs("perpetual"), 2_592_000);
        // 买断:恒 30 天(无到期概念)。
        assert_eq!(next_heartbeat_secs("perpetual", None, NOW_MS), 2_592_000);
        // 内测:无到期信息 → 标准 60min。
        assert_eq!(next_heartbeat_secs("trial", None, NOW_MS), 3_600);
        // 内测:10 分钟后到期 → 在到期时刻(+1s)唤醒,而非等满 60min。
        assert_eq!(
            next_heartbeat_secs("trial", Some(NOW_MS + 600_000), NOW_MS),
            601
        );
        // 内测:已到期 → 1s 内立即复校(触发 expired → 前端跳激活页)。
        assert_eq!(next_heartbeat_secs("trial", Some(NOW_MS - 1), NOW_MS), 1);
    }

    // [兼容] L2 旧快照(无 updatesBlocked 字段)解析按 false 兜底,不强迫重激活。
    #[test]
    fn snapshot_updates_blocked_serde_default() {
        let mut v = serde_json::to_value(snapshot_active()).unwrap();
        v.as_object_mut().unwrap().remove("updatesBlocked");
        let parsed: LicenseSnapshot = serde_json::from_value(v).unwrap();
        assert!(!parsed.updates_blocked);
    }

    // [买断解除] 一次干净的签名 valid(revoked=false)响应即解除停更新态。
    #[test]
    fn perpetual_clean_response_clears_updates_blocked() {
        let (sk, pk) = test_keypair();
        let mut body = valid_body();
        body["expiresAt"] = serde_json::Value::Null;
        let server = FakeServer::ok(sk, body);
        let cfg = config(&pk, true);
        let mut blocked = snapshot_perpetual();
        blocked.updates_blocked = true;
        blocked.revoked = true;
        let out = run(
            &cfg,
            &server,
            NOW_MS,
            &[],
            LicenseOp::Status,
            Some(&blocked),
        );
        assert!(out.decision.licensed);
        assert!(!out.decision.updates_blocked);
        let snap = out.snapshot.unwrap();
        assert!(!snap.updates_blocked);
        assert!(!snap.revoked);
    }

    // ═════════════════════════════════════════════════════════════════════════
    // [T-391 H-native] 反调试 + 去单点化 + 灭靶点 测试面(SPEC §12)
    // ═════════════════════════════════════════════════════════════════════════

    /// 注入式假探针:模拟「被 traced / 未被 traced」。
    struct FakeProbe(bool);
    impl DebugProbe for FakeProbe {
        fn is_traced(&self) -> bool {
            self.0
        }
    }

    /// 构造一个「声称放行」的决策(licensed=true,status=active)。
    fn decision_licensed(mode: &str) -> GateDecision {
        GateDecision {
            licensed: true,
            status: "active".to_string(),
            mode: mode.to_string(),
            expires_at: if mode == "perpetual" {
                None
            } else {
                Some("2999-01-01T00:00:00Z".to_string())
            },
            revoked: false,
            updates_blocked: false,
            offline_remaining: None,
            signature_verified: true,
            strict_verify: true,
            message: "ok".to_string(),
        }
    }

    // ── 反调试:注入 fake「被 traced」→ 静默降级(不 panic、不放行) ──────────────
    #[test]
    fn anti_debug_traced_degrades_silently_not_allowed() {
        for mode in ["trial", "perpetual"] {
            let d = decision_licensed(mode);
            let gated = apply_runtime_gate(d, &FakeProbe(true));
            assert!(!gated.licensed, "被 trace 应静默降级不放行(mode={mode})");
            assert_eq!(gated.status, "untrusted", "降级为 untrusted(mode={mode})");
            // 走到这里即证明未 panic / 未硬崩。
        }
    }

    // ── 反调试:未被 traced 的正常放行不被误伤 ────────────────────────────────
    #[test]
    fn anti_debug_clean_does_not_false_degrade() {
        for mode in ["trial", "perpetual"] {
            let d = decision_licensed(mode);
            let gated = apply_runtime_gate(d, &FakeProbe(false));
            assert!(gated.licensed, "未被 trace 的合法放行不应误伤(mode={mode})");
            assert_eq!(gated.status, "active");
        }
    }

    // ── 去单点化:单独 patch 掉放行判定(翻 licensed bit 而证据不自洽)→ 复算降级 ──
    // 断言的是「功能坏(licensed=false)」而非「跳过照常放行」。
    #[test]
    fn desingle_patched_allow_bit_does_not_survive_recompute() {
        // 攻击者把一个 expired 决策的 licensed 单独翻成 true(典型「patch 掉判定」)。
        let mut d = decision_licensed("trial");
        d.status = "expired".to_string(); // 证据:实为过期
        d.licensed = true; // 仅翻这一个 bool
        let gated = apply_runtime_gate(d, &FakeProbe(false));
        assert!(
            !gated.licensed,
            "单翻 allow bit 而证据不自洽,应被多点复算降级(非跳过照常)"
        );
        assert_eq!(gated.status, "untrusted");
    }

    // ── 去单点化:能力值只在证据规范自洽且未被 trace 时命中解锁指纹 ──────────────
    #[test]
    fn capability_unlocks_only_on_consistent_untraced_evidence() {
        let live = decision_licensed("perpetual");
        assert!(is_capability_unlocked(&live, false), "规范放行应解锁");
        assert!(!is_capability_unlocked(&live, true), "被 trace 不解锁");
        // grace(离线宽限)与 active 同权放行。
        let mut grace = decision_licensed("trial");
        grace.status = "grace".to_string();
        assert!(is_capability_unlocked(&grace, false), "grace 应解锁");
        // 证据不自洽(status 非 active/grace)→ 不解锁。
        let mut bad = decision_licensed("trial");
        bad.status = "expired".to_string();
        assert!(!is_capability_unlocked(&bad, false));
        let mut bad2 = decision_licensed("trial");
        bad2.licensed = false;
        assert!(!is_capability_unlocked(&bad2, false));
    }

    // ── 回归护栏:P5 弱验签不变式(signature_verified=false 但 status=active)不被去单点化卡住 ──
    #[test]
    fn desingle_does_not_break_p5_weak_verify_invariant() {
        let mut d = decision_licensed("trial");
        d.signature_verified = false; // 弱验签 P5
        d.strict_verify = false;
        d.message = "已激活(签名校验未启用)".to_string();
        let gated = apply_runtime_gate(d, &FakeProbe(false));
        assert!(
            gated.licensed,
            "P5 弱验签放行不能被去单点化误降级(桌面态外/弱验签必须放行)"
        );
        assert_eq!(gated.status, "active");
    }

    // ── 回归护栏:本就不放行的决策原样返回(降级只针对「声称放行」者) ────────────
    #[test]
    fn gate_leaves_already_unlicensed_untouched() {
        let mut d = decision_licensed("trial");
        d.licensed = false;
        d.status = "expired".to_string();
        let gated = apply_runtime_gate(d.clone(), &FakeProbe(true));
        assert!(!gated.licensed);
        assert_eq!(gated.status, "expired", "不放行者不被改写为 untrusted");
    }

    // ── 灭靶点:公钥拆分重组 + 交叉校验 + 存储态无连续 32B 靶点 ────────────────────
    #[test]
    fn mieba_dian_pubkey_split_reassemble_and_crosscheck() {
        // 任意 32B 测试向量(非真钥)。
        let raw: [u8; 32] = core::array::from_fn(|i| (i as u8).wrapping_mul(11).wrapping_add(5));
        let mask_a: Vec<u8> = (0..16u8)
            .map(|i| i.wrapping_mul(7).wrapping_add(1))
            .collect();
        let mask_b: Vec<u8> = (0..16u8)
            .map(|i| i.wrapping_mul(5).wrapping_add(3))
            .collect();
        let frag_a: Vec<u8> = raw[..16].iter().zip(&mask_a).map(|(b, m)| b ^ m).collect();
        let frag_b: Vec<u8> = raw[16..].iter().zip(&mask_b).map(|(b, m)| b ^ m).collect();
        let fp = sha256_bytes(&raw)[..4].to_vec();

        // 正常重组 == 原钥。
        let got = reassemble_pubkey_fragments(&frag_a, &frag_b, &mask_a, &mask_b, &fp)
            .expect("合法两片应重组成功");
        assert_eq!(got, raw);

        // 存储态(两片密文拼接)不含原钥的连续 32B(去掉高熵靶点)。
        let mut stored = frag_a.clone();
        stored.extend(&frag_b);
        assert!(
            !contains_subslice(&stored, &raw),
            "拆分存储态不应含连续 32B 公钥靶点"
        );

        // 单片被 patch → SHA-256 前缀指纹交叉校验拒绝重组。
        let mut tampered = frag_a.clone();
        tampered[0] ^= 0xff;
        assert!(
            reassemble_pubkey_fragments(&tampered, &frag_b, &mask_a, &mask_b, &fp).is_none(),
            "单片被篡改应被指纹交叉校验拒绝"
        );

        // 长度非 32 → 拒绝。
        assert!(reassemble_pubkey_fragments(&frag_a, &[], &mask_a, &[], &fp).is_none());

        // 占位空钥(两片皆空)→ None(strict 下诚实拒绝)。
        assert!(reassemble_pubkey_fragments(&[], &[], &[], &[], &[]).is_none());
        // 真钥已填(2026-07-17,L1s 服务端配对)→ 重组出的公钥必须等于服务端 raw 公钥,
        // 且能解析为合法 Ed25519 验签钥(防拆片/掩码/指纹任一手滑)。
        let b64 = embedded_pubkey_b64();
        assert_eq!(
            b64, "Tn9/DNG1gNNb2f33o9GAOyBL5hvS/8x0Fea3i//kYX0=",
            "嵌入公钥重组结果应与 L1s 服务端公钥一致"
        );
        assert!(
            resolve_public_key(&b64).is_ok(),
            "嵌入公钥应为合法 Ed25519 钥"
        );
    }

    // ── 灭靶点:构建后二进制内无 license 相关明文定位串(post-build 断言,读 current_exe) ──
    // needle 用运行时拼接构造,避免本测试源码把明文写进测试二进制造成假命中。
    #[test]
    fn mieba_dian_no_plaintext_locators_in_binary() {
        let exe = std::env::current_exe().expect("current_exe");
        let bytes = std::fs::read(&exe).expect("read exe");
        // needle 本身用 obfstr 承载:测试二进制内也不留这些明文串,避免「测试源码自证假命中」。
        let needles = [
            obfstr::obfstring!("creatoros-license-v1"), // license 密钥派生上下文
            obfstr::obfstring!("creatoros-gate-capability-v1"), // 去单点化能力上下文
        ];
        for needle in needles {
            assert!(
                !contains_subslice(&bytes, needle.as_bytes()),
                "灭靶点失败:二进制内出现明文定位串 {needle}(obfstr 未生效?)"
            );
        }
    }

    /// 子切片查找(测试辅助)。
    fn contains_subslice(haystack: &[u8], needle: &[u8]) -> bool {
        if needle.is_empty() || needle.len() > haystack.len() {
            return false;
        }
        haystack.windows(needle.len()).any(|w| w == needle)
    }

    // ─────────────────────────────────────────────────────────────────────────
    // [T-534] channel-runtime-v2 consumer contract
    // ─────────────────────────────────────────────────────────────────────────

    #[test]
    fn channel_runtime_v2_projection_fixture_is_closed_and_digest_bound() {
        let fixture: serde_json::Value = serde_json::from_str(include_str!(
            "../../../docs/contracts/fixtures/channel-runtime-v2.projection.json"
        ))
        .expect("projection fixture json");
        let runtime =
            parse_signed_channel_runtime(&fixture["channelConfig"], "creatoros", Some("agent-42"))
                .expect("canonical v2 fixture must be accepted");
        assert_eq!(runtime.schema_version, "channel-runtime-v2");
        assert_eq!(runtime.snapshot_version, Some(17));
        assert_eq!(
            runtime.source_digest.as_deref(),
            Some("sha256:338c1c657efd10e78ccfff88833ed60cd1d80ae85c080bb7854fbfb307827883")
        );
        assert_eq!(runtime.support_url, runtime.channel_support_url);
        assert!(runtime
            .bug_feedback_url
            .as_deref()
            .unwrap()
            .contains("?source=desktop#form"));
        let vector: serde_json::Value = serde_json::from_str(include_str!(
            "../../../docs/contracts/fixtures/growth-channel-runtime-v1.vector.json"
        ))
        .expect("source digest vector json");
        let canonical = serde_json_canonicalizer::to_string(&vector["semanticSnapshot"]).unwrap();
        assert_eq!(canonical.as_bytes().len(), 567);
        assert_eq!(canonical, vector["canonicalUtf8"].as_str().unwrap());
        assert_eq!(
            format!("sha256:{:x}", Sha256::digest(canonical.as_bytes())),
            vector["sourceDigest"].as_str().unwrap()
        );
        let negative = vector["negativeVector"]["canonicalUtf8"].as_str().unwrap();
        assert_eq!(negative.as_bytes().len(), 571);
        assert_eq!(
            format!("sha256:{:x}", Sha256::digest(negative.as_bytes())),
            vector["negativeVector"]["recomputedDigest"]
                .as_str()
                .unwrap()
        );
    }

    #[test]
    fn channel_runtime_v2_rejects_extra_keys_identity_mismatch_and_userinfo() {
        let fixture: serde_json::Value = serde_json::from_str(include_str!(
            "../../../docs/contracts/fixtures/channel-runtime-v2.projection.json"
        ))
        .expect("projection fixture json");
        let mut extra = fixture["channelConfig"].clone();
        extra["price"] = serde_json::json!(99);
        assert_eq!(
            parse_signed_channel_runtime(&extra, "creatoros", Some("agent-42")).unwrap_err(),
            "CHANNEL_RUNTIME_SCHEMA_INVALID"
        );
        assert_eq!(
            parse_signed_channel_runtime(
                &fixture["channelConfig"],
                "creatoros-pro",
                Some("agent-42")
            )
            .unwrap_err(),
            "CHANNEL_RUNTIME_IDENTITY_MISMATCH"
        );
        assert_eq!(
            sanitize_runtime_url(Some(
                "https://user:pass@growth.example.com/feedback".to_string()
            ))
            .unwrap_err(),
            "CHANNEL_RUNTIME_VALUE_INVALID"
        );
    }

    #[test]
    fn channel_runtime_legacy_only_maps_support_to_channel_support() {
        let legacy = serde_json::json!({
            "brandName": "星河工作室",
            "purchaseUrl": "https://growth.example.com/buy?q=1#plans",
            "supportUrl": "https://agent.example.com/help?q=1#contact",
            "downloadUrl": "https://downloads.example.com/latest?q=mac#download"
        });
        let runtime = parse_signed_channel_runtime(&legacy, "creatoros", Some("agent-42"))
            .expect("closed legacy v1");
        assert_eq!(runtime.schema_version, "channel-runtime-legacy-v1");
        assert_eq!(runtime.channel_support_url, runtime.support_url);
        assert!(runtime.bug_feedback_url.is_none());
        assert!(runtime.renewal_url.is_none());
    }

    fn valid_body_with_runtime_v2() -> serde_json::Value {
        let fixture: serde_json::Value = serde_json::from_str(include_str!(
            "../../../docs/contracts/fixtures/channel-runtime-v2.projection.json"
        ))
        .expect("projection fixture json");
        let mut body = valid_body();
        body["channelRef"] = serde_json::json!("agent-42");
        body["channelConfig"] = fixture["channelConfig"].clone();
        body
    }

    #[test]
    fn channel_runtime_v2_is_persisted_only_from_strict_verified_response() {
        let (sk, pk) = test_keypair();
        let server = FakeServer::ok(sk, valid_body_with_runtime_v2());
        let mut cfg = config(&pk, true);
        cfg.project_key = "creatoros".to_string();
        let p = MemPoint::new(None);
        let mut existing = snapshot_active();
        existing.project_key = "creatoros".to_string();
        let out = run(
            &cfg,
            &server,
            NOW_MS,
            &[&p],
            LicenseOp::Status,
            Some(&existing),
        );
        let snapshot = out.snapshot.expect("accepted response writes snapshot");
        assert_eq!(snapshot.channel_ref.as_deref(), Some("agent-42"));
        assert_eq!(
            snapshot
                .channel_runtime
                .as_ref()
                .and_then(|runtime| runtime.snapshot_version),
            Some(17)
        );

        let (weak_sk, weak_pk) = test_keypair();
        let weak_server = FakeServer::ok(weak_sk, valid_body_with_runtime_v2());
        let mut weak_cfg = config(&weak_pk, false);
        weak_cfg.project_key = "creatoros".to_string();
        let weak = run(
            &weak_cfg,
            &weak_server,
            NOW_MS,
            &[&p],
            LicenseOp::Status,
            Some(&existing),
        );
        assert!(
            weak.snapshot
                .expect("license may still update in compatibility mode")
                .channel_runtime
                .is_none(),
            "弱验签永不生成可信 runtime 缓存"
        );
    }

    #[test]
    fn signed_identity_reassignment_never_carries_old_runtime_across_channel() {
        let (sk, pk) = test_keypair();
        let first_server = FakeServer::ok(sk.clone(), valid_body_with_runtime_v2());
        let mut cfg = config(&pk, true);
        cfg.project_key = "creatoros".to_string();
        let p = MemPoint::new(None);
        let mut existing = snapshot_active();
        existing.project_key = "creatoros".to_string();
        let adopted = run(
            &cfg,
            &first_server,
            NOW_MS,
            &[&p],
            LicenseOp::Status,
            Some(&existing),
        )
        .snapshot
        .expect("adopt old channel");
        let mut reassigned_body = valid_body();
        reassigned_body["channelRef"] = serde_json::json!("agent-99");
        reassigned_body["channelConfig"] = serde_json::Value::Null;
        let reassigned_server = FakeServer::ok(sk, reassigned_body);
        let reassigned = run(
            &cfg,
            &reassigned_server,
            NOW_MS,
            &[&p],
            LicenseOp::Status,
            Some(&adopted),
        )
        .snapshot
        .expect("signed reassignment updates identity");
        assert_eq!(reassigned.channel_ref.as_deref(), Some("agent-99"));
        assert!(
            reassigned.channel_runtime.is_none(),
            "新 identity 配置无效时必须清空旧渠道 runtime，不能本地 fallback"
        );
    }

    fn recompute_fixture_source_digest(runtime: &mut serde_json::Value) {
        let semantic = serde_json::json!({
            "contractVersion": runtime["contractVersion"].clone(),
            "sourceSystem": runtime["source"].clone(),
            "projectKey": runtime["projectKey"].clone(),
            "channelRef": runtime["channelRef"].clone(),
            "snapshotVersion": runtime["snapshotVersion"].clone(),
            "sourceUpdatedAt": runtime["sourceUpdatedAt"].clone(),
            "config": {
                "brandName": runtime["brandName"].clone(),
                "purchaseUrl": runtime["purchaseUrl"].clone(),
                "renewalUrl": runtime["renewalUrl"].clone(),
                "channelSupportUrl": runtime["channelSupportUrl"].clone(),
                "bugFeedbackUrl": runtime["bugFeedbackUrl"].clone(),
                "downloadUrl": runtime["downloadUrl"].clone(),
            }
        });
        let canonical = serde_json_canonicalizer::to_string(&semantic).unwrap();
        runtime["sourceDigest"] =
            serde_json::json!(format!("sha256:{:x}", Sha256::digest(canonical.as_bytes())));
    }

    #[test]
    fn channel_runtime_same_identity_rejects_stale_and_same_version_collision() {
        let fixture: serde_json::Value = serde_json::from_str(include_str!(
            "../../../docs/contracts/fixtures/channel-runtime-v2.projection.json"
        ))
        .unwrap();
        let old =
            parse_signed_channel_runtime(&fixture["channelConfig"], "creatoros", Some("agent-42"))
                .unwrap();
        let mut existing = snapshot_active();
        existing.project_key = "creatoros".to_string();
        existing.channel_ref = Some("agent-42".to_string());
        existing.channel_runtime = Some(old.clone());

        let mut stale = fixture["channelConfig"].clone();
        stale["snapshotVersion"] = serde_json::json!(16);
        recompute_fixture_source_digest(&mut stale);
        let stale_result = resolve_channel_runtime(
            Some(&existing),
            "creatoros",
            &Some(Some("agent-42".to_string())),
            Some(&stale),
            true,
        );
        assert_eq!(stale_result.runtime, Some(old.clone()));

        let mut collision = fixture["channelConfig"].clone();
        collision["brandName"] = serde_json::json!("另一品牌");
        recompute_fixture_source_digest(&mut collision);
        let collision_result = resolve_channel_runtime(
            Some(&existing),
            "creatoros",
            &Some(Some("agent-42".to_string())),
            Some(&collision),
            true,
        );
        assert_eq!(collision_result.runtime, Some(old));
    }

    #[test]
    fn no_master_key_never_writes_runtime_to_plaintext_license() {
        let fixture: serde_json::Value = serde_json::from_str(include_str!(
            "../../../docs/contracts/fixtures/channel-runtime-v2.projection.json"
        ))
        .unwrap();
        let runtime =
            parse_signed_channel_runtime(&fixture["channelConfig"], "creatoros", Some("agent-42"))
                .unwrap();
        let mut snapshot = snapshot_active();
        snapshot.project_key = "creatoros".to_string();
        snapshot.channel_ref = Some("agent-42".to_string());
        snapshot.channel_runtime = Some(runtime);
        let dir = std::env::temp_dir().join(format!(
            "creatoros-runtime-plaintext-sentinel-{}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let path = license_file_path(&dir);
        write_snapshot_file(&path, &snapshot, None);
        let raw = std::fs::read_to_string(&path).unwrap();
        assert!(!raw.contains("growth.example.com"));
        let degraded = decrypt_snapshot(&raw, None).unwrap();
        assert!(degraded.channel_ref.is_none());
        assert!(degraded.channel_runtime.is_none());
        let _ = std::fs::remove_dir_all(&dir);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // [T-396b] 渠道链接缓存(SPEC §5/§7/§8 测锚)
    // ─────────────────────────────────────────────────────────────────────────

    fn valid_body_with_channel() -> serde_json::Value {
        let mut b = valid_body();
        b["channelConfig"] = serde_json::json!({
            "purchaseUrl": "https://agent.example.com/buy",
            "supportUrl": "https://agent.example.com/contact",
            "downloadUrl": "https://agent.example.com/download",
        });
        b
    }

    // 合法签名响应携带 channelConfig → 采纳为覆写指令(Some(Some(cfg)))。
    #[test]
    fn channel_config_adopted_on_valid_signed_response() {
        let (sk, pk) = test_keypair();
        let server = FakeServer::ok(sk, valid_body_with_channel());
        let cfg = config(&pk, true);
        let p = MemPoint::new(None);
        let out = run(
            &cfg,
            &server,
            NOW_MS,
            &[&p],
            LicenseOp::Status,
            Some(&snapshot_active()),
        );
        assert!(out.decision.licensed);
        let update = out.channel_config.expect("应有渠道缓存覆写指令");
        let ch = update.expect("应为具体渠道配置");
        assert_eq!(
            ch.purchase_url.as_deref(),
            Some("https://agent.example.com/buy")
        );
        assert_eq!(
            ch.support_url.as_deref(),
            Some("https://agent.example.com/contact")
        );
        assert_eq!(
            ch.download_url.as_deref(),
            Some("https://agent.example.com/download")
        );
    }

    // 字段缺失(旧服务端)→ None,不动现有缓存(向后兼容)。
    #[test]
    fn channel_config_absent_leaves_cache_untouched() {
        let (sk, pk) = test_keypair();
        let server = FakeServer::ok(sk, valid_body());
        let cfg = config(&pk, true);
        let p = MemPoint::new(None);
        let out = run(
            &cfg,
            &server,
            NOW_MS,
            &[&p],
            LicenseOp::Status,
            Some(&snapshot_active()),
        );
        assert!(out.decision.licensed);
        assert!(out.channel_config.is_none(), "字段缺失不该产生覆写指令");
    }

    // 显式 null → Some(None):覆写为中性降级,**不回退官方链接**(红线)。
    #[test]
    fn channel_config_explicit_null_overwrites_to_neutral() {
        let (sk, pk) = test_keypair();
        let mut body = valid_body();
        body["channelConfig"] = serde_json::Value::Null;
        let server = FakeServer::ok(sk, body);
        let cfg = config(&pk, true);
        let p = MemPoint::new(None);
        let out = run(
            &cfg,
            &server,
            NOW_MS,
            &[&p],
            LicenseOp::Status,
            Some(&snapshot_active()),
        );
        assert_eq!(
            out.channel_config,
            Some(None),
            "显式 null 应覆写为中性降级态"
        );
    }

    // 非 https 协议头被滤掉(白名单防线纵深;javascript:/http: 都不放行)。
    #[test]
    fn channel_config_non_https_urls_dropped() {
        let (sk, pk) = test_keypair();
        let mut body = valid_body();
        body["channelConfig"] = serde_json::json!({
            "purchaseUrl": "http://insecure.example.com/buy",
            "supportUrl": "javascript:alert(1)",
            "downloadUrl": "https://ok.example.com/dl",
        });
        let server = FakeServer::ok(sk, body);
        let cfg = config(&pk, true);
        let p = MemPoint::new(None);
        let out = run(
            &cfg,
            &server,
            NOW_MS,
            &[&p],
            LicenseOp::Status,
            Some(&snapshot_active()),
        );
        let ch = out.channel_config.expect("有字段").expect("有对象");
        assert!(ch.purchase_url.is_none(), "http:// 应被滤掉");
        assert!(ch.support_url.is_none(), "javascript: 应被滤掉");
        assert_eq!(
            ch.download_url.as_deref(),
            Some("https://ok.example.com/dl")
        );
    }

    // [SPEC §8-5 测锚] 假服务器坏签名 → untrusted,渠道缓存**不动**(保留旧缓存)。
    #[test]
    fn channel_config_rejected_on_bad_signature() {
        let (sk, pk) = test_keypair();
        let mut server = FakeServer::ok(sk, valid_body_with_channel());
        server.tamper_body_after_sign = true;
        let cfg = config(&pk, true);
        let p = MemPoint::new(None);
        let out = run(
            &cfg,
            &server,
            NOW_MS,
            &[&p],
            LicenseOp::Status,
            Some(&snapshot_active()),
        );
        assert_eq!(out.decision.status, "untrusted");
        assert!(
            out.channel_config.is_none(),
            "坏签名绝不产生渠道覆写指令(沿用旧缓存)"
        );
    }

    // 码无效(过期)响应也更新渠道链接:续期入口正是这时最需要。
    #[test]
    fn channel_config_updated_even_on_invalid_code() {
        let (sk, pk) = test_keypair();
        let mut body = valid_body_with_channel();
        body["valid"] = serde_json::Value::Bool(false);
        body["message"] = serde_json::Value::String("激活码已过期".to_string());
        let server = FakeServer::ok(sk, body);
        let cfg = config(&pk, true);
        let p = MemPoint::new(None);
        let out = run(
            &cfg,
            &server,
            NOW_MS,
            &[&p],
            LicenseOp::Status,
            Some(&snapshot_active()),
        );
        assert!(!out.decision.licensed);
        let ch = out.channel_config.expect("有字段").expect("有对象");
        assert_eq!(
            ch.purchase_url.as_deref(),
            Some("https://agent.example.com/buy")
        );
    }

    // 离线 → 不动缓存(SPEC §7「离线用缓存」)。
    #[test]
    fn channel_config_untouched_when_offline() {
        let (sk, pk) = test_keypair();
        let mut server = FakeServer::ok(sk, valid_body_with_channel());
        server.network_error = true;
        let cfg = config(&pk, true);
        let p = MemPoint::new(Some(NOW_MS - 1000));
        let out = run(
            &cfg,
            &server,
            NOW_MS,
            &[&p],
            LicenseOp::Status,
            Some(&snapshot_active()),
        );
        assert!(out.channel_config.is_none(), "离线不该动渠道缓存");
    }

    // 缓存文件往返 + schema 版本不匹配丢弃(向前兼容零迁移)。
    #[test]
    fn channel_links_file_roundtrip_and_version_mismatch() {
        let dir = std::env::temp_dir().join(format!(
            "creatoros-channel-links-test-{}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let path = channel_links_file_path(&dir);

        // 具体配置往返([T-530] 含品牌名)。
        let cfg = ChannelConfig {
            purchase_url: Some("https://agent.example.com/buy".to_string()),
            support_url: None,
            download_url: Some("https://agent.example.com/dl".to_string()),
            brand_name: Some("星辰传媒".to_string()),
        };
        write_channel_links_file(&path, &Some(cfg.clone()));
        assert_eq!(read_channel_links_file(&path), Some(cfg));

        // 显式 null 覆写 → 读回 None(中性降级,不残留旧链接)。
        write_channel_links_file(&path, &None);
        assert_eq!(read_channel_links_file(&path), None);

        // schema 版本不匹配 → 丢弃。
        std::fs::write(
            &path,
            r#"{"version":99,"channel":{"purchaseUrl":"https://x.example.com"}}"#,
        )
        .unwrap();
        assert_eq!(read_channel_links_file(&path), None, "版本不匹配应丢弃");

        // 坏 JSON → 丢弃(不 panic)。
        std::fs::write(&path, "not-json").unwrap();
        assert_eq!(read_channel_links_file(&path), None);

        // [T-530] 老文件(version=1,无 brandName 键)→ 照常读回,brand_name=None。
        // schema 版本保持 1 不升:加字段向后兼容,老缓存不触发丢弃。
        std::fs::write(
            &path,
            r#"{"version":1,"channel":{"purchaseUrl":"https://old.example.com/buy","supportUrl":null,"downloadUrl":null}}"#,
        )
        .unwrap();
        let old = read_channel_links_file(&path).expect("老 schema-1 文件必须仍可读");
        assert_eq!(
            old.purchase_url.as_deref(),
            Some("https://old.example.com/buy")
        );
        assert_eq!(old.brand_name, None, "无 brandName 键 = 未配置");
        let _ = std::fs::remove_dir_all(&dir);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // [T-530] 渠道品牌名(轻贴牌)测锚
    // ─────────────────────────────────────────────────────────────────────────

    // 合法签名响应携带 brandName → 随 channelConfig 一起采纳(签名域内,同源同信)。
    #[test]
    fn brand_name_adopted_on_valid_signed_response() {
        let (sk, pk) = test_keypair();
        let mut body = valid_body();
        body["channelConfig"] = serde_json::json!({
            "purchaseUrl": "https://agent.example.com/buy",
            "brandName": "星辰传媒",
        });
        let server = FakeServer::ok(sk, body);
        let cfg = config(&pk, true);
        let p = MemPoint::new(None);
        let out = run(
            &cfg,
            &server,
            NOW_MS,
            &[&p],
            LicenseOp::Status,
            Some(&snapshot_active()),
        );
        assert!(out.decision.licensed);
        let ch = out.channel_config.expect("有字段").expect("有对象");
        assert_eq!(ch.brand_name.as_deref(), Some("星辰传媒"));
        assert_eq!(
            ch.purchase_url.as_deref(),
            Some("https://agent.example.com/buy")
        );
    }

    // snake_case `brand_name` 双取兼容(沿 parse_channel_config 既有宽容策略)。
    #[test]
    fn brand_name_snake_case_key_accepted() {
        let ch = parse_channel_config(&serde_json::json!({ "brand_name": "渠道A" }));
        assert_eq!(ch.brand_name.as_deref(), Some("渠道A"));
    }

    // 清洗规则:trim + 去控制字符;空白/空串/非字符串/显式 null → None(= 未配置)。
    #[test]
    fn brand_name_sanitized_or_dropped() {
        // trim + 控制字符剔除。
        let ch = parse_channel_config(
            &serde_json::json!({ "brandName": "  星辰\u{0007}传媒\u{001b} " }),
        );
        assert_eq!(ch.brand_name.as_deref(), Some("星辰传媒"));
        // 纯空白 → None。
        let ch = parse_channel_config(&serde_json::json!({ "brandName": "   " }));
        assert_eq!(ch.brand_name, None);
        // 显式 null → None。
        let ch = parse_channel_config(&serde_json::json!({ "brandName": null }));
        assert_eq!(ch.brand_name, None);
        // 非字符串脏值 → None(不臆造)。
        let ch = parse_channel_config(&serde_json::json!({ "brandName": 42 }));
        assert_eq!(ch.brand_name, None);
        // 键缺失 → None。
        let ch = parse_channel_config(&serde_json::json!({}));
        assert_eq!(ch.brand_name, None);
    }

    // 长度上限 30 个 Unicode 字符:31 字符整体弃用置 None(不截断);30 字符收下。
    #[test]
    fn brand_name_over_30_chars_dropped_entirely() {
        let thirty: String = "星".repeat(30);
        let ch = parse_channel_config(&serde_json::json!({ "brandName": thirty.clone() }));
        assert_eq!(
            ch.brand_name.as_deref(),
            Some(thirty.as_str()),
            "30 字符恰好合法"
        );
        let thirty_one: String = "星".repeat(31);
        let ch = parse_channel_config(&serde_json::json!({ "brandName": thirty_one }));
        assert_eq!(ch.brand_name, None, "超 30 字符整体弃用,不截断");
    }

    // channelConfig 显式 null → 覆写中性态,品牌名随之清空(落盘读回 None)。
    #[test]
    fn brand_name_cleared_on_explicit_null_channel() {
        let dir =
            std::env::temp_dir().join(format!("creatoros-brand-name-test-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let path = channel_links_file_path(&dir);
        write_channel_links_file(
            &path,
            &Some(ChannelConfig {
                brand_name: Some("星辰传媒".to_string()),
                ..ChannelConfig::default()
            }),
        );
        assert_eq!(
            read_channel_links_file(&path)
                .and_then(|c| c.brand_name)
                .as_deref(),
            Some("星辰传媒")
        );
        // 服务端显式 null(Some(None) 覆写指令)→ 品牌名不残留。
        write_channel_links_file(&path, &None);
        assert_eq!(
            read_channel_links_file(&path),
            None,
            "显式清空后品牌名不得残留"
        );
        let _ = std::fs::remove_dir_all(&dir);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // [T-396c] 版本检查(SPEC §6/§8-4 测锚)
    // ─────────────────────────────────────────────────────────────────────────

    fn latest_body(latest: &str, download: Option<&str>) -> serde_json::Value {
        serde_json::json!({
            "success": true,
            "latestVersion": latest,
            "releaseNotes": "修复若干问题",
            "downloadUrl": download,
            "serverTime": "2026-07-17T12:00:00Z",
        })
    }

    #[test]
    fn version_newer_semantics() {
        assert!(version_newer("0.2.0", "0.1.0"));
        assert!(version_newer("v1.0.0", "0.9.9"));
        assert!(version_newer("0.1.10", "0.1.9"), "10 > 9 数字比较非字典序");
        assert!(!version_newer("0.1.0", "0.1.0"));
        assert!(!version_newer("0.0.9", "0.1.0"));
        assert!(version_newer("0.2", "0.1.5"), "缺位按 0 补齐");
        assert!(!version_newer("garbage", "0.1.0"), "脏值不臆造新版");
    }

    // 签名合法 + 新版可用 → update_available + 渠道 downloadUrl。
    #[test]
    fn latest_version_signed_update_available() {
        let (sk, pk) = test_keypair();
        let server = FakeServer::ok(
            sk,
            latest_body("0.2.0", Some("https://agent.example.com/dl")),
        );
        let cfg = config(&pk, true);
        let info = fetch_latest_version(
            &cfg,
            &server,
            &FixedClock(NOW_MS),
            "0.1.0",
            Some(&snapshot_active()),
        )
        .expect("应成功");
        assert!(info.update_available);
        assert_eq!(info.latest_version.as_deref(), Some("0.2.0"));
        assert_eq!(
            info.download_url.as_deref(),
            Some("https://agent.example.com/dl")
        );
        // 请求应携带快照里的激活码(渠道按码解析)。
        let req = server.last_request.borrow().clone().unwrap();
        assert_eq!(req["code"].as_str(), Some("CODE-1"));
    }

    // downloadUrl=null(未配渠道)→ 原样透传 null,**不回退任何官方链接**(红线)。
    #[test]
    fn latest_version_null_download_url_stays_null() {
        let (sk, pk) = test_keypair();
        let server = FakeServer::ok(sk, latest_body("0.2.0", None));
        let cfg = config(&pk, true);
        let info = fetch_latest_version(
            &cfg,
            &server,
            &FixedClock(NOW_MS),
            "0.1.0",
            Some(&snapshot_active()),
        )
        .expect("应成功");
        assert!(info.update_available);
        assert!(info.download_url.is_none());
    }

    // 已是最新 → update_available=false。
    #[test]
    fn latest_version_up_to_date() {
        let (sk, pk) = test_keypair();
        let server = FakeServer::ok(
            sk,
            latest_body("0.1.0", Some("https://agent.example.com/dl")),
        );
        let cfg = config(&pk, true);
        let info = fetch_latest_version(
            &cfg,
            &server,
            &FixedClock(NOW_MS),
            "0.1.0",
            Some(&snapshot_active()),
        )
        .expect("应成功");
        assert!(!info.update_available);
    }

    // [SPEC §8-4 测锚] revoked 内测码 → 不提示更新(甚至不打网络)。
    #[test]
    fn latest_version_revoked_trial_no_prompt() {
        let (sk, pk) = test_keypair();
        let server = FakeServer::ok(
            sk,
            latest_body("9.9.9", Some("https://agent.example.com/dl")),
        );
        let cfg = config(&pk, true);
        let snap = LicenseSnapshot {
            revoked: true,
            allowed: false,
            ..snapshot_active()
        };
        let info = fetch_latest_version(&cfg, &server, &FixedClock(NOW_MS), "0.1.0", Some(&snap))
            .expect("应成功(静默无更新)");
        assert!(!info.update_available);
        assert!(info.latest_version.is_none());
        assert_eq!(server.calls.get(), 0, "授权失效不该打更新网络请求");
    }

    // 买断撤销(updatesBlocked)→ 同样不提示(停更新语义双保险)。
    #[test]
    fn latest_version_updates_blocked_no_prompt() {
        let (sk, pk) = test_keypair();
        let server = FakeServer::ok(sk, latest_body("9.9.9", None));
        let cfg = config(&pk, true);
        let snap = LicenseSnapshot {
            updates_blocked: true,
            revoked: true,
            ..snapshot_perpetual()
        };
        let info = fetch_latest_version(&cfg, &server, &FixedClock(NOW_MS), "0.1.0", Some(&snap))
            .expect("应成功(静默无更新)");
        assert!(!info.update_available);
        assert_eq!(server.calls.get(), 0);
    }

    // [T-412 测锚] 网络不可达 → 人话文案,不甩技术报错。
    #[test]
    fn latest_version_network_error_human_message() {
        let (sk, pk) = test_keypair();
        let mut server = FakeServer::ok(sk, latest_body("0.2.0", None));
        server.network_error = true;
        let cfg = config(&pk, true);
        let err = fetch_latest_version(
            &cfg,
            &server,
            &FixedClock(NOW_MS),
            "0.1.0",
            Some(&snapshot_active()),
        )
        .expect_err("应失败");
        assert!(err.contains("无法连接更新服务"), "应为人话文案,实际: {err}");
        assert!(!err.contains("connect refused"), "技术原因只进日志不进 UI");
    }

    // 坏签名 → 人话拒绝(强验签下 latest-version 同链纪律)。
    #[test]
    fn latest_version_bad_signature_rejected() {
        let (sk, pk) = test_keypair();
        let mut server = FakeServer::ok(sk, latest_body("0.2.0", Some("https://x.example.com")));
        server.tamper_body_after_sign = true;
        let cfg = config(&pk, true);
        let err = fetch_latest_version(
            &cfg,
            &server,
            &FixedClock(NOW_MS),
            "0.1.0",
            Some(&snapshot_active()),
        )
        .expect_err("坏签名应拒绝");
        assert!(err.contains("请稍后重试"), "应为人话文案,实际: {err}");
    }

    // 未激活(无快照)→ code=null 照发(服务端只回版本号;不泄默认渠道)。
    #[test]
    fn latest_version_without_snapshot_sends_null_code() {
        let (sk, pk) = test_keypair();
        let server = FakeServer::ok(sk, latest_body("0.2.0", None));
        let cfg = config(&pk, true);
        let info = fetch_latest_version(&cfg, &server, &FixedClock(NOW_MS), "0.1.0", None)
            .expect("应成功");
        assert!(info.update_available);
        assert!(info.download_url.is_none());
        let req = server.last_request.borrow().clone().unwrap();
        assert!(req["code"].is_null(), "未激活应发 code=null");
    }

    // 非 https downloadUrl 被滤掉(与渠道链接同白名单)。
    #[test]
    fn latest_version_non_https_download_dropped() {
        let (sk, pk) = test_keypair();
        let server = FakeServer::ok(sk, latest_body("0.2.0", Some("http://evil.example.com/dl")));
        let cfg = config(&pk, true);
        let info = fetch_latest_version(
            &cfg,
            &server,
            &FixedClock(NOW_MS),
            "0.1.0",
            Some(&snapshot_active()),
        )
        .expect("应成功");
        assert!(info.download_url.is_none());
    }

    #[test]
    fn t575_client_config_refresh_is_bound_to_local_sidecar_and_startup() {
        assert_eq!(
            client_config_refresh_url(43127),
            "http://127.0.0.1:43127/api/v1/local/client-config"
        );
        let source = include_str!("license.rs");
        let startup = source
            .split("pub fn startup_license_task")
            .nth(1)
            .expect("startup license task")
            .split("pub fn gen_handshake_token")
            .next()
            .expect("startup task body");
        assert!(
            startup.contains("refresh_client_config_sidecar(&ctx);"),
            "sidecar ready 后必须自动刷新产品配置"
        );
        assert!(
            startup.contains("spawn_client_config_refresh_loop(ctx.clone());"),
            "长时间运行必须启动独立的定时配置刷新"
        );
        let interval = client_config_refresh_interval_secs(43127);
        assert!(
            (21_600..=22_500).contains(&interval),
            "刷新间隔应为 6 小时并带最多 15 分钟稳定抖动"
        );
    }
}
