//! [T-575] Growth device authorization → OS protected pending consume → AM signed license。
//!
//! 这个模块只把安全协议落到原生壳：任何 secret 都不会跨 Tauri IPC，也不会进入普通文件、
//! URL、剪贴板或日志。商业归属由 Growth 决定，授权事实仍只认 AM 签名响应。

use std::sync::{Mutex, OnceLock};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use base64::Engine as _;
use rand::RngCore as _;
use secrecy::{ExposeSecret as _, SecretString};
use serde::{Deserialize, Serialize};
use sha2::{Digest as _, Sha256};
use zeroize::{Zeroize as _, Zeroizing};

use crate::license::{
    derive_license_key, format_iso_ms, license_file_path, parse_iso_ms,
    parse_signed_channel_runtime, read_snapshot_file, refresh_client_config_sidecar_async,
    resolve_public_key, sync_mirror_to_sidecar, verify_response_signature,
    write_snapshot_file_checked, LicenseConfig, LicenseHttpResponse, LicenseSnapshot, LicenseState,
};

const CONTRACT_VERSION: &str = "growth-entitlement-delivery-v1";
const JOURNAL_VERSION: &str = "creator-pending-consume-v1";
const CONSUME_PATH: &str = "/api/license/entitlement-claims/consume";
const CREATE_PATH: &str = "/api/v2/entitlement-claim-sessions";
const POLL_PATH: &str = "/api/v2/entitlement-claim-sessions/poll";
const JOURNAL_SERVICE: &str = "com.creatoros.desktop.entitlement-consume";
const JOURNAL_ACCOUNT: &str = "pending-consume-v1";
const MAX_BODY_BYTES: usize = 65_536;
const MAX_DATE_SKEW_MS: i64 = 300_000;

#[derive(Clone)]
struct DeviceSession {
    device_secret: SecretString,
    code_verifier: SecretString,
    user_code: String,
    verification_url: String,
    expires_at: String,
    poll_interval_seconds: u64,
    next_poll_at_ms: i64,
}

impl Drop for DeviceSession {
    fn drop(&mut self) {
        self.user_code.zeroize();
        self.verification_url.zeroize();
        self.expires_at.zeroize();
    }
}

static SESSION: OnceLock<Mutex<Option<DeviceSession>>> = OnceLock::new();

fn session() -> &'static Mutex<Option<DeviceSession>> {
    SESSION.get_or_init(|| Mutex::new(None))
}

#[derive(Clone, Debug)]
struct CreateResponse {
    device_secret: String,
    user_code: String,
    verification_url: String,
    expires_at: String,
    poll_interval_seconds: u64,
}

impl CreateResponse {
    fn display_user_code(&self) -> String {
        self.user_code.clone()
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct CreateWire {
    device_secret: String,
    user_code: String,
    verification_url: String,
    expires_at: String,
    poll_interval_seconds: u64,
}

fn valid_utc_ms(value: &str) -> bool {
    value.ends_with('Z') && value.contains('T') && parse_iso_ms(value).is_some()
}

fn parse_clean_https_url(value: &str) -> Result<url::Url, String> {
    let parsed = url::Url::parse(value).map_err(|_| "领取页面地址无效".to_string())?;
    if parsed.scheme() != "https"
        || parsed.host_str().is_none()
        || !parsed.username().is_empty()
        || parsed.password().is_some()
        || parsed.query().is_some()
        || parsed.fragment().is_some()
    {
        return Err("领取页面地址未通过安全校验".to_string());
    }
    Ok(parsed)
}

fn parse_create_response(raw: &[u8]) -> Result<CreateResponse, String> {
    if raw.len() > MAX_BODY_BYTES {
        return Err("领取服务响应过大".to_string());
    }
    let wire: CreateWire =
        serde_json::from_slice(raw).map_err(|_| "领取服务响应格式异常".to_string())?;
    let user_code = wire.user_code.as_bytes();
    if wire.device_secret.len() < 32
        || user_code.len() != 9
        || user_code[4] != b'-'
        || !user_code
            .iter()
            .enumerate()
            .all(|(index, b)| index == 4 || b.is_ascii_uppercase() || b.is_ascii_digit())
        || !valid_utc_ms(&wire.expires_at)
        || !(1..=60).contains(&wire.poll_interval_seconds)
    {
        return Err("领取服务响应字段异常".to_string());
    }
    parse_clean_https_url(&wire.verification_url)?;
    Ok(CreateResponse {
        device_secret: wire.device_secret,
        user_code: wire.user_code,
        verification_url: wire.verification_url,
        expires_at: wire.expires_at,
        poll_interval_seconds: wire.poll_interval_seconds,
    })
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct PendingWire {
    status: String,
    expires_at: String,
    retry_after_seconds: u64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct LaunchWire {
    claim_token: String,
    consume_path: String,
    expires_at: String,
}

enum PollResponse {
    Pending(PendingWire),
    Approved(LaunchWire),
}

fn parse_poll_response(status: u16, raw: &[u8]) -> Result<PollResponse, String> {
    if raw.len() > MAX_BODY_BYTES {
        return Err("领取状态响应过大".to_string());
    }
    match status {
        202 => {
            let value: PendingWire =
                serde_json::from_slice(raw).map_err(|_| "领取状态响应格式异常".to_string())?;
            if value.status != "authorization_pending"
                || !valid_utc_ms(&value.expires_at)
                || !(1..=120).contains(&value.retry_after_seconds)
            {
                return Err("领取状态响应字段异常".to_string());
            }
            Ok(PollResponse::Pending(value))
        }
        200 => {
            let value: LaunchWire =
                serde_json::from_slice(raw).map_err(|_| "领取批准响应格式异常".to_string())?;
            if value.claim_token.len() < 24
                || value.consume_path != CONSUME_PATH
                || !valid_utc_ms(&value.expires_at)
            {
                return Err("领取批准响应字段异常".to_string());
            }
            Ok(PollResponse::Approved(value))
        }
        409 | 410 => Err("本次领取已失效，请重新开始".to_string()),
        429 => Err("确认请求过于频繁，请稍后再试".to_string()),
        503 => Err("领取服务暂时不可用，请稍后重试".to_string()),
        _ => Err("领取服务返回了无法识别的状态".to_string()),
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ConsumeRequest {
    contract_version: String,
    claim_token: String,
    project_key: String,
    machine_id: String,
    request_id: String,
    nonce: String,
}

impl ConsumeRequest {
    fn canonical_json(&self) -> Result<String, String> {
        serde_json_canonicalizer::to_string(self).map_err(|_| "领取请求无法序列化".to_string())
    }

    #[cfg(test)]
    fn canonical_digest(&self) -> String {
        let bytes = self.canonical_json().unwrap_or_default();
        format!("sha256:{:x}", Sha256::digest(bytes.as_bytes()))
    }

    #[cfg(test)]
    fn fixture() -> Self {
        Self {
            contract_version: CONTRACT_VERSION.to_string(),
            claim_token: "ec1.clm_01K0A0B1C7.1.ZlKM4dWAwz_YbGNmcBDsl9ZSvsaVxjPIt8-Py24KbV0"
                .to_string(),
            project_key: "creatoros".to_string(),
            machine_id: "device-opaque-id".to_string(),
            request_id: "018f0f7e-7b3b-7d75-8c4a-0123456789ab".to_string(),
            nonce: "nonce-creator-00000001".to_string(),
        }
    }
}

impl Drop for ConsumeRequest {
    fn drop(&mut self) {
        self.claim_token.zeroize();
        self.nonce.zeroize();
    }
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
enum AttemptState {
    Prepared,
    Attempted,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct PendingConsumeJournal {
    schema_version: String,
    contract_version: String,
    claim_token: String,
    consume_path: String,
    request_id: String,
    nonce: String,
    launch_expires_at: String,
    local_binding_digest: String,
    attempt_state: AttemptState,
    created_at: String,
}

impl PendingConsumeJournal {
    fn prepare(mut request: ConsumeRequest, launch_expires_at: &str) -> Self {
        let binding = serde_json::json!({
            "contractVersion": request.contract_version,
            "consumePath": CONSUME_PATH,
            "claimTokenSha256": format!("sha256:{:x}", Sha256::digest(request.claim_token.as_bytes())),
            "projectKey": request.project_key,
            "machineIdSha256": format!("sha256:{:x}", Sha256::digest(format!(
                "machine-v1\n{}\n{}",
                request.project_key, request.machine_id
            ).as_bytes())),
            "requestId": request.request_id,
            "nonce": request.nonce,
        });
        let canonical = serde_json_canonicalizer::to_string(&binding).unwrap_or_default();
        Self {
            schema_version: JOURNAL_VERSION.to_string(),
            contract_version: std::mem::take(&mut request.contract_version),
            claim_token: std::mem::take(&mut request.claim_token),
            consume_path: CONSUME_PATH.to_string(),
            request_id: std::mem::take(&mut request.request_id),
            nonce: std::mem::take(&mut request.nonce),
            launch_expires_at: launch_expires_at.to_string(),
            local_binding_digest: format!("sha256:{:x}", Sha256::digest(canonical.as_bytes())),
            attempt_state: AttemptState::Prepared,
            created_at: now_iso(),
        }
    }

    fn mark_attempted(mut self) -> Self {
        self.attempt_state = AttemptState::Attempted;
        self
    }

    fn request(&self, project_key: &str, machine_id: &str) -> Result<ConsumeRequest, String> {
        let request = ConsumeRequest {
            contract_version: self.contract_version.clone(),
            claim_token: self.claim_token.clone(),
            project_key: project_key.to_string(),
            machine_id: machine_id.to_string(),
            request_id: self.request_id.clone(),
            nonce: self.nonce.clone(),
        };
        let rebuilt = Self::prepare(request.clone(), &self.launch_expires_at);
        if rebuilt.local_binding_digest != self.local_binding_digest
            || self.schema_version != JOURNAL_VERSION
            || self.consume_path != CONSUME_PATH
        {
            return Err("待恢复领取与当前设备绑定不一致".to_string());
        }
        Ok(request)
    }
}

impl Drop for PendingConsumeJournal {
    fn drop(&mut self) {
        self.claim_token.zeroize();
        self.nonce.zeroize();
        self.local_binding_digest.zeroize();
    }
}

fn now_iso() -> String {
    let ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64;
    format_iso_ms(ms)
}

trait JournalStore {
    fn load(&self) -> Result<Option<PendingConsumeJournal>, String>;
    fn save(&self, value: &PendingConsumeJournal) -> Result<(), String>;
    fn delete(&self) -> Result<(), String>;
}

fn prepare_journal(
    store: &dyn JournalStore,
    request: ConsumeRequest,
    launch_expires_at: &str,
) -> Result<PendingConsumeJournal, String> {
    let pending = PendingConsumeJournal::prepare(request, launch_expires_at);
    store.save(&pending)?;
    let readback = store
        .load()?
        .ok_or_else(|| "待恢复领取记录写入后无法读回".to_string())?;
    if readback != pending {
        return Err("待恢复领取记录写入后验真不一致".to_string());
    }
    Ok(pending)
}

fn mark_journal_attempted(
    store: &dyn JournalStore,
    journal: PendingConsumeJournal,
) -> Result<PendingConsumeJournal, String> {
    if journal.attempt_state == AttemptState::Attempted {
        return Ok(journal);
    }
    let attempted = journal.mark_attempted();
    store.save(&attempted)?;
    let readback = store
        .load()?
        .ok_or_else(|| "待恢复领取记录更新后无法读回".to_string())?;
    if readback != attempted {
        return Err("待恢复领取记录更新后验真不一致".to_string());
    }
    Ok(attempted)
}

/// OS 凭据后端的最小端口。生产实现仍由 keyring 选择 macOS Keychain /
/// Windows Credential Manager；测试通过内存后端验证同一套序列化、读回和清理语义，
/// 不需要在 CI 中伪造任一平台的系统凭据服务。
trait CredentialBackend {
    fn read_secret(&self) -> Result<Option<String>, String>;
    fn write_secret(&self, value: &str) -> Result<(), String>;
    fn delete_secret(&self) -> Result<(), String>;
}

#[derive(Clone)]
struct NativeCredentialBackend {
    service: String,
    account: String,
}

impl NativeCredentialBackend {
    fn new(service: impl Into<String>, account: impl Into<String>) -> Self {
        Self {
            service: service.into(),
            account: account.into(),
        }
    }

    fn entry(&self) -> Result<keyring::Entry, String> {
        keyring::Entry::new(&self.service, &self.account)
            .map_err(|_| "系统受保护凭据存储不可用".to_string())
    }
}

impl CredentialBackend for NativeCredentialBackend {
    fn read_secret(&self) -> Result<Option<String>, String> {
        let entry = self.entry()?;
        match entry.get_password() {
            Ok(raw) => Ok(Some(raw)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(_) => Err("无法读取系统受保护的待恢复领取记录".to_string()),
        }
    }

    fn write_secret(&self, value: &str) -> Result<(), String> {
        let entry = self.entry()?;
        entry
            .set_password(value)
            .map_err(|_| "无法写入系统受保护的待恢复领取记录".to_string())
    }

    fn delete_secret(&self) -> Result<(), String> {
        let entry = self.entry()?;
        match entry.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(_) => Err("正式授权已保存，但待恢复领取记录清理失败".to_string()),
        }
    }
}

struct ProtectedCredentialJournal<B> {
    backend: B,
}

impl<B> ProtectedCredentialJournal<B> {
    fn new(backend: B) -> Self {
        Self { backend }
    }
}

impl<B: CredentialBackend> JournalStore for ProtectedCredentialJournal<B> {
    fn load(&self) -> Result<Option<PendingConsumeJournal>, String> {
        let Some(raw) = self.backend.read_secret()? else {
            return Ok(None);
        };
        let raw = Zeroizing::new(raw);
        serde_json::from_str(raw.as_str())
            .map(Some)
            .map_err(|_| "待恢复领取记录无法验证".to_string())
    }

    fn save(&self, value: &PendingConsumeJournal) -> Result<(), String> {
        let raw = Zeroizing::new(
            serde_json::to_string(value).map_err(|_| "待恢复领取记录无法序列化".to_string())?,
        );
        self.backend.write_secret(raw.as_str())?;
        let readback = self
            .backend
            .read_secret()?
            .map(Zeroizing::new)
            .ok_or_else(|| "无法读回系统受保护的待恢复领取记录".to_string())?;
        if readback.as_str() != raw.as_str() {
            return Err("系统受保护的待恢复领取记录读后不一致".to_string());
        }
        Ok(())
    }

    fn delete(&self) -> Result<(), String> {
        self.backend.delete_secret()
    }
}

fn native_journal() -> ProtectedCredentialJournal<NativeCredentialBackend> {
    ProtectedCredentialJournal::new(NativeCredentialBackend::new(
        JOURNAL_SERVICE,
        JOURNAL_ACCOUNT,
    ))
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ClaimView {
    state: String,
    user_code: Option<String>,
    verification_url: Option<String>,
    expires_at: Option<String>,
    retry_after_seconds: Option<u64>,
    message: String,
}

fn safe_view(
    state: &str,
    user_code: Option<String>,
    verification_url: Option<String>,
    expires_at: Option<String>,
    retry_after_seconds: Option<u64>,
    message: &str,
) -> ClaimView {
    ClaimView {
        state: state.to_string(),
        user_code,
        verification_url,
        expires_at,
        retry_after_seconds,
        message: message.to_string(),
    }
}

fn capability_enabled() -> bool {
    let built_in = option_env!("CREATOROS_BUILTIN_ENTITLEMENT_CLAIM_ENABLED")
        .unwrap_or("0")
        .trim();
    if cfg!(debug_assertions) {
        std::env::var("CREATOROS_ENTITLEMENT_CLAIM_ENABLED")
            .ok()
            .map(|value| value.trim() == "1")
            .unwrap_or(built_in == "1")
    } else {
        built_in == "1"
    }
}

fn growth_origin() -> Result<url::Url, String> {
    let built_in = option_env!("CREATOROS_BUILTIN_GROWTH_ENTITLEMENT_API_ORIGIN")
        .unwrap_or("")
        .trim();
    let raw = if cfg!(debug_assertions) {
        std::env::var("GROWTH_ENTITLEMENT_API_ORIGIN")
            .ok()
            .filter(|value| !value.trim().is_empty())
            .unwrap_or_else(|| built_in.to_string())
    } else {
        built_in.to_string()
    };
    let parsed = parse_clean_https_url(raw.trim())?;
    if parsed.path() != "/" || parsed.port().is_some() {
        return Err("领取服务发布配置无效".to_string());
    }
    Ok(parsed)
}

struct PlainResponse {
    status: u16,
    body: Vec<u8>,
    retry_after_seconds: Option<u64>,
}

fn post_json(url: &url::Url, body: &str) -> Result<PlainResponse, String> {
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(10))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|_| "无法初始化领取网络连接".to_string())?;
    let response = client
        .post(url.as_str())
        .header("Content-Type", "application/json")
        .header("Accept", "application/json")
        .body(body.to_string())
        .send()
        .map_err(|_| "领取服务暂时无法连接，请稍后重试".to_string())?;
    let status = response.status().as_u16();
    if response.headers().get("location").is_some() {
        return Err("领取服务拒绝了不安全的跳转".to_string());
    }
    let content_type = response
        .headers()
        .get("content-type")
        .and_then(|value| value.to_str().ok())
        .unwrap_or("");
    let cache_control = response
        .headers()
        .get("cache-control")
        .and_then(|value| value.to_str().ok())
        .unwrap_or("");
    if !content_type
        .to_ascii_lowercase()
        .starts_with("application/json")
        || !cache_control
            .split(',')
            .any(|part| part.trim().eq_ignore_ascii_case("no-store"))
    {
        return Err("领取服务响应未通过安全头校验".to_string());
    }
    let retry_after_seconds = response
        .headers()
        .get("retry-after")
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.parse::<u64>().ok())
        .filter(|value| (1..=120).contains(value));
    let body = response
        .bytes()
        .map_err(|_| "读取领取服务响应失败".to_string())?
        .to_vec();
    if body.len() > MAX_BODY_BYTES {
        return Err("领取服务响应过大".to_string());
    }
    Ok(PlainResponse {
        status,
        body,
        retry_after_seconds,
    })
}

fn random_base64url(bytes: usize) -> String {
    let mut raw = vec![0u8; bytes];
    rand::rngs::OsRng.fill_bytes(&mut raw);
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(raw)
}

fn random_uuid() -> String {
    let mut raw = [0u8; 16];
    rand::rngs::OsRng.fill_bytes(&mut raw);
    raw[6] = (raw[6] & 0x0f) | 0x40;
    raw[8] = (raw[8] & 0x3f) | 0x80;
    format!(
        "{:02x}{:02x}{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}{:02x}{:02x}{:02x}{:02x}",
        raw[0], raw[1], raw[2], raw[3], raw[4], raw[5], raw[6], raw[7],
        raw[8], raw[9], raw[10], raw[11], raw[12], raw[13], raw[14], raw[15]
    )
}

fn consume_http(base_url: &str, path: &str, body: &str) -> Result<LicenseHttpResponse, String> {
    let base = url::Url::parse(base_url).map_err(|_| "授权服务配置无效".to_string())?;
    if base.scheme() != "https" || base.host_str().is_none() {
        return Err("授权服务配置无效".to_string());
    }
    let url = base
        .join(path)
        .map_err(|_| "授权服务路径无效".to_string())?;
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(10))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|_| "无法初始化授权网络连接".to_string())?;
    let response = client
        .post(url.as_str())
        .header("Content-Type", "application/json")
        .header("Accept", "application/json")
        .body(body.to_string())
        .send()
        .map_err(|_| "授权服务暂时无法连接；稍后可继续恢复领取".to_string())?;
    let status = response.status().as_u16();
    let header = |name: &str| {
        response
            .headers()
            .get(name)
            .and_then(|value| value.to_str().ok())
            .map(str::to_string)
    };
    let signature = header("x-license-signature");
    let date = header("x-license-date");
    let digest = header("x-license-digest");
    let body = response
        .bytes()
        .map_err(|_| "读取授权响应失败；稍后可继续恢复领取".to_string())?
        .to_vec();
    if body.len() > MAX_BODY_BYTES {
        return Err("授权响应过大；稍后可继续恢复领取".to_string());
    }
    Ok(LicenseHttpResponse {
        status,
        signature,
        date,
        digest,
        body,
    })
}

trait ConsumeTransport {
    fn consume(
        &self,
        base_url: &str,
        path: &str,
        body: &str,
    ) -> Result<LicenseHttpResponse, String>;
}

#[derive(Clone, Copy)]
struct HttpsConsumeTransport;

impl ConsumeTransport for HttpsConsumeTransport {
    fn consume(
        &self,
        base_url: &str,
        path: &str,
        body: &str,
    ) -> Result<LicenseHttpResponse, String> {
        consume_http(base_url, path, body)
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ConsumeLicense {
    mode: String,
    valid: bool,
    expires_at: Option<String>,
    revoked: bool,
    grace_seconds: i64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ConsumeData {
    grant_id: String,
    entitlement_id: String,
    project_key: String,
    grant_version: u64,
    delivery_mode: String,
    claim_status: String,
    claimed_at: String,
    activation_code: String,
    license: ConsumeLicense,
    channel_config: Option<serde_json::Value>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ConsumeSuccess {
    success: bool,
    contract_version: String,
    request_id: String,
    nonce: String,
    idempotent: bool,
    server_time: String,
    data: ConsumeData,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ConsumeErrorBody {
    code: String,
    message: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ConsumeError {
    success: bool,
    contract_version: String,
    request_id: Option<String>,
    nonce: Option<String>,
    server_time: String,
    error: ConsumeErrorBody,
}

fn exact_keys(value: &serde_json::Value, expected: &[&str]) -> bool {
    let Some(object) = value.as_object() else {
        return false;
    };
    let mut actual = object.keys().map(String::as_str).collect::<Vec<_>>();
    let mut expected = expected.to_vec();
    actual.sort_unstable();
    expected.sort_unstable();
    actual == expected
}

fn parse_consume_success(raw: &[u8]) -> Result<ConsumeSuccess, String> {
    let value: serde_json::Value = serde_json::from_slice(raw)
        .map_err(|_| "授权成功响应格式异常；稍后可继续恢复领取".to_string())?;
    if !exact_keys(
        &value,
        &[
            "success",
            "contractVersion",
            "requestId",
            "nonce",
            "idempotent",
            "serverTime",
            "data",
        ],
    ) || !exact_keys(
        &value["data"],
        &[
            "grantId",
            "entitlementId",
            "projectKey",
            "grantVersion",
            "deliveryMode",
            "claimStatus",
            "claimedAt",
            "activationCode",
            "license",
            "channelConfig",
        ],
    ) || !exact_keys(
        &value["data"]["license"],
        &["mode", "valid", "expiresAt", "revoked", "graceSeconds"],
    ) {
        return Err("授权成功响应未满足 closed schema；已保留恢复记录".to_string());
    }
    serde_json::from_value(value)
        .map_err(|_| "授权成功响应格式异常；稍后可继续恢复领取".to_string())
}

fn parse_consume_error(raw: &[u8]) -> Result<ConsumeError, String> {
    let value: serde_json::Value = serde_json::from_slice(raw)
        .map_err(|_| "授权错误响应格式异常；已保留恢复记录".to_string())?;
    if !exact_keys(
        &value,
        &[
            "success",
            "contractVersion",
            "requestId",
            "nonce",
            "serverTime",
            "error",
        ],
    ) || !exact_keys(&value["error"], &["code", "message"])
    {
        return Err("授权错误响应未满足 closed schema；已保留恢复记录".to_string());
    }
    serde_json::from_value(value).map_err(|_| "授权错误响应格式异常；已保留恢复记录".to_string())
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum ErrorJournalAction {
    DeleteRestart,
    DeleteRevoked,
    Retain,
}

fn error_journal_action(code: &str) -> ErrorJournalAction {
    match code {
        "CLAIM_INVALID" | "CLAIM_EXPIRED" => ErrorJournalAction::DeleteRestart,
        "CLAIM_REVOKED" => ErrorJournalAction::DeleteRevoked,
        _ => ErrorJournalAction::Retain,
    }
}

fn verify_signed_response(
    response: &LicenseHttpResponse,
    config: &LicenseConfig,
    now_ms: i64,
) -> Result<(), String> {
    let key = resolve_public_key(&config.public_key_b64)?;
    let base = url::Url::parse(&config.base_url).map_err(|_| "授权服务配置无效".to_string())?;
    let host = base
        .host_str()
        .ok_or_else(|| "授权服务配置无效".to_string())?;
    let host = match base.port() {
        Some(port) => format!("{host}:{port}"),
        None => host.to_string(),
    };
    verify_response_signature(&key, &format!("post {CONSUME_PATH}"), &host, response)?;
    let date = response
        .date
        .as_deref()
        .ok_or_else(|| "授权响应缺少签名时间".to_string())?;
    let date_ms = httpdate::parse_http_date(date)
        .map_err(|_| "授权响应签名时间无效".to_string())?
        .duration_since(UNIX_EPOCH)
        .map_err(|_| "授权响应签名时间无效".to_string())?
        .as_millis() as i64;
    if (date_ms - now_ms).abs() > MAX_DATE_SKEW_MS {
        return Err("授权响应签名时间已过期".to_string());
    }
    Ok(())
}

fn current_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

trait LicenseSnapshotStore {
    fn replace_and_verify(
        &self,
        path: &std::path::Path,
        snapshot: &LicenseSnapshot,
        key: &[u8; 32],
    ) -> Result<(), String>;
}

#[derive(Clone, Copy)]
struct AtomicLicenseSnapshotStore;

impl LicenseSnapshotStore for AtomicLicenseSnapshotStore {
    fn replace_and_verify(
        &self,
        path: &std::path::Path,
        snapshot: &LicenseSnapshot,
        key: &[u8; 32],
    ) -> Result<(), String> {
        write_snapshot_file_checked(path, snapshot, Some(key))?;
        let readback = read_snapshot_file(path, Some(key))
            .ok_or_else(|| "正式授权写入后无法读回".to_string())?;
        if readback != *snapshot {
            return Err("正式授权写入后验真不一致".to_string());
        }
        Ok(())
    }
}

fn persist_success_with(
    state: &LicenseState,
    request: &ConsumeRequest,
    success: ConsumeSuccess,
    snapshot_store: &dyn LicenseSnapshotStore,
) -> Result<(), String> {
    // true=AM exact replay，false=首次响应；两者授权事实完全等价，但必须读到该 closed 字段。
    let _is_exact_replay = success.idempotent;
    if !success.success
        || success.contract_version != CONTRACT_VERSION
        || success.request_id != request.request_id
        || success.nonce != request.nonce
        || !valid_utc_ms(&success.server_time)
        || success.data.project_key != request.project_key
        || success.data.delivery_mode != "activation_claim"
        || success.data.claim_status != "claimed"
        || success.data.grant_version == 0
        || success.data.grant_id.is_empty()
        || success.data.entitlement_id.is_empty()
        || !valid_utc_ms(&success.data.claimed_at)
        || success.data.activation_code.trim().is_empty()
        || !success.data.license.valid
        || success.data.license.revoked
        || success.data.license.mode != "TIME"
        || success.data.license.grace_seconds < 0
        || !success
            .data
            .license
            .expires_at
            .as_deref()
            .map(valid_utc_ms)
            .unwrap_or(false)
    {
        return Err("授权成功响应未通过 closed contract 校验".to_string());
    }
    let ctx = &state.0;
    let key = ctx
        .master_key_b64
        .as_deref()
        .and_then(derive_license_key)
        .ok_or_else(|| "本机授权加密凭据不可用，未保存授权".to_string())?;
    let runtime = match success.data.channel_config.as_ref() {
        Some(value) => Some(
            parse_signed_channel_runtime(
                value,
                &request.project_key,
                value.get("channelRef").and_then(|item| item.as_str()),
            )
            .map_err(|_| "渠道配置未通过签名运行时契约校验".to_string())?,
        ),
        None => None,
    };
    let server_ms =
        parse_iso_ms(&success.server_time).ok_or_else(|| "授权服务时间无效".to_string())?;
    let snapshot = LicenseSnapshot {
        v: 1,
        allowed: true,
        status: "active".to_string(),
        code: success.data.activation_code,
        machine_id: request.machine_id.clone(),
        license_mode: success.data.license.mode,
        project_key: request.project_key.clone(),
        channel_ref: runtime.as_ref().map(|value| value.channel_ref.clone()),
        channel_runtime: runtime,
        expires_at: success.data.license.expires_at,
        activated_at: success.data.claimed_at,
        last_online_check_ms: server_ms,
        last_seen_ms: server_ms,
        grace_seconds: success.data.license.grace_seconds,
        revoked: false,
        updates_blocked: false,
        signature_verified: true,
        verdict_at_ms: current_ms(),
        message: "权益已领取并激活".to_string(),
    };
    let path = license_file_path(&ctx.app_data_dir);
    snapshot_store.replace_and_verify(&path, &snapshot, &key)?;
    sync_mirror_to_sidecar(ctx, &snapshot);
    refresh_client_config_sidecar_async(state.0.clone());
    Ok(())
}

fn consume_pending_with(
    state: &LicenseState,
    store: &dyn JournalStore,
    transport: &dyn ConsumeTransport,
    snapshot_store: &dyn LicenseSnapshotStore,
    config: &LicenseConfig,
    now_ms: i64,
) -> Result<ClaimView, String> {
    let journal = store
        .load()?
        .ok_or_else(|| "没有待恢复的领取".to_string())?;
    journal.request(&config.project_key, &config.machine_id)?;
    let attempted = mark_journal_attempted(store, journal)?;
    let exact_request = attempted.request(&config.project_key, &config.machine_id)?;
    let body = Zeroizing::new(exact_request.canonical_json()?);
    let response = transport.consume(&config.base_url, &attempted.consume_path, body.as_str())?;
    verify_signed_response(&response, &config, now_ms)?;
    if response.status == 200 {
        let success = parse_consume_success(&response.body)?;
        persist_success_with(state, &exact_request, success, snapshot_store)?;
        store.delete()?;
        return Ok(safe_view(
            "activated",
            None,
            None,
            None,
            None,
            "权益已领取并激活",
        ));
    }
    let error = parse_consume_error(&response.body)?;
    if error.success
        || error.contract_version != CONTRACT_VERSION
        || error.request_id.as_deref() != Some(exact_request.request_id.as_str())
        || error.nonce.as_deref() != Some(exact_request.nonce.as_str())
        || !valid_utc_ms(&error.server_time)
        || error.error.message.trim().is_empty()
    {
        return Err("授权错误响应无法与本次请求对应；已保留恢复记录".to_string());
    }
    match error_journal_action(&error.error.code) {
        ErrorJournalAction::DeleteRestart => {
            store.delete()?;
            Ok(safe_view(
                "restartRequired",
                None,
                None,
                None,
                None,
                "本次领取凭据已失效，请重新领取",
            ))
        }
        ErrorJournalAction::DeleteRevoked => {
            store.delete()?;
            Ok(safe_view(
                "revoked",
                None,
                None,
                None,
                None,
                "该权益已被撤回，请联系服务方",
            ))
        }
        ErrorJournalAction::Retain => {
            Err("授权结果尚未收敛；已保留恢复记录，请稍后重试".to_string())
        }
    }
}

#[tauri::command]
pub async fn entitlement_claim_start(
    state: tauri::State<'_, LicenseState>,
) -> Result<ClaimView, String> {
    if !capability_enabled() {
        return Err("权益领取功能尚未开放".to_string());
    }
    let state = state.inner().0.clone();
    tauri::async_runtime::spawn_blocking(move || {
        if native_journal().load()?.is_some() {
            return Ok(safe_view(
                "recovering",
                None,
                None,
                None,
                None,
                "检测到未完成的领取，请先继续恢复",
            ));
        }
        let origin = growth_origin()?;
        let verifier = random_base64url(32);
        let challenge = base64::engine::general_purpose::URL_SAFE_NO_PAD
            .encode(Sha256::digest(verifier.as_bytes()));
        let body = serde_json_canonicalizer::to_string(&serde_json::json!({
            "client": "creatoros",
            "codeChallenge": challenge,
            "codeChallengeMethod": "S256",
        }))
        .map_err(|_| "无法创建领取请求".to_string())?;
        let url = origin
            .join(CREATE_PATH)
            .map_err(|_| "领取服务路径无效".to_string())?;
        let response = post_json(&url, &body)?;
        if response.status != 201 {
            return Err(match response.status {
                429 => "领取服务繁忙，请稍后重试".to_string(),
                503 => "领取服务暂未开放，请稍后重试".to_string(),
                _ => "无法创建领取会话".to_string(),
            });
        }
        let parsed = parse_create_response(&response.body)?;
        let verification = url::Url::parse(&parsed.verification_url)
            .map_err(|_| "领取页面地址无效".to_string())?;
        if verification.origin() != origin.origin() {
            return Err("领取页面不属于官方服务".to_string());
        }
        let view = safe_view(
            "awaitingApproval",
            Some(parsed.display_user_code()),
            Some(parsed.verification_url.clone()),
            Some(parsed.expires_at.clone()),
            Some(parsed.poll_interval_seconds),
            "请在已登录的官方页面输入验证码并确认领取",
        );
        *session().lock().map_err(|_| "领取会话锁异常".to_string())? = Some(DeviceSession {
            device_secret: SecretString::new(parsed.device_secret),
            code_verifier: SecretString::new(verifier),
            user_code: parsed.user_code,
            verification_url: parsed.verification_url,
            expires_at: parsed.expires_at,
            poll_interval_seconds: parsed.poll_interval_seconds,
            next_poll_at_ms: current_ms() + (parsed.poll_interval_seconds as i64 * 1_000),
        });
        // 只为保持 ctx 生命周期与 command state 一致；不读取或传出其中秘密。
        let _ = state;
        Ok(view)
    })
    .await
    .map_err(|_| "领取任务执行失败".to_string())?
}

#[tauri::command]
pub async fn entitlement_claim_poll(
    state: tauri::State<'_, LicenseState>,
) -> Result<ClaimView, String> {
    if !capability_enabled() {
        return Err("权益领取功能尚未开放".to_string());
    }
    let license_state = LicenseState(state.inner().0.clone());
    tauri::async_runtime::spawn_blocking(move || {
        let store = native_journal();
        if store.load()?.is_some() {
            let config = LicenseConfig::from_env(license_state.0.machine_id.clone());
            return consume_pending_with(
                &license_state,
                &store,
                &HttpsConsumeTransport,
                &AtomicLicenseSnapshotStore,
                &config,
                current_ms(),
            );
        }
        let guard = session().lock().map_err(|_| "领取会话锁异常".to_string())?;
        let current = guard
            .as_ref()
            .ok_or_else(|| "领取会话不存在，请重新开始".to_string())?
            .clone();
        drop(guard);
        let now_ms = current_ms();
        if now_ms < current.next_poll_at_ms {
            let remaining = ((current.next_poll_at_ms - now_ms + 999) / 1_000) as u64;
            return Ok(safe_view(
                "awaitingApproval",
                Some(current.user_code.clone()),
                Some(current.verification_url.clone()),
                Some(current.expires_at.clone()),
                Some(remaining),
                "请稍候，再检查网页确认结果",
            ));
        }
        let origin = growth_origin()?;
        let body = Zeroizing::new(
            serde_json_canonicalizer::to_string(&serde_json::json!({
                "deviceSecret": current.device_secret.expose_secret(),
                "codeVerifier": current.code_verifier.expose_secret(),
            }))
            .map_err(|_| "无法创建领取状态请求".to_string())?,
        );
        let response = post_json(
            &origin
                .join(POLL_PATH)
                .map_err(|_| "领取服务路径无效".to_string())?,
            body.as_str(),
        )?;
        if response.status == 429 {
            let wait = response
                .retry_after_seconds
                .unwrap_or(current.poll_interval_seconds.saturating_add(5))
                .clamp(current.poll_interval_seconds, 30);
            if let Some(active) = session()
                .lock()
                .map_err(|_| "领取会话锁异常".to_string())?
                .as_mut()
            {
                active.next_poll_at_ms = current_ms() + (wait as i64 * 1_000);
            }
            return Ok(safe_view(
                "awaitingApproval",
                Some(current.user_code.clone()),
                Some(current.verification_url.clone()),
                Some(current.expires_at.clone()),
                Some(wait),
                "请求较频繁，稍候再检查",
            ));
        }
        if matches!(response.status, 404 | 409 | 410) {
            *session().lock().map_err(|_| "领取会话锁异常".to_string())? = None;
            return Ok(safe_view(
                "restartRequired",
                None,
                None,
                None,
                None,
                "本次验证码已失效，请重新领取",
            ));
        }
        match parse_poll_response(response.status, &response.body)? {
            PollResponse::Pending(pending) => {
                let wait = pending
                    .retry_after_seconds
                    .max(current.poll_interval_seconds);
                if let Some(active) = session()
                    .lock()
                    .map_err(|_| "领取会话锁异常".to_string())?
                    .as_mut()
                {
                    active.next_poll_at_ms = current_ms() + (wait as i64 * 1_000);
                }
                Ok(safe_view(
                    "awaitingApproval",
                    Some(current.user_code.clone()),
                    Some(current.verification_url.clone()),
                    Some(pending.expires_at),
                    Some(wait),
                    "仍在等待网页确认",
                ))
            }
            PollResponse::Approved(launch) => {
                let config = LicenseConfig::from_env(license_state.0.machine_id.clone());
                let request = ConsumeRequest {
                    contract_version: CONTRACT_VERSION.to_string(),
                    claim_token: launch.claim_token,
                    project_key: config.project_key.clone(),
                    machine_id: config.machine_id.clone(),
                    request_id: random_uuid(),
                    nonce: random_base64url(24),
                };
                prepare_journal(&store, request, &launch.expires_at)?;
                *session().lock().map_err(|_| "领取会话锁异常".to_string())? = None;
                consume_pending_with(
                    &license_state,
                    &store,
                    &HttpsConsumeTransport,
                    &AtomicLicenseSnapshotStore,
                    &config,
                    current_ms(),
                )
            }
        }
    })
    .await
    .map_err(|_| "领取任务执行失败".to_string())?
}

#[tauri::command]
pub async fn entitlement_claim_resume(
    state: tauri::State<'_, LicenseState>,
) -> Result<Option<ClaimView>, String> {
    if !capability_enabled() {
        return Ok(None);
    }
    let license_state = LicenseState(state.inner().0.clone());
    tauri::async_runtime::spawn_blocking(move || {
        let store = native_journal();
        if store.load()?.is_none() {
            return Ok(None);
        }
        let config = LicenseConfig::from_env(license_state.0.machine_id.clone());
        consume_pending_with(
            &license_state,
            &store,
            &HttpsConsumeTransport,
            &AtomicLicenseSnapshotStore,
            &config,
            current_ms(),
        )
        .map(Some)
    })
    .await
    .map_err(|_| "恢复领取任务执行失败".to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::license::{SessionMonotonic, ShellLicenseCtx};
    use std::collections::VecDeque;
    use std::sync::Arc;

    #[derive(Default)]
    struct MemoryJournal {
        value: Mutex<Option<PendingConsumeJournal>>,
        transitions: Mutex<Vec<AttemptState>>,
        deletes: Mutex<usize>,
    }

    impl JournalStore for MemoryJournal {
        fn load(&self) -> Result<Option<PendingConsumeJournal>, String> {
            Ok(self.value.lock().unwrap().clone())
        }

        fn save(&self, value: &PendingConsumeJournal) -> Result<(), String> {
            *self.value.lock().unwrap() = Some(value.clone());
            self.transitions
                .lock()
                .unwrap()
                .push(value.attempt_state.clone());
            Ok(())
        }

        fn delete(&self) -> Result<(), String> {
            *self.value.lock().unwrap() = None;
            *self.deletes.lock().unwrap() += 1;
            Ok(())
        }
    }

    struct RejectingJournal;

    impl JournalStore for RejectingJournal {
        fn load(&self) -> Result<Option<PendingConsumeJournal>, String> {
            Ok(None)
        }

        fn save(&self, _value: &PendingConsumeJournal) -> Result<(), String> {
            Err("模拟系统凭据写入失败".to_string())
        }

        fn delete(&self) -> Result<(), String> {
            Ok(())
        }
    }

    #[derive(Clone, Default)]
    struct MemoryCredentialBackend {
        raw: Arc<Mutex<Option<String>>>,
        corrupt_readback: Arc<Mutex<bool>>,
        deletes: Arc<Mutex<usize>>,
    }

    impl CredentialBackend for MemoryCredentialBackend {
        fn read_secret(&self) -> Result<Option<String>, String> {
            let mut value = self.raw.lock().unwrap().clone();
            if *self.corrupt_readback.lock().unwrap() {
                if let Some(raw) = value.as_mut() {
                    raw.push(' ');
                }
            }
            Ok(value)
        }

        fn write_secret(&self, value: &str) -> Result<(), String> {
            *self.raw.lock().unwrap() = Some(value.to_string());
            Ok(())
        }

        fn delete_secret(&self) -> Result<(), String> {
            *self.raw.lock().unwrap() = None;
            *self.deletes.lock().unwrap() += 1;
            Ok(())
        }
    }

    struct SequenceTransport {
        results: Mutex<VecDeque<Result<LicenseHttpResponse, String>>>,
        bodies: Mutex<Vec<String>>,
    }

    impl SequenceTransport {
        fn new(results: Vec<Result<LicenseHttpResponse, String>>) -> Self {
            Self {
                results: Mutex::new(results.into()),
                bodies: Mutex::new(Vec::new()),
            }
        }
    }

    impl ConsumeTransport for SequenceTransport {
        fn consume(
            &self,
            _base_url: &str,
            path: &str,
            body: &str,
        ) -> Result<LicenseHttpResponse, String> {
            assert_eq!(path, CONSUME_PATH);
            self.bodies.lock().unwrap().push(body.to_string());
            self.results
                .lock()
                .unwrap()
                .pop_front()
                .expect("scripted transport exhausted")
        }
    }

    struct RejectingSnapshotStore;

    impl LicenseSnapshotStore for RejectingSnapshotStore {
        fn replace_and_verify(
            &self,
            _path: &std::path::Path,
            _snapshot: &LicenseSnapshot,
            _key: &[u8; 32],
        ) -> Result<(), String> {
            Err("模拟 .license 原子替换后读回失败".to_string())
        }
    }

    fn fixture_response() -> LicenseHttpResponse {
        let fixture: serde_json::Value = serde_json::from_str(include_str!(
            "../../../docs/contracts/fixtures/growth-entitlement-delivery-v1.vector.json"
        ))
        .expect("fixture json");
        let signed = &fixture["consume"]["signedSuccess"];
        LicenseHttpResponse {
            status: 200,
            signature: signed["signature"].as_str().map(str::to_string),
            date: signed["date"].as_str().map(str::to_string),
            digest: signed["digest"].as_str().map(str::to_string),
            body: signed["rawBody"].as_str().unwrap().as_bytes().to_vec(),
        }
    }

    fn fixture_config() -> LicenseConfig {
        let fixture: serde_json::Value = serde_json::from_str(include_str!(
            "../../../docs/contracts/fixtures/growth-entitlement-delivery-v1.vector.json"
        ))
        .expect("fixture json");
        LicenseConfig {
            base_url: "https://license.example.com".to_string(),
            project_key: "creatoros".to_string(),
            strict_verify: true,
            public_key_b64: fixture["testKeys"]["licenseSigningPublicKeyRawBase64"]
                .as_str()
                .unwrap()
                .to_string(),
            machine_id: "device-opaque-id".to_string(),
        }
    }

    fn test_license_state(temp_dir: std::path::PathBuf) -> LicenseState {
        let master_key_b64 = base64::engine::general_purpose::STANDARD.encode([7_u8; 32]);
        LicenseState(Arc::new(ShellLicenseCtx {
            app_data_dir: temp_dir,
            machine_id: "device-opaque-id".to_string(),
            master_key_b64: Some(master_key_b64),
            handshake_token: "test-handshake".to_string(),
            sidecar_port: 0,
            chain_lock: Mutex::new(()),
            session: SessionMonotonic::new(),
            last_decision: Mutex::new(None),
            app_handle: None,
        }))
    }

    #[test]
    fn api_210_response_must_be_closed_and_clean() {
        let raw = br#"{"deviceSecret":"secret-secret-secret-secret-secret","userCode":"ABCD-EFGH","verificationUrl":"https://growth.example.com/claim","expiresAt":"2026-07-27T12:15:00.000Z","pollIntervalSeconds":5}"#;
        let parsed = parse_create_response(raw).expect("valid API-210 response");
        assert_eq!(parsed.display_user_code(), "ABCD-EFGH");

        let extra = br#"{"deviceSecret":"secret-secret-secret-secret-secret","userCode":"ABCD-EFGH","verificationUrl":"https://growth.example.com/claim","expiresAt":"2026-07-27T12:15:00.000Z","pollIntervalSeconds":5,"claimToken":"forbidden"}"#;
        assert!(parse_create_response(extra).is_err());
        let dirty_url = br#"{"deviceSecret":"secret-secret-secret-secret-secret","userCode":"ABCD-EFGH","verificationUrl":"https://growth.example.com/claim?code=ABCD-EFGH","expiresAt":"2026-07-27T12:15:00.000Z","pollIntervalSeconds":5}"#;
        assert!(parse_create_response(dirty_url).is_err());
    }

    #[test]
    fn api_212_pending_uses_final_status_literal_and_rejects_old_alias() {
        let exact = br#"{"status":"authorization_pending","expiresAt":"2026-07-27T12:15:00.000Z","retryAfterSeconds":5}"#;
        assert!(matches!(
            parse_poll_response(202, exact).unwrap(),
            PollResponse::Pending(_)
        ));
        let old_alias =
            br#"{"status":"pending","expiresAt":"2026-07-27T12:15:00.000Z","retryAfterSeconds":5}"#;
        assert!(parse_poll_response(202, old_alias).is_err());
    }

    #[test]
    fn pending_journal_is_prepared_before_network_and_replays_exact_request() {
        let request = ConsumeRequest::fixture();
        let store = MemoryJournal::default();
        let prepared =
            prepare_journal(&store, request.clone(), "2026-07-27T12:15:00.000Z").unwrap();
        assert_eq!(prepared.attempt_state, AttemptState::Prepared);
        let attempted = mark_journal_attempted(&store, prepared).unwrap();
        assert_eq!(attempted.attempt_state, AttemptState::Attempted);
        assert_eq!(
            *store.transitions.lock().unwrap(),
            vec![AttemptState::Prepared, AttemptState::Attempted]
        );
        assert_eq!(*store.deletes.lock().unwrap(), 0);
        assert_eq!(
            attempted
                .request(&request.project_key, &request.machine_id)
                .expect("rebuild exact request"),
            request
        );
        assert_eq!(
            attempted
                .request(&request.project_key, &request.machine_id)
                .unwrap()
                .canonical_digest(),
            request.canonical_digest()
        );

        let mut changed_token = attempted.clone();
        changed_token.claim_token.push_str("-tampered");
        assert!(changed_token
            .request(&request.project_key, &request.machine_id)
            .is_err());

        let mut changed_path = attempted;
        changed_path.consume_path.push_str("/tampered");
        assert!(changed_path
            .request(&request.project_key, &request.machine_id)
            .is_err());
    }

    #[test]
    fn protected_journal_failure_stops_before_any_attempted_state() {
        let error = prepare_journal(
            &RejectingJournal,
            ConsumeRequest::fixture(),
            "2026-07-27T12:15:00.000Z",
        )
        .expect_err("protected credential failure must fail closed");
        assert_eq!(error, "模拟系统凭据写入失败");
    }

    #[test]
    fn keychain_and_credential_manager_backend_contract_is_readback_verified() {
        let backend = MemoryCredentialBackend::default();
        let first = ProtectedCredentialJournal::new(backend.clone());
        let request = ConsumeRequest::fixture();
        let prepared =
            prepare_journal(&first, request.clone(), "2026-07-27T12:15:00.000Z").unwrap();
        drop(first);

        // 模拟桌面进程被强杀后重启：新 journal 实例从同一 OS 凭据后端恢复，
        // 并继续使用完全相同的 requestId/nonce/token。
        let restarted = ProtectedCredentialJournal::new(backend.clone());
        let recovered = restarted.load().unwrap().expect("restart recovery");
        assert_eq!(recovered.attempt_state, AttemptState::Prepared);
        assert_eq!(
            recovered
                .request(&request.project_key, &request.machine_id)
                .unwrap(),
            request
        );
        let attempted = mark_journal_attempted(&restarted, recovered).unwrap();
        assert_eq!(attempted.attempt_state, AttemptState::Attempted);
        assert_eq!(
            restarted.load().unwrap().unwrap().attempt_state,
            AttemptState::Attempted
        );
        restarted.delete().unwrap();
        assert!(restarted.load().unwrap().is_none());
        assert_eq!(*backend.deletes.lock().unwrap(), 1);

        // 系统后端声称写成功但读回字节不同，必须在任何 AM 出网前失败。
        let corrupt = MemoryCredentialBackend::default();
        *corrupt.corrupt_readback.lock().unwrap() = true;
        let corrupt_journal = ProtectedCredentialJournal::new(corrupt);
        let error = prepare_journal(
            &corrupt_journal,
            ConsumeRequest::fixture(),
            "2026-07-27T12:15:00.000Z",
        )
        .expect_err("credential readback mismatch must fail closed");
        assert_eq!(error, "系统受保护的待恢复领取记录读后不一致");
        assert_eq!(prepared.attempt_state, AttemptState::Prepared);
    }

    #[test]
    fn packet_loss_after_am_attempt_keeps_exact_journal_for_idempotent_replay() {
        let temp_dir = std::env::temp_dir().join(format!(
            "creatoros-t575-packet-loss-{}-{}",
            std::process::id(),
            rand::random::<u64>()
        ));
        std::fs::create_dir_all(&temp_dir).unwrap();
        let state = test_license_state(temp_dir.clone());
        let store = MemoryJournal::default();
        let request = ConsumeRequest::fixture();
        prepare_journal(&store, request.clone(), "2026-07-27T12:15:00.000Z").unwrap();
        let dropped =
            SequenceTransport::new(vec![Err("模拟 AM 已处理但响应在网络中丢失".to_string())]);

        let error = consume_pending_with(
            &state,
            &store,
            &dropped,
            &AtomicLicenseSnapshotStore,
            &fixture_config(),
            parse_iso_ms("2026-07-27T12:06:05.000Z").unwrap(),
        )
        .expect_err("packet loss must remain recoverable");
        assert!(error.contains("响应在网络中丢失"));
        assert_eq!(
            store.value.lock().unwrap().as_ref().unwrap().attempt_state,
            AttemptState::Attempted
        );
        assert_eq!(
            dropped.bodies.lock().unwrap().as_slice(),
            &[request.canonical_json().unwrap()]
        );

        let replay = SequenceTransport::new(vec![Ok(fixture_response())]);
        let view = consume_pending_with(
            &state,
            &store,
            &replay,
            &AtomicLicenseSnapshotStore,
            &fixture_config(),
            parse_iso_ms("2026-07-27T12:06:05.000Z").unwrap(),
        )
        .expect("same request replays to success");
        assert_eq!(view.state, "activated");
        assert!(store.value.lock().unwrap().is_none());
        assert_eq!(
            replay.bodies.lock().unwrap().as_slice(),
            &[request.canonical_json().unwrap()]
        );
        assert!(license_file_path(&temp_dir).exists());
        std::fs::remove_dir_all(&temp_dir).unwrap();
    }

    #[test]
    fn license_atomic_replace_readback_failure_retains_attempted_journal() {
        let temp_dir = std::env::temp_dir().join(format!(
            "creatoros-t575-license-readback-{}-{}",
            std::process::id(),
            rand::random::<u64>()
        ));
        std::fs::create_dir_all(&temp_dir).unwrap();
        let state = test_license_state(temp_dir.clone());
        let store = MemoryJournal::default();
        prepare_journal(
            &store,
            ConsumeRequest::fixture(),
            "2026-07-27T12:15:00.000Z",
        )
        .unwrap();
        let transport = SequenceTransport::new(vec![Ok(fixture_response())]);

        let error = consume_pending_with(
            &state,
            &store,
            &transport,
            &RejectingSnapshotStore,
            &fixture_config(),
            parse_iso_ms("2026-07-27T12:06:05.000Z").unwrap(),
        )
        .expect_err("readback failure cannot clean the recovery journal");
        assert_eq!(error, "模拟 .license 原子替换后读回失败");
        assert_eq!(
            store.value.lock().unwrap().as_ref().unwrap().attempt_state,
            AttemptState::Attempted
        );
        assert_eq!(*store.deletes.lock().unwrap(), 0);
        assert!(!license_file_path(&temp_dir).exists());
        std::fs::remove_dir_all(&temp_dir).unwrap();
    }

    /// 非 fixture 的 Growth→AM live HTTPS 联调入口。
    ///
    /// 默认 ignored，不读取生产密钥，也不把 claimToken/deviceSecret 打到输出。执行者只需在
    /// 自托管 macOS/Windows runner 配置真实 origin、公钥和一个可领取的测试 entitlement，
    /// 然后按 stdout 的 userCode 在 Growth 登录页完成人工确认：
    ///
    /// `CREATOROS_T575_LIVE_E2E=1 GROWTH_ENTITLEMENT_API_ORIGIN=https://... \
    ///  CREATOROS_LICENSE_BASE_URL=https://... CREATOROS_LICENSE_PUBLIC_KEY_B64=... \
    ///  cargo test live_https_growth_to_am_non_fixture_harness -- --ignored --nocapture`
    #[test]
    #[ignore = "需要真实 Growth/AM HTTPS、测试 entitlement 与人工 owner 确认"]
    fn live_https_growth_to_am_non_fixture_harness() {
        assert_eq!(
            std::env::var("CREATOROS_T575_LIVE_E2E").as_deref(),
            Ok("1"),
            "必须显式设置 CREATOROS_T575_LIVE_E2E=1"
        );
        let growth = growth_origin().expect("real Growth HTTPS origin");
        assert!(
            !growth
                .host_str()
                .unwrap_or_default()
                .ends_with("example.com"),
            "live harness 禁止 example.com/fixture origin"
        );
        let machine_id = std::env::var("CREATOROS_T575_LIVE_MACHINE_ID")
            .unwrap_or_else(|_| format!("creatoros-live-harness-{}", random_uuid()));
        let config = LicenseConfig::from_env(machine_id.clone());
        assert!(
            !config.base_url.contains("example.com"),
            "live harness 禁止 example.com/fixture AM"
        );
        resolve_public_key(&config.public_key_b64).expect("real AM Ed25519 public key");

        let verifier = random_base64url(32);
        let challenge = base64::engine::general_purpose::URL_SAFE_NO_PAD
            .encode(Sha256::digest(verifier.as_bytes()));
        let create_body = serde_json_canonicalizer::to_string(&serde_json::json!({
            "client": "creatoros",
            "codeChallenge": challenge,
            "codeChallengeMethod": "S256",
        }))
        .unwrap();
        let created = post_json(&growth.join(CREATE_PATH).unwrap(), &create_body)
            .expect("Growth API-210 live response");
        assert_eq!(created.status, 201, "Growth API-210 must create a session");
        let created = parse_create_response(&created.body).expect("closed API-210 response");
        let verification = url::Url::parse(&created.verification_url).unwrap();
        assert_eq!(verification.origin(), growth.origin());
        println!(
            "T-575 live：请在 {} 输入验证码 {}（仅 userCode 可展示）",
            created.verification_url, created.user_code
        );

        let deadline = current_ms() + 10 * 60 * 1_000;
        let launch = loop {
            assert!(current_ms() < deadline, "十分钟内未完成 Growth owner 确认");
            std::thread::sleep(Duration::from_secs(created.poll_interval_seconds));
            let poll_body = Zeroizing::new(
                serde_json_canonicalizer::to_string(&serde_json::json!({
                    "deviceSecret": created.device_secret.as_str(),
                    "codeVerifier": verifier.as_str(),
                }))
                .unwrap(),
            );
            let response = post_json(&growth.join(POLL_PATH).unwrap(), poll_body.as_str())
                .expect("Growth API-212 live response");
            if response.status == 429 {
                std::thread::sleep(Duration::from_secs(
                    response
                        .retry_after_seconds
                        .unwrap_or(created.poll_interval_seconds),
                ));
                continue;
            }
            match parse_poll_response(response.status, &response.body)
                .expect("closed API-212 response")
            {
                PollResponse::Pending(_) => continue,
                PollResponse::Approved(value) => break value,
            }
        };

        let temp_dir = std::env::temp_dir().join(format!(
            "creatoros-t575-live-{}-{}",
            std::process::id(),
            rand::random::<u64>()
        ));
        std::fs::create_dir_all(&temp_dir).unwrap();
        let state = test_license_state(temp_dir.clone());
        let account = format!("live-harness-{}", random_uuid());
        let journal = ProtectedCredentialJournal::new(NativeCredentialBackend::new(
            "com.creatoros.desktop.entitlement-consume.live-test",
            account,
        ));
        let request = ConsumeRequest {
            contract_version: CONTRACT_VERSION.to_string(),
            claim_token: launch.claim_token,
            project_key: config.project_key.clone(),
            machine_id: config.machine_id.clone(),
            request_id: random_uuid(),
            nonce: random_base64url(24),
        };
        prepare_journal(&journal, request, &launch.expires_at)
            .expect("OS protected journal write/readback");
        let view = consume_pending_with(
            &state,
            &journal,
            &HttpsConsumeTransport,
            &AtomicLicenseSnapshotStore,
            &config,
            current_ms(),
        )
        .expect("live AM exact consume");
        assert_eq!(view.state, "activated");
        assert!(journal.load().unwrap().is_none());

        let key = derive_license_key(
            state
                .0
                .master_key_b64
                .as_deref()
                .expect("ephemeral harness master key"),
        )
        .unwrap();
        let snapshot = read_snapshot_file(&license_file_path(&temp_dir), Some(&key))
            .expect("live .license atomic replace/readback");
        assert!(snapshot.allowed && snapshot.signature_verified);
        assert_ne!(snapshot.code, "TEST-ONLY-NOT-A-LICENSE");
        assert_eq!(snapshot.project_key, config.project_key);
        assert_eq!(snapshot.machine_id, config.machine_id);
        std::fs::remove_dir_all(&temp_dir).unwrap();
    }

    #[test]
    fn final_am_fixture_verifies_raw_digest_signature_and_closed_success() {
        let fixture: serde_json::Value = serde_json::from_str(include_str!(
            "../../../docs/contracts/fixtures/growth-entitlement-delivery-v1.vector.json"
        ))
        .expect("fixture json");
        let signed = &fixture["consume"]["signedSuccess"];
        let response = LicenseHttpResponse {
            status: 200,
            signature: signed["signature"].as_str().map(str::to_string),
            date: signed["date"].as_str().map(str::to_string),
            digest: signed["digest"].as_str().map(str::to_string),
            body: signed["rawBody"].as_str().unwrap().as_bytes().to_vec(),
        };
        let config = LicenseConfig {
            base_url: "https://license.example.com".to_string(),
            project_key: "creatoros".to_string(),
            strict_verify: true,
            public_key_b64: fixture["testKeys"]["licenseSigningPublicKeyRawBase64"]
                .as_str()
                .unwrap()
                .to_string(),
            machine_id: "device-opaque-id".to_string(),
        };
        verify_signed_response(
            &response,
            &config,
            parse_iso_ms("2026-07-27T12:06:05.000Z").unwrap(),
        )
        .expect("fixture signature");
        let success = parse_consume_success(&response.body).expect("closed success");
        assert_eq!(success.request_id, ConsumeRequest::fixture().request_id);
        assert_eq!(success.data.project_key, "creatoros");
    }

    #[test]
    fn final_am_domain_error_is_signed_closed_and_bound_to_exact_request() {
        let fixture: serde_json::Value = serde_json::from_str(include_str!(
            "../../../docs/contracts/fixtures/growth-entitlement-delivery-v1.vector.json"
        ))
        .expect("fixture json");
        let signed = &fixture["consume"]["signedDomainError"];
        let response = LicenseHttpResponse {
            status: 422,
            signature: signed["signature"].as_str().map(str::to_string),
            date: signed["date"].as_str().map(str::to_string),
            digest: signed["digest"].as_str().map(str::to_string),
            body: signed["rawBody"].as_str().unwrap().as_bytes().to_vec(),
        };
        let config = LicenseConfig {
            base_url: "https://license.example.com".to_string(),
            project_key: "creatoros".to_string(),
            strict_verify: true,
            public_key_b64: fixture["testKeys"]["licenseSigningPublicKeyRawBase64"]
                .as_str()
                .unwrap()
                .to_string(),
            machine_id: "device-opaque-id".to_string(),
        };
        verify_signed_response(
            &response,
            &config,
            parse_iso_ms("2026-07-27T12:05:35.000Z").unwrap(),
        )
        .expect("fixture signature");
        let error = parse_consume_error(&response.body).expect("closed domain error");
        let request = ConsumeRequest::fixture();
        assert!(!error.success);
        assert_eq!(
            error.request_id.as_deref(),
            Some(request.request_id.as_str())
        );
        assert_eq!(error.nonce.as_deref(), Some(request.nonce.as_str()));
        assert_eq!(error.error.code, "CLAIM_INVALID");
        assert_eq!(
            error_journal_action(&error.error.code),
            ErrorJournalAction::DeleteRestart
        );
    }

    #[test]
    fn claim_view_serialization_never_exposes_native_secrets() {
        let view = safe_view(
            "awaitingApproval",
            Some("ABCD-EFGH".to_string()),
            Some("https://growth.example.com/claim".to_string()),
            Some("2026-07-27T12:15:00.000Z".to_string()),
            Some(5),
            "请在网页确认领取",
        );
        let serialized = serde_json::to_string(&view).expect("serialize safe view");
        assert!(serialized.contains("ABCD-EFGH"));
        for forbidden in [
            "claimToken",
            "deviceSecret",
            "codeVerifier",
            "activationCode",
            "machineId",
            "requestId",
            "nonce",
        ] {
            assert!(
                !serialized.contains(forbidden),
                "{forbidden} leaked into IPC"
            );
        }
    }

    #[test]
    fn signed_success_is_atomically_persisted_and_read_back_before_cleanup() {
        let fixture: serde_json::Value = serde_json::from_str(include_str!(
            "../../../docs/contracts/fixtures/growth-entitlement-delivery-v1.vector.json"
        ))
        .unwrap();
        let raw = fixture["consume"]["signedSuccess"]["rawBody"]
            .as_str()
            .unwrap();
        let success = parse_consume_success(raw.as_bytes()).unwrap();
        let request = ConsumeRequest::fixture();
        let temp_dir = std::env::temp_dir().join(format!(
            "creatoros-t575-license-{}-{}",
            std::process::id(),
            rand::random::<u64>()
        ));
        std::fs::create_dir_all(&temp_dir).unwrap();
        let master_key_b64 = base64::engine::general_purpose::STANDARD.encode([7_u8; 32]);
        let state = LicenseState(Arc::new(ShellLicenseCtx {
            app_data_dir: temp_dir.clone(),
            machine_id: request.machine_id.clone(),
            master_key_b64: Some(master_key_b64.clone()),
            handshake_token: "test-handshake".to_string(),
            sidecar_port: 0,
            chain_lock: Mutex::new(()),
            session: SessionMonotonic::new(),
            last_decision: Mutex::new(None),
            app_handle: None,
        }));

        persist_success_with(&state, &request, success, &AtomicLicenseSnapshotStore)
            .expect("persist signed license");
        let key = derive_license_key(&master_key_b64).unwrap();
        let readback =
            read_snapshot_file(&license_file_path(&temp_dir), Some(&key)).expect("read license");
        assert!(readback.allowed);
        assert!(readback.signature_verified);
        assert_eq!(readback.project_key, request.project_key);
        assert_eq!(readback.machine_id, request.machine_id);
        assert_eq!(readback.code, "TEST-ONLY-NOT-A-LICENSE");

        std::fs::remove_dir_all(&temp_dir).unwrap();
    }

    #[test]
    fn consume_success_requires_every_closed_key() {
        let fixture: serde_json::Value = serde_json::from_str(include_str!(
            "../../../docs/contracts/fixtures/growth-entitlement-delivery-v1.vector.json"
        ))
        .unwrap();
        let raw = fixture["consume"]["signedSuccess"]["rawBody"]
            .as_str()
            .unwrap();
        let mut value: serde_json::Value = serde_json::from_str(raw).unwrap();
        value["data"]
            .as_object_mut()
            .unwrap()
            .remove("channelConfig");
        assert!(parse_consume_success(serde_json::to_string(&value).unwrap().as_bytes()).is_err());

        let mut extra: serde_json::Value = serde_json::from_str(raw).unwrap();
        extra["data"]["license"]["authority"] = serde_json::json!("creator");
        assert!(parse_consume_success(serde_json::to_string(&extra).unwrap().as_bytes()).is_err());
    }

    #[test]
    fn attempted_journal_cleanup_matches_final_contract_state_table() {
        assert_eq!(
            error_journal_action("CLAIM_INVALID"),
            ErrorJournalAction::DeleteRestart
        );
        assert_eq!(
            error_journal_action("CLAIM_EXPIRED"),
            ErrorJournalAction::DeleteRestart
        );
        assert_eq!(
            error_journal_action("CLAIM_REVOKED"),
            ErrorJournalAction::DeleteRevoked
        );
        for retained in [
            "CLAIM_ALREADY_CONSUMED",
            "CLAIM_IDEMPOTENCY_MISMATCH",
            "INVALID_REQUEST",
            "UNKNOWN",
        ] {
            assert_eq!(error_journal_action(retained), ErrorJournalAction::Retain);
        }
    }
}
