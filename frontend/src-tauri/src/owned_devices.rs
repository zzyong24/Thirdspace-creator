//! T-1072：本人产品设备连接。秘密只在原生内存和独立 OS 凭据库中保管。
use crate::license::{
    self, LicenseClock, LicenseConfig, LicenseHttp, LicenseHttpResponse, LicenseSnapshot,
    LicenseState,
};
use base64::Engine as _;
use rand::RngCore as _;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    io::Read,
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        Mutex, OnceLock,
    },
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use zeroize::{Zeroize, Zeroizing};

const GROWTH: &str = "https://growth.aitongban.cloud";
const ACTIVITY: &str = "https://license.aitongban.cloud";
const CREATE: &str = "/api/license-device-connect-sessions";
const POLL: &str = "/api/license-device-connect-sessions/poll";
const ACK: &str = "/api/license-device-connect-sessions/ack";
const TICKET: &str = "/api/license/client-config-tickets";
const MAX_BODY: u64 = 65_536;
const JOURNAL_SERVICE: &str = "com.creatoros.desktop.owned-devices";
const JOURNAL_ACCOUNT: &str = "pending-v1";
static SESSION: OnceLock<Mutex<Option<Journal>>> = OnceLock::new();
static IN_FLIGHT: AtomicBool = AtomicBool::new(false);
static GENERATION: AtomicU64 = AtomicU64::new(0);
fn session() -> &'static Mutex<Option<Journal>> {
    SESSION.get_or_init(|| Mutex::new(None))
}
fn now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}
fn random() -> String {
    let mut bytes = [0; 32];
    rand::rngs::OsRng.fill_bytes(&mut bytes);
    let result = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(bytes);
    bytes.zeroize();
    result
}
fn digest(raw: &str) -> String {
    format!("sha256:{:x}", Sha256::digest(raw.as_bytes()))
}
fn error(message: &str) -> String {
    message.to_string()
}
fn iso_ms(ms: i64) -> String {
    let seconds = license::format_iso_ms(ms);
    format!(
        "{}.{:03}Z",
        seconds.trim_end_matches('Z'),
        ms.rem_euclid(1000)
    )
}
fn canonical_time(raw: &str) -> Option<i64> {
    let ms = license::parse_iso_ms(raw)?;
    (raw.len() == 24 && iso_ms(ms) == raw).then_some(ms)
}
fn valid_hash(raw: &str) -> bool {
    raw.len() == 71
        && raw.starts_with("sha256:")
        && raw[7..]
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}
fn ulid(raw: &str) -> bool {
    raw.len() == 26
        && raw.as_bytes()[0] <= b'7'
        && raw
            .bytes()
            .all(|b| b"0123456789ABCDEFGHJKMNPQRSTVWXYZ".contains(&b))
}
fn user_code(raw: &str) -> Option<String> {
    let compact = raw.replace('-', "");
    if compact.len() != 8
        || !compact
            .bytes()
            .all(|b| b"0123456789ABCDEFGHJKMNPQRSTVWXYZ".contains(&b))
    {
        return None;
    }
    Some(format!("{}-{}", &compact[..4], &compact[4..]))
}
fn verification_url(raw: &str, code: &str) -> Result<String, String> {
    let url = url::Url::parse(raw).map_err(|_| error("官方确认地址无效，请重新连接"))?;
    if url.origin().ascii_serialization() != GROWTH
        || url.path() != "/products/connect"
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || !matches!(url.fragment(), Some(fragment) if fragment == format!("code={code}") || fragment == format!("code={}", code.replace('-', "")))
    {
        return Err(error("官方确认地址未通过安全核对，请重新连接"));
    }
    Ok(url.to_string())
}

#[derive(Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Journal {
    integrity: String,
    schema_version: u32,
    intent: String,
    registration_ref: String,
    device_secret: String,
    code_verifier: String,
    activation_code: Option<String>,
    user_code: String,
    verification_url: String,
    expires_at: String,
    retry_after_seconds: u64,
    next_poll_at: i64,
    binding: String,
    // 在首次替换文件之前持久化候选摘要；重启后能识别已完成替换而未收到回执。
    saved_snapshot_hash: Option<String>,
    committed: bool,
}
impl Drop for Journal {
    fn drop(&mut self) {
        self.device_secret.zeroize();
        self.code_verifier.zeroize();
        if let Some(code) = &mut self.activation_code {
            code.zeroize();
        }
    }
}
fn seal(j: &Journal) -> String {
    let mut clone = j.clone();
    clone.integrity.clear();
    let raw = Zeroizing::new(serde_json::to_string(&clone).unwrap_or_default());
    digest(&raw)
}
fn binding(cfg: &LicenseConfig, registration_ref: &str) -> String {
    digest(&format!(
        "creator-owned-device-v1\n{}\n{}\n{}",
        cfg.project_key, cfg.machine_id, registration_ref
    ))
}
trait JournalStore {
    fn load(&self) -> Result<Option<Journal>, String>;
    fn save(&self, journal: &Journal) -> Result<(), String>;
    fn delete(&self) -> Result<(), String>;
}
struct Keychain;
impl Keychain {
    fn entry(&self) -> Result<keyring::Entry, String> {
        keyring::Entry::new(JOURNAL_SERVICE, JOURNAL_ACCOUNT)
            .map_err(|_| error("系统凭据库暂不可用，请解锁系统后重试"))
    }
}
impl JournalStore for Keychain {
    fn load(&self) -> Result<Option<Journal>, String> {
        match self.entry()?.get_password() {
            Ok(raw) => {
                let raw = Zeroizing::new(raw);
                if raw.len() as u64 > MAX_BODY {
                    return Err(error("上次连接记录过大，请取消后重新连接"));
                }
                serde_json::from_str(&raw)
                    .map(Some)
                    .map_err(|_| error("上次连接记录无法读取，请取消后重新连接"))
            }
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(_) => Err(error("无法读取系统凭据库，请解锁系统后重试")),
        }
    }
    fn save(&self, journal: &Journal) -> Result<(), String> {
        let raw =
            Zeroizing::new(serde_json::to_string(journal).map_err(|_| error("连接记录无法保存"))?);
        self.entry()?
            .set_password(&raw)
            .map_err(|_| error("连接记录未能安全保存，请解锁系统后重试"))?;
        if self.load()?.as_ref() != Some(journal) {
            return Err(error("连接记录保存后无法核对，请重试"));
        }
        Ok(())
    }
    fn delete(&self) -> Result<(), String> {
        match self.entry()?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(_) => Err(error("连接记录未能清除，请解锁系统后再次取消")),
        }
    }
}
fn validate_journal(j: &Journal, cfg: &LicenseConfig) -> Result<(), String> {
    if j.integrity != seal(j)
        || j.schema_version != 1
        || !matches!(j.intent.as_str(), "link_owner" | "register_device")
        || !ulid(&j.registration_ref)
        || j.binding != binding(cfg, &j.registration_ref)
        || !(43..=128).contains(&j.code_verifier.len())
        || j.device_secret.len() < 32
        || j.device_secret.len() > 256
        || canonical_time(&j.expires_at).is_none()
        || !(1..=120).contains(&j.retry_after_seconds)
        || user_code(&j.user_code).as_deref() != Some(j.user_code.as_str())
    {
        return Err(error("上次连接不属于当前电脑，请取消后重新连接"));
    }
    verification_url(&j.verification_url, &j.user_code)?;
    if j.saved_snapshot_hash
        .as_deref()
        .is_some_and(|h| !valid_hash(h))
    {
        return Err(error("上次保存记录无法核对，请取消后重新连接"));
    }
    Ok(())
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct View {
    state: &'static str,
    intent: Option<String>,
    user_code: Option<String>,
    verification_url: Option<String>,
    expires_at: Option<String>,
    retry_after_seconds: Option<u64>,
    message: String,
}
fn view(state: &'static str, j: Option<&Journal>, message: &str) -> View {
    let waiting = state == "waiting";
    View {
        state,
        intent: j.map(|j| j.intent.clone()),
        user_code: waiting.then(|| j.unwrap().user_code.clone()),
        verification_url: waiting.then(|| j.unwrap().verification_url.clone()),
        expires_at: waiting.then(|| j.unwrap().expires_at.clone()),
        retry_after_seconds: waiting.then(|| j.unwrap().retry_after_seconds),
        message: message.to_string(),
    }
}
fn enabled() -> bool {
    let baked = option_env!("CREATOROS_BUILTIN_OWNED_DEVICES_ENABLED").unwrap_or("0");
    if cfg!(debug_assertions) {
        std::env::var("CREATOROS_OWNED_DEVICES_ENABLED")
            .ok()
            .map(|v| v == "1")
            .unwrap_or(baked == "1")
    } else {
        baked == "1"
    }
}
fn config(state: &LicenseState) -> Result<LicenseConfig, String> {
    let mut cfg = LicenseConfig::from_env(state.0.machine_id.clone());
    cfg.strict_verify = true;
    if cfg.base_url.trim_end_matches('/') != ACTIVITY || cfg.project_key.is_empty() {
        return Err(error(
            "软件包的授权服务配置无法核对，请使用官方提供的安装包",
        ));
    }
    Ok(cfg)
}
struct Flight {
    generation: u64,
}
impl Flight {
    fn begin() -> Result<Self, String> {
        IN_FLIGHT
            .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
            .map_err(|_| error("正在处理上一次操作，请稍候"))?;
        Ok(Self {
            generation: GENERATION.load(Ordering::SeqCst),
        })
    }
    fn current(&self) -> Result<(), String> {
        if self.generation == GENERATION.load(Ordering::SeqCst) {
            Ok(())
        } else {
            Err(error("这次连接已取消，结果不会写入本机"))
        }
    }
}
impl Drop for Flight {
    fn drop(&mut self) {
        IN_FLIGHT.store(false, Ordering::SeqCst);
    }
}
struct Http;
struct Response {
    signed: LicenseHttpResponse,
    retry_after: Option<u64>,
}
trait Transport {
    fn post(
        &self,
        origin: &str,
        path: &str,
        body: &str,
        bearer: Option<&str>,
    ) -> Result<Response, String>;
}
impl Transport for Http {
    fn post(
        &self,
        origin: &str,
        path: &str,
        body: &str,
        bearer: Option<&str>,
    ) -> Result<Response, String> {
        if ![GROWTH, ACTIVITY].contains(&origin)
            || ![
                CREATE,
                POLL,
                ACK,
                TICKET,
                "/api/license/activate",
                "/api/license/status",
            ]
            .contains(&path)
        {
            return Err(error("连接服务地址未通过安全核对"));
        }
        let client = reqwest::blocking::Client::builder()
            .timeout(Duration::from_secs(120))
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .map_err(|_| error("无法建立安全网络连接"))?;
        let mut request = client
            .post(format!("{origin}{path}"))
            .header("content-type", "application/json")
            .header("accept", "application/json")
            .body(body.to_string());
        if let Some(token) = bearer {
            request = request.bearer_auth(token);
        }
        let response = request
            .send()
            .map_err(|_| error("网络连接未完成，请保留这次连接并重试"))?;
        let headers = response.headers();
        let header = |name: &str| {
            headers
                .get(name)
                .and_then(|v| v.to_str().ok())
                .map(str::to_string)
        };
        if headers.get("location").is_some()
            || !header("content-type")
                .unwrap_or_default()
                .to_ascii_lowercase()
                .starts_with("application/json")
            || !header("cache-control")
                .unwrap_or_default()
                .split(',')
                .any(|s| s.trim().eq_ignore_ascii_case("no-store"))
        {
            return Err(error("服务响应未通过安全核对，请稍后重试"));
        }
        let status = response.status().as_u16();
        let signature = header("x-license-signature");
        let date = header("x-license-date");
        let digest = header("x-license-digest");
        let retry_after = header("retry-after")
            .and_then(|v| v.parse().ok())
            .filter(|v| (1..=120).contains(v));
        let mut body = Vec::new();
        response
            .take(MAX_BODY + 1)
            .read_to_end(&mut body)
            .map_err(|_| error("读取连接结果失败，请继续这次连接"))?;
        if body.len() as u64 > MAX_BODY {
            return Err(error("服务响应过大，无法安全处理"));
        }
        Ok(Response {
            signed: LicenseHttpResponse {
                status,
                signature,
                date,
                digest,
                body,
            },
            retry_after,
        })
    }
}
impl LicenseHttp for Http {
    fn post(&self, url: &str, body: &str) -> Result<LicenseHttpResponse, String> {
        let url = url::Url::parse(url).map_err(|_| error("授权地址无效"))?;
        if url.origin().ascii_serialization() != ACTIVITY
            || url.query().is_some()
            || url.fragment().is_some()
        {
            return Err(error("授权地址无效"));
        }
        Ok(Transport::post(self, ACTIVITY, url.path(), body, None)?.signed)
    }
}
struct Clock;
impl LicenseClock for Clock {
    fn wall_ms(&self) -> i64 {
        now()
    }
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Created {
    registration_ref: String,
    device_secret: String,
    user_code: String,
    verification_url: String,
    expires_at: String,
    poll_interval_seconds: u64,
}
impl Drop for Created {
    fn drop(&mut self) {
        self.device_secret.zeroize();
    }
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Ready {
    status: String,
    credential_mode: String,
    activation_endpoint: String,
    project_key: String,
    product_ref: String,
    expected_channel_ref: String,
    expected_authorization_ref_hash: String,
    registered_device_ref: String,
    device_state_version: u64,
    authorization_version: u64,
    activated_at: String,
    #[serde(deserialize_with = "required_nullable")]
    license_expires_at: Option<String>,
    expires_at: String,
    #[serde(default, deserialize_with = "present_code")]
    activation_code: Option<String>,
}
fn required_nullable<'de, D: serde::Deserializer<'de>>(d: D) -> Result<Option<String>, D::Error> {
    Option::<String>::deserialize(d)
}
fn present_code<'de, D: serde::Deserializer<'de>>(d: D) -> Result<Option<String>, D::Error> {
    String::deserialize(d).map(Some)
}
impl Drop for Ready {
    fn drop(&mut self) {
        if let Some(code) = &mut self.activation_code {
            code.zeroize();
        }
    }
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Pending {
    status: String,
    expires_at: String,
    retry_after_seconds: u64,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Status {
    status: String,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Failure {
    error: FailureDetail,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct FailureDetail {
    code: String,
    message: String,
}
fn parse<T: for<'de> Deserialize<'de>>(raw: &[u8]) -> Result<T, String> {
    serde_json::from_slice(raw)
        .map_err(|_| error("服务返回的连接结果无法核对，请继续重试或联系服务方"))
}
fn check_response(response: &Response) -> Result<Option<&str>, String> {
    if response.signed.status == 200 {
        return Ok(None);
    }
    let failure: Failure = parse(&response.signed.body)?;
    let _ = &failure.error.message; // 服务端技术文案不跨 IPC。
    match (response.signed.status, failure.error.code.as_str()) {
        (410, "LICENSE_CONNECT_EXPIRED" | "LICENSE_CONNECT_CONSUMED") => Ok(Some("expired")),
        (409, "LICENSE_CONNECT_DENIED") => Err(error(
            "这次确认已失效，产品归属或设备可能已变更。请取消后重新确认",
        )),
        (403, "LICENSE_CONNECT_CREDENTIALS_INVALID") => {
            Err(error("连接凭据无法核对，请取消后重新连接"))
        }
        (429, "LICENSE_CONNECT_SLOW_DOWN") => Ok(Some("slow")),
        (503, "LICENSE_DEVICE_PROVIDER_UNAVAILABLE") => {
            Err(error("授权服务暂不可用，请保留这次连接并稍后重试"))
        }
        _ => Err(error("连接没有完成，请保留这次连接并重试")),
    }
}
fn validate_ready(r: &Ready, j: &Journal, cfg: &LicenseConfig) -> Result<(), String> {
    if r.status != "ready"
        || r.project_key != cfg.project_key
        || r.product_ref != crate::product_identity::product_ref()
        || r.activation_endpoint != "/api/license/activate"
        || r.expected_channel_ref.is_empty()
        || r.expected_channel_ref.len() > 160
        || !valid_hash(&r.expected_authorization_ref_hash)
        || !ulid(&r.registered_device_ref)
        || r.device_state_version == 0
        || r.authorization_version == 0
        || r.expires_at != j.expires_at
        || canonical_time(&r.activated_at).is_none()
        || r.license_expires_at
            .as_deref()
            .is_some_and(|v| canonical_time(v).is_none_or(|ms| ms <= now()))
        || !matches!((r.credential_mode.as_str(), r.activation_code.as_deref()), ("server_delivered", Some(code)) if !code.is_empty() && code.len() <= 256)
            && !matches!(
                (r.credential_mode.as_str(), r.activation_code.as_deref()),
                ("client_supplied", None)
            )
    {
        return Err(error("批准的产品或有效期无法核对，请重新确认本人产品"));
    }
    Ok(())
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct TicketWire {
    contract_version: String,
    config_access_ticket: String,
    expires_at: String,
    nonce: String,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct TicketHeader {
    alg: String,
    kid: String,
    typ: String,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Claims {
    contract_version: String,
    issuer: String,
    audience: String,
    scope: String,
    project_key: String,
    channel_ref: String,
    entitlement_binding_hash: String,
    authorization_ref_hash: String,
    activation_unit_kind: String,
    authorization_version: u64,
    jti: String,
    issued_at: String,
    expires_at: String,
}
fn signed_ticket(
    transport: &dyn Transport,
    cfg: &LicenseConfig,
    code: &str,
    clock_ms: i64,
) -> Result<(Zeroizing<String>, Claims), String> {
    let nonce = random();
    let body = Zeroizing::new(serde_json::json!({"contractVersion":"config-access-ticket-v3", "projectKey":cfg.project_key, "code":code, "machineId":cfg.machine_id, "nonce":nonce}).to_string());
    let response = transport.post(ACTIVITY, TICKET, &body, None)?.signed;
    let key = license::resolve_public_key(&cfg.public_key_b64)
        .map_err(|_| error("软件包的授权校验暂不可用，请使用正式安装包"))?;
    license::verify_response_signature(
        &key,
        "post /api/license/client-config-tickets",
        "license.aitongban.cloud",
        &response,
    )
    .map_err(|_| error("授权票据未通过签名核对，请重试"))?;
    let date = response
        .date
        .as_deref()
        .and_then(|s| httpdate::parse_http_date(s).ok())
        .and_then(|d| d.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as i64)
        .ok_or_else(|| error("授权时间无法核对"))?;
    if (date - clock_ms).abs() > 300_000 || response.status != 200 {
        return Err(error("授权时间或设备状态无法核对，请检查系统时间后重试"));
    }
    let wire: TicketWire = parse(&response.body)?;
    if wire.contract_version != "config-access-ticket-v3" || wire.nonce != nonce {
        return Err(error("授权票据已变化，请继续这次连接重试"));
    }
    let parts: Vec<_> = wire.config_access_ticket.split('.').collect();
    if parts.len() != 3 {
        return Err(error("授权票据无法核对"));
    }
    let decode = |s: &str| {
        base64::engine::general_purpose::URL_SAFE_NO_PAD
            .decode(s)
            .map_err(|_| error("授权票据无法核对"))
    };
    let header: TicketHeader = parse(&decode(parts[0])?)?;
    if header.alg != "EdDSA"
        || header.typ != "TS-CLIENT-CONFIG-TICKET"
        || header.kid.is_empty()
        || header.kid.len() > 128
        || !header
            .kid
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"._:-".contains(&b))
        || decode(parts[2])?.len() != 64
    {
        return Err(error("授权票据签名格式无法核对"));
    }
    // 外层签名核对原始字节后，额外验同钥 JWS：AM uses loadLicenseSigningPrivateKey。
    let signature = ed25519_dalek::Signature::from_slice(&decode(parts[2])?)
        .map_err(|_| error("授权票据签名无法核对"))?;
    use ed25519_dalek::Verifier as _;
    key.verify(format!("{}.{}", parts[0], parts[1]).as_bytes(), &signature)
        .map_err(|_| error("授权票据签名无法核对"))?;
    let claims: Claims = parse(&decode(parts[1])?)?;
    let issued = canonical_time(&claims.issued_at).ok_or_else(|| error("授权票据时间无法核对"))?;
    let expires =
        canonical_time(&claims.expires_at).ok_or_else(|| error("授权票据时间无法核对"))?;
    if claims.contract_version != "config-access-ticket-v3"
        || claims.issuer != "activation-manager"
        || claims.audience != "config.pull"
        || claims.scope != "client-config:read"
        || claims.project_key != cfg.project_key
        || claims.channel_ref.is_empty()
        || !valid_hash(&claims.authorization_ref_hash)
        || !valid_hash(&claims.entitlement_binding_hash)
        || claims.authorization_version == 0
        || !ulid(&claims.jti)
        || issued > clock_ms + 30_000
        || expires <= clock_ms
        || expires <= issued
        || expires - issued > 300_000
        || wire.expires_at != claims.expires_at
    {
        return Err(error("授权票据的产品或有效期无法核对"));
    }
    Ok((Zeroizing::new(wire.config_access_ticket), claims))
}
fn candidate(
    ready: &Ready,
    j: &Journal,
    cfg: &LicenseConfig,
    http: &dyn LicenseHttp,
    ticket_http: &dyn Transport,
    clock: &dyn LicenseClock,
) -> Result<LicenseSnapshot, String> {
    validate_ready(ready, j, cfg)?;
    let code = ready
        .activation_code
        .as_deref()
        .or(j.activation_code.as_deref())
        .ok_or_else(|| error("请取消后填写原激活码，再连接本人产品"))?;
    let deps = license::ChainDeps {
        config: cfg,
        http,
        clock,
        points: &[],
    };
    let result = license::run_license_chain(&deps, license::LicenseOp::Activate { code }, None);
    let mut snapshot = result
        .snapshot
        .filter(|s| s.allowed && s.signature_verified && !s.revoked && !s.updates_blocked)
        .ok_or_else(|| error("软件尚未完成授权核对，请保留连接后重试"))?;
    if snapshot.license_mode != "TIME"
        || snapshot.project_key != ready.project_key
        || snapshot.channel_ref.as_deref() != Some(&ready.expected_channel_ref)
        || snapshot.expires_at != ready.license_expires_at
        || snapshot.code != code
        || snapshot.machine_id != cfg.machine_id
    {
        return Err(error("本机授权与批准的产品或原有效期不一致，请重新确认"));
    }
    let (_, claims) = signed_ticket(ticket_http, cfg, &snapshot.code, clock.wall_ms())?;
    if claims.authorization_ref_hash != ready.expected_authorization_ref_hash
        || claims.entitlement_binding_hash != ready.expected_authorization_ref_hash
        || claims.channel_ref != ready.expected_channel_ref
        || claims.activation_unit_kind != "channel_plan"
        || claims.authorization_version != ready.authorization_version
    {
        return Err(error("本机授权不属于刚才批准的产品，请重新确认本人产品"));
    }
    snapshot.activated_at = ready.activated_at.clone();
    Ok(snapshot)
}
// 心跳可合法更新 lastSeen/runtime/message；保存回执身份只绑定不可变授权字段。
fn snapshot_hash(s: &LicenseSnapshot) -> String {
    let raw = Zeroizing::new(serde_json::json!({"v":s.v,"code":s.code,"machineId":s.machine_id,"projectKey":s.project_key,"channelRef":s.channel_ref,"licenseMode":s.license_mode,"expiresAt":s.expires_at,"activatedAt":s.activated_at}).to_string());
    digest(&raw)
}
trait SnapshotStore {
    fn read(&self) -> Option<LicenseSnapshot>;
    fn write(&self, value: &LicenseSnapshot) -> Result<(), String>;
}
struct Disk<'a> {
    state: &'a LicenseState,
    key: [u8; 32],
}
impl Drop for Disk<'_> {
    fn drop(&mut self) {
        self.key.zeroize();
    }
}
impl SnapshotStore for Disk<'_> {
    fn read(&self) -> Option<LicenseSnapshot> {
        license::read_snapshot_file(
            &license::license_file_path(&self.state.0.app_data_dir),
            Some(&self.key),
        )
    }
    fn write(&self, value: &LicenseSnapshot) -> Result<(), String> {
        license::write_snapshot_file_checked(
            &license::license_file_path(&self.state.0.app_data_dir),
            value,
            Some(&self.key),
        )
    }
}
// checked write 的 Err 可能发生在 replace 后：始终回读权威文件再决定恢复。
fn save_candidate(store: &dyn SnapshotStore, value: &LicenseSnapshot) -> Result<(), String> {
    let old = store.read();
    let result = store.write(value);
    let actual = store.read();
    if actual.as_ref() == Some(value) {
        return Ok(());
    }
    if actual == old {
        return Err(error(
            "授权尚未保存，你原来的授权已保留。请继续这次连接重试",
        ));
    }
    if let Some(old) = old {
        let _ = store.write(&old);
        if store.read().as_ref() == Some(&old) {
            return Err(error("授权保存未完成，已恢复原授权。请继续这次连接重试"));
        }
    }
    let _ = result;
    Err(error(
        "授权保存结果尚无法核对，请保留这次连接并重启软件恢复；不要重新登记设备",
    ))
}
fn clear(store: &dyn JournalStore) -> Result<(), String> {
    let mut current = session().lock().map_err(|_| error("连接状态暂不可用"))?;
    store.delete()?;
    *current = None;
    Ok(())
}
fn install_journal(store: &dyn JournalStore, j: &Journal, flight: &Flight) -> Result<(), String> {
    let mut current = session().lock().map_err(|_| error("连接状态暂不可用"))?;
    flight.current()?;
    let mut sealed = j.clone();
    sealed.integrity = seal(&sealed);
    store.save(&sealed)?;
    *current = Some(sealed);
    Ok(())
}
fn load(
    store: &dyn JournalStore,
    cfg: &LicenseConfig,
    flight: &Flight,
) -> Result<Option<Journal>, String> {
    let mut current = session().lock().map_err(|_| error("连接状态暂不可用"))?;
    flight.current()?;
    if current.is_none() {
        *current = store.load()?;
    }
    if let Some(j) = current.as_ref() {
        validate_journal(j, cfg)?;
    }
    Ok(current.clone())
}
fn disk(state: &LicenseState) -> Result<Disk<'_>, String> {
    let key = state
        .0
        .master_key_b64
        .as_deref()
        .and_then(license::derive_license_key)
        .ok_or_else(|| error("本机安全存储尚未准备好，请重启软件后重试"))?;
    Ok(Disk { state, key })
}
fn ack(
    j: &Journal,
    transport: &dyn Transport,
    store: &dyn JournalStore,
    flight: &Flight,
) -> Result<bool, String> {
    let body = Zeroizing::new(
        serde_json::json!({"deviceSecret":j.device_secret, "codeVerifier":j.code_verifier})
            .to_string(),
    );
    let response = transport.post(GROWTH, ACK, &body, None)?;
    flight.current()?;
    match check_response(&response)? {
        Some("expired") => {
            clear(store)?;
            Ok(true)
        }
        Some(_) => Ok(false),
        None => {
            let status: Status = parse(&response.signed.body)?;
            if status.status != "acknowledged" {
                return Err(error("软件已启用，连接回执稍后会再次核对"));
            }
            clear(store)?;
            Ok(true)
        }
    }
}

#[tauri::command]
pub async fn owned_device_start(
    state: tauri::State<'_, LicenseState>,
    intent: String,
    device_label: Option<String>,
    activation_code: Option<String>,
) -> Result<View, String> {
    if !enabled() {
        return Ok(view(
            "unavailable",
            None,
            "当前安装包暂未开放账号与设备连接，请继续使用原激活码",
        ));
    }
    let state = LicenseState(state.0.clone());
    tauri::async_runtime::spawn_blocking(move || {
        let flight = Flight::begin()?; let cfg = config(&state)?;
        if let Some(j) = load(&Keychain, &cfg, &flight)? { return Ok(view("waiting", Some(&j), "继续上一次连接，避免重复登记设备")); }
        if !matches!(intent.as_str(), "link_owner" | "register_device") { return Err(error("请选择正确的账号连接入口")); }
        let label = device_label.unwrap_or_else(|| "这台电脑".to_string()).trim().to_string();
        if label.is_empty() || label.chars().count() > 64 || label.chars().any(char::is_control) { return Err(error("请填写64字以内的电脑名称")); }
        let mut original = activation_code.map(|v| v.trim().to_string()).filter(|v| !v.is_empty());
        if original.as_ref().is_some_and(|v| v.len() > 256 || v.chars().any(char::is_control)) { return Err(error("请检查原激活码后重试")); }
        let verifier = Zeroizing::new(random()); let challenge = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));
        let mut body = serde_json::json!({"intent":intent, "client":"creatoros", "projectKey":cfg.project_key, "productRef":crate::product_identity::product_ref(), "codeChallenge":challenge, "codeChallengeMethod":"S256"});
        let ticket = if intent == "link_owner" {
            let saved = disk(&state)?.read().filter(|s| s.allowed && s.signature_verified && s.machine_id == cfg.machine_id && s.project_key == cfg.project_key).ok_or_else(|| error("请先在这台电脑完成产品激活，再连接手机号账号"))?;
            Some(signed_ticket(&Http, &cfg, &saved.code, now())?.0)
        } else { body["machineId"] = cfg.machine_id.clone().into(); body["deviceLabel"] = label.into(); if let Some(code) = &original { body["activationCode"] = code.clone().into(); } None };
        let request = Zeroizing::new(body.to_string()); drop(body);
        let response = Transport::post(&Http, GROWTH, CREATE, &request, ticket.as_deref().map(|v| v.as_str()))?;
        flight.current()?;
        if response.signed.status != 200 && response.signed.status != 201 { check_response(&response)?; return Err(error("连接未创建，请稍后重试")); }
        let mut created: Created = parse(&response.signed.body)?;
        let code = user_code(&created.user_code).ok_or_else(|| error("连接短码无法核对，请重试"))?;
        let url = verification_url(&created.verification_url, &code)?;
        let expiry = canonical_time(&created.expires_at).ok_or_else(|| error("连接期限无法核对"))?;
        if !ulid(&created.registration_ref) || created.device_secret.len() < 32 || created.device_secret.len() > 256 || !(1..=60).contains(&created.poll_interval_seconds) || expiry <= now() || expiry - now() > 600_000 { return Err(error("连接记录无法核对，请重试")); }
        let j = Journal { integrity: String::new(), schema_version: 1, intent, binding: binding(&cfg, &created.registration_ref), registration_ref: created.registration_ref.clone(), device_secret: std::mem::take(&mut created.device_secret), code_verifier: verifier.to_string(), activation_code: original.take(), user_code: code, verification_url: url, expires_at: created.expires_at.clone(), retry_after_seconds: created.poll_interval_seconds, next_poll_at: now() + (created.poll_interval_seconds * 1000) as i64, saved_snapshot_hash: None, committed: false };
        install_journal(&Keychain, &j, &flight)?;
        Ok(view("waiting", Some(&j), "在官方页面验证手机号并确认产品，完成后回到这里"))
    }).await.map_err(|_| error("连接未完成，请重新打开账号与设备入口"))?
}

#[tauri::command]
pub async fn owned_device_resume(state: tauri::State<'_, LicenseState>) -> Result<View, String> {
    if !enabled() {
        return Ok(view(
            "unavailable",
            None,
            "当前安装包暂未开放账号与设备连接",
        ));
    }
    let state = LicenseState(state.0.clone());
    tauri::async_runtime::spawn_blocking(move || {
        let flight = Flight::begin()?;
        let cfg = config(&state)?;
        let Some(mut j) = load(&Keychain, &cfg, &flight)? else {
            return Ok(view("idle", None, "可以连接本人手机号账号"));
        };
        if let Some(hash) = &j.saved_snapshot_hash {
            if disk(&state)?
                .read()
                .as_ref()
                .is_some_and(|s| s.allowed && s.signature_verified && snapshot_hash(s) == *hash)
            {
                j.committed = true;
                install_journal(&Keychain, &j, &flight)?;
            }
        }
        if j.committed {
            if !license::notify_owned_device_saved(&state.0) {
                return Err(error("本机授权已保存，请重新打开软件恢复运行状态"));
            }
            let _ = ack(&j, &Http, &Keychain, &flight);
            return Ok(view(
                "activated",
                None,
                "本机授权已保存，可以开始使用。连接回执会在下次打开时续查",
            ));
        }
        if canonical_time(&j.expires_at).is_none_or(|ms| ms <= now()) {
            clear(&Keychain)?;
            return Ok(view(
                "expired",
                None,
                "上次确认已过期，你原来的授权不受影响。请重新连接",
            ));
        }
        Ok(view(
            "waiting",
            Some(&j),
            "已恢复上一次连接，请继续完成确认",
        ))
    })
    .await
    .map_err(|_| error("连接恢复未完成，请重试"))?
}

#[tauri::command]
pub async fn owned_device_poll(state: tauri::State<'_, LicenseState>) -> Result<View, String> {
    if !enabled() {
        return Ok(view(
            "unavailable",
            None,
            "当前安装包暂未开放账号与设备连接",
        ));
    }
    let state = LicenseState(state.0.clone());
    tauri::async_runtime::spawn_blocking(move || {
        let flight = Flight::begin()?;
        let cfg = config(&state)?;
        let Some(mut j) = load(&Keychain, &cfg, &flight)? else {
            return Ok(view("idle", None, "请先开始连接"));
        };
        if let Some(hash) = &j.saved_snapshot_hash {
            if disk(&state)?
                .read()
                .as_ref()
                .is_some_and(|s| s.allowed && s.signature_verified && snapshot_hash(s) == *hash)
            {
                j.committed = true;
            }
        }
        if j.committed {
            if !license::notify_owned_device_saved(&state.0) {
                return Err(error("本机授权已保存，请重新打开软件恢复运行状态"));
            }
            let _ = ack(&j, &Http, &Keychain, &flight);
            return Ok(view("activated", None, "本机已启用，可以开始使用"));
        }
        if canonical_time(&j.expires_at).is_none_or(|ms| ms <= now()) {
            clear(&Keychain)?;
            return Ok(view("expired", None, "这次确认已过期，请重新连接"));
        }
        if now() < j.next_poll_at {
            return Ok(view("waiting", Some(&j), "正在等待官方页面确认，请稍候"));
        }
        let mut body =
            serde_json::json!({"deviceSecret":j.device_secret, "codeVerifier":j.code_verifier});
        if j.intent == "link_owner" {
            let saved = disk(&state)?
                .read()
                .filter(|s| {
                    s.allowed
                        && s.signature_verified
                        && s.machine_id == cfg.machine_id
                        && s.project_key == cfg.project_key
                })
                .ok_or_else(|| error("原电脑授权无法核对，请保留连接并重试"))?;
            let (ticket, _) = signed_ticket(&Http, &cfg, &saved.code, now())?;
            body["configAccessTicket"] = ticket.as_str().into();
        }
        let request = Zeroizing::new(body.to_string());
        drop(body);
        let response = Transport::post(&Http, GROWTH, POLL, &request, None)?;
        flight.current()?;
        match check_response(&response)? {
            Some("expired") => {
                clear(&Keychain)?;
                return Ok(view("expired", None, "这次确认已过期或结束，请重新连接"));
            }
            Some("slow") => {
                j.retry_after_seconds = response
                    .retry_after
                    .unwrap_or((j.retry_after_seconds + 5).min(120));
                j.next_poll_at = now() + (j.retry_after_seconds * 1000) as i64;
                install_journal(&Keychain, &j, &flight)?;
                return Ok(view("waiting", Some(&j), "服务正在处理，请稍候再查"));
            }
            _ => {}
        }
        let status: serde_json::Value = parse(&response.signed.body)?;
        match status.get("status").and_then(|v| v.as_str()) {
            Some("pending") => {
                let pending: Pending = parse(&response.signed.body)?;
                if pending.status != "pending"
                    || pending.expires_at != j.expires_at
                    || !(1..=60).contains(&pending.retry_after_seconds)
                {
                    return Err(error("等待状态无法核对，请重试"));
                }
                j.retry_after_seconds = pending.retry_after_seconds;
                j.next_poll_at = now() + (j.retry_after_seconds * 1000) as i64;
                install_journal(&Keychain, &j, &flight)?;
                Ok(view(
                    "waiting",
                    Some(&j),
                    "等待你在官方页面完成手机号与产品确认",
                ))
            }
            Some("linked") if j.intent == "link_owner" => {
                let status: Status = parse(&response.signed.body)?;
                if status.status != "linked" {
                    return Err(error("账号连接结果无法核对"));
                }
                clear(&Keychain)?;
                Ok(view(
                    "linked",
                    None,
                    "产品已连接本人手机号。可在刚才的官方页面管理两台电脑",
                ))
            }
            Some("ready") if j.intent == "register_device" => {
                let ready: Ready = parse(&response.signed.body)?;
                let snapshot = candidate(&ready, &j, &cfg, &Http, &Http, &Clock)?;
                flight.current()?;
                j.saved_snapshot_hash = Some(snapshot_hash(&snapshot));
                install_journal(&Keychain, &j, &flight)?;
                // cancel 与保存共用这个短锁；不覆盖 network 阶段，取消即时使迟到结果失效。
                let _chain = state
                    .0
                    .chain_lock
                    .lock()
                    .map_err(|_| error("本机授权正在处理，请重试"))?;
                let _current = session().lock().map_err(|_| error("连接状态暂不可用"))?;
                flight.current()?;
                if snapshot
                    .expires_at
                    .as_deref()
                    .is_some_and(|v| canonical_time(v).is_none_or(|deadline| deadline <= now()))
                {
                    return Err(error(
                        "原产品授权已到期，尚未写入本机。请联系购买时的服务方续费后再连接",
                    ));
                }
                save_candidate(&disk(&state)?, &snapshot)?;
                drop(_current);
                drop(_chain);
                j.committed = true;
                let _ = install_journal(&Keychain, &j, &flight);
                if !license::notify_owned_device_saved(&state.0) {
                    return Err(error(
                        "授权已保存，但本机运行状态尚未就绪，请重新打开软件恢复",
                    ));
                }
                license::sync_mirror_to_sidecar(&state.0, &snapshot);
                license::refresh_client_config_sidecar_async(
                    state.0.clone(),
                    license::ClientConfigRefreshTrigger::Activation,
                );
                let acknowledged = ack(&j, &Http, &Keychain, &flight).unwrap_or(false);
                Ok(view(
                    "activated",
                    None,
                    if acknowledged {
                        "本机已启用，原有效期与额度保持一致。重新进入软件后开始使用"
                    } else {
                        "本机已启用，可以开始使用。连接回执将在下次打开时续查"
                    },
                ))
            }
            _ => Err(error("连接结果与这次操作不一致，请保留连接并重试")),
        }
    })
    .await
    .map_err(|_| error("连接处理未完成，请保留这次连接并重试"))?
}

#[tauri::command]
pub async fn owned_device_cancel(state: tauri::State<'_, LicenseState>) -> Result<View, String> {
    // 取消不等待网络请求。短保存锁取得后才线性化取消，已完成保存不被误称撤销授权。
    let mut current = session().lock().map_err(|_| error("连接状态暂不可用"))?;
    GENERATION.fetch_add(1, Ordering::SeqCst);
    if let Some(j) = current.as_ref() {
        if let Some(hash) = &j.saved_snapshot_hash {
            let owned = LicenseState(state.0.clone());
            if disk(&owned)?
                .read()
                .as_ref()
                .is_some_and(|s| s.allowed && s.signature_verified && snapshot_hash(s) == *hash)
            {
                return Ok(view(
                    "activated",
                    None,
                    "本机授权已经保存。已停止等待，你可以重新进入软件；连接回执稍后续查",
                ));
            }
        }
    }
    Keychain.delete()?;
    *current = None;
    Ok(view(
        "idle",
        None,
        "已停止这次连接，本机原授权与项目保持不变",
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use ed25519_dalek::{Signer, SigningKey};
    use std::cell::RefCell;
    static GLOBAL_TEST_LOCK: Mutex<()> = Mutex::new(());
    const REF: &str = "01K0A0B1C7Z8Y9X0W1V2T3S4R5";
    fn cfg() -> LicenseConfig {
        LicenseConfig {
            base_url: ACTIVITY.into(),
            project_key: "creatoros".into(),
            strict_verify: true,
            public_key_b64: base64::engine::general_purpose::STANDARD
                .encode(SigningKey::from_bytes(&[8; 32]).verifying_key().as_bytes()),
            machine_id: "native-machine".into(),
        }
    }
    fn journal() -> Journal {
        let cfg = cfg();
        let mut j = Journal {
            integrity: String::new(),
            schema_version: 1,
            intent: "register_device".into(),
            registration_ref: REF.into(),
            device_secret: "s".repeat(43),
            code_verifier: "v".repeat(43),
            activation_code: None,
            user_code: "ABCD-EFGH".into(),
            verification_url: format!("{GROWTH}/products/connect#code=ABCD-EFGH"),
            expires_at: iso_ms(now() + 600_000),
            retry_after_seconds: 5,
            next_poll_at: 0,
            binding: binding(&cfg, REF),
            saved_snapshot_hash: None,
            committed: false,
        };
        j.integrity = seal(&j);
        j
    }
    fn ready() -> Ready {
        Ready {
            status: "ready".into(),
            credential_mode: "server_delivered".into(),
            activation_endpoint: "/api/license/activate".into(),
            project_key: "creatoros".into(),
            product_ref: "creatoros".into(),
            expected_channel_ref: "official".into(),
            expected_authorization_ref_hash: digest("real-authority"),
            registered_device_ref: REF.into(),
            device_state_version: 1,
            authorization_version: 1,
            activated_at: "2026-10-07T01:00:00.000Z".into(),
            license_expires_at: None,
            expires_at: journal().expires_at.clone(),
            activation_code: Some("original-code".into()),
        }
    }
    fn snapshot(code: &str) -> LicenseSnapshot {
        LicenseSnapshot {
            v: 1,
            allowed: true,
            status: "active".into(),
            code: code.into(),
            machine_id: "native-machine".into(),
            license_mode: "TIME".into(),
            project_key: "creatoros".into(),
            channel_ref: Some("official".into()),
            channel_runtime: None,
            expires_at: None,
            activated_at: "2026-10-07T01:00:00.000Z".into(),
            last_online_check_ms: now(),
            last_seen_ms: now(),
            grace_seconds: 2_592_000,
            revoked: false,
            updates_blocked: false,
            signature_verified: true,
            verdict_at_ms: now(),
            message: "ok".into(),
        }
    }
    struct Memory {
        value: RefCell<Option<LicenseSnapshot>>,
        failure: u8,
    }
    impl SnapshotStore for Memory {
        fn read(&self) -> Option<LicenseSnapshot> {
            self.value.borrow().clone()
        }
        fn write(&self, s: &LicenseSnapshot) -> Result<(), String> {
            if self.failure == 1 {
                return Err("before-replace".into());
            }
            *self.value.borrow_mut() = Some(s.clone());
            if self.failure == 2 {
                Err("after-replace-fsync".into())
            } else {
                Ok(())
            }
        }
    }
    #[test]
    fn save_failure_before_replace_keeps_original_and_is_not_success() {
        let old = snapshot("old");
        let store = Memory {
            value: RefCell::new(Some(old.clone())),
            failure: 1,
        };
        assert!(save_candidate(&store, &snapshot("new")).is_err());
        assert_eq!(store.read(), Some(old));
    }
    #[test]
    fn save_failure_after_replace_converges_by_authoritative_readback() {
        let value = snapshot("new");
        let store = Memory {
            value: RefCell::new(Some(snapshot("old"))),
            failure: 2,
        };
        assert!(save_candidate(&store, &value).is_ok());
        assert_eq!(store.read(), Some(value));
    }
    #[test]
    fn journal_cannot_resume_on_another_machine_or_project() {
        let j = journal();
        validate_journal(&j, &cfg()).unwrap();
        let mut wrong = cfg();
        wrong.machine_id = "other".into();
        assert!(validate_journal(&j, &wrong).is_err());
        wrong = cfg();
        wrong.project_key = "another".into();
        assert!(validate_journal(&j, &wrong).is_err());
    }
    #[test]
    fn ready_allows_permanent_null_and_keeps_monthly_original_deadline() {
        let mut r = ready();
        let mut j = journal();
        r.expires_at = j.expires_at.clone();
        validate_ready(&r, &j, &cfg()).unwrap();
        r.license_expires_at = Some(iso_ms(now() + 86_400_000));
        validate_ready(&r, &j, &cfg()).unwrap();
        r.project_key = "other-product".into();
        assert!(validate_ready(&r, &j, &cfg()).is_err());
        j.activation_code = Some("own-code".into());
    }
    #[test]
    fn missing_deadline_is_rejected_instead_of_becoming_permanent() {
        let r = serde_json::json!({"status":"ready","credentialMode":"server_delivered","activationEndpoint":"/api/license/activate","projectKey":"creatoros","productRef":"creatoros","expectedChannelRef":"official","expectedAuthorizationRefHash":digest("authority"),"registeredDeviceRef":REF,"deviceStateVersion":1,"authorizationVersion":1,"activatedAt":"2026-10-07T01:00:00.000Z","expiresAt":journal().expires_at,"activationCode":"code"});
        assert!(parse::<Ready>(&serde_json::to_vec(&r).unwrap()).is_err());
    }
    #[test]
    fn invalid_endpoint_and_client_supplied_code_are_rejected() {
        let mut r = ready();
        let j = journal();
        r.expires_at = j.expires_at.clone();
        r.activation_endpoint = "https://attacker.test/api/license/activate".into();
        assert!(validate_ready(&r, &j, &cfg()).is_err());
        r.activation_endpoint = "/api/license/activate".into();
        r.credential_mode = "client_supplied".into();
        assert!(validate_ready(&r, &j, &cfg()).is_err());
    }
    #[test]
    fn ipc_view_never_contains_native_secrets() {
        let j = journal();
        let raw = serde_json::to_string(&view("waiting", Some(&j), "waiting")).unwrap();
        for secret in [&j.device_secret, &j.code_verifier, &cfg().machine_id] {
            assert!(!raw.contains(secret));
        }
        assert!(!raw.contains("activationCode"));
    }
    #[test]
    fn url_rejects_foreign_origin_query_and_wrong_short_code() {
        for url in [
            "https://attacker.test/products/connect#code=ABCD-EFGH",
            "https://growth.aitongban.cloud/products/connect?secret=code",
            "https://growth.aitongban.cloud/products/connect#code=ZZZZ-ZZZZ",
        ] {
            assert!(verification_url(url, "ABCD-EFGH").is_err());
        }
    }
    struct TicketHttp {
        signing: SigningKey,
        tamper: bool,
        wrong_nonce: bool,
    }
    impl Transport for TicketHttp {
        fn post(
            &self,
            origin: &str,
            path: &str,
            raw: &str,
            _: Option<&str>,
        ) -> Result<Response, String> {
            assert_eq!(origin, ACTIVITY);
            assert_eq!(path, TICKET);
            let request: serde_json::Value = serde_json::from_str(raw).unwrap();
            assert_eq!(request["machineId"], "native-machine");
            let claims = serde_json::json!({"contractVersion":"config-access-ticket-v3","issuer":"activation-manager","audience":"config.pull","scope":"client-config:read","projectKey":"creatoros","channelRef":"official","entitlementBindingHash":digest("real-authority"),"authorizationRefHash":digest("real-authority"),"activationUnitKind":"channel_plan","authorizationVersion":1,"jti":REF,"issuedAt":iso_ms(now()),"expiresAt":iso_ms(now()+300_000)});
            let b64 = |raw: Vec<u8>| base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(raw);
            let header=b64(serde_json::to_vec(&serde_json::json!({"alg":"EdDSA","kid":"test-key","typ":"TS-CLIENT-CONFIG-TICKET"})).unwrap());
            let payload = b64(serde_json::to_vec(&claims).unwrap());
            let input = format!("{header}.{payload}");
            let token = format!(
                "{input}.{}",
                b64(self.signing.sign(input.as_bytes()).to_bytes().to_vec())
            );
            let body=serde_json::to_vec(&serde_json::json!({"contractVersion":"config-access-ticket-v3","configAccessTicket":token,"expiresAt":claims["expiresAt"],"nonce":if self.wrong_nonce {"other"} else {request["nonce"].as_str().unwrap()}})).unwrap();
            let date = httpdate::fmt_http_date(SystemTime::now());
            let digest = license::compute_digest(&body);
            let input = license::build_signing_string(
                "post /api/license/client-config-tickets",
                "license.aitongban.cloud",
                &date,
                &digest,
            );
            let sig = self.signing.sign(input.as_bytes());
            let mut body = body;
            if self.tamper {
                body.push(b' ');
            }
            Ok(Response {
                signed: LicenseHttpResponse {
                    status: 200,
                    signature: Some(
                        base64::engine::general_purpose::STANDARD.encode(sig.to_bytes()),
                    ),
                    date: Some(date),
                    digest: Some(digest),
                    body,
                },
                retry_after: None,
            })
        }
    }
    #[test]
    fn fresh_v3_requires_real_signature_digest_nonce_and_exact_claims() {
        for (tamper, wrong_nonce) in [(false, false), (true, false), (false, true)] {
            let http = TicketHttp {
                signing: SigningKey::from_bytes(&[8; 32]),
                tamper,
                wrong_nonce,
            };
            let result = signed_ticket(&http, &cfg(), "native-only-code", now());
            assert_eq!(result.is_ok(), !tamper && !wrong_nonce);
        }
    }
    struct ActivateHttp {
        signing: SigningKey,
        expires_at: Option<String>,
        valid: bool,
    }
    impl LicenseHttp for ActivateHttp {
        fn post(&self, url: &str, body: &str) -> Result<LicenseHttpResponse, String> {
            assert_eq!(url, format!("{ACTIVITY}/api/license/activate"));
            let request: serde_json::Value = serde_json::from_str(body).unwrap();
            let body = serde_json::to_vec(&serde_json::json!({"success":true,"valid":self.valid,"licenseMode":"TIME","expiresAt":self.expires_at,"serverTime":iso_ms(now()),"nonce":request["nonce"],"revoked":false,"graceSeconds":2592000,"channelRef":"official"})).unwrap();
            let date = httpdate::fmt_http_date(SystemTime::now());
            let digest = license::compute_digest(&body);
            let signing = license::build_signing_string(
                "post /api/license/activate",
                "license.aitongban.cloud",
                &date,
                &digest,
            );
            Ok(LicenseHttpResponse {
                status: 200,
                signature: Some(
                    base64::engine::general_purpose::STANDARD
                        .encode(self.signing.sign(signing.as_bytes()).to_bytes()),
                ),
                date: Some(date),
                digest: Some(digest),
                body,
            })
        }
    }
    #[test]
    fn candidate_verifies_both_signed_responses_and_preserves_original_start_and_deadline() {
        for deadline in [None, Some(iso_ms(now() + 86400000))] {
            let j = journal();
            let mut r = ready();
            r.expires_at = j.expires_at.clone();
            r.license_expires_at = deadline.clone();
            let http = ActivateHttp {
                signing: SigningKey::from_bytes(&[8; 32]),
                expires_at: deadline.clone(),
                valid: true,
            };
            let ticket = TicketHttp {
                signing: SigningKey::from_bytes(&[8; 32]),
                tamper: false,
                wrong_nonce: false,
            };
            let result = candidate(&r, &j, &cfg(), &http, &ticket, &Clock).unwrap();
            assert_eq!(result.expires_at, deadline);
            assert_eq!(result.activated_at, r.activated_at);
            assert!(result.signature_verified);
            r.expected_authorization_ref_hash = digest("another-real-authority");
            assert!(candidate(&r, &j, &cfg(), &http, &ticket, &Clock).is_err());
        }
    }
    #[test]
    fn removed_device_and_changed_original_deadline_cannot_be_saved() {
        let j = journal();
        let mut r = ready();
        r.expires_at = j.expires_at.clone();
        let ticket = TicketHttp {
            signing: SigningKey::from_bytes(&[8; 32]),
            tamper: false,
            wrong_nonce: false,
        };
        let removed = ActivateHttp {
            signing: SigningKey::from_bytes(&[8; 32]),
            expires_at: None,
            valid: false,
        };
        assert!(candidate(&r, &j, &cfg(), &removed, &ticket, &Clock).is_err());
        let changed = ActivateHttp {
            signing: SigningKey::from_bytes(&[8; 32]),
            expires_at: Some(iso_ms(now() + 86400000)),
            valid: true,
        };
        assert!(candidate(&r, &j, &cfg(), &changed, &ticket, &Clock).is_err());
    }
    #[test]
    fn journal_seal_rejects_corruption_of_verifier_and_heartbeat_does_not_lose_saved_identity() {
        let mut j = journal();
        j.code_verifier.push('x');
        assert!(validate_journal(&j, &cfg()).is_err());
        let original = snapshot("same-code");
        let mut heartbeat = original.clone();
        heartbeat.last_seen_ms += 3000;
        heartbeat.verdict_at_ms += 3000;
        heartbeat.message = "refreshed".into();
        assert_eq!(snapshot_hash(&original), snapshot_hash(&heartbeat));
    }
    #[test]
    fn cancel_generation_rejects_late_response_before_save() {
        let _guard = GLOBAL_TEST_LOCK.lock().unwrap();
        let flight = Flight {
            generation: GENERATION.load(Ordering::SeqCst),
        };
        assert!(flight.current().is_ok());
        GENERATION.fetch_add(1, Ordering::SeqCst);
        assert!(flight.current().is_err());
    }
    struct MemoryJournal {
        saved: RefCell<Option<Journal>>,
    }
    impl JournalStore for MemoryJournal {
        fn load(&self) -> Result<Option<Journal>, String> {
            Ok(self.saved.borrow().clone())
        }
        fn save(&self, j: &Journal) -> Result<(), String> {
            *self.saved.borrow_mut() = Some(j.clone());
            Ok(())
        }
        fn delete(&self) -> Result<(), String> {
            *self.saved.borrow_mut() = None;
            Ok(())
        }
    }
    struct AckHttp {
        fail: bool,
    }
    impl Transport for AckHttp {
        fn post(
            &self,
            origin: &str,
            path: &str,
            body: &str,
            _: Option<&str>,
        ) -> Result<Response, String> {
            assert_eq!(origin, GROWTH);
            assert_eq!(path, ACK);
            let request: serde_json::Value = serde_json::from_str(body).unwrap();
            assert_eq!(request.as_object().unwrap().len(), 2);
            assert!(request.get("machineId").is_none());
            if self.fail {
                return Err("network unavailable".into());
            }
            Ok(Response {
                signed: LicenseHttpResponse {
                    status: 200,
                    signature: None,
                    date: None,
                    digest: None,
                    body: br#"{"status":"acknowledged"}"#.to_vec(),
                },
                retry_after: None,
            })
        }
    }
    #[test]
    fn lost_ack_keeps_secure_journal_and_repeat_ack_clears_it_without_reactivation() {
        // 不使用 global generation 的 current 比较：持有测试共用锁避免取消测试改变generation。
        let _guard = GLOBAL_TEST_LOCK.lock().unwrap();
        let mut j = journal();
        j.committed = true;
        j.integrity = seal(&j);
        let store = MemoryJournal {
            saved: RefCell::new(Some(j.clone())),
        };
        let flight = Flight {
            generation: GENERATION.load(Ordering::SeqCst),
        };
        assert!(ack(&j, &AckHttp { fail: true }, &store, &flight).is_err());
        assert!(store.load().unwrap().is_some());
        assert!(ack(&j, &AckHttp { fail: false }, &store, &flight).unwrap());
        assert!(store.load().unwrap().is_none());
    }
    struct EncryptedFile {
        path: std::path::PathBuf,
        failure: u8,
    }
    impl SnapshotStore for EncryptedFile {
        fn read(&self) -> Option<LicenseSnapshot> {
            license::read_snapshot_file(&self.path, Some(&[9; 32]))
        }
        fn write(&self, s: &LicenseSnapshot) -> Result<(), String> {
            if self.failure == 1 && s.code == "new" {
                return Err("injected before replace".into());
            }
            license::write_snapshot_file_checked(&self.path, s, Some(&[9; 32]))?;
            if self.failure == 2 && s.code == "new" {
                return Err("injected after replace fsync".into());
            }
            if self.failure == 3 && s.code == "new" {
                std::fs::write(&self.path, b"enc:v1:unreadable-after-replace").unwrap();
                return Err("injected unreadable after replace".into());
            }
            Ok(())
        }
    }
    impl Drop for EncryptedFile {
        fn drop(&mut self) {
            let _ = std::fs::remove_file(&self.path);
        }
    }
    #[test]
    fn real_encrypted_file_survives_before_replace_and_recovers_after_unknown_replace() {
        for failure in [1, 2, 3] {
            let path = std::env::temp_dir().join(format!("creator-owned-device-test-{}", random()));
            let old = snapshot("old");
            license::write_snapshot_file_checked(&path, &old, Some(&[9; 32])).unwrap();
            let original_encrypted = std::fs::read(&path).unwrap();
            assert!(!String::from_utf8_lossy(&original_encrypted).contains("old"));
            let store = EncryptedFile { path, failure };
            let result = save_candidate(&store, &snapshot("new"));
            if failure == 2 {
                assert!(result.is_ok());
                assert_eq!(store.read().unwrap().code, "new");
            } else {
                assert!(result.is_err());
                assert_eq!(store.read(), Some(old));
            }
            if failure == 1 {
                assert_eq!(std::fs::read(&store.path).unwrap(), original_encrypted);
            }
        }
    }
}
