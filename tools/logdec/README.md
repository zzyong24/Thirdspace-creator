# CreatorOS 支持排障工具箱

> 收拢用户机排障需要的一键脚本 + 前置说明。用户机不可能装 Rust 工具链,一切从**这里**起步。

## 日志解密 (T-455)

用户 IM 发来 `sidecar.log*.enc` 时用它,不用再重打包 logdec。

### 一次性设置

1. 从**开发者本地**取 `creatoros-logdec.exe`:
   - 已存的话:直接用 `tools/logdec/creatoros-logdec.exe`
   - 需要重建:`cd frontend/src-tauri && cargo build --features logtools --bin creatoros-logdec --profile release-fast`,再拷 `target/release-fast/creatoros-logdec.exe` 到 `tools/logdec/`。**注意** cargo clean 会带走 target,所以留 tools/logdec/ 一份稳定副本。

2. 拿到**开发者私钥文件**(T-391 里生成的 `log-privkey.key`,raw 32B url-safe base64)。**这个文件绝不进 git、绝不进 IM**——放本机固定位置(如 `~/.creatoros/log-privkey.key`),团队共享用 1Password / 私 GDrive。

### 用法

**Git Bash / macOS / Linux**:
```bash
# 单个文件
./tools/logdec/decrypt-log.sh \
  --key ~/.creatoros/log-privkey.key \
  "/path/to/sidecar.log.enc"

# 目录里所有 .enc 一次解 (常见:用户发一个 WeChat 目录)
./tools/logdec/decrypt-log.sh \
  --key ~/.creatoros/log-privkey.key \
  --dir "/c/Users/foo/Documents/WeChat Files/wxid_.../FileStorage/File/2026-07"

# 强制覆盖已有 .log 输出
./tools/logdec/decrypt-log.sh --key ... --dir ... --force
```

**PowerShell**:
```powershell
.\tools\logdec\decrypt-log.ps1 -Key "$HOME\.creatoros\log-privkey.key" `
  -Dir "C:\Users\foo\Documents\WeChat Files\wxid_...\FileStorage\File\2026-07"
```

### 输出规则

- `xxx.log.enc` → `xxx.log.txt`(避免与运行时 sidecar.log 命名冲突)
- `xxx.enc` → `xxx.log`
- 输出到原文件所在目录
- 已存在同名输出会跳过,除非 `--force` / `-Force`
- 密钥不对 / 文件损坏 → 报 `✗ 解密失败`,不产生半吊子输出

### 排错

- **`解密失败`** = 私钥不匹配公钥 `key_id`(enc 文件头前 4B 可辨) 或文件截断。检查:①私钥文件对不对(不同版本客户端会换 keypair);②用户发的 .enc 是否传输截断(比对文件大小)。
- **`找不到 logdec 二进制`** = `tools/logdec/creatoros-logdec.exe` 缺失。见上"一次性设置"步骤 1。
- **Windows 上 `无法运行:此二进制是 64 位`** = 用户机是 32 位 Windows(极少)。让他们发 log 给你在开发机解。
