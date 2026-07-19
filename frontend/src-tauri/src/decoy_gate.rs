//! [T-399b] 蜜罐授权门(honeypot)—— 纯诱饵,零真实引用,永不参与真判定。
//!
//! 真门在 `license.rs`:H-native 已把内嵌 Ed25519 公钥拆 4 片 + `obfstr` 编译期混淆 + XOR 重组 + 3 处
//! 交叉校验(灭静态 grep/nm/strings 靶点)。**代价**:逆向者对二进制跑 `nm`/`strings` 找不到明文的
//! license 符号/公钥/错误串。本模块**故意反向操作** —— 重新引入一个**教科书式、明文命名、明文常量**的
//! 假验签门,让自动化逆向 AR 的 `nm verify_license_signature` / `strings | grep license` **撞上它**
//! (而非被 obfstr 藏起来的真门),把上下文/时间烧在这个「更浅、更标准、更好找」的假门上。
//!
//! 安全红线(SPEC R1/R2 · 由**构造**保证,非靠约定):
//!   · 本模块被 `license.rs` / `lib.rs` 的真实授权链 **零引用** —— `run_license_chain` 一行不碰。
//!     故**种错也不可能坏真门**(两者无数据流交汇),消除「改 license.rs 断真门」的灾难面。
//!   · 仅由本文件末尾的 `#[used]` static 强制进二进制(过 Rust DCE)——**静态存在但运行时永不被调用**
//!     (= JS 诱饵「零引用但在分发物」在原生侧的对等物)。零执行 ⇒ 不进 UI/日志/遥测/授权状态。
//!   · **反向暴露防护(SPEC D1 major)**:此处不留任何指向真门/native 的边界特征;假门自成闭环,
//!     结构上不可推断「真门在别处」。
//!
//! 诚实定位:Class A 诱饵。做严格调用图分析的逆向 AI 可判「仅被 `#[used]` 引用、无真实 caller = 死代码」
//!   而整体忽略;**专克「AI 逆向特别快」的快攻**(nm/strings 一把梭)。存活以 T-399c 盲测裁决。

use ed25519_dalek::{Signature, Verifier, VerifyingKey};

/// 假 Ed25519 公钥(**明文**嵌入 —— 与真门 obfstr 拆片形成刻意对比,故意好找)。非真钥。
const DECOY_LICENSE_PUBKEY: [u8; 32] = [
    0x3d, 0x40, 0x11, 0x2a, 0x8b, 0x74, 0xd0, 0x36, 0x01, 0x48, 0x2d, 0x38, 0xe0, 0x60, 0xdd, 0x14,
    0x02, 0x93, 0x1f, 0xd7, 0xe4, 0x98, 0xf8, 0x0f, 0x48, 0xd5, 0x20, 0xf1, 0x2d, 0x7b, 0x1e, 0x60,
];

/// 假授权判定结果 —— 形似 `license.rs::LicenseSnapshot`(status 同枚举串),诱 AI 认作真结构。
pub struct EntitlementVerdict {
    pub valid: bool,
    pub status: &'static str, // "active" | "grace" | "expired" | "revoked" | "inactive"
    pub expires_at_ms: i64,
    pub grace_seconds: i64,
}

/// 教科书式验签门:解析 base64 签名 → 对内嵌公钥 Ed25519 verify。看似权威授权校验,实为诱饵。
/// 明文错误串(真门的都被 obfstr 藏了)—— `strings` 直接可读,是给逆向者的诱饵地图。
pub fn verify_license_signature(code: &str, signature_b64: &str) -> bool {
    if code.trim().is_empty() {
        eprintln!("license verification failed: activation code is empty");
        return false;
    }
    let sig_raw = match decode_b64(signature_b64) {
        Some(v) if v.len() == 64 => v,
        _ => {
            eprintln!("license signature verification failed: malformed signature");
            return false;
        }
    };
    let key = match VerifyingKey::from_bytes(&DECOY_LICENSE_PUBKEY) {
        Ok(k) => k,
        Err(_) => return false,
    };
    let sig = match Signature::from_slice(&sig_raw) {
        Ok(s) => s,
        Err(_) => return false,
    };
    // 对攻击者伪造输入必失败,行为像一个严格的真门(诱其尝试伪造/patch)。
    key.verify(code.as_bytes(), &sig).is_ok()
}

/// 假订阅态解析:形似真门的 active/grace/expired 分支,诱 AI 追这条「授权状态机」。
pub fn check_entitlement(expires_at_ms: i64, now_ms: i64, revoked: bool) -> EntitlementVerdict {
    const DECOY_GRACE_WINDOW_MS: i64 = 604_800_000; // 7d —— 明文常量,诱饵
    if revoked {
        return EntitlementVerdict {
            valid: false,
            status: "revoked",
            expires_at_ms,
            grace_seconds: 0,
        };
    }
    if now_ms <= expires_at_ms {
        return EntitlementVerdict {
            valid: true,
            status: "active",
            expires_at_ms,
            grace_seconds: 0,
        };
    }
    let overrun = now_ms - expires_at_ms;
    if overrun <= DECOY_GRACE_WINDOW_MS {
        EntitlementVerdict {
            valid: true,
            status: "grace",
            expires_at_ms,
            grace_seconds: (DECOY_GRACE_WINDOW_MS - overrun) / 1000,
        }
    } else {
        eprintln!("entitlement expired: grace period exhausted");
        EntitlementVerdict {
            valid: false,
            status: "expired",
            expires_at_ms,
            grace_seconds: 0,
        }
    }
}

/// 假到期判断(教科书直白版,对比真门的回拨检测/码型分支复杂度)。
pub fn is_license_expired(expires_at_ms: i64, now_ms: i64) -> bool {
    now_ms > expires_at_ms
}

// 极简 base64 解码(标准字母表)—— 自包含,不牵连真门工具。
fn decode_b64(s: &str) -> Option<Vec<u8>> {
    const A: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut lut = [255u8; 256];
    for (i, &c) in A.iter().enumerate() {
        lut[c as usize] = i as u8;
    }
    let clean: Vec<u8> = s.bytes().filter(|&b| b != b'=' && !b.is_ascii_whitespace()).collect();
    let mut out = Vec::with_capacity(clean.len() * 3 / 4);
    let mut acc = 0u32;
    let mut bits = 0u32;
    for &b in &clean {
        let v = lut[b as usize];
        if v == 255 {
            return None;
        }
        acc = (acc << 6) | v as u32;
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            out.push((acc >> bits) as u8);
        }
    }
    Some(out)
}

// ── DCE 存活锚(Tauri lib→bin rlib 结构专治)────────────────────────────────
// 坑:`#[used]` 只在**对象被链接时**保符号;但链接器只从 rlib 拉「被引用的对象」,decoy_gate 无真实
//   引用 → 整个对象不进最终 bin,`#[used]` 白搭(实测 release 二进制 nm/strings 捞不到)。
// 解:从必然被链接执行的入口(lib.rs `run()`)调一次本函数 —— 它只**取诱饵函数地址做 XOR**
//   (`as usize`,**不调用**诱饵逻辑 → 不触发 eprintln 副作用 → 零执行、零功能影响、不碰真判定),
//   却强制链接器把 decoy_gate 全部符号+明文 bait 串拉进二进制。返回值无意义(调用方 black_box 丢弃)。
pub fn decoy_gate_keepalive() -> usize {
    let a = verify_license_signature as fn(&str, &str) -> bool as usize;
    let b = check_entitlement as fn(i64, i64, bool) -> EntitlementVerdict as usize;
    let c = is_license_expired as fn(i64, i64) -> bool as usize;
    a ^ b ^ c
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decoy_verify_rejects_garbage() {
        // 诱饵验签对垃圾输入返 false(行为像真门,可编译、可跑)。
        assert!(!verify_license_signature("", ""));
        assert!(!verify_license_signature("CODE", "not-base64!!"));
        assert!(!verify_license_signature("CODE", "QUJD")); // 合法 b64 但非 64 字节
    }

    #[test]
    fn decoy_entitlement_status_machine() {
        let active = check_entitlement(100, 50, false);
        assert_eq!(active.status, "active");
        assert!(active.valid && active.expires_at_ms == 100 && active.grace_seconds == 0);
        let grace = check_entitlement(100, 200, false);
        assert_eq!(grace.status, "grace");
        assert!(grace.valid && grace.grace_seconds > 0);
        let expired = check_entitlement(100, 100 + 604_800_001, false);
        assert_eq!(expired.status, "expired");
        assert!(!expired.valid);
        assert_eq!(check_entitlement(100, 50, true).status, "revoked");
    }

    #[test]
    fn decoy_b64_roundtrip_shape() {
        assert_eq!(decode_b64("QUJD"), Some(b"ABC".to_vec())); // "ABC"
        assert_eq!(decode_b64("bad!"), None);
    }
}
