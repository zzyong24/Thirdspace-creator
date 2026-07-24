fn main() {
    // [T-372 L2 / T-487 RAT-PKG-05] sidecar 入口完整性:全平台构建期都对
    // src-tauri/sidecar.tar.gz 算 SHA-256,
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
        // [T-446] 关键:Windows 默认线程栈只有 1MB(Linux/mac 是 8MB)。栈上分配 [0u8; 1024*1024]
        //   会**直接吃光整个栈**,build.rs 进程 STATUS_STACK_OVERFLOW(0xc00000fd)。改用 vec!
        //   在堆上分配。CI 与本机 Windows 均命中此坑。
        let mut buf = vec![0_u8; 1024 * 1024];
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
    let target_os = std::env::var("CARGO_CFG_TARGET_OS").unwrap_or_default();
    // 当前生产配置与 build-sidecar 均为全平台 tar。Windows 不能再注入空哈希，否则安装包
    // 虽携带 tar，运行时却会把正式构建误判成 dev 并跳过完整性校验。
    let hash = sha256_file(&tarball);
    println!("cargo:rustc-env=CREATOROS_SIDECAR_SHA256={hash}");
    println!("cargo:rerun-if-changed=sidecar.tar.gz");

    // Windows 直接资源的快速入口校验。只读 server.js，不再每次启动读 935MB tar；诚实边界：
    // 这是入口防篡改，不是假装对 2 万多个运行时文件逐一验签。
    let entry = manifest_dir.join("sidecar").join("frontend").join("server.js");
    let entry_hash = sha256_file(&entry);
    println!("cargo:rustc-env=CREATOROS_SIDECAR_ENTRY_SHA256={entry_hash}");
    println!("cargo:rerun-if-changed=sidecar/frontend/server.js");

    // [T-450] 完整性抽样清单：把 sidecar/ 下关键文件(.jsc + stub .js + app 路由 + native
    // dylib/dll/.node + instrumentation.js)的 SHA-256 打包成 blob,写到 $OUT_DIR/
    // integrity-manifest.bin。运行时 lib.rs 根据 machine_id+hour 派生 seed 抽 N=12 项校验。
    //   · 目标:攻击者 patch 任意 .jsc 或 native binding 后被抽样命中 → 拒 spawn。
    //   · 诚实边界:攻击者仍可 patch 本 build.rs 生成逻辑或 lib.rs 校验逻辑本身(SPEC ladder
    //     §9 认可);抽样 + 秘密 seed 只把静态盘点门槛从「grep 一个 verify_file_sha256 调用」
    //     抬到「运行时动态派生一组不可预测索引」。
    //   · 构建时序:package.mjs 已经跑完 build-sidecar → obfuscate → bytecode → decoy →
    //     legal-stamp,然后 tauri build 触发 cargo → 本文件；故 build.rs 看到的 sidecar/
    //     是**最终态**(混淆+字节码后)。
    //   · dev / cargo check:sidecar/ 不存在 → 生成空 manifest;lib.rs 见空 manifest 诚实
    //     Err(与 CREATOROS_SIDECAR_SHA256 空串同款语义,不静默通过)。
    let sidecar_root = manifest_dir.join("sidecar");
    generate_integrity_manifest(&sidecar_root, &target_os);
    println!("cargo:rerun-if-changed=sidecar");

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

// [T-450] 生成完整性清单 blob。格式:
//   [magic:4B = "CIm1"] [record_count:u32 LE] { [path_len:u16 LE][utf8 path][hash:32B] }*
// 除 magic 4B 外,整个 blob 用 XOR-mask(以 obfstr 保护的 16B 密钥循环 XOR)——lib.rs 读时
// 反 XOR 再 parse。XOR 不是加密,只是让 `strings` 一眼看不到 manifest 里的路径列表(抬 recon
// 门槛)。obfstr 编译期混淆密钥常量,静态 grep 不到明文。
//
// walk 范围($3.1):
//   · frontend/server.js
//   · frontend/.next/server/**/*.{js,jsc}
//   · sidecar/lib/**/*.{dylib,so,dll}(mac dylib + win dll)
//   · frontend/node_modules/.pnpm/**/onnxruntime*.{dylib,dll,so}
//   · frontend/node_modules/.pnpm/**/build/Release/*.node
//   · frontend/instrumentation.js(如存在)
// 明确排除:Chromium 浏览器二进制 + ffmpeg 静态(数百 MB,冷启动 hash 破 UX)。
fn generate_integrity_manifest(sidecar_root: &std::path::Path, target_os: &str) {
    use sha2::{Digest, Sha256};
    use std::io::{Read as _, Write as _};

    let out_dir = std::path::PathBuf::from(std::env::var_os("OUT_DIR").unwrap());
    let manifest_path = out_dir.join("integrity-manifest.bin");

    // 若 sidecar/ 不存在(dev / cargo check)→ 写空 manifest。lib.rs 见 record_count=0 诚实
    // Err(与既有 CREATOROS_SIDECAR_SHA256 空串同款语义,不静默通过)。
    if !sidecar_root.is_dir() {
        write_empty_manifest(&manifest_path);
        return;
    }

    let mut records: Vec<(String, [u8; 32])> = Vec::new();

    let include_extensions: &[&str] = &["js", "jsc"];
    let native_extensions: &[&str] = if target_os == "windows" {
        &["dll"]
    } else if target_os == "macos" {
        &["dylib"]
    } else {
        &["so"]
    };

    // 1) frontend/server.js + frontend/.next/server/**/*.{js,jsc}
    let js_root = sidecar_root.join("frontend").join(".next").join("server");
    if js_root.is_dir() {
        walk_files(&js_root, sidecar_root, include_extensions, &mut records);
    }
    let server_js = sidecar_root.join("frontend").join("server.js");
    if server_js.is_file() {
        add_file(&server_js, sidecar_root, &mut records);
    }
    let instrumentation = sidecar_root.join("frontend").join("instrumentation.js");
    if instrumentation.is_file() {
        add_file(&instrumentation, sidecar_root, &mut records);
    }

    // 2) sidecar/lib/*.{dylib|dll|so}(co-ship 的 native runtime + 依赖 dylib)
    let lib_dir = sidecar_root.join("lib");
    if lib_dir.is_dir() {
        walk_files(&lib_dir, sidecar_root, native_extensions, &mut records);
    }

    // 3) .pnpm/**/onnxruntime*.{dylib|dll|so} + .pnpm/**/build/Release/*.node
    //    (native binding 是攻击 hook 授权的隐蔽路径)
    let pnpm_root = sidecar_root
        .join("frontend")
        .join("node_modules")
        .join(".pnpm");
    if pnpm_root.is_dir() {
        walk_pnpm_natives(&pnpm_root, sidecar_root, native_extensions, &mut records);
    }

    // hash 计算辅助闭包:sha256 一个文件。跟 sha256_file 语义同,单独维护是因为这里返回原始
    // 32B 而非 hex 字符串(manifest 直接存二进制,更紧凑)。
    fn sha256_bytes(path: &std::path::Path) -> Option<[u8; 32]> {
        let mut file = std::fs::File::open(path).ok()?;
        let mut hasher = Sha256::new();
        // [T-446] 同 sha256_file:堆分配,防 Windows 1MB 线程栈爆栈。
        let mut buf = vec![0_u8; 1024 * 1024];
        loop {
            let n = file.read(&mut buf).ok()?;
            if n == 0 {
                break;
            }
            hasher.update(&buf[..n]);
        }
        Some(hasher.finalize().into())
    }
    fn add_file(
        abs: &std::path::Path,
        root: &std::path::Path,
        records: &mut Vec<(String, [u8; 32])>,
    ) {
        if !abs.is_file() {
            return;
        }
        let Ok(rel) = abs.strip_prefix(root) else {
            return;
        };
        // 统一用 posix `/` 分隔;运行时 lib.rs join 时按平台还原。
        let rel_posix = rel
            .components()
            .map(|c| c.as_os_str().to_string_lossy().into_owned())
            .collect::<Vec<_>>()
            .join("/");
        if let Some(hash) = sha256_bytes(abs) {
            records.push((rel_posix, hash));
        }
    }
    fn walk_files(
        dir: &std::path::Path,
        root: &std::path::Path,
        exts: &[&str],
        records: &mut Vec<(String, [u8; 32])>,
    ) {
        let Ok(rd) = std::fs::read_dir(dir) else {
            return;
        };
        for entry in rd.flatten() {
            let p = entry.path();
            let Ok(ft) = entry.file_type() else { continue };
            if ft.is_symlink() {
                continue; // 不跟随 pnpm symlink,防污染
            }
            if ft.is_dir() {
                walk_files(&p, root, exts, records);
                continue;
            }
            if !ft.is_file() {
                continue;
            }
            let matches = p
                .extension()
                .and_then(|e| e.to_str())
                .map(|e| exts.iter().any(|x| e.eq_ignore_ascii_case(x)))
                .unwrap_or(false);
            if matches {
                add_file(&p, root, records);
            }
        }
    }
    fn walk_pnpm_natives(
        pnpm_root: &std::path::Path,
        root: &std::path::Path,
        native_exts: &[&str],
        records: &mut Vec<(String, [u8; 32])>,
    ) {
        // .pnpm 下每个 <name>@<ver>/node_modules/<pkg>/(build/Release/*.node | *.dylib|dll|so)
        let Ok(rd) = std::fs::read_dir(pnpm_root) else {
            return;
        };
        for entry in rd.flatten() {
            let entry_dir = entry.path();
            let name = entry.file_name();
            let name_str = name.to_string_lossy();
            let is_onnx = name_str.starts_with("onnxruntime-");
            if !is_onnx && !name_str.contains("sharp") && !name_str.contains("photon") {
                // 只挑最关键的几家 native binding(onnxruntime/sharp/photon-node),避免全 .pnpm
                // walk 让 manifest 撑大。是否放行由包名前缀判断,不覆盖不受信任的三方 .node。
                continue;
            }
            walk_native_leaf(&entry_dir, root, native_exts, records);
        }
    }
    fn walk_native_leaf(
        dir: &std::path::Path,
        root: &std::path::Path,
        native_exts: &[&str],
        records: &mut Vec<(String, [u8; 32])>,
    ) {
        let Ok(rd) = std::fs::read_dir(dir) else {
            return;
        };
        for entry in rd.flatten() {
            let p = entry.path();
            let Ok(ft) = entry.file_type() else { continue };
            if ft.is_symlink() {
                continue;
            }
            if ft.is_dir() {
                walk_native_leaf(&p, root, native_exts, records);
                continue;
            }
            if !ft.is_file() {
                continue;
            }
            let matches = p
                .extension()
                .and_then(|e| e.to_str())
                .map(|e| {
                    e.eq_ignore_ascii_case("node")
                        || native_exts.iter().any(|x| e.eq_ignore_ascii_case(x))
                })
                .unwrap_or(false);
            if matches {
                add_file(&p, root, records);
            }
        }
    }

    // 稳定排序:build 之间字节等价(路径排序)——避免 CI 上因 readdir 顺序差异导致 manifest
    // hash 变;也让抽样索引跨 CI 可复现。
    records.sort_by(|a, b| a.0.cmp(&b.0));

    // 序列化(未 XOR):magic(4) + count(4) + records
    let mut plain: Vec<u8> = Vec::with_capacity(4 + 4 + records.len() * (2 + 60 + 32));
    plain.extend_from_slice(b"CIm1");
    plain.extend_from_slice(&(records.len() as u32).to_le_bytes());
    for (rel, hash) in &records {
        let bytes = rel.as_bytes();
        plain.extend_from_slice(&(bytes.len() as u16).to_le_bytes());
        plain.extend_from_slice(bytes);
        plain.extend_from_slice(hash);
    }

    // XOR-mask(magic 4B 明,后续全 XOR)。XOR 密钥用一段稳定的静态 pattern(build 期字面
    // 常量;运行时 lib.rs 会同款 obfstr 藏这 16B 密钥,不出现在二进制静态段)。
    //   注意:这里 build.rs 里**不能**用 obfstr(build-dep,不引 obfstr);build 期就用明文
    //   常量。攻击者要 unmask 得先在 Rust 壳里找到那 16B 密钥的 obfstr 藏点——那正是运行
    //   时的活。
    const XOR_KEY: [u8; 16] = [
        0x3a, 0x9f, 0x21, 0x7c, 0x55, 0xe0, 0x0b, 0x8d, 0x46, 0x12, 0xa8, 0xd3, 0x67, 0xbe, 0x1e,
        0x94,
    ];
    let mut masked = plain.clone();
    for (i, byte) in masked.iter_mut().enumerate().skip(4) {
        *byte ^= XOR_KEY[(i - 4) % 16];
    }

    let mut f = match std::fs::File::create(&manifest_path) {
        Ok(f) => f,
        Err(e) => {
            eprintln!("[build.rs][T-450] 写 integrity-manifest.bin 失败: {e}");
            return;
        }
    };
    if let Err(e) = f.write_all(&masked) {
        eprintln!("[build.rs][T-450] 写 integrity-manifest.bin 失败: {e}");
        return;
    }
    eprintln!(
        "[build.rs][T-450] integrity-manifest.bin 生成: {} 条,{} bytes",
        records.len(),
        masked.len()
    );
}

fn write_empty_manifest(path: &std::path::Path) {
    use std::io::Write as _;
    // magic + count=0(无 records)。XOR 一段空的没意义,直接写明文;lib.rs 见 count=0 即
    // 返回 Err（dev 场景诚实降级）。
    let mut buf = Vec::with_capacity(8);
    buf.extend_from_slice(b"CIm1");
    buf.extend_from_slice(&0u32.to_le_bytes());
    if let Ok(mut f) = std::fs::File::create(path) {
        let _ = f.write_all(&buf);
    }
}
