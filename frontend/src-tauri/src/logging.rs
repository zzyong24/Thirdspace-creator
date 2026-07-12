//! T-259 桌面日志系统 —— sidecar stdout/stderr tee 落盘 + 脱敏 + 轮转。
//!
//! 背景:打包 app 的 sidecar 日志此前只 `eprintln!` 给 app stderr,`open -a` 打包态
//! 全丢 —— 真实用户撞 bug(如 favorites ZodError)开发者拿不到日志没法排障。sidecar 的
//! stderr 管道能抓到 Next.js 未捕获错误,故在 Rust 读取循环处**同时** tee 到
//! `appDataDir/logs/sidecar.log` 是最全的捕获点。
//!
//! 本模块提供三件事,均为可单测的纯逻辑 + 薄封装:
//!   ① [`redact_log_line`] —— 落盘前对每行过一遍脱敏(遮机密,master key / cookie /
//!      token / authorization 等绝不明文落日志);纯函数,大量单测覆盖各机密模式。
//!   ② [`format_rfc3339_utc`] —— 无第三方 time 依赖的 UTC RFC3339 时间戳(civil-from-days
//!      算法);每行日志带 `[时间戳] [通道]` 前缀。
//!   ③ [`SidecarLogger`] + [`init_sidecar_logger`] —— 共享写入器(`Arc<Mutex<BufWriter>>`,
//!      两读取线程 clone 同一把,Mutex 串行化写,避免交错写坏行)+ 启动轮转
//!      (`sidecar.log` → `sidecar.prev.log`,只留当前 + 上一次会话两份,防无限增长)。

use std::fs::{self, File, OpenOptions};
use std::io::{BufWriter, Write};
use std::path::Path;
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

// ---------------------------------------------------------------------------
// SidecarLogger —— 共享写入器(两读取线程 clone 同一把)
// ---------------------------------------------------------------------------

/// 共享日志写入器。stdout / stderr 两个读取线程 clone 同一把 `Arc`,内部 `Mutex`
/// 串行化写入(避免两线程交错写坏行)。每行写完立刻 `flush` —— 排障场景「崩溃时最后
/// 几行也要落盘」比吞吐更重要,故不留缓冲在内存里。
#[derive(Clone)]
pub struct SidecarLogger {
    inner: Arc<Mutex<BufWriter<File>>>,
}

impl SidecarLogger {
    /// 写一行:`[RFC3339] [channel] <脱敏后的行>\n`。
    /// channel 形如 `sidecar`(stdout)/ `sidecar:err`(stderr)/ `shell`(Rust 侧关键事件)。
    /// 锁中毒或写失败一律吞掉(日志是 best-effort,绝不因落盘失败拖垮主流程)。
    pub fn log(&self, channel: &str, line: &str) {
        let stamped = format!(
            "[{}] [{}] {}\n",
            format_rfc3339_utc_now(),
            channel,
            redact_log_line(line)
        );
        if let Ok(mut w) = self.inner.lock() {
            let _ = w.write_all(stamped.as_bytes());
            let _ = w.flush();
        }
    }
}

/// 初始化 sidecar 日志:建 `logs/` 目录 → 轮转上次会话 → 开新 `sidecar.log`。
///
/// 轮转策略(防无限增长,只留两份):每次 app 启动把上次的 `sidecar.log` 改名
/// `sidecar.prev.log`(覆盖更旧的 prev),再全新开 `sidecar.log`。这样磁盘上永远只有
/// 「本次会话 + 上一次会话」两份日志。
///
/// 失败(建目录 / 开文件不了)→ 返回 `None`,调用方降级为**仅 `eprintln!`**(不落盘但
/// 不崩,诚实降级)。
pub fn init_sidecar_logger(logs_dir: &Path) -> Option<SidecarLogger> {
    if let Err(e) = fs::create_dir_all(logs_dir) {
        eprintln!("[shell] 建日志目录失败 {}: {e}", logs_dir.display());
        return None;
    }
    let current = logs_dir.join("sidecar.log");
    let prev = logs_dir.join("sidecar.prev.log");
    // 轮转:上次会话的 sidecar.log → sidecar.prev.log(先删更旧的 prev 再改名)。
    if current.exists() {
        let _ = fs::remove_file(&prev);
        let _ = fs::rename(&current, &prev);
    }
    // truncate:即便上面的 rename 失败(current 仍在),也保证本次会话从空文件起(不追加旧内容)。
    match OpenOptions::new()
        .create(true)
        .write(true)
        .truncate(true)
        .open(&current)
    {
        Ok(file) => Some(SidecarLogger {
            inner: Arc::new(Mutex::new(BufWriter::new(file))),
        }),
        Err(e) => {
            eprintln!("[shell] 开日志文件失败 {}: {e}", current.display());
            None
        }
    }
}

// ---------------------------------------------------------------------------
// 脱敏(best-effort 纯函数)
// ---------------------------------------------------------------------------

/// 机密关键词命中后紧随其后的「值」用 `***REDACTED***` 遮盖。分两档:
///   · **tier1(always)**:高信号关键词(authorization / cookie / sessionid / password /
///     master_key / bearer / api_key / access_token …)→ 值无论长短一律遮(cookie/JWT 都不长也危险)。
///   · **tier2(仅长串)**:泛化关键词(token / secret / key / credential)→ 仅当值是 ≥32 位
///     的 hex/base64 串时才遮 —— 避免误遮 `"tokens": 1523`(LLM token 计数)这类正常日志。
///
/// 关键词按「长度降序」匹配以优先命中更具体的(`access_token` 优先于 `token`)。要求关键词
/// 前后都是**词边界**(非 `[A-Za-z0-9]`),避免 `mytoken` / `tokens` 这类子串误命中。
///
/// 铁律:宁可多遮不可泄露;但对泛化词做了长串约束以保日志可读性。master key 明文由「上游
/// 从不打印 key 值」+ 本函数对 `master_key=` 值兜底双保险。
const TIER1_KEYWORDS: &[&str] = &[
    "authorization",
    "proxy-authorization",
    "set-cookie",
    "cookie",
    "sessionid",
    "session_id",
    "session-id",
    "x-api-key",
    "api_key",
    "api-key",
    "apikey",
    "access_token",
    "access-token",
    "refresh_token",
    "refresh-token",
    "id_token",
    "password",
    "passwd",
    "pwd",
    "master_key",
    "master-key",
    "masterkey",
    "secret_key",
    "secret-key",
    "private_key",
    "private-key",
    "bearer",
];

const TIER2_KEYWORDS: &[&str] = &["credential", "secret", "token", "key"];

/// 认证方案前缀:`Authorization: Bearer <jwt>` 里,值以 `Bearer ` 打头,真正的机密在其后。
/// 命中关键词后跳过这些前缀词(连同其后的分隔符),再对真正的值遮盖,避免只遮了 `Bearer`
/// 却把 JWT 明文留下。
const SCHEME_PREFIXES: &[&str] = &["bearer", "basic", "token"];

/// 词边界判定:ASCII 字母 / 数字算「词内」,其余(含 `_`、`-`、`:`、空格、多字节 UTF-8 起始/续
/// 字节 ≥0x80)都算边界。用 ASCII 判定即可 —— 关键词全 ASCII,中文等多字节字符每个字节都 ≥0x80,
/// 绝不与 ASCII 关键词碰撞。
fn is_word_byte(b: u8) -> bool {
    b.is_ascii_alphanumeric()
}

/// key 与 value 之间的分隔符(冒号 / 等号 / 空格 / 引号 / tab)。遮盖前先跳过这些并原样保留。
fn is_separator(b: u8) -> bool {
    matches!(b, b':' | b'=' | b' ' | b'\t' | b'"' | b'\'')
}

/// 值的终止符:遇到这些即认为一个机密值结束(空白 / 分号 / 逗号 / 引号 / 括号等)。
/// 其余(含 `.` `/` `+` `-` `_` `=`)都算值的一部分 —— 这样 JWT(含 `.`)、base64(含 `+/=`)
/// 会被完整消费遮掉。
fn is_value_terminator(b: u8) -> bool {
    matches!(
        b,
        b' ' | b'\t'
            | b'\n'
            | b'\r'
            | b';'
            | b','
            | b'"'
            | b'\''
            | b'&'
            | b')'
            | b'('
            | b'}'
            | b'{'
            | b']'
            | b'['
            | b'<'
            | b'>'
            | b'|'
            | b'`'
    )
}

/// 在 `bytes[i..]` 起点尝试匹配一个关键词(ASCII 大小写不敏感 + 前后词边界)。
/// 返回 `(关键词字节长度, always_mask)`;取「最长匹配」以优先更具体的关键词。
fn match_keyword_at(bytes: &[u8], i: usize) -> Option<(usize, bool)> {
    // 前边界:i==0 或前一字节非词内字节。
    if i > 0 && is_word_byte(bytes[i - 1]) {
        return None;
    }
    let mut best: Option<(usize, bool)> = None;
    for (kw, always) in TIER1_KEYWORDS
        .iter()
        .map(|k| (*k, true))
        .chain(TIER2_KEYWORDS.iter().map(|k| (*k, false)))
    {
        let kb = kw.as_bytes();
        let end = i + kb.len();
        if end > bytes.len() {
            continue;
        }
        // ASCII 大小写不敏感逐字节比较。
        if !bytes[i..end]
            .iter()
            .zip(kb)
            .all(|(a, b)| a.eq_ignore_ascii_case(b))
        {
            continue;
        }
        // 后边界:关键词后一字节非词内字节(排除 `tokens` 命中 `token`)。
        if end < bytes.len() && is_word_byte(bytes[end]) {
            continue;
        }
        // 取最长匹配(access_token 优先 token)。
        if best.map(|(len, _)| kb.len() > len).unwrap_or(true) {
            best = Some((kb.len(), always));
        }
    }
    best
}

/// 判断某个值是否该在 tier2(泛化关键词)下遮盖:值是 ≥32 位、且全为 hex/base64 允许字符
/// (`A-Za-z0-9 + / = _ -`)的串才算机密,否则放行(保住 `token: 3` 这类正常日志)。
fn is_long_secret_value(val: &[u8]) -> bool {
    val.len() >= 32
        && val
            .iter()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'+' | b'/' | b'=' | b'_' | b'-'))
}

/// 尝试在 `bytes[j..]` 跳过一个认证方案前缀词(如 `Bearer`)+ 其后分隔符;返回跳过后的新位置。
/// 未命中前缀 → 原样返回 j。命中的前缀词与分隔符会被 append 到 `out`(原样保留,不遮)。
fn skip_scheme_prefix(bytes: &[u8], mut j: usize, out: &mut Vec<u8>) -> usize {
    for scheme in SCHEME_PREFIXES {
        let sb = scheme.as_bytes();
        let end = j + sb.len();
        if end <= bytes.len()
            && bytes[j..end].iter().zip(sb).all(|(a, b)| a.eq_ignore_ascii_case(b))
            && (end == bytes.len() || !is_word_byte(bytes[end]))
        {
            out.extend_from_slice(&bytes[j..end]);
            j = end;
            while j < bytes.len() && is_separator(bytes[j]) {
                out.push(bytes[j]);
                j += 1;
            }
            return j;
        }
    }
    j
}

/// 脱敏纯函数:遮盖行内机密值,返回脱敏后的新串。见 [`TIER1_KEYWORDS`] / [`TIER2_KEYWORDS`] 档位说明。
/// 无副作用、无 I/O —— 可单测(见文件底部 `mod tests`)。
pub fn redact_log_line(line: &str) -> String {
    let bytes = line.as_bytes();
    let mut out: Vec<u8> = Vec::with_capacity(bytes.len() + 16);
    let mut i = 0;
    while i < bytes.len() {
        if let Some((kw_len, always)) = match_keyword_at(bytes, i) {
            // ① 原样拷贝关键词本身。
            out.extend_from_slice(&bytes[i..i + kw_len]);
            let mut j = i + kw_len;
            // ② 跳过 key/value 分隔符(原样保留)。
            while j < bytes.len() && is_separator(bytes[j]) {
                out.push(bytes[j]);
                j += 1;
            }
            // ③ 跳过认证方案前缀(如 Bearer),原样保留,让真正的值暴露给下一步。
            j = skip_scheme_prefix(bytes, j, &mut out);
            // ④ 提取值 run:消费到下一个终止符(或行尾)。终止符全是 ASCII(<0x80),而 UTF-8 多字节
            //   字符的每个字节都 ≥0x80,故循环只会停在 ASCII 终止符或行尾 —— 都是字符边界,不会切坏
            //   多字节字符;值里含中文/多字节也会被整段消费遮盖(宁可多遮)。
            let val_start = j;
            let mut k = j;
            while k < bytes.len() && !is_value_terminator(bytes[k]) {
                k += 1;
            }
            let val = &bytes[val_start..k];
            if !val.is_empty() && (always || is_long_secret_value(val)) {
                out.extend_from_slice(b"***REDACTED***");
            } else {
                out.extend_from_slice(val);
            }
            i = k;
        } else {
            out.push(bytes[i]);
            i += 1;
        }
    }
    // out 始终是合法 UTF-8(只在 ASCII 边界切割 + 遮盖串是 ASCII),lossy 只作兜底。
    String::from_utf8_lossy(&out).into_owned()
}

// ---------------------------------------------------------------------------
// RFC3339 时间戳(无第三方 time 依赖)
// ---------------------------------------------------------------------------

/// 当前时刻的 UTC RFC3339 串(用 `SystemTime`)。时钟异常(早于 epoch)→ 兜底 epoch。
fn format_rfc3339_utc_now() -> String {
    let dur = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    format_rfc3339_utc(dur.as_secs(), dur.subsec_millis())
}

/// 把 Unix 秒 + 毫秒格式化成 UTC RFC3339:`YYYY-MM-DDTHH:MM:SS.mmmZ`。
/// 用 Howard Hinnant 的 civil-from-days 算法(无闰秒、格里高利历),纯计算、可单测。
pub fn format_rfc3339_utc(secs: u64, millis: u32) -> String {
    let days = (secs / 86_400) as i64;
    let rem = secs % 86_400;
    let (y, m, d) = civil_from_days(days);
    let hh = rem / 3_600;
    let mm = (rem % 3_600) / 60;
    let ss = rem % 60;
    format!("{y:04}-{m:02}-{d:02}T{hh:02}:{mm:02}:{ss:02}.{millis:03}Z")
}

/// days(自 1970-01-01 起的天数)→ (year, month[1..12], day[1..31])。
/// 参考 http://howardhinnant.github.io/date_algorithms.html#civil_from_days
fn civil_from_days(z: i64) -> (i64, u32, u32) {
    let z = z + 719_468;
    let era = (if z >= 0 { z } else { z - 146_096 }) / 146_097;
    let doe = (z - era * 146_097) as i64; // [0, 146096]
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365; // [0, 399]
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100); // [0, 365]
    let mp = (5 * doy + 2) / 153; // [0, 11]
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32; // [1, 31]
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32; // [1, 12]
    (if m <= 2 { y + 1 } else { y }, m, d)
}

// ---------------------------------------------------------------------------
// 单测
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn redact_authorization_bearer_jwt() {
        // Authorization: Bearer <jwt> —— Bearer 前缀保留,JWT(含 `.`)被完整遮盖。
        let out = redact_log_line(
            "GET /x Authorization: Bearer eyJhbGciOi.eyJzdWIiOiIxIn0.SflKxwRJ done",
        );
        assert!(out.contains("Bearer ***REDACTED***"), "got: {out}");
        assert!(!out.contains("eyJhbGciOi"), "JWT 泄露: {out}");
        assert!(out.contains("done"));
    }

    #[test]
    fn redact_cookie_and_sessionid() {
        let out = redact_log_line("Cookie: sessionid=abc123def; other=keep");
        assert!(!out.contains("abc123def"), "cookie 值泄露: {out}");
        assert!(out.contains("Cookie"));
    }

    #[test]
    fn redact_standalone_sessionid() {
        let out = redact_log_line("set sessionid=SECRET_SESSION_VALUE now");
        assert!(!out.contains("SECRET_SESSION_VALUE"), "got: {out}");
        assert!(out.contains("now"));
    }

    #[test]
    fn redact_master_key_env() {
        // CREATOROS_MASTER_KEY=<b64> —— master_key 是 tier1,值一律遮。
        let out = redact_log_line("env CREATOROS_MASTER_KEY=aGVsbG8gd29ybGQgc2VjcmV0Cg== spawned");
        assert!(!out.contains("aGVsbG8gd29ybGQ"), "master key 泄露: {out}");
        assert!(out.contains("spawned"));
    }

    #[test]
    fn redact_api_key_and_token() {
        let out = redact_log_line("api_key=sk-1234567890 access_token=tok_ABCDEFG end");
        assert!(!out.contains("sk-1234567890"), "api_key 泄露: {out}");
        assert!(!out.contains("tok_ABCDEFG"), "access_token 泄露: {out}");
        assert!(out.contains("end"));
    }

    #[test]
    fn keep_token_count_not_secret() {
        // 泛化词 token,值是短数字 → 不遮(保住 LLM token 计数日志可读)。
        let out = redact_log_line(r#"usage: {"tokens": 1523, "cost": 0.02}"#);
        assert!(out.contains("1523"), "误遮了 token 计数: {out}");
    }

    #[test]
    fn redact_long_secret_after_generic_key() {
        // 泛化词 key,值是 ≥32 位 hex → 遮。
        let long = "a".repeat(40);
        let out = redact_log_line(&format!("key={long} tail"));
        assert!(!out.contains(&long), "长机密未遮: {out}");
        assert!(out.contains("tail"));
    }

    #[test]
    fn keep_short_value_after_generic_key() {
        // 泛化词 key,值短 → 不遮(避免误遮 `key: value` 普通日志)。
        let out = redact_log_line("map key=name value=foo");
        assert!(out.contains("name"), "误遮短值: {out}");
    }

    #[test]
    fn keyword_needs_word_boundary() {
        // `mytoken` / `tokens` 不应命中 token。
        let out = redact_log_line("mytoken tokens=1523 brokenkey=x");
        assert!(out.contains("mytoken"));
        assert!(out.contains("1523"), "tokens 误命中: {out}");
    }

    #[test]
    fn redact_preserves_chinese() {
        // 含中文(多字节)行脱敏后仍合法可读,机密仍被遮。
        let out = redact_log_line("中文日志 password=超级密码secret123456 结束");
        assert!(out.contains("中文日志"));
        assert!(out.contains("结束"));
        assert!(!out.contains("超级密码secret123456"), "got: {out}");
    }

    #[test]
    fn redact_no_keyword_is_identity() {
        let line = "[sidecar] Next.js ZodError at /api/favorites line 42";
        assert_eq!(redact_log_line(line), line);
    }

    #[test]
    fn rfc3339_epoch() {
        assert_eq!(format_rfc3339_utc(0, 0), "1970-01-01T00:00:00.000Z");
    }

    #[test]
    fn rfc3339_y2k() {
        // 2000-01-01T00:00:00Z = 946684800(闰年边界前一天),外加 500ms。
        assert_eq!(
            format_rfc3339_utc(946_684_800, 500),
            "2000-01-01T00:00:00.500Z"
        );
    }

    #[test]
    fn rfc3339_known_datetime() {
        // 2021-03-01T12:34:56Z = 1614602096(验证月/日/时分秒 + 闰年 2 月后进位)。
        assert_eq!(
            format_rfc3339_utc(1_614_602_096, 0),
            "2021-03-01T12:34:56.000Z"
        );
    }
}
