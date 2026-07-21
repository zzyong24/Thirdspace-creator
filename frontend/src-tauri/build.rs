fn main() {
    // [T-372 L2] sidecar 入口完整性:构建期对 src-tauri/sidecar.tar.gz 算 SHA-256,
    // 经 rustc-env 编进二进制(lib.rs 解压前比对,不匹配拒绝 spawn)。
    //   · beforeBuildCommand(build-sidecar.mjs)先产 tarball,再进 cargo 构建 → 此处必能读到;
    //   · dev(cargo check / 无 tarball)→ 注入空串,运行时对 dev 源目录诚实跳过校验(有日志)。
    //   诚实边界(SPEC §9 gate-F4):此哈希只防 **JS 层篡改**;patch Rust 二进制本身可绕,
    //   不假装形成全链路防篡改。
    fn sha256_file(path: &std::path::Path) -> String {
        use sha2::{Digest, Sha256};
        use std::io::Read as _;

        let mut file = match std::fs::File::open(path) {
            Ok(file) => file,
            Err(_) => return String::new(),
        };
        let mut hasher = Sha256::new();
        let mut buf = [0_u8; 1024 * 1024];
        loop {
            match file.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => hasher.update(&buf[..n]),
                Err(_) => return String::new(),
            }
        }
        hasher
            .finalize()
            .iter()
            .map(|b| format!("{b:02x}"))
            .collect::<String>()
    }

    let manifest_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
    let tarball = manifest_dir.join("sidecar.tar.gz");
    // [T-446] Windows 平台配置直接 bundle 展开 sidecar/，构建脚本会主动删旧 tar；别把同一
    // 工作区残留的 mac tar 哈希误烘进 Windows 壳。mac/Linux 保持全 tar 完整性链。
    let target_os = std::env::var("CARGO_CFG_TARGET_OS").unwrap_or_default();
    let hash = if target_os == "windows" {
        String::new()
    } else {
        sha256_file(&tarball)
    };
    println!("cargo:rustc-env=CREATOROS_SIDECAR_SHA256={hash}");
    println!("cargo:rerun-if-changed=sidecar.tar.gz");

    // Windows 直接资源的快速入口校验。只读 server.js，不再每次启动读 935MB tar；诚实边界：
    // 这是入口防篡改，不是假装对 2 万多个运行时文件逐一验签。
    let entry = manifest_dir.join("sidecar").join("frontend").join("server.js");
    let entry_hash = sha256_file(&entry);
    println!("cargo:rustc-env=CREATOROS_SIDECAR_ENTRY_SHA256={entry_hash}");
    println!("cargo:rerun-if-changed=sidecar/frontend/server.js");

    // [T-408] 主窗口是 sidecar 远程 http origin(WebviewUrl::External),Tauri v2 ACL 对远程
    // origin 的 app 自定义命令**默认全拒**("Command license_activate not allowed by ACL",
    // 2026-07-18 真机实锤)。app 命令的权限不会自动存在——必须在此声明,tauri-build 才会
    // 自动生成 `allow-<command>` / `deny-<command>` 权限,供 capabilities/remote-sidecar.json
    // 显式引用放行。三个命令 = generate_handler 全集(license 决策链 IPC,SPEC §9)。
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "license_activate",
            "license_check",
            "license_last_decision",
            // [T-396c] 版本检查(渠道化更新流:检查 + 跳渠道链接,替代 updater 插件 check)。
            "license_latest_version",
        ]),
    ))
    .expect("tauri_build 失败");
}
