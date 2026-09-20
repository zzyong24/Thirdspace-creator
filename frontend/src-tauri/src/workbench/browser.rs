//! T-1008 Rust browser composition. The sidecar must hold backend admission
//! (execution attempt/fence and physical profile lease) for every request.
//! This module never opens the legacy Playwright profile directory.
use nomi_browser::ManagedEngineHostFactory;
use nomi_browser_engine::EngineConfig;
use nomifun_browser_platform::{
    BrowserErrorCode, BrowserIdentityMode, BrowserLaneClient, BrowserLaneId, BrowserOperation,
    BrowserOperationKind, BrowserPlatformError, BrowserSessionHub, BrowserSurface, CallerIdentity,
    HubConfig,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::collections::{BTreeSet, HashMap, HashSet};
use std::ffi::CString;
use std::fs::DirBuilder;
use std::os::unix::ffi::OsStrExt;
use std::os::unix::fs::{DirBuilderExt, PermissionsExt};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::atomic::{AtomicBool, AtomicU8, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};
use url::Url;

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BrowserAdmission {
    pub user_id: String,
    pub account_id: String,
    pub task_id: String,
    pub attempt: u32,
    pub fence_token: String,
    pub domain: String,
    pub profile_key: String,
    pub profile_lease_id: String,
    pub lane_name: String,
    pub expires_at_ms: u64,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum IdentityChoice {
    Primary,
    Anonymous,
}

#[derive(Debug, Deserialize)]
#[serde(
    tag = "kind",
    rename_all = "snake_case",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum BrowserAction {
    Open,
    /// Fresh host observation for backend verifyProfileStopped. No lane is minted.
    StopProof,
    /// Expired attempts may close only lanes sealed to their existing owner client.
    Cleanup,
    Status {
        lane_id: String,
    },
    Execute {
        lane_id: String,
        expected_browser_epoch: u64,
        action: String,
        #[serde(default)]
        input: Value,
        target_id: Option<String>,
        frame_id: Option<String>,
        ref_generation: Option<u64>,
    },
    Close {
        lane_id: String,
        expected_browser_epoch: u64,
    },
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BrowserRequest {
    pub operation_id: String,
    pub admission: BrowserAdmission,
    pub identity_mode: IdentityChoice,
    pub action: BrowserAction,
}

/// The PID-bound sidecar asks for this exact directory before acquiring the
/// backend profile lease. It must check the account against RequestContext.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BrowserLocationRequest {
    pub operation_id: String,
    pub action: BrowserLocationAction,
}

#[derive(Debug, Deserialize)]
#[serde(
    tag = "kind",
    rename_all = "snake_case",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum BrowserLocationAction {
    ProfileLocation {
        user_id: String,
        account_id: String,
        task_id: String,
        identity_mode: IdentityChoice,
    },
}

#[derive(Debug, Deserialize)]
#[serde(untagged)]
pub enum BrowserSocketRequest {
    Location(BrowserLocationRequest),
    Dispatch(BrowserRequest),
}

#[derive(Debug)]
pub struct BrowserHostError {
    pub code: &'static str,
}

impl BrowserHostError {
    fn invalid() -> Self {
        Self {
            code: "INVALID_ADMISSION",
        }
    }
    fn unavailable() -> Self {
        Self {
            code: "BROWSER_UNAVAILABLE",
        }
    }
    fn denied() -> Self {
        Self {
            code: "OPERATION_NOT_ALLOWED",
        }
    }
    fn scope() -> Self {
        Self {
            code: "DOMAIN_SCOPE_VIOLATION",
        }
    }
    fn platform() -> Self {
        Self {
            code: "BROWSER_PLATFORM_ERROR",
        }
    }
    fn from_platform(error: BrowserPlatformError) -> Self {
        let code = match error.code {
            BrowserErrorCode::StaleBrowserEpoch => "STALE_BROWSER_EPOCH",
            BrowserErrorCode::StaleLaneRef => "STALE_LANE_REF",
            BrowserErrorCode::LaneNotFound => "LANE_NOT_FOUND",
            BrowserErrorCode::OwnerLeaseExpired => "OWNER_LEASE_EXPIRED",
            BrowserErrorCode::BrowserCapacityQueued => "BROWSER_CAPACITY_QUEUED",
            BrowserErrorCode::OperationNotAllowed => "OPERATION_NOT_ALLOWED",
            BrowserErrorCode::BrowserUnavailable => "BROWSER_UNAVAILABLE",
            _ => "BROWSER_PLATFORM_ERROR",
        };
        Self { code }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Hash, Serialize)]
pub enum DomainKey {
    Account { user_id: String, account_id: String },
    Anonymous { user_id: String, task_id: String },
}

#[derive(Clone)]
struct BoundClient {
    client: BrowserLaneClient,
    profile_lease_id: String,
}

#[derive(Clone)]
struct DomainState {
    hub: BrowserSessionHub,
    domain: String,
    profile_key: String,
    profile_lease_id: String,
    clients: Arc<Mutex<HashMap<String, BoundClient>>>,
    registered_scopes: Arc<Mutex<HashSet<String>>>,
    // 0: pre-existing profile, no launch attempted by this host;
    // 1: empty physical directory, no launch attempted by this host;
    // 2: launch outcome uncertain; 3: vendor accepted launch and owns cleanup.
    proof_state: Arc<AtomicU8>,
    in_flight_opens: Arc<AtomicUsize>,
    proof_gate: Arc<tokio::sync::RwLock<()>>,
    retired: Arc<AtomicBool>,
}

struct OpenAttemptGuard(Arc<AtomicUsize>);
impl Drop for OpenAttemptGuard {
    fn drop(&mut self) {
        self.0.fetch_sub(1, Ordering::AcqRel);
    }
}

pub struct BrowserHost {
    root: PathBuf,
    bundled_chrome: PathBuf,
    domains: Mutex<HashMap<DomainKey, DomainState>>,
}

pub(super) fn valid_id(value: &str) -> bool {
    !value.trim().is_empty() && value.len() <= 128 && !value.chars().any(char::is_control)
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

impl BrowserHost {
    fn hub_config(key: &DomainKey) -> HubConfig {
        HubConfig {
            // Fresh Primary profiles have no verified login. A native window
            // lets the user authenticate directly; Anonymous stays headless.
            headful: matches!(key, DomainKey::Account { .. }),
            ..HubConfig::default()
        }
    }

    pub fn new(root: PathBuf, bundled_chrome: PathBuf) -> Self {
        Self {
            root,
            bundled_chrome,
            domains: Mutex::new(HashMap::new()),
        }
    }

    pub fn domain_for(
        &self,
        admission: &BrowserAdmission,
        mode: IdentityChoice,
    ) -> Result<DomainKey, BrowserHostError> {
        self.validate_fields(admission)?;
        Ok(match mode {
            IdentityChoice::Primary => DomainKey::Account {
                user_id: admission.user_id.clone(),
                account_id: admission.account_id.clone(),
            },
            IdentityChoice::Anonymous => DomainKey::Anonymous {
                user_id: admission.user_id.clone(),
                task_id: admission.task_id.clone(),
            },
        })
    }

    pub fn profile_root(&self, domain: &DomainKey) -> PathBuf {
        // No untrusted identifier is interpolated as a path component.
        let digest = Sha256::digest(serde_json::to_vec(domain).unwrap_or_default());
        self.root.join(format!("{:x}", digest)).join("profile")
    }

    fn canonical_profile(&self, domain: &DomainKey) -> Result<PathBuf, BrowserHostError> {
        self.profile_path(domain, true)
    }

    fn profile_path(&self, domain: &DomainKey, create: bool) -> Result<PathBuf, BrowserHostError> {
        if create {
            Self::ensure_directory(&self.root)?;
        } else {
            Self::check_directory(&self.root)?;
        }
        let parent = self
            .profile_root(domain)
            .parent()
            .ok_or_else(BrowserHostError::invalid)?
            .to_owned();
        if create {
            Self::ensure_directory(&parent)?;
        } else {
            Self::check_directory(&parent)?;
        }
        let profile = self.profile_root(domain);
        if create {
            Self::ensure_directory(&profile)?;
        }
        let canonical_parent =
            std::fs::canonicalize(parent).map_err(|_| BrowserHostError::unavailable())?;
        let canonical = match std::fs::symlink_metadata(&profile) {
            Ok(_) => {
                Self::check_directory(&profile)?;
                std::fs::canonicalize(profile).map_err(|_| BrowserHostError::unavailable())?
            }
            Err(error) if !create && error.kind() == std::io::ErrorKind::NotFound => {
                canonical_parent.join("profile")
            }
            Err(_) => return Err(BrowserHostError::unavailable()),
        };
        if canonical.parent() != Some(canonical_parent.as_path()) {
            return Err(BrowserHostError::invalid());
        }
        Ok(canonical)
    }

    fn ensure_directory(path: &Path) -> Result<(), BrowserHostError> {
        match std::fs::symlink_metadata(path) {
            Ok(metadata) if metadata.file_type().is_symlink() || !metadata.is_dir() => {
                return Err(BrowserHostError::invalid());
            }
            Ok(_) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                match DirBuilder::new().mode(0o700).create(path) {
                    Ok(()) => {}
                    // Two account opens can create a shared parent at once.
                    // Recheck the winner's inode below; a symlink or file is
                    // still rejected, rather than treating this as success.
                    Err(race) if race.kind() == std::io::ErrorKind::AlreadyExists => {}
                    Err(_) => return Err(BrowserHostError::unavailable()),
                }
            }
            Err(_) => return Err(BrowserHostError::unavailable()),
        }
        Self::check_directory(path)?;
        let permissions = std::fs::metadata(path)
            .map_err(|_| BrowserHostError::unavailable())?
            .permissions();
        if permissions.mode() & 0o077 != 0 {
            std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o700))
                .map_err(|_| BrowserHostError::unavailable())?;
        }
        Ok(())
    }

    fn check_directory(path: &Path) -> Result<(), BrowserHostError> {
        let metadata =
            std::fs::symlink_metadata(path).map_err(|_| BrowserHostError::unavailable())?;
        if metadata.file_type().is_symlink() || !metadata.is_dir() {
            return Err(BrowserHostError::invalid());
        }
        Ok(())
    }

    fn profile_key(path: &Path) -> String {
        let mut digest = Sha256::new();
        // Same physical-directory key protocol as the existing collection resolver.
        digest.update(b"creatoros-browser-profile\0");
        digest.update(path.to_string_lossy().as_bytes());
        format!("{:x}", digest.finalize())
    }

    fn os_profile_process_absent(path: &Path) -> bool {
        // The host only launches this profile with an explicit user-data-dir.
        // Also check open files: a surviving child need not carry that flag.
        // A failed or incomplete OS listing cannot establish absence.
        let Ok(output) = Command::new("/bin/ps")
            .args(["-ww", "-axo", "command="])
            .output()
        else {
            return false;
        };
        if !output.status.success() || output.stdout.is_empty() {
            return false;
        }
        let marker = format!("--user-data-dir={}", path.display());
        if output
            .stdout
            .windows(marker.len())
            .any(|window| window == marker.as_bytes())
        {
            return false;
        }
        // Anonymous profiles are ephemeral: a successful close removes the
        // directory. A later owner creates a different inode at this path.
        // No process advertising this user-data-dir remains (checked above).
        match std::fs::symlink_metadata(path) {
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return true,
            Ok(metadata) if metadata.is_dir() && !metadata.file_type().is_symlink() => {}
            _ => return false,
        }
        let Ok(open_files) = Command::new("/usr/sbin/lsof")
            .args(["-n", "-P", "-F0", "+D"])
            .arg(path)
            .output()
        else {
            return false;
        };
        // lsof exits 1 with no output when no file beneath this directory is
        // open. Any partial listing, warning, or failed scan is inconclusive.
        open_files.status.code() == Some(1)
            && open_files.stdout.is_empty()
            && open_files.stderr.is_empty()
    }

    pub fn profile_key_for(&self, domain: &DomainKey) -> Result<String, BrowserHostError> {
        Ok(Self::profile_key(&self.profile_path(domain, false)?))
    }

    pub fn profile_location(
        &self,
        user_id: &str,
        account_id: &str,
        task_id: &str,
        mode: IdentityChoice,
    ) -> Result<Value, BrowserHostError> {
        if !valid_id(user_id) || !valid_id(account_id) || !valid_id(task_id) {
            return Err(BrowserHostError::invalid());
        }
        let domain = match mode {
            IdentityChoice::Primary => DomainKey::Account {
                user_id: user_id.to_owned(),
                account_id: account_id.to_owned(),
            },
            IdentityChoice::Anonymous => DomainKey::Anonymous {
                user_id: user_id.to_owned(),
                task_id: task_id.to_owned(),
            },
        };
        let profile = self.canonical_profile(&domain)?;
        Ok(json!({
            "managedProfileRoot": profile,
            "profileKey": Self::profile_key(&profile),
            "identityMode": mode,
            "legacyIdentityImported": false,
            "primaryLoginState": "unverified",
            "bundledBrowserPathPresent": Self::packaged_chrome_available(&self.bundled_chrome)
                && std::env::var_os("NOMIFUN_CHROME_BINARY").is_none(),
        }))
    }

    fn validate_fields(&self, admission: &BrowserAdmission) -> Result<(), BrowserHostError> {
        if ![
            &admission.user_id,
            &admission.account_id,
            &admission.task_id,
            &admission.fence_token,
            &admission.domain,
            &admission.profile_lease_id,
            &admission.lane_name,
        ]
        .into_iter()
        .all(|value| valid_id(value))
            || admission.attempt == 0
            || !Self::valid_domain(&admission.domain)
            || admission.profile_key.len() != 64
            || !admission
                .profile_key
                .bytes()
                .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
        {
            return Err(BrowserHostError::invalid());
        }
        Ok(())
    }

    fn valid_domain(domain: &str) -> bool {
        domain.len() <= 253
            && domain.contains('.')
            && !domain.starts_with('.')
            && !domain.ends_with('.')
            && !domain.contains("..")
            && domain
                .bytes()
                .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'.' || b == b'-')
            && domain
                .split('.')
                .all(|label| !label.is_empty() && !label.starts_with('-') && !label.ends_with('-'))
    }

    fn url_in_scope(domain: &str, mode: IdentityChoice, raw: &str) -> bool {
        if raw == "about:blank" {
            return true;
        }
        // url::Url canonicalizes an explicit default port (e.g. :443) to
        // None. Check the raw authority before parsing so the no-port policy
        // also applies to default ports and cannot drift from the Node gate.
        let Some((_, after_scheme)) = raw.split_once("://") else {
            return false;
        };
        let authority = after_scheme
            .split(|byte| matches!(byte, '/' | '?' | '#' | '\\'))
            .next()
            .unwrap_or("");
        if authority.is_empty() || authority.contains(':') {
            return false;
        }
        let Ok(url) = Url::parse(raw) else {
            return false;
        };
        let scheme_ok = url.scheme() == "https"
            || (mode == IdentityChoice::Anonymous && url.scheme() == "http");
        let Some(host) = url.host_str() else {
            return false;
        };
        scheme_ok
            && url.port().is_none()
            && url.username().is_empty()
            && url.password().is_none()
            && (host == domain
                || host
                    .strip_suffix(domain)
                    .is_some_and(|prefix| prefix.ends_with('.')))
    }

    fn tabs_in_scope(
        domain: &str,
        mode: IdentityChoice,
        tabs: &[nomifun_browser_platform::BrowserTabSnapshot],
    ) -> bool {
        tabs.iter().all(|tab| {
            tab.url
                .as_deref()
                .is_some_and(|url| Self::url_in_scope(domain, mode, url))
        })
    }

    pub fn validate_admission(&self, admission: &BrowserAdmission) -> Result<(), BrowserHostError> {
        self.validate_fields(admission)?;
        if admission.expires_at_ms <= now_ms() {
            return Err(BrowserHostError::invalid());
        }
        // NomiFun otherwise falls back to system Chrome or downloads at runtime.
        // This host deliberately requires the packaged, pinned CfT binary.
        if !Self::packaged_chrome_available(&self.bundled_chrome)
            || std::env::var_os("NOMIFUN_CHROME_BINARY").is_some()
        {
            return Err(BrowserHostError::unavailable());
        }
        Ok(())
    }

    pub fn packaged_chrome_available(bundled_root: &Path) -> bool {
        let executable = Self::packaged_chrome_executable(bundled_root);
        if !executable.is_file() {
            return false;
        }
        let Ok(path) = CString::new(executable.as_os_str().as_bytes()) else {
            return false;
        };
        unsafe { libc::access(path.as_ptr(), libc::X_OK) == 0 }
    }

    #[cfg(test)]
    fn bundled_executable(&self) -> PathBuf {
        Self::packaged_chrome_executable(&self.bundled_chrome)
    }

    fn packaged_chrome_executable(bundled_root: &Path) -> PathBuf {
        #[cfg(all(target_os = "macos", target_arch = "aarch64"))]
        const REL: &str = "chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing";
        #[cfg(all(target_os = "macos", target_arch = "x86_64"))]
        const REL: &str =
            "chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing";
        #[cfg(target_os = "windows")]
        const REL: &str = "chrome-win64/chrome.exe";
        #[cfg(not(any(target_os = "macos", target_os = "windows")))]
        const REL: &str = "chrome-linux64/chrome";
        bundled_root.join(REL)
    }

    async fn domain_state(
        &self,
        key: &DomainKey,
        admission: &BrowserAdmission,
        opening: bool,
    ) -> Result<DomainState, BrowserHostError> {
        let profile = self.canonical_profile(key)?;
        let pristine = std::fs::read_dir(&profile)
            .map_err(|_| BrowserHostError::unavailable())?
            .next()
            .is_none();
        let previous = self.domains.lock().unwrap().get(key).cloned();
        if let Some(previous) = &previous {
            if previous.profile_lease_id == admission.profile_lease_id
                && previous.domain != admission.domain
            {
                return Err(BrowserHostError::invalid());
            }
            if previous.domain == admission.domain
                && previous.profile_key == admission.profile_key
                && previous.profile_lease_id == admission.profile_lease_id
            {
                if opening {
                    previous.in_flight_opens.fetch_add(1, Ordering::AcqRel);
                }
                return Ok(previous.clone());
            }
            let overview = previous.hub.overview().await;
            if !previous.retired.load(Ordering::Acquire)
                || !matches!(previous.proof_state.load(Ordering::Acquire), 0 | 1 | 3)
                || previous.in_flight_opens.load(Ordering::Acquire) != 0
                || overview.total_lanes != 0
                || !overview.hosts.is_empty()
                || overview.pending_cleanup_count != 0
                || !previous.hub.managed_host_process_ids().await.is_empty()
            {
                return Err(BrowserHostError::invalid());
            }
            previous
                .hub
                .shutdown()
                .await
                .map_err(BrowserHostError::from_platform)?;
        }
        let mut domains = self.domains.lock().unwrap();
        if let Some(current) = domains.get(key) {
            if current.domain != admission.domain
                || current.profile_lease_id != admission.profile_lease_id
                || current.profile_key != admission.profile_key
            {
                if previous
                    .as_ref()
                    .is_none_or(|old| old.profile_lease_id != current.profile_lease_id)
                {
                    return Err(BrowserHostError::invalid());
                }
                domains.remove(key);
            }
        }
        let state = domains.entry(key.clone()).or_insert_with(|| {
            let template = EngineConfig {
                data_dir: profile.clone(),
                bundled_dir: Some(self.bundled_chrome.clone()),
                ..EngineConfig::default()
            };
            let physical = profile.clone();
            let bundled_root = self.bundled_chrome.clone();
            let anonymous = matches!(key, DomainKey::Anonymous { .. });
            let domain = admission.domain.clone();
            let factory = ManagedEngineHostFactory::from_config_resolver(Arc::new(move |launch| {
                // Chromium's actual --user-data-dir is the leased path, even
                // when the Hub replaces a Host or advances its epoch.
                if std::fs::symlink_metadata(&physical)
                    .map_or(true, |m| !m.is_dir() || m.file_type().is_symlink())
                    || std::fs::canonicalize(&physical).ok().as_deref() != Some(physical.as_path())
                    || !Self::packaged_chrome_available(&bundled_root)
                    || std::env::var_os("NOMIFUN_CHROME_BINARY").is_some()
                {
                    return Err(BrowserPlatformError::new(
                        BrowserErrorCode::BrowserUnavailable,
                        "The leased browser profile or bundled Chromium changed before launch.",
                        false,
                        "Resolve the profile and acquire a fresh lease.",
                    ));
                }
                let mut config = template.clone();
                config.user_data_dir = Some(physical.clone());
                config.headful = launch.headful;
                config.workspace_dir = None;
                config.ephemeral_profile = anonymous;
                config.storage_state = None;
                config.evaluate_persistent_login = false;
                // Vendor's allowlist gates cross-domain subrequests. Its top-level
                // Document exemption is narrowed by the CreatorOS opt-in patch,
                // so redirects are blocked before any off-domain request.
                config.firewall.allow_etld1 = vec![domain.clone()];
                config.firewall.allowed_document_domains = vec![domain.clone()];
                config.firewall.https_only_documents = !anonymous;
                Ok(config)
            }));
            DomainState {
                hub: BrowserSessionHub::new(Arc::new(factory), Self::hub_config(key)),
                domain: admission.domain.clone(),
                profile_key: admission.profile_key.clone(),
                profile_lease_id: admission.profile_lease_id.clone(),
                clients: Arc::new(Mutex::new(HashMap::new())),
                registered_scopes: Arc::new(Mutex::new(HashSet::new())),
                proof_state: Arc::new(AtomicU8::new(if pristine { 1 } else { 0 })),
                in_flight_opens: Arc::new(AtomicUsize::new(0)),
                proof_gate: Arc::new(tokio::sync::RwLock::new(())),
                retired: Arc::new(AtomicBool::new(false)),
            }
        });
        if state.domain != admission.domain
            || state.profile_key != admission.profile_key
            || state.profile_lease_id != admission.profile_lease_id
        {
            return Err(BrowserHostError::invalid());
        }
        if opening {
            state.in_flight_opens.fetch_add(1, Ordering::AcqRel);
        }
        Ok(state.clone())
    }

    fn client_for(
        &self,
        state: &DomainState,
        admission: &BrowserAdmission,
    ) -> Result<BrowserLaneClient, BrowserHostError> {
        let key = Self::session_key(admission)?;
        let mut clients = state.clients.lock().unwrap();
        let runtime_id = key.clone();
        let lease = if let Some(bound) = clients.get(&key) {
            if bound.profile_lease_id != admission.profile_lease_id {
                return Err(BrowserHostError::invalid());
            }
            state
                .hub
                .renew_owner_lease(&bound.client.caller().owner_lease_id)
                .map_err(BrowserHostError::from_platform)?
        } else {
            state
                .hub
                .issue_owner_lease(&admission.user_id, None, &runtime_id)
                .map_err(BrowserHostError::from_platform)?
        };
        let operations = [
            BrowserOperationKind::Navigate,
            BrowserOperationKind::Observe,
            BrowserOperationKind::Act,
            BrowserOperationKind::Crawl,
            BrowserOperationKind::Screenshot,
            BrowserOperationKind::Manage,
        ]
        .into_iter()
        .collect::<BTreeSet<_>>();
        let caller = CallerIdentity {
            user_id: admission.user_id.clone(),
            conversation_id: None,
            runtime_instance_id: runtime_id,
            agent_id: None,
            companion_id: None,
            execution_id: Some(admission.task_id.clone()),
            step_id: None,
            attempt_id: Some(admission.attempt.to_string()),
            remote_connection_id: None,
            surface: BrowserSurface::Native,
            owner_lease_id: lease.lease_id,
            capability_expires_at_ms: lease.expires_at_ms.min(admission.expires_at_ms),
            allowed_operations: operations,
        };
        let client = state
            .hub
            .bind(caller)
            .map_err(|_| BrowserHostError::platform())?;
        clients.insert(
            key,
            BoundClient {
                client: client.clone(),
                profile_lease_id: admission.profile_lease_id.clone(),
            },
        );
        Ok(client)
    }

    fn session_key(admission: &BrowserAdmission) -> Result<String, BrowserHostError> {
        let bytes = serde_json::to_vec(&(
            &admission.user_id,
            &admission.task_id,
            admission.attempt,
            &admission.fence_token,
            &admission.profile_lease_id,
        ))
        .map_err(|_| BrowserHostError::invalid())?;
        Ok(format!("{:x}", Sha256::digest(bytes)))
    }

    fn bound_state_and_client(
        &self,
        admission: &BrowserAdmission,
        mode: IdentityChoice,
    ) -> Result<(DomainKey, DomainState, Option<BrowserLaneClient>), BrowserHostError> {
        let domain = self.domain_for(admission, mode)?;
        let state = self
            .domains
            .lock()
            .unwrap()
            .get(&domain)
            .cloned()
            .ok_or(BrowserHostError::unavailable())?;
        if state.domain != admission.domain
            || state.profile_key != admission.profile_key
            || state.profile_lease_id != admission.profile_lease_id
            || admission.profile_key != self.profile_key_for(&domain)?
        {
            return Err(BrowserHostError::invalid());
        }
        let session_key = Self::session_key(admission)?;
        if !state
            .registered_scopes
            .lock()
            .unwrap()
            .contains(&session_key)
        {
            return Err(BrowserHostError::unavailable());
        }
        let client = state
            .clients
            .lock()
            .unwrap()
            .get(&session_key)
            .map(|bound| bound.client.clone());
        Ok((domain, state, client))
    }

    async fn stop_proof(
        &self,
        admission: &BrowserAdmission,
        mode: IdentityChoice,
    ) -> Result<Value, BrowserHostError> {
        let (domain, state, _client) = self.bound_state_and_client(admission, mode)?;
        // A successful proof retires this exact physical lease. An Open takes
        // the read side of this gate through launch, so proof cannot race it.
        let _proof_guard = state.proof_gate.write().await;
        let overview = state.hub.overview().await;
        let process_ids = state.hub.managed_host_process_ids().await;
        let proof_state = state.proof_state.load(Ordering::Acquire);
        let in_flight_opens = state.in_flight_opens.load(Ordering::Acquire);
        let profile = self.profile_path(&domain, false)?;
        let os_process_absent = Self::os_profile_process_absent(&profile);
        let profile_stopped = matches!(proof_state, 0 | 1 | 3)
            && in_flight_opens == 0
            && overview.total_lanes == 0
            && overview.hosts.is_empty()
            && overview.pending_cleanup_count == 0
            && process_ids.is_empty()
            && os_process_absent;
        if profile_stopped {
            state.retired.store(true, Ordering::Release);
        }
        Ok(json!({"profileKey": admission.profile_key,
            "profileLeaseId": admission.profile_lease_id,
            "managedProfileRoot": profile,
            "profileStopped": profile_stopped,
            "proofBasis": match (proof_state, profile_stopped) {
                (0, true) => "recovered_os_absence",
                (1, _) => "never_launched_os_checked",
                (3, _) => "managed_hub_os_checked",
                _ => "unverified",
            },
            "osProcessAbsent": os_process_absent,
            "remainingLaneCount": overview.total_lanes,
            "inFlightOpenCount": in_flight_opens,
            "remainingProcessIds": process_ids,
            "pendingCleanupCount": overview.pending_cleanup_count}))
    }

    fn handoff_expired_close(&self, request: &BrowserRequest) -> Result<Value, BrowserHostError> {
        let BrowserAction::Close { lane_id, .. } = &request.action else {
            return Err(BrowserHostError::invalid());
        };
        let domain = self.domain_for(&request.admission, request.identity_mode)?;
        let state = self
            .domains
            .lock()
            .unwrap()
            .get(&domain)
            .cloned()
            .ok_or(BrowserHostError {
                code: "LANE_NOT_FOUND",
            })?;
        if state.domain != request.admission.domain
            || state.profile_key != request.admission.profile_key
            || state.profile_lease_id != request.admission.profile_lease_id
        {
            return Err(BrowserHostError::invalid());
        }
        let key = Self::session_key(&request.admission)?;
        let client = state
            .clients
            .lock()
            .unwrap()
            .get(&key)
            .map(|bound| bound.client.clone())
            .ok_or(BrowserHostError {
                code: "LANE_NOT_FOUND",
            })?;
        let lane_id =
            BrowserLaneId::parse(lane_id.clone()).map_err(|_| BrowserHostError::invalid())?;
        client
            .handoff_bound_lane_cleanup(lane_id.clone())
            .map_err(BrowserHostError::from_platform)?;
        Ok(json!({"laneId": lane_id, "stopProof": {
            "profileKey": request.admission.profile_key,
            "profileLeaseId": request.admission.profile_lease_id,
            "managedProfileRoot": self.profile_path(&domain, false)?,
            "profileStopped": false,
            "cleanupPending": true,
        }}))
    }

    pub async fn dispatch(&self, request: BrowserRequest) -> Result<Value, BrowserHostError> {
        self.validate_fields(&request.admission)?;
        if !valid_id(&request.operation_id) {
            return Err(BrowserHostError::invalid());
        }
        if matches!(
            &request.action,
            BrowserAction::StopProof | BrowserAction::Cleanup
        ) {
            // A DB lease can exist even when Open failed before any Rust state
            // was made. Seal its exact scope without launching a browser, then
            // prove an empty profile and OS process absence below.
            let domain = self.domain_for(&request.admission, request.identity_mode)?;
            if request.admission.profile_key != self.profile_key_for(&domain)? {
                return Err(BrowserHostError::invalid());
            }
            let unknown_to_host = !self.domains.lock().unwrap().contains_key(&domain);
            if unknown_to_host {
                let state = self
                    .domain_state(&domain, &request.admission, false)
                    .await?;
                state
                    .registered_scopes
                    .lock()
                    .unwrap()
                    .insert(Self::session_key(&request.admission)?);
            }
            let (_domain, _state, client) =
                self.bound_state_and_client(&request.admission, request.identity_mode)?;
            if matches!(&request.action, BrowserAction::Cleanup) {
                if let Some(client) = client {
                    client
                        .cleanup_bound_owner_lanes()
                        .await
                        .map_err(BrowserHostError::from_platform)?;
                }
            }
            return self
                .stop_proof(&request.admission, request.identity_mode)
                .await;
        }
        if matches!(&request.action, BrowserAction::Close { .. })
            && request.admission.expires_at_ms <= now_ms()
        {
            return self.handoff_expired_close(&request);
        }
        if request.admission.expires_at_ms <= now_ms() {
            return Err(BrowserHostError::invalid());
        }
        let key = self.domain_for(&request.admission, request.identity_mode)?;
        if request.admission.profile_key != self.profile_key_for(&key)? {
            return Err(BrowserHostError::invalid());
        }
        let opening = matches!(&request.action, BrowserAction::Open);
        let state = self.domain_state(&key, &request.admission, opening).await?;
        let _open_guard = opening.then(|| OpenAttemptGuard(state.in_flight_opens.clone()));
        let _open_permit = if opening {
            Some(state.proof_gate.read().await)
        } else {
            None
        };
        if opening && state.retired.load(Ordering::Acquire) {
            return Err(BrowserHostError::invalid());
        }
        if opening {
            state
                .registered_scopes
                .lock()
                .unwrap()
                .insert(Self::session_key(&request.admission)?);
        }
        let client = match self.client_for(&state, &request.admission) {
            Ok(client) => client,
            Err(_error) if matches!(&request.action, BrowserAction::Close { .. }) => {
                return self.handoff_expired_close(&request);
            }
            Err(error) => return Err(error),
        };
        if matches!(
            &request.action,
            BrowserAction::Open | BrowserAction::Execute { .. }
        ) {
            // Bind the exact backend lease before preflight so a failed
            // packaged-browser check can still be proven never launched.
            self.validate_admission(&request.admission)?;
        }
        let lane_id =
            |value: String| BrowserLaneId::parse(value).map_err(|_| BrowserHostError::invalid());
        match request.action {
            BrowserAction::Open => {
                let mode = match request.identity_mode {
                    IdentityChoice::Primary => BrowserIdentityMode::Primary,
                    IdentityChoice::Anonymous => BrowserIdentityMode::Anonymous,
                };
                state.proof_state.store(2, Ordering::Release);
                let outcome = client
                    .open(Some(&request.admission.lane_name), mode, None)
                    .await
                    .map_err(BrowserHostError::from_platform)?;
                state.proof_state.store(3, Ordering::Release);
                let lane = outcome.lane();
                Ok(json!({"lane": {
                    "lane_id": lane.lane_id,
                    "browser_epoch": lane.browser_epoch,
                    "lifecycle_state": lane.lifecycle_state,
                    "queue_position": lane.queue.as_ref().map(|queue| queue.position),
                }}))
            }
            BrowserAction::Status { lane_id: raw } => {
                let lane = client
                    .status(&lane_id(raw)?)
                    .await
                    .map_err(BrowserHostError::from_platform)?;
                Ok(json!({
                    "lane_id": lane.lane_id,
                    "browser_epoch": lane.browser_epoch,
                    "lifecycle_state": lane.lifecycle_state,
                    "queue_position": lane.queue.as_ref().map(|queue| queue.position),
                }))
            }
            BrowserAction::Execute {
                lane_id: raw,
                expected_browser_epoch,
                action,
                input,
                target_id,
                frame_id,
                ref_generation,
            } => {
                let kind = match action.as_str() {
                    "navigate" => BrowserOperationKind::Navigate,
                    "observe" => BrowserOperationKind::Observe,
                    "get_page_text" | "extract" => BrowserOperationKind::Crawl,
                    "screenshot" => BrowserOperationKind::Screenshot,
                    "click" | "hover" | "type" | "set_value" | "select_option" | "press_key"
                    | "scroll" => BrowserOperationKind::Act,
                    // Downloads need a task-owned output directory and artifact receipt.
                    _ => return Err(BrowserHostError::denied()),
                };
                let lane_id = lane_id(raw)?;
                let is_navigate = action == "navigate";
                if is_navigate {
                    let target = input
                        .get("url")
                        .and_then(Value::as_str)
                        .ok_or_else(BrowserHostError::scope)?;
                    if target == "about:blank"
                        || !Self::url_in_scope(
                            &request.admission.domain,
                            request.identity_mode,
                            target,
                        )
                    {
                        return Err(BrowserHostError::scope());
                    }
                }
                let before = client
                    .status(&lane_id)
                    .await
                    .map_err(BrowserHostError::from_platform)?;
                let previous_pages_safe = before.tabs.iter().all(|tab| match tab.url.as_deref() {
                    Some(url) => {
                        Self::url_in_scope(&request.admission.domain, request.identity_mode, url)
                    }
                    None => is_navigate,
                });
                if !previous_pages_safe {
                    let _ = client.close(&lane_id).await;
                    return Err(BrowserHostError::scope());
                }
                let result = client
                    .execute(
                        &lane_id,
                        BrowserOperation {
                            kind,
                            action,
                            input,
                            expected_browser_epoch: Some(expected_browser_epoch),
                            target_id,
                            frame_id,
                            ref_generation,
                            may_modify_identity: matches!(kind, BrowserOperationKind::Act),
                        },
                    )
                    .await
                    .map_err(BrowserHostError::from_platform)?;
                if is_navigate
                    && !result
                        .output
                        .get("final_url")
                        .and_then(Value::as_str)
                        .is_some_and(|url| {
                            Self::url_in_scope(
                                &request.admission.domain,
                                request.identity_mode,
                                url,
                            )
                        })
                {
                    let _ = client.close(&lane_id).await;
                    return Err(BrowserHostError::scope());
                }
                let lane = client
                    .status(&lane_id)
                    .await
                    .map_err(BrowserHostError::from_platform)?;
                if !Self::tabs_in_scope(
                    &request.admission.domain,
                    request.identity_mode,
                    &lane.tabs,
                ) {
                    let _ = client.close(&lane_id).await;
                    return Err(BrowserHostError::scope());
                }
                Ok(json!({"laneId": lane_id, "browserEpoch": lane.browser_epoch, "result": result}))
            }
            BrowserAction::Close {
                lane_id: raw,
                expected_browser_epoch,
            } => {
                let lane_id = lane_id(raw)?;
                let current = client
                    .status(&lane_id)
                    .await
                    .map_err(BrowserHostError::from_platform)?;
                if current.browser_epoch != expected_browser_epoch {
                    return Err(BrowserHostError {
                        code: "STALE_BROWSER_EPOCH",
                    });
                }
                let result = client
                    .close(&lane_id)
                    .await
                    .map_err(BrowserHostError::from_platform)?;
                let proof = self
                    .stop_proof(&request.admission, request.identity_mode)
                    .await?;
                Ok(json!({"close": result, "stopProof": proof}))
            }
            BrowserAction::StopProof | BrowserAction::Cleanup => unreachable!(),
        }
    }

    pub async fn shutdown(&self) {
        let hubs: Vec<_> = self
            .domains
            .lock()
            .unwrap()
            .values()
            .map(|state| state.hub.clone())
            .collect();
        for hub in hubs {
            let _ = hub.shutdown().await;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn receipt(account: &str) -> BrowserAdmission {
        BrowserAdmission {
            user_id: "user-one".into(),
            account_id: account.into(),
            task_id: "task-one".into(),
            attempt: 1,
            fence_token: "fence-one".into(),
            domain: "example.com".into(),
            profile_key: "a".repeat(64),
            profile_lease_id: "lease-one".into(),
            lane_name: "research".into(),
            expires_at_ms: u64::MAX,
        }
    }

    #[test]
    fn accounts_and_anonymous_sessions_cannot_share_a_hub_or_profile_root() {
        let host = BrowserHost::new(
            PathBuf::from("/tmp/creatoros-browser-test"),
            PathBuf::from("/missing/cft"),
        );
        let first = host
            .domain_for(&receipt("account-one"), IdentityChoice::Primary)
            .unwrap();
        let second = host
            .domain_for(&receipt("account-two"), IdentityChoice::Primary)
            .unwrap();
        let anonymous = host
            .domain_for(&receipt("account-one"), IdentityChoice::Anonymous)
            .unwrap();
        assert_ne!(first, second);
        assert_ne!(first, anonymous);
        assert_ne!(host.profile_root(&first), host.profile_root(&second));
        assert_ne!(host.profile_root(&first), host.profile_root(&anonymous));
        let mut other_task = receipt("account-one");
        other_task.task_id = "task-two".into();
        let anonymous_other = host
            .domain_for(&other_task, IdentityChoice::Anonymous)
            .unwrap();
        assert_ne!(
            host.profile_root(&anonymous),
            host.profile_root(&anonymous_other)
        );
    }

    #[test]
    fn fresh_primary_is_headful_for_manual_login_and_anonymous_is_headless() {
        let primary = DomainKey::Account {
            user_id: "user-one".into(),
            account_id: "account-one".into(),
        };
        let anonymous = DomainKey::Anonymous {
            user_id: "user-one".into(),
            task_id: "task-one".into(),
        };
        assert!(BrowserHost::hub_config(&primary).headful);
        assert!(!BrowserHost::hub_config(&anonymous).headful);
    }

    #[test]
    fn lease_key_hashes_the_exact_canonical_chromium_directory() {
        let root = std::env::temp_dir().join(format!("creatoros-browser-{}", std::process::id()));
        let host = BrowserHost::new(root.clone(), PathBuf::from("/missing/cft"));
        let location = host
            .profile_location(
                "user-one",
                "account-one",
                "task-one",
                IdentityChoice::Primary,
            )
            .unwrap();
        let directory = PathBuf::from(location["managedProfileRoot"].as_str().unwrap());
        assert_eq!(
            directory,
            std::fs::canonicalize(
                host.profile_root(
                    &host
                        .domain_for(&receipt("account-one"), IdentityChoice::Primary)
                        .unwrap()
                )
            )
            .unwrap()
        );
        assert_eq!(location["profileKey"], BrowserHost::profile_key(&directory));
        assert!(directory.ends_with("profile"));
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn browser_bridge_requires_executable_for_current_target() {
        use std::os::unix::fs::PermissionsExt;
        let root =
            std::env::temp_dir().join(format!("creatoros-browser-cft-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        assert!(!BrowserHost::packaged_chrome_available(&root));
        let executable = BrowserHost::packaged_chrome_executable(&root);
        std::fs::create_dir_all(executable.parent().unwrap()).unwrap();
        std::fs::write(&executable, b"test fixture: never launched").unwrap();
        std::fs::set_permissions(&executable, std::fs::Permissions::from_mode(0o644)).unwrap();
        assert!(!BrowserHost::packaged_chrome_available(&root));
        std::fs::set_permissions(&executable, std::fs::Permissions::from_mode(0o755)).unwrap();
        assert!(BrowserHost::packaged_chrome_available(&root));
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn old_collection_profile_key_cannot_authorize_new_managed_directory() {
        let root =
            std::env::temp_dir().join(format!("creatoros-browser-key-{}", std::process::id()));
        std::fs::create_dir_all(&root).unwrap();
        let host = BrowserHost::new(root.join("managed"), root.join("cft"));
        let location = host
            .profile_location(
                "user-one",
                "account-one",
                "task-one",
                IdentityChoice::Primary,
            )
            .unwrap();
        let executable = host.bundled_executable();
        std::fs::create_dir_all(executable.parent().unwrap()).unwrap();
        std::fs::write(&executable, b"test fixture: never launched").unwrap();
        std::fs::set_permissions(&executable, std::fs::Permissions::from_mode(0o755)).unwrap();
        let mut old = receipt("account-one");
        old.profile_key = BrowserHost::profile_key(&root.join(".auth/douyin/account-one"));
        assert_ne!(old.profile_key, location["profileKey"].as_str().unwrap());
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        let result = runtime.block_on(host.dispatch(BrowserRequest {
            operation_id: "old-key".into(),
            admission: old,
            identity_mode: IdentityChoice::Primary,
            action: BrowserAction::Open,
        }));
        assert_eq!(result.unwrap_err().code, "INVALID_ADMISSION");
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn cleanup_owner_key_changes_with_attempt_fence_and_physical_lease() {
        let original = receipt("account-one");
        let first = BrowserHost::session_key(&original).unwrap();
        let mut changed = original.clone();
        changed.attempt += 1;
        assert_ne!(first, BrowserHost::session_key(&changed).unwrap());
        changed = original.clone();
        changed.fence_token = "new-fence".into();
        assert_ne!(first, BrowserHost::session_key(&changed).unwrap());
        changed = original;
        changed.profile_lease_id = "new-lease".into();
        assert_ne!(first, BrowserHost::session_key(&changed).unwrap());
    }

    #[test]
    fn navigation_scope_rejects_other_hosts_credentials_ports_and_downgrade() {
        assert!(BrowserHost::url_in_scope(
            "example.com",
            IdentityChoice::Primary,
            "https://www.example.com/a"
        ));
        for url in [
            "https://example.com.evil.test/",
            "https://evil-example.com/",
            "https://user@example.com/",
            "https://example.com:443/",
            "https://example.com:8443/",
            "http://example.com/",
            "file:///tmp/secret",
            "https://127.0.0.1/",
        ] {
            assert!(
                !BrowserHost::url_in_scope("example.com", IdentityChoice::Primary, url),
                "{url}"
            );
        }
        assert!(BrowserHost::url_in_scope(
            "example.com",
            IdentityChoice::Anonymous,
            "http://example.com/"
        ));
        assert!(!BrowserHost::valid_domain("example.com.evil/"));
    }

    #[test]
    fn missing_backend_lease_or_packaged_browser_fails_before_launch() {
        let host = BrowserHost::new(
            PathBuf::from("/tmp/creatoros-browser-test"),
            PathBuf::from("/missing/cft"),
        );
        let mut invalid = receipt("account-one");
        invalid.profile_lease_id.clear();
        assert_eq!(
            host.validate_admission(&invalid).unwrap_err().code,
            "INVALID_ADMISSION"
        );
        assert_eq!(
            host.validate_admission(&receipt("account-one"))
                .unwrap_err()
                .code,
            "BROWSER_UNAVAILABLE"
        );
    }

    #[test]
    fn prelaunch_failure_keeps_exact_lease_provable_but_not_another_owner() {
        let root = std::env::temp_dir().join(format!(
            "creatoros-browser-prelaunch-{}",
            std::process::id()
        ));
        let host = BrowserHost::new(root.clone(), PathBuf::from("/missing/cft"));
        let location = host
            .profile_location(
                "user-one",
                "account-one",
                "task-one",
                IdentityChoice::Primary,
            )
            .unwrap();
        let mut admission = receipt("account-one");
        admission.profile_key = location["profileKey"].as_str().unwrap().to_owned();
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        let call = |admission: BrowserAdmission, action: BrowserAction| {
            runtime.block_on(host.dispatch(BrowserRequest {
                operation_id: "prelaunch".into(),
                admission,
                identity_mode: IdentityChoice::Primary,
                action,
            }))
        };
        assert_eq!(
            call(admission.clone(), BrowserAction::Open)
                .unwrap_err()
                .code,
            "BROWSER_UNAVAILABLE"
        );
        let proof = call(admission.clone(), BrowserAction::StopProof).unwrap();
        assert_eq!(proof["profileStopped"], true);
        assert_eq!(proof["proofBasis"], "never_launched_os_checked");
        assert_eq!(proof["osProcessAbsent"], true);
        assert_eq!(proof["profileLeaseId"], admission.profile_lease_id);
        let domain = host
            .domain_for(&admission, IdentityChoice::Primary)
            .unwrap();
        let state = host.domains.lock().unwrap().get(&domain).cloned().unwrap();
        state.in_flight_opens.store(1, Ordering::Release);
        assert_eq!(
            call(admission.clone(), BrowserAction::StopProof).unwrap()["profileStopped"],
            false
        );
        state.in_flight_opens.store(0, Ordering::Release);
        let mut expired = admission.clone();
        expired.expires_at_ms = 1;
        assert_eq!(
            call(expired.clone(), BrowserAction::Cleanup).unwrap()["profileStopped"],
            true
        );
        assert_eq!(
            call(expired, BrowserAction::StopProof).unwrap()["profileStopped"],
            true
        );
        let mut other = admission.clone();
        other.profile_lease_id = "new-lease".into();
        assert_eq!(
            call(other, BrowserAction::StopProof).unwrap_err().code,
            "INVALID_ADMISSION"
        );
        let mut replacement = admission.clone();
        replacement.profile_lease_id = "new-lease".into();
        assert_eq!(
            call(replacement.clone(), BrowserAction::Open)
                .unwrap_err()
                .code,
            "BROWSER_UNAVAILABLE"
        );
        assert_eq!(
            call(admission.clone(), BrowserAction::StopProof)
                .unwrap_err()
                .code,
            "INVALID_ADMISSION"
        );
        assert_eq!(
            call(replacement, BrowserAction::StopProof).unwrap()["profileLeaseId"],
            "new-lease"
        );
        let mut other = admission;
        other.fence_token = "new-fence".into();
        assert_eq!(
            call(other, BrowserAction::StopProof).unwrap_err().code,
            "INVALID_ADMISSION"
        );
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn db_lease_without_any_open_can_be_proven_and_then_cannot_reopen() {
        let root =
            std::env::temp_dir().join(format!("creatoros-browser-unopened-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        let host = BrowserHost::new(root.clone(), PathBuf::from("/missing/cft"));
        let location = host
            .profile_location(
                "user-one",
                "account-one",
                "task-one",
                IdentityChoice::Primary,
            )
            .unwrap();
        let mut admission = receipt("account-one");
        admission.profile_key = location["profileKey"].as_str().unwrap().to_owned();
        assert!(host.domains.lock().unwrap().is_empty());
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        let call = |admission: BrowserAdmission, action: BrowserAction| {
            runtime.block_on(host.dispatch(BrowserRequest {
                operation_id: "unopened".into(),
                admission,
                identity_mode: IdentityChoice::Primary,
                action,
            }))
        };
        let mut wrong_key = admission.clone();
        wrong_key.profile_key = "a".repeat(64);
        assert_eq!(
            call(wrong_key, BrowserAction::StopProof).unwrap_err().code,
            "INVALID_ADMISSION"
        );
        let proof = call(admission.clone(), BrowserAction::StopProof).unwrap();
        assert_eq!(proof["profileStopped"], true);
        assert_eq!(proof["profileKey"], admission.profile_key);
        assert_eq!(proof["profileLeaseId"], admission.profile_lease_id);
        assert_eq!(proof["proofBasis"], "never_launched_os_checked");
        assert_eq!(proof["osProcessAbsent"], true);
        assert_eq!(
            call(admission.clone(), BrowserAction::Open)
                .unwrap_err()
                .code,
            "INVALID_ADMISSION"
        );
        let mut other_lease = admission;
        other_lease.profile_lease_id = "other-owner".into();
        assert_eq!(
            call(other_lease, BrowserAction::StopProof)
                .unwrap_err()
                .code,
            "INVALID_ADMISSION"
        );
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn os_process_scan_blocks_stop_proof_for_the_exact_profile_argument() {
        let path =
            std::env::temp_dir().join(format!("creatoros-browser-process-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&path);
        std::fs::create_dir(&path).unwrap();
        let marker = format!("--user-data-dir={}", path.display());
        let mut child = Command::new("/usr/bin/yes")
            .arg(marker)
            .stdout(std::process::Stdio::null())
            .spawn()
            .unwrap();
        assert!(!BrowserHost::os_profile_process_absent(&path));
        child.kill().unwrap();
        child.wait().unwrap();
        assert!(BrowserHost::os_profile_process_absent(&path));
        std::fs::remove_dir(&path).unwrap();
        assert!(BrowserHost::os_profile_process_absent(&path));
    }

    #[test]
    fn restarted_host_recovers_only_exact_stopped_lease_for_nonempty_profile() {
        let root =
            std::env::temp_dir().join(format!("creatoros-browser-existing-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        let old_host = BrowserHost::new(root.clone(), PathBuf::from("/missing/cft"));
        let location = old_host
            .profile_location(
                "user-one",
                "account-one",
                "task-one",
                IdentityChoice::Primary,
            )
            .unwrap();
        let profile = PathBuf::from(location["managedProfileRoot"].as_str().unwrap());
        let existing_file = profile.join("existing-state");
        std::fs::write(&existing_file, b"kept").unwrap();
        let mut admission = receipt("account-one");
        admission.profile_key = location["profileKey"].as_str().unwrap().to_owned();
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        runtime.block_on(old_host.shutdown());
        drop(old_host);
        let host = BrowserHost::new(root.clone(), PathBuf::from("/missing/cft"));
        assert!(host.domains.lock().unwrap().is_empty());
        let call = |admission: BrowserAdmission, action: BrowserAction| {
            runtime.block_on(host.dispatch(BrowserRequest {
                operation_id: "recovered-proof".into(),
                admission,
                identity_mode: IdentityChoice::Primary,
                action,
            }))
        };
        let mut wrong_key = admission.clone();
        wrong_key.profile_key = "a".repeat(64);
        assert_eq!(
            call(wrong_key, BrowserAction::StopProof).unwrap_err().code,
            "INVALID_ADMISSION"
        );
        // A surviving process holding any profile file blocks recovery even
        // when its argv has no --user-data-dir flag.
        let held_file = std::fs::File::open(&existing_file).unwrap();
        let proof = call(admission.clone(), BrowserAction::StopProof).unwrap();
        assert_eq!(proof["profileStopped"], false);
        assert_eq!(proof["osProcessAbsent"], false);
        assert_eq!(proof["proofBasis"], "unverified");
        let mut wrong_owner = admission.clone();
        wrong_owner.profile_lease_id = "other-owner".into();
        assert_eq!(
            call(wrong_owner.clone(), BrowserAction::Cleanup)
                .unwrap_err()
                .code,
            "INVALID_ADMISSION"
        );
        drop(held_file);
        let mut active_browser = Command::new("/usr/bin/yes")
            .arg(format!("--user-data-dir={}", profile.display()))
            .stdout(std::process::Stdio::null())
            .spawn()
            .unwrap();
        let active_proof = call(admission.clone(), BrowserAction::StopProof).unwrap();
        assert_eq!(active_proof["profileStopped"], false);
        assert_eq!(active_proof["osProcessAbsent"], false);
        active_browser.kill().unwrap();
        active_browser.wait().unwrap();
        let proof = call(admission.clone(), BrowserAction::Cleanup).unwrap();
        assert_eq!(proof["profileStopped"], true);
        assert_eq!(proof["proofBasis"], "recovered_os_absence");
        assert_eq!(proof["profileKey"], admission.profile_key);
        assert_eq!(proof["profileLeaseId"], admission.profile_lease_id);
        assert_eq!(proof["osProcessAbsent"], true);
        // Once a later lease takes the domain, old cleanup cannot reach it.
        assert_eq!(
            call(wrong_owner.clone(), BrowserAction::Open)
                .unwrap_err()
                .code,
            "BROWSER_UNAVAILABLE"
        );
        let domain = host
            .domain_for(&wrong_owner, IdentityChoice::Primary)
            .unwrap();
        let state = host.domains.lock().unwrap().get(&domain).cloned().unwrap();
        state.in_flight_opens.store(1, Ordering::Release);
        assert_eq!(
            call(admission.clone(), BrowserAction::Cleanup)
                .unwrap_err()
                .code,
            "INVALID_ADMISSION"
        );
        assert_eq!(
            call(wrong_owner.clone(), BrowserAction::StopProof).unwrap()["profileStopped"],
            false
        );
        state.in_flight_opens.store(0, Ordering::Release);
        assert_eq!(
            call(wrong_owner, BrowserAction::StopProof).unwrap()["profileStopped"],
            true
        );
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn ipc_rejects_caller_selected_profile_path_and_requires_epoch_for_execution() {
        let valid = json!({
            "operationId":"op-one", "admission": receipt("account-one"),
            "identityMode":"primary", "action":{"kind":"execute", "laneId":"lane-one",
                "expectedBrowserEpoch":1, "action":"observe", "input":{}}
        });
        assert!(serde_json::from_value::<BrowserRequest>(valid.clone()).is_ok());
        let mut forged_path = valid.clone();
        forged_path["admission"]["profilePath"] = json!("/Users/someone/.auth/douyin");
        assert!(serde_json::from_value::<BrowserRequest>(forged_path).is_err());
        let mut missing_epoch = valid;
        missing_epoch["action"]
            .as_object_mut()
            .unwrap()
            .remove("expectedBrowserEpoch");
        assert!(serde_json::from_value::<BrowserRequest>(missing_epoch).is_err());
    }

    #[test]
    fn expired_scope_can_only_request_exact_cleanup_and_never_reports_stopped() {
        let host = BrowserHost::new(
            PathBuf::from("/tmp/creatoros-browser-test"),
            PathBuf::from("/missing/cft"),
        );
        let mut expired = receipt("account-one");
        expired.expires_at_ms = 1;
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        let close = runtime.block_on(host.dispatch(BrowserRequest {
            operation_id: "cleanup".into(),
            admission: expired.clone(),
            identity_mode: IdentityChoice::Primary,
            action: BrowserAction::Close {
                lane_id: "lane-one".into(),
                expected_browser_epoch: 1,
            },
        }));
        assert_eq!(close.unwrap_err().code, "LANE_NOT_FOUND");
        let open = runtime.block_on(host.dispatch(BrowserRequest {
            operation_id: "open".into(),
            admission: expired,
            identity_mode: IdentityChoice::Primary,
            action: BrowserAction::Open,
        }));
        assert_eq!(open.unwrap_err().code, "INVALID_ADMISSION");
        let proof = runtime.block_on(host.dispatch(BrowserRequest {
            operation_id: "proof".into(),
            admission: receipt("account-one"),
            identity_mode: IdentityChoice::Primary,
            action: BrowserAction::StopProof,
        }));
        // A restarted/unknown host cannot assert OS process stop for a DB lease.
        assert_eq!(proof.unwrap_err().code, "BROWSER_UNAVAILABLE");
    }

    #[test]
    #[ignore = "requires a locally verified fixed Chrome for Testing binary"]
    fn real_chromium_anonymous_lane_opens_and_closes() {
        let bundled = PathBuf::from(
            std::env::var("CREATOROS_TEST_CFT_ROOT").expect("set CREATOROS_TEST_CFT_ROOT"),
        );
        assert!(BrowserHost::packaged_chrome_available(&bundled));
        let root =
            std::env::temp_dir().join(format!("creatoros-browser-real-{}", rand::random::<u64>()));
        let host = BrowserHost::new(root.clone(), bundled);
        let location = host
            .profile_location(
                "user-one",
                "account-one",
                "task-one",
                IdentityChoice::Anonymous,
            )
            .unwrap();
        let mut admission = receipt("account-one");
        admission.profile_key = location["profileKey"].as_str().unwrap().to_owned();
        admission.expires_at_ms = now_ms() + 120_000;
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        let outcome = runtime.block_on(async {
            let opened = tokio::time::timeout(
                std::time::Duration::from_secs(45),
                host.dispatch(BrowserRequest {
                    operation_id: "real-open".into(),
                    admission: admission.clone(),
                    identity_mode: IdentityChoice::Anonymous,
                    action: BrowserAction::Open,
                }),
            )
            .await
            .map_err(|_| "browser open timed out".to_owned())?
            .map_err(|error| error.code.to_owned())?;
            assert!(opened.get("managedProfileRoot").is_none(), "{opened}");
            assert!(opened["lane"].get("caller").is_none(), "{opened}");
            let lane_id = opened["lane"]["lane_id"]
                .as_str()
                .ok_or_else(|| format!("missing lane_id: {opened}"))?
                .to_owned();
            let browser_epoch = opened["lane"]["browser_epoch"]
                .as_u64()
                .ok_or_else(|| format!("missing browser_epoch: {opened}"))?;
            let status = host
                .dispatch(BrowserRequest {
                    operation_id: "real-status".into(),
                    admission: admission.clone(),
                    identity_mode: IdentityChoice::Anonymous,
                    action: BrowserAction::Status {
                        lane_id: lane_id.clone(),
                    },
                })
                .await
                .map_err(|error| error.code.to_owned())?;
            let navigated = tokio::time::timeout(
                std::time::Duration::from_secs(45),
                host.dispatch(BrowserRequest {
                    operation_id: "real-navigate".into(),
                    admission: admission.clone(),
                    identity_mode: IdentityChoice::Anonymous,
                    action: BrowserAction::Execute {
                        lane_id: lane_id.clone(),
                        expected_browser_epoch: browser_epoch,
                        action: "navigate".into(),
                        input: json!({"url":"https://example.com"}),
                        target_id: None,
                        frame_id: None,
                        ref_generation: None,
                    },
                }),
            )
            .await
            .map_err(|_| "browser navigation timed out".to_owned())?
            .map_err(|error| error.code.to_owned())?;
            let observed = tokio::time::timeout(
                std::time::Duration::from_secs(30),
                host.dispatch(BrowserRequest {
                    operation_id: "real-observe".into(),
                    admission: admission.clone(),
                    identity_mode: IdentityChoice::Anonymous,
                    action: BrowserAction::Execute {
                        lane_id: lane_id.clone(),
                        expected_browser_epoch: browser_epoch,
                        action: "observe".into(),
                        input: json!({}),
                        target_id: None,
                        frame_id: None,
                        ref_generation: None,
                    },
                }),
            )
            .await
            .map_err(|_| "browser observe timed out".to_owned())?
            .map_err(|error| error.code.to_owned())?;
            let extracted = tokio::time::timeout(
                std::time::Duration::from_secs(30),
                host.dispatch(BrowserRequest {
                    operation_id: "real-extract".into(),
                    admission: admission.clone(),
                    identity_mode: IdentityChoice::Anonymous,
                    action: BrowserAction::Execute {
                        lane_id: lane_id.clone(),
                        expected_browser_epoch: browser_epoch,
                        action: "extract".into(),
                        input: json!({}),
                        target_id: None,
                        frame_id: None,
                        ref_generation: None,
                    },
                }),
            )
            .await
            .map_err(|_| "browser extract timed out".to_owned())?
            .map_err(|error| error.code.to_owned())?;
            let screenshot = tokio::time::timeout(
                std::time::Duration::from_secs(30),
                host.dispatch(BrowserRequest {
                    operation_id: "real-screenshot".into(),
                    admission: admission.clone(),
                    identity_mode: IdentityChoice::Anonymous,
                    action: BrowserAction::Execute {
                        lane_id: lane_id.clone(),
                        expected_browser_epoch: browser_epoch,
                        action: "screenshot".into(),
                        input: json!({}),
                        target_id: None,
                        frame_id: None,
                        ref_generation: None,
                    },
                }),
            )
            .await
            .map_err(|_| "browser screenshot timed out".to_owned())?
            .map_err(|error| error.code.to_owned())?;
            let closed = host
                .dispatch(BrowserRequest {
                    operation_id: "real-close".into(),
                    admission,
                    identity_mode: IdentityChoice::Anonymous,
                    action: BrowserAction::Close {
                        lane_id,
                        expected_browser_epoch: browser_epoch,
                    },
                })
                .await
                .map_err(|error| error.code.to_owned())?;
            Ok::<_, String>((status, navigated, observed, extracted, screenshot, closed))
        });
        runtime.block_on(host.shutdown());
        std::fs::remove_dir_all(root).unwrap();
        let (status, navigated, observed, extracted, screenshot, closed) = outcome.unwrap();
        assert!(status["browser_epoch"].as_u64().is_some());
        assert!(status.get("caller").is_none(), "{status}");
        assert!(navigated["laneId"].as_str().is_some(), "{navigated}");
        assert!(observed["result"].is_object(), "{observed}");
        assert!(extracted["result"].is_object(), "{extracted}");
        assert_eq!(extracted["result"]["output"]["success"], true);
        assert!(extracted["result"]["output"]["message"]
            .as_str()
            .is_some_and(|text| text.contains("Example Domain")));
        assert_eq!(screenshot["result"]["output"]["media_type"], "image/png");
        assert!(screenshot["result"]["output"]["data"]
            .as_str()
            .is_some_and(|data| data.len() > 100));
        assert!(closed["stopProof"]["profileKey"].as_str().is_some());
        assert_eq!(closed["stopProof"]["profileStopped"], true, "{closed}");
    }

    #[test]
    #[ignore = "requires a locally verified fixed Chrome for Testing binary"]
    fn real_chromium_two_tasks_keep_independent_lanes() {
        let bundled = PathBuf::from(
            std::env::var("CREATOROS_TEST_CFT_ROOT").expect("set CREATOROS_TEST_CFT_ROOT"),
        );
        assert!(BrowserHost::packaged_chrome_available(&bundled));
        let root = std::env::temp_dir().join(format!(
            "creatoros-browser-concurrent-{}",
            rand::random::<u64>()
        ));
        let host = BrowserHost::new(root.clone(), bundled);
        let mut first = receipt("account-one");
        first.expires_at_ms = now_ms() + 120_000;
        let mut second = first.clone();
        second.task_id = "task-two".into();
        second.fence_token = "fence-two".into();
        second.profile_lease_id = "lease-two".into();
        for admission in [&mut first, &mut second] {
            let location = host
                .profile_location(
                    &admission.user_id,
                    &admission.account_id,
                    &admission.task_id,
                    IdentityChoice::Anonymous,
                )
                .unwrap();
            admission.profile_key = location["profileKey"].as_str().unwrap().to_owned();
        }
        assert_ne!(first.profile_key, second.profile_key);
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        let outcome = runtime.block_on(async {
            let open = |operation_id: &str, admission: BrowserAdmission| BrowserRequest {
                operation_id: operation_id.into(),
                admission,
                identity_mode: IdentityChoice::Anonymous,
                action: BrowserAction::Open,
            };
            let (first_open, second_open) =
                tokio::time::timeout(std::time::Duration::from_secs(60), async {
                    tokio::join!(
                        host.dispatch(open("concurrent-open-one", first.clone())),
                        host.dispatch(open("concurrent-open-two", second.clone()))
                    )
                })
                .await
                .map_err(|_| "concurrent browser opens timed out".to_owned())?;
            let first_open = first_open.map_err(|error| error.code.to_owned())?;
            let second_open = second_open.map_err(|error| error.code.to_owned())?;
            let lane = |opened: &Value| -> Result<(String, u64), String> {
                Ok((
                    opened["lane"]["lane_id"]
                        .as_str()
                        .ok_or_else(|| format!("missing lane id: {opened}"))?
                        .to_owned(),
                    opened["lane"]["browser_epoch"]
                        .as_u64()
                        .ok_or_else(|| format!("missing browser epoch: {opened}"))?,
                ))
            };
            let (first_lane, first_epoch) = lane(&first_open)?;
            let (second_lane, second_epoch) = lane(&second_open)?;
            assert_ne!(first_lane, second_lane);
            let status =
                |operation_id: &str, admission: BrowserAdmission, lane_id: String| BrowserRequest {
                    operation_id: operation_id.into(),
                    admission,
                    identity_mode: IdentityChoice::Anonymous,
                    action: BrowserAction::Status { lane_id },
                };
            let close = |operation_id: &str,
                         admission: BrowserAdmission,
                         lane_id: String,
                         expected_browser_epoch: u64| BrowserRequest {
                operation_id: operation_id.into(),
                admission,
                identity_mode: IdentityChoice::Anonymous,
                action: BrowserAction::Close {
                    lane_id,
                    expected_browser_epoch,
                },
            };
            host.dispatch(status("first-status", first.clone(), first_lane.clone()))
                .await
                .map_err(|error| error.code.to_owned())?;
            host.dispatch(status("second-status", second.clone(), second_lane.clone()))
                .await
                .map_err(|error| error.code.to_owned())?;
            assert!(host
                .dispatch(close(
                    "old-cannot-close-new",
                    first.clone(),
                    second_lane.clone(),
                    second_epoch,
                ))
                .await
                .is_err());
            let first_close = host
                .dispatch(close("first-close", first, first_lane, first_epoch))
                .await
                .map_err(|error| error.code.to_owned())?;
            let second_status = host
                .dispatch(status(
                    "second-still-running",
                    second.clone(),
                    second_lane.clone(),
                ))
                .await
                .map_err(|error| error.code.to_owned())?;
            let second_close = host
                .dispatch(close("second-close", second, second_lane, second_epoch))
                .await
                .map_err(|error| error.code.to_owned())?;
            Ok::<_, String>((first_close, second_status, second_close))
        });
        runtime.block_on(host.shutdown());
        std::fs::remove_dir_all(root).unwrap();
        let (first_close, second_status, second_close) = outcome.unwrap();
        assert_eq!(first_close["stopProof"]["profileStopped"], true);
        assert!(second_status["browser_epoch"].as_u64().is_some());
        assert_eq!(second_close["stopProof"]["profileStopped"], true);
    }
}
