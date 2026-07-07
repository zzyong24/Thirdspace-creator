//! CreatorOS 桌面壳(Tauri v2)—— T-147 P1 底座。
//!
//! 架构(见 docs/desktop-architecture-rfc.md §3):
//!   Tauri Rust core 启动时 spawn 一个 Node sidecar(next standalone `server.js`),
//!   注入 PORT / HOSTNAME / CREATOROS_DB_DIR,轮询就绪后把 WebView 指向
//!   `http://127.0.0.1:PORT`。退出时 kill sidecar。
//!
//! 除 LLM API 外全本地:WebView ──HTTP──► sidecar 进程内库调 backend/ai-worker ──► PGlite 落盘。

use std::net::TcpListener;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::Duration;

use base64::Engine as _;
use tauri::{AppHandle, Manager, RunEvent, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

/// T-147 P2 本地加密 —— master key 在 OS keychain 里的服务名/账号。keyring 用这对
/// (service, user) 定位条目(macOS Keychain / Windows Credential Manager / Linux
/// Secret Service 各自的原生存储)。
const KEYCHAIN_SERVICE: &str = "com.creatoros.desktop";
const KEYCHAIN_KEY_NAME: &str = "master-key";

/// 取/建 32B master key,base64 返回,供注入 sidecar env `CREATOROS_MASTER_KEY`。
///
/// 首启:keychain 无条目 → 随机生成 32 字节 → base64 存 keychain → 返回。
/// 后续:keychain 有条目 → 取出返回(校验解出 32 字节;损坏则重建)。
///
/// keychain 不可用(极端:无 Secret Service 的 headless Linux / 权限被拒)→ 返回 None,
/// sidecar 侧 resolveMasterKey 会走**开发降级**(web 路径不崩,安全性弱,已在总纲认知)。
fn resolve_or_create_master_key(app_data_dir: &std::path::Path) -> Option<String> {
    let valid = |s: &str| {
        base64::engine::general_purpose::STANDARD
            .decode(s.trim())
            .map(|b| b.len() == 32)
            .unwrap_or(false)
    };
    let key_file = app_data_dir.join(".master-key");

    // ① keychain 读(签名 app 上稳定 + 安全)。未签名 app 上 keychain 常不持久(macOS 把访问绑签名
    //    身份,rebuild/未签名每次身份变 → set_password 不真持久),故失败不致命,下面走文件兜底。
    if let Ok(entry) = keyring::Entry::new(KEYCHAIN_SERVICE, KEYCHAIN_KEY_NAME) {
        if let Ok(existing) = entry.get_password() {
            if valid(&existing) {
                return Some(existing.trim().to_string());
            }
        }
    }

    // ② 文件兜底读(<appDataDir>/.master-key)。未签名下 keychain 读不回时靠这个**稳定**(否则每次
    //    启动重生成 key → 激活码/model key 全解不开、每次都要重激活,不可用)。
    if let Ok(existing) = std::fs::read_to_string(&key_file) {
        if valid(&existing) {
            // best-effort 回填 keychain(签名后即生效,自动升级回强安全路径)。
            if let Ok(entry) = keyring::Entry::new(KEYCHAIN_SERVICE, KEYCHAIN_KEY_NAME) {
                let _ = entry.set_password(existing.trim());
            }
            return Some(existing.trim().to_string());
        }
    }

    // ③ 都没有 → 生成随机 32B,双写:keychain(best-effort)+ 文件(chmod 600,稳定兜底)。
    use rand::RngCore as _;
    let mut raw = [0u8; 32];
    rand::rngs::OsRng.fill_bytes(&mut raw);
    let b64 = base64::engine::general_purpose::STANDARD.encode(raw);
    if let Ok(entry) = keyring::Entry::new(KEYCHAIN_SERVICE, KEYCHAIN_KEY_NAME) {
        let _ = entry.set_password(&b64);
    }
    if let Err(e) = std::fs::write(&key_file, &b64) {
        // 连文件都写不了 → 降级(sidecar 用固定 dev key,弱安全但不崩)。
        eprintln!("[shell] 写 master key 文件失败(降级 dev key): {e}");
        return None;
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt as _;
        let _ = std::fs::set_permissions(&key_file, std::fs::Permissions::from_mode(0o600));
    }
    // 安全说明:文件兜底把 master key 明文存 appDataDir(与加密数据同盘)—— 安全弱于 keychain
    //   (能读盘者可解),但**未签名 app keychain 不持久**下这是唯一可用方案(签名后自动走 keychain)。
    eprintln!("[shell] 生成 master key(keychain best-effort + 文件兜底 .master-key)");
    Some(b64)
}

/// T-147 P5 桌面激活授权 —— 机器指纹(machineId)。多因子:平台稳定机器标识
/// (Tauri 的 hardware id,底层 macOS IOPlatformUUID / Windows MachineGuid / Linux
/// machine-id)+ 本机持久 UUID(<appDataDir>/machine-id,首启随机生成、后续复用),
/// 二者组合 SHA-256 → 稳定短指纹,注入 sidecar env `CREATOROS_MACHINE_ID`。
///
/// 取不到平台 id 时退化为「仅持久 UUID」(仍同机稳定、跨设备唯一)。伪造是所有软件授权的
/// 固有限制(文档 §5.2 已注),这里尽力稳,不宣称防伪造。
fn resolve_machine_id(app: &AppHandle) -> Option<String> {
    use sha2::{Digest, Sha256};

    // ① 本机持久 UUID(<appDataDir>/machine-id)。首启无 → 生成随机 UUID 落盘;后续读回。
    let persist_path = app
        .path()
        .app_data_dir()
        .map(|d| d.join("machine-id"))
        .ok()?;
    if let Some(parent) = persist_path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let persisted = match std::fs::read_to_string(&persist_path) {
        Ok(s) if !s.trim().is_empty() => s.trim().to_string(),
        _ => {
            // 生成随机 32B → hex,落盘。
            use rand::RngCore as _;
            let mut raw = [0u8; 16];
            rand::rngs::OsRng.fill_bytes(&mut raw);
            let uuid = raw.iter().map(|b| format!("{b:02x}")).collect::<String>();
            let _ = std::fs::write(&persist_path, &uuid);
            uuid
        }
    };

    // ② 平台稳定机器标识(best-effort;拿不到就只用持久 UUID)。
    let platform_id = machine_uid::get().unwrap_or_default();

    // ③ 组合 → SHA-256 → 前 32 hex(不暴露平台原始 UUID)。
    let mut hasher = Sha256::new();
    hasher.update(platform_id.as_bytes());
    hasher.update(b"|");
    hasher.update(persisted.as_bytes());
    let digest = hasher.finalize();
    let hex = digest.iter().map(|b| format!("{b:02x}")).collect::<String>();
    Some(hex[..32].to_string())
}

/// sidecar 子进程句柄。存进 Tauri state 以便退出时 kill,避免 orphan Node 进程。
#[derive(Default)]
struct SidecarHandle(Mutex<Option<CommandChild>>);

/// 找一个空闲 TCP 端口(绑 127.0.0.1:0 让 OS 分配后立即释放)。sidecar 用它启 Next server,
/// WebView 指向同一端口。避免固定端口在多实例/占用时冲突。
fn find_free_port() -> u16 {
    TcpListener::bind("127.0.0.1:0")
        .and_then(|l| l.local_addr())
        .map(|a| a.port())
        // 极端兜底:拿不到就用一个高位默认口(几乎不会走到)。
        .unwrap_or(41730)
}

/// 阻塞轮询 `http://127.0.0.1:PORT/` 直到 sidecar 就绪(或超时)。返回是否就绪。
/// 用裸 TCP connect 探活(不引 http client 依赖 —— 端口能连上即认为 server listen 成功)。
fn wait_until_ready(port: u16, timeout: Duration) -> bool {
    let deadline = std::time::Instant::now() + timeout;
    let addr = format!("127.0.0.1:{port}");
    while std::time::Instant::now() < deadline {
        if std::net::TcpStream::connect(&addr).is_ok() {
            return true;
        }
        std::thread::sleep(Duration::from_millis(150));
    }
    false
}

/// 定位 sidecar 组装目录(内含 frontend/ + backend/ + node_modules/ + lib/)。
/// sidecar 保留 pnpm 相对 symlink 结构,而 **Tauri resource 拷贝会丢 symlink**(T-169 实测:源 180 个
/// → bundle 0 个 → node 解析 next 断 → sidecar 起不来)。故 bundle 里带的是**单文件 tarball**
/// `sidecar.tar.gz`(symlink 存档内原样保留),首启解压到可写目录(系统 tar 原生保 symlink)。
///   ① CREATOROS_SIDECAR_DIR env 覆盖(打包/测试可指定);
///   ② dev:CARGO_MANIFEST_DIR/sidecar(编译期常量,指向源目录,symlink 完好);
///   ③ bundle:资源里的 sidecar.tar.gz → 首启解压到 appDataDir/runtime/<version>/sidecar(复用)。
fn resolve_sidecar_dir(app: &AppHandle) -> PathBuf {
    if let Ok(dir) = std::env::var("CREATOROS_SIDECAR_DIR") {
        let p = PathBuf::from(dir);
        if p.exists() {
            return p;
        }
    }
    // dev:源目录(symlink 完好)。CARGO_MANIFEST_DIR 是 src-tauri/ 的编译期绝对路径。
    let dev_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("sidecar");
    if dev_dir.join("frontend").join("server.js").exists() {
        return dev_dir;
    }
    // ③ bundle 兜底:资源里是 sidecar.tar.gz(单文件,规避 Tauri resource 丢 symlink)。
    let tarball = match app
        .path()
        .resolve("sidecar.tar.gz", tauri::path::BaseDirectory::Resource)
    {
        Ok(p) if p.exists() => p,
        // 资源里没 tarball(理论不会到这):退回 dev_dir,让上层探活失败,便于诊断而非静默乱指。
        _ => return dev_dir,
    };
    // 解压目标按版本隔离:appDataDir/runtime/<version>/sidecar。升级(新版本)→ 新目录 → 自动重解压。
    let version = app.package_info().version.to_string();
    let dest = match app.path().app_data_dir() {
        Ok(d) => d.join("runtime").join(&version).join("sidecar"),
        Err(_) => return dev_dir,
    };
    // 首启(或版本升级后首启)才解压;server.js 在位即认为已解压过,直接复用(避免每启动重解 598M)。
    let marker = dest.join("frontend").join("server.js");
    let stamp = dest.join(".tarball-stamp");
    // [T-169b] 陈旧缓存修复:版本恒 0.1.0(dev 反复重打 / 同版本 patch)时,仅凭 server.js 存在就跳过
    //   解压 → **新 tarball 永不生效**(跑的还是首次解压的旧 runtime,我的修复全不到达运行的 app)。
    //   改用 tarball 字节大小当指纹:与上次解压记录(.tarball-stamp)不符(或 marker 缺失)→ 清目录
    //   重解压。任何 rebuild/更新 tarball 尺寸都会变 → 新 runtime 必生效。bsdtar 解压快(秒级)。
    let tarball_size = std::fs::metadata(&tarball).map(|m| m.len()).unwrap_or(0);
    let stamped = std::fs::read_to_string(&stamp)
        .ok()
        .and_then(|s| s.trim().parse::<u64>().ok());
    let need_extract = !marker.exists() || stamped != Some(tarball_size);
    if need_extract {
        // 清掉可能的陈旧解压(旧 runtime)再全新解压 —— 否则残留旧文件混入。
        let _ = std::fs::remove_dir_all(&dest);
        if let Err(e) = std::fs::create_dir_all(&dest) {
            eprintln!("[shell] 建 sidecar 解压目录失败 {}: {e}", dest.display());
        }
        // 系统 tar 解压(-x 解 / -z gzip / -f 文件 / -C 目标)。macOS bsdtar、Win10+ tar.exe、Linux
        //   GNU tar 均原生按 symlink 还原 —— 这是选 tar 而非 Rust 解压库的关键(免依赖 + 保 symlink)。
        let status = std::process::Command::new("tar")
            .arg("-xzf")
            .arg(&tarball)
            .arg("-C")
            .arg(&dest)
            .status();
        match status {
            Ok(s) if s.success() => {
                let _ = std::fs::write(&stamp, tarball_size.to_string());
                eprintln!(
                    "[shell] sidecar 解压完成(size={tarball_size})→ {}",
                    dest.display()
                );
            }
            other => {
                eprintln!(
                    "[shell] sidecar 解压失败({other:?}),tarball={} → dest={}",
                    tarball.display(),
                    dest.display()
                );
            }
        }
    }
    dest
}

/// 桌面壳入口。web 运行方式(pnpm dev / 浏览器)完全不受影响 —— 这是纯新增的壳。
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        // T-147 P6 —— updater 插件(签名更新包校验;pubkey/endpoints 在 tauri.conf.json)。
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(SidecarHandle::default())
        .setup(|app| {
            let handle = app.handle().clone();

            // 1) DB 落盘目录:桌面单机默认 <appDataDir>/db。resolveDbDriver 会认
            //    CREATOROS_DB_DIR(见 backend/src/db.ts §3b),我们注入它 → PGlite 落这里。
            let db_dir = app
                .path()
                .app_data_dir()
                .map(|d| d.join("db"))
                .unwrap_or_else(|_| std::path::PathBuf::from(".creatoros/db"));
            // 首次启动 appDataDir 不存在 → PGlite mkdir(非递归)会 ENOENT。这里先建全父目录。
            if let Err(e) = std::fs::create_dir_all(&db_dir) {
                eprintln!("[shell] 建 DB 目录失败 {}: {e}", db_dir.display());
            }
            let db_dir_str = db_dir.to_string_lossy().to_string();

            // 2) 空闲端口 + sidecar 环境。
            let port = find_free_port();
            let port_str = port.to_string();

            // 3) 定位 sidecar 组装目录(next standalone 运行目录)。
            //    ⚠️ sidecar 内保留 pnpm 的相对 symlink(frontend/node_modules/next → .pnpm/…,node
            //       靠 walk-up 解析 @swc/helpers 等 peer)。Tauri 的 resource 拷贝器会**丢 symlink**,
            //       故 dev **不走 Tauri resource 拷贝**,直接读源目录 src-tauri/sidecar(symlink 完好)。
            //    解析顺序:①CREATOROS_SIDECAR_DIR(显式覆盖)②源目录 <manifest>/sidecar(dev)
            //       ③resource 目录(bundle 兜底)。
            let sidecar_dir = resolve_sidecar_dir(&app.handle());
            let server_js_str = sidecar_dir
                .join("frontend")
                .join("server.js")
                .to_string_lossy()
                .to_string();

            // sidecar 的 node runtime 是动态链接的(macOS: @rpath/libnode.dylib)。裸拷 node 二进制
            // 后 dyld 找不到 dylib → sidecar 起不来(SIGABRT)。build-sidecar.mjs 把 dylib co-ship 到
            // sidecar/lib/;注入 DYLD_LIBRARY_PATH(mac)/ LD_LIBRARY_PATH(linux)指向它。
            let lib_dir = sidecar_dir.join("lib").to_string_lossy().to_string();

            // T-147 P2 —— master key(base64 32B),注入 sidecar env `CREATOROS_MASTER_KEY` 做 model
            //   key / 激活码的 AES-256-GCM 加解密。keychain 优先(签名 app 稳定+安全),**文件兜底**
            //   (未签名下 keychain 不持久 → <appDataDir>/.master-key,稳定;避免每次启动重生成 key
            //   致数据解不开、每次重激活)。取不到(连文件都写不了)→ 不注入,sidecar 降级(弱安全不崩)。
            let app_data_dir = db_dir
                .parent()
                .map(|p| p.to_path_buf())
                .unwrap_or_else(|| std::path::PathBuf::from(".creatoros"));
            let master_key = resolve_or_create_master_key(&app_data_dir);

            // T-147 P5 —— 机器指纹(multi-factor)。注入 sidecar env `CREATOROS_MACHINE_ID`,
            // node 侧 resolveMachineId 优先用它(桌面最稳);下面还注入 `CREATOROS_DESKTOP=1`
            // 作为**运行时**桌面标记(激活门只桌面拦 / web 跳的唯一判据)。
            let machine_id = resolve_machine_id(&app.handle());

            // 4) spawn sidecar:externalBin `creatoros-server`(= 随包 node runtime,按 triple 命名,
            //    见 tauri.conf.json externalBin + scripts/desktop/build-sidecar.mjs)。以 server.js
            //    绝对路径为 arg 让该 node 跑 next standalone server。注入:
            //      PORT / HOSTNAME —— next standalone server.js 读这两个 env 决定 listen 地址;
            //      CREATOROS_DB_DIR —— DB 落盘目录(resolveDbDriver 会认,见 backend/src/db.ts §3b);
            //      NODE_ENV=production;DYLD/LD_LIBRARY_PATH —— 让 node 找到 co-ship 的 dylib。
            let sidecar = app
                .shell()
                .sidecar("creatoros-server")
                .expect("sidecar `creatoros-server` 未在 tauri.conf.json externalBin 注册")
                .args([server_js_str])
                .env("PORT", &port_str)
                .env("HOSTNAME", "127.0.0.1")
                .env("CREATOROS_DB_DIR", &db_dir_str)
                .env("NODE_ENV", "production")
                // T-147 P5 —— 运行时桌面标记(激活门只桌面拦 / web 跳的唯一判据;build 期的
                // CREATOROS_DESKTOP 只决定 output:standalone,运行时需在这里再注入一次)。
                .env("CREATOROS_DESKTOP", "1")
                .env("DYLD_LIBRARY_PATH", &lib_dir)
                .env("LD_LIBRARY_PATH", &lib_dir);

            // T-147 P2 —— 注入 keychain master key(取到才注入;取不到 sidecar 走降级)。
            let sidecar = match &master_key {
                Some(k) => sidecar.env("CREATOROS_MASTER_KEY", k),
                None => sidecar,
            };

            // T-147 P5 —— 注入机器指纹(取到才注入;取不到 node 侧走落盘回退,仍同机稳定)。
            let sidecar = match &machine_id {
                Some(m) => sidecar.env("CREATOROS_MACHINE_ID", m),
                None => sidecar,
            };

            let (mut rx, child) = sidecar
                .spawn()
                .expect("启动 creatoros-server sidecar 失败");

            // 存句柄供退出 kill。
            app.state::<SidecarHandle>()
                .0
                .lock()
                .unwrap()
                .replace(child);

            // 把 sidecar 的 stdout/stderr 打到本壳日志(排障用)。
            tauri::async_runtime::spawn(async move {
                while let Some(event) = rx.recv().await {
                    match event {
                        CommandEvent::Stdout(line) => {
                            eprintln!("[sidecar] {}", String::from_utf8_lossy(&line).trim_end());
                        }
                        CommandEvent::Stderr(line) => {
                            eprintln!("[sidecar:err] {}", String::from_utf8_lossy(&line).trim_end());
                        }
                        CommandEvent::Terminated(payload) => {
                            eprintln!("[sidecar] terminated: {payload:?}");
                            break;
                        }
                        _ => {}
                    }
                }
            });

            // 5) 另起线程等就绪 → 在主线程建窗口指向 sidecar。就绪探测跑在后台,不阻塞 setup。
            std::thread::spawn(move || {
                let ready = wait_until_ready(port, Duration::from_secs(60));
                let url = format!("http://127.0.0.1:{port}/");
                let target = if ready {
                    WebviewUrl::External(url.parse().expect("sidecar url 解析失败"))
                } else {
                    // 兜底:sidecar 60s 未起,仍开窗(将显示浏览器的连接失败页,便于用户看到问题
                    //  而非白屏无提示)。诚实:P1 不做启动 splash / 重试 UI,后续子项完善。
                    eprintln!("[shell] sidecar 60s 内未就绪,窗口仍指向 {url}");
                    WebviewUrl::External(url.parse().expect("sidecar url 解析失败"))
                };
                // clone 一份给闭包用(handle 本身被 run_on_main_thread 借用,不能同时 move 进闭包)。
                let build_handle = handle.clone();
                let _ = handle.run_on_main_thread(move || {
                    let _ = WebviewWindowBuilder::new(&build_handle, "main", target)
                        .title("CreatorOS")
                        .inner_size(1440.0, 900.0)
                        .min_inner_size(1024.0, 680.0)
                        .build();
                });
            });

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("Tauri 应用构建失败")
        .run(|app_handle, event| {
            // 退出前 kill sidecar,避免 orphan Node 进程占端口/落盘句柄。
            if let RunEvent::ExitRequested { .. } = event {
                if let Some(child) = app_handle.state::<SidecarHandle>().0.lock().unwrap().take() {
                    let _ = child.kill();
                }
            }
        });
}
