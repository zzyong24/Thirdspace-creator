//! T-391 H-log 开发者侧日志解密 CLI(不进分发包)。
//!
//! 用法:
//!   creatoros-logdec --key <私钥文件> <sidecar.log.enc>        # 解密 → stdout
//!   creatoros-logdec encrypt --pubkey <公钥b64> <明文.txt> <输出.enc>   # (dev/test)造加密夹具
//!
//! 私钥/公钥文件 = `creatoros-logkeygen` 产出的 base64(32B raw)。解密按 HEADER 里的 key_id 匹配
//! 私钥 → ECDH+HKDF 解 session_key → 逐帧解;**尾部截断/损坏时输出已解全部行并正常退出(码 0)**;
//! **私钥不匹配/缺失 → 0 字节输出、退出码 1**(验收 §13.1/§13.3)。
//!
//! 复用 `logging.rs` 的封包/解包逻辑(`#[path]` 内联同一源文件 = 封包格式单一真相,与 app 零漂移)。

#[path = "../logging.rs"]
#[allow(dead_code)] // logging.rs 里 app 侧的落盘/脱敏 API 在本 bin 未用到,不报 dead_code。
mod logging;

use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine;
use std::io::Write;
use std::process::ExitCode;

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().collect();
    match run(&args) {
        Ok(code) => code,
        Err(msg) => {
            eprintln!("[creatoros-logdec] {msg}");
            eprintln!(
                "用法:\n  creatoros-logdec --key <私钥文件> <sidecar.log.enc>\n  creatoros-logdec encrypt --pubkey <公钥b64> <明文.txt> <输出.enc>"
            );
            ExitCode::from(2)
        }
    }
}

fn run(args: &[String]) -> Result<ExitCode, String> {
    if args.len() >= 2 && args[1] == "encrypt" {
        return run_encrypt(&args[2..]);
    }
    run_decrypt(&args[1..])
}

/// 解密模式:`--key <私钥文件> <input.enc>`。
fn run_decrypt(rest: &[String]) -> Result<ExitCode, String> {
    let mut key_file: Option<&str> = None;
    let mut input: Option<&str> = None;
    let mut i = 0;
    while i < rest.len() {
        match rest[i].as_str() {
            "--key" | "-k" => {
                i += 1;
                key_file = Some(rest.get(i).ok_or("--key 缺少文件路径")?);
            }
            other => input = Some(other),
        }
        i += 1;
    }
    let key_file = key_file.ok_or("缺少 --key <私钥文件>")?;
    let input = input.ok_or("缺少输入文件 <sidecar.log.enc>")?;

    let private_key = read_key_32(key_file).map_err(|e| format!("读私钥失败: {e}"))?;
    let data = std::fs::read(input).map_err(|e| format!("读输入失败 {input}: {e}"))?;

    match logging::decrypt_log(&data, &private_key) {
        Ok(outcome) => {
            let stdout = std::io::stdout();
            let mut lock = stdout.lock();
            for line in &outcome.lines {
                lock.write_all(line).map_err(|e| e.to_string())?;
                lock.write_all(b"\n").map_err(|e| e.to_string())?;
            }
            lock.flush().map_err(|e| e.to_string())?;
            if outcome.truncated {
                eprintln!(
                    "[creatoros-logdec] 警告:文件在第 {} 行后被截断/损坏,已输出可解部分",
                    outcome.lines.len()
                );
            }
            // 截断也算成功输出可解部分 → 退出码 0(验收 §13.3)。
            Ok(ExitCode::SUCCESS)
        }
        Err(e) => {
            // 私钥不匹配/魔数错/HEADER 损坏 → 0 字节 stdout、退出码 1(验收 §13.1)。
            eprintln!("[creatoros-logdec] 解密失败: {e:?}(私钥不匹配 / 文件损坏)—— 0 字节输出");
            Ok(ExitCode::FAILURE)
        }
    }
}

/// 加密模式(dev/test 造夹具):`--pubkey <b64> <明文.txt> <输出.enc>`。每行(以 `\n` 切)一帧。
fn run_encrypt(rest: &[String]) -> Result<ExitCode, String> {
    let mut pubkey_b64: Option<&str> = None;
    let mut positionals: Vec<&str> = Vec::new();
    let mut i = 0;
    while i < rest.len() {
        match rest[i].as_str() {
            "--pubkey" | "-p" => {
                i += 1;
                pubkey_b64 = Some(rest.get(i).ok_or("--pubkey 缺少值")?);
            }
            other => positionals.push(other),
        }
        i += 1;
    }
    let pubkey_b64 = pubkey_b64.ok_or("缺少 --pubkey <公钥b64>")?;
    let input = positionals.first().ok_or("缺少明文输入文件")?;
    let output = positionals.get(1).ok_or("缺少输出文件 <输出.enc>")?;

    let pubkey = decode_32(pubkey_b64).map_err(|e| format!("公钥解析失败: {e}"))?;
    let text = std::fs::read(input).map_err(|e| format!("读明文失败 {input}: {e}"))?;
    // 按 \n 切行(去掉行尾 \r);末尾空行不产帧。
    let lines: Vec<&[u8]> = text
        .split(|&b| b == b'\n')
        .map(|l| {
            if l.last() == Some(&b'\r') {
                &l[..l.len() - 1]
            } else {
                l
            }
        })
        .filter(|l| !l.is_empty())
        .collect();

    let bytes = logging::encrypt_lines(&[pubkey], &lines).ok_or("加密失败(公钥无效?)")?;
    std::fs::write(output, &bytes).map_err(|e| format!("写输出失败 {output}: {e}"))?;
    eprintln!(
        "[creatoros-logdec] 已加密 {} 行 → {output}({} 字节)",
        lines.len(),
        bytes.len()
    );
    Ok(ExitCode::SUCCESS)
}

/// 读 base64 密钥文件 → 32B。
fn read_key_32(path: &str) -> Result<[u8; 32], String> {
    let s = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
    decode_32(s.trim())
}

/// base64(standard)→ 恰好 32B。
fn decode_32(b64: &str) -> Result<[u8; 32], String> {
    let bytes = B64
        .decode(b64.trim())
        .map_err(|e| format!("非法 base64: {e}"))?;
    bytes
        .try_into()
        .map_err(|v: Vec<u8>| format!("期望 32 字节,实得 {}", v.len()))
}
