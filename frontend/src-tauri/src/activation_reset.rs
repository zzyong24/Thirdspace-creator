//! T-746：产品内仅重置本机激活态。
//!
//! 本模块刻意不持有服务器地址、网络客户端或用户传入路径。调用方必须先停止旧 sidecar，
//! 再调用这里的固定白名单文件清理；项目、数据库、机器身份和模型密钥永不进入白名单。

use std::ffi::OsString;
use std::path::{Path, PathBuf};

const RESET_FILE_NAMES: [&str; 4] = [
    ".license",
    ".license-seen",
    ".channel-model-config",
    ".channel-links",
];

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LocalActivationResetResult {
    pub cleared_items: usize,
    pub restart_required: bool,
}

#[cfg_attr(all(target_os = "macos", not(test)), allow(dead_code))]
pub(crate) fn resolve_non_macos_seen_path(
    home: Option<OsString>,
    user_profile: Option<OsString>,
) -> Result<PathBuf, String> {
    home.filter(|value| !value.is_empty())
        .or_else(|| user_profile.filter(|value| !value.is_empty()))
        .map(PathBuf::from)
        .map(|root| root.join(".creatoros-seen"))
        .ok_or_else(|| "无法定位本机激活防回拨点".to_string())
}

fn remove_file_if_present(path: &Path) -> Result<bool, String> {
    match std::fs::remove_file(path) {
        Ok(()) => Ok(true),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(false),
        Err(error) => Err(format!("清理本机激活项失败（{}）：{error}", path.display())),
    }
}

#[cfg(target_os = "macos")]
pub(crate) fn clear_platform_seen() -> Result<bool, String> {
    const DOMAIN: &str = "cloud.aitongban.creatoros.license";
    const KEY: &str = "lastSeenMs";
    let exists = std::process::Command::new("defaults")
        .args(["read", DOMAIN, KEY])
        .status()
        .map_err(|error| format!("检查本机激活防回拨点失败：{error}"))?
        .success();
    if !exists {
        return Ok(false);
    }
    let deleted = std::process::Command::new("defaults")
        .args(["delete", DOMAIN, KEY])
        .status()
        .map_err(|error| format!("清理本机激活防回拨点失败：{error}"))?;
    if deleted.success() {
        Ok(true)
    } else {
        Err("清理本机激活防回拨点失败".to_string())
    }
}

#[cfg(not(target_os = "macos"))]
pub(crate) fn clear_platform_seen() -> Result<bool, String> {
    let path =
        resolve_non_macos_seen_path(std::env::var_os("HOME"), std::env::var_os("USERPROFILE"))?;
    remove_file_if_present(&path)
}

pub(crate) fn execute_local_reset<Stop, ClearSecondary>(
    app_data_dir: &Path,
    stop_sidecar: Stop,
    clear_secondary_seen: ClearSecondary,
) -> Result<LocalActivationResetResult, String>
where
    Stop: FnOnce() -> Result<(), String>,
    ClearSecondary: FnOnce() -> Result<bool, String>,
{
    stop_sidecar()?;
    let mut cleared_items = 0;
    for file_name in RESET_FILE_NAMES {
        if remove_file_if_present(&app_data_dir.join(file_name))? {
            cleared_items += 1;
        }
    }
    if clear_secondary_seen()? {
        cleared_items += 1;
    }
    Ok(LocalActivationResetResult {
        cleared_items,
        restart_required: true,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::sync::atomic::{AtomicU64, Ordering};

    static NEXT_ID: AtomicU64 = AtomicU64::new(0);

    fn fixture_root(label: &str) -> PathBuf {
        let root = std::env::temp_dir().join(format!(
            "creatoros-activation-reset-{label}-{}-{}",
            std::process::id(),
            NEXT_ID.fetch_add(1, Ordering::Relaxed)
        ));
        fs::create_dir_all(&root).expect("create fixture root");
        root
    }

    #[test]
    fn 先停止旧_sidecar_再清理固定白名单并保留全部业务数据() {
        let root = fixture_root("whitelist");
        let app_data = root.join("app-data");
        let workspace = root.join("CreatorOS");
        fs::create_dir_all(&app_data).unwrap();
        fs::create_dir_all(&workspace).unwrap();

        for name in RESET_FILE_NAMES {
            fs::write(app_data.join(name), format!("reset:{name}")).unwrap();
        }
        for name in ["machine-id", ".master-key"] {
            fs::write(app_data.join(name), format!("keep:{name}")).unwrap();
        }
        for name in ["db", ".auth", "logs"] {
            fs::create_dir_all(app_data.join(name)).unwrap();
            fs::write(app_data.join(name).join("keep.txt"), format!("keep:{name}")).unwrap();
        }
        fs::write(workspace.join("project.txt"), "keep:project").unwrap();
        let secondary = root.join(".creatoros-seen");
        fs::write(&secondary, "reset:seen").unwrap();

        let result = execute_local_reset(
            &app_data,
            || {
                assert!(
                    app_data.join(".license").exists(),
                    "停 sidecar 必须发生在删除前"
                );
                Ok(())
            },
            || {
                if secondary.exists() {
                    fs::remove_file(&secondary).map_err(|error| error.to_string())?;
                    Ok(true)
                } else {
                    Ok(false)
                }
            },
        )
        .unwrap();

        assert_eq!(result.cleared_items, 5);
        for name in RESET_FILE_NAMES {
            assert!(!app_data.join(name).exists(), "{name} should be cleared");
        }
        assert!(!secondary.exists());
        assert_eq!(
            fs::read_to_string(app_data.join("machine-id")).unwrap(),
            "keep:machine-id"
        );
        assert_eq!(
            fs::read_to_string(app_data.join(".master-key")).unwrap(),
            "keep:.master-key"
        );
        for name in ["db", ".auth", "logs"] {
            assert_eq!(
                fs::read_to_string(app_data.join(name).join("keep.txt")).unwrap(),
                format!("keep:{name}")
            );
        }
        assert_eq!(
            fs::read_to_string(workspace.join("project.txt")).unwrap(),
            "keep:project"
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn sidecar_停止失败时拒绝删除任何激活文件() {
        let root = fixture_root("stop-failure");
        let app_data = root.join("app-data");
        fs::create_dir_all(&app_data).unwrap();
        fs::write(app_data.join(".license"), "keep-until-stopped").unwrap();

        let result = execute_local_reset(
            &app_data,
            || Err("sidecar stop failed".to_string()),
            || panic!("停止失败时不应进入 secondary 清理"),
        );
        assert!(result.is_err());
        assert_eq!(
            fs::read_to_string(app_data.join(".license")).unwrap(),
            "keep-until-stopped"
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn 非_macos_读写双方共用_home_优先于_userprofile_的路径() {
        let resolved = resolve_non_macos_seen_path(
            Some(OsString::from("C:\\Users\\home-from-runtime")),
            Some(OsString::from("C:\\Users\\profile")),
        )
        .unwrap();
        assert_eq!(
            resolved,
            PathBuf::from("C:\\Users\\home-from-runtime").join(".creatoros-seen")
        );
    }

    #[test]
    fn 模块源码不包含网络调用或激活服务地址() {
        let source = include_str!("activation_reset.rs");
        for forbidden in [
            concat!("http", "://"),
            concat!("https", "://"),
            concat!("license", ".aitongban.cloud"),
            concat!("req", "west"),
            concat!("Tcp", "Stream"),
        ] {
            assert!(
                !source.contains(forbidden),
                "forbidden source token: {forbidden}"
            );
        }
    }
}
