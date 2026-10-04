# T1060：Codex 0.159.3 目录纠正

2026-10-04。此前验收与fixture误用了 `vendor/<target>/codex/codex.exe`，与锁版真实入口不符；旧fixture的GREEN不足以证明Windows合法包可以验收。

本次只读已安装的官方 `@openai/codex` 0.159.3 `bin/codex.js`。其 `findCodexExecutable()` 统一使用 `vendorRoot / targetTriple / bin / (codex.exe|codex)`，不是旧 `codex` 子目录。归档原字节 `/tmp/t1060-codex-bin-layout-edit/official-codex-0.159.3-bin.js.txt`，SHA256 `61b0194f3bb6534439c8d26a3ed57d0805f84b884588b761795323eeb92fcf70`。未执行此入口或任何二进制，也无需重新拉取注册表tarball。

| 平台/架构 | alias | 真实平台包内入口 |
| --- | --- | --- |
| Windows x64 | `@openai/codex-win32-x64` | `vendor/x86_64-pc-windows-msvc/bin/codex.exe` |
| Windows arm64 | `@openai/codex-win32-arm64` | `vendor/aarch64-pc-windows-msvc/bin/codex.exe` |
| macOS arm64 | `@openai/codex-darwin-arm64` | `vendor/aarch64-apple-darwin/bin/codex` |
| macOS x64 | `@openai/codex-darwin-x64` | `vendor/x86_64-apple-darwin/bin/codex` |
| Linux arm64 | `@openai/codex-linux-arm64` | `vendor/aarch64-unknown-linux-musl/bin/codex` |
| Linux x64 | `@openai/codex-linux-x64` | `vendor/x86_64-unknown-linux-musl/bin/codex` |

本机真实darwin-arm64平台包目录只读显示target子目录为 `bin`、`codex-package.json`、`codex-path`、`codex-resources`，`bin` 中有 `codex` 与 `codex-code-mode-host`。项目 `ai-worker/src/execution/codex-app-server.ts:55` 已按正确 `vendor,target,'bin'` 解析，无需修改真实resolver。

本次生产代码仅改Windows x64验收的1行路径，保持既有vendor身份校验、层优先序和复制行为。所有相关fixture改成真实bin布局；新增三层正确目录接受/仅旧目录拒绝及与官方入口、真实resolver一致的source回归。

实际隔离RED：32项中6pass/26fail；修后GREEN32pass/0fail。两个补丁实际回放MATCH。完整命令、日志及哈希见 `/tmp/t1060-codex-bin-layout-edit/evidence.json`。

应用顺序：`/tmp/t1060-codex-bin-layout-tests.patch` → `/tmp/t1060-codex-bin-layout-implementation.patch`。生产before SHA `505ad6474f25d894cab63821eb4e9247cc8be290a3db285eea857d748a9e7427`，after `0c25dfe6150733c6495afb2b597119ae6d0a40c52bf879f026e1e0cf5c938de3`。

Windows真实EXE执行、实际完整发行与宿主启动未验证。共享仓库、全局配置及用户凭据均未改动或读取。
