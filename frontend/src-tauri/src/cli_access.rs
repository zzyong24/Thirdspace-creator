//! T-843 CreatorOS CLI 启动级完整访问。

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

const CONNECTION_SCHEMA: &str = "creatoros-cli-connection/v1";
const CREDENTIAL_SCHEMA: &str = "creatoros-cli-credential/v1";
const ACCESS_LIFETIME_MS: u64 = 24 * 60 * 60 * 1000;

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
pub struct CliAccessState(pub Mutex<Option<CliAccessRuntime>>);

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
    descriptor.schema == CONNECTION_SCHEMA
        && descriptor.product_id == runtime.product_id
        && descriptor.package_id == runtime.package_id
        && descriptor.pid == std::process::id()
        && descriptor.expires_at > now
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
                5_000,
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
    if let Err(error) = write_json_atomic(&connection_path(runtime), &ConnectionDescriptor {
        schema: CONNECTION_SCHEMA,
        product_id: &runtime.product_id,
        package_id: &runtime.package_id,
        protocol_version: 1,
        pid: std::process::id(),
        port: runtime.port,
        issued_at,
        expires_at,
        access: "full",
        credential_file: "credential.json",
        launch_nonce_sha256: launch_nonce_sha256(&runtime.launch_nonce),
    }) {
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

pub fn initialize(state: &CliAccessState, runtime: CliAccessRuntime) {
    revoke_runtime(&runtime);
    if let Err(error) = install_launcher(&runtime) {
        eprintln!("[shell] CreatorOS CLI 命令入口安装失败: {error}");
    }
    *state.0.lock().unwrap() = Some(runtime);
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
    enable_runtime(guard.as_ref().ok_or_else(|| "CreatorOS sidecar 尚未就绪".to_string())?)
}

#[tauri::command]
pub fn cli_access_revoke(state: tauri::State<'_, CliAccessState>) -> Result<CliAccessStatus, String> {
    let guard = state.0.lock().unwrap();
    let runtime = guard.as_ref().ok_or_else(|| "CreatorOS sidecar 尚未就绪".to_string())?;
    revoke_runtime(runtime);
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
    if let Some(runtime) = state.0.lock().unwrap().as_ref() { revoke_runtime(runtime); }
}

#[cfg(test)]
mod tests {
    use super::*;

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
