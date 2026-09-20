# NomiFun 浏览器依赖来源

- 来源：`https://github.com/nomifun/nomifun-desktop.git`
- 冻结提交：`e27bd5de9a58ce444032ef4e63bb753992555c4c`
- Git tree：`432316aefdd96dd7577af10026689f5896f1c4ae`
- 上游版本：`0.7.2`；导入方式：从该 Git 对象 `git archive` 导出 12 个 crate 与根 `LICENSE`、`NOTICE`。未读取来源工作区的未提交文件。
- 来源根 `Cargo.toml` SHA-256：`80c7b75bb0d1aea08fd607fda72228edf4fe2181c3d8f2f4703bb600d8ed1f7b`；来源根 `Cargo.lock` SHA-256：`22e0cfd6e4bf016d074763e0f465f4cdd31a5847dd853eb674256c410c9ca3d1`。本包根 manifest 收窄 workspace 成员及其 workspace 依赖，并把上游 manifest 的本地占位 repository 元数据改为已核对的 Git 远端；本包锁文件由来源锁文件开始，在缩减 workspace 后以离线 Cargo 更新。
- 导出文件：309 个。逐文件 SHA-256 见 `SOURCE.sha256`；清单自身 SHA-256：`b520276f11de10e8168e476ed514f92b1eb6b96f5095c908e199764436ffa67c`。导出时逐文件 Git blob ID 与冻结提交核对一致。
- 许可证：来源根 `LICENSE` 声明 Apache-2.0，根 `NOTICE` 原样保留；`crates/agent/nomi-browser-engine/injected/NOTICE` 原样保留。`nomifun-common` 的 manifest 未单独声明许可证，按来源根许可文件随包保留。第三方 registry 依赖的许可审计仍需在正式发布前完成。
- 本包是独立可编译依赖快照；尚未并入 CreatorOS Tauri 主 manifest，也未验证 Windows 真机或安装版浏览器资源。

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
