# LED-057 精确失败核查

结论：当前 `2d3826ef164241860437daa393d336d9b042f980` 的指定 Cargo 命令在运行 Windows 测试前，因干净工作树缺少 ignored sidecar 生成资源而构建失败。不是已复现 Windows 目录切换测试失败，也不能签 LED-057 已通过。

Root 授权、Control 确认独占 target 与交付 build HOLD 后，只实际运行一次原命令：

```text
cargo test --manifest-path frontend/src-tauri/Cargo.toml --lib runtime_cleanup_tests::windows_ --no-default-features
```

真实 exit **101**，耗时 **6.038 秒**。未注入环境、密钥或 config，没有缩短原预算；子进程没有另设执行 timeout，仅工具短 yield。原始 stdout+stderr 保存在当前目录 `CARGO_EXACT_PRIVATE.txt`（0600），真实 pid/时间/退出码/工具链见 `CARGO_EXACT_META.json`（0600）。原日志可能含构建期环境指令，不能整份公开或整文读取；只筛出固定错误行到 `ERROR_EXCERPT.txt`。没有读取 target 中整个 build output 或任何密钥 blob。

具体错误：`build.rs:444:6` 的 `tauri_build` 返回 `resource path binaries/creatoros-server-aarch64-apple-darwin doesn't exist`，custom build command exit101；没有进入 lib test runner，没有 Windows 测试结果可签。`tauri.conf.json:30` 声明 `externalBin: ["binaries/creatoros-server"]`，Tauri 按本机 triple 补全上述路径。`frontend/scripts/desktop/build-sidecar.mjs` 的顶部契约及 `BINARIES`/`targetTriple` 是其正式生成消费者；`frontend/src-tauri/.gitignore:7` 明确忽略该目录。没有运行生成脚本、复制二进制或以空文件绕过。

|身份/证据|实际观察|可得结论|
|---|---|---|
|e676 与 2d 的 `frontend/src-tauri` Git tree|均为 `7282612d4f1b14fc1727c174304a8de33e67ce87`|Rust 源码、清单与锁文件树相同；不证明生成资源与运行环境相同|
|当前工具链|cargo1.98.0 / rustc1.98.0 / stable-aarch64-apple-darwin，详细 commit 在 meta|本次精确重验工具链已记录；没有历史 e676 的逐项工具链/环境原件，不能倒签相同|
|本次环境，仅 presence boolean|CARGO_TARGET_DIR、RUSTFLAGS、RUSTUP_TOOLCHAIN、CARGO_BUILD_TARGET、VERDICT_SIGNING_KEY、TAURI_CONFIG 均未设非空值|无环境注入或覆写；不披露任何值，不代表历史环境也相同|
|当前 managed 工作树的 exact externalBin|不存在|直接解释本次 tauri_build 错误|
|当前主树同一 exact externalBin|存在，普通文件，68384 bytes|当前两个工作区的 ignored 资源条件不同；未读取其内容/执行它，不将当前状态冒称历史 e676 资源证据|
|旧 t1362 full reconcile 原件|LED-057 hold，子命令 stdio ignore|保留旧结果，但无法恢复当时测试数/具体环境|
|本次 2d full reconcile 原件|LED-057 fire，子命令 stdio ignore|保留新增失败，不能用旧 hold 覆盖|

原 full reconcile 的真实消费者 `orchestrator/process/reconcile.mjs:739` 是 `execSync(check,{stdio:'ignore',shell:'/bin/bash'})`，未设置 timeout；因此父日志只有 guard 汇总，不能当成可定位 Cargo 子错误。本次捕获补足了当前精确失败因果，**不把“Rust 文件没变”当成同因证明**。旧44/新56及其它11项变化仍由 Control/Root 分类，本核查不扩到它们。

当前 Rust/产品源码无修改。Cargo 前一次 status 为空；末次 status 出现 `docs/verification/t1073/worker/ipc-memory-parallel-observation.json` 的单行 tracked 漂移，来源尚待 Control 核对，不能签整树 clean。该文件不在本核查写集，我未读改或恢复，原状态已记录 RESULT.json 并通知 Control。未删 target、未改 Cargo/TAURI 配置、未运行 build-sidecar/打包、未并发交付构建、未复跑 full reconcile、未触碰真实平台/用户库。后续若正常正式构建按原流程补齐生成资源，这条门的结果仍需独立实际验证才能改签；本轮权限只核失败，因此停在本证据，不自行补资源重试。
