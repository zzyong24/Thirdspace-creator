//! T-1273 第4项准备候选：release-only 编译期 XOR，debug 明文直取。
//! 不负责授权决策。所有值与真实协议逐字节一致；缓存仅在首次访问还原固定缓冲区，不进行 heap 分配。
#[cfg(not(debug_assertions))]
use std::sync::OnceLock;
include!(concat!(env!("OUT_DIR"), "/secure-strings.generated.rs"));
pub mod ids {
    pub const LICENSE_BASE_URL: usize = 0;
    pub const GROWTH_BASE_URL: usize = 1;
    pub const PROMPT_BUNDLE_URL: usize = 2;
    pub const PROMPT_BUNDLE_PUBKEY: usize = 3;
    pub const GROWTH_CONFIG_PUBKEY_B64: usize = 4;
    pub const GROWTH_CONFIG_KEY_ID: usize = 5;
    pub const LICENSE_ACTIVATE_PATH: usize = 6;
    pub const LICENSE_STATUS_PATH: usize = 7;
    pub const ENTITLEMENT_SESSIONS_PATH: usize = 8;
    pub const ENTITLEMENT_POLL_PATH: usize = 9;
    pub const APP_VERSION_PATH: usize = 10;
    pub const CHANNEL_RUNTIME_V1: usize = 11;
    pub const CHANNEL_RUNTIME_V2: usize = 12;
    pub const UPDATE_TRUST_ROOT_KEY_ID: usize = 13;
    pub const CREATOROS_HANDSHAKE_HEADER: usize = 14;
    pub const CREATOROS_DESKTOP_ENV: usize = 15;
    pub const CREATOROS_HANDSHAKE_REQUIRED: usize = 16;
    pub const CREATOROS_ENTITLEMENT_CLAIM_ENABLED: usize = 17;
    pub const CREATOROS_PRODUCT_FEEDBACK_SUBMIT_ENABLED: usize = 18;
    pub const NOMIFUN_CHROME_BINARY_ENV: usize = 19;
}
#[cfg(not(debug_assertions))]
static CACHE: [OnceLock<[u8; MAX_LEN]>; 20] = [const { OnceLock::new() }; 20];

#[cfg(debug_assertions)]
pub fn s(id: usize) -> &'static str { PLAINTEXT[id] }

#[cfg(not(debug_assertions))]
pub fn s(id: usize) -> &'static str {
    let bytes = CACHE[id].get_or_init(|| decode(id));
    // SAFETY: 构建助手只接受 &str 并逐字节 XOR，生成长度来自同一 UTF8 字节序列。
    // decode 用同一 KEY 逐字节逆 XOR，不修改/截断字节；OnceLock 发布后不可变。
    // 编译期来源是合法 UTF8，因此正好 LENGTHS[id] 字节合法；构建测试逐项验证。
    // 该不变量只用于私有内置生成表，不能接受运行时输入或未审查的自带密文。
    unsafe { std::str::from_utf8_unchecked(&bytes[..LENGTHS[id]]) }
}

#[cfg(not(debug_assertions))]
#[inline(never)]
fn decode(id: usize) -> [u8; MAX_LEN] {
    // black_box 防止 fat LTO 把还原结果折叠成静态明文。
    let key = std::hint::black_box(&KEY);
    let encoded = std::hint::black_box(ENCODED[id]);
    let mut decoded = [0; MAX_LEN];
    for (index, byte) in encoded.iter().enumerate() {
        decoded[index] = byte ^ key[index % key.len()];
    }
    decoded
}

pub fn license_host() -> &'static str {
    s(ids::LICENSE_BASE_URL).strip_prefix("https://")
        .expect("内置授权地址必须是 HTTPS origin")
}

// 派生值缓存也固定数组，不引入首次 heap 分配。
#[cfg(not(debug_assertions))]
static ACTIVATE_TARGET: OnceLock<[u8; MAX_LEN + 12]> = OnceLock::new();
#[cfg(not(debug_assertions))]
static STATUS_TARGET: OnceLock<[u8; MAX_LEN + 12]> = OnceLock::new();
#[cfg(not(debug_assertions))]
static FEEDBACK_PUBLIC_ENV: OnceLock<[u8; MAX_LEN + 12]> = OnceLock::new();

#[cfg(not(debug_assertions))]
fn prefixed(cache: &'static OnceLock<[u8; MAX_LEN + 12]>, prefix: &str, id: usize) -> &'static str {
    let value = s(id);
    let length = prefix.len() + value.len();
    let bytes = cache.get_or_init(|| {
        let mut bytes = [0; MAX_LEN + 12];
        bytes[..prefix.len()].copy_from_slice(prefix.as_bytes());
        bytes[prefix.len()..length].copy_from_slice(value.as_bytes());
        bytes
    });
    // SAFETY: 私有调用者对每个缓存固定同一合法UTF8 prefix/id；仅连接两个完整 &str。
    // 不允许共享缓存给不同 prefix/id；12B 容量覆盖 NEXT_PUBLIC_，post前缀是5B。
    unsafe { std::str::from_utf8_unchecked(&bytes[..length]) }
}

pub fn license_activate_target() -> &'static str {
    #[cfg(debug_assertions)] { "post /api/license/activate" }
    #[cfg(not(debug_assertions))] { prefixed(&ACTIVATE_TARGET, "post ", ids::LICENSE_ACTIVATE_PATH) }
}
pub fn license_status_target() -> &'static str {
    #[cfg(debug_assertions)] { "post /api/license/status" }
    #[cfg(not(debug_assertions))] { prefixed(&STATUS_TARGET, "post ", ids::LICENSE_STATUS_PATH) }
}
pub fn product_feedback_public_env() -> &'static str {
    #[cfg(debug_assertions)] { "NEXT_PUBLIC_CREATOROS_PRODUCT_FEEDBACK_SUBMIT_ENABLED" }
    #[cfg(not(debug_assertions))] { prefixed(&FEEDBACK_PUBLIC_ENV, "NEXT_PUBLIC_", ids::CREATOROS_PRODUCT_FEEDBACK_SUBMIT_ENABLED) }
}
