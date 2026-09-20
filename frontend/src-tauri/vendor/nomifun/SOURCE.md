# NomiFun 浏览器依赖来源

- 来源：`https://github.com/nomifun/nomifun-desktop.git`
- 冻结提交：`e27bd5de9a58ce444032ef4e63bb753992555c4c`
- Git tree：`432316aefdd96dd7577af10026689f5896f1c4ae`
- 上游版本：`0.7.2`；导入方式：从该 Git 对象 `git archive` 导出 12 个 crate 与根 `LICENSE`、`NOTICE`。未读取来源工作区的未提交文件。
- 来源根 `Cargo.toml` SHA-256：`80c7b75bb0d1aea08fd607fda72228edf4fe2181c3d8f2f4703bb600d8ed1f7b`；来源根 `Cargo.lock` SHA-256：`22e0cfd6e4bf016d074763e0f465f4cdd31a5847dd853eb674256c410c9ca3d1`。本包根 manifest 收窄 workspace 成员及其 workspace 依赖，并把上游 manifest 的本地占位 repository 元数据改为已核对的 Git 远端；本包锁文件由来源锁文件开始，在缩减 workspace 后以离线 Cargo 更新。
- 导出文件：309 个。冻结提交的原始逐文件 SHA-256 现保存在 `SOURCE.upstream.sha256`；清单自身 SHA-256：`b520276f11de10e8168e476ed514f92b1eb6b96f5095c908e199764436ffa67c`。导出时逐文件 Git blob ID 与冻结提交核对一致。当前本地依赖包的逐文件值见 `SOURCE.sha256`，清单自身 SHA-256：`8a58b1225811afaa4d029bcfbb9b7acfa66ca65d6c71809375908016acb67b3a`。
- 许可证：来源根 `LICENSE` 声明 Apache-2.0，根 `NOTICE` 原样保留；`crates/agent/nomi-browser-engine/injected/NOTICE` 原样保留。`nomifun-common` 的 manifest 未单独声明许可证，按来源根许可文件随包保留。第三方 registry 依赖的许可审计仍需在正式发布前完成。
- 本包是有来源记录的依赖快照，现已并入 CreatorOS Tauri 主 manifest；Windows 真机和安装版浏览器资源仍未验证。

## CreatorOS 本地补丁（T-1008，2026-09-20）

冻结的上游防火墙有意让 `Document` 导航绕过 `allow_etld1`，适合 NomiFun 通用浏览；CreatorOS 的任务浏览器已声明站点域和身份模式，跨域重定向必须在发出请求前拦截。故在 `nomi-browser-engine/src/firewall.rs` 增加默认关闭的 `allowed_document_domains` 与 `https_only_documents` 配置；只由 CreatorOS Rust 宿主为当前受控 Lane 注入，原上游默认导航语义不变。`backend/cdp.rs` 增加 `Fetch.requestPaused` 接线层测试，确认域外、伪子域、降级与非默认端口走 `Fetch.failRequest`，合法子域走 `Fetch.continueRequest`。前者通过现有 `decide` 路径实现，后者是测试改动；除这两个上游源码文件外，冻结内容与上游逐字节相同。

| 文件 | 上游 SHA-256 | 本地 SHA-256 |
| --- | --- | --- |
| `crates/agent/nomi-browser-engine/src/firewall.rs` | `1de4413782b6c860fc18ed71a88c592357daa13ebb414e69e78ab5df66fa14c7` | `170ad8a062b6adc7de5f8ae88151fffd2c3f04dd9f3273fa53727ee74f079c50` |
| `crates/agent/nomi-browser-engine/src/backend/cdp.rs` | `80c584cb490e7ffbcc423036c05ed07966165dfc506cf1ac1fd54968bdd230c3` | `b08fe23b240eb7cc343308b32a9e7c2c7dffbbfc6a3502fa18c1762eb3da52f3` |

## 本地候选验证（macOS arm64）

在仓库根执行：

```bash
CARGO_TARGET_DIR=/tmp/t1008-vendor-target cargo check --manifest-path frontend/src-tauri/vendor/nomifun/Cargo.toml -p nomifun-browser-platform -p nomi-browser-engine -p nomi-browser --target aarch64-apple-darwin --locked --offline
```

首次以原仓锁文件执行时退出 101：缩减 workspace 后 Cargo 要求更新包内锁文件。接着执行：

```bash
CARGO_TARGET_DIR=/tmp/t1008-vendor-target cargo check --manifest-path frontend/src-tauri/vendor/nomifun/Cargo.toml -p nomifun-browser-platform -p nomi-browser-engine -p nomi-browser --target aarch64-apple-darwin --offline
```

退出 0，三项核心 crate 和本地闭包编译通过，并写入缩减后的 `Cargo.lock`。随后重跑首条 `--locked --offline` 命令，退出 0。

```bash
cargo metadata --manifest-path frontend/src-tauri/vendor/nomifun/Cargo.toml --no-deps --format-version 1 --locked --offline
```

退出 0，`workspace_members` 为上述 12 个 crate。以上仅证明本地依赖包独立编译；主 Tauri manifest 尚未接线。

Windows 目标只做了依赖图解析：

```bash
cargo tree --manifest-path frontend/src-tauri/vendor/nomifun/Cargo.toml -p nomi-browser --target x86_64-pc-windows-msvc --locked --offline --depth 1
```

退出 0；这不是 Windows 编译或运行证据。`git diff --check` 对四个上游原文件报告文件末尾空行；为保持冻结 Git blob 原样，本候选未修改这些上游文件。
