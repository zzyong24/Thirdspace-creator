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
// [T-399b] 蜜罐授权门:纯诱饵,零真实引用(真链一行不碰),仅 #[used] 强制进二进制过 DCE。
//   故意重放明文命名的教科书假验签门,诱逆向 AR 的 nm/strings 撞它而非 obfstr 藏起的真门(见 decoy_gate.rs)。
mod decoy_gate;
// [T-259] 桌面日志系统:sidecar stdout/stderr tee 落盘 + 脱敏 + 轮转(见 logging.rs)。
mod logging;
// [T-372 W-core W3] Windows 进程树杀:Job Object(KILL_ON_JOB_CLOSE)——T-365 数据损坏
// 防线的 Win 等价(Win 无 POSIX 进程组/killpg)。整个模块 cfg(windows),mac/Linux 不编译。
#[cfg(windows)]
mod win_job;
// [T-332 S5] 「重置工作区」启动期归档:检测 reset-pending 标记 → db/.auth 归档改名 → 清标记。
mod workspace_reset;

use base64::Engine as _;
// [T-391 H-key] master key 传递加固:SecretString 包裹 base64 key(Drop 时 zeroize,不进 Debug/log),
//   Zeroize 抹掉注入 sidecar 后的临时明文 buffer。
use secrecy::{ExposeSecret, SecretString};
use tauri::{AppHandle, Manager, RunEvent, WebviewUrl, WebviewWindowBuilder};
use tauri::webview::PageLoadEvent;
use zeroize::Zeroize as _;
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

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeSystemInfo {
    os: &'static str,
    arch: String,
}

#[cfg(target_os = "macos")]
fn runtime_host_arch() -> String {
    // Rosetta 下编译目标/进程架构可能是 x86_64，但实体机器仍是 Apple Silicon。
    // `hw.optional.arm64=1` 是 macOS 原生硬件能力，不依赖浏览器兼容字段或当前进程模式。
    let mut arm64_supported: libc::c_int = 0;
    let mut value_size = std::mem::size_of::<libc::c_int>();
    let result = unsafe {
        libc::sysctlbyname(
            b"hw.optional.arm64\0".as_ptr().cast(),
            (&mut arm64_supported as *mut libc::c_int).cast(),
            &mut value_size,
            std::ptr::null_mut(),
            0,
        )
    };
    if result == 0 && arm64_supported == 1 {
        return "arm64".to_owned();
    }
    std::env::consts::ARCH.to_owned()
}

#[cfg(not(target_os = "macos"))]
fn runtime_host_arch() -> String {
    std::env::consts::ARCH.to_owned()
}

#[tauri::command]
fn runtime_system_info() -> RuntimeSystemInfo {
    RuntimeSystemInfo {
        os: std::env::consts::OS,
        arch: runtime_host_arch(),
    }
}

/// [T-391 H-key] `.master-key` 文件兜底的**混淆存储**。SPEC §9:未签名下 keychain 不持久,文件兜底
/// 不可少(否则每启动重生成 key → 激活码/model key 全解不开、每次重激活),但**不许明文落盘**。
///
/// 无 AEAD crate 可用(本任务 Cargo 只许加 secrecy/zeroize),故用**机器绑定的 SHA-256-CTR keystream
/// XOR** 做混淆:keystream = SHA256(SALT ‖ machine_seed ‖ nonce ‖ counter_le) 逐块拼接。
///
/// 诚实边界:这是**混淆**不是强加密——能读盘 **且** 能拿到本机 machine_seed **且** 知道此派生逻辑
/// 的攻击者仍可还原(签名后的 keychain 才是强路径,见函数③的 best-effort 回填)。它达成的窄目标:
///   · `strings`/`grep .master-key` 再也扫不出可辨识的 base64 key(灭静态靶点);
///   · machine_seed 用平台硬件标识 → **同机重装/清 appDataDir 仍可解**(保住换机以外的可用性)。
/// nonce 每次随机 → 同一 key 每次密文不同、跨机不复用 keystream。
fn master_key_keystream_xor(data: &mut [u8], machine_seed: &str, nonce: &[u8; 16]) {
    use sha2::{Digest, Sha256};
    const SALT: &[u8] = b"creatoros-master-key-file-v2";
    let mut counter: u32 = 0;
    let mut i = 0;
    while i < data.len() {
        let mut h = Sha256::new();
        h.update(SALT);
        h.update(machine_seed.as_bytes());
        h.update(&nonce[..]);
        h.update(counter.to_le_bytes());
        let block = h.finalize();
        for b in block.iter() {
            if i >= data.len() {
                break;
            }
            data[i] ^= b;
            i += 1;
        }
        counter += 1;
    }
}

/// 混淆 `.master-key` 内容:`v2:` + base64( nonce[16] ‖ (plaintext_b64_bytes XOR keystream) )。
/// nonce 由调用方传入(真调用随机;测试可固定 → 断言往返)。
fn obfuscate_master_key_file(plaintext_b64: &str, machine_seed: &str, nonce: &[u8; 16]) -> String {
    let mut body = plaintext_b64.as_bytes().to_vec();
    master_key_keystream_xor(&mut body, machine_seed, nonce);
    let mut packed = Vec::with_capacity(16 + body.len());
    packed.extend_from_slice(&nonce[..]);
    packed.extend_from_slice(&body);
    body.zeroize();
    let out = format!("v2:{}", base64::engine::general_purpose::STANDARD.encode(&packed));
    packed.zeroize();
    out
}

/// 解混淆 `.master-key`。
///   · `v2:` 前缀 → 反混淆还原明文 base64 key(nonce 从密文头取)。
///   · 无前缀 → **存量明文迁移路径**:老版本写的是明文 base64,原样 trim 返回(调用方读回后会用
///     新格式重写 → 自动升级,不锁死已装用户)。
/// 解不开(base64 坏 / 长度不足)→ None。
fn deobfuscate_master_key_file(stored: &str, machine_seed: &str) -> Option<String> {
    let s = stored.trim();
    let Some(rest) = s.strip_prefix("v2:") else {
        // 存量明文(老格式)—— 原样返回,调用方校验 + 迁移。
        return Some(s.to_string());
    };
    let packed = base64::engine::general_purpose::STANDARD.decode(rest).ok()?;
    if packed.len() < 16 {
        return None;
    }
    let mut nonce = [0u8; 16];
    nonce.copy_from_slice(&packed[..16]);
    let mut body = packed[16..].to_vec();
    master_key_keystream_xor(&mut body, machine_seed, &nonce);
    let out = String::from_utf8(body).ok()?;
    Some(out.trim().to_string())
}

/// 取/建 32B master key,`SecretString`(base64)返回,供**经 ChildStdin 注入** sidecar
/// (T-391 H-key:不再走 env `CREATOROS_MASTER_KEY` 明文)。
///
/// 首启:keychain 无条目 → 随机生成 32 字节 → 存 keychain(best-effort)+ **混淆**文件兜底 → 返回。
/// 后续:keychain 有条目 → 取出返回;否则读**混淆**文件兜底(校验解出 32 字节;损坏则重建)。
///
/// keychain 不可用(极端:无 Secret Service 的 headless Linux / 权限被拒)→ 返回 None,
/// sidecar 侧 resolveMasterKey 会走**开发降级**(web 路径不崩,安全性弱,已在总纲认知)。
fn resolve_or_create_master_key(app_data_dir: &std::path::Path) -> Option<SecretString> {
    let valid = |s: &str| {
        base64::engine::general_purpose::STANDARD
            .decode(s.trim())
            .map(|b| b.len() == 32)
            .unwrap_or(false)
    };
    let key_file = app_data_dir.join(".master-key");
    // 文件兜底的混淆密钥绑定本机平台标识(硬件稳定 → 同机重装/清 appDataDir 仍可解;换机不可解但
    // 换机本就是新环境)。取不到(headless)→ 空串兜底(退化为固定 salt,弱但仍非明文)。
    let machine_seed = machine_uid::get().unwrap_or_default();

    // ① keychain 读(签名 app 上稳定 + 安全)。未签名 app 上 keychain 常不持久(macOS 把访问绑签名
    //    身份,rebuild/未签名每次身份变 → set_password 不真持久),故失败不致命,下面走文件兜底。
    if let Ok(entry) = keyring::Entry::new(KEYCHAIN_SERVICE, KEYCHAIN_KEY_NAME) {
        if let Ok(existing) = entry.get_password() {
            if valid(&existing) {
                return Some(SecretString::new(existing.trim().to_string()));
            }
        }
    }

    // ② 文件兜底读(<appDataDir>/.master-key,混淆存储)。未签名下 keychain 读不回时靠这个**稳定**
    //    (否则每次启动重生成 key → 激活码/model key 全解不开、每次都要重激活,不可用)。
    if let Ok(raw_file) = std::fs::read_to_string(&key_file) {
        if let Some(existing) = deobfuscate_master_key_file(&raw_file, &machine_seed) {
            if valid(&existing) {
                let existing = existing.trim().to_string();
                // 存量明文(无 v2: 前缀)读到 → 立即用混淆格式重写,自动升级(下次不再明文落盘)。
                if !raw_file.trim().starts_with("v2:") {
                    write_master_key_file(&key_file, &existing, &machine_seed);
                }
                // best-effort 回填 keychain(签名后即生效,自动升级回强安全路径)。
                if let Ok(entry) = keyring::Entry::new(KEYCHAIN_SERVICE, KEYCHAIN_KEY_NAME) {
                    let _ = entry.set_password(&existing);
                }
                return Some(SecretString::new(existing));
            }
        }
    }

    // ③ 都没有 → 生成随机 32B,双写:keychain(best-effort)+ **混淆**文件(chmod 600,稳定兜底)。
    use rand::RngCore as _;
    let mut raw = [0u8; 32];
    rand::rngs::OsRng.fill_bytes(&mut raw);
    let b64 = base64::engine::general_purpose::STANDARD.encode(raw);
    raw.zeroize(); // 原始 32B 抹除,不残留栈上。
    if let Ok(entry) = keyring::Entry::new(KEYCHAIN_SERVICE, KEYCHAIN_KEY_NAME) {
        let _ = entry.set_password(&b64);
    }
    if !write_master_key_file(&key_file, &b64, &machine_seed) {
        // 连文件都写不了 → 降级(sidecar 用固定 dev key,弱安全但不崩)。
        eprintln!("[shell] 写 master key 文件失败(降级 dev key)");
        return None;
    }
    // 安全说明:文件兜底把 master key **混淆**存 appDataDir(机器绑定 SHA-256-CTR)—— 强度弱于
    //   keychain(读盘+知派生+同机可解),但**未签名 app keychain 不持久**下这是唯一可用方案
    //   (签名后 ① 自动走 keychain)。较旧版明文落盘已灭静态靶点(见 obfuscate_master_key_file 注释)。
    eprintln!("[shell] 生成 master key(keychain best-effort + 混淆文件兜底 .master-key)");
    Some(SecretString::new(b64))
}

/// 把 master key(明文 base64)以**混淆格式**写入 `.master-key`(chmod 600)。成功返回 true。
fn write_master_key_file(key_file: &std::path::Path, plaintext_b64: &str, machine_seed: &str) -> bool {
    use rand::RngCore as _;
    let mut nonce = [0u8; 16];
    rand::rngs::OsRng.fill_bytes(&mut nonce);
    let obfuscated = obfuscate_master_key_file(plaintext_b64, machine_seed, &nonce);
    if let Err(e) = std::fs::write(key_file, &obfuscated) {
        eprintln!("[shell] 写 .master-key 失败 {}: {e}", key_file.display());
        return false;
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt as _;
        let _ = std::fs::set_permissions(key_file, std::fs::Permissions::from_mode(0o600));
    }
    true
}

/// [T-391 H-mac] 期望的签名 Team ID(证书采购后填)。为 `None` 时(内测不签名期)自校验只**如实
/// 上报**不做 Team ID 匹配判定;填入真实 Team ID 后,签名构建里检测到 team 不符 → 记 tamper 警告
/// (仍**不硬崩** —— 对齐 SPEC §6「静默降级不硬拦」+ 未签名内测不能把自己锁死)。
#[cfg(target_os = "macos")]
const EXPECTED_TEAM_ID: Option<&str> = None;

/// [T-391 H-mac] 运行时自身 code signature 的自校验结论(见 SPEC §6)。
#[cfg(target_os = "macos")]
#[derive(Debug, Clone, PartialEq, Eq)]
enum SelfSignature {
    /// 未签名(内测期常态)—— 如实降级,不硬拦。
    Unsigned,
    /// 已签名。`valid` = codesign --verify 是否通过;`team_id` = TeamIdentifier(可能缺)。
    Signed { team_id: Option<String>, valid: bool },
    /// 无法判定(codesign 不可用 / 输出异常)—— 保守当"未知",不硬拦。
    Unknown,
}

/// [T-391 H-mac] 纯函数:把 `codesign --verify` 的成功与否 + `codesign -dv` 的输出解读成结论。
/// 抽出来是为了**可单测**(注入 fake 输出),不依赖真机签名状态。
#[cfg(target_os = "macos")]
fn interpret_codesign(verify_ok: bool, dv_output: &str) -> SelfSignature {
    // codesign -dv 对未签名二进制输出含 "code object is not signed at all"。
    if dv_output.contains("not signed at all") || dv_output.contains("is not signed") {
        return SelfSignature::Unsigned;
    }
    // 解析 TeamIdentifier=XXXX(未署名开发签可能是 "TeamIdentifier=not set")。
    let team_id = dv_output.lines().find_map(|l| {
        l.trim()
            .strip_prefix("TeamIdentifier=")
            .map(|v| v.trim().to_string())
            .filter(|v| !v.is_empty() && v != "not set")
    });
    // 有 Authority / TeamIdentifier 迹象 → 认定已签名;否则无从判定。
    if team_id.is_some() || dv_output.contains("Authority=") || dv_output.contains("Signature=") {
        SelfSignature::Signed {
            team_id,
            valid: verify_ok,
        }
    } else {
        SelfSignature::Unknown
    }
}

/// [T-391 H-mac] 运行时自校验自身 code signature(macOS)。补「首次过 Gatekeeper 后不再全量验签」
/// 空档:每次启动核自身签名有效性 + Team ID。
///
/// 实现选型:走系统 `/usr/bin/codesign`(绝对路径,防 PATH 劫持)而非手写 Security.framework FFI ——
///   本任务 Cargo 只许加 secrecy/zeroize(不能加 security-framework/core-foundation crate),而裸 FFI
///   处理 CFDictionary 取 TeamIdentifier 既长且脆;codesign CLI 是 Security.framework 的官方封装,拿
///   Team ID/有效性直接且可解析。诚实边界(SPEC §6):自校验对本地能自签跑 patch 版的攻击者无效,
///   它守的是二次分发 + 本地伪装正版;检测到异常**不硬崩**(避免误伤 + 不给"崩溃点=判定点"信号)。
#[cfg(target_os = "macos")]
fn verify_self_code_signature() -> SelfSignature {
    let exe = match std::env::current_exe() {
        Ok(p) => p,
        Err(_) => return SelfSignature::Unknown,
    };
    // --verify --strict:签名完整性 + 严格校验。退出码 0 = 通过。
    let verify_ok = std::process::Command::new("/usr/bin/codesign")
        .arg("--verify")
        .arg("--strict")
        .arg(&exe)
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false);
    // -dv --verbose=4:输出签名信息(TeamIdentifier/Authority 在 stderr)。
    let dv = std::process::Command::new("/usr/bin/codesign")
        .arg("-dv")
        .arg("--verbose=4")
        .arg(&exe)
        .output();
    let dv_output = match dv {
        Ok(o) => {
            let mut s = String::from_utf8_lossy(&o.stderr).to_string();
            s.push_str(&String::from_utf8_lossy(&o.stdout));
            s
        }
        Err(_) => return SelfSignature::Unknown,
    };
    interpret_codesign(verify_ok, &dv_output)
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
    Std(std::sync::Arc<shared_child::SharedChild>),
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
            SidecarChild::Std(c) => {
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

/// 阻塞轮询 `http://127.0.0.1:PORT/`，同时消费 instrumentation 完成/子进程退出信号。
/// 只有“完成哨兵 + 连续两次 TCP 可连”才返回 Ready；退出和超时都有独立结果。
const SIDECAR_STARTUP_SENTINEL: &str = "[CreatorOS] SIDECAR_STARTUP_VERIFIED";

#[derive(Clone, Debug)]
enum StartupSignal {
    Verified,
    Exited(String),
}

#[derive(Clone, Debug, PartialEq, Eq)]
enum StartupWaitOutcome {
    Pending,
    Ready,
    Exited(String),
    TimedOut,
}

fn classify_startup_probe(
    tcp_ready: bool,
    instrumentation_verified: bool,
    exit_reason: Option<&str>,
    timed_out: bool,
) -> StartupWaitOutcome {
    // 退出优先：sidecar 可能短暂 listen 后立即因 verdict 失败退出，本次白屏正是此竞态。
    if let Some(reason) = exit_reason {
        return StartupWaitOutcome::Exited(reason.to_string());
    }
    if tcp_ready && instrumentation_verified {
        return StartupWaitOutcome::Ready;
    }
    if timed_out {
        return StartupWaitOutcome::TimedOut;
    }
    StartupWaitOutcome::Pending
}

/// 同时等待 instrumentation 完成哨兵、稳定 TCP 与子进程存活。
fn wait_until_ready(
    port: u16,
    timeout: Duration,
    signals: std::sync::mpsc::Receiver<StartupSignal>,
) -> StartupWaitOutcome {
    let deadline = std::time::Instant::now() + timeout;
    let addr = format!("127.0.0.1:{port}");
    let mut instrumentation_verified = false;
    let mut tcp_streak = 0_u8;
    loop {
        let mut exit_reason = None;
        for signal in signals.try_iter() {
            match signal {
                StartupSignal::Verified => instrumentation_verified = true,
                StartupSignal::Exited(reason) => exit_reason = Some(reason),
            }
        }
        let tcp_ready = std::net::TcpStream::connect(&addr).is_ok();
        tcp_streak = if tcp_ready {
            tcp_streak.saturating_add(1)
        } else {
            0
        };
        let outcome = classify_startup_probe(
            tcp_streak >= 2,
            instrumentation_verified,
            exit_reason.as_deref(),
            std::time::Instant::now() >= deadline,
        );
        if outcome != StartupWaitOutcome::Pending {
            return outcome;
        }
        std::thread::sleep(Duration::from_millis(150));
    }
}

// [T-562] splash 改为随包 `placeholder-dist/index.html` 静态文档。此前在 about:blank
// initialization_script 里动态造 DOM，Windows WebView2 多次出现脚本未执行、失败页也无处渲染，
// 最终只剩纯白窗口。静态文档在 Rust 慢启动/sidecar 失败前就有真实 DOM，不再依赖该竞态。
#[cfg(test)]
const SPLASH_HTML: &str = include_str!("../placeholder-dist/index.html");

fn json_for_eval(value: &str) -> String {
    serde_json::to_string(value)
        .unwrap_or_else(|_| "\"\"".to_string())
        .replace('<', "\\u003c")
        .replace('\u{2028}', "\\u2028")
        .replace('\u{2029}', "\\u2029")
}

fn startup_failure_script(title: &str, detail: &str, logs_dir: &str) -> String {
    format!(
        "if(window.__creatorosSplashFailure)window.__creatorosSplashFailure({},{},{});",
        json_for_eval(title),
        json_for_eval(detail),
        json_for_eval(logs_dir),
    )
}

fn show_startup_failure(
    win: tauri::WebviewWindow,
    title: &str,
    detail: &str,
    logs_dir: &str,
) {
    let script = startup_failure_script(title, detail, logs_dir);
    // setup 尚未返回时 WebView event loop 可能还没完成静态 splash 加载。把 eval 延后到
    // event loop 已运行后；即便 eval 极端失败，静态 splash 也不会退化成纯白。
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(250));
        let win2 = win.clone();
        let _ = win.run_on_main_thread(move || {
            let _ = win2.eval(&script);
        });
    });
}

/// [T-372 L2] sidecar 入口完整性校验:对 bundle 里的 sidecar.tar.gz 比对构建期内嵌的
/// SHA-256(build.rs 经 rustc-env 注入)。不匹配 → Err(人话)→ 拒绝 spawn。
///
/// 诚实边界(SPEC §9 gate-F4):此校验只防 **JS 层篡改**(改 tarball 里的 server.js 等);
/// ① patch 本 Rust 二进制可绕;② 已解压的 runtime 缓存目录(appDataDir/runtime/…)被直接
/// 改写不在每次启动的校验范围内(tarball 尺寸指纹变了才重解压)——不假装形成全链路防篡改。
fn verify_file_sha256(
    path: &std::path::Path,
    expected: &str,
    label: &str,
) -> Result<(), String> {
    use sha2::{Digest, Sha256};
    use std::io::Read as _;

    if expected.is_empty() {
        return Err(format!("构建期未内嵌{label}哈希，拒绝运行无法验证的正式资源"));
    }
    let mut file = std::fs::File::open(path)
        .map_err(|e| format!("读{label}失败 {}: {e}", path.display()))?;
    let mut hasher = Sha256::new();
    // [T-446] 堆分配 1MB 缓冲(避免 Windows 线程栈 1MB 场景下的栈溢出;运行时主线程栈通常更大
    //   但 Tauri 生命周期钩子里的辅助线程默认仍 1MB,统一堆分配更稳)。
    let mut buf = vec![0_u8; 1024 * 1024];
    loop {
        let n = file
            .read(&mut buf)
            .map_err(|e| format!("读{label}失败 {}: {e}", path.display()))?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    let actual = hasher
        .finalize()
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect::<String>();
    if actual != expected {
        return Err(format!(
            "{label}完整性校验失败(期望 {expected} 实际 {actual})。应用文件可能被篡改或安装损坏，请重新安装 CreatorOS。"
        ));
    }
    Ok(())
}

fn verify_sidecar_tarball(tarball: &std::path::Path) -> Result<(), String> {
    // build.rs 恒注入该 env:打包构建 = tarball 真哈希;dev(无 tarball)= 空串。
    let expected = env!("CREATOROS_SIDECAR_SHA256");
    if expected.is_empty() {
        // dev 构建(cargo check/test 时无 tarball)→ 无基准可比,诚实跳过并留日志。
        eprintln!("[shell] 构建期未内嵌 sidecar 哈希(dev 构建),跳过入口完整性校验");
        return Ok(());
    }
    verify_file_sha256(tarball, expected, "sidecar.tar.gz")
}

/// [T-446] Windows 安装包直接携带的展开目录硬校验。Windows 构建期已把 pnpm junction 全部
/// 物化成真文件；运行时无需可写，不应再复制或解压到 `%APPDATA%`。
#[cfg(windows)]
fn verify_direct_sidecar_dir(dir: &std::path::Path) -> Result<(), String> {
    verify_direct_sidecar_dir_with_hash(dir, env!("CREATOROS_SIDECAR_ENTRY_SHA256"))
}

#[cfg(any(windows, test))]
fn verify_direct_sidecar_dir_with_hash(
    dir: &std::path::Path,
    expected_entry_hash: &str,
) -> Result<(), String> {
    let entry = dir.join("frontend").join("server.js");
    for required in [
        entry.clone(),
        dir.join("frontend").join(".next"),
        dir.join("frontend").join("node_modules"),
        dir.join("backend")
            .join("drizzle")
            .join("meta")
            .join("_journal.json"),
    ] {
        if !required.exists() {
            return Err(format!(
                "Windows 安装目录中的 sidecar 不完整，缺 {}。请重新安装 CreatorOS。",
                required.display()
            ));
        }
    }
    verify_file_sha256(&entry, expected_entry_hash, "Windows sidecar 入口")
}

/// [T-487] 读取 Windows 安装期写入的 runtime 指针。指针只允许构建生成的安全 ID，
/// 禁止路径分隔符和 `..`，避免安装目录中的文本文件把运行路径引到目录外。
#[cfg(any(windows, test))]
fn resolve_installed_runtime_with_hash(
    install_dir: &std::path::Path,
    expected_entry_hash: &str,
) -> Result<Option<PathBuf>, String> {
    let runtime_root = install_dir.join("runtime-images");
    let resolve_pointer = |name: &str| -> Result<Option<PathBuf>, String> {
        let pointer = runtime_root.join(name);
        if !pointer.is_file() {
            return Ok(None);
        }
        let runtime_id = std::fs::read_to_string(&pointer)
            .map_err(|e| format!("读取 Windows runtime 指针失败 {}: {e}", pointer.display()))?;
        let runtime_id = runtime_id.trim();
        if runtime_id.is_empty()
            || runtime_id == "."
            || runtime_id == ".."
            || !runtime_id
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-'))
        {
            return Err(format!(
                "Windows runtime 指针非法（仅允许字母、数字、点、下划线和短横线）: {runtime_id:?}"
            ));
        }
        let sidecar = runtime_root.join(runtime_id).join("sidecar");
        verify_direct_sidecar_dir_with_hash(&sidecar, expected_entry_hash)?;
        Ok(Some(sidecar))
    };

    resolve_pointer("runtime-current.txt")
}

/// [T-487] NSIS 安装期事务：校验 bundle tar → 同盘 staging 解压 → 校验入口与关键结构
/// → 原子切换版本目录和 current 指针。任何一步失败都只清理 staging，旧 current 保持可用。
#[cfg(any(windows, test))]
#[cfg_attr(test, allow(dead_code))]
fn materialize_windows_runtime(install_dir: &std::path::Path) -> Result<PathBuf, String> {
    let tarball = install_dir.join("sidecar.tar.gz");
    verify_sidecar_tarball(&tarball)?;

    let tar_hash = env!("CREATOROS_SIDECAR_SHA256");
    let runtime_suffix = if tar_hash.len() >= 12 {
        &tar_hash[..12]
    } else {
        "development"
    };
    let runtime_id = format!("{}-{runtime_suffix}", env!("CARGO_PKG_VERSION"));
    let runtime_root = install_dir.join("runtime-images");
    let staging_parent = runtime_root.join(".staging").join(&runtime_id);
    let staged_sidecar = staging_parent.join("sidecar");
    let final_runtime = runtime_root.join(&runtime_id);
    let final_sidecar = final_runtime.join("sidecar");

    std::fs::create_dir_all(runtime_root.join(".staging"))
        .map_err(|e| format!("创建 Windows runtime 暂存根失败: {e}"))?;
    let _ = std::fs::remove_dir_all(&staging_parent);

    let result = (|| -> Result<PathBuf, String> {
        let stamp = if tar_hash.is_empty() {
            let size = std::fs::metadata(&tarball).map(|m| m.len()).unwrap_or(0);
            format!("size:{size}")
        } else {
            format!("sha256:{tar_hash}")
        };
        extract_sidecar_tarball(&tarball, &staged_sidecar, &stamp)?;
        verify_direct_sidecar_dir_with_hash(
            &staged_sidecar,
            env!("CREATOROS_SIDECAR_ENTRY_SHA256"),
        )?;
        // 构建清单在安装器子进程里同样可用；固定 seed 只用于额外抽样，不替代入口硬校验。
        integrity_sample_verify(&staged_sidecar, "windows-installer")?;

        if final_runtime.exists() {
            std::fs::remove_dir_all(&final_runtime)
                .map_err(|e| format!("清理同 ID 的损坏 Windows runtime 失败: {e}"))?;
        }
        std::fs::rename(&staging_parent, &final_runtime)
            .map_err(|e| format!("原子切换 Windows runtime 目录失败: {e}"))?;
        write_windows_runtime_pointer(&runtime_root, &runtime_id)?;
        cleanup_windows_runtime_versions(&runtime_root);
        Ok(final_sidecar)
    })();

    if result.is_err() {
        let _ = std::fs::remove_dir_all(&staging_parent);
    }
    result
}

/// [T-557] NSIS 自身的 RMDir /r 受 Windows 长路径限制，无法可靠删除 runtime
/// 中的深层 node_modules。主动卸载时先复用仍存在的主程序，用 Rust 递归清理。
#[cfg(any(windows, test))]
fn remove_windows_installed_runtime(install_dir: &std::path::Path) -> Result<(), String> {
    let runtime_root = install_dir.join("runtime-images");
    if !runtime_root.exists() {
        return Ok(());
    }
    std::fs::remove_dir_all(&runtime_root)
        .map_err(|e| format!("清理 Windows runtime 失败 {}: {e}", runtime_root.display()))?;
    if runtime_root.exists() {
        return Err(format!(
            "清理 Windows runtime 后目录仍存在: {}",
            runtime_root.display()
        ));
    }
    Ok(())
}

#[cfg(any(windows, test))]
fn write_windows_runtime_pointer(
    runtime_root: &std::path::Path,
    runtime_id: &str,
) -> Result<(), String> {
    let current = runtime_root.join("runtime-current.txt");
    let temp = runtime_root.join(format!(
        ".runtime-current-{}.tmp",
        std::process::id()
    ));
    let backup = runtime_root.join(format!(
        ".runtime-current-{}.previous",
        std::process::id()
    ));
    std::fs::write(&temp, format!("{runtime_id}\n"))
        .map_err(|e| format!("写 Windows runtime 临时指针失败: {e}"))?;
    let _ = std::fs::remove_file(&backup);
    if current.exists() {
        std::fs::rename(&current, &backup)
            .map_err(|e| format!("暂存 Windows current runtime 指针失败: {e}"))?;
    }
    if let Err(e) = std::fs::rename(&temp, &current) {
        if backup.exists() {
            let _ = std::fs::rename(&backup, &current);
        }
        let _ = std::fs::remove_file(&temp);
        return Err(format!("原子切换 Windows current runtime 指针失败: {e}"));
    }
    let _ = std::fs::remove_file(&backup);
    Ok(())
}

/// 只保留 current，避免每次升级在安装盘永久多占约 1GB。跨版本 previous 不能拿当前
/// 壳内嵌的新哈希/manifest 诚实验证，因此不伪造 last-good；安装期失败改由保留的 tar
/// 在首启走兼容解压（fail-forward）。
/// 清理是成功切换后的 best-effort；失败仅记日志，不反向破坏已经可用的新 runtime。
#[cfg(any(windows, test))]
fn cleanup_windows_runtime_versions(runtime_root: &std::path::Path) -> usize {
    let mut keep = std::collections::HashSet::new();
    for pointer in ["runtime-current.txt"] {
        if let Ok(id) = std::fs::read_to_string(runtime_root.join(pointer)) {
            let id = id.trim();
            if !id.is_empty() {
                keep.insert(id.to_string());
            }
        }
    }
    let Ok(entries) = std::fs::read_dir(runtime_root) else {
        return 0;
    };
    let mut removed = 0;
    for entry in entries.flatten() {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        if !path.is_dir() || name == ".staging" || keep.contains(&name) {
            continue;
        }
        match std::fs::remove_dir_all(&path) {
            Ok(()) => removed += 1,
            Err(e) => eprintln!(
                "[installer] 清理旧 Windows runtime 失败 {}: {e}",
                path.display()
            ),
        }
    }
    let _ = std::fs::remove_dir(runtime_root.join(".staging"));
    removed
}

// ─────────────────────────────────────────────────────────────────────────────
// [T-450] 完整性清单抽样校验:build.rs 生成 XOR-masked manifest blob(sidecar 下关键文件
// SHA-256 清单),运行时按 machine_id + hour_bucket 派生 seed → 抽 N=12 项校验。任一命中
// 篡改 → Err → resolve_sidecar_dir Err → 拒 spawn。
//
// 诚实边界(SPEC ladder §9):
//   · 攻击者 patch 本文件的验证逻辑本身(sha2/rand/parse)可绕——已知非目标。
//   · N=12 是概率保护:patch 1 文件当次逃脱 ~98%;patch 10 文件当次逃脱 ~65%;patch 50 ~10%。
//     加 hour_bucket 让攻击者每小时得重算样本索引→不可持续。
//   · 秘密种子上下文 obfstr 藏,attacker 逆 obfstr 常量拿到后可精准算样本→但那时他已经能改
//     任何 obfstr 常量了;抽样不再是防线,防线在其他 obfstr 藏起的钥匙。
// ─────────────────────────────────────────────────────────────────────────────

// build.rs 侧 XOR-mask 用的密钥(magic 4B 后 XOR 循环密钥)。build.rs 里是明文数组,这里用
// obfstr::obfbytes! 藏——lib.rs 二进制里不再出现连续 16B 明文,静态 grep 不到。
//
// 注意:两侧 16B 常量必须**逐字节相等**。若改动这里,build.rs 里 XOR_KEY 也必须同步改。
fn integrity_xor_key() -> [u8; 16] {
    *obfstr::obfbytes!(&[
        0x3a, 0x9f, 0x21, 0x7c, 0x55, 0xe0, 0x0b, 0x8d, 0x46, 0x12, 0xa8, 0xd3, 0x67, 0xbe, 0x1e,
        0x94,
    ])
}

/// 秘密上下文(seed 派生用)。obfstr 藏 → attacker 拿不到明文就派生不出目标机器的样本索引。
/// 返回 owned 数组(非 `&'static`):obfbytes! 展开的是 stack-local 数组,函数返回后无效——
/// 与 integrity_xor_key() 同 pattern,解引用得到值拷贝。
fn integrity_sample_context() -> [u8; 19] {
    *obfstr::obfbytes!(b"creatoros-sample-v1")
}

/// 每次启动抽 N 项(§调研 §3.3:12 是覆盖 vs 冷启开销的平衡点)。
const INTEGRITY_SAMPLE_N: usize = 12;

/// hour_bucket 粒度:seed 每 3600s 轮换一次(§3.3),让攻击者精修一次样本 → 1h 后失效。
const INTEGRITY_HOUR_BUCKET_SECS: u64 = 3600;

/// 编译期内嵌的完整性 manifest(build.rs 生成)。dev / cargo check 时是空 manifest(仅 magic
/// + count=0),运行时 parse 后诚实 Err。
const INTEGRITY_MANIFEST_BLOB: &[u8] =
    include_bytes!(concat!(env!("OUT_DIR"), "/integrity-manifest.bin"));

/// XOR-unmask 并 parse manifest。返回 Vec<(相对路径 posix, 32B hash)>。
///
/// 格式(与 build.rs 一致):
///   [magic:4B = "CIm1"] [record_count:u32 LE] { [path_len:u16 LE][utf8 path][hash:32B] }*
///   除 magic 外整个 blob 用 integrity_xor_key() 循环 XOR。
fn parse_integrity_manifest(blob: &[u8]) -> Result<Vec<(String, [u8; 32])>, String> {
    if blob.len() < 8 || &blob[0..4] != b"CIm1" {
        return Err("integrity manifest magic 不匹配(构建期漏写?)".to_string());
    }
    // Unmask (除 magic 4B):count(4) + records。
    let key = integrity_xor_key();
    let mut plain = Vec::with_capacity(blob.len());
    plain.extend_from_slice(&blob[0..4]);
    for (i, &b) in blob[4..].iter().enumerate() {
        plain.push(b ^ key[i % 16]);
    }
    let count = u32::from_le_bytes(plain[4..8].try_into().unwrap()) as usize;
    let mut out = Vec::with_capacity(count);
    let mut cur = 8usize;
    for _ in 0..count {
        if cur + 2 > plain.len() {
            return Err("integrity manifest 截断(path_len 前)".to_string());
        }
        let path_len =
            u16::from_le_bytes(plain[cur..cur + 2].try_into().unwrap()) as usize;
        cur += 2;
        if cur + path_len + 32 > plain.len() {
            return Err("integrity manifest 截断(path/hash)".to_string());
        }
        let path = std::str::from_utf8(&plain[cur..cur + path_len])
            .map_err(|e| format!("integrity manifest 路径非 utf8: {e}"))?
            .to_string();
        cur += path_len;
        let mut hash = [0u8; 32];
        hash.copy_from_slice(&plain[cur..cur + 32]);
        cur += 32;
        out.push((path, hash));
    }
    Ok(out)
}

/// 从 machine_id + hour_bucket + 秘密上下文派生 SmallRng 种子。
///
/// 性质:
///   · 每机器不同(machine_id 稳定短指纹)→ attacker 在自己机器逆出的样本 ≠ 目标样本;
///   · 每小时轮换(hour_bucket)→ 攻击窗口 ≤ 1 小时;
///   · 秘密上下文 obfstr 藏 → attacker 拿不到 SAMPLE_CTX 就构造不出对应 machine_id 的样本;
///   · 测试环境固定 machine_id + mock 时钟 → 可复现。
fn derive_integrity_sample_seed(machine_id: &str, wall_secs: u64) -> u64 {
    use sha2::{Digest, Sha256};
    let hour_bucket = wall_secs / INTEGRITY_HOUR_BUCKET_SECS;
    let mut hasher = Sha256::new();
    hasher.update(integrity_sample_context());
    hasher.update(machine_id.as_bytes());
    hasher.update(hour_bucket.to_le_bytes());
    let digest = hasher.finalize();
    u64::from_le_bytes(digest[..8].try_into().unwrap())
}

/// 从 [0, total) 里不放回抽 N 个索引(简单 Fisher-Yates 前 N 段)。StdRng seed 决定序列。
fn sample_without_replacement(
    seed: u64,
    total: usize,
    n: usize,
) -> Vec<usize> {
    use rand::rngs::StdRng;
    use rand::{RngCore as _, SeedableRng as _};
    let n = n.min(total);
    let mut arr: Vec<usize> = (0..total).collect();
    let mut rng = StdRng::seed_from_u64(seed);
    for i in 0..n {
        // rand 0.8 无 gen_range without more surface;直接 next_u64 % 也够(轻微偏差可忽略,
        // 抽样非加密敏感)。
        let j = i + (rng.next_u64() as usize) % (total - i);
        arr.swap(i, j);
    }
    arr.truncate(n);
    arr
}

/// 抽样验证 sidecar_root 下的完整性(build.rs 生成的 manifest 里的相对路径 + hash)。
///
/// 失败即 Err(拒 spawn)。dev / cargo check 场景 manifest 为空 → Err(诚实降级,不静默通过)。
/// 校验的时钟源:SystemTime::now(墙钟)——用于 hour_bucket,不用于安全敏感判定,墙钟被改
/// 只影响样本 rotation 节奏,不影响单次校验正确性(某次校验发生时,build 期 hash 与磁盘文件
/// hash 要么相等要么不等,与时钟无关)。
fn integrity_sample_verify(
    sidecar_root: &std::path::Path,
    machine_id: &str,
) -> Result<(), String> {
    let records = parse_integrity_manifest(INTEGRITY_MANIFEST_BLOB)?;
    if records.is_empty() {
        return Err(
            "构建期未内嵌完整性清单(可能是 dev / cargo check),拒绝无法验证的运行时".to_string(),
        );
    }
    let wall_secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let seed = derive_integrity_sample_seed(machine_id, wall_secs);
    let picks = sample_without_replacement(seed, records.len(), INTEGRITY_SAMPLE_N);
    for i in picks {
        let (rel, expected) = &records[i];
        // manifest 里存 posix `/`;运行时按平台还原为 join。
        let mut path = sidecar_root.to_path_buf();
        for seg in rel.split('/') {
            path = path.join(seg);
        }
        verify_file_sha256_bytes(&path, expected, rel)?;
    }
    Ok(())
}

/// verify_file_sha256 的二进制版本(hash 直接对比 32B,不经 hex 字符串)。同款 IO/hash 逻辑。
fn verify_file_sha256_bytes(
    path: &std::path::Path,
    expected: &[u8; 32],
    label: &str,
) -> Result<(), String> {
    use sha2::{Digest, Sha256};
    use std::io::Read as _;
    let mut file = std::fs::File::open(path)
        .map_err(|e| format!("[T-450] 读{label}失败 {}: {e}", path.display()))?;
    let mut hasher = Sha256::new();
    // [T-446] 堆分配 1MB 缓冲(避免 Windows 线程栈 1MB 场景栈溢出)。
    let mut buf = vec![0_u8; 1024 * 1024];
    loop {
        let n = file
            .read(&mut buf)
            .map_err(|e| format!("[T-450] 读{label}失败 {}: {e}", path.display()))?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    let actual: [u8; 32] = hasher.finalize().into();
    if actual != *expected {
        return Err(format!(
            "[T-450] {label} 完整性抽样校验失败(路径 {})。应用文件可能被篡改或安装损坏,请重新安装 CreatorOS。",
            path.display()
        ));
    }
    Ok(())
}


/// tar 兜底平台的原子解压：先在同盘临时目录完成并校验，再 rename 切换；失败绝不留下半成品。
fn extract_sidecar_tarball(
    tarball: &std::path::Path,
    dest: &std::path::Path,
    stamp_value: &str,
) -> Result<bool, String> {
    if !tarball.is_file() {
        return Err(format!("sidecar.tar.gz 不存在: {}", tarball.display()));
    }
    let marker = dest.join("frontend").join("server.js");
    let stamp = dest.join(".tarball-stamp");
    let stamped = std::fs::read_to_string(&stamp).ok();
    if marker.is_file() && stamped.as_deref() == Some(stamp_value) {
        return Ok(false);
    }

    let parent = dest
        .parent()
        .ok_or_else(|| format!("sidecar 解压目标无父目录: {}", dest.display()))?;
    std::fs::create_dir_all(parent)
        .map_err(|e| format!("建 sidecar runtime 父目录失败 {}: {e}", parent.display()))?;
    let name = dest.file_name().and_then(|s| s.to_str()).unwrap_or("sidecar");
    let temp = parent.join(format!("{name}.extracting-{}", std::process::id()));
    let backup = parent.join(format!("{name}.previous-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&temp);
    let _ = std::fs::remove_dir_all(&backup);
    std::fs::create_dir_all(&temp)
        .map_err(|e| format!("建 sidecar 临时解压目录失败 {}: {e}", temp.display()))?;

    // [T-485] 不调用系统 `tar`：用户机可能没有、GUI PATH 也可能找不到。Rust tar::Archive
    // 自带路径穿越防护(unpack 内部拒绝 `..`/绝对路径)，同样保留 pnpm 相对 symlink。
    let unpack_result = (|| -> Result<(), String> {
        let file = std::fs::File::open(tarball)
            .map_err(|e| format!("打开 sidecar.tar.gz 失败 {}: {e}", tarball.display()))?;
        let decoder = flate2::read::GzDecoder::new(file);
        let mut archive = tar::Archive::new(decoder);
        let entries = archive
            .entries()
            .map_err(|e| format!("读取 sidecar.tar.gz 条目失败: {e}"))?;
        let mut files = 0_u64;
        let mut bytes = 0_u64;
        for entry in entries {
            let mut entry = entry.map_err(|e| format!("读取 sidecar tar 条目失败: {e}"))?;
            bytes = bytes.saturating_add(entry.header().size().unwrap_or(0));
            let unpacked = entry
                .unpack_in(&temp)
                .map_err(|e| format!("展开 sidecar tar 条目失败: {e}"))?;
            if !unpacked {
                return Err("sidecar tar 含越界路径，已拒绝展开".to_string());
            }
            files += 1;
            // NSIS nsExec::ExecToLog 会把这些行显示在安装详情中；用户不再面对一个
            // 数分钟毫无变化的窗口。每 1000 项打印一次，避免 2 万行日志本身拖慢安装。
            if files % 1000 == 0 {
                eprintln!(
                    "[runtime] 已展开 {files} 项（约 {} MiB）…",
                    bytes / 1024 / 1024
                );
            }
        }
        eprintln!(
            "[runtime] 展开完成：{files} 项，约 {} MiB",
            bytes / 1024 / 1024
        );
        Ok(())
    })();
    if let Err(e) = unpack_result {
        let _ = std::fs::remove_dir_all(&temp);
        return Err(format!(
            "sidecar 解压失败({e})，已清理临时目录；tarball={}",
            tarball.display(),
        ));
    }
    if !temp.join("frontend").join("server.js").is_file() {
        let _ = std::fs::remove_dir_all(&temp);
        return Err("sidecar 解压结果缺 frontend/server.js，已清理临时目录".to_string());
    }
    if let Err(e) = std::fs::write(temp.join(".tarball-stamp"), stamp_value) {
        let _ = std::fs::remove_dir_all(&temp);
        return Err(format!("写 sidecar 完成标记失败，已清理临时目录: {e}"));
    }

    if dest.exists() {
        if let Err(e) = std::fs::rename(dest, &backup) {
            let _ = std::fs::remove_dir_all(&temp);
            return Err(format!(
                "暂存旧 sidecar runtime 失败 {}，已清理临时目录: {e}",
                dest.display()
            ));
        }
    }
    if let Err(e) = std::fs::rename(&temp, dest) {
        if backup.exists() {
            let _ = std::fs::rename(&backup, dest);
        }
        let _ = std::fs::remove_dir_all(&temp);
        return Err(format!("原子切换 sidecar runtime 失败 {}: {e}", dest.display()));
    }
    let _ = std::fs::remove_dir_all(&backup);
    Ok(true)
}

/// [T-460/T-562] 更新静态 splash 页面状态文案。
/// Rust 侧调用 `window.__creatorosSplashStatus("正在展开首启资源…")` 即时反馈长阶段进度,
/// 避免用户看着一直转圈误以为死机。若 window 尚未建 / 已 navigate 到 sidecar 真页面 → JS 层
/// 会走异步无副作用(main window 可能没 __creatorosSplashStatus 或已被替换)。**best-effort,
/// 失败不影响主启动流**。文本已 JSON 转义避免注入。
fn splash_status(app: &AppHandle, msg: &str) {
    let escaped = serde_json::to_string(msg).unwrap_or_else(|_| "\"\"".to_string());
    let js = format!(
        "if(window.__creatorosSplashStatus)window.__creatorosSplashStatus({escaped});"
    );
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.eval(&js);
    }
}

/// 定位 sidecar 组装目录(内含 frontend/ + backend/ + node_modules/ + lib/)。
/// 全平台 bundle 都带单文件 tarball；Windows 安装期物化到 `$INSTDIR/runtime-images`，
/// macOS/Linux 以及旧 Windows 包仍可在 appDataDir 原子解压。
///   ① CREATOROS_SIDECAR_DIR env 覆盖(打包/测试可指定);
///   ② dev:CARGO_MANIFEST_DIR/sidecar(编译期常量,指向源目录,symlink 完好);
///   ③ Windows 新包:安装期 current 指针直读；
///   ④ 兼容路径:tar → appDataDir/runtime/<version>/sidecar。
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
    // **仅 debug 构建(`tauri dev`)可走**——release 分发包绝不引用编译机路径:此前无门控,
    // 开发机上装到 /Applications 的正式包也命中仓库源目录(编译机路径恒存在)→ ①重打包
    // rmSync 重建 sidecar/ 时抽走运行中 app 脚下文件(2026-07-18 实证:知识库/素材/发布页崩)
    // ②T-372 入口哈希校验被 dev 分支整体绕过 ③「打包版验证」实际验的是源目录,全部失真。
    #[cfg(debug_assertions)]
    {
        let dev_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("sidecar");
        if dev_dir.join("frontend").join("server.js").exists() {
            return Ok(dev_dir);
        }
    }
    // [T-487] Windows 正式安装优先直读 NSIS 安装期已物化并校验的 runtime。路径跟随
    // 用户在安装器目录页选择的 $INSTDIR（可为 D/E 盘），首次启动不再复制/解压到 AppData。
    // 当前仍保留下方 tar → appData 的兼容兜底；只有原生 Windows 安装验收通过后才删除。
    #[cfg(windows)]
    let mut installed_runtime_error: Option<String> = None;
    #[cfg(windows)]
    {
        if let Ok(exe) = std::env::current_exe() {
            if let Some(install_dir) = exe.parent() {
                match resolve_installed_runtime_with_hash(
                    install_dir,
                    env!("CREATOROS_SIDECAR_ENTRY_SHA256"),
                ) {
                    Ok(Some(dest)) => {
                        let machine_id = resolve_machine_id(app).unwrap_or_default();
                        integrity_sample_verify(&dest, &machine_id)?;
                        if let Ok(data_dir) = app.path().app_data_dir() {
                            let _ = cleanup_legacy_runtime_root(&data_dir);
                        }
                        eprintln!(
                            "[shell] Windows 使用安装期 runtime（首次启动零解压）→ {}",
                            dest.display()
                        );
                        return Ok(dest);
                    }
                    Ok(None) => {
                        eprintln!("[shell] Windows 安装期 runtime 指针不存在，进入兼容解压路径");
                    }
                    Err(e) => {
                        eprintln!("[shell] Windows 安装期 runtime 不可用，进入兼容解压路径: {e}");
                        installed_runtime_error = Some(e);
                    }
                }
            }
        }
    }
    // [T-454/T-487] 兼容路径：新 Windows 安装应在上方命中安装期 runtime；旧安装包、
    // macOS 与 Linux 仍可从单文件 tar 在 appData 原子解压。解压使用 Rust flate2/tar，
    // 不依赖用户电脑 PATH 或额外安装 tar/7-Zip。
    let tarball = app
        .path()
        .resolve("sidecar.tar.gz", tauri::path::BaseDirectory::Resource)
        .map_err(|e| format!("无法解析 bundle sidecar.tar.gz 路径: {e}"))?;
    if !tarball.is_file() {
        #[cfg(windows)]
        if let Some(installed_error) = installed_runtime_error {
            return Err(installed_error);
        }
        return Err("bundle 资源缺 sidecar.tar.gz(打包不完整)".to_string());
    }
    splash_status(app, "正在校验安装包完整性…");
    verify_sidecar_tarball(&tarball)?;
    let version = app.package_info().version.to_string();
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("appDataDir 不可用,无法解压 sidecar runtime: {e}"))?;
    let dest = data_dir.join("runtime").join(&version).join("sidecar");
    let expected = env!("CREATOROS_SIDECAR_SHA256");
    let stamp_value = if expected.is_empty() {
        let size = std::fs::metadata(&tarball).map(|m| m.len()).unwrap_or(0);
        format!("size:{size}")
    } else {
        format!("sha256:{expected}")
    };
    splash_status(
        app,
        "正在展开首启资源(约 1GB,5-10 分钟,仅首次启动)…",
    );
    if extract_sidecar_tarball(&tarball, &dest, &stamp_value)? {
        eprintln!("[shell] sidecar 原子解压完成→ {}", dest.display());
    }
    splash_status(app, "资源展开完成,正在启动服务…");

    // [T-450] tar 整体 hash 只在**解压前**校验一次(verify_sidecar_tarball);之后
    //   .tarball-stamp 复用机制让攻击者可直接 patch 已解压的 .jsc,下次启动 stamp 命中
    //   跳过重解压 → hash 完全绕过。补抽样(每次启动都跑),把「解压后的运行时目录」也纳入
    //   完整性防线。开销 §调研 §5:冷 66-360ms,热 12-18ms。
    let machine_id = resolve_machine_id(app).unwrap_or_default();
    integrity_sample_verify(&dest, &machine_id)?;

    let runtime_root = data_dir.join("runtime");
    let keep = version.clone();
    std::thread::spawn(move || {
        cleanup_stale_runtimes(&runtime_root, &keep);
    });
    Ok(dest)
}

/// [T-446] Windows 新包不再使用 `%APPDATA%/runtime`。只删这个明确的可再生缓存子目录，
/// 绝不触碰同级 db/.auth/.master-key/logs。失败留给下次启动重试。
#[cfg(any(windows, test))]
fn cleanup_legacy_runtime_root(app_data_dir: &std::path::Path) -> bool {
    let runtime_root = app_data_dir.join("runtime");
    if !runtime_root.exists() {
        return false;
    }
    match std::fs::remove_dir_all(&runtime_root) {
        Ok(()) => true,
        Err(e) => {
            eprintln!(
                "[shell] [T-446] 清理旧 runtime 缓存失败 {}: {e}",
                runtime_root.display()
            );
            false
        }
    }
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
    // [T-557] PREUNINSTALL 时主程序尚未被 NSIS 删除，先由 Rust 清理长路径 runtime；
    // updater 的 /UPDATE 路径不会调用该入口，只服务用户主动卸载。
    #[cfg(windows)]
    if std::env::args().any(|arg| arg == "--creatoros-uninstall-runtime") {
        let install_dir = std::env::current_exe()
            .ok()
            .and_then(|p| p.parent().map(std::path::Path::to_path_buf));
        let result = install_dir
            .ok_or_else(|| "无法定位 CreatorOS 安装目录".to_string())
            .and_then(|dir| remove_windows_installed_runtime(&dir));
        match result {
            Ok(()) => std::process::exit(0),
            Err(e) => {
                eprintln!("[uninstaller] runtime cleanup failed: {e}");
                std::process::exit(42);
            }
        }
    }

    // [T-487] NSIS POSTINSTALL 专用窄入口。必须早于 Tauri/single-instance 初始化，
    // 安装器只做离线 runtime 事务，不创建窗口、不读取用户数据库、不启动 sidecar。
    #[cfg(windows)]
    if std::env::args().any(|arg| arg == "--creatoros-install-runtime") {
        let install_dir = std::env::current_exe()
            .ok()
            .and_then(|p| p.parent().map(std::path::Path::to_path_buf));
        let result = install_dir
            .ok_or_else(|| "无法定位 CreatorOS 安装目录".to_string())
            .and_then(|dir| materialize_windows_runtime(&dir));
        match result {
            Ok(path) => {
                eprintln!("[installer] runtime ready: {}", path.display());
                std::process::exit(0);
            }
            Err(e) => {
                eprintln!("[installer] runtime materialize failed: {e}");
                std::process::exit(41);
            }
        }
    }

    // [T-399b] 强制蜜罐门符号+明文 bait 进最终二进制(Tauri rlib 结构下 #[used] 不够,见 decoy_gate.rs)。
    //   只取诱饵函数地址做 XOR、不调用其逻辑 → 零执行/零功能影响;black_box 防优化掉。
    std::hint::black_box(decoy_gate::decoy_gate_keepalive());
    tauri::Builder::default()
        // [T-446] 官方要求 single-instance 必须第一个注册。用户重复点击时第二进程立即退出，
        // 已有窗口存在则恢复并聚焦；即使首实例仍在 setup，也不会再跑第二份启动链。
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_shell::init())
        // [T-241] 外链转系统浏览器(webview 默认吞 target=_blank 新窗口请求)。
        .plugin(tauri_plugin_opener::init())
        // T-147 P6 —— updater 插件(签名更新包校验;pubkey 在 tauri.conf.json)。
        // [T-396c] endpoints 已清空:更新流改「版本检查(license_latest_version)+ 跳渠道
        // downloadUrl」;插件 + createUpdaterArtifacts + minisign 签名链保留 = 可逆开关
        // (后续渠道 downloadUrl 换直链 + 回填 endpoint 即恢复一键更新)。
        .plugin(tauri_plugin_updater::Builder::new().build())
        // [T-180] process 插件 —— 更新装好后 relaunch() 重启 app。
        .plugin(tauri_plugin_process::init())
        // [T-372 L2] 校验决策链 IPC:前端(激活页/设置页)只经这两个 command 拿放行结果,
        //   验签/防重放/防回拨逻辑全在 Rust(SPEC §9「前端只拿结果」)。
        .invoke_handler(tauri::generate_handler![
            license::license_activate,
            license::license_check,
            // [T-372 L3] 最近判定只读口(零网络):前端桥初始态 + 设置页宽限倒计时。
            license::license_last_decision,
            // [T-396c] 版本检查(latest-version 端点 + 渠道 downloadUrl,替代 updater check)。
            license::license_latest_version,
            // [T-568] 反馈诊断必须来自原生层，禁止 navigator.platform 把 Apple Silicon
            // 兼容性标识 `MacIntel` 当作实体芯片。
            runtime_system_info
        ])
        .manage(SidecarHandle::default())
        .setup(|app| {
            let handle = app.handle().clone();

            // [T-457] **头部立即建主窗口 + splash + 注入 handshake token** —— 移到 setup 头部,
            //   先于所有慢操作(sidecar tarball 首启解压 5-15min / master key 生成 / DB 迁移 /
            //   cargo 加载 dylib …)。此前实现:先跑完 resolve_sidecar_dir(含解压)才建窗 →
            //   首启用户"看着像死机"(2026-07-21 真机反馈)。
            //   handshake_token 也提前生成 —— 注入 initialization_script,后续每次 navigate
            //   都会重跑该脚本,token 常驻 window 全局。
            // [T-562] 启动页使用随包静态 index.html。Windows WebView2 不再靠 about:blank
            // initialization_script 动态造 DOM，避免脚本竞态留下永久白窗。
            let handshake_token = license::gen_handshake_token();
            let init_script =
                format!("window.__CREATOROS_HANDSHAKE_TOKEN__={:?};", handshake_token);
            let _splash_win = WebviewWindowBuilder::new(
                &handle,
                "main",
                WebviewUrl::App("index.html".into()),
            )
            .title("CreatorOS")
            .inner_size(1440.0, 900.0)
            .min_inner_size(1024.0, 680.0)
            .initialization_script(&init_script)
            .on_page_load(|_window, payload| {
                if payload.event() == PageLoadEvent::Finished
                    && matches!(payload.url().host_str(), Some("127.0.0.1" | "localhost"))
                {
                    eprintln!(
                        "[CreatorOS] MAIN_PAGE_LOAD_FINISHED {}",
                        payload.url()
                    );
                }
            })
            .build()
            .expect("建主窗口失败");
            drop(_splash_win); // 建完就释放引用,下面 line ~1530 从 handle.get_webview_window("main") 拿回 navigate。

            // [T-461 回退 → T-468] 曾把整个 setup 逻辑丢 std::thread::spawn,想让 event loop
            //   立即跑起来给 splash 渲染机会 —— 2026-07-22 真机验证**不生效**:CreatorOS.exe 存活
            //   但 sidecar 永不启动,主页永白屏。**根因怀疑**:后台线程内某处 .expect panic(可能
            //   `app.get_webview_window("main")` 在 setup 尚未 flush 到 window manager 前读)→ 后
            //   台线程死,但主进程活着 → splash 永远转圈。整片搬后台涉及 20+ Tauri API 调用,任一
            //   不 Send/Sync 或时序敏感即挂,风险面太大。
            //   改**只搬真正阻塞的 tar 解压**(resolve_sidecar_dir 里的 extract_sidecar_tarball,
            //   3-5 min 就是它占的),其余 setup 保持同步(路径解析/logger 起/spawn sidecar/wait
            //   ready/navigate)。T-468 单点手术,风险面 <10 行。
            //   splash 显示由 T-562 静态文档兜住。

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
            let app_data_dir_str = app_data_dir.to_string_lossy().to_string();
            // [T-562] logger 必须早于 runtime 解析。此前 runtime 指针/完整性失败会在 logger
            // 初始化前 panic，用户只得到白窗且没有可交付证据。
            let logs_dir = app_data_dir.join("logs");
            let logger = logging::init_sidecar_logger(&logs_dir);
            let log_dir_str = logs_dir.to_string_lossy().to_string();

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
                    if let Some(l) = &logger {
                        l.log("shell", &format!("runtime 解析失败: {e}"));
                    }
                    let detail = format!(
                        "离线运行环境无法通过启动校验，应用已停止继续加载。\n数据没有丢失。\n\n技术信息：{e}"
                    );
                    if let Some(win) = handle.get_webview_window("main") {
                        show_startup_failure(
                            win,
                            "CreatorOS 启动失败",
                            &detail,
                            &log_dir_str,
                        );
                    }
                    return Ok(());
                }
            };
            let server_js_str = sidecar_dir
                .join("frontend")
                .join("server.js")
                .to_string_lossy()
                .to_string();
            // [T-485] 随包资源目录由壳层以绝对路径注入，Node 侧不再猜 process.cwd()。
            // Finder / Windows 快捷方式启动时 cwd/PATH 都不可靠；壳层掌握真实 runtime 位置，
            // 所以它是 bin/ 与 browsers/ 的唯一 canonical 来源。
            let sidecar_frontend_dir = sidecar_dir.join("frontend");
            let bundled_bin_dir_str = sidecar_frontend_dir
                .join("bin")
                .to_string_lossy()
                .to_string();
            let bundled_browsers_dir_str = sidecar_frontend_dir
                .join("browsers")
                .to_string_lossy()
                .to_string();

            // sidecar 的 node runtime 是动态链接的(macOS: @rpath/libnode.dylib)。裸拷 node 二进制
            // 后 dyld 找不到 dylib → sidecar 起不来(SIGABRT)。build-sidecar.mjs 把 dylib co-ship 到
            // sidecar/lib/;注入 DYLD_LIBRARY_PATH(mac)/ LD_LIBRARY_PATH(linux)指向它。
            let lib_dir = sidecar_dir.join("lib").to_string_lossy().to_string();

            // T-147 P2 / [T-391 H-key] —— master key(base64 32B)做 model key / 激活码的 AES-256-GCM
            //   加解密。keychain 优先(签名 app 稳定+安全),**混淆文件兜底**(未签名下 keychain 不持久
            //   → <appDataDir>/.master-key,机器绑定混淆,稳定;避免每次启动重生成 key 致数据解不开)。
            //   传递方式:**不再走 env 明文**,改经 ChildStdin(fd 0)传给 sidecar(见下方 spawn 后 write);
            //   env 里只放非机密的 `CREATOROS_MASTER_KEY_FD=0`。取不到(连文件都写不了)→ 不传,sidecar 降级。
            //   (app_data_dir 已在上方 [T-332] 归档步骤前算出,此处直接复用。)

            // [T-259] 桌面日志系统:初始化落盘日志(建 logs/ + 轮转上次会话 + 开新 sidecar.log)。
            //   sidecar 的 stdout/stderr 每行既 eprintln 给 app stderr(dev/终端可见),也 tee 到
            //   <appDataDir>/logs/sidecar.log —— 打包态 `open -a` 拿不到 stderr 时,靠这份文件排障。
            //   注入 env `CREATOROS_LOG_DIR` 给 sidecar,供设置页「导出诊断日志」route 定位目录。
            //   init 失败(建目录/开文件不了)→ None,降级为仅 eprintln(不落盘但不崩)。
            // [T-332 S5] 归档摘要 tee 进 sidecar.log(归档发生在 logger 起来之前,补记一行,
            //   打包态用户报「重置后数据没了/还在」时可凭日志核实到底归没归档)。
            if let (Some(s), Some(l)) = (&reset_summary, &logger) {
                l.log("shell", s);
            }

            let master_key = resolve_or_create_master_key(&app_data_dir);

            // [T-391 H-mac] 运行时自校验自身 code signature(macOS)。如实上报,不硬拦(内测不签名
            //   → Unsigned 是常态;签名后检测 tamper 只记警告)。补「首次过 Gatekeeper 后不再全量验签」空档。
            #[cfg(target_os = "macos")]
            {
                let sig = verify_self_code_signature();
                let msg = match &sig {
                    SelfSignature::Unsigned => {
                        "签名自校验: 未签名(signed:false,内测期常态)".to_string()
                    }
                    SelfSignature::Signed { team_id, valid } => {
                        // 有期望 Team ID 且已签名但 team 不符 → tamper 警告(仍不硬崩)。
                        if let (Some(expected), Some(actual)) = (EXPECTED_TEAM_ID, team_id.as_deref())
                        {
                            if expected != actual {
                                eprintln!(
                                    "[shell] ⚠️ 签名自校验: Team ID 不符(期望 {expected} / 实际 {actual})—— 可能被二次签名分发"
                                );
                            }
                        }
                        format!(
                            "签名自校验: 已签名 valid={valid} team_id={}",
                            team_id.as_deref().unwrap_or("<none>")
                        )
                    }
                    SelfSignature::Unknown => "签名自校验: 无法判定(codesign 不可用)".to_string(),
                };
                eprintln!("[shell] {msg}");
                if let Some(l) = &logger {
                    l.log("shell", &msg);
                }
            }

            // T-147 P5 —— 机器指纹(multi-factor)。注入 sidecar env `CREATOROS_MACHINE_ID`,
            // node 侧 resolveMachineId 优先用它(桌面最稳);下面还注入 `CREATOROS_DESKTOP=1`
            // 作为**运行时**桌面标记(激活门只桌面拦 / web 跳的唯一判据)。
            let machine_id = resolve_machine_id(&app.handle());

            // [T-372 L2] 启动级 nonce 握手 token(loopback-guard.server.ts:18 的 follow-up 落地):
            //   Rust 每次启动随机生成 → 注入 sidecar env(guard 校验基准)+ WebView 初始化脚本
            //   (前端请求携带)。dev/web 无此 env → guard 不启用该检查,行为不变(P5 不变式)。
            // [T-457] handshake_token 已在 setup 头部先生成并注入到 splash 窗口 init_script,
            //   这里**复用同一 token**(不再 gen 二次;二次生成会覆盖 window 全局 → 前端读到旧
            //   值但 sidecar env 是新值 → 请求头对不上 guard 返 403 白屏)。
            // (handshake_token 已在头部作用域可见,直接用)
            // [T-372 L2] `.license` 放行权威文件路径,显式注入给 sidecar(激活门只读它判放行,
            //   不再读 activation_state 表;见 frontend/src/server/activation/license-file.server.ts)。
            let license_file_str = app_data_dir
                .join(".license")
                .to_string_lossy()
                .to_string();
            //   的单点:fd 竞态/挂起失败时 sidecar 会退随机 dev key,导致授权/模型密钥/登录态/激活码
            //   **一起解不开**(静默失效)。给 sidecar 注入 `.master-key` 路径 + 反混淆种子,让它在
            //   fd/env 都拿不到时自反混淆同一份 `.master-key` 拿真 key(算法与本壳
            //   `deobfuscate_master_key_file` 同,见 backend secret-crypto.ts resolveMasterKey ②.5)。
            //   `machine_uid` 是硬件 UUID(`ioreg` 本机任何进程可得,**非机密**),与
            //   `resolve_or_create_master_key` 用的 machine_seed 同源;文件本身仍是机器绑定混淆存储。
            let master_key_file_str = app_data_dir
                .join(".master-key")
                .to_string_lossy()
                .to_string();
            let master_key_seed = machine_uid::get().unwrap_or_default();
            // [gate-F2] 强验签开关透传。**默认 "1" 强验签**(2026-07-18 翻回):翻回条件已达成
            //   —— L1s 服务端签名私钥已部署上线(license.aitongban.cloud)+ 用户真码 Ed25519
            //   深验通过。此前内测过渡期默认 "0"(L1s 未上线时 strict 全拒 → /activate 无限
            //   重定向白屏,2026-07-18 真机实证)——那是显式过渡非静默降级,现按约定收口。
            //   外部显式设 env 时始终尊重外部值(排障可临时设 "0" 退弱验签)。
            let strict_verify_str = std::env::var("CREATOROS_LICENSE_STRICT_VERIFY")
                .unwrap_or_else(|_| "1".to_string());
            // [T-538] sidecar 的产品反馈可信出网配置。公钥只用于验证 AM 签名响应，不是秘密；
            // official origins 由发布环境烘焙，也允许开发/排障时用进程 env 显式覆盖。二者缺失时
            // 本地 product-feedback service fail-closed，绝不退到任意 bugFeedbackUrl origin。
            let license_public_key_b64 = license::embedded_pubkey_b64();
            let feedback_official_origins = std::env::var(
                "CREATOROS_FEEDBACK_OFFICIAL_ORIGINS",
            )
            .ok()
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty())
            .or_else(|| {
                option_env!("CREATOROS_FEEDBACK_OFFICIAL_ORIGINS")
                    .map(|value| value.trim().to_string())
                    .filter(|value| !value.is_empty())
            })
            .unwrap_or_default();

            // [T-372 L2] 壳层许可上下文:决策链(license.rs)经 Tauri command / 启动线程使用。
            let license_ctx = std::sync::Arc::new(license::ShellLicenseCtx {
                app_data_dir: app_data_dir.clone(),
                machine_id: machine_id.clone().unwrap_or_default(),
                // [T-391 H-key] master_key 现为 Option<SecretString>;ShellLicenseCtx 的 .license AES
                //   仍需 Option<String>(T-372),此处显式 expose(与 sidecar stdin 传递链正交)。
                master_key_b64: master_key.as_ref().map(|s| s.expose_secret().to_string()),
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

            // [T-451] verdict-bound handshake token 签发([gate-F4] 纯本地路径,不联网):
            //   startup_license_task 联网 status 心跳是**异步**的,setup 阶段绝不阻塞 UI/spawn。
            //   这里同步跑 derive_local_verdict(只读 .license 快照)→ sign_verdict_token 拿 token
            //   payload(machineId+expiresAt+port+nonce+mode)Ed25519 签名 → 注入 sidecar env。
            //   sidecar 侧 instrumentation 校验签名 + 有效期 + machineId + port,不通过 exit(1)。
            //   离线首启 + 有快照 → licensed token(R-DESKTOP 永久离线可用);无快照 → activation-only
            //   token(sidecar 起来,前端 proxy 只放 /activate/*)。心跳跑通后更新 .license,下次
            //   启动生效(当前 token 不重签,保持时序简单)。**私钥缺失 → None → 不注入 env**
            //   (dev/未 CI 构建路径,与 sidecar 走 dev-mode marker 分支互补;打包版签名 key 必存,
            //   None 就是构建配置错,靠 ac-9 grep 自审兜底)。
            let now_ms = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_millis() as i64)
                .unwrap_or(0);
            let verdict_setup = license::derive_local_verdict(license_ctx.as_ref(), now_ms);
            let verdict_token = license::sign_verdict_token(
                &verdict_setup,
                &machine_id.clone().unwrap_or_default(),
                port,
                now_ms,
            );
            if let Some(l) = &logger {
                l.log(
                    "shell",
                    &format!(
                        "[T-451] verdict-token 签发 licensed={} status={} token_present={}",
                        verdict_setup.licensed,
                        verdict_setup.status,
                        verdict_token.is_some()
                    ),
                );
            }

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
            //      CREATOROS_MASTER_KEY_FD —— 非机密 fd 号(master key 本体经 ChildStdin 传,见 H-key);
            //      CREATOROS_MACHINE_ID —— 取到才注入(取不到 sidecar/node 侧各有降级)。
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
            let (startup_tx, startup_rx) =
                std::sync::mpsc::channel::<StartupSignal>();

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
                cmd.current_dir(&sidecar_frontend_dir);
                // [T-365] 新进程组(组长=sidecar 自身 pid):退出时 killpg 整组带走 node +
                //   Playwright Chrome + ffmpeg 全家;sidecar 侧孤儿自杀也按组清子进程。
                #[cfg(target_os = "macos")]
                {
                    use std::os::unix::process::CommandExt;
                    cmd.process_group(0);
                }
                // [T-445] `--use-bundled-ca` 必须在脚本参数**之前**(node [options] script.js)。
                //   病根:T-437 把 Homebrew 的 openssl(libcrypto/libssl)co-ship 进包解决 dylib 缺失,
                //   但**该 openssl 的默认 CA 路径编译死在 `/opt/homebrew/etc/openssl@3/cert.pem`**;
                //   我们的 node 又是 shared-openssl(`process.config.variables.node_shared_openssl=true`),
                //   于是用户机(没装 Homebrew → 没那个证书文件)上**所有出站 HTTPS 证书验证全失败** →
                //   模型测试"连接失败"、对话"出错了"、检查更新"响应校验未通过"、remote-prompt-bundle
                //   `fetch failed` —— 三位真实用户 2026-07-20 同时报障,而开发机因恰好装了 Homebrew 全绿。
                //   改用 node 内置的 144 个根证书(不依赖任何外部文件)。隔离实证:移走 cert.pem 后
                //   默认 fetch = `unable to get local issuer certificate`,加本标志 = HTTP 200。
                //   (企业自签 CA 场景仍可用 NODE_EXTRA_CA_CERTS 追加,不受影响。)
                cmd.arg("--use-bundled-ca")
                    .arg(&server_js_str)
                    .env("PORT", &port_str)
                    .env("HOSTNAME", "127.0.0.1")
                    .env("CREATOROS_APP_DATA_DIR", &app_data_dir_str)
                    .env("CREATOROS_DB_DIR", &db_dir_str)
                    .env("CREATOROS_BIN_DIR", &bundled_bin_dir_str)
                    .env("CREATOROS_BROWSERS_DIR", &bundled_browsers_dir_str)
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
                    .env(
                        "CREATOROS_LICENSE_PUBLIC_KEY_B64",
                        &license_public_key_b64,
                    )
                    .env(
                        "CREATOROS_FEEDBACK_OFFICIAL_ORIGINS",
                        &feedback_official_origins,
                    )
                    .env("DYLD_LIBRARY_PATH", &lib_dir)
                    .env("LD_LIBRARY_PATH", &lib_dir)
                    // [T-391 H-key] master key **不再走 env 明文**;改经 ChildStdin(fd 0)传。
                    //   仅注入非机密的 fd 号,告诉 node 侧从哪个 fd 读 key(值本身不出现在 env)。
                    .stdin(Stdio::piped())
                    .stdout(Stdio::piped())
                    .stderr(Stdio::piped());
                if master_key.is_some() {
                    cmd.env("CREATOROS_MASTER_KEY_FD", "0");
                }
                if let Some(m) = &machine_id {
                    cmd.env("CREATOROS_MACHINE_ID", m);
                }
                // [T-425] master key 文件兜底通道(非机密:路径 + 反混淆种子)。
                cmd.env("CREATOROS_MASTER_KEY_FILE", &master_key_file_str)
                    .env("CREATOROS_MACHINE_SEED", &master_key_seed);
                // [T-451] verdict-bound token:仅当签发成功才注入(dev/未 CI 构建时私钥缺失即
                //   None,sidecar 走 dev-mode marker 分支)。
                if let Some(t) = &verdict_token {
                    cmd.env("CREATOROS_SIDECAR_VERDICT_TOKEN", t);
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

                // [T-391 H-key] 把 master key(base64)+ 换行经 ChildStdin 写给 sidecar,然后**关闭
                //   stdin(drop → EOF)**,node 侧读到换行/ EOF 即停。写完立即 zeroize 临时明文 buffer。
                if let Some(k) = &master_key {
                    if let Some(mut stdin) = child.stdin.take() {
                        use std::io::Write as _;
                        let mut payload = format!("{}\n", k.expose_secret());
                        if let Err(e) = stdin.write_all(payload.as_bytes()) {
                            eprintln!("[shell] 写 master key 到 sidecar stdin 失败: {e}");
                        }
                        payload.zeroize();
                        // stdin(child.stdin 的 take 出的句柄)在此 drop → 关闭写端 → EOF。
                    }
                }

                // 把 sidecar 的 stdout/stderr 各起线程读:每行 eprintln(dev 可见)+ tee 到 logs/sidecar.log
                // (打包态排障)。两线程各 clone 一份共享 logger(Arc,内部 Mutex 串行化写,不交错坏行)。
                if let Some(out) = child.stdout.take() {
                    let logger = logger.clone();
                    let startup_tx = startup_tx.clone();
                    std::thread::spawn(move || {
                        for line in BufReader::new(out).lines().map_while(Result::ok) {
                            eprintln!("[sidecar] {line}");
                            if let Some(l) = &logger {
                                l.log("sidecar", &line);
                            }
                            if line.contains(SIDECAR_STARTUP_SENTINEL) {
                                let _ = startup_tx.send(StartupSignal::Verified);
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

                let shared_child = std::sync::Arc::new(
                    shared_child::SharedChild::new(child)
                        .expect("接管 creatoros-server sidecar 句柄失败"),
                );
                let watched_child = shared_child.clone();
                let startup_tx_exit = startup_tx.clone();
                std::thread::spawn(move || {
                    let reason = match watched_child.wait() {
                        Ok(status) => format!("sidecar 已退出({status})"),
                        Err(error) => format!("sidecar 退出状态读取失败({error})"),
                    };
                    let _ = startup_tx_exit.send(StartupSignal::Exited(reason));
                });

                // 存句柄供退出 kill(避免 orphan sidecar)。
                handle_state
                    .0
                    .lock()
                    .unwrap()
                    .replace(SidecarChild::Std(shared_child));
            }

            #[cfg(not(target_os = "macos"))]
            {
                let sidecar = app
                    .shell()
                    .sidecar("creatoros-server")
                    .expect("sidecar `creatoros-server` 未在 tauri.conf.json externalBin 注册")
                    // [T-562] verdict 公钥与 Next standalone 资源按 process.cwd() 解析。
                    // 快捷方式启动时 cwd 不可靠，必须固定到随包 frontend 目录。
                    .current_dir(&sidecar_frontend_dir)
                    // [T-445] 同 macOS 分支:用 node 内置根证书,不依赖构建机的 openssl cert.pem
                    //   (Windows 官方 node 多为静态 openssl 自带 CA,加上无害且防同类差异)。
                    //   注意顺序:node [options] script.js —— 标志必须在脚本之前。
                    .args(["--use-bundled-ca", &server_js_str])
                    .env("PORT", &port_str)
                    .env("HOSTNAME", "127.0.0.1")
                    .env("CREATOROS_APP_DATA_DIR", &app_data_dir_str)
                    .env("CREATOROS_DB_DIR", &db_dir_str)
                    .env("CREATOROS_BIN_DIR", &bundled_bin_dir_str)
                    .env("CREATOROS_BROWSERS_DIR", &bundled_browsers_dir_str)
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
                    .env(
                        "CREATOROS_LICENSE_PUBLIC_KEY_B64",
                        &license_public_key_b64,
                    )
                    .env(
                        "CREATOROS_FEEDBACK_OFFICIAL_ORIGINS",
                        &feedback_official_origins,
                    )
                    .env("DYLD_LIBRARY_PATH", &lib_dir)
                    .env("LD_LIBRARY_PATH", &lib_dir);

                // [T-391 H-key] master key **不再走 env 明文**;改经 ChildStdin(fd 0)传(见下方
                //   spawn 后 child.write)。仅注入非机密 fd 号。
                let sidecar = match &master_key {
                    Some(_) => sidecar.env("CREATOROS_MASTER_KEY_FD", "0"),
                    None => sidecar,
                };
                let sidecar = match &machine_id {
                    Some(m) => sidecar.env("CREATOROS_MACHINE_ID", m),
                    None => sidecar,
                };
                // [T-425] master key 文件兜底通道(非机密:路径 + 反混淆种子)。
                let sidecar = sidecar
                    .env("CREATOROS_MASTER_KEY_FILE", &master_key_file_str)
                    .env("CREATOROS_MACHINE_SEED", &master_key_seed);
                // [T-451] verdict-bound token(win/linux 分支;签发失败即 None,不注入)。
                let sidecar = match &verdict_token {
                    Some(t) => sidecar.env("CREATOROS_SIDECAR_VERDICT_TOKEN", t),
                    None => sidecar,
                };

                // [T-259] spawn 失败也落日志再 panic(打包态排障)。
                let (mut rx, mut child) = match sidecar.spawn() {
                    Ok(pair) => pair,
                    Err(e) => {
                        if let Some(l) = &logger {
                            l.log("shell", &format!("spawn creatoros-server sidecar 失败: {e}"));
                        }
                        panic!("启动 creatoros-server sidecar 失败: {e}");
                    }
                };

                // [T-391 H-key] 把 master key(base64)+ 换行经 ChildStdin 写给 sidecar。写完立即
                //   zeroize 临时明文 buffer。注意:tauri-plugin-shell 的 CommandChild 不暴露关闭 stdin
                //   的接口(stdin_writer 私有),故写端保持打开 → node 侧靠**读到换行符**即停(不依赖 EOF)。
                if let Some(k) = &master_key {
                    let mut payload = format!("{}\n", k.expose_secret());
                    if let Err(e) = child.write(payload.as_bytes()) {
                        eprintln!("[shell] 写 master key 到 sidecar stdin 失败: {e}");
                    }
                    payload.zeroize();
                }

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
                let startup_tx_events = startup_tx.clone();
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
                                if s.contains(SIDECAR_STARTUP_SENTINEL) {
                                    let _ = startup_tx_events.send(StartupSignal::Verified);
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
                                let _ = startup_tx_events.send(StartupSignal::Exited(format!(
                                    "sidecar 已退出({payload:?})"
                                )));
                                break;
                            }
                            _ => {}
                        }
                    }
                });
            }

            // 5) 另起线程等就绪：只有 Ready 才导航 sidecar；退出/超时保留静态 splash
            //    并渲染可见失败页。就绪探测跑在后台,不阻塞 setup。
            // [T-259] clone 一份 logger 进线程,sidecar 未就绪也落盘(这是白屏/连不上的头号死因)。
            let ready_logger = logger.clone();
            // [T-372 L2 / T-457] 握手 token 经 window.eval() 注入(不再用 initialization_script
            //   因为窗口在 setup 头部就建好了);token 为 hex,无注入面;前端 handshake-client.ts
            //   读该全局并附到有副作用请求的 x-creatoros-handshake 头。
            let sidecar_url = format!("http://127.0.0.1:{port}/");
            let startup_logs_dir = log_dir_str.clone();
            // [T-457/T-562] **不再建新窗** —— setup 头部已建静态 splash 窗口,
            //   这里从 handle 里拿回来,先在 window 上 eval 注入最新 handshake token,
            //   再 navigate 到真 sidecar 页。原实现在这里才建窗 → 首启解压期间无窗口。
            // [T-457] handshake token 已在 setup 头部一并注入 initialization_script,navigate
            //   到 sidecar 页时 init_script 会重跑 → token 常驻 window。这里无需再 eval 注入。
            let main_win = handle
                .get_webview_window("main")
                .expect("[T-457] main window 缺失 —— setup 头部已建过怎会失踪?");
            std::thread::spawn(move || {
                let outcome =
                    wait_until_ready(port, Duration::from_secs(60), startup_rx);
                match outcome {
                    StartupWaitOutcome::Ready => match sidecar_url.parse::<tauri::Url>() {
                        Ok(u) => {
                            let win2 = main_win.clone();
                            let _ = main_win.run_on_main_thread(move || {
                                if let Err(e) = win2.navigate(u) {
                                    eprintln!("[shell] navigate 到 sidecar 失败: {e}");
                                }
                            });
                        }
                        Err(e) => eprintln!("[shell] sidecar url 解析失败: {e}"),
                    },
                    StartupWaitOutcome::Exited(reason) => {
                        let detail = format!(
                            "本地服务未能完成启动，应用已停止继续加载。\n数据没有丢失。\n\n技术信息：{reason}"
                        );
                        let script = startup_failure_script(
                            "CreatorOS 启动失败",
                            &detail,
                            &startup_logs_dir,
                        );
                        if let Some(l) = &ready_logger {
                            l.log("shell", &format!("sidecar 启动前退出: {reason}"));
                        }
                        let win2 = main_win.clone();
                        let _ = main_win.run_on_main_thread(move || {
                            let _ = win2.eval(&script);
                        });
                    }
                    StartupWaitOutcome::TimedOut => {
                        let detail =
                            "本地服务在 60 秒内没有完成启动，应用已停止继续加载。\n数据没有丢失。";
                        let script = startup_failure_script(
                            "CreatorOS 启动超时",
                            detail,
                            &startup_logs_dir,
                        );
                        if let Some(l) = &ready_logger {
                            l.log(
                                "shell",
                                "sidecar 60s 内未就绪，保留启动失败页，不导航死端口",
                            );
                        }
                        let win2 = main_win.clone();
                        let _ = main_win.run_on_main_thread(move || {
                            let _ = win2.eval(&script);
                        });
                    }
                    StartupWaitOutcome::Pending => {
                        unreachable!("wait_until_ready 不返回 Pending")
                    }
                }
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

    #[test]
    fn windows_旧缓存清理只删_runtime_不碰_db_和_auth() {
        let app_data = temp_runtime_root("legacy-root");
        std::fs::create_dir_all(app_data.join("runtime").join("0.1.0").join("sidecar"))
            .unwrap();
        std::fs::create_dir_all(app_data.join("db")).unwrap();
        std::fs::create_dir_all(app_data.join(".auth")).unwrap();
        std::fs::write(app_data.join("db").join("data"), "keep").unwrap();
        std::fs::write(app_data.join(".master-key"), "keep").unwrap();

        assert!(super::cleanup_legacy_runtime_root(&app_data));
        assert!(!app_data.join("runtime").exists());
        assert!(app_data.join("db").join("data").exists());
        assert!(app_data.join(".auth").exists());
        assert!(app_data.join(".master-key").exists());
        let _ = std::fs::remove_dir_all(&app_data);
    }

    #[test]
    fn sidecar_入口哈希匹配通过_篡改后拒绝() {
        let root = temp_runtime_root("entry-hash");
        let entry = root.join("server.js");
        std::fs::write(&entry, "hello").unwrap();
        let hello_sha = "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824";
        assert!(super::verify_file_sha256(&entry, hello_sha, "sidecar 入口").is_ok());
        std::fs::write(&entry, "tampered").unwrap();
        assert!(super::verify_file_sha256(&entry, hello_sha, "sidecar 入口").is_err());
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn windows_安装目录展开资源关键结构与入口哈希都必须通过() {
        let root = temp_runtime_root("direct-runtime");
        std::fs::create_dir_all(root.join("frontend").join(".next")).unwrap();
        std::fs::create_dir_all(root.join("frontend").join("node_modules")).unwrap();
        std::fs::create_dir_all(root.join("backend").join("drizzle").join("meta")).unwrap();
        std::fs::write(root.join("frontend").join("server.js"), "hello").unwrap();
        std::fs::write(
            root.join("backend")
                .join("drizzle")
                .join("meta")
                .join("_journal.json"),
            "{}",
        )
        .unwrap();
        let hello_sha = "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824";
        assert!(super::verify_direct_sidecar_dir_with_hash(&root, hello_sha).is_ok());
        std::fs::remove_file(
            root.join("backend")
                .join("drizzle")
                .join("meta")
                .join("_journal.json"),
        )
        .unwrap();
        assert!(super::verify_direct_sidecar_dir_with_hash(&root, hello_sha).is_err());
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn windows_安装期指针只解析安装目录内已校验_runtime() {
        let install_dir = temp_runtime_root("installed-runtime-pointer");
        let sidecar = install_dir
            .join("runtime-images")
            .join("0.1.0-abc123")
            .join("sidecar");
        std::fs::create_dir_all(sidecar.join("frontend").join(".next")).unwrap();
        std::fs::create_dir_all(sidecar.join("frontend").join("node_modules")).unwrap();
        std::fs::create_dir_all(sidecar.join("backend").join("drizzle").join("meta")).unwrap();
        std::fs::write(sidecar.join("frontend").join("server.js"), "hello").unwrap();
        std::fs::write(
            sidecar
                .join("backend")
                .join("drizzle")
                .join("meta")
                .join("_journal.json"),
            "{}",
        )
        .unwrap();
        std::fs::write(
            install_dir
                .join("runtime-images")
                .join("runtime-current.txt"),
            "0.1.0-abc123\n",
        )
        .unwrap();

        let hello_sha = "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824";
        assert_eq!(
            super::resolve_installed_runtime_with_hash(&install_dir, hello_sha).unwrap(),
            Some(sidecar)
        );
        let _ = std::fs::remove_dir_all(&install_dir);
    }

    #[test]
    fn windows_runtime_指针拒绝目录穿越() {
        let install_dir = temp_runtime_root("installed-runtime-traversal");
        std::fs::create_dir_all(install_dir.join("runtime-images")).unwrap();
        std::fs::write(
            install_dir
                .join("runtime-images")
                .join("runtime-current.txt"),
            "../outside\n",
        )
        .unwrap();

        assert!(
            super::resolve_installed_runtime_with_hash(&install_dir, "unused").is_err()
        );
        let _ = std::fs::remove_dir_all(&install_dir);
    }

    #[test]
    fn windows_runtime_原子更新_current_不伪造跨版本_previous() {
        let install_dir = temp_runtime_root("installed-runtime-switch");
        let runtime_root = install_dir.join("runtime-images");
        std::fs::create_dir_all(&runtime_root).unwrap();
        std::fs::write(runtime_root.join("runtime-current.txt"), "old-runtime\n").unwrap();

        super::write_windows_runtime_pointer(&runtime_root, "new-runtime").unwrap();

        assert_eq!(
            std::fs::read_to_string(runtime_root.join("runtime-current.txt")).unwrap(),
            "new-runtime\n"
        );
        assert!(!runtime_root.join("runtime-previous.txt").exists());
        let _ = std::fs::remove_dir_all(&install_dir);
    }

    #[test]
    fn windows_runtime_升级清理只保留_current() {
        let install_dir = temp_runtime_root("installed-runtime-cleanup");
        let runtime_root = install_dir.join("runtime-images");
        for id in ["current", "previous", "stale-a", "stale-b"] {
            std::fs::create_dir_all(runtime_root.join(id).join("sidecar")).unwrap();
        }
        std::fs::create_dir_all(runtime_root.join(".staging")).unwrap();
        std::fs::write(runtime_root.join("runtime-current.txt"), "current\n").unwrap();
        std::fs::write(runtime_root.join("runtime-previous.txt"), "previous\n").unwrap();

        assert_eq!(super::cleanup_windows_runtime_versions(&runtime_root), 3);
        assert!(runtime_root.join("current").exists());
        assert!(!runtime_root.join("previous").exists());
        assert!(!runtime_root.join("stale-a").exists());
        assert!(!runtime_root.join("stale-b").exists());
        assert!(!runtime_root.join(".staging").exists());
        let _ = std::fs::remove_dir_all(&install_dir);
    }

    #[test]
    fn windows_主动卸载使用_rust_清理深层_runtime() {
        let install_dir = temp_runtime_root("installed-runtime-uninstall");
        let deep_runtime = install_dir
            .join("runtime-images")
            .join("0.2.0-test")
            .join("sidecar")
            .join("frontend")
            .join("node_modules")
            .join(".pnpm")
            .join("a".repeat(96))
            .join("node_modules")
            .join("b".repeat(96));
        std::fs::create_dir_all(&deep_runtime).unwrap();
        std::fs::write(deep_runtime.join("server.js"), "ready").unwrap();

        super::remove_windows_installed_runtime(&install_dir).unwrap();

        assert!(!install_dir.join("runtime-images").exists());
        let _ = std::fs::remove_dir_all(&install_dir);
    }

    #[test]
    fn 原子解压失败不留下最终目录或完成标记() {
        let root = temp_runtime_root("extract-failure");
        let missing_tar = root.join("missing.tar.gz");
        let dest = root.join("0.1.0").join("sidecar");
        let result = super::extract_sidecar_tarball(&missing_tar, &dest, "sha256:missing");
        assert!(result.is_err());
        assert!(!dest.exists());
        assert!(!dest.join(".tarball-stamp").exists());
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn 原子解压成功后写完成标记_同一版本二次直接复用() {
        let root = temp_runtime_root("extract-success");
        let source = root.join("source");
        std::fs::create_dir_all(source.join("frontend")).unwrap();
        std::fs::write(source.join("frontend").join("server.js"), "ready").unwrap();
        let tarball = root.join("sidecar.tar.gz");
        let file = std::fs::File::create(&tarball).unwrap();
        let encoder =
            flate2::write::GzEncoder::new(file, flate2::Compression::default());
        let mut builder = tar::Builder::new(encoder);
        builder.append_dir_all(".", &source).unwrap();
        builder.into_inner().unwrap().finish().unwrap();

        let dest = root.join("runtime").join("0.1.0").join("sidecar");
        assert_eq!(
            super::extract_sidecar_tarball(&tarball, &dest, "sha256:test").unwrap(),
            true
        );
        assert_eq!(
            std::fs::read_to_string(dest.join("frontend").join("server.js")).unwrap(),
            "ready"
        );
        assert_eq!(
            std::fs::read_to_string(dest.join(".tarball-stamp")).unwrap(),
            "sha256:test"
        );
        assert_eq!(
            super::extract_sidecar_tarball(&tarball, &dest, "sha256:test").unwrap(),
            false
        );
        let _ = std::fs::remove_dir_all(&root);
    }
}

// ───────────────────────────────────────────────────────────────────────────
// [T-391] 单测(TDD,见 SPEC §12)。纯函数为主,不真联网/不真起 sidecar。
// ───────────────────────────────────────────────────────────────────────────
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn startup_failure_script_escapes_dynamic_text_and_exposes_no_fake_action() {
        let script = startup_failure_script(
            "本地服务启动失败",
            "原因: \"sidecar\" </script>",
            "/Users/test/Library/Application Support/CreatorOS/logs",
        );
        assert!(script.contains("__creatorosSplashFailure"));
        assert!(script.contains("\\\"sidecar\\\""));
        assert!(!script.contains("</script>"));
        assert!(!script.contains("location.href"));
        assert!(!script.contains("location.reload"));
        assert!(SPLASH_HTML.contains("plugin:opener|reveal_item_in_dir"));
        assert!(SPLASH_HTML.contains("打开诊断日志目录"));
        assert!(SIDECAR_STARTUP_SENTINEL.contains("SIDECAR_STARTUP_VERIFIED"));
    }

    #[test]
    fn startup_wait_outcome_prioritizes_ready_then_exit_then_timeout() {
        assert_eq!(
            classify_startup_probe(true, true, Some("exit 1"), true),
            StartupWaitOutcome::Exited("exit 1".to_string())
        );
        assert_eq!(
            classify_startup_probe(false, false, Some("exit 1"), false),
            StartupWaitOutcome::Exited("exit 1".to_string())
        );
        assert_eq!(
            classify_startup_probe(true, false, None, false),
            StartupWaitOutcome::Pending,
            "只有 TCP 监听、尚未收到 instrumentation 哨兵时不能导航"
        );
        assert_eq!(
            classify_startup_probe(true, true, None, false),
            StartupWaitOutcome::Ready
        );
        assert_eq!(
            classify_startup_probe(false, false, None, true),
            StartupWaitOutcome::TimedOut
        );
        assert_eq!(
            classify_startup_probe(false, false, None, false),
            StartupWaitOutcome::Pending
        );
    }

    // 一个合法的 32B key 的 base64(测试用)。
    fn sample_key_b64() -> String {
        base64::engine::general_purpose::STANDARD.encode([7u8; 32])
    }

    // ── H-key:.master-key 混淆文件往返 ──────────────────────────────────────

    #[test]
    fn master_key_file_obfuscate_roundtrip() {
        let key = sample_key_b64();
        let nonce = [3u8; 16];
        let stored = obfuscate_master_key_file(&key, "machine-abc", &nonce);
        assert!(stored.starts_with("v2:"), "应带 v2: 前缀: {stored}");
        let back = deobfuscate_master_key_file(&stored, "machine-abc").unwrap();
        assert_eq!(back, key, "同机 seed 应能还原原 key");
    }

    #[test]
    fn master_key_file_not_plaintext_on_disk() {
        // 混淆后落盘内容里**不得**出现明文 base64 key(灭 strings/grep 静态靶点)。
        let key = sample_key_b64();
        let nonce = [9u8; 16];
        let stored = obfuscate_master_key_file(&key, "machine-abc", &nonce);
        assert!(!stored.contains(&key), "明文 key 泄露到落盘内容: {stored}");
    }

    #[test]
    fn master_key_file_wrong_machine_seed_does_not_recover() {
        // 换机(不同 machine_seed)→ 解出的不是原 key(诚实:换机不可解,由 keychain/重建兜)。
        let key = sample_key_b64();
        let nonce = [1u8; 16];
        let stored = obfuscate_master_key_file(&key, "machine-A", &nonce);
        let wrong = deobfuscate_master_key_file(&stored, "machine-B");
        // 要么解不出合法 utf8/长度,要么解出的与原 key 不同 —— 反正不等于原 key。
        assert_ne!(wrong.as_deref(), Some(key.as_str()));
    }

    #[test]
    fn master_key_file_random_nonce_differs() {
        let key = sample_key_b64();
        let a = obfuscate_master_key_file(&key, "m", &[1u8; 16]);
        let b = obfuscate_master_key_file(&key, "m", &[2u8; 16]);
        assert_ne!(a, b, "不同 nonce 应产不同密文");
    }

    #[test]
    fn master_key_file_legacy_plaintext_passthrough() {
        // 无 v2: 前缀 = 存量明文老格式 → 原样返回(迁移路径,不锁死已装用户)。
        let key = sample_key_b64();
        let back = deobfuscate_master_key_file(&key, "any-seed").unwrap();
        assert_eq!(back, key);
    }

    // ── H-mac:codesign 输出解读(注入 fake 状态)────────────────────────────

    #[cfg(target_os = "macos")]
    #[test]
    fn interpret_codesign_unsigned() {
        let out = "test-exe: code object is not signed at all";
        assert_eq!(interpret_codesign(false, out), SelfSignature::Unsigned);
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn interpret_codesign_signed_valid_with_team() {
        let out = "Identifier=cloud.aitongban.creatoros\nTeamIdentifier=ABCDE12345\nAuthority=Developer ID Application: Foo\n";
        assert_eq!(
            interpret_codesign(true, out),
            SelfSignature::Signed {
                team_id: Some("ABCDE12345".to_string()),
                valid: true,
            }
        );
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn interpret_codesign_signed_but_invalid() {
        // 有签名迹象(Authority)但 --verify 失败 → Signed{valid:false}(被篡改的签名构建)。
        let out = "Authority=Apple Development: Foo\nTeamIdentifier=not set\n";
        match interpret_codesign(false, out) {
            SelfSignature::Signed { valid, team_id } => {
                assert!(!valid);
                assert_eq!(team_id, None, "'not set' 应被过滤为 None");
            }
            other => panic!("期望 Signed{{valid:false}},得到 {other:?}"),
        }
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn interpret_codesign_unknown() {
        // 无任何签名迹象、也没明说未签名 → Unknown(保守,不硬拦)。
        assert_eq!(interpret_codesign(false, "garbage output"), SelfSignature::Unknown);
    }

    // ── H-mac:entitlements plist 内容硬约束(SPEC §6 / §13.4)──────────────

    #[test]
    fn entitlements_excludes_dangerous_keys() {
        // entitlements.plist **不得**含 disable-library-validation / get-task-allow。
        let plist = include_str!("../entitlements.plist");
        assert!(
            !plist.contains("<key>com.apple.security.cs.disable-library-validation</key>"),
            "entitlements 不该关 library validation"
        );
        assert!(
            !plist.contains("<key>com.apple.security.cs.get-task-allow</key>"),
            "entitlements 不该含 get-task-allow(debug entitlement)"
        );
    }
}
