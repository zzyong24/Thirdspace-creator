# T-1004 NomiFun 浏览器依赖与宿主边界

## 来源锁

- 参考仓：`https://github.com/nomifun/nomifun-desktop.git`
- 读取提交：`e27bd5de9a58ce444032ef4e63bb753992555c4c`，版本 `0.7.2`
- 来源许可证：仓库根 `LICENSE`（Apache-2.0）与 `NOTICE`；`nomi-browser-engine/injected/NOTICE` 还记录注入代码的来源。`nomifun-common/Cargo.toml` 未单独声明 `license.workspace`，分发时须保留根许可证与声明。
- 原参考仓工作区有大量未提交改动；迁移只认这个 Git 对象。已用 `git archive` 导出到 `/tmp/t1004-nomifun-e27bd5de` 供本机检查，未修改原仓。该临时路径不是产品运行时依赖。

## 本地 crate 闭包

`nomi-browser` → `nomi-browser-engine`、`nomifun-browser-platform`、`nomi-types`、`nomi-config`、`nomi-protocol`、`nomi-tools`；`nomi-browser-engine` → `nomifun-net`、`nomi-process-runtime`、`nomifun-common`、`nomi-redact`；`nomi-config` → `nomi-compact`、`nomi-types`、`nomi-process-runtime`；`nomi-tools` → `nomi-types`、`nomi-protocol`、`nomi-config`、`nomi-process-runtime`；`nomifun-common` → `nomi-types`。合计 12 个本地 crate。三项核心 crate 及传递本地 crate 均无自定义 Cargo feature；宿主需实现 `BrowserHostFactory`，可复用 `nomi-browser/src/platform_adapter.rs` 的适配层。

建议在 T-1008 纳入锁定提交的不可变源码快照，仅包含这 12 个 crate、引擎 `injected/`、根 `LICENSE`/`NOTICE` 与所需 workspace 依赖。CreatorOS 自身 `Cargo.lock` 才是最终第三方版本真相。若采用 Git `rev` 依赖，须先证实该对象在构建机可拉取；当前远端 `HEAD` 为 `c5461de6dc9df1845edd7956c3573029ae08f33e`，不能以本机工作区目录作为分发依赖。不能照搬 `nomifun-app/browser-use`，那会额外带入数据库和完整 Agent 应用。

重要运行依赖包括 `chromiumoxide 0.9.1`、`tokio-tungstenite 0.26.2`、`sysinfo 0.39.6`、`zip 2.4.2`、`reqwest 0.12.28`。引擎把 `injected/dist/injected.js` 用 `include_str!` 编入，不需另跑注入脚本。Chrome for Testing 版本 `149.0.7827.155` 的二进制、哈希和 Mac/Windows 资源路径仍须由 T-1008/T-1013 固定，不能在离线安装时暗中依赖系统 Chrome 或网络下载。外部 registry 依赖的许可证审计尚未完成。

## 端口与旧采集交接

可信 backend 以现有 `execution_tasks` 的 attempt/fence 和 `execution_browser_profile_leases` 的全局唯一 `profileKey` 授权；模型只提供 `workbenchInvocation`。Rust 宿主拥有 Chromium/profile 进程和 epoch，Worker 只拿受限 Lane 操作。旧 Playwright 释放并证明停止后，Rust 才可取得同一 profile 的租约；新路径无法安全交接时旧所有者继续独占。两个账号不能共享 Primary；旧租约不能关闭新 Lane。采集作品、评论、封面和流量的旧入口必须在 T-1008 真实回归，公开网页打开不能替代这些验收。

## 本机验证与限度

- `pnpm --dir contract exec vitest run tests/agent-workbench.test.ts --retry=0`：5/5 通过；`pnpm --dir contract typecheck` 通过。
- 首次直接对参考仓工作区 `cargo check` 仅为环境探针；因该工作区有未提交改动，不作为锁定提交证据。
- 本机有 Rust `1.98.0`、`aarch64-apple-darwin` 与 `x86_64-pc-windows-msvc` target。锁定提交快照上执行 `CARGO_TARGET_DIR=/tmp/t1004-nomifun-target cargo check --manifest-path /tmp/t1004-nomifun-e27bd5de/Cargo.toml -p nomifun-browser-platform -p nomi-browser-engine -p nomi-browser --target aarch64-apple-darwin --locked -q`，退出码 0。Windows 目标 `cargo tree --locked -p nomi-browser --edges normal --target x86_64-pc-windows-msvc` 可解析（输出 886 行）；Mac 上对 Windows MSVC target 的 `cargo check` 被 `ring`/`bzip2-sys` 的 C 编译阻断（缺 Windows SDK/MSVC 头文件），不能据此判断 Windows 源码失败，也不等于 Windows 原生编译通过。
- `pnpm --dir contract test` 的旧基线有 4 项失败（chat-worker、registry、assets、cli-policy）；`boundary-scan` 的旧基线有 2 条 `live-chat-session.ts` R2 新告警，T-1014 已记录，由 T-1015 承接。两者不是本次协议测试的 PASS 证据。
- `node orchestrator/process/pmem.mjs sync` 已执行；本次 `reconcile` 返回 **36 error、1 warning**，与 T-1014 清理后的历史剩余数量一致。逐项没有 T-1004 新协议或门卫 R5 的失败；原错误继续保留，不改基线或关闭检查。`semantic-boundary-scan` 的 `material.match` 失败也在 T-1014 旧清单中。

T-1004 仅冻结协议与依赖闭包；Rust 宿主接入、受管 Playwright 交接、真实双端编译和安装版验收在 T-1008/T-1013 完成，不提前标 PASS。
