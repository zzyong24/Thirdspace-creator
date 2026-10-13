#[path = "../src/release_integrity.rs"]
mod release_integrity;
#[cfg(test)]
mod tests {
    use super::release_integrity::*;
    use ed25519_dalek::{Signer,SigningKey};
    use std::{fs, sync::atomic::AtomicBool};
    const ID: &str = "creatoros-update-root-20260805-01";
    fn fixture() -> (SigningKey,[u8;104],[u8;32]) {
        let key = SigningKey::from_bytes(&[91;32]); // 只用于测试，不进入发布信任配置。
        let digest = *blake3::hash(b"packaged-runtime").as_bytes();
        let mut envelope = [0;104]; envelope[..8].copy_from_slice(MAGIC); envelope[8..40].copy_from_slice(&digest);
        let mut message = [0;128];
        envelope[40..].copy_from_slice(&key.sign(signed_message(&digest,ID,&mut message).unwrap()).to_bytes());
        (key,envelope,digest)
    }
    fn temp(name:&str)->std::path::PathBuf { std::env::temp_dir().join(format!("creatoros-t1273-rust-{name}-{}",std::process::id())) }
    #[test] fn signed_domain_is_exact_and_root_bound() {
        let mut buffer=[0;128]; let digest=[3;32];
        let actual=signed_message(&digest,ID,&mut buffer).unwrap();
        let expected=[DOMAIN,ID.as_bytes(),b"\0",&digest].concat();
        assert_eq!(actual,expected);
    }
    #[test] fn envelope_accepts_only_this_build_and_root_domain() {
        let (key,envelope,digest)=fixture(); let root=key.verifying_key().to_bytes();
        verify_envelope(&envelope,&digest,&root,ID).unwrap();
        assert!(verify_envelope(&envelope,&digest,&root,"other-root").is_err());
        assert!(verify_envelope(&envelope,&[9;32],&root,ID).is_err());
        let wrong=SigningKey::from_bytes(&[22;32]).verifying_key().to_bytes();
        assert!(verify_envelope(&envelope,&digest,&wrong,ID).is_err());
    }
    #[test] fn truncated_extended_magic_and_signature_mutations_rejected() {
        let (key,mut bytes,digest)=fixture(); let root=key.verifying_key().to_bytes();
        for n in [0,7,40,103] { assert!(verify_envelope(&bytes[..n],&digest,&root,ID).is_err()); }
        let extra=[&bytes[..],&[0][..]].concat(); assert!(verify_envelope(&extra,&digest,&root,ID).is_err());
        bytes[0]^=1; assert!(verify_envelope(&bytes,&digest,&root,ID).is_err()); bytes[0]^=1;
        bytes[72]^=1; assert!(verify_envelope(&bytes,&digest,&root,ID).is_err());
    }
    #[test] fn resource_file_rejects_missing_short_and_tail() {
        let (key,bytes,digest)=fixture(); let root=key.verifying_key().to_bytes(); let path=temp("sig"); let _=fs::remove_file(&path);
        assert!(verify_signature_file(&path,&digest,&root,ID).is_err());
        fs::write(&path,&bytes).unwrap(); verify_signature_file(&path,&digest,&root,ID).unwrap();
        fs::write(&path,&bytes[..103]).unwrap(); assert!(verify_signature_file(&path,&digest,&root,ID).is_err());
        fs::write(&path,[&bytes[..],&[0][..]].concat()).unwrap(); assert!(verify_signature_file(&path,&digest,&root,ID).is_err()); fs::remove_file(path).unwrap();
    }
    #[test] fn tarball_changed_byte_rejected_and_cancel_is_not_pass() {
        let path=temp("hash"); fs::write(&path,b"packaged-runtime").unwrap(); let digest=*blake3::hash(b"packaged-runtime").as_bytes();
        assert_eq!(verify_tarball(&path,&digest,&AtomicBool::new(false)).unwrap(),true);
        fs::write(&path,b"Packaged-runtime").unwrap(); assert!(verify_tarball(&path,&digest,&AtomicBool::new(false)).is_err());
        assert_eq!(verify_tarball(&path,&digest,&AtomicBool::new(true)).unwrap(),false); fs::remove_file(path).unwrap();
    }
    #[test] fn first_extraction_retains_verified_fd_and_rewinds() {
        use std::io::Read;
        let path=temp("fd"); fs::write(&path,b"packaged-runtime").unwrap(); let digest=*blake3::hash(b"packaged-runtime").as_bytes();
        let mut file=fs::File::open(&path).unwrap(); verify_extraction_file(&mut file,&digest).unwrap();
        fs::remove_file(&path).unwrap(); fs::write(&path,b"replaced").unwrap();
        let mut bytes=Vec::new(); file.read_to_end(&mut bytes).unwrap(); assert_eq!(bytes,b"packaged-runtime");
        let mut replaced=fs::File::open(&path).unwrap(); assert!(verify_extraction_file(&mut replaced,&digest).is_err()); fs::remove_file(path).unwrap();
    }
    #[test] fn page_load_claim_is_once_and_exit_cancels() {
        let state=BackgroundCheck::new(); assert!(state.claim()); assert!(!state.claim()); state.cancel(); assert!(!state.claim());
        let exit_before_page=BackgroundCheck::new(); exit_before_page.cancel(); assert!(!exit_before_page.claim());
    }
}
