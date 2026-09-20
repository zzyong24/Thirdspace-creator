# T-1009 桌面原生选址导出：独立子任务

本候选只增加桌面壳的产物字节导出端口，写集为 `frontend/src-tauri/src/lib.rs` 与本文。T-1009 的产物登记、隔离预览、HTML 转 PNG/PDF 和页面接线仍由其他子任务完成；本候选不把原生端口等同完整交付。

```mermaid
flowchart LR
  A[已准备的产物字节与类型] --> V[检查 base64、大小、MIME 与后缀]
  V --> D[Mac/Windows 系统保存面板]
  D -- 取消 --> C[cancelled：不写文件]
  D -- 选中路径 --> W[再次核对后缀并写原始字节]
  W -- 写入成功 --> S[saved]
  W -- 写入失败 --> E[错误：不报成功]
```

## 原生接口与边界

新增 Tauri command `export_artifact_bytes`，参数为 `contentBase64`、`mimeType`、`suggestedName`、`expectedSize`；返回字符串 `saved` 或 `cancelled`，失败走 Tauri command 错误。白名单为 HTML `text/html`（`.html/.htm`）、Markdown `text/markdown`（`.md/.markdown`）、CSV `text/csv`（`.csv`）、PNG `image/png`（`.png`）、PDF `application/pdf`（`.pdf`）。文本类型另接受 `; charset=utf-8`；其他 MIME 参数拒绝。检查标准 base64、解码后字节数与 `expectedSize` 一致，单次上限 100 MiB；写盘不重新编码。文件名复用 Rust `TaskFiles` 的跨平台相对路径校验，只允许一个安全的文件名组件；系统面板返回后仍检查真实选中路径的扩展名。

复用现有 `export_daily_report_csv` 所用的 Tauri `blocking_save_file`。取消返回 `cancelled` 并且不调用写盘；已有文件是否选作目的地由用户在原生面板决定，选中后才写入。Tauri [dialog 文档](https://v2.tauri.app/plugin/dialog/)说明该 API；Windows 的原生 Save dialog 默认带已有文件覆盖提示，见 [Microsoft 文档](https://learn.microsoft.com/en-us/windows/win32/shell/common-file-dialog)；macOS 使用 [NSSavePanel](https://developer.apple.com/documentation/appkit/nssavepanel)。本机未实际操作 Windows 面板，因此这些平台行为仍需安装版真机复核。

## 已执行验证

- 先添加 Rust 用例，再执行 `TAURI_CONFIG='{"bundle":{"externalBin":[],"resources":[]}}' cargo test --manifest-path frontend/src-tauri/Cargo.toml --lib native_artifact_export --offline --locked --no-default-features`：预期红测，编译报 `prepare_artifact_export`、`write_selected_artifact`、`NativeArtifactExportOutcome` 尚不存在。该资源覆盖只供隔离工作树源码验证，不代表安装包资源齐全。
- 实现后重跑同一过滤测试：**2/2 通过**。覆盖五种格式的原始字节往返、MIME/后缀/非法文件名/大小/base64 拒绝、取消无文件、已选中的既有文件覆盖、选中错误扩展名不写、写入失败不返回成功，以及 `saved/cancelled` 序列化。
- `TAURI_CONFIG='{"bundle":{"externalBin":[],"resources":[]}}' cargo check --manifest-path frontend/src-tauri/Cargo.toml --lib --offline --locked --quiet`：Mac 桌面壳默认 feature 源码检查通过。`git diff --check` 通过；新增代码块与 `rustfmt` 输出一致。全量 `cargo fmt --check` 会报未改的 `cli_access.rs` 等既有格式差异，本候选没有修改写集外文件。
- Windows 目标 `x86_64-pc-windows-msvc` 的同包 `cargo check --no-default-features` **未进入本模块检查**：本机缺 Windows MSVC C 头文件，`ring 0.17.14` 在编译 `curve25519.c` 时以 `assert.h file not found` 失败。不能据此声称 Windows 已编译或可用。
- `node orchestrator/process/context-plan.mjs --root . --task T-1009 --json` 路由 BUILD；`research-gate.mjs audit` 无开放研究门。
- `node orchestrator/process/boundary-scan.mjs` 报 7 条、较旧基线 2 条新增 R2，均在未改的 `frontend/src/features/copilot/live-chat-session.ts`；全局边界门未通过，本候选未增加该路径改动。

## 未验收

测试用路径选择代替真正的系统点击，未完成 Mac/Windows 保存面板真机交互或安装包验证；Windows 真实文件系统、用户取消和覆盖对话框仍缺证据。此命令仅校验声明的 MIME 与扩展名配对，不对 HTML/图片/PDF 的文件内容做完整格式解析。调用方须从后端已登记、已核对账号与版本的产物取得字节，并只在用户触发导出时调用；本候选不新增该接线，也不验证导出后的预览。T-1009 保持待办，不执行 `taskctl start/complete`，因为完整任务仍受 T-1007 与其他 T-1009 子任务依赖，且本次写集不包含看板和事件日志。
