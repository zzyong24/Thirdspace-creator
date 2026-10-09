//! 仅测试编译：真实Http/consumer跨仓驱动，隔离密钥和胶囊不输出、不进Git。
use super::*;
use aes_gcm::{aead::{Aead, KeyInit}, Aes256Gcm, Nonce};
use std::path::{Path, PathBuf};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct DriverConfig { schema: String, public_key_b64: String }
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Capsule { machine_id: String, journal: Journal }
struct Vault { dir: PathBuf, key: [u8;32] }
impl Drop for Vault { fn drop(&mut self) { self.key.zeroize(); } }
fn private_write(path: &Path, bytes: &[u8]) -> Result<(), String> {
    use std::io::Write;
    let mut options = std::fs::OpenOptions::new();
    options.create(true).truncate(true).write(true);
    #[cfg(unix)] { use std::os::unix::fs::OpenOptionsExt; options.mode(0o600); }
    let mut f = options.open(path).map_err(|_| error("隔离测试文件无法写入"))?;
    f.write_all(bytes).map_err(|_| error("隔离测试文件写入失败"))?;
    f.sync_all().map_err(|_| error("隔离测试文件同步失败"))
}
impl Vault {
    fn open() -> Result<Self,String> {
        // 固定在当前工作树，driver输入不能指定用户数据目录。
        let dir = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../docs/verification/t1072/integration/private-native-lab");
        std::fs::create_dir_all(&dir).map_err(|_| error("隔离测试目录无法创建"))?;
        #[cfg(unix)] { use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&dir, std::fs::Permissions::from_mode(0o700))
                .map_err(|_| error("隔离测试目录权限无法保护"))?; }
        let key_file=dir.join("fixture-key.bin");
        let mut key=[0;32];
        if key_file.exists() {
            let raw=Zeroizing::new(std::fs::read(&key_file).map_err(|_|error("隔离测试密钥无法读取"))?);
            if raw.len()!=32 {return Err(error("隔离测试密钥长度无效"));}
            key.copy_from_slice(&raw);
        } else { rand::rngs::OsRng.fill_bytes(&mut key); private_write(&key_file,&key)?; }
        Ok(Self{dir,key})
    }
    fn write_capsule(&self, capsule:&Capsule)->Result<(),String> {
        let plain=Zeroizing::new(serde_json::to_vec(capsule).map_err(|_|error("隔离胶囊编码失败"))?);
        let mut nonce=[0;12];rand::rngs::OsRng.fill_bytes(&mut nonce);
        let cipher=Aes256Gcm::new_from_slice(&self.key).map_err(|_|error("隔离胶囊加密器无效"))?;
        let encrypted=cipher.encrypt(Nonce::from_slice(&nonce),plain.as_slice()).map_err(|_|error("隔离胶囊加密失败"))?;
        let mut bytes=nonce.to_vec();bytes.extend(encrypted);
        private_write(&self.dir.join("session.enc"),&bytes)
    }
    fn capsule(&self)->Result<Capsule,String> {
        let bytes=std::fs::read(self.dir.join("session.enc")).map_err(|_|error("隔离胶囊不存在，请先prepare"))?;
        if bytes.len()<28 || bytes.len() as u64>MAX_BODY {return Err(error("隔离胶囊长度无效"));}
        let cipher=Aes256Gcm::new_from_slice(&self.key).map_err(|_|error("隔离胶囊加密器无效"))?;
        let plain=Zeroizing::new(cipher.decrypt(Nonce::from_slice(&bytes[..12]),&bytes[12..]).map_err(|_|error("隔离胶囊解密失败"))?);
        serde_json::from_slice(&plain).map_err(|_|error("隔离胶囊解析失败"))
    }
}
impl JournalStore for Vault {
    fn load(&self)->Result<Option<Journal>,String> {
        if !self.dir.join("session.enc").exists(){return Ok(None);}
        Ok(Some(self.capsule()?.journal))
    }
    fn save(&self,j:&Journal)->Result<(),String> {
        let mut capsule=self.capsule()?;capsule.journal=j.clone();self.write_capsule(&capsule)
    }
    fn delete(&self)->Result<(),String> {
        match std::fs::remove_file(self.dir.join("session.enc")) {
            Ok(())=>Ok(()), Err(e) if e.kind()==std::io::ErrorKind::NotFound=>Ok(()),
            Err(_)=>Err(error("隔离胶囊未能删除"))
        }
    }
}
struct FileSnapshot<'a> { vault:&'a Vault }
impl SnapshotStore for FileSnapshot<'_> {
    fn read(&self)->Option<LicenseSnapshot> {
        license::read_snapshot_file(&self.vault.dir.join("license.enc"),Some(&self.vault.key))
    }
    fn write(&self,s:&LicenseSnapshot)->Result<(),String> {
        license::write_snapshot_file_checked(&self.vault.dir.join("license.enc"),s,Some(&self.vault.key))
    }
}
struct ConfirmedAckHttp;
impl Transport for ConfirmedAckHttp {
    fn post(&self,origin:&str,path:&str,body:&str,bearer:Option<&str>)->Result<Response,String> {
        let response=Transport::post(&Http,origin,path,body,bearer)?;
        // 正式consumer允许已过期意向清理；本驱动的ACK证据必须是实际200 acknowledged。
        if path==ACK && (response.signed.status!=200
            || parse::<Status>(&response.signed.body)?.status!="acknowledged") {
            return Err(error("真实HTTP未收到200 acknowledged，不能冒称ACK确认"));
        }
        Ok(response)
    }
}
fn run_live_driver()->Result<(),String> {
    if std::env::var("CREATOROS_OWNED_DEVICES_HTTP_LAB").as_deref()!=Ok("1") {
        return Err(error("必须显式启用隔离HTTP Lab"));
    }
    let input=std::env::var("CREATOROS_OWNED_DEVICES_HTTP_LAB_DRIVER")
        .map_err(|_|error("缺少driver配置路径"))?;
    let raw=std::fs::read(input).map_err(|_|error("driver配置无法读取"))?;
    let driver:DriverConfig=serde_json::from_slice(&raw).map_err(|_|error("driver配置无效"))?;
    if driver.schema!="creator-owned-devices-http-driver/v1" {return Err(error("driver配置版本无效"));}
    if crate::product_identity::built_in_project_key()!="creatoros"
        || crate::product_identity::product_ref()!="creatoros" {
        return Err(error("本驱动必须以CREATOROS_LICENSE_PROJECT_KEY=creatoros构建canonical身份，不能覆盖运行时产品"));
    }
    license::resolve_public_key(&driver.public_key_b64).map_err(|_|error("Lab公开验签钥匙无效"))?;
    let phase=std::env::var("CREATOROS_OWNED_DEVICES_HTTP_LAB_PHASE").unwrap_or_default();
    let vault=Vault::open()?;
    if phase=="prepare" {
        if vault.dir.join("session.enc").exists(){return Err(error("已有隔离意向，请consume，不得重复登记"));}
        // 与生产resolve_machine_id相同的32hex产物形状；种子仅本轮随机测试值，不读取硬件。
        let machine_id=format!("{:x}",Sha256::digest(random().as_bytes()))[..32].to_string();
        let verifier=Zeroizing::new(random());
        let challenge=base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));
        let body=Zeroizing::new(serde_json::json!({"intent":"register_device","client":"creatoros","projectKey":crate::product_identity::built_in_project_key(),"productRef":crate::product_identity::product_ref(),"machineId":machine_id,"deviceLabel":"Creator原生HTTP隔离电脑","codeChallenge":challenge,"codeChallengeMethod":"S256"}).to_string());
        let metadata:serde_json::Value=serde_json::from_str(&body).map_err(|_|error("测试请求编码失败"))?;
        let fields=metadata.as_object().ok_or_else(||error("测试请求结构失败"))?.iter().map(|(key,value)| {
            let s=value.as_str().unwrap_or("");
            serde_json::json!({"key":key,"type":if value.is_string(){"string"}else{"unexpected"},"bytes":s.len(),"chars":s.chars().count(),"ascii":s.is_ascii(),"machineFormat":key=="machineId"&&s.bytes().all(|b|b.is_ascii_alphanumeric()||b"._:-".contains(&b)),"challengeFormat":key=="codeChallenge"&&s.len()==43&&s.bytes().all(|b|b.is_ascii_alphanumeric()||b"_-".contains(&b))})
        }).collect::<Vec<_>>();
        println!("{}",serde_json::json!({"phase":"prepareRequestMetadata","identity":{"projectKey":crate::product_identity::built_in_project_key(),"productRef":crate::product_identity::product_ref()},"fields":fields,"secretExposure":false}));
        let response=Transport::post(&Http,GROWTH,CREATE,&body,None)?;
        if !matches!(response.signed.status,200|201){
            let failure:Failure=parse(&response.signed.body)?;
            let code=if failure.error.code.len()<=100 && failure.error.code.bytes().all(|b|b.is_ascii_uppercase()||b.is_ascii_digit()||b==b'_') {failure.error.code.as_str()} else {"UNCLASSIFIED"};
            return Err(format!("真实CREATE未创建隔离意向：HTTP {} {code}",response.signed.status));
        }
        let mut created:Created=parse(&response.signed.body)?;
        let user_code=user_code(&created.user_code).ok_or_else(||error("真实短码无效"))?;
        let url=verification_url(&created.verification_url,&user_code)?;
        let deadline=canonical_time(&created.expires_at).ok_or_else(||error("真实连接期限无效"))?;
        println!("{}",serde_json::json!({"phase":"createdResponseMetadata","registrationRef":created.registration_ref,"userCode":user_code,"expiresAt":created.expires_at,"remainingMs":deadline-now(),"referenceFormatValid":registration_reference(&created.registration_ref),"pollIntervalSeconds":created.poll_interval_seconds,"deviceSecretBytes":created.device_secret.len(),"secretExposure":false}));
        if !registration_reference(&created.registration_ref)||deadline<=now()||deadline-now()>600_000
            ||!(1..=60).contains(&created.poll_interval_seconds)||!(32..=256).contains(&created.device_secret.len()) {
            return Err(error("真实CREATE结果不满足原生约束"));
        }
        let cfg=LicenseConfig{base_url:ACTIVITY.into(),project_key:crate::product_identity::built_in_project_key().into(),strict_verify:true,public_key_b64:driver.public_key_b64,machine_id:machine_id.clone()};
        let mut j=Journal{integrity:String::new(),schema_version:1,intent:"register_device".into(),registration_ref:created.registration_ref.clone(),device_secret:std::mem::take(&mut created.device_secret),code_verifier:verifier.to_string(),activation_code:None,user_code:user_code.clone(),verification_url:url,expires_at:created.expires_at.clone(),retry_after_seconds:created.poll_interval_seconds,next_poll_at:now()+(created.poll_interval_seconds*1000)as i64,binding:binding(&cfg,&created.registration_ref),saved_snapshot_hash:None,committed:false};
        j.integrity=seal(&j);validate_journal(&j,&cfg)?;
        vault.write_capsule(&Capsule{machine_id,journal:j})?;
        println!("{}",serde_json::json!({"phase":"prepare","created":true,"registrationRef":created.registration_ref,"userCode":user_code,"expiresAt":created.expires_at,"secretExposure":false}));
        return Ok(());
    }
    if phase!="consume" {return Err(error("phase只允许prepare或consume"));}
    let (_, activity_origin)=http_client_and_origin(ACTIVITY)?;
    let untrusted_certificate_rejected=if activity_origin.starts_with("https://") {
        // 真实同一服务器：不加Lab CA的client必须拒绝证书，绝不使用不校验证书开关。
        let untrusted=reqwest::blocking::Client::builder().no_proxy()
            .timeout(Duration::from_secs(120)).redirect(reqwest::redirect::Policy::none())
            .build().map_err(|_|error("TLS负向client无法创建"))?;
        let failure=untrusted.get(format!("{activity_origin}/api/health")).send()
            .err().ok_or_else(||error("Lab证书被默认client信任，无法证明专属CA边界"))?;
        let mut current:Option<&(dyn std::error::Error+'static)>=Some(&failure);
        let mut issuer_rejected=false;
        while let Some(cause)=current {
            let text=cause.to_string().to_ascii_lowercase();
            issuer_rejected|=text.contains("unknownissuer")||text.contains("unknown issuer");
            current=cause.source();
        }
        if !issuer_rejected {return Err(error("TLS失败不是已确认的未知CA拒绝，不能冒称负向通过"));}
        true
    } else {false};
    if Transport::post(&Http,"https://example.com","/api/license/activate","{}",None).is_ok() {
        return Err(error("真实Http外来origin未被阻断"));
    }
    let capsule=vault.capsule()?;let mut j=capsule.journal;
    let cfg=LicenseConfig{base_url:ACTIVITY.into(),project_key:crate::product_identity::built_in_project_key().into(),strict_verify:true,public_key_b64:driver.public_key_b64,machine_id:capsule.machine_id};
    validate_journal(&j,&cfg)?;
    let store=FileSnapshot{vault:&vault};
    if let Some(saved)=store.read() {
        // 与正式resume相同：只回读同一journal记录的已验签结果，再续ACK；不重复激活。
        if !saved.allowed || !saved.signature_verified
            || j.saved_snapshot_hash.as_deref()!=Some(snapshot_hash(&saved).as_str()) {
            return Err(error("隔离输出与本次安全journal不一致，拒绝替换"));
        }
        j.committed=true;j.integrity=seal(&j);vault.save(&j)?;
        let flight=Flight::begin()?;
        if !ack(&j,&ConfirmedAckHttp,&vault,&flight)? || vault.load()?.is_some() {
            return Err(error("回读已保存授权后ACK仍未确认，胶囊保留待恢复"));
        }
        println!("{}",serde_json::json!({"phase":"consumeRecovery","savedSnapshotMatchedJournal":true,"originalActivatedAt":saved.activated_at,"originalExpiresAt":saved.expires_at,"acknowledged":true,"journalCleared":true,"secretExposure":false}));
        return Ok(());
    }
    if j.committed {return Err(error("journal称已保存但授权文件不存在，不能重新激活冒充恢复"));}
    let request=Zeroizing::new(serde_json::json!({"deviceSecret":j.device_secret,"codeVerifier":j.code_verifier}).to_string());
    let response=Transport::post(&Http,GROWTH,POLL,&request,None)?;
    if response.signed.status!=200 {check_response(&response)?;return Err(error("真实POLL尚未ready，请保留意向"));}
    let status:serde_json::Value=parse(&response.signed.body)?;
    if status.get("status").and_then(|v|v.as_str())!=Some("ready") {return Err(error("真实POLL尚未ready，请由本人在隔离网页批准"));}
    let ready:Ready=parse(&response.signed.body)?;
    let snapshot=candidate(&ready,&j,&cfg,&Http,&Http,&Clock)?;
    if snapshot.activated_at!=ready.activated_at||snapshot.expires_at!=ready.license_expires_at{return Err(error("原期限不一致"));}
    let wrong_cfg=LicenseConfig{base_url:cfg.base_url.clone(),project_key:cfg.project_key.clone(),strict_verify:true,machine_id:cfg.machine_id.clone(),public_key_b64:base64::engine::general_purpose::STANDARD.encode(ed25519_dalek::SigningKey::from_bytes(&[42;32]).verifying_key().as_bytes())};
    if candidate(&ready,&j,&wrong_cfg,&Http,&Http,&Clock).is_ok(){return Err(error("真实HTTP错误验签钥匙竟然通过"));}
    j.saved_snapshot_hash=Some(snapshot_hash(&snapshot));j.integrity=seal(&j);vault.save(&j)?;
    save_candidate(&store,&snapshot)?;
    if store.read().as_ref()!=Some(&snapshot){return Err(error("真实加密写盘回读不一致"));}
    let bytes=std::fs::read(vault.dir.join("license.enc")).map_err(|_|error("真实加密文件无法读取"))?;
    if String::from_utf8_lossy(&bytes).contains(&snapshot.code){return Err(error("真实授权文件泄漏明码"));}
    j.committed=true;j.integrity=seal(&j);vault.save(&j)?;
    let flight=Flight::begin()?;
    if !ack(&j,&ConfirmedAckHttp,&vault,&flight)?{return Err(error("真实ACK未确认，胶囊保留待恢复"));}
    if vault.load()?.is_some(){return Err(error("ACK后隔离胶囊尚未清除"));}
    println!("{}",serde_json::json!({"phase":"consume","ready":true,"signatureVerified":snapshot.signature_verified,"untrustedCertificateRejected":untrusted_certificate_rejected,"foreignOriginRejected":true,"wrongSigningKeyRejected":true,"originalActivatedAt":snapshot.activated_at,"originalExpiresAt":snapshot.expires_at,"encryptedSavedAndReadBack":true,"acknowledged":true,"journalCleared":true,"secretExposure":false}));
    Ok(())
}
#[test]
fn development_origins_reject_external_and_ambiguous_targets() {
    for raw in ["https://example.com:8849","https://127.0.0.1","file://localhost:8849","http://user@localhost:8872","http://localhost:8872/api","http://localhost:8872/?secret=1","http://localhost:8872/#fragment"] {
        assert!(loopback_origin(raw).is_err());
    }
    for raw in ["https://127.0.0.1:8849","http://localhost:8872","https://[::1]:8849"] {
        assert!(loopback_origin(raw).is_ok());
    }
}
#[test]
#[ignore = "仅新授权的隔离Growth/Activity对象，prepare后须人工owner批准；不访问OS凭据"]
fn live_loopback_owned_device_consumer() {
    if let Err(e)=run_live_driver(){panic!("隔离原生HTTP驱动未通过：{e}");}
}
