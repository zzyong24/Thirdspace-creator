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
fn resolve_or_create_master_key() -> Option<String> {
    let entry = match keyring::Entry::new(KEYCHAIN_SERVICE, KEYCHAIN_KEY_NAME) {
        Ok(e) => e,
        Err(e) => {
            eprintln!("[shell] keychain entry 创建失败(降级 dev key): {e}");
            return None;
        }
    };

    // 已存在 → 取出并校验长度(base64 解出 32 字节)。
    match entry.get_password() {
        Ok(existing) => {
            match base64::engine::general_purpose::STANDARD.decode(existing.trim()) {
                Ok(bytes) if bytes.len() == 32 => return Some(existing.trim().to_string()),
                _ => {
                    eprintln!("[shell] keychain master key 损坏/非 32B,重建");
                    // fall through to regenerate
                }
            }
        }
        Err(keyring::Error::NoEntry) => {
            // 首启:无条目,下面生成。
        }
        Err(e) => {
            eprintln!("[shell] 读 keychain master key 失败(降级 dev key): {e}");
            return None;
        }
    }

    // 生成随机 32B → base64 → 存 keychain。
    use rand::RngCore as _;
    let mut raw = [0u8; 32];
    rand::rngs::OsRng.fill_bytes(&mut raw);
    let b64 = base64::engine::general_purpose::STANDARD.encode(raw);
    if let Err(e) = entry.set_password(&b64) {
        eprintln!("[shell] 写 keychain master key 失败(降级 dev key): {e}");
        return None;
    }
    eprintln!("[shell] 首次生成 master key 并存入 OS keychain");
    Some(b64)
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

/// 定位 sidecar 组装目录(src-tauri/sidecar,内含 frontend/ + backend/ + node_modules/ + lib/)。
/// sidecar 保留 pnpm 相对 symlink 结构,Tauri resource 拷贝会丢 symlink,故:
///   ① CREATOROS_SIDECAR_DIR env 覆盖(打包/测试可指定);
///   ② dev:CARGO_MANIFEST_DIR/sidecar(编译期常量,指向源目录,symlink 完好);
///   ③ 兜底:resource 目录下的 sidecar(bundle;symlink 完好性见 README 待验点)。
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
    // bundle 兜底:resource 目录。
    app.path()
        .resolve("sidecar", tauri::path::BaseDirectory::Resource)
        .unwrap_or(dev_dir)
}

/// 桌面壳入口。web 运行方式(pnpm dev / 浏览器)完全不受影响 —— 这是纯新增的壳。
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
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

            // T-147 P2 —— 取/建 OS keychain 里的 master key(base64 32B),下面注入 sidecar env
            // `CREATOROS_MASTER_KEY`,node 侧 resolveMasterKey 认它做 model key 的 AES-256-GCM
            // 加解密。取不到(keychain 不可用)→ 不注入,sidecar 走开发降级(不崩,弱安全)。
            let master_key = resolve_or_create_master_key();

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
                .env("DYLD_LIBRARY_PATH", &lib_dir)
                .env("LD_LIBRARY_PATH", &lib_dir);

            // T-147 P2 —— 注入 keychain master key(取到才注入;取不到 sidecar 走降级)。
            let sidecar = match &master_key {
                Some(k) => sidecar.env("CREATOROS_MASTER_KEY", k),
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
