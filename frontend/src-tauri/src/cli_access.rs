//! T-843 CreatorOS CLI 启动级完整访问。

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

const CONNECTION_SCHEMA: &str = "creatoros-cli-connection/v1";
const CREDENTIAL_SCHEMA: &str = "creatoros-cli-credential/v1";
const ACCESS_LIFETIME_MS: u64 = 24 * 60 * 60 * 1000;
const ACCESS_RENEW_WINDOW_MS: u64 = 60 * 60 * 1000;
const ACCESS_CHECK_INTERVAL: std::time::Duration = std::time::Duration::from_secs(60);

#[derive(Clone)]
pub struct CliAccessRuntime {
    pub dir: PathBuf,
    pub product_id: String,
    pub package_id: String,
    pub port: u16,
    pub handshake_token: String,
    pub cli_access_token: String,
    pub launch_nonce: String,
    pub cli_node: PathBuf,
    pub cli_script: PathBuf,
}

#[derive(Default)]
pub struct CliAccessState(pub Arc<Mutex<Option<CliAccessRuntime>>>);

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ConnectionDescriptor<'a> {
    schema: &'static str,
    product_id: &'a str,
    package_id: &'a str,
    protocol_version: u8,
    pid: u32,
    port: u16,
    issued_at: u64,
    expires_at: u64,
    access: &'static str,
    credential_file: &'static str,
    launch_nonce_sha256: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Credential<'a> {
    schema: &'static str,
    product_id: &'a str,
    package_id: &'a str,
    handshake_token: &'a str,
    cli_access_token: &'a str,
    launch_nonce: &'a str,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredConnectionDescriptor {
    schema: String,
    product_id: String,
    package_id: String,
    pid: u32,
    expires_at: u64,
    credential_file: String,
    launch_nonce_sha256: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredCredential {
    schema: String,
    product_id: String,
    package_id: String,
    handshake_token: String,
    cli_access_token: String,
    launch_nonce: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredActivity {
    schema: String,
    active_connections: u32,
    last_invocation_at: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CliAccessStatus {
    supported: bool,
    ready: bool,
    installed: bool,
    enabled: bool,
    product_id: Option<String>,
    expires_at: Option<u64>,
    command_path: Option<String>,
    active_connections: u32,
    last_invocation_at: Option<u64>,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AccessPreference {
    schema: String,
    product_id: String,
    package_id: String,
    enabled: bool,
}

fn auto_access_enabled(runtime: &CliAccessRuntime) -> Result<bool, String> {
    let bytes = match std::fs::read(runtime.dir.join("preference.json")) {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(true),
        Err(error) => return Err(format!("读取 CLI 自动开启设置失败: {error}")),
    };
    let value: AccessPreference = serde_json::from_slice(&bytes)
        .map_err(|_| "CLI 自动开启设置损坏".to_string())?;
    if value.schema != "creatoros-cli-preference/v1" || value.product_id != runtime.product_id || value.package_id != runtime.package_id {
        return Err("CLI 自动开启设置身份不匹配".to_string());
    }
    Ok(value.enabled)
}

fn save_auto_access(runtime: &CliAccessRuntime, enabled: bool) -> Result<(), String> {
    write_json_atomic(&runtime.dir.join("preference.json"), &AccessPreference {
        schema: "creatoros-cli-preference/v1".to_string(),
        product_id: runtime.product_id.clone(), package_id: runtime.package_id.clone(), enabled,
    })
}

fn epoch_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

fn launch_nonce_sha256(value: &str) -> String {
    use sha2::{Digest, Sha256};
    format!("{:x}", Sha256::digest(value.as_bytes()))
}

fn stored_access_matches(
    runtime: &CliAccessRuntime,
    descriptor: &StoredConnectionDescriptor,
    credential: &StoredCredential,
    now: u64,
) -> bool {
    descriptor.expires_at > now && stored_identity_matches(runtime, descriptor, credential)
}

// SEMANTIC_BOUNDARY_ALLOW: 仅校验当前启动的凭据身份，不做创作或意图判断。
fn stored_identity_matches(
    runtime: &CliAccessRuntime,
    descriptor: &StoredConnectionDescriptor,
    credential: &StoredCredential,
) -> bool {
    descriptor.schema == CONNECTION_SCHEMA
        && descriptor.product_id == runtime.product_id
        && descriptor.package_id == runtime.package_id
        && descriptor.pid == std::process::id()
        && descriptor.credential_file == "credential.json"
        && descriptor.launch_nonce_sha256 == launch_nonce_sha256(&runtime.launch_nonce)
        && credential.schema == CREDENTIAL_SCHEMA
        && credential.product_id == runtime.product_id
        && credential.package_id == runtime.package_id
        && credential.handshake_token == runtime.handshake_token
        && credential.cli_access_token == runtime.cli_access_token
        && credential.launch_nonce == runtime.launch_nonce
}

pub fn default_connection_dir(product_id: &str) -> PathBuf {
    let safe_product = product_id
        .chars()
        .map(|ch| if ch.is_ascii_alphanumeric() || matches!(ch, '.' | '_' | '-') { ch } else { '-' })
        .collect::<String>();
    #[cfg(target_os = "macos")]
    {
        let home = std::env::var_os("HOME").map(PathBuf::from).unwrap_or_else(|| PathBuf::from("."));
        return home.join("Library/Application Support/CreatorOS").join(safe_product).join("cli");
    }
    #[cfg(target_os = "windows")]
    {
        let base = std::env::var_os("LOCALAPPDATA").map(PathBuf::from).unwrap_or_else(|| PathBuf::from("."));
        return base.join("CreatorOS").join(safe_product).join("cli");
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        let base = std::env::var_os("XDG_RUNTIME_DIR")
            .map(PathBuf::from)
            .or_else(|| std::env::var_os("HOME").map(|home| PathBuf::from(home).join(".local/state")))
            .unwrap_or_else(|| PathBuf::from("."));
        base.join("creatoros").join(safe_product).join("cli")
    }
}

fn connection_path(runtime: &CliAccessRuntime) -> PathBuf { runtime.dir.join("connection.json") }
fn credential_path(runtime: &CliAccessRuntime) -> PathBuf { runtime.dir.join("credential.json") }
fn activity_path(runtime: &CliAccessRuntime) -> PathBuf { runtime.dir.join("activity.json") }

fn launcher_path() -> PathBuf {
    #[cfg(target_os = "windows")]
    {
        let base = std::env::var_os("LOCALAPPDATA").map(PathBuf::from).unwrap_or_else(|| PathBuf::from("."));
        return base.join("CreatorOS").join("bin").join("creatoros.cmd");
    }
    #[cfg(not(target_os = "windows"))]
    {
        let home = std::env::var_os("HOME").map(PathBuf::from).unwrap_or_else(|| PathBuf::from("."));
        home.join(".local").join("bin").join("creatoros")
    }
}

#[cfg(any(target_os = "windows", test))]
fn path_value_with_directory(current: &str, directory: &Path, present: bool) -> Result<String, String> {
    let directory = directory
        .to_str()
        .ok_or_else(|| "CLI 命令目录不是有效 UTF-8".to_string())?
        .trim_end_matches(['\\', '/']);
    if directory.is_empty() {
        return Err("CLI 命令目录为空".to_string());
    }
    let same = |value: &str| {
        value.trim().trim_matches('"').trim_end_matches(['\\', '/']).eq_ignore_ascii_case(directory)
    };
    let mut parts = current
        .split(';')
        .map(str::trim)
        .filter(|value| !value.is_empty() && !same(value))
        .map(str::to_string)
        .collect::<Vec<_>>();
    if present {
        parts.push(directory.to_string());
    }
    Ok(parts.join(";"))
}

#[cfg(target_os = "windows")]
fn set_windows_user_path_directory(directory: &Path, present: bool) -> Result<(), String> {
    use windows_sys::Win32::Foundation::{ERROR_FILE_NOT_FOUND, ERROR_SUCCESS};
    use windows_sys::Win32::System::Registry::{
        RegCloseKey, RegOpenKeyExW, RegQueryValueExW, RegSetValueExW, HKEY, HKEY_CURRENT_USER,
        KEY_QUERY_VALUE, KEY_SET_VALUE, REG_EXPAND_SZ, REG_SZ,
    };
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        SendMessageTimeoutW, HWND_BROADCAST, SMTO_ABORTIFHUNG, WM_SETTINGCHANGE,
    };

    fn wide(value: &str) -> Vec<u16> { value.encode_utf16().chain(std::iter::once(0)).collect() }

    let subkey = wide("Environment");
    let value_name = wide("Path");
    let mut key: HKEY = std::ptr::null_mut();
    let open = unsafe {
        RegOpenKeyExW(
            HKEY_CURRENT_USER,
            subkey.as_ptr(),
            0,
            KEY_QUERY_VALUE | KEY_SET_VALUE,
            &mut key,
        )
    };
    if open != ERROR_SUCCESS {
        return Err(format!("打开 Windows 用户环境变量失败(code={open})"));
    }

    let result = (|| -> Result<(), String> {
        let mut value_type = REG_EXPAND_SZ;
        let mut byte_count = 0u32;
        let query_size = unsafe {
            RegQueryValueExW(
                key,
                value_name.as_ptr(),
                std::ptr::null(),
                &mut value_type,
                std::ptr::null_mut(),
                &mut byte_count,
            )
        };
        let current = if query_size == ERROR_FILE_NOT_FOUND {
            String::new()
        } else if query_size == ERROR_SUCCESS {
            let mut buffer = vec![0u16; (byte_count as usize).div_ceil(2).max(1)];
            let mut actual_bytes = byte_count;
            let query = unsafe {
                RegQueryValueExW(
                    key,
                    value_name.as_ptr(),
                    std::ptr::null(),
                    &mut value_type,
                    buffer.as_mut_ptr().cast(),
                    &mut actual_bytes,
                )
            };
            if query != ERROR_SUCCESS {
                return Err(format!("读取 Windows 用户 PATH 失败(code={query})"));
            }
            let length = buffer.iter().position(|value| *value == 0).unwrap_or(buffer.len());
            String::from_utf16(&buffer[..length])
                .map_err(|_| "Windows 用户 PATH 不是有效 UTF-16".to_string())?
        } else {
            return Err(format!("读取 Windows 用户 PATH 长度失败(code={query_size})"));
        };

        let next = path_value_with_directory(&current, directory, present)?;
        if next == current {
            return Ok(());
        }
        let encoded = wide(&next);
        let stored_type = if matches!(value_type, REG_SZ | REG_EXPAND_SZ) { value_type } else { REG_EXPAND_SZ };
        let set = unsafe {
            RegSetValueExW(
                key,
                value_name.as_ptr(),
                0,
                stored_type,
                encoded.as_ptr().cast(),
                (encoded.len() * std::mem::size_of::<u16>()) as u32,
            )
        };
        if set != ERROR_SUCCESS {
            return Err(format!("更新 Windows 用户 PATH 失败(code={set})"));
        }
        let environment = wide("Environment");
        let mut broadcast_result = 0usize;
        unsafe {
            SendMessageTimeoutW(
                HWND_BROADCAST,
                WM_SETTINGCHANGE,
                0,
                environment.as_ptr() as isize,
                SMTO_ABORTIFHUNG,
                120_000,
                &mut broadcast_result,
            );
        }
        Ok(())
    })();
    unsafe { RegCloseKey(key); }
    result
}

#[cfg(unix)]
fn current_user_only(path: &Path) -> Result<(), String> {
    use std::os::unix::fs::PermissionsExt;
    std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600))
        .map_err(|error| format!("设置 CLI 文件权限失败: {error}"))
}

#[cfg(not(unix))]
fn current_user_only(_path: &Path) -> Result<(), String> { Ok(()) }

fn write_json_atomic(path: &Path, value: &impl Serialize) -> Result<(), String> {
    let parent = path.parent().ok_or_else(|| "CLI 路径没有父目录".to_string())?;
    std::fs::create_dir_all(parent).map_err(|error| format!("创建 CLI 目录失败: {error}"))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(parent, std::fs::Permissions::from_mode(0o700))
            .map_err(|error| format!("设置 CLI 目录权限失败: {error}"))?;
    }
    let temp = path.with_extension(format!("tmp-{}", std::process::id()));
    let bytes = serde_json::to_vec_pretty(value).map_err(|error| format!("编码 CLI 文件失败: {error}"))?;
    std::fs::write(&temp, bytes).map_err(|error| format!("写 CLI 临时文件失败: {error}"))?;
    current_user_only(&temp)?;
    std::fs::rename(&temp, path).map_err(|error| format!("提交 CLI 文件失败: {error}"))?;
    current_user_only(path)
}

fn shell_quote(path: &Path) -> Result<String, String> {
    let value = path.to_str().ok_or_else(|| "CLI runtime 路径不是有效 UTF-8".to_string())?;
    if value.contains(['\n', '\r', '\0']) {
        return Err("CLI runtime 路径包含非法控制字符".to_string());
    }
    Ok(format!("'{}'", value.replace('\'', "'\\''")))
}

fn install_launcher_at(runtime: &CliAccessRuntime, path: PathBuf) -> Result<PathBuf, String> {
    if !runtime.cli_node.is_file() || !runtime.cli_script.is_file() {
        return Err(format!(
            "CreatorOS CLI 随包文件不完整(node={}, script={})",
            runtime.cli_node.display(),
            runtime.cli_script.display(),
        ));
    }
    let parent = path.parent().ok_or_else(|| "CLI 命令路径没有父目录".to_string())?;
    std::fs::create_dir_all(parent).map_err(|error| format!("创建 CLI 命令目录失败: {error}"))?;
    let temp = path.with_extension(format!("tmp-{}", std::process::id()));
    #[cfg(target_os = "windows")]
    let body = {
        let node = runtime.cli_node.to_string_lossy().replace('%', "%%").replace('"', "\"\"");
        let script = runtime.cli_script.to_string_lossy().replace('%', "%%").replace('"', "\"\"");
        format!("@echo off\r\n\"{node}\" \"{script}\" %*\r\n")
    };
    #[cfg(not(target_os = "windows"))]
    let body = format!(
        "#!/bin/sh\nexec {} {} \"$@\"\n",
        shell_quote(&runtime.cli_node)?,
        shell_quote(&runtime.cli_script)?,
    );
    std::fs::write(&temp, body.as_bytes()).map_err(|error| format!("写 CLI 命令失败: {error}"))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&temp, std::fs::Permissions::from_mode(0o700))
            .map_err(|error| format!("设置 CLI 命令权限失败: {error}"))?;
    }
    std::fs::rename(&temp, &path).map_err(|error| format!("提交 CLI 命令失败: {error}"))?;
    Ok(path)
}

fn install_launcher(runtime: &CliAccessRuntime) -> Result<PathBuf, String> {
    let path = install_launcher_at(runtime, launcher_path())?;
    #[cfg(target_os = "windows")]
    set_windows_user_path_directory(
        path.parent().ok_or_else(|| "CLI 命令路径没有父目录".to_string())?,
        true,
    )?;
    Ok(path)
}

#[cfg(target_os = "windows")]
pub fn uninstall_launcher() -> Result<(), String> {
    let path = launcher_path();
    if let Some(parent) = path.parent() {
        set_windows_user_path_directory(parent, false)?;
    }
    match std::fs::remove_file(&path) {
        Ok(()) => {}
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => return Err(format!("删除 CreatorOS CLI 命令失败: {error}")),
    }
    if let Some(parent) = path.parent() {
        let _ = std::fs::remove_dir(parent);
    }
    Ok(())
}

fn revoke_runtime(runtime: &CliAccessRuntime) {
    let _ = std::fs::remove_file(connection_path(runtime));
    let _ = std::fs::remove_file(credential_path(runtime));
    let _ = std::fs::remove_file(activity_path(runtime));
}

fn enable_runtime(runtime: &CliAccessRuntime) -> Result<CliAccessStatus, String> {
    let command_path = install_launcher(runtime)?;
    let issued_at = epoch_ms();
    let expires_at = issued_at.saturating_add(ACCESS_LIFETIME_MS);
    write_json_atomic(&credential_path(runtime), &Credential {
        schema: CREDENTIAL_SCHEMA,
        product_id: &runtime.product_id,
        package_id: &runtime.package_id,
        handshake_token: &runtime.handshake_token,
        cli_access_token: &runtime.cli_access_token,
        launch_nonce: &runtime.launch_nonce,
    })?;
    if let Err(error) = write_connection(runtime, issued_at) {
        revoke_runtime(runtime);
        return Err(error);
    }
    Ok(CliAccessStatus {
        supported: true,
        ready: true,
        installed: true,
        enabled: true,
        product_id: Some(runtime.product_id.clone()),
        expires_at: Some(expires_at),
        command_path: Some(command_path.to_string_lossy().to_string()),
        active_connections: 0,
        last_invocation_at: None,
    })
}

fn write_connection(runtime: &CliAccessRuntime, issued_at: u64) -> Result<(), String> {
    write_json_atomic(&connection_path(runtime), &ConnectionDescriptor {
        schema: CONNECTION_SCHEMA,
        product_id: &runtime.product_id,
        package_id: &runtime.package_id,
        protocol_version: 1,
        pid: std::process::id(),
        port: runtime.port,
        issued_at,
        expires_at: issued_at.saturating_add(ACCESS_LIFETIME_MS),
        access: "full",
        credential_file: "credential.json",
        launch_nonce_sha256: launch_nonce_sha256(&runtime.launch_nonce),
    })
}

// 只由持有 state 锁的壳层调用；不创建凭据，不把过期连接放行给 CLI。
fn renew_runtime(runtime: &CliAccessRuntime, now: u64) -> Result<bool, String> {
    if !auto_access_enabled(runtime)? { return Ok(false); }
    let descriptor = std::fs::read(connection_path(runtime)).ok()
        .and_then(|bytes| serde_json::from_slice::<StoredConnectionDescriptor>(&bytes).ok());
    let credential = std::fs::read(credential_path(runtime)).ok()
        .and_then(|bytes| serde_json::from_slice::<StoredCredential>(&bytes).ok());
    let (Some(descriptor), Some(credential)) = (descriptor, credential) else { return Ok(false); };
    if !stored_identity_matches(runtime, &descriptor, &credential)
        || descriptor.expires_at > now.saturating_add(ACCESS_RENEW_WINDOW_MS) {
        return Ok(false);
    }
    // 唤醒可能已跨过租期，仍必须证明是本进程持有的同次启动凭据。
    write_connection(runtime, now)?;
    Ok(true)
}

fn start_renewal(state: &CliAccessState) {
    let weak = Arc::downgrade(&state.0);
    std::thread::spawn(move || {
        let mut last_error = None;
        loop {
            std::thread::sleep(ACCESS_CHECK_INTERVAL);
            let Some(state) = weak.upgrade() else { break; };
            let Ok(guard) = state.lock() else { break; };
            let Some(runtime) = guard.as_ref() else { break; };
            match renew_runtime(runtime, epoch_ms()) {
                Ok(_) => last_error = None,
                Err(error) => {
                    if last_error.as_ref() != Some(&error) {
                        eprintln!("[shell] CLI 连接续期失败: {error}");
                    }
                    last_error = Some(error);
                }
            }
        }
    });
}

pub fn initialize(state: &CliAccessState, runtime: CliAccessRuntime) {
    revoke_runtime(&runtime);
    if let Err(error) = install_launcher(&runtime) {
        eprintln!("[shell] CreatorOS CLI 命令入口安装失败: {error}");
    }
    match auto_access_enabled(&runtime) {
        Ok(true) => { if let Err(error) = enable_runtime(&runtime) {
            revoke_runtime(&runtime);
            eprintln!("[shell] CLI 自动开启失败: {error}");
        } },
        Ok(false) => {},
        Err(error) => eprintln!("[shell] CLI 保持关闭: {error}"),
    }
    *state.0.lock().unwrap() = Some(runtime);
    start_renewal(state);
}

#[tauri::command]
pub fn cli_access_status(state: tauri::State<'_, CliAccessState>) -> CliAccessStatus {
    let guard = state.0.lock().unwrap();
    let Some(runtime) = guard.as_ref() else {
        return CliAccessStatus {
            supported: true,
            ready: false,
            installed: false,
            enabled: false,
            product_id: None,
            expires_at: None,
            command_path: None,
            active_connections: 0,
            last_invocation_at: None,
        };
    };
    let credential = std::fs::read(credential_path(runtime))
        .ok()
        .and_then(|bytes| serde_json::from_slice::<StoredCredential>(&bytes).ok());
    let descriptor = std::fs::read(connection_path(runtime))
        .ok()
        .and_then(|bytes| serde_json::from_slice::<StoredConnectionDescriptor>(&bytes).ok())
        .filter(|value| credential.as_ref().is_some_and(|secret| {
            stored_access_matches(runtime, value, secret, epoch_ms())
        }));
    let activity = std::fs::read(activity_path(runtime))
        .ok()
        .and_then(|bytes| serde_json::from_slice::<StoredActivity>(&bytes).ok())
        .filter(|value| value.schema == "creatoros-cli-activity/v1");
    CliAccessStatus {
        supported: true,
        ready: runtime.cli_node.is_file() && runtime.cli_script.is_file(),
        installed: launcher_path().is_file(),
        enabled: descriptor.is_some(),
        product_id: Some(runtime.product_id.clone()),
        expires_at: descriptor.map(|value| value.expires_at),
        command_path: Some(launcher_path().to_string_lossy().to_string()),
        active_connections: activity.as_ref().map(|value| value.active_connections).unwrap_or(0),
        last_invocation_at: activity.map(|value| value.last_invocation_at),
    }
}

#[tauri::command]
pub fn cli_access_enable(state: tauri::State<'_, CliAccessState>) -> Result<CliAccessStatus, String> {
    let guard = state.0.lock().unwrap();
    let runtime = guard.as_ref().ok_or_else(|| "CreatorOS sidecar 尚未就绪".to_string())?;
    save_auto_access(runtime, true)?;
    match enable_runtime(runtime) {
        Ok(status) => Ok(status),
        Err(error) => { revoke_runtime(runtime); Err(error) },
    }
}

#[tauri::command]
pub fn cli_access_revoke(state: tauri::State<'_, CliAccessState>) -> Result<CliAccessStatus, String> {
    let guard = state.0.lock().unwrap();
    let runtime = guard.as_ref().ok_or_else(|| "CreatorOS sidecar 尚未就绪".to_string())?;
    let saved = save_auto_access(runtime, false);
    revoke_runtime(runtime);
    saved?;
    Ok(CliAccessStatus {
        supported: true,
        ready: true,
        installed: launcher_path().is_file(),
        enabled: false,
        product_id: Some(runtime.product_id.clone()),
        expires_at: None,
        command_path: Some(launcher_path().to_string_lossy().to_string()),
        active_connections: 0,
        last_invocation_at: None,
    })
}

pub fn revoke_on_exit(state: &CliAccessState) {
    if let Some(runtime) = state.0.lock().unwrap().take() { revoke_runtime(&runtime); }
}

#[cfg(test)]
mod tests {
    use super::*;

    struct RenewalFixture(CliAccessRuntime);
    impl RenewalFixture {
        fn new(name: &str) -> Self {
            let dir = std::env::temp_dir().join(format!("creatoros-renew-{name}-{}", std::process::id()));
            let _ = std::fs::remove_dir_all(&dir);
            let runtime = CliAccessRuntime {
                dir, product_id: "test".into(), package_id: "test.package".into(), port: 1234,
                handshake_token: "test-handshake".into(), cli_access_token: "test-access".into(),
                launch_nonce: "test-nonce".into(), cli_node: "unused-node".into(), cli_script: "unused-cli".into(),
            };
            save_auto_access(&runtime, true).unwrap();
            write_json_atomic(&credential_path(&runtime), &Credential {
                schema: CREDENTIAL_SCHEMA, product_id: &runtime.product_id, package_id: &runtime.package_id,
                handshake_token: &runtime.handshake_token, cli_access_token: &runtime.cli_access_token,
                launch_nonce: &runtime.launch_nonce,
            }).unwrap();
            write_connection(&runtime, 1_000).unwrap();
            Self(runtime)
        }
        fn descriptor(&self) -> StoredConnectionDescriptor {
            serde_json::from_slice(&std::fs::read(connection_path(&self.0)).unwrap()).unwrap()
        }
    }
    impl Drop for RenewalFixture {
        fn drop(&mut self) { let _ = std::fs::remove_dir_all(&self.0.dir); }
    }

    #[test]
    fn renewal_preserves_credentials_and_skips_healthy_lease() {
        let f = RenewalFixture::new("healthy");
        let before = std::fs::read(connection_path(&f.0)).unwrap();
        let secret = std::fs::read(credential_path(&f.0)).unwrap();
        assert!(!renew_runtime(&f.0, 1_001).unwrap());
        assert_eq!(std::fs::read(connection_path(&f.0)).unwrap(), before);
        let now = 1_000 + ACCESS_LIFETIME_MS - ACCESS_RENEW_WINDOW_MS;
        assert!(renew_runtime(&f.0, now).unwrap());
        assert_eq!(f.descriptor().expires_at, now + ACCESS_LIFETIME_MS);
        assert_eq!(std::fs::read(credential_path(&f.0)).unwrap(), secret);
        assert!(!renew_runtime(&f.0, now + 1).unwrap());
    }

    #[test]
    fn renewal_recovers_same_launch_after_sleep_beyond_expiry() {
        let f = RenewalFixture::new("sleep");
        let now = 1_000 + 3 * ACCESS_LIFETIME_MS;
        assert!(renew_runtime(&f.0, now).unwrap());
        assert_eq!(f.descriptor().expires_at, now + ACCESS_LIFETIME_MS);
        let credential = serde_json::from_slice(&std::fs::read(credential_path(&f.0)).unwrap()).unwrap();
        assert!(stored_access_matches(&f.0, &f.descriptor(), &credential, now));
        assert!(!stored_access_matches(&f.0, &f.descriptor(), &credential, now + ACCESS_LIFETIME_MS));
    }

    #[test]
    fn renewal_cannot_restore_disabled_or_revoked_access() {
        for name in ["disabled", "connection", "credential", "both", "corrupt-preference"] {
            let f = RenewalFixture::new(name);
            match name {
                "disabled" => save_auto_access(&f.0, false).unwrap(),
                "connection" => std::fs::remove_file(connection_path(&f.0)).unwrap(),
                "credential" => std::fs::remove_file(credential_path(&f.0)).unwrap(),
                "both" => revoke_runtime(&f.0),
                _ => std::fs::write(f.0.dir.join("preference.json"), b"broken").unwrap(),
            }
            let before = std::fs::read(connection_path(&f.0)).ok();
            assert!(!renew_runtime(&f.0, 3 * ACCESS_LIFETIME_MS).unwrap_or(false), "{name}");
            assert_eq!(std::fs::read(connection_path(&f.0)).ok(), before, "{name}");
            if matches!(name, "credential" | "both") { assert!(!credential_path(&f.0).exists()); }
        }
    }

    #[test]
    fn renewal_rejects_corrupt_and_foreign_connection_identity() {
        for (file, field, value) in [
            ("connection.json", "schema", serde_json::json!("other")),
            ("connection.json", "productId", serde_json::json!("other")),
            ("connection.json", "packageId", serde_json::json!("other")),
            ("connection.json", "pid", serde_json::json!(0)),
            ("connection.json", "launchNonceSha256", serde_json::json!("other")),
            ("connection.json", "credentialFile", serde_json::json!("other.json")),
            ("credential.json", "schema", serde_json::json!("other")),
            ("credential.json", "packageId", serde_json::json!("other")),
            ("credential.json", "productId", serde_json::json!("other")),
            ("credential.json", "handshakeToken", serde_json::json!("other")),
            ("credential.json", "cliAccessToken", serde_json::json!("other")),
            ("credential.json", "launchNonce", serde_json::json!("other")),
        ] {
            let f = RenewalFixture::new("identity");
            let path = f.0.dir.join(file);
            let mut body: serde_json::Value = serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();
            body[field] = value;
            write_json_atomic(&path, &body).unwrap();
            let before = std::fs::read(connection_path(&f.0)).unwrap();
            assert!(!renew_runtime(&f.0, 3 * ACCESS_LIFETIME_MS).unwrap(), "{file}/{field}");
            assert_eq!(std::fs::read(connection_path(&f.0)).unwrap(), before);
            std::fs::write(path, b"broken").unwrap();
            assert!(!renew_runtime(&f.0, 3 * ACCESS_LIFETIME_MS).unwrap());
        }
    }

    #[test]
    fn exit_removes_runtime_so_renewal_cannot_resurrect_access() {
        let f = RenewalFixture::new("exit");
        let state = CliAccessState::default();
        *state.0.lock().unwrap() = Some(f.0.clone());
        revoke_on_exit(&state);
        assert!(state.0.lock().unwrap().is_none());
        assert!(!connection_path(&f.0).exists());
        assert!(!credential_path(&f.0).exists());
        assert!(auto_access_enabled(&f.0).unwrap());
        revoke_on_exit(&state);
    }

    #[test]
    fn auto_access_remembers_choice_without_retaining_credentials() {
        let dir = std::env::temp_dir().join(format!("creatoros-cli-preference-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let runtime = CliAccessRuntime {
            dir: dir.clone(), product_id: "creatoros-test".into(), package_id: "test.package".into(),
            port: 1, handshake_token: "test".into(), cli_access_token: "test".into(), launch_nonce: "test".into(),
            cli_node: dir.join("node"), cli_script: dir.join("cli"),
        };
        assert!(auto_access_enabled(&runtime).unwrap());
        save_auto_access(&runtime, false).unwrap();
        revoke_runtime(&runtime);
        assert!(!auto_access_enabled(&runtime).unwrap());
        save_auto_access(&runtime, true).unwrap();
        assert!(auto_access_enabled(&runtime).unwrap());
        let mut other = runtime.clone(); other.package_id = "other.package".into();
        assert!(auto_access_enabled(&other).is_err());
        std::fs::write(dir.join("preference.json"), b"broken").unwrap();
        assert!(auto_access_enabled(&runtime).is_err());
        let _ = std::fs::remove_dir_all(dir);
    }

    #[cfg(unix)]
    #[test]
    fn launcher_uses_bundled_runtime_and_forwards_arguments() {
        let root = std::env::temp_dir().join(format!("creatoros-cli-launcher-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(&root).unwrap();
        let node = root.join("node runtime");
        let script = root.join("creatoros cli.cjs");
        std::fs::write(&node, b"node").unwrap();
        std::fs::write(&script, b"script").unwrap();
        let runtime = CliAccessRuntime {
            dir: root.join("connection"),
            product_id: "creatoros".to_string(),
            package_id: "cloud.aitongban.creatoros".to_string(),
            port: 43127,
            handshake_token: "handshake".to_string(),
            cli_access_token: "access".to_string(),
            launch_nonce: "nonce".to_string(),
            cli_node: node,
            cli_script: script,
        };
        let launcher = root.join("bin").join("creatoros");
        install_launcher_at(&runtime, launcher.clone()).unwrap();
        let body = std::fs::read_to_string(&launcher).unwrap();
        assert!(body.starts_with("#!/bin/sh\nexec "));
        assert!(body.contains("node runtime"));
        assert!(body.contains("creatoros cli.cjs"));
        assert!(body.ends_with("\"$@\"\n"));
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn path_update_is_exact_idempotent_and_preserves_other_entries() {
        let directory = Path::new(r"C:\Users\me\AppData\Local\CreatorOS\bin");
        let original = r"C:\Windows;C:\Tools;%USERPROFILE%\bin";
        let added = path_value_with_directory(original, directory, true).unwrap();
        assert_eq!(
            added,
            r"C:\Windows;C:\Tools;%USERPROFILE%\bin;C:\Users\me\AppData\Local\CreatorOS\bin"
        );
        assert_eq!(path_value_with_directory(&added, directory, true).unwrap(), added);
        assert_eq!(
            path_value_with_directory(&added, Path::new(r"c:\users\ME\appdata\local\creatoros\bin\"), false).unwrap(),
            original
        );
    }

    #[test]
    fn stored_access_requires_matching_package_pid_expiry_and_nonce() {
        let runtime = CliAccessRuntime {
            dir: PathBuf::from("/tmp/creatoros-cli-test"),
            product_id: "creatoros".to_string(),
            package_id: "cloud.aitongban.creatoros".to_string(),
            port: 43127,
            handshake_token: "handshake".to_string(),
            cli_access_token: "access".to_string(),
            launch_nonce: "nonce".to_string(),
            cli_node: PathBuf::from("node"),
            cli_script: PathBuf::from("creatoros.cjs"),
        };
        let descriptor = StoredConnectionDescriptor {
            schema: CONNECTION_SCHEMA.to_string(),
            product_id: runtime.product_id.clone(),
            package_id: runtime.package_id.clone(),
            pid: std::process::id(),
            expires_at: 200,
            credential_file: "credential.json".to_string(),
            launch_nonce_sha256: launch_nonce_sha256(&runtime.launch_nonce),
        };
        let credential = StoredCredential {
            schema: CREDENTIAL_SCHEMA.to_string(),
            product_id: runtime.product_id.clone(),
            package_id: runtime.package_id.clone(),
            handshake_token: runtime.handshake_token.clone(),
            cli_access_token: runtime.cli_access_token.clone(),
            launch_nonce: runtime.launch_nonce.clone(),
        };
        assert!(stored_access_matches(&runtime, &descriptor, &credential, 100));
        assert!(!stored_access_matches(
            &runtime,
            &StoredConnectionDescriptor { launch_nonce_sha256: "bad".to_string(), ..descriptor },
            &credential,
            100,
        ));
    }
}
