//! [T-635] CreatorOS 产品身份的 Rust 单一入口。
//!
//! ProductManifest 由 build.rs 生成并编入主二进制；release/release-fast 运行时不接受
//! projectKey 或 strict verify 的进程环境覆盖。只有带 debug assertions 的 tauri dev/debug
//! 构建保留本地联调覆盖能力。

pub const PRODUCT_MANIFEST_JSON: &str = env!("CREATOROS_BUILTIN_PRODUCT_MANIFEST_JSON");

pub fn product_manifest_json() -> &'static str {
    PRODUCT_MANIFEST_JSON
}

pub fn product_ref() -> &'static str {
    env!("CREATOROS_BUILTIN_PRODUCT_REF")
}

pub fn built_in_project_key() -> &'static str {
    option_env!("CREATOROS_BUILTIN_LICENSE_PROJECT_KEY").unwrap_or("")
}

pub fn resolve_project_key(runtime_value: Option<String>) -> String {
    resolve_project_key_for_build(
        runtime_value,
        built_in_project_key(),
        cfg!(debug_assertions),
    )
}

fn resolve_project_key_for_build(
    runtime_value: Option<String>,
    built_in_value: &str,
    allow_debug_override: bool,
) -> String {
    if allow_debug_override {
        if let Some(runtime) = runtime_value
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty())
        {
            return runtime;
        }
    }
    built_in_value.trim().to_string()
}

pub fn resolve_strict_verify(runtime_value: Option<String>) -> bool {
    resolve_strict_verify_for_build(runtime_value, cfg!(debug_assertions))
}

fn resolve_strict_verify_for_build(
    runtime_value: Option<String>,
    allow_debug_override: bool,
) -> bool {
    if allow_debug_override {
        return runtime_value
            .map(|value| value.trim() != "0")
            .unwrap_or(true);
    }
    true
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn distributable_build_ignores_runtime_project_key_and_weak_verify() {
        assert_eq!(
            resolve_project_key_for_build(Some("test".to_string()), "creatoros", false),
            "creatoros"
        );
        assert!(resolve_strict_verify_for_build(
            Some("0".to_string()),
            false,
        ));
    }

    #[test]
    fn debug_build_can_use_explicit_local_identity_and_weak_verify() {
        assert_eq!(
            resolve_project_key_for_build(Some("creatoros-dev".to_string()), "creatoros", true),
            "creatoros-dev"
        );
        assert!(!resolve_strict_verify_for_build(
            Some("0".to_string()),
            true,
        ));
    }

    #[test]
    fn product_manifest_is_canonical_and_stable() {
        assert_eq!(
            PRODUCT_MANIFEST_JSON,
            "{\"schema\":\"thirdspace-product-manifest/v1\",\"productRef\":\"creatoros\",\"appIdentifier\":\"cloud.aitongban.creatoros\",\"projectKey\":\"creatoros\"}"
        );
        assert_eq!(product_ref(), "creatoros");
        assert_eq!(
            env!("CREATOROS_BUILTIN_APP_IDENTIFIER"),
            "cloud.aitongban.creatoros"
        );
    }
}
