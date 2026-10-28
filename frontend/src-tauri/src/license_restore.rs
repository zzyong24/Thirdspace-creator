//! T-1423：只恢复本机保存的原授权，许可与经济履约分开。
//! 完整合同：docs/verification/t1423/CLIENT_WIRE.md。

use crate::license::{self, LicenseConfig, LicenseHttpResponse, LicenseSnapshot};
use base64::Engine as _;
use serde::{Deserialize, Serialize};
use std::time::{Duration, Instant};

const CONTRACT: &str = "license-restore-current-v1";
const RESULT_CONTRACT: &str = "creatoros-license-restore-result-v1";
const NATIVE_BUDGET: Duration = Duration::from_millis(370_000);
const REQUEST_BUDGET: Duration = Duration::from_millis(120_000);
const MAX_BODY: usize = 65_536;
const SAFE_INTEGER: u64 = 9_007_199_254_740_991;
const OBSERVATION_TTL_MS: i64 = 730_000;

const OBSERVATION_CONTRACT: &str = "creatoros-legacy-upgrade-observation-v1";
const OBSERVATION_PURPOSE: &[u8] = b"creatoros-legacy-upgrade-fence-v1";
const MAX_OBSERVATIONS: usize = 256;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Observation {
    contract_version: String,
    observation_id: String,
    license_identity_hash: String,
    issued_at: String,
    expires_at: String,
    boot_nonce_hash: String,
}
fn sha256(value: &[u8]) -> String {
    use sha2::Digest as _;
    format!("sha256:{:x}", sha2::Sha256::digest(value))
}
fn stable_identity(original: &LicenseSnapshot) -> Option<String> {
    let expiry = match original.expires_at.as_deref() {
        Some(value) => Some(license::parse_iso_ms(value)?),
        None => None,
    };
    let tuple = serde_json::to_vec(&(
        "creatoros-legacy-upgrade-license-identity-v1",
        &original.project_key,
        &original.code,
        &original.machine_id,
        &original.license_mode,
        &original.channel_ref,
        expiry,
    ))
    .ok()?;
    Some(sha256(&tuple))
}
fn uuid_v4(value: &str) -> bool {
    value.len() == 36
        && value.bytes().enumerate().all(|(i, b)| match i {
            8 | 13 | 18 | 23 => b == b'-',
            14 => b == b'4',
            19 => matches!(b, b'8' | b'9' | b'a' | b'b'),
            _ => b.is_ascii_digit() || (b'a'..=b'f').contains(&b),
        })
}
fn open_observation(token: &str, master: &str) -> Option<Observation> {
    use aes_gcm::{
        aead::{Aead, KeyInit},
        Aes256Gcm, Nonce,
    };
    use sha2::Digest as _;
    use zeroize::Zeroizing;
    if token.len() > 4096 || !token.is_ascii() {
        return None;
    }
    let encoded = token.strip_prefix("enc:v1:")?;
    let base64 = &base64::engine::general_purpose::STANDARD;
    let raw = base64.decode(encoded).ok()?;
    if raw.len() <= 28 || base64.encode(&raw) != encoded {
        return None;
    }
    let master = Zeroizing::new(base64.decode(master).ok()?);
    if master.len() != 32 {
        return None;
    }
    let mut hasher = sha2::Sha256::new();
    hasher.update(master.as_slice());
    hasher.update(OBSERVATION_PURPOSE);
    let key = Zeroizing::new(<[u8; 32]>::from(hasher.finalize()));
    let cipher = Aes256Gcm::new_from_slice(key.as_slice()).ok()?;
    // 与 backend.encryptSecret 保持相同的 iv | tag | ciphertext 顺序。
    let mut ciphertext = raw[28..].to_vec();
    ciphertext.extend_from_slice(&raw[12..28]);
    let plaintext = Zeroizing::new(
        cipher
            .decrypt(Nonce::from_slice(&raw[..12]), ciphertext.as_slice())
            .ok()?,
    );
    serde_json::from_slice(&plaintext).ok()
}
struct ObservationBudget<'a> {
    parent: &'a dyn Budget,
    started: Instant,
    remaining: Duration,
}
impl Budget for ObservationBudget<'_> {
    fn remaining(&self) -> Duration {
        self.parent
            .remaining()
            .min(self.remaining.saturating_sub(self.started.elapsed()))
    }
}
fn restore_observed(
    cfg: &LicenseConfig,
    ports: &Ports<'_>,
    token: &str,
    master: &str,
    boot: &str,
    used: &mut std::collections::HashMap<String, i64>,
) -> RestoreResult {
    let reject = || RestoreResult::blocked("RESTORE_CONTINUE_REQUIRED");
    let Some(observation) = open_observation(token, master) else {
        return reject();
    };
    let Some(original) = ports.store.read() else {
        return reject();
    };
    let now = ports.clock.wall_ms().max(
        license::max_last_seen(ports.points, Some(original.last_seen_ms))
            .unwrap_or(original.last_seen_ms),
    );
    let (Some(issued), Some(expires)) = (
        utc_ms(&observation.issued_at),
        utc_ms(&observation.expires_at),
    ) else {
        return reject();
    };
    if observation.contract_version != OBSERVATION_CONTRACT
        || !uuid_v4(&observation.observation_id)
        || !hash(&observation.license_identity_hash)
        || boot.is_empty()
        || observation.boot_nonce_hash != sha256(boot.as_bytes())
        || expires.checked_sub(issued) != Some(OBSERVATION_TTL_MS)
        || issued > now
        || expires <= now
        || stable_identity(&original).as_deref() != Some(observation.license_identity_hash.as_str())
    {
        return reject();
    }
    used.retain(|_, expiry| *expiry > now);
    if used.contains_key(&observation.observation_id) || used.len() >= MAX_OBSERVATIONS {
        return reject();
    }
    // 在第一次网络请求前消耗；失败、取消、超时都不得重复提交同一观察。
    used.insert(observation.observation_id, expires);
    let budget = ObservationBudget {
        parent: ports.budget,
        started: Instant::now(),
        remaining: Duration::from_millis((expires - now) as u64),
    };
    restore_snapshot(
        cfg,
        &Ports {
            budget: &budget,
            ..*ports
        },
        original,
    )
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RestoreResult {
    contract_version: &'static str,
    status: &'static str,
    reason_code: &'static str,
    binding_status: &'static str,
    persistence: &'static str,
    retryable: bool,
}
impl RestoreResult {
    fn blocked(reason: &'static str) -> Self {
        Self {
            contract_version: RESULT_CONTRACT,
            status: "blocked",
            reason_code: reason,
            binding_status: "unverified",
            persistence: "unchanged",
            retryable: matches!(
                reason,
                "RESTORE_CONTINUE_REQUIRED"
                    | "RESTORE_STATE_CHANGED"
                    | "RESTORE_BINDING_UNAVAILABLE"
                    | "RESTORE_SIGNING_UNAVAILABLE"
                    | "RESTORE_UNAVAILABLE"
            ),
        }
    }
    fn ready() -> Self {
        Self {
            contract_version: RESULT_CONTRACT,
            status: "ready",
            reason_code: "RESTORE_READY",
            binding_status: "verified",
            persistence: "confirmed",
            retryable: false,
        }
    }
}

trait Budget {
    fn remaining(&self) -> Duration;
}
struct Deadline(Instant);
impl Budget for Deadline {
    fn remaining(&self) -> Duration {
        NATIVE_BUDGET.saturating_sub(self.0.elapsed())
    }
}
trait Http {
    fn post(&self, url: &str, body: &str, timeout: Duration) -> Result<LicenseHttpResponse, ()>;
}
trait Store {
    fn read(&self) -> Option<LicenseSnapshot>;
    fn write(&self, snapshot: &LicenseSnapshot) -> Result<(), ()>;
}
struct Ports<'a> {
    http: &'a dyn Http,
    store: &'a dyn Store,
    clock: &'a dyn license::LicenseClock,
    budget: &'a dyn Budget,
    points: &'a [&'a dyn license::LastSeenStore],
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct WireLicense {
    project_key: String,
    license_mode: String,
    activated_at: String,
    expires_at: Option<String>,
    remaining_count: Option<u64>,
    channel_ref: Option<String>,
    entitlement_binding_hash: String,
    authorization_version: u64,
    device_state_version: u64,
    is_activated: bool,
    binding_valid: bool,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Wire {
    contract_version: String,
    action: String,
    nonce: String,
    server_time: String,
    outcome: String,
    code: Option<String>,
    expected_state_digest: Option<String>,
    invalid_binding_count: u64,
    license: Option<WireLicense>,
}
fn exact(value: &serde_json::Value, keys: &[&str]) -> bool {
    value
        .as_object()
        .is_some_and(|o| o.len() == keys.len() && keys.iter().all(|k| o.contains_key(*k)))
}
fn hash(value: &str) -> bool {
    value.len() == 71
        && value.starts_with("sha256:")
        && value.as_bytes()[7..]
            .iter()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(b))
}
fn utc_ms(value: &str) -> Option<i64> {
    if value.len() != 24 || !value.is_ascii() {
        return None;
    }
    let ms = license::parse_iso_ms(value)?;
    let seconds = license::format_iso_ms(ms);
    (format!(
        "{}.{:03}Z",
        seconds.trim_end_matches('Z'),
        ms.rem_euclid(1000)
    ) == value)
        .then_some(ms)
}
fn denied_code(status: u16, code: &str) -> Option<&'static str> {
    let (expected, known) = match code {
        "RESTORE_METHOD_NOT_ALLOWED" => (405, "RESTORE_METHOD_NOT_ALLOWED"),
        "RESTORE_BODY_TOO_LARGE" => (413, "RESTORE_BODY_TOO_LARGE"),
        "RESTORE_REQUEST_INVALID" => (422, "RESTORE_REQUEST_INVALID"),
        "RESTORE_LICENSE_NOT_FOUND" => (404, "RESTORE_LICENSE_NOT_FOUND"),
        "RESTORE_PROJECT_DISABLED" => (403, "RESTORE_PROJECT_DISABLED"),
        "RESTORE_LICENSE_REVOKED" => (403, "RESTORE_LICENSE_REVOKED"),
        "RESTORE_NOT_PREVIOUSLY_ACTIVATED" => (409, "RESTORE_NOT_PREVIOUSLY_ACTIVATED"),
        "RESTORE_UNSUPPORTED_LICENSE" => (409, "RESTORE_UNSUPPORTED_LICENSE"),
        "RESTORE_LICENSE_EXPIRED" => (409, "RESTORE_LICENSE_EXPIRED"),
        "RESTORE_COUNT_DEPLETED" => (409, "RESTORE_COUNT_DEPLETED"),
        "RESTORE_SCOPE_MISMATCH" => (409, "RESTORE_SCOPE_MISMATCH"),
        "RESTORE_ACTIVE_BINDING_CONFLICT" => (409, "RESTORE_ACTIVE_BINDING_CONFLICT"),
        "RESTORE_TARGET_BOUND_ELSEWHERE" => (409, "RESTORE_TARGET_BOUND_ELSEWHERE"),
        "RESTORE_BINDING_NOT_RECOVERABLE" => (409, "RESTORE_BINDING_NOT_RECOVERABLE"),
        "RESTORE_STATE_CHANGED" => (409, "RESTORE_STATE_CHANGED"),
        "RESTORE_HISTORY_INCOMPLETE" => (409, "RESTORE_HISTORY_INCOMPLETE"),
        "RESTORE_BINDING_UNAVAILABLE" => (503, "RESTORE_BINDING_UNAVAILABLE"),
        "RESTORE_SIGNING_UNAVAILABLE" => (503, "RESTORE_SIGNING_UNAVAILABLE"),
        "RESTORE_UNAVAILABLE" => (503, "RESTORE_UNAVAILABLE"),
        _ => return None,
    };
    (status == expected).then_some(known)
}
enum Reply {
    Current(WireLicense, i64),
    Missing(String, WireLicense),
    Denied(&'static str),
}
fn verified_reply(
    cfg: &LicenseConfig,
    original: &LicenseSnapshot,
    response: LicenseHttpResponse,
    action: &str,
    nonce: &str,
    wall: i64,
) -> Result<Reply, &'static str> {
    let invalid = "RESTORE_RESPONSE_UNVERIFIED";
    if response.body.len() > MAX_BODY {
        return Err(invalid);
    }
    let key = license::resolve_public_key(&cfg.public_key_b64).map_err(|_| invalid)?;
    // 不读取 strict_verify；该专用入口永远强验签。
    license::verify_response_signature(
        &key,
        crate::secure_strings::license_restore_target(),
        crate::secure_strings::license_host(),
        &response,
    )
    .map_err(|_| {
        if matches!(response.status, 404 | 405) {
            "RESTORE_SERVICE_UNSUPPORTED"
        } else {
            invalid
        }
    })?;
    let date = httpdate::parse_http_date(response.date.as_deref().ok_or(invalid)?)
        .map_err(|_| invalid)?
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|_| invalid)?
        .as_millis() as i64;
    let value: serde_json::Value = serde_json::from_slice(&response.body).map_err(|_| invalid)?;
    if !exact(
        &value,
        &[
            "contractVersion",
            "action",
            "nonce",
            "serverTime",
            "outcome",
            "code",
            "expectedStateDigest",
            "invalidBindingCount",
            "license",
        ],
    ) {
        return Err(invalid);
    }
    if !value["license"].is_null()
        && !exact(
            &value["license"],
            &[
                "projectKey",
                "licenseMode",
                "activatedAt",
                "expiresAt",
                "remainingCount",
                "channelRef",
                "entitlementBindingHash",
                "authorizationVersion",
                "deviceStateVersion",
                "isActivated",
                "bindingValid",
            ],
        )
    {
        return Err(invalid);
    }
    let body: Wire = serde_json::from_value(value).map_err(|_| invalid)?;
    let server_ms = utc_ms(&body.server_time).ok_or(invalid)?;
    if body.contract_version != CONTRACT
        || body.action != action
        || body.nonce != nonce
        || server_ms.abs_diff(wall) > 120_000
        || server_ms.abs_diff(date) > 2000
        || body.invalid_binding_count > SAFE_INTEGER
    {
        return Err(invalid);
    }
    if body.outcome == "denied" {
        if body.license.is_some()
            || body.expected_state_digest.is_some()
            || body.invalid_binding_count != 0
        {
            return Err(invalid);
        }
        return denied_code(response.status, body.code.as_deref().ok_or(invalid)?)
            .map(Reply::Denied)
            .ok_or(invalid);
    }
    if response.status != 200 || body.code.is_some() {
        return Err(invalid);
    }
    let license = body.license.ok_or(invalid)?;
    if !license.is_activated
        || !hash(&license.entitlement_binding_hash)
        || !(1..=SAFE_INTEGER).contains(&license.authorization_version)
        || !(1..=SAFE_INTEGER).contains(&license.device_state_version)
        || utc_ms(&license.activated_at).is_none_or(|v| v > server_ms)
        || license
            .expires_at
            .as_deref()
            .is_some_and(|v| utc_ms(v).is_none_or(|v| v <= server_ms))
        || !match license.license_mode.as_str() {
            "TIME" => license.remaining_count.is_none(),
            "COUNT" => {
                license.expires_at.is_none()
                    && license
                        .remaining_count
                        .is_some_and(|v| (1..=SAFE_INTEGER).contains(&v))
            }
            _ => false,
        }
    {
        return Err(invalid);
    }
    if license.project_key != cfg.project_key
        || license.license_mode != original.license_mode
        || license.channel_ref != original.channel_ref
        || match (&license.expires_at, &original.expires_at) {
            (None, None) => false,
            (Some(a), Some(b)) => license::parse_iso_ms(a) != license::parse_iso_ms(b),
            _ => true,
        }
    {
        return Err("RESTORE_IDENTITY_CHANGED");
    }
    match body.outcome.as_str() {
        "ready_missing" if action == "inspect" && !license.binding_valid => {
            let digest = body
                .expected_state_digest
                .filter(|v| hash(v))
                .ok_or(invalid)?;
            Ok(Reply::Missing(digest, license))
        }
        "already_bound"
            if license.binding_valid
                && body.expected_state_digest.is_none()
                && body.invalid_binding_count == 0 =>
        {
            Ok(Reply::Current(license, server_ms))
        }
        "restored"
            if action == "restore"
                && license.binding_valid
                && body.expected_state_digest.is_none() =>
        {
            Ok(Reply::Current(license, server_ms))
        }
        _ => Err(invalid),
    }
}
fn request(
    cfg: &LicenseConfig,
    original: &LicenseSnapshot,
    ports: &Ports<'_>,
    digest: Option<&str>,
) -> Result<Reply, &'static str> {
    let remaining = ports.budget.remaining();
    if remaining.is_zero() {
        return Err("RESTORE_UNAVAILABLE");
    }
    use rand::RngCore as _;
    let mut random = [0u8; 32];
    rand::rngs::OsRng.fill_bytes(&mut random);
    let nonce = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(random);
    let action = if digest.is_some() {
        "restore"
    } else {
        "inspect"
    };
    let mut body = serde_json::json!({ "contractVersion": CONTRACT, "action": action, "projectKey": cfg.project_key,
        "code": original.code, "machineId": cfg.machine_id, "nonce": nonce });
    if let Some(digest) = digest {
        body["expectedStateDigest"] = digest.into();
    }
    let url = format!(
        "{}{}",
        cfg.base_url,
        crate::secure_strings::s(crate::secure_strings::ids::LICENSE_RESTORE_PATH)
    );
    let response = ports
        .http
        .post(&url, &body.to_string(), REQUEST_BUDGET.min(remaining))
        .map_err(|_| "RESTORE_UNAVAILABLE")?;
    if ports.budget.remaining().is_zero() {
        return Err("RESTORE_UNAVAILABLE");
    }
    verified_reply(
        cfg,
        original,
        response,
        action,
        &nonce,
        ports.clock.wall_ms(),
    )
}
fn unknown() -> RestoreResult {
    RestoreResult {
        status: "unknown",
        reason_code: "RESTORE_CONTINUE_REQUIRED",
        retryable: true,
        ..RestoreResult::blocked("RESTORE_CONTINUE_REQUIRED")
    }
}
fn save(
    original: &LicenseSnapshot,
    current: WireLicense,
    server_ms: i64,
    ports: &Ports<'_>,
) -> RestoreResult {
    if ports.budget.remaining().is_zero() {
        return unknown();
    }
    // 防止其他写者/外部文件替换：持链锁仍须比对最后一次权威读取。
    if ports.store.read().as_ref() != Some(original) {
        return RestoreResult::blocked("RESTORE_IDENTITY_CHANGED");
    }
    let seen =
        license::max_last_seen(ports.points, Some(original.last_seen_ms)).unwrap_or(server_ms);
    if license::is_clock_rollback(ports.clock.wall_ms(), Some(seen)) {
        return RestoreResult::blocked("RESTORE_RESPONSE_UNVERIFIED");
    }
    let current_time = ports.clock.wall_ms().max(server_ms).max(seen);
    if current
        .expires_at
        .as_deref()
        .is_some_and(|v| utc_ms(v).is_none_or(|end| end <= current_time))
    {
        return RestoreResult::blocked("RESTORE_RESPONSE_UNVERIFIED");
    }
    let mut candidate = original.clone();
    candidate.allowed = true;
    candidate.status = "active".into();
    candidate.activated_at = current.activated_at;
    candidate.signature_verified = true;
    candidate.revoked = false;
    candidate.updates_blocked = false;
    candidate.last_online_check_ms = server_ms;
    candidate.last_seen_ms = seen.max(server_ms);
    candidate.verdict_at_ms = ports.clock.wall_ms();
    candidate.message = "原授权已核对并恢复".into();
    if ports.budget.remaining().is_zero() {
        return unknown();
    }
    // replace 后 fsync 也可能报错；按真实回读确认，绝不盲重写/回滚他人值。
    let _ = ports.store.write(&candidate);
    let actual = ports.store.read();
    if actual.as_ref() == Some(&candidate) {
        if candidate.expires_at.as_deref().is_some_and(|v| {
            utc_ms(v).is_none_or(|end| end <= ports.clock.wall_ms().max(current_time))
        }) {
            return RestoreResult {
                status: "blocked",
                reason_code: "RESTORE_RESPONSE_UNVERIFIED",
                ..RestoreResult::ready()
            };
        }
        for point in ports.points {
            point.write(candidate.last_seen_ms);
        }
        return RestoreResult::ready();
    }
    RestoreResult {
        contract_version: RESULT_CONTRACT,
        status: if actual.as_ref() == Some(original) {
            "blocked"
        } else {
            "unknown"
        },
        reason_code: "RESTORE_STORAGE_UNCONFIRMED",
        binding_status: "verified",
        persistence: if actual.as_ref() == Some(original) {
            "unchanged"
        } else {
            "unknown"
        },
        retryable: true,
    }
}
fn same_inspected_license(before: &WireLicense, after: &WireLicense) -> bool {
    before.project_key == after.project_key
        && before.license_mode == after.license_mode
        && before.activated_at == after.activated_at
        && before.expires_at == after.expires_at
        && before.remaining_count == after.remaining_count
        && before.channel_ref == after.channel_ref
        && before.entitlement_binding_hash == after.entitlement_binding_hash
        && after.authorization_version >= before.authorization_version
        && after.device_state_version >= before.device_state_version
}
#[cfg(test)]
fn restore(cfg: &LicenseConfig, ports: &Ports<'_>) -> RestoreResult {
    let Some(original) = ports.store.read() else {
        return RestoreResult::blocked("RESTORE_LOCAL_LICENSE_UNAVAILABLE");
    };
    restore_snapshot(cfg, ports, original)
}
fn restore_snapshot(
    cfg: &LicenseConfig,
    ports: &Ports<'_>,
    original: LicenseSnapshot,
) -> RestoreResult {
    let bounded = |s: &str| {
        !s.is_empty()
            && s.len() <= 256
            && s.trim() == s
            && !s.chars().any(|c| c <= '\u{001f}' || c == '\u{007f}')
    };
    if !bounded(&original.code) {
        return RestoreResult::blocked("RESTORE_LOCAL_LICENSE_UNAVAILABLE");
    }
    if original.machine_id != cfg.machine_id
        || original.project_key != cfg.project_key
        || !bounded(&cfg.machine_id)
        || !matches!(original.license_mode.as_str(), "TIME" | "COUNT")
    {
        return RestoreResult::blocked("RESTORE_IDENTITY_CHANGED");
    }
    if cfg.base_url != crate::secure_strings::s(crate::secure_strings::ids::LICENSE_BASE_URL)
        || license::resolve_public_key(&cfg.public_key_b64).is_err()
    {
        return RestoreResult::blocked("RESTORE_RESPONSE_UNVERIFIED");
    }
    let seen = license::max_last_seen(ports.points, Some(original.last_seen_ms));
    if license::is_clock_rollback(ports.clock.wall_ms(), seen) {
        return RestoreResult::blocked("RESTORE_RESPONSE_UNVERIFIED");
    }
    if ports.store.read().as_ref() != Some(&original) {
        return RestoreResult::blocked("RESTORE_IDENTITY_CHANGED");
    }
    let (digest, inspected) = match request(cfg, &original, ports, None) {
        Ok(Reply::Current(value, now)) => return save(&original, value, now, ports),
        Ok(Reply::Missing(digest, inspected)) => (digest, inspected),
        Ok(Reply::Denied(reason)) | Err(reason) => return RestoreResult::blocked(reason),
    };
    if ports.budget.remaining().is_zero() {
        return RestoreResult::blocked("RESTORE_UNAVAILABLE");
    }
    if ports.store.read().as_ref() != Some(&original) {
        return RestoreResult::blocked("RESTORE_IDENTITY_CHANGED");
    }
    match request(cfg, &original, ports, Some(&digest)) {
        Ok(Reply::Current(value, now)) => {
            if !same_inspected_license(&inspected, &value) {
                return RestoreResult::blocked("RESTORE_IDENTITY_CHANGED");
            }
            save(&original, value, now, ports)
        }
        Ok(Reply::Denied(reason)) => RestoreResult::blocked(reason),
        // 提交结果未确认，只读收敛一次；绝不取新摘要再自动恢复。
        _ => match request(cfg, &original, ports, None) {
            Ok(Reply::Current(value, now)) if same_inspected_license(&inspected, &value) => {
                save(&original, value, now, ports)
            }
            _ => unknown(),
        },
    }
}

struct Network;
impl Http for Network {
    fn post(&self, url: &str, body: &str, timeout: Duration) -> Result<LicenseHttpResponse, ()> {
        use std::io::Read as _;
        let client = reqwest::blocking::Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .timeout(timeout)
            .connect_timeout(timeout)
            .build()
            .map_err(|_| ())?;
        let response = client
            .post(url)
            .header("Content-Type", "application/json")
            .body(body.to_owned())
            .send()
            .map_err(|_| ())?;
        let status = response.status().as_u16();
        let header = |key| {
            response
                .headers()
                .get(key)
                .and_then(|v| v.to_str().ok())
                .map(str::to_owned)
        };
        if response.headers().contains_key("location") {
            return Err(());
        }
        let signature = header("x-license-signature");
        let date = header("x-license-date");
        let digest = header("x-license-digest");
        let mut body = Vec::new();
        response
            .take((MAX_BODY + 1) as u64)
            .read_to_end(&mut body)
            .map_err(|_| ())?;
        if body.len() > MAX_BODY {
            return Err(());
        }
        Ok(LicenseHttpResponse {
            status,
            signature,
            date,
            digest,
            body,
        })
    }
}
struct Disk {
    path: std::path::PathBuf,
    key: [u8; 32],
}
impl Drop for Disk {
    fn drop(&mut self) {
        use zeroize::Zeroize as _;
        self.key.zeroize();
    }
}
impl Store for Disk {
    fn read(&self) -> Option<LicenseSnapshot> {
        license::read_snapshot_file(&self.path, Some(&self.key))
    }
    fn write(&self, value: &LicenseSnapshot) -> Result<(), ()> {
        license::write_snapshot_file_checked(&self.path, value, Some(&self.key)).map_err(|_| ())
    }
}
static USED_OBSERVATIONS: std::sync::OnceLock<
    std::sync::Mutex<std::collections::HashMap<String, i64>>,
> = std::sync::OnceLock::new();
static IN_PROGRESS: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);
struct Flight<'a>(&'a std::sync::atomic::AtomicBool);
impl<'a> Flight<'a> {
    fn acquire(flag: &'a std::sync::atomic::AtomicBool) -> Option<Self> {
        flag.compare_exchange(
            false,
            true,
            std::sync::atomic::Ordering::AcqRel,
            std::sync::atomic::Ordering::Acquire,
        )
        .ok()
        .map(|_| Self(flag))
    }
}
impl Drop for Flight<'_> {
    fn drop(&mut self) {
        self.0.store(false, std::sync::atomic::Ordering::Release);
    }
}

#[tauri::command]
pub async fn license_restore_saved(
    state: tauri::State<'_, license::LicenseState>,
    observation_token: String,
) -> Result<RestoreResult, ()> {
    let budget = Deadline(Instant::now());
    let Some(flight) = Flight::acquire(&IN_PROGRESS) else {
        return Ok(RestoreResult {
            status: "pending",
            reason_code: "RESTORE_IN_PROGRESS",
            retryable: true,
            ..RestoreResult::blocked("RESTORE_IN_PROGRESS")
        });
    };
    let ctx = state.0.clone();
    Ok(tauri::async_runtime::spawn_blocking(move || {
        let _flight = flight;
        let _guard = loop {
            if budget.remaining().is_zero() {
                return RestoreResult::blocked("RESTORE_UNAVAILABLE");
            }
            match ctx.chain_lock.try_lock() {
                Ok(guard) => break guard,
                Err(std::sync::TryLockError::WouldBlock) => {
                    std::thread::sleep(Duration::from_millis(10))
                }
                Err(_) => return RestoreResult::blocked("RESTORE_UNAVAILABLE"),
            }
        };
        let Some(key) = ctx
            .master_key_b64
            .as_deref()
            .and_then(license::derive_license_key)
        else {
            return RestoreResult::blocked("RESTORE_LOCAL_LICENSE_UNAVAILABLE");
        };
        let store = Disk {
            path: license::license_file_path(&ctx.app_data_dir),
            key,
        };
        let points = license::prod_points(&ctx);
        let refs: Vec<&dyn license::LastSeenStore> = points.iter().map(|v| v.as_ref()).collect();
        let Ok(mut used) = USED_OBSERVATIONS.get_or_init(Default::default).lock() else {
            return RestoreResult::blocked("RESTORE_CONTINUE_REQUIRED");
        };
        let result = restore_observed(
            &LicenseConfig::from_env(ctx.machine_id.clone()),
            &Ports {
                http: &Network,
                store: &store,
                clock: &license::SystemClock,
                budget: &budget,
                points: &refs,
            },
            &observation_token,
            ctx.master_key_b64.as_deref().unwrap_or(""),
            &ctx.handshake_token,
            &mut used,
        );
        if result.status == "ready" && !license::notify_owned_device_saved(&ctx) {
            return RestoreResult {
                status: "blocked",
                reason_code: "RESTORE_RESPONSE_UNVERIFIED",
                ..result
            };
        }
        result
    })
    .await
    .unwrap_or_else(|_| unknown()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use ed25519_dalek::{Signer, SigningKey};
    use serde_json::{json, Value};
    use std::cell::{Cell, RefCell};

    const NOW: i64 = 1_792_728_000_000;
    fn iso(ms: i64) -> String {
        let seconds = license::format_iso_ms(ms);
        format!(
            "{}.{:03}Z",
            seconds.trim_end_matches('Z'),
            ms.rem_euclid(1000)
        )
    }
    struct Clock;
    impl license::LicenseClock for Clock {
        fn wall_ms(&self) -> i64 {
            NOW
        }
    }
    struct TestBudget(Cell<Duration>);
    impl Budget for TestBudget {
        fn remaining(&self) -> Duration {
            self.0.get()
        }
    }
    struct Memory {
        value: RefCell<Option<LicenseSnapshot>>,
        writes: Cell<usize>,
        write_mode: Cell<u8>,
    }
    impl Memory {
        fn new() -> Self {
            Self {
                value: RefCell::new(Some(snapshot())),
                writes: Cell::new(0),
                write_mode: Cell::new(0),
            }
        }
    }
    impl Store for Memory {
        fn read(&self) -> Option<LicenseSnapshot> {
            self.value.borrow().clone()
        }
        fn write(&self, value: &LicenseSnapshot) -> Result<(), ()> {
            self.writes.set(self.writes.get() + 1);
            match self.write_mode.get() {
                1 => Err(()),
                2 => {
                    *self.value.borrow_mut() = None;
                    Err(())
                }
                3 => {
                    *self.value.borrow_mut() = Some(value.clone());
                    Err(())
                }
                _ => {
                    *self.value.borrow_mut() = Some(value.clone());
                    Ok(())
                }
            }
        }
    }
    fn snapshot() -> LicenseSnapshot {
        LicenseSnapshot {
            v: 1,
            allowed: true,
            status: "active".into(),
            code: "SYNTHETIC-T1423".into(),
            machine_id: "fixture-machine".into(),
            license_mode: "TIME".into(),
            project_key: "creatoros".into(),
            channel_ref: None,
            channel_runtime: None,
            expires_at: None,
            activated_at: iso(NOW - 1000),
            last_online_check_ms: NOW - 1000,
            last_seen_ms: NOW - 1000,
            grace_seconds: 2592000,
            revoked: false,
            updates_blocked: false,
            signature_verified: false,
            verdict_at_ms: NOW - 1000,
            message: "original".into(),
        }
    }
    fn cfg() -> LicenseConfig {
        LicenseConfig {
            base_url: crate::secure_strings::s(crate::secure_strings::ids::LICENSE_BASE_URL).into(),
            project_key: "creatoros".into(),
            strict_verify: false,
            public_key_b64: base64::engine::general_purpose::STANDARD
                .encode(SigningKey::from_bytes(&[61; 32]).verifying_key().as_bytes()),
            machine_id: "fixture-machine".into(),
        }
    }
    struct MockHttp {
        outcomes: RefCell<Vec<&'static str>>,
        calls: RefCell<Vec<Value>>,
        alter: Option<fn(&mut Value)>,
        missing_signature: bool,
        status: u16,
        signing_target: &'static str,
    }
    impl MockHttp {
        fn new(outcomes: Vec<&'static str>) -> Self {
            Self {
                outcomes: RefCell::new(outcomes),
                calls: RefCell::new(vec![]),
                alter: None,
                missing_signature: false,
                status: 200,
                signing_target: "post /api/license/restore-current",
            }
        }
    }
    impl Http for MockHttp {
        fn post(
            &self,
            url: &str,
            body: &str,
            timeout: Duration,
        ) -> Result<LicenseHttpResponse, ()> {
            assert!(url.ends_with("/api/license/restore-current"));
            assert!(timeout > Duration::ZERO && timeout <= REQUEST_BUDGET);
            let request: Value = serde_json::from_str(body).unwrap();
            self.calls.borrow_mut().push(request.clone());
            let outcome = self.outcomes.borrow_mut().remove(0);
            if outcome == "lost" {
                return Err(());
            }
            let mut body = json!({"contractVersion":CONTRACT,"action":request["action"],"nonce":request["nonce"],
                "serverTime":iso(NOW),"outcome":outcome,"code":null,
                "expectedStateDigest":if outcome == "ready_missing" { Some(format!("sha256:{}", "a".repeat(64))) } else { None },
                "invalidBindingCount":if outcome == "already_bound" {0} else {1},
                "license":{"projectKey":"creatoros","licenseMode":"TIME","activatedAt":iso(NOW - 86400000),
                    "expiresAt":null,"remainingCount":null,"channelRef":null,
                    "entitlementBindingHash":format!("sha256:{}", "b".repeat(64)),"authorizationVersion":4,
                    "deviceStateVersion":2,"isActivated":true,"bindingValid":outcome != "ready_missing"}});
            if let Some(alter) = self.alter {
                alter(&mut body);
            }
            let bytes = serde_json::to_vec(&body).unwrap();
            let date =
                httpdate::fmt_http_date(std::time::UNIX_EPOCH + Duration::from_millis(NOW as u64));
            let digest = license::compute_digest(&bytes);
            let signature = SigningKey::from_bytes(&[61; 32]).sign(
                license::build_signing_string(
                    self.signing_target,
                    crate::secure_strings::license_host(),
                    &date,
                    &digest,
                )
                .as_bytes(),
            );
            Ok(LicenseHttpResponse {
                status: self.status,
                date: Some(date),
                digest: Some(digest),
                body: bytes,
                signature: if self.missing_signature {
                    None
                } else {
                    Some(base64::engine::general_purpose::STANDARD.encode(signature.to_bytes()))
                },
            })
        }
    }
    fn run(http: &MockHttp, store: &Memory) -> RestoreResult {
        restore(
            &cfg(),
            &Ports {
                http,
                store,
                clock: &Clock,
                budget: &TestBudget(Cell::new(NATIVE_BUDGET)),
                points: &[],
            },
        )
    }
    #[test]
    fn already_bound_is_read_only_then_checked_save_preserves_original_term() {
        let store = Memory::new();
        let http = MockHttp::new(vec!["already_bound"]);
        assert_eq!(run(&http, &store), RestoreResult::ready());
        assert_eq!(http.calls.borrow().len(), 1);
        let saved = store.read().unwrap();
        assert_eq!(saved.activated_at, iso(NOW - 86400000));
        assert_eq!(saved.expires_at, None);
        assert!(saved.signature_verified);
    }
    #[test]
    fn missing_binding_uses_original_fence_and_only_one_restore() {
        let store = Memory::new();
        let http = MockHttp::new(vec!["ready_missing", "restored"]);
        assert_eq!(run(&http, &store), RestoreResult::ready());
        let calls = http.calls.borrow();
        assert_eq!(calls.len(), 2);
        assert_eq!(
            calls[1]["expectedStateDigest"],
            format!("sha256:{}", "a".repeat(64))
        );
        assert_ne!(calls[0]["nonce"], calls[1]["nonce"]);
    }
    #[test]
    fn lost_restore_response_converges_read_only_without_another_mutation() {
        let store = Memory::new();
        let http = MockHttp::new(vec!["ready_missing", "lost", "already_bound"]);
        assert_eq!(run(&http, &store), RestoreResult::ready());
        let calls = http.calls.borrow();
        assert_eq!(calls.iter().filter(|r| r["action"] == "restore").count(), 1);
        assert_eq!(calls[2]["action"], "inspect");
    }
    #[test]
    fn lost_response_still_missing_requires_new_explicit_observation() {
        let store = Memory::new();
        let original = store.read();
        let http = MockHttp::new(vec!["ready_missing", "lost", "ready_missing"]);
        let result = run(&http, &store);
        assert_eq!(result.status, "unknown");
        assert_eq!(result.reason_code, "RESTORE_CONTINUE_REQUIRED");
        assert_eq!(store.read(), original);
        assert_eq!(store.writes.get(), 0);
    }
    #[test]
    fn weak_legacy_flag_never_allows_an_unsigned_restore_response() {
        let store = Memory::new();
        let old = store.read();
        let mut http = MockHttp::new(vec!["already_bound"]);
        http.missing_signature = true;
        assert!(!cfg().strict_verify);
        assert_eq!(
            run(&http, &store).reason_code,
            "RESTORE_RESPONSE_UNVERIFIED"
        );
        assert_eq!(store.read(), old);
        assert_eq!(store.writes.get(), 0);
    }
    #[test]
    fn old_route_signatures_and_old_servers_never_trigger_activate_fallback() {
        for status in [200, 404, 405] {
            let store = Memory::new();
            let mut http = MockHttp::new(vec!["already_bound"]);
            http.status = status;
            http.signing_target = "post /api/license/activate";
            assert_eq!(run(&http, &store).status, "blocked");
            assert_eq!(http.calls.borrow().len(), 1);
            assert_eq!(store.writes.get(), 0);
        }
    }
    #[test]
    fn closed_response_nonce_date_and_integer_validation_keeps_original_file() {
        let alterations: Vec<fn(&mut Value)> = vec![
            |v| {
                v["nonce"] = "wrong".into();
            },
            |v| {
                v["serverTime"] = iso(NOW - 120001).into();
            },
            |v| {
                v["serverTime"] = iso(NOW + 2001).into();
            },
            |v| {
                v["serverTime"] = "2026-02-31T00:00:00.000Z".into();
            },
            |v| {
                v["contractVersion"] = "legacy".into();
            },
            |v| {
                v["success"] = true.into();
            },
            |v| {
                v.as_object_mut().unwrap().remove("code");
            },
            |v| {
                v["license"].as_object_mut().unwrap().remove("channelRef");
            },
            |v| {
                v["license"]["authorizationVersion"] = 0.into();
            },
            |v| {
                v["license"]["deviceStateVersion"] = (SAFE_INTEGER + 1).into();
            },
            |v| {
                v["license"]["entitlementBindingHash"] = "invalid".into();
            },
            |v| {
                v["license"]["bindingValid"] = false.into();
            },
            |v| {
                v["license"]["isActivated"] = false.into();
            },
            |v| {
                v["invalidBindingCount"] = 1.into();
            },
            |v| {
                v["expectedStateDigest"] = format!("sha256:{}", "a".repeat(64)).into();
            },
        ];
        for alter in alterations {
            let store = Memory::new();
            let old = store.read();
            let mut http = MockHttp::new(vec!["already_bound"]);
            http.alter = Some(alter);
            assert_eq!(
                run(&http, &store).reason_code,
                "RESTORE_RESPONSE_UNVERIFIED"
            );
            assert_eq!(store.read(), old);
            assert_eq!(store.writes.get(), 0);
        }
    }
    #[test]
    fn preserved_identity_and_term_are_checked_before_any_restore_write() {
        let alterations: Vec<fn(&mut Value)> = vec![
            |v| {
                v["license"]["projectKey"] = "another-project".into();
            },
            |v| {
                v["license"]["channelRef"] = "another-channel".into();
            },
            |v| {
                v["license"]["expiresAt"] = iso(NOW + 86400000).into();
            },
        ];
        for alter in alterations {
            let store = Memory::new();
            let mut http = MockHttp::new(vec!["ready_missing"]);
            http.alter = Some(alter);
            assert_eq!(run(&http, &store).reason_code, "RESTORE_IDENTITY_CHANGED");
            assert_eq!(http.calls.borrow().len(), 1);
            assert_eq!(store.writes.get(), 0);
        }
    }
    #[test]
    fn signed_denial_does_not_become_an_unknown_retry_or_erase_license() {
        let store = Memory::new();
        let old = store.read();
        let mut http = MockHttp::new(vec!["denied"]);
        http.status = 409;
        http.alter = Some(|v| {
            v["code"] = "RESTORE_ACTIVE_BINDING_CONFLICT".into();
            v["license"] = Value::Null;
            v["expectedStateDigest"] = Value::Null;
            v["invalidBindingCount"] = 0.into();
        });
        let result = run(&http, &store);
        assert_eq!(result.reason_code, "RESTORE_ACTIVE_BINDING_CONFLICT");
        assert_eq!(result.status, "blocked");
        assert_eq!(store.read(), old);
        assert_eq!(http.calls.borrow().len(), 1);
    }
    #[test]
    fn checked_readback_resolves_replace_error_and_distinguishes_old_from_unknown() {
        for mode in [1, 2, 3] {
            let store = Memory::new();
            store.write_mode.set(mode);
            let http = MockHttp::new(vec!["already_bound"]);
            let result = run(&http, &store);
            match mode {
                1 => {
                    assert_eq!(result.status, "blocked");
                    assert_eq!(result.persistence, "unchanged");
                }
                2 => {
                    assert_eq!(result.status, "unknown");
                    assert_eq!(result.persistence, "unknown");
                }
                _ => assert_eq!(result, RestoreResult::ready()),
            }
            assert_eq!(store.writes.get(), 1);
        }
    }
    #[test]
    fn time_and_count_keep_the_actual_original_entitlement() {
        let store = Memory::new();
        store.value.borrow_mut().as_mut().unwrap().expires_at = Some(iso(NOW + 86400000));
        let mut http = MockHttp::new(vec!["already_bound"]);
        http.alter = Some(|v| {
            v["license"]["expiresAt"] = iso(NOW + 86400000).into();
        });
        assert_eq!(run(&http, &store), RestoreResult::ready());
        assert_eq!(store.read().unwrap().expires_at, Some(iso(NOW + 86400000)));
        let store = Memory::new();
        store.value.borrow_mut().as_mut().unwrap().license_mode = "COUNT".into();
        let mut http = MockHttp::new(vec!["already_bound"]);
        http.alter = Some(|v| {
            v["license"]["licenseMode"] = "COUNT".into();
            v["license"]["remainingCount"] = 7.into();
        });
        assert_eq!(run(&http, &store), RestoreResult::ready());
        assert_eq!(store.read().unwrap().license_mode, "COUNT");
        assert_eq!(http.calls.borrow().len(), 1);
    }
    #[test]
    fn equality_at_expiry_and_depleted_counts_never_install() {
        let store = Memory::new();
        store.value.borrow_mut().as_mut().unwrap().expires_at = Some(iso(NOW));
        let mut http = MockHttp::new(vec!["already_bound"]);
        http.alter = Some(|v| {
            v["license"]["expiresAt"] = iso(NOW).into();
        });
        assert_eq!(run(&http, &store).status, "blocked");
        assert_eq!(store.writes.get(), 0);
        let store = Memory::new();
        store.value.borrow_mut().as_mut().unwrap().license_mode = "COUNT".into();
        let mut http = MockHttp::new(vec!["already_bound"]);
        http.alter = Some(|v| {
            v["license"]["licenseMode"] = "COUNT".into();
            v["license"]["remainingCount"] = 0.into();
        });
        assert_eq!(run(&http, &store).status, "blocked");
        assert_eq!(store.writes.get(), 0);
    }
    #[test]
    fn host_or_saved_machine_change_and_rollback_stop_before_network() {
        let store = Memory::new();
        let http = MockHttp::new(vec![]);
        let mut cfg = cfg();
        cfg.machine_id = "changed".into();
        let budget = TestBudget(Cell::new(NATIVE_BUDGET));
        let ports = Ports {
            http: &http,
            store: &store,
            clock: &Clock,
            budget: &budget,
            points: &[],
        };
        assert_eq!(
            restore(&cfg, &ports).reason_code,
            "RESTORE_IDENTITY_CHANGED"
        );
        cfg.machine_id = "fixture-machine".into();
        cfg.base_url = "https://untrusted.invalid".into();
        assert_eq!(
            restore(&cfg, &ports).reason_code,
            "RESTORE_RESPONSE_UNVERIFIED"
        );
        cfg.base_url =
            crate::secure_strings::s(crate::secure_strings::ids::LICENSE_BASE_URL).into();
        store.value.borrow_mut().as_mut().unwrap().last_seen_ms = NOW + 3600001;
        assert_eq!(
            restore(&cfg, &ports).reason_code,
            "RESTORE_RESPONSE_UNVERIFIED"
        );
        assert_eq!(http.calls.borrow().len(), 0);
    }
    #[test]
    fn external_snapshot_replacement_is_never_overwritten() {
        struct Changing<'a> {
            http: MockHttp,
            store: &'a Memory,
        }
        impl Http for Changing<'_> {
            fn post(
                &self,
                url: &str,
                body: &str,
                timeout: Duration,
            ) -> Result<LicenseHttpResponse, ()> {
                let reply = self.http.post(url, body, timeout);
                self.store.value.borrow_mut().as_mut().unwrap().code = "new-external-code".into();
                reply
            }
        }
        let store = Memory::new();
        let http = Changing {
            http: MockHttp::new(vec!["already_bound"]),
            store: &store,
        };
        let result = restore(
            &cfg(),
            &Ports {
                http: &http,
                store: &store,
                clock: &Clock,
                budget: &TestBudget(Cell::new(NATIVE_BUDGET)),
                points: &[],
            },
        );
        assert_eq!(result.reason_code, "RESTORE_IDENTITY_CHANGED");
        assert_eq!(store.writes.get(), 0);
        assert_eq!(store.read().unwrap().code, "new-external-code");
    }
    #[test]
    fn all_requests_share_original_remaining_budget_and_exhaustion_prevents_write() {
        struct Timed<'a> {
            http: MockHttp,
            budget: &'a TestBudget,
            left: RefCell<Vec<Duration>>,
            timeouts: RefCell<Vec<Duration>>,
        }
        impl Http for Timed<'_> {
            fn post(
                &self,
                url: &str,
                body: &str,
                timeout: Duration,
            ) -> Result<LicenseHttpResponse, ()> {
                self.timeouts.borrow_mut().push(timeout);
                let reply = self.http.post(url, body, timeout);
                self.budget.0.set(self.left.borrow_mut().remove(0));
                reply
            }
        }
        let store = Memory::new();
        let budget = TestBudget(Cell::new(Duration::from_millis(150000)));
        let http = Timed {
            http: MockHttp::new(vec!["ready_missing", "restored"]),
            budget: &budget,
            left: RefCell::new(vec![
                Duration::from_millis(30000),
                Duration::from_millis(5000),
            ]),
            timeouts: RefCell::new(vec![]),
        };
        assert_eq!(
            restore(
                &cfg(),
                &Ports {
                    http: &http,
                    store: &store,
                    clock: &Clock,
                    budget: &budget,
                    points: &[]
                }
            ),
            RestoreResult::ready()
        );
        assert_eq!(
            *http.timeouts.borrow(),
            vec![REQUEST_BUDGET, Duration::from_millis(30000)]
        );
        let store = Memory::new();
        let budget = TestBudget(Cell::new(REQUEST_BUDGET));
        let http = Timed {
            http: MockHttp::new(vec!["ready_missing"]),
            budget: &budget,
            left: RefCell::new(vec![Duration::ZERO]),
            timeouts: RefCell::new(vec![]),
        };
        let result = restore(
            &cfg(),
            &Ports {
                http: &http,
                store: &store,
                clock: &Clock,
                budget: &budget,
                points: &[],
            },
        );
        assert_eq!(result.status, "blocked");
        assert_eq!(http.http.calls.borrow().len(), 1);
        assert_eq!(store.writes.get(), 0);
    }
    #[test]
    fn flight_is_not_released_by_an_observer_leaving() {
        let flag = std::sync::atomic::AtomicBool::new(false);
        let execution = Flight::acquire(&flag).unwrap();
        assert!(Flight::acquire(&flag).is_none());
        assert!(Flight::acquire(&flag).is_none());
        drop(execution);
        assert!(Flight::acquire(&flag).is_some());
        let expired = Deadline(Instant::now() - NATIVE_BUDGET);
        assert_eq!(expired.remaining(), Duration::ZERO);
    }
    #[test]
    fn public_result_never_contains_saved_identity_or_keys() {
        let value =
            serde_json::to_string(&run(&MockHttp::new(vec!["already_bound"]), &Memory::new()))
                .unwrap();
        for secret in [
            "SYNTHETIC",
            "fixture-machine",
            "entitlement",
            "signature",
            "channelRef",
            "projectKey",
        ] {
            assert!(!value.contains(secret));
        }
    }
    #[test]
    fn inspect_identity_is_immutable_across_restore_and_versions_never_regress() {
        let changes: Vec<fn(&mut Value)> = vec![
            |v| {
                if v["action"] == "restore" {
                    v["license"]["entitlementBindingHash"] =
                        format!("sha256:{}", "c".repeat(64)).into();
                }
            },
            |v| {
                if v["action"] == "restore" {
                    v["license"]["activatedAt"] = iso(NOW - 172800000).into();
                }
            },
            |v| {
                if v["action"] == "restore" {
                    v["license"]["authorizationVersion"] = 3.into();
                }
            },
            |v| {
                if v["action"] == "restore" {
                    v["license"]["deviceStateVersion"] = 1.into();
                }
            },
        ];
        for change in changes {
            let store = Memory::new();
            let mut http = MockHttp::new(vec!["ready_missing", "restored"]);
            http.alter = Some(change);
            let result = run(&http, &store);
            assert_eq!(result.reason_code, "RESTORE_IDENTITY_CHANGED");
            assert_eq!(store.writes.get(), 0);
        }
    }
    #[test]
    fn expiry_while_response_is_in_transit_cannot_install_an_expired_license() {
        struct LateClock;
        impl license::LicenseClock for LateClock {
            fn wall_ms(&self) -> i64 {
                NOW + 2000
            }
        }
        let store = Memory::new();
        store.value.borrow_mut().as_mut().unwrap().expires_at = Some(iso(NOW + 1000));
        let mut http = MockHttp::new(vec!["already_bound"]);
        http.alter = Some(|v| {
            v["license"]["expiresAt"] = iso(NOW + 1000).into();
        });
        let result = restore(
            &cfg(),
            &Ports {
                http: &http,
                store: &store,
                clock: &LateClock,
                budget: &TestBudget(Cell::new(NATIVE_BUDGET)),
                points: &[],
            },
        );
        assert_eq!(result.status, "blocked");
        assert_eq!(store.writes.get(), 0);
    }
    #[test]
    fn expiry_during_atomic_save_is_confirmed_but_never_ready() {
        struct MovingClock(Cell<i64>);
        impl license::LicenseClock for MovingClock {
            fn wall_ms(&self) -> i64 {
                self.0.get()
            }
        }
        struct MovingStore<'a> {
            inner: Memory,
            clock: &'a MovingClock,
        }
        impl Store for MovingStore<'_> {
            fn read(&self) -> Option<LicenseSnapshot> {
                self.inner.read()
            }
            fn write(&self, value: &LicenseSnapshot) -> Result<(), ()> {
                let result = self.inner.write(value);
                self.clock.0.set(NOW + 2000);
                result
            }
        }
        let clock = MovingClock(Cell::new(NOW));
        let store = MovingStore {
            inner: Memory::new(),
            clock: &clock,
        };
        store.inner.value.borrow_mut().as_mut().unwrap().expires_at = Some(iso(NOW + 1000));
        let mut http = MockHttp::new(vec!["already_bound"]);
        http.alter = Some(|v| {
            v["license"]["expiresAt"] = iso(NOW + 1000).into();
        });
        let result = restore(
            &cfg(),
            &Ports {
                http: &http,
                store: &store,
                clock: &clock,
                budget: &TestBudget(Cell::new(NATIVE_BUDGET)),
                points: &[],
            },
        );
        assert_eq!(result.status, "blocked");
        assert_eq!(result.persistence, "confirmed");
        assert_eq!(result.binding_status, "verified");
        assert_eq!(store.inner.writes.get(), 1);
    }
    #[test]
    fn actual_activity_issuer_vectors_pass_the_real_strict_native_consumer() {
        let fixture: Value = serde_json::from_str(include_str!(
            "../../../docs/verification/t1423/activity-restore-issued-fixtures.json"
        ))
        .unwrap();
        let mut config = cfg();
        config.public_key_b64 = fixture["publicKeyRawBase64"].as_str().unwrap().into();
        let vectors = fixture["vectors"].as_array().unwrap();
        assert_eq!(vectors.len(), 4);
        for vector in vectors {
            let request = &vector["request"];
            let body: Value = serde_json::from_str(vector["rawBody"].as_str().unwrap()).unwrap();
            let mut original = snapshot();
            original.code = request["code"].as_str().unwrap().into();
            original.machine_id = request["machineId"].as_str().unwrap().into();
            original.project_key = request["projectKey"].as_str().unwrap().into();
            config.machine_id = original.machine_id.clone();
            config.project_key = original.project_key.clone();
            if !body["license"].is_null() {
                original.channel_ref = body["license"]["channelRef"].as_str().map(str::to_owned);
                original.license_mode = body["license"]["licenseMode"].as_str().unwrap().into();
                original.expires_at = body["license"]["expiresAt"].as_str().map(str::to_owned);
            }
            let headers = &vector["headers"];
            let response = LicenseHttpResponse {
                status: vector["status"].as_u64().unwrap() as u16,
                signature: headers["x-license-signature"].as_str().map(str::to_owned),
                date: headers["x-license-date"].as_str().map(str::to_owned),
                digest: headers["x-license-digest"].as_str().map(str::to_owned),
                body: vector["rawBody"].as_str().unwrap().as_bytes().to_vec(),
            };
            let result = verified_reply(
                &config,
                &original,
                response,
                request["action"].as_str().unwrap(),
                request["nonce"].as_str().unwrap(),
                vector["clockMs"].as_i64().unwrap(),
            )
            .unwrap();
            match (vector["outcome"].as_str().unwrap(), result) {
                ("ready_missing", Reply::Missing(_, _))
                | ("restored" | "already_bound", Reply::Current(_, _))
                | ("denied", Reply::Denied(_)) => {}
                _ => panic!("实际签发向量的状态必须被精确消费"),
            }
        }
    }
    fn node_fixture() -> Value {
        serde_json::from_str(include_str!(
            "../../../docs/verification/t1423/fixtures/node-observation-v1.json"
        ))
        .unwrap()
    }
    fn observed_store(fixture: &Value) -> Memory {
        let store = Memory::new();
        let mut value = store.value.borrow_mut();
        let original = value.as_mut().unwrap();
        original.project_key = fixture["stableTuple"][1].as_str().unwrap().into();
        original.code = fixture["stableTuple"][2].as_str().unwrap().into();
        original.machine_id = fixture["stableTuple"][3].as_str().unwrap().into();
        drop(value);
        store
    }
    struct At(i64);
    impl license::LicenseClock for At {
        fn wall_ms(&self) -> i64 {
            self.0
        }
    }
    #[test]
    fn actual_node_envelope_pins_the_native_saved_object_and_cannot_be_replayed() {
        let fixture = node_fixture();
        let store = observed_store(&fixture);
        let mut config = cfg();
        config.machine_id = store.read().unwrap().machine_id;
        let now = utc_ms(fixture["payload"]["issuedAt"].as_str().unwrap()).unwrap() + 1000;
        let mut used = std::collections::HashMap::new();
        let http = MockHttp::new(vec!["already_bound"]);
        let ports = Ports {
            http: &http,
            store: &store,
            clock: &At(now),
            budget: &TestBudget(Cell::new(NATIVE_BUDGET)),
            points: &[],
        };
        // Mock response is issued at NOW; observe at the fixture issue time using a matching signer clock below.
        let token = fixture["observationToken"].as_str().unwrap();
        let result = restore_observed(
            &config,
            &ports,
            token,
            fixture["syntheticMasterKeyBase64"].as_str().unwrap(),
            fixture["syntheticBootNonce"].as_str().unwrap(),
            &mut used,
        );
        assert_eq!(
            http.calls.borrow().len(),
            1,
            "真实Node token必须解封并调度一次原生inspect"
        );
        assert_eq!(used.len(), 1);
        assert_eq!(result, RestoreResult::ready());
        let second = restore_observed(
            &config,
            &ports,
            token,
            fixture["syntheticMasterKeyBase64"].as_str().unwrap(),
            fixture["syntheticBootNonce"].as_str().unwrap(),
            &mut used,
        );
        assert_eq!(second.reason_code, "RESTORE_CONTINUE_REQUIRED");
        assert!(second.retryable);
        assert_eq!(http.calls.borrow().len(), 1);
    }
    #[test]
    fn observation_rejects_changed_license_wrong_boot_expiry_and_plaintext_before_http() {
        let fixture = node_fixture();
        let now = utc_ms(fixture["payload"]["issuedAt"].as_str().unwrap()).unwrap() + 1000;
        for kind in [
            "changed-code",
            "wrong-boot",
            "expired",
            "plaintext",
            "wrong-key",
        ] {
            let store = observed_store(&fixture);
            let mut config = cfg();
            config.machine_id = store.read().unwrap().machine_id;
            if kind == "changed-code" {
                store.value.borrow_mut().as_mut().unwrap().code = "different-original".into();
            }
            let http = MockHttp::new(vec![]);
            let mut used = std::collections::HashMap::new();
            let time = At(if kind == "expired" {
                now + OBSERVATION_TTL_MS
            } else {
                now
            });
            let token = if kind == "plaintext" {
                fixture["plaintext"].as_str().unwrap()
            } else {
                fixture["observationToken"].as_str().unwrap()
            };
            let boot = if kind == "wrong-boot" {
                "another-start"
            } else {
                fixture["syntheticBootNonce"].as_str().unwrap()
            };
            let master = if kind == "wrong-key" {
                "invalid"
            } else {
                fixture["syntheticMasterKeyBase64"].as_str().unwrap()
            };
            let result = restore_observed(
                &config,
                &Ports {
                    http: &http,
                    store: &store,
                    clock: &time,
                    budget: &TestBudget(Cell::new(NATIVE_BUDGET)),
                    points: &[],
                },
                token,
                master,
                boot,
                &mut used,
            );
            assert_eq!(result.status, "blocked");
            assert_eq!(http.calls.borrow().len(), 0);
            assert_eq!(store.writes.get(), 0);
        }
    }
    fn seal_test_observation(fixture: &Value, plaintext: &[u8]) -> String {
        use aes_gcm::{
            aead::{Aead, KeyInit},
            Aes256Gcm, Nonce,
        };
        use sha2::Digest as _;
        let master = base64::engine::general_purpose::STANDARD
            .decode(fixture["syntheticMasterKeyBase64"].as_str().unwrap())
            .unwrap();
        let mut hasher = sha2::Sha256::new();
        hasher.update(master);
        hasher.update(OBSERVATION_PURPOSE);
        let key = hasher.finalize();
        let cipher = Aes256Gcm::new_from_slice(&key).unwrap();
        let iv = [17; 12];
        let encrypted = cipher.encrypt(Nonce::from_slice(&iv), plaintext).unwrap();
        let mut packed = iv.to_vec();
        packed.extend_from_slice(&encrypted[encrypted.len() - 16..]);
        packed.extend_from_slice(&encrypted[..encrypted.len() - 16]);
        format!(
            "enc:v1:{}",
            base64::engine::general_purpose::STANDARD.encode(packed)
        )
    }
    #[test]
    fn observation_rejects_tampering_and_noncanonical_or_open_payloads() {
        let fixture = node_fixture();
        let store = observed_store(&fixture);
        let mut config = cfg();
        config.machine_id = store.read().unwrap().machine_id;
        let now = utc_ms(fixture["payload"]["issuedAt"].as_str().unwrap()).unwrap() + 1000;
        for kind in [
            "unknown-field",
            "missing-field",
            "duplicate-field",
            "wrong-ttl",
            "bad-uuid",
            "future",
            "tamper",
            "noncanonical-base64",
            "oversized",
        ] {
            let mut payload = fixture["payload"].clone();
            match kind {
                "unknown-field" => {
                    payload["extra"] = json!(true);
                }
                "missing-field" => {
                    payload.as_object_mut().unwrap().remove("issuedAt");
                }
                "wrong-ttl" => {
                    payload["expiresAt"] = json!(iso(now + OBSERVATION_TTL_MS));
                }
                "bad-uuid" => {
                    payload["observationId"] = json!("dc128b4c-3052-5ddd-b253-a780d5983c87");
                }
                "future" => {
                    payload["issuedAt"] = json!(iso(now + 1));
                    payload["expiresAt"] = json!(iso(now + 1 + OBSERVATION_TTL_MS));
                }
                _ => {}
            }
            let mut plaintext = serde_json::to_string(&payload).unwrap();
            if kind == "duplicate-field" {
                plaintext = plaintext.replacen(
                    "{",
                    "{\"observationId\":\"dc128b4c-3052-4ddd-b253-a780d5983c87\",",
                    1,
                );
            }
            let mut token = seal_test_observation(&fixture, plaintext.as_bytes());
            if kind == "tamper" {
                token.replace_range(7..8, if &token[7..8] == "A" { "B" } else { "A" });
            }
            if kind == "noncanonical-base64" {
                token.push('=');
            }
            if kind == "oversized" {
                token = "x".repeat(4097);
            }
            let http = MockHttp::new(vec![]);
            let mut used = std::collections::HashMap::new();
            let result = restore_observed(
                &config,
                &Ports {
                    http: &http,
                    store: &store,
                    clock: &At(now),
                    budget: &TestBudget(Cell::new(NATIVE_BUDGET)),
                    points: &[],
                },
                &token,
                fixture["syntheticMasterKeyBase64"].as_str().unwrap(),
                fixture["syntheticBootNonce"].as_str().unwrap(),
                &mut used,
            );
            assert_eq!(result.reason_code, "RESTORE_CONTINUE_REQUIRED", "{kind}");
            assert!(result.retryable);
            assert!(used.is_empty());
            assert!(http.calls.borrow().is_empty());
            assert_eq!(store.writes.get(), 0);
        }
    }
    #[test]
    fn observation_capacity_keeps_live_replay_entries_and_only_reaps_expired_entries() {
        let fixture = node_fixture();
        let store = observed_store(&fixture);
        let mut config = cfg();
        config.machine_id = store.read().unwrap().machine_id;
        let now = utc_ms(fixture["payload"]["issuedAt"].as_str().unwrap()).unwrap() + 1000;
        let mut used: std::collections::HashMap<String, i64> = (0..MAX_OBSERVATIONS)
            .map(|i| (format!("earlier-{i}"), now + 10000))
            .collect();
        let http = MockHttp::new(vec!["already_bound"]);
        let ports = Ports {
            http: &http,
            store: &store,
            clock: &At(now),
            budget: &TestBudget(Cell::new(NATIVE_BUDGET)),
            points: &[],
        };
        let token = fixture["observationToken"].as_str().unwrap();
        let master = fixture["syntheticMasterKeyBase64"].as_str().unwrap();
        let boot = fixture["syntheticBootNonce"].as_str().unwrap();
        let blocked = restore_observed(&config, &ports, token, master, boot, &mut used);
        assert_eq!(blocked.reason_code, "RESTORE_CONTINUE_REQUIRED");
        assert_eq!(used.len(), 256);
        assert!(http.calls.borrow().is_empty());
        used.insert("earlier-0".into(), now);
        assert_eq!(
            restore_observed(&config, &ports, token, master, boot, &mut used),
            RestoreResult::ready()
        );
        assert_eq!(used.len(), 256);
        assert!(!used.contains_key("earlier-0"));
        assert!(used.contains_key("earlier-1"));
    }
    #[test]
    fn observation_cannot_reread_a_new_license_between_token_check_and_dispatch() {
        struct Switched {
            value: LicenseSnapshot,
            reads: Cell<usize>,
        }
        impl Store for Switched {
            fn read(&self) -> Option<LicenseSnapshot> {
                let n = self.reads.get();
                self.reads.set(n + 1);
                let mut value = self.value.clone();
                if n > 0 {
                    value.code = "different-original".into();
                }
                Some(value)
            }
            fn write(&self, _: &LicenseSnapshot) -> Result<(), ()> {
                panic!("不得写入切换后的许可")
            }
        }
        let fixture = node_fixture();
        let store = Switched {
            value: observed_store(&fixture).read().unwrap(),
            reads: Cell::new(0),
        };
        let mut config = cfg();
        config.machine_id = store.value.machine_id.clone();
        let http = MockHttp::new(vec![]);
        let now = utc_ms(fixture["payload"]["issuedAt"].as_str().unwrap()).unwrap() + 1000;
        let result = restore_observed(
            &config,
            &Ports {
                http: &http,
                store: &store,
                clock: &At(now),
                budget: &TestBudget(Cell::new(NATIVE_BUDGET)),
                points: &[],
            },
            fixture["observationToken"].as_str().unwrap(),
            fixture["syntheticMasterKeyBase64"].as_str().unwrap(),
            fixture["syntheticBootNonce"].as_str().unwrap(),
            &mut Default::default(),
        );
        assert_eq!(result.reason_code, "RESTORE_IDENTITY_CHANGED");
        assert!(http.calls.borrow().is_empty());
    }
    #[test]
    fn old_observation_limits_http_to_its_original_remaining_budget() {
        struct BoundedHttp(Cell<usize>);
        impl Http for BoundedHttp {
            fn post(&self, _: &str, _: &str, timeout: Duration) -> Result<LicenseHttpResponse, ()> {
                assert!(timeout <= Duration::from_millis(1000));
                self.0.set(self.0.get() + 1);
                Err(())
            }
        }
        let fixture = node_fixture();
        let store = observed_store(&fixture);
        let mut config = cfg();
        config.machine_id = store.read().unwrap().machine_id;
        let now = utc_ms(fixture["payload"]["expiresAt"].as_str().unwrap()).unwrap() - 1000;
        let http = BoundedHttp(Cell::new(0));
        let result = restore_observed(
            &config,
            &Ports {
                http: &http,
                store: &store,
                clock: &At(now),
                budget: &TestBudget(Cell::new(NATIVE_BUDGET)),
                points: &[],
            },
            fixture["observationToken"].as_str().unwrap(),
            fixture["syntheticMasterKeyBase64"].as_str().unwrap(),
            fixture["syntheticBootNonce"].as_str().unwrap(),
            &mut Default::default(),
        );
        assert_eq!(http.0.get(), 1);
        assert_eq!(result.reason_code, "RESTORE_UNAVAILABLE");
        assert_eq!(store.writes.get(), 0);
    }
}
