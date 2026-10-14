//! T-1273：共享构建/运行时的固定签名协议，不接受资源自带根或摘要。
//! SEMANTIC_BOUNDARY_ALLOW: 确定性安装包完整性与生命周期校验，不做创作选择。
use ed25519_dalek::{Signature, VerifyingKey};
use std::{io::{Read, Seek}, path::Path, sync::atomic::{AtomicBool, Ordering}};
pub const MAGIC: &[u8; 8] = b"COSB3v1\0";
pub const DOMAIN: &[u8] = b"CreatorOS/sidecar.tar.gz/BLAKE3/v1\0";
pub const ENVELOPE_LEN: usize = 104;

pub fn signed_message<'a>(digest: &[u8; 32], root_id: &str, buffer: &'a mut [u8; 128]) -> Result<&'a [u8], String> {
    let length = DOMAIN.len() + root_id.len() + 1 + 32;
    if root_id.is_empty() || root_id.contains('\0') || length > buffer.len() {
        return Err("安装资源信任根标识无效。".into());
    }
    buffer[..DOMAIN.len()].copy_from_slice(DOMAIN);
    buffer[DOMAIN.len()..DOMAIN.len() + root_id.len()].copy_from_slice(root_id.as_bytes());
    buffer[DOMAIN.len() + root_id.len()] = 0;
    buffer[length - 32..length].copy_from_slice(digest);
    Ok(&buffer[..length])
}

pub fn verify_envelope(bytes: &[u8], expected_digest: &[u8; 32], root: &[u8; 32], root_id: &str) -> Result<(), String> {
    if bytes.len() != ENVELOPE_LEN || &bytes[..8] != MAGIC {
        return Err("安装资源签名格式无效，请重新安装 CreatorOS。".into());
    }
    if &bytes[8..40] != expected_digest {
        return Err("安装资源签名不属于本构建，请重新安装 CreatorOS。".into());
    }
    let sig = Signature::from_slice(&bytes[40..]).map_err(|_| "安装资源签名无效。")?;
    let key = VerifyingKey::from_bytes(root).map_err(|_| "安装资源信任根无效。")?;
    let mut buffer = [0; 128];
    key.verify_strict(signed_message(expected_digest, root_id, &mut buffer)?, &sig)
        .map_err(|_| "安装资源签名校验失败，请重新安装 CreatorOS。".into())
}

pub fn verify_signature_file(path: &Path, expected_digest: &[u8; 32], root: &[u8; 32], root_id: &str) -> Result<(), String> {
    let mut file = std::fs::File::open(path).map_err(|e| format!("读取安装资源签名失败：{e}"))?;
    let mut bytes = [0; ENVELOPE_LEN];
    file.read_exact(&mut bytes).map_err(|e| format!("读取安装资源签名失败：{e}"))?;
    let mut extra = [0; 1];
    if file.read(&mut extra).map_err(|e| format!("读取安装资源签名失败：{e}"))? != 0 {
        return Err("安装资源签名格式无效，请重新安装 CreatorOS。".into());
    }
    verify_envelope(&bytes, expected_digest, root, root_id)
}

/// None 表示所属应用正在退出，不是假通过；每块前后检查，不增加轮询或任务期限。
pub fn hash_file(path: &Path, cancelled: &AtomicBool) -> Result<Option<[u8; 32]>, String> {
    if cancelled.load(Ordering::Acquire) { return Ok(None); }
    let mut file = std::fs::File::open(path).map_err(|e| format!("读取安装资源失败：{e}"))?;
    hash_open_file(&mut file, cancelled)
}

pub fn hash_open_file(file: &mut std::fs::File, cancelled: &AtomicBool) -> Result<Option<[u8; 32]>, String> {
    let mut hasher = blake3::Hasher::new();
    let mut buffer = vec![0; 1024 * 1024]; // Windows辅助线程默认栈小，沿既有heap缓冲。
    loop {
        if cancelled.load(Ordering::Acquire) { return Ok(None); }
        let count = file.read(&mut buffer).map_err(|e| format!("读取安装资源失败：{e}"))?;
        if count == 0 { break; }
        hasher.update(&buffer[..count]);
    }
    if cancelled.load(Ordering::Acquire) { return Ok(None); }
    Ok(Some(*hasher.finalize().as_bytes()))
}

pub fn verify_tarball(path: &Path, expected_digest: &[u8; 32], cancelled: &AtomicBool) -> Result<bool, String> {
    match hash_file(path, cancelled)? {
        None => Ok(false),
        Some(actual) if &actual == expected_digest => Ok(true),
        Some(_) => Err("安装资源完整性校验失败，请重新安装 CreatorOS。".into()),
    }
}

/// 首次展开时校验并回卷同一文件句柄，解包不重新按路径打开已核字节。
pub fn verify_extraction_file(file: &mut std::fs::File, expected_digest: &[u8; 32]) -> Result<(), String> {
    let actual = hash_open_file(file, &AtomicBool::new(false))?
        .ok_or_else(|| "安装资源校验意外取消。".to_string())?;
    if &actual != expected_digest {
        return Err("安装资源完整性校验失败，请重新安装 CreatorOS。".into());
    }
    file.rewind().map_err(|e| format!("安装资源回卷失败：{e}"))?;
    Ok(())
}

pub struct BackgroundCheck { started: AtomicBool, pub cancelled: AtomicBool }
impl BackgroundCheck {
    pub const fn new() -> Self { Self { started: AtomicBool::new(false), cancelled: AtomicBool::new(false) } }
    pub fn claim(&self) -> bool {
        !self.cancelled.load(Ordering::Acquire)
            && self.started.compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire).is_ok()
    }
    pub fn cancel(&self) { self.cancelled.store(true, Ordering::Release); }
}
