fn main() {
    // [T-372 L2] sidecar 入口完整性:构建期对 src-tauri/sidecar.tar.gz 算 SHA-256,
    // 经 rustc-env 编进二进制(lib.rs 解压前比对,不匹配拒绝 spawn)。
    //   · beforeBuildCommand(build-sidecar.mjs)先产 tarball,再进 cargo 构建 → 此处必能读到;
    //   · dev(cargo check / 无 tarball)→ 注入空串,运行时对 dev 源目录诚实跳过校验(有日志)。
    //   诚实边界(SPEC §9 gate-F4):此哈希只防 **JS 层篡改**;patch Rust 二进制本身可绕,
    //   不假装形成全链路防篡改。
    let tarball = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("sidecar.tar.gz");
    let hash = match std::fs::read(&tarball) {
        Ok(bytes) => {
            use sha2::{Digest, Sha256};
            let mut hasher = Sha256::new();
            hasher.update(&bytes);
            hasher
                .finalize()
                .iter()
                .map(|b| format!("{b:02x}"))
                .collect::<String>()
        }
        Err(_) => String::new(),
    };
    println!("cargo:rustc-env=CREATOROS_SIDECAR_SHA256={hash}");
    println!("cargo:rerun-if-changed=sidecar.tar.gz");

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
        ]),
    ))
    .expect("tauri_build 失败");
}
