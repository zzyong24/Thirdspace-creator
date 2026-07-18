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

// [T-372 L2] Rust 校验门纵切:激活校验决策链(验签/防重放/防回拨/.license 放行权威)见 license.rs。
mod license;
// [T-259] 桌面日志系统:sidecar stdout/stderr tee 落盘 + 脱敏 + 轮转(见 logging.rs)。
mod logging;
// [T-372 W-core W3] Windows 进程树杀:Job Object(KILL_ON_JOB_CLOSE)——T-365 数据损坏
// 防线的 Win 等价(Win 无 POSIX 进程组/killpg)。整个模块 cfg(windows),mac/Linux 不编译。
#[cfg(windows)]
mod win_job;
// [T-332 S5] 「重置工作区」启动期归档:检测 reset-pending 标记 → db/.auth 归档改名 → 清标记。
mod workspace_reset;

use base64::Engine as _;
use tauri::{AppHandle, Manager, RunEvent, WebviewUrl, WebviewWindowBuilder};
// [T-172] CommandChild / CommandEvent / ShellExt 只在非 macOS(走 tauri sidecar externalBin)分支用;
//   macOS 走 std::process 直接 spawn server.app(Dock 隐身),不引这些,故按平台条件 import,免 macOS
//   下 unused import / dead_code warning。
#[cfg(not(target_os = "macos"))]
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
#[cfg(not(target_os = "macos"))]
use tauri_plugin_shell::ShellExt;

/// T-147 P2 本地加密 —— master key 在 OS keychain 里的服务名/账号。keyring 用这对
/// (service, user) 定位条目(macOS Keychain / Windows Credential Manager / Linux
/// Secret Service 各自的原生存储)。
const KEYCHAIN_SERVICE: &str = "com.creatoros.desktop";
const KEYCHAIN_KEY_NAME: &str = "master-key";

// [T-181] Skill 远程下发(prompt-bundle):sidecar 的 remote-prompt-bundle.ts 拉签名 bundle.json
//   + 内置公钥验签。URL 与公钥都是**公开的**(非密钥),硬编码进壳、注入 sidecar env。
//   私钥在产品方(~/.creatoros/prompt-bundle.key,签 bundle 时用,绝不进客户端/git)。
const PROMPT_BUNDLE_URL: &str = "https://creatoros.aitongban.cloud/prompts/bundle.json";
const PROMPT_BUNDLE_PUBLIC_KEY: &str =
    "-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEArmDGPC34VMSU2Isf3X+gULIwOH+5X3GBHwlXYFbgjg4=\n-----END PUBLIC KEY-----\n";

/// [T-372 W-core W4] 壳 → sidecar 的停机哨兵(Windows 用):Node 在 Windows 收不到真
/// SIGTERM(process.kill 的 'SIGTERM' 实为无条件 TerminateProcess)→ 壳的优雅停机改为
/// 经 stdin 写 `哨兵 + \n`,sidecar(sidecar-lifecycle.ts Win 分支)读到即 flush PGlite
/// 自退;壳等 5s 后才 Job Object 硬杀 —— 与 macOS「SIGTERM → 5s → SIGKILL」同构。
/// ⚠️ 与 frontend/src/server/sidecar-lifecycle.ts 的 `SHUTDOWN_SENTINEL` 必须一致,
/// 两侧单测各自钉住字面值(改任一侧必挂测)。macOS 构建也保留此常量(单测在 mac 跑)。
pub const SIDECAR_SHUTDOWN_SENTINEL: &str = "__CREATOROS_SHUTDOWN__";

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
/// 平台 id 优先 SHA-256 → 稳定短指纹,注入 sidecar env `CREATOROS_MACHINE_ID`。
///
/// [T-178] 平台硬件 id 拿得到 → **只用平台 id 派生**(硬件稳定,清 appDataDir / 重装也不变
/// → 重装不换机、不占激活码);仅当平台 id 取不到时才回退「仅持久 UUID」(退化但同机稳定)。
/// 旧实现无条件把易失的持久随机 UUID 混进哈希 → 清 appDataDir(卸载器/换机)后 UUID 重生 →
/// machineId 变 → 服务端一机一码认作新设备拒 → **重装被占码**(T-178 根因)。哈希"只和最弱因子
/// 一样稳",故不再混入随机因子。伪造是所有软件授权的固有限制(文档 §5.2 已注),不宣称防伪造。
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

    // ② 平台稳定机器标识(best-effort)。
    let platform_id = machine_uid::get().unwrap_or_default();

    // ③ [T-178] 派生种子:平台 id 非空 → **只用平台 id**(硬件稳定,不随 appDataDir 清空而变);
    //   平台 id 为空(取不到硬件标识)才回退到持久随机 UUID。不再无条件混入随机因子(见函数头注释)。
    //   持久 UUID 仍照常生成落盘(上方 ①),仅作硬件缺失时的兜底种子。
    let seed = if platform_id.trim().is_empty() {
        persisted.as_str()
    } else {
        platform_id.as_str()
    };

    // ④ SHA-256 → 前 32 hex(不暴露平台原始 UUID)。
    let mut hasher = Sha256::new();
    hasher.update(seed.as_bytes());
    let digest = hasher.finalize();
    let hex = digest.iter().map(|b| format!("{b:02x}")).collect::<String>();
    Some(hex[..32].to_string())
}

/// sidecar 子进程句柄。存进 Tauri state 以便退出时 kill,避免 orphan Node 进程。
///
/// [T-172] 两种 spawn 方式各自的子进程类型不同,用 enum 统一存:
///   · macOS:走 `std::process::Command` 直接 spawn server.app 内层二进制(为让 LaunchServices 读
///     server.app 的 Info.plist LSUIElement → Dock 隐身),句柄是 `std::process::Child`;
///   · Win/Linux:走 tauri-plugin-shell 的 `app.shell().sidecar(...)`(externalBin),句柄是 `CommandChild`。
/// 退出(RunEvent::ExitRequested)时对当前平台的句柄 kill,避免 orphan sidecar。
enum SidecarChild {
    /// macOS：std 直接 spawn 的子进程(走 server.app 内层二进制,Dock 隐身)。
    #[cfg(target_os = "macos")]
    Std(std::process::Child),
    /// Win/Linux：tauri sidecar(externalBin)的子进程。
    /// [T-372 W3] Windows 额外持有 Job Object 守护(KILL_ON_JOB_CLOSE):壳退出/崩溃
    /// → Job 句柄被 OS 回收 → sidecar 整棵进程树(含 Chrome/ffmpeg)内核级必死。
    #[cfg(not(target_os = "macos"))]
    Shell {
        child: CommandChild,
        #[cfg(windows)]
        job: Option<win_job::SidecarJob>,
    },
}

impl SidecarChild {
    fn kill(self) {
        match self {
            #[cfg(target_os = "macos")]
            SidecarChild::Std(mut c) => {
                // [T-365/T-362] 树杀 + 优雅窗口:此前 `Child::kill()` = SIGKILL 单个 node ——
                //   ① Chrome/ffmpeg 子进程直接孤儿(真机实锤:孤儿 next-server 带 headless Chrome 树);
                //   ② 正在写 PGlite 时硬杀 = WAL 半写库损坏(2026-07-16 数据事故根因)。
                // 现在:对**进程组**(spawn 时 process_group(0),组长=sidecar pid)先 SIGTERM
                //   (sidecar instrumentation 挂了 graceful handler:flush PGlite 后自退;Chrome 收到
                //   SIGTERM 也自关)→ 轮询等最多 5s → 还活着才 SIGKILL 组兜底。
                let pid = c.id() as i32;
                unsafe {
                    let _ = libc::killpg(pid, libc::SIGTERM);
                }
                let deadline = std::time::Instant::now() + std::time::Duration::from_secs(5);
                loop {
                    match c.try_wait() {
                        Ok(Some(_)) => break, // sidecar 已优雅退出
                        Ok(None) if std::time::Instant::now() < deadline => {
                            std::thread::sleep(std::time::Duration::from_millis(150));
                        }
                        _ => {
                            unsafe {
                                let _ = libc::killpg(pid, libc::SIGKILL);
                            }
                            let _ = c.wait();
                            break;
                        }
                    }
                }
            }
            // [T-372 W3/W4] Windows 停机序列(对齐 macOS「killpg SIGTERM → 等 5s → SIGKILL」):
            //   ① 经 stdin 写停机哨兵(Node 在 Win 收不到真 SIGTERM)→ sidecar-lifecycle Win
            //     分支读到即优雅退出(flush PGlite 防 WAL 半写);
            //   ② SidecarJob::shutdown:等最多 5s → 超时 TerminateJobObject 硬杀 Job 内整树
            //     (node + Playwright Chrome + ffmpeg)→ 关句柄。
            //   Job 建失败(spawn 时已留日志)→ 退化为单进程 kill(至少杀 sidecar 本体,诚实降级)。
            //   壳崩溃/强杀(本函数到不了)→ OS 回收 Job 句柄,KILL_ON_JOB_CLOSE 内核兜底整树杀。
            #[cfg(windows)]
            SidecarChild::Shell { child, job } => {
                let mut child = child;
                let _ = child.write(format!("{SIDECAR_SHUTDOWN_SENTINEL}\n").as_bytes());
                match job {
                    Some(job) => job.shutdown(5_000),
                    None => {
                        let _ = child.kill();
                    }
                }
            }
            #[cfg(all(not(target_os = "macos"), not(windows)))]
            SidecarChild::Shell { child } => {
                let _ = child.kill();
            }
        }
    }
}

#[derive(Default)]
struct SidecarHandle(Mutex<Option<SidecarChild>>);

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

/// [T-372 L2] sidecar 入口完整性校验:对 bundle 里的 sidecar.tar.gz 比对构建期内嵌的
/// SHA-256(build.rs 经 rustc-env 注入)。不匹配 → Err(人话)→ 拒绝 spawn。
///
/// 诚实边界(SPEC §9 gate-F4):此校验只防 **JS 层篡改**(改 tarball 里的 server.js 等);
/// ① patch 本 Rust 二进制可绕;② 已解压的 runtime 缓存目录(appDataDir/runtime/…)被直接
/// 改写不在每次启动的校验范围内(tarball 尺寸指纹变了才重解压)——不假装形成全链路防篡改。
fn verify_sidecar_tarball(tarball: &std::path::Path) -> Result<(), String> {
    // build.rs 恒注入该 env:打包构建 = tarball 真哈希;dev(无 tarball)= 空串。
    let expected = env!("CREATOROS_SIDECAR_SHA256");
    if expected.is_empty() {
        // dev 构建(cargo check/test 时无 tarball)→ 无基准可比,诚实跳过并留日志。
        eprintln!("[shell] 构建期未内嵌 sidecar 哈希(dev 构建),跳过入口完整性校验");
        return Ok(());
    }
    let bytes = std::fs::read(tarball)
        .map_err(|e| format!("读 sidecar.tar.gz 失败,无法校验完整性: {e}"))?;
    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    hasher.update(&bytes);
    let actual = hasher
        .finalize()
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect::<String>();
    if actual != expected {
        return Err(format!(
            "sidecar 入口文件完整性校验失败(期望 {expected} 实际 {actual})。\
             应用文件可能被篡改或安装损坏,请重新安装 CreatorOS。"
        ));
    }
    Ok(())
}

/// 定位 sidecar 组装目录(内含 frontend/ + backend/ + node_modules/ + lib/)。
/// sidecar 保留 pnpm 相对 symlink 结构,而 **Tauri resource 拷贝会丢 symlink**(T-169 实测:源 180 个
/// → bundle 0 个 → node 解析 next 断 → sidecar 起不来)。故 bundle 里带的是**单文件 tarball**
/// `sidecar.tar.gz`(symlink 存档内原样保留),首启解压到可写目录(系统 tar 原生保 symlink)。
///   ① CREATOROS_SIDECAR_DIR env 覆盖(打包/测试可指定);
///   ② dev:CARGO_MANIFEST_DIR/sidecar(编译期常量,指向源目录,symlink 完好);
///   ③ bundle:资源里的 sidecar.tar.gz → 首启解压到 appDataDir/runtime/<version>/sidecar(复用)。
/// [T-372 L2] 返回 Err = 入口完整性校验失败 → 上层**拒绝 spawn**(不再静默把被篡改的
/// sidecar 跑起来)。其余路径语义不变。
fn resolve_sidecar_dir(app: &AppHandle) -> Result<PathBuf, String> {
    if let Ok(dir) = std::env::var("CREATOROS_SIDECAR_DIR") {
        let p = PathBuf::from(dir);
        if p.exists() {
            // 显式覆盖(打包验证/测试用)→ 信任操作者,跳过哈希校验(有日志,不静默)。
            eprintln!("[shell] CREATOROS_SIDECAR_DIR 显式覆盖,跳过入口完整性校验");
            return Ok(p);
        }
    }
    // dev:源目录(symlink 完好)。CARGO_MANIFEST_DIR 是 src-tauri/ 的编译期绝对路径。
    // dev 源目录无 tarball 基准,完整性校验不适用(构建期 env 也为空串)。
    let dev_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("sidecar");
    if dev_dir.join("frontend").join("server.js").exists() {
        return Ok(dev_dir);
    }
    // ③ bundle 兜底:资源里是 sidecar.tar.gz(单文件,规避 Tauri resource 丢 symlink)。
    let tarball = match app
        .path()
        .resolve("sidecar.tar.gz", tauri::path::BaseDirectory::Resource)
    {
        Ok(p) if p.exists() => p,
        // 资源里没 tarball(理论不会到这):退回 dev_dir,让上层探活失败,便于诊断而非静默乱指。
        _ => return Ok(dev_dir),
    };
    // [T-372 L2] spawn 前的入口哈希校验:tarball 与构建期内嵌哈希不符 → 拒绝 spawn。
    verify_sidecar_tarball(&tarball)?;
    // 解压目标按版本隔离:appDataDir/runtime/<version>/sidecar。升级(新版本)→ 新目录 → 自动重解压。
    let version = app.package_info().version.to_string();
    let dest = match app.path().app_data_dir() {
        Ok(d) => d.join("runtime").join(&version).join("sidecar"),
        Err(_) => return Ok(dev_dir),
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
        //   (Win10+ tar.exe 对 symlink/junction 的**保真度**是 §11.2 spike 1 的验证对象,归 W-spike。)
        let mut tar_cmd = std::process::Command::new("tar");
        tar_cmd.arg("-xzf").arg(&tarball).arg("-C").arg(&dest);
        // [T-372 W5] Windows:tar.exe 是 console 子系统程序,GUI 壳(windows_subsystem="windows")
        //   spawn 它会闪一个黑色 console 窗 → CREATE_NO_WINDOW 抑制。mac/Linux 无此概念,不编译。
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt as _;
            const CREATE_NO_WINDOW: u32 = 0x0800_0000;
            tar_cmd.creation_flags(CREATE_NO_WINDOW);
        }
        let status = tar_cmd.status();
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
    // [T-364] 升级后旧版本 runtime 目录清理:appDataDir/runtime/<version>/ 每版 ~400MB,
    // 旧版本目录永不删 → 多次升级沉默堆积数 GB。当前版本目录已就绪(解压完成/复用)后,
    // 后台 best-effort 删非当前版本目录。回滚无代价:旧壳二进制自带自己的 tarball 资源,
    // 回装后首启会重新解压出自己的 runtime。
    if let Ok(data_dir) = app.path().app_data_dir() {
        let runtime_root = data_dir.join("runtime");
        let keep = version.clone();
        std::thread::spawn(move || {
            cleanup_stale_runtimes(&runtime_root, &keep);
        });
    }
    Ok(dest)
}

/// [T-364] 删 `runtime/` 下**非当前版本**的旧解压目录。best-effort:单目录删失败只记日志
/// 不中断(下次启动再试);`runtime/` 不存在/不可读 → 0。只删目录项(杂散文件不动)。
/// 返回删除数,供单测断言。
fn cleanup_stale_runtimes(runtime_root: &std::path::Path, keep_version: &str) -> usize {
    let entries = match std::fs::read_dir(runtime_root) {
        Ok(e) => e,
        Err(_) => return 0,
    };
    let mut removed = 0;
    for entry in entries.flatten() {
        let name = entry.file_name();
        if name.to_string_lossy() == keep_version {
            continue;
        }
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        match std::fs::remove_dir_all(&path) {
            Ok(()) => {
                removed += 1;
                eprintln!("[shell] 已清理旧版本 runtime 目录:{}", path.display());
            }
            Err(e) => {
                eprintln!("[shell] 清理旧版本 runtime 失败 {}:{e}", path.display());
            }
        }
    }
    removed
}

/// 桌面壳入口。web 运行方式(pnpm dev / 浏览器)完全不受影响 —— 这是纯新增的壳。
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        // [T-241] 外链转系统浏览器(webview 默认吞 target=_blank 新窗口请求)。
        .plugin(tauri_plugin_opener::init())
        // T-147 P6 —— updater 插件(签名更新包校验;pubkey/endpoints 在 tauri.conf.json)。
        .plugin(tauri_plugin_updater::Builder::new().build())
        // [T-180] process 插件 —— 更新装好后 relaunch() 重启 app。
        .plugin(tauri_plugin_process::init())
        // [T-372 L2] 校验决策链 IPC:前端(激活页/设置页)只经这两个 command 拿放行结果,
        //   验签/防重放/防回拨逻辑全在 Rust(SPEC §9「前端只拿结果」)。
        .invoke_handler(tauri::generate_handler![
            license::license_activate,
            license::license_check,
            // [T-372 L3] 最近判定只读口(零网络):前端桥初始态 + 设置页宽限倒计时。
            license::license_last_decision
        ])
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
            // appData 根目录(db 的父级;.auth / logs / .master-key / 标记文件都在这层)。
            let app_data_dir = db_dir
                .parent()
                .map(|p| p.to_path_buf())
                .unwrap_or_else(|| std::path::PathBuf::from(".creatoros"));

            // [T-332 S5] 「重置工作区」归档 —— **必须在 spawn sidecar 之前、建 db 目录之前**:
            //   此刻 PGlite 库无任何进程持有,rename 整目录才安全(设置页 route 只落标记,
            //   活库改名的风险由这里的启动时序消解)。检测 reset-pending.json → 把 db/ 与
            //   .auth/ 改名成 *.archived-<ts>(不物理删除,可手动改回恢复)→ 清标记。
            //   摘要先存着,等 logger 起来后再 tee 进 sidecar.log(打包态可排障)。
            let reset_summary = workspace_reset::apply_pending_workspace_reset(&app_data_dir)
                .map(|o| {
                    // 失败项加显式前缀,日志里一眼可辨(标记保留,下次启动会重试)。
                    if o.ok {
                        o.summary
                    } else {
                        format!("⚠️ {}", o.summary)
                    }
                });
            if let Some(s) = &reset_summary {
                eprintln!("[shell] {s}");
            }

            // 首次启动 appDataDir 不存在 → PGlite mkdir(非递归)会 ENOENT。这里先建全父目录。
            // (刚归档过时 db/ 已改名走人,这里重建出全新空目录 = 干净首启,seed 会跑。)
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
            // [T-372 L2] 入口完整性不过 → 拒绝 spawn(eprintln 人话后 panic;此刻 logger 尚未
            // 初始化,dev/终端可见;打包态 crash 报告可见 panic message。不把被篡改的 JS 跑起来)。
            let sidecar_dir = match resolve_sidecar_dir(&app.handle()) {
                Ok(d) => d,
                Err(e) => {
                    eprintln!("[shell] {e}");
                    panic!("{e}");
                }
            };
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
            //   (app_data_dir 已在上方 [T-332] 归档步骤前算出,此处直接复用。)

            // [T-259] 桌面日志系统:初始化落盘日志(建 logs/ + 轮转上次会话 + 开新 sidecar.log)。
            //   sidecar 的 stdout/stderr 每行既 eprintln 给 app stderr(dev/终端可见),也 tee 到
            //   <appDataDir>/logs/sidecar.log —— 打包态 `open -a` 拿不到 stderr 时,靠这份文件排障。
            //   注入 env `CREATOROS_LOG_DIR` 给 sidecar,供设置页「导出诊断日志」route 定位目录。
            //   init 失败(建目录/开文件不了)→ None,降级为仅 eprintln(不落盘但不崩)。
            let logs_dir = app_data_dir.join("logs");
            let logger = logging::init_sidecar_logger(&logs_dir);
            let log_dir_str = logs_dir.to_string_lossy().to_string();

            // [T-332 S5] 归档摘要 tee 进 sidecar.log(归档发生在 logger 起来之前,补记一行,
            //   打包态用户报「重置后数据没了/还在」时可凭日志核实到底归没归档)。
            if let (Some(s), Some(l)) = (&reset_summary, &logger) {
                l.log("shell", s);
            }

            let master_key = resolve_or_create_master_key(&app_data_dir);

            // T-147 P5 —— 机器指纹(multi-factor)。注入 sidecar env `CREATOROS_MACHINE_ID`,
            // node 侧 resolveMachineId 优先用它(桌面最稳);下面还注入 `CREATOROS_DESKTOP=1`
            // 作为**运行时**桌面标记(激活门只桌面拦 / web 跳的唯一判据)。
            let machine_id = resolve_machine_id(&app.handle());

            // [T-372 L2] 启动级 nonce 握手 token(loopback-guard.server.ts:18 的 follow-up 落地):
            //   Rust 每次启动随机生成 → 注入 sidecar env(guard 校验基准)+ WebView 初始化脚本
            //   (前端请求携带)。dev/web 无此 env → guard 不启用该检查,行为不变(P5 不变式)。
            let handshake_token = license::gen_handshake_token();
            // [T-372 L2] `.license` 放行权威文件路径,显式注入给 sidecar(激活门只读它判放行,
            //   不再读 activation_state 表;见 frontend/src/server/activation/license-file.server.ts)。
            let license_file_str = app_data_dir
                .join(".license")
                .to_string_lossy()
                .to_string();
            // [gate-F2] 强验签开关透传(默认 "1";L1s 未上线可临时置 "0" 弱验签,sidecar 侧
            //   门与 UI 依赖同一开关做「签名校验未启用」诚实标注)。
            let strict_verify_str = std::env::var("CREATOROS_LICENSE_STRICT_VERIFY")
                .unwrap_or_else(|_| "1".to_string());

            // [T-372 L2] 壳层许可上下文:决策链(license.rs)经 Tauri command / 启动线程使用。
            let license_ctx = std::sync::Arc::new(license::ShellLicenseCtx {
                app_data_dir: app_data_dir.clone(),
                machine_id: machine_id.clone().unwrap_or_default(),
                master_key_b64: master_key.clone(),
                handshake_token: handshake_token.clone(),
                sidecar_port: port,
                chain_lock: Mutex::new(()),
                session: license::SessionMonotonic::new(),
                // [T-372 L3] 最近判定缓存 + 事件句柄:决策链每轮跑完广播
                //   `creatoros://license-decision`,前端桥据此即时跳激活页/显宽限倒计时。
                last_decision: Mutex::new(None),
                app_handle: Some(app.handle().clone()),
            });
            app.manage(license::LicenseState(license_ctx.clone()));
            // 启动必查一次 + [T-372 L3] 心跳循环(周期按码型:内测 60min / 买断 30 天)。
            license::startup_license_task(license_ctx.clone());

            // [T-205] 抖音登录态(.auth/douyin/<accountId>)目录 —— 注入 sidecar env
            //   `CREATOROS_DOUYIN_AUTH_DIR`,落**稳定**的 `<appDataDir>/.auth/douyin`,而非默认的
            //   易失 sidecar 工作目录(`<cwd>/.auth/douyin`)。根因:sidecar 按版本解压到
            //   `appDataDir/runtime/<version>/sidecar`,升级换版本目录 + build-sidecar rmSync 重建
            //   → .auth 随之丢 → 用户**每次 app 更新都要重扫码**(登录态没了)。落 appDataDir 顶层
            //   (与 .master-key / db 同级,不随版本/sidecar 重建而丢)→ 更新后登录态持久,免重扫。
            let douyin_auth_dir_str = app_data_dir
                .join(".auth")
                .join("douyin")
                .to_string_lossy()
                .to_string();

            // [T-217a] Web Session Vault 登录态(.auth/web/<domain>/)目录 —— 注入 sidecar env
            //   `CREATOROS_WEB_AUTH_DIR`,落**稳定**的 `<appDataDir>/.auth/web`(与 .auth/douyin
            //   并列),复用 T-205 同一「落 appDataDir 顶层跨版本持久」机制:app 更新/sidecar 重建
            //   不丢网站登录态(否则每次更新都要重登所有网站)。node 侧 persistence-client 读它,
            //   缺省回落 `<cwd>/.auth/web`。
            let web_auth_dir_str = app_data_dir
                .join(".auth")
                .join("web")
                .to_string_lossy()
                .to_string();

            // 4) spawn sidecar(= 随包 node runtime 跑 next standalone server.js)。注入:
            //      PORT / HOSTNAME —— next standalone server.js 读这两个 env 决定 listen 地址;
            //      CREATOROS_DB_DIR —— DB 落盘目录(resolveDbDriver 会认,见 backend/src/db.ts §3b);
            //      NODE_ENV=production;CREATOROS_DESKTOP=1;DYLD/LD_LIBRARY_PATH —— 让 node 找到 co-ship 的 dylib;
            //      CREATOROS_MASTER_KEY / CREATOROS_MACHINE_ID —— 取到才注入(取不到 sidecar/node 侧各有降级)。
            //
            // [T-172] 平台分叉:
            //   · macOS 走 `std::process::Command` 直接 spawn `<sidecar>/server.app/Contents/MacOS/creatoros-server`
            //     (mini .app,Info.plist 含 LSUIElement=true)→ LaunchServices 读到该声明 → node 不注册为
            //     GUI app、不进 Dock(解决用户看到「两个图标」)。tauri sidecar 走的是 externalBin 那份**裸**
            //     node,会被注册进 Dock,故 macOS 不用它。
            //   · Win/Linux 保持原 `app.shell().sidecar("creatoros-server")`(externalBin)逻辑不动
            //     (那边 Dock 图标不是问题)。[T-372 W5] Windows console 黑窗已闭环:壳自身
            //     main.rs `windows_subsystem="windows"`;sidecar node.exe 由 tauri-plugin-shell
            //     spawn,其 Command 构造恒带 CREATE_NO_WINDOW(plugin 2.3.5 process/mod.rs:173,
            //     已核实源码);sidecar 再往下的 ffmpeg/子进程由 Node 侧 spawn windowsHide 抑制。
            let handle_state = app.state::<SidecarHandle>();

            #[cfg(target_os = "macos")]
            {
                use std::io::{BufRead, BufReader};
                use std::process::Stdio;

                // server.app 内层二进制(build-sidecar.mjs 在 sidecar/server.app 里产出;随 tarball 解压到位)。
                let inner_bin = sidecar_dir
                    .join("server.app")
                    .join("Contents")
                    .join("MacOS")
                    .join("creatoros-server");

                let mut cmd = std::process::Command::new(&inner_bin);
                // [T-365] 新进程组(组长=sidecar 自身 pid):退出时 killpg 整组带走 node +
                //   Playwright Chrome + ffmpeg 全家;sidecar 侧孤儿自杀也按组清子进程。
                #[cfg(target_os = "macos")]
                {
                    use std::os::unix::process::CommandExt;
                    cmd.process_group(0);
                }
                cmd.arg(&server_js_str)
                    .env("PORT", &port_str)
                    .env("HOSTNAME", "127.0.0.1")
                    .env("CREATOROS_DB_DIR", &db_dir_str)
                    .env("NODE_ENV", "production")
                    .env("CREATOROS_DESKTOP", "1")
                    // [T-181] Skill 远程下发端点 + 验签公钥。
                    .env("PROMPT_BUNDLE_URL", PROMPT_BUNDLE_URL)
                    .env("PROMPT_BUNDLE_PUBLIC_KEY", PROMPT_BUNDLE_PUBLIC_KEY)
                    // [T-205] 抖音登录态落稳定 appDataDir/.auth/douyin(跨版本持久,免更新后重扫)。
                    .env("CREATOROS_DOUYIN_AUTH_DIR", &douyin_auth_dir_str)
                    // [T-217a] 网站登录态落稳定 appDataDir/.auth/web(跨版本持久,免更新后重登)。
                    .env("CREATOROS_WEB_AUTH_DIR", &web_auth_dir_str)
                    // [T-259] 诊断日志目录(设置页「导出诊断日志」route 据此定位 logs/)。
                    .env("CREATOROS_LOG_DIR", &log_dir_str)
                    // [T-372 L2] 握手 token / .license 路径 / 强验签开关(见上方注释)。
                    .env("CREATOROS_SIDECAR_HANDSHAKE_TOKEN", &handshake_token)
                    .env("CREATOROS_LICENSE_FILE", &license_file_str)
                    .env("CREATOROS_LICENSE_STRICT_VERIFY", &strict_verify_str)
                    .env("DYLD_LIBRARY_PATH", &lib_dir)
                    .env("LD_LIBRARY_PATH", &lib_dir)
                    .stdout(Stdio::piped())
                    .stderr(Stdio::piped());
                if let Some(k) = &master_key {
                    cmd.env("CREATOROS_MASTER_KEY", k);
                }
                if let Some(m) = &machine_id {
                    cmd.env("CREATOROS_MACHINE_ID", m);
                }

                // [T-259] spawn 失败也落日志(排障用)再 panic —— 打包态用户拿不到 stderr,靠文件看死因。
                let mut child = match cmd.spawn() {
                    Ok(c) => c,
                    Err(e) => {
                        if let Some(l) = &logger {
                            l.log("shell", &format!("spawn creatoros-server sidecar 失败: {e}"));
                        }
                        panic!("启动 creatoros-server sidecar(server.app 内层二进制)失败: {e}");
                    }
                };

                // 把 sidecar 的 stdout/stderr 各起线程读:每行 eprintln(dev 可见)+ tee 到 logs/sidecar.log
                // (打包态排障)。两线程各 clone 一份共享 logger(Arc,内部 Mutex 串行化写,不交错坏行)。
                if let Some(out) = child.stdout.take() {
                    let logger = logger.clone();
                    std::thread::spawn(move || {
                        for line in BufReader::new(out).lines().map_while(Result::ok) {
                            eprintln!("[sidecar] {line}");
                            if let Some(l) = &logger {
                                l.log("sidecar", &line);
                            }
                        }
                    });
                }
                if let Some(err) = child.stderr.take() {
                    let logger = logger.clone();
                    std::thread::spawn(move || {
                        for line in BufReader::new(err).lines().map_while(Result::ok) {
                            eprintln!("[sidecar:err] {line}");
                            if let Some(l) = &logger {
                                l.log("sidecar:err", &line);
                            }
                        }
                    });
                }

                // 存句柄供退出 kill(避免 orphan sidecar)。
                handle_state
                    .0
                    .lock()
                    .unwrap()
                    .replace(SidecarChild::Std(child));
            }

            #[cfg(not(target_os = "macos"))]
            {
                let sidecar = app
                    .shell()
                    .sidecar("creatoros-server")
                    .expect("sidecar `creatoros-server` 未在 tauri.conf.json externalBin 注册")
                    .args([server_js_str])
                    .env("PORT", &port_str)
                    .env("HOSTNAME", "127.0.0.1")
                    .env("CREATOROS_DB_DIR", &db_dir_str)
                    .env("NODE_ENV", "production")
                    .env("CREATOROS_DESKTOP", "1")
                    // [T-181] Skill 远程下发端点 + 验签公钥(Win/Linux 同 macOS)。
                    .env("PROMPT_BUNDLE_URL", PROMPT_BUNDLE_URL)
                    .env("PROMPT_BUNDLE_PUBLIC_KEY", PROMPT_BUNDLE_PUBLIC_KEY)
                    // [T-205] 抖音登录态落稳定 appDataDir/.auth/douyin(跨版本持久,免更新后重扫)。
                    .env("CREATOROS_DOUYIN_AUTH_DIR", &douyin_auth_dir_str)
                    // [T-217a] 网站登录态落稳定 appDataDir/.auth/web(跨版本持久,免更新后重登)。
                    .env("CREATOROS_WEB_AUTH_DIR", &web_auth_dir_str)
                    // [T-259] 诊断日志目录(设置页「导出诊断日志」route 据此定位 logs/)。
                    .env("CREATOROS_LOG_DIR", &log_dir_str)
                    // [T-372 L2] 握手 token / .license 路径 / 强验签开关(与 macOS 分支一致)。
                    .env("CREATOROS_SIDECAR_HANDSHAKE_TOKEN", &handshake_token)
                    .env("CREATOROS_LICENSE_FILE", &license_file_str)
                    .env("CREATOROS_LICENSE_STRICT_VERIFY", &strict_verify_str)
                    .env("DYLD_LIBRARY_PATH", &lib_dir)
                    .env("LD_LIBRARY_PATH", &lib_dir);

                let sidecar = match &master_key {
                    Some(k) => sidecar.env("CREATOROS_MASTER_KEY", k),
                    None => sidecar,
                };
                let sidecar = match &machine_id {
                    Some(m) => sidecar.env("CREATOROS_MACHINE_ID", m),
                    None => sidecar,
                };

                // [T-259] spawn 失败也落日志再 panic(打包态排障)。
                let (mut rx, child) = match sidecar.spawn() {
                    Ok(pair) => pair,
                    Err(e) => {
                        if let Some(l) = &logger {
                            l.log("shell", &format!("spawn creatoros-server sidecar 失败: {e}"));
                        }
                        panic!("启动 creatoros-server sidecar 失败: {e}");
                    }
                };

                // [T-372 W3] Windows:spawn 后立刻建 Job Object(KILL_ON_JOB_CLOSE)把 sidecar
                //   挂进去 —— 越早挂,sidecar 后续拉起的 Chrome/ffmpeg 越必然继承 Job 归属。
                //   建失败(权限/句柄异常,极端)→ 降级单进程 kill,留日志不静默(T-365 防线
                //   在该机器上退化,诚实可见)。
                #[cfg(windows)]
                let job = match win_job::SidecarJob::assign(child.pid()) {
                    Ok(j) => Some(j),
                    Err(e) => {
                        eprintln!("[shell] Job Object 创建失败(退化为单进程 kill,退出可能残留子进程): {e}");
                        if let Some(l) = &logger {
                            l.log("shell", &format!("Job Object 创建失败(树杀防线退化): {e}"));
                        }
                        None
                    }
                };

                handle_state.0.lock().unwrap().replace(SidecarChild::Shell {
                    child,
                    #[cfg(windows)]
                    job,
                });

                // 把 sidecar 的 stdout/stderr 打到本壳日志:eprintln(dev 可见)+ tee 到 logs/sidecar.log
                // (打包态排障)。terminated 亦落盘(sidecar 意外退出的死因)。
                let logger = logger.clone();
                tauri::async_runtime::spawn(async move {
                    while let Some(event) = rx.recv().await {
                        match event {
                            CommandEvent::Stdout(line) => {
                                let s = String::from_utf8_lossy(&line);
                                let s = s.trim_end();
                                eprintln!("[sidecar] {s}");
                                if let Some(l) = &logger {
                                    l.log("sidecar", s);
                                }
                            }
                            CommandEvent::Stderr(line) => {
                                let s = String::from_utf8_lossy(&line);
                                let s = s.trim_end();
                                eprintln!("[sidecar:err] {s}");
                                if let Some(l) = &logger {
                                    l.log("sidecar:err", s);
                                }
                            }
                            CommandEvent::Terminated(payload) => {
                                eprintln!("[sidecar] terminated: {payload:?}");
                                if let Some(l) = &logger {
                                    l.log("shell", &format!("sidecar terminated: {payload:?}"));
                                }
                                break;
                            }
                            _ => {}
                        }
                    }
                });
            }

            // 5) 另起线程等就绪 → 在主线程建窗口指向 sidecar。就绪探测跑在后台,不阻塞 setup。
            // [T-259] clone 一份 logger 进线程,sidecar 未就绪也落盘(这是白屏/连不上的头号死因)。
            let ready_logger = logger.clone();
            // [T-372 L2] 握手 token 经 WebView 初始化脚本下发(token 为 hex,无注入面);
            //   前端 handshake-client.ts 读该全局并附到有副作用请求的 x-creatoros-handshake 头。
            let webview_token_script = format!(
                "window.__CREATOROS_HANDSHAKE_TOKEN__=\"{handshake_token}\";"
            );
            std::thread::spawn(move || {
                let ready = wait_until_ready(port, Duration::from_secs(60));
                let url = format!("http://127.0.0.1:{port}/");
                let target = if ready {
                    WebviewUrl::External(url.parse().expect("sidecar url 解析失败"))
                } else {
                    // 兜底:sidecar 60s 未起,仍开窗(将显示浏览器的连接失败页,便于用户看到问题
                    //  而非白屏无提示)。诚实:P1 不做启动 splash / 重试 UI,后续子项完善。
                    eprintln!("[shell] sidecar 60s 内未就绪,窗口仍指向 {url}");
                    if let Some(l) = &ready_logger {
                        l.log("shell", &format!("sidecar 60s 内未就绪,窗口仍指向 {url}"));
                    }
                    WebviewUrl::External(url.parse().expect("sidecar url 解析失败"))
                };
                // clone 一份给闭包用(handle 本身被 run_on_main_thread 借用,不能同时 move 进闭包)。
                let build_handle = handle.clone();
                let _ = handle.run_on_main_thread(move || {
                    let _ = WebviewWindowBuilder::new(&build_handle, "main", target)
                        .title("CreatorOS")
                        .inner_size(1440.0, 900.0)
                        .min_inner_size(1024.0, 680.0)
                        // [T-372 L2] 注入握手 token 全局(每次导航都会重跑初始化脚本)。
                        .initialization_script(&webview_token_script)
                        .build();
                });
            });

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("Tauri 应用构建失败")
        .run(|app_handle, event| {
            // 退出前 kill sidecar,避免 orphan Node 进程占端口/落盘句柄。
            // [T-172] 句柄是 SidecarChild(mac=std::process::Child / Win-Linux=CommandChild),统一 kill。
            // [T-365] 双挂 ExitRequested + Exit:某些退出路径(restart/异常终止序列)只发其一;
            //   take() 幂等,两处都到也只 kill 一次。崩溃/强退(SIGKILL 壳)两者都不到 —— 由
            //   sidecar 侧孤儿自检(instrumentation 轮询 ppid==1 优雅自退)兜底,双保险。
            if matches!(event, RunEvent::ExitRequested { .. } | RunEvent::Exit) {
                if let Some(child) = app_handle.state::<SidecarHandle>().0.lock().unwrap().take() {
                    child.kill();
                }
            }
        });
}

#[cfg(test)]
mod lifecycle_tests {
    // [T-372 W-core §14] 跨语言停机哨兵契约:与 sidecar-lifecycle.ts 的 SHUTDOWN_SENTINEL
    // 钉同一字面值(TS 侧 vitest 同样钉住)。改任一侧,两套测试各自即刻挂 —— 防止
    // 「壳写哨兵、sidecar 认不出 → Windows 永远走不到优雅停机、只剩 5s 后硬杀」的静默回归。
    // (本测试平台无关,macOS 上 cargo test 即验;Job Object 行为本身归 Windows 真机/W-ci。)
    #[test]
    fn 停机哨兵与_sidecar_lifecycle_ts_契约一致() {
        assert_eq!(super::SIDECAR_SHUTDOWN_SENTINEL, "__CREATOROS_SHUTDOWN__");
    }
}

// [T-364] 旧版本 runtime 目录清理单测(纯 std,照 workspace_reset 临时目录范式)。
#[cfg(test)]
mod runtime_cleanup_tests {
    use std::path::PathBuf;

    fn temp_runtime_root(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "creatoros-runtime-cleanup-{tag}-{}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn 删非当前版本目录且保留当前版本与杂散文件() {
        let root = temp_runtime_root("basic");
        for v in ["0.1.0", "0.2.0", "0.3.0"] {
            std::fs::create_dir_all(root.join(v).join("sidecar")).unwrap();
            std::fs::write(root.join(v).join("sidecar").join("server.js"), "x").unwrap();
        }
        std::fs::write(root.join("stray.log"), "keep").unwrap();
        let removed = super::cleanup_stale_runtimes(&root, "0.3.0");
        assert_eq!(removed, 2);
        assert!(root.join("0.3.0").join("sidecar").join("server.js").exists());
        assert!(!root.join("0.1.0").exists());
        assert!(!root.join("0.2.0").exists());
        assert!(root.join("stray.log").exists()); // 非目录项不动
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn runtime_根不存在返_0_不抛() {
        let root = std::env::temp_dir().join(format!(
            "creatoros-runtime-cleanup-missing-{}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&root);
        assert_eq!(super::cleanup_stale_runtimes(&root, "0.3.0"), 0);
    }

    #[test]
    fn 只有当前版本时零删除() {
        let root = temp_runtime_root("only-current");
        std::fs::create_dir_all(root.join("0.3.0")).unwrap();
        assert_eq!(super::cleanup_stale_runtimes(&root, "0.3.0"), 0);
        assert!(root.join("0.3.0").exists());
        let _ = std::fs::remove_dir_all(&root);
    }
}
