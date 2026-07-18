//! T-391 H-log 开发者日志密钥对生成器(不进分发包)。
//!
//! 生成一对 X25519 密钥:
//!   · **公钥**(base64,32B)打印到 stdout —— 填进 `logging.rs` 的 `DEV_LOG_PUBKEYS_B64`(内嵌 app)。
//!   · **私钥**(base64,32B)写入文件(默认 `./creatoros-log-privkey.key`,chmod 600)——
//!     开发者**冷备**(密码管理器 / 离线),**从不进 app**。私钥丢 = 对应日志永久不可解(设计使然,无找回后门)。
//!
//! 用法:
//!   creatoros-logkeygen [--out <私钥文件>]
//!
//! 之后用 `creatoros-logdec --key <私钥文件> sidecar.log.enc` 解密日志。

use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine;
use rand::rngs::OsRng;
use sha2::{Digest, Sha256};
use x25519_dalek::{PublicKey, StaticSecret};

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let mut out_path = "creatoros-log-privkey.key".to_string();
    let mut i = 1;
    while i < args.len() {
        if (args[i] == "--out" || args[i] == "-o") && i + 1 < args.len() {
            out_path = args[i + 1].clone();
            i += 2;
        } else {
            eprintln!("未知参数: {}", args[i]);
            eprintln!("用法: creatoros-logkeygen [--out <私钥文件>]");
            std::process::exit(2);
        }
    }

    let secret = StaticSecret::random_from_rng(OsRng);
    let priv_bytes = secret.to_bytes();
    let pub_bytes = PublicKey::from(&secret).to_bytes();

    let pub_b64 = B64.encode(pub_bytes);
    let priv_b64 = B64.encode(priv_bytes);
    let digest = Sha256::digest(pub_bytes);
    let key_id_hex = format!(
        "{:02x}{:02x}{:02x}{:02x}",
        digest[0], digest[1], digest[2], digest[3]
    );

    if let Err(e) = write_private_key(&out_path, &priv_b64) {
        eprintln!("[creatoros-logkeygen] 写私钥文件失败 {out_path}: {e}");
        std::process::exit(1);
    }

    println!("# CreatorOS 加密日志密钥对已生成");
    println!("#");
    println!("# 1) 把下面这行公钥填进 frontend/src-tauri/src/logging.rs 的 DEV_LOG_PUBKEYS_B64:");
    println!("公钥(base64,内嵌 app): {pub_b64}");
    println!("key_id(hex): {key_id_hex}");
    println!("#");
    println!("# 2) 私钥已写入(请冷备,从不进 app;丢失=对应日志永久不可解):");
    println!("私钥文件: {out_path}");
    println!("#");
    println!("# 解密日志:creatoros-logdec --key {out_path} <sidecar.log.enc>");
}

/// 写私钥文件;POSIX 上设 0600 权限(仅属主可读写)。
fn write_private_key(path: &str, priv_b64: &str) -> std::io::Result<()> {
    std::fs::write(path, format!("{priv_b64}\n"))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let perms = std::fs::Permissions::from_mode(0o600);
        std::fs::set_permissions(path, perms)?;
    }
    Ok(())
}
