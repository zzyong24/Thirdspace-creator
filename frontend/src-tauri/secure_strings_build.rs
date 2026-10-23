//! 候选构建助手；仅处理公开常量，不访问或生成签名私钥。
use std::path::Path;
pub fn write_secure_strings(out_dir: &Path, debug_build: bool,
    growth_public_key: &str, growth_key_id: &str, key: [u8; 32]) {
    let values = [
        "https://license.aitongban.cloud", // 0
        "https://growth.aitongban.cloud", // 1
        "https://creatoros.aitongban.cloud/prompts/bundle.json", // 2
        "-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEArmDGPC34VMSU2Isf3X+gULIwOH+5X3GBHwlXYFbgjg4=\n-----END PUBLIC KEY-----\n", // 3 现存公开公钥
        growth_public_key, // 4 已由原 build.rs trim/校验；未配置时真实空
        growth_key_id, // 5 同上
        "/api/license/activate", // 6
        "/api/license/status", // 7
        "/api/v2/entitlement-claim-sessions", // 8
        "/api/v2/entitlement-claim-sessions/poll", // 9
        "/api/app/latest-version", // 10
        "growth-channel-runtime-v1", // 11 现存 contractVersion
        "channel-runtime-v2", // 12 现存 schemaVersion
        "creatoros-update-root-20260805-01", // 13 包身份中的真实根ID；Rust新增签名消费待审
        "x-creatoros-handshake", // 14 修正源ID拼写，不改协议
        "CREATOROS_DESKTOP", // 15 真实桌面环境标记，保留既有值1
        "CREATOROS_HANDSHAKE_REQUIRED", // 16 release显式传入既有握手要求1
        "CREATOROS_ENTITLEMENT_CLAIM_ENABLED", // 17 运行时env名称
        "CREATOROS_PRODUCT_FEEDBACK_SUBMIT_ENABLED", // 18 同上
        "NOMIFUN_CHROME_BINARY", // 19 真实env名称
        "/api/license/restore-current", // 20 T-1402 专用安全恢复；不复用 activate
    ];
    let max_len = values.iter().map(|s| s.len()).max().unwrap();
    let lengths: Vec<usize> = values.iter().map(|s| s.len()).collect();
    let mut source = String::new();
    if debug_build {
        source.push_str("const PLAINTEXT: [&str; 21] = [\n");
        for value in values { source.push_str(&format!("    {value:?},\n")); }
        source.push_str("];\n");
    } else {
        source.push_str(&format!("const MAX_LEN: usize = {max_len};\nconst LENGTHS: [usize; 21] = {lengths:?};\n"));
        source.push_str(&format!("static KEY: [u8; 32] = {key:?};\n"));
        source.push_str("static ENCODED: [&[u8]; 21] = [\n");
        for value in values {
            let bytes: Vec<u8> = value.bytes().enumerate()
                .map(|(index, byte)| byte ^ key[index % key.len()]).collect();
            source.push_str(&format!("    &{bytes:?},\n"));
        }
        source.push_str("];\n");
    }
    std::fs::write(out_dir.join("secure-strings.generated.rs"), source)
        .expect("写入编译期字符串候选失败");
}
