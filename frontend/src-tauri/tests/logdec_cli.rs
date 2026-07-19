//! T-391 H-log `creatoros-logdec` CLI 集成测试(SPEC §12:往返 + 尾部截断容错)。
//!
//! 驱动真实编译出的 bin(`CARGO_BIN_EXE_creatoros-logdec`),经其 `encrypt` 子命令造夹具、
//! 再解密验往返;并验尾部截断退出码 0 输出前缀、私钥错退出码 1 零字节。
//! `logging` 模块在 lib 里是私有 mod,集成测试(独立 crate)够不到,故必须走 CLI 黑盒。

// [T-427] 与 Cargo.toml 的 creatoros-logdec [[bin]] 同门控:该 bin 仅在 logtools feature 下编译,
//   而本测试用 env!(CARGO_BIN_EXE_creatoros-logdec) 引用它 → 本文件须同门控,否则默认 `cargo test`
//   编译此文件时 CARGO_BIN_EXE 宏找不到 bin 而报错。跑法:`cargo test --features logtools`。
#![cfg(feature = "logtools")]

use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine;
use std::process::Command;
use x25519_dalek::{PublicKey, StaticSecret};

fn logdec_bin() -> &'static str {
    env!("CARGO_BIN_EXE_creatoros-logdec")
}

fn tmp(name: &str) -> std::path::PathBuf {
    use std::sync::atomic::{AtomicU64, Ordering};
    static C: AtomicU64 = AtomicU64::new(0);
    let n = C.fetch_add(1, Ordering::SeqCst);
    std::env::temp_dir().join(format!("crlogdec-it-{}-{}-{}", std::process::id(), n, name))
}

/// 生成一对 X25519 密钥,返回 (公钥 b64, 私钥文件路径)。
fn make_key() -> (String, std::path::PathBuf) {
    let secret = StaticSecret::random_from_rng(rand::rngs::OsRng);
    let pub_b64 = B64.encode(PublicKey::from(&secret).to_bytes());
    let priv_b64 = B64.encode(secret.to_bytes());
    let key_path = tmp("priv.key");
    std::fs::write(&key_path, priv_b64).unwrap();
    (pub_b64, key_path)
}

#[test]
fn cli_encrypt_decrypt_roundtrip() {
    let (pub_b64, key_path) = make_key();
    let plain = tmp("plain.txt");
    let enc = tmp("out.enc");
    std::fs::write(&plain, "alpha\nbravo\ncharlie\n").unwrap();

    let st = Command::new(logdec_bin())
        .args([
            "encrypt",
            "--pubkey",
            &pub_b64,
            plain.to_str().unwrap(),
            enc.to_str().unwrap(),
        ])
        .status()
        .unwrap();
    assert!(st.success(), "encrypt 应成功");

    let out = Command::new(logdec_bin())
        .args(["--key", key_path.to_str().unwrap(), enc.to_str().unwrap()])
        .output()
        .unwrap();
    assert!(out.status.success(), "decrypt 应成功");
    assert_eq!(String::from_utf8_lossy(&out.stdout), "alpha\nbravo\ncharlie\n");

    let _ = std::fs::remove_file(&plain);
    let _ = std::fs::remove_file(&enc);
    let _ = std::fs::remove_file(&key_path);
}

#[test]
fn cli_tail_truncation_exit_zero_with_prefix() {
    let (pub_b64, key_path) = make_key();
    let plain = tmp("plain2.txt");
    let enc = tmp("out2.enc");
    std::fs::write(&plain, "one\ntwo\nthree\nfour\n").unwrap();
    Command::new(logdec_bin())
        .args([
            "encrypt",
            "--pubkey",
            &pub_b64,
            plain.to_str().unwrap(),
            enc.to_str().unwrap(),
        ])
        .status()
        .unwrap();

    // 砍掉尾部 6 字节 → 最后一帧不完整。
    let mut bytes = std::fs::read(&enc).unwrap();
    let cut = bytes.len() - 6;
    bytes.truncate(cut);
    std::fs::write(&enc, &bytes).unwrap();

    let out = Command::new(logdec_bin())
        .args(["--key", key_path.to_str().unwrap(), enc.to_str().unwrap()])
        .output()
        .unwrap();
    assert!(out.status.success(), "尾部截断仍应退出码 0");
    let stdout = String::from_utf8_lossy(&out.stdout);
    assert!(stdout.starts_with("one\ntwo\nthree\n"), "应保留前缀行: {stdout:?}");
    assert!(!stdout.contains("four"), "被截断的行不应出现: {stdout:?}");

    let _ = std::fs::remove_file(&plain);
    let _ = std::fs::remove_file(&enc);
    let _ = std::fs::remove_file(&key_path);
}

#[test]
fn cli_wrong_key_zero_bytes_exit_one() {
    let (pub_b64, _key_path) = make_key();
    let (_pub2, wrong_key) = make_key(); // 不同密钥对
    let plain = tmp("plain3.txt");
    let enc = tmp("out3.enc");
    std::fs::write(&plain, "secret\n").unwrap();
    Command::new(logdec_bin())
        .args([
            "encrypt",
            "--pubkey",
            &pub_b64,
            plain.to_str().unwrap(),
            enc.to_str().unwrap(),
        ])
        .status()
        .unwrap();

    let out = Command::new(logdec_bin())
        .args(["--key", wrong_key.to_str().unwrap(), enc.to_str().unwrap()])
        .output()
        .unwrap();
    assert!(!out.status.success(), "私钥错误应退出码非 0");
    assert!(out.stdout.is_empty(), "私钥错误应 0 字节输出");

    let _ = std::fs::remove_file(&plain);
    let _ = std::fs::remove_file(&enc);
    let _ = std::fs::remove_file(&wrong_key);
}
