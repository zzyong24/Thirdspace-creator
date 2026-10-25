# T-1412 full 离线资产准备交接

已完成获授权的资产准备；没有执行 full、测试、构建、浏览器启动或网络下载。准备时干净工作树 HEAD 为 `c00cef1c3f5a60f57f96aa6f85f09906d1274f81`；T-1413 未提交工作内容不由此 HEAD 代表。最终 full 仍须由 root 绑定最终提交/配置和有效环境。

两份 LED-061 文件从主树原件按已经独审的双 SHA 精确写入工作树。目标原先不存在，使用独占创建；未覆盖现有观测。它们是历史基线，不是本轮执行结果。路径、源、字节数和 SHA 见 `led061-historical-baselines.json`。

Rust 私有目录为 `privateRoot/cargo-offline-assets`，新输出目录为 `privateRoot/cargo-target-full`，后者仍为空。两份当前已跟踪 Cargo.lock 合计 712 个 registry 包版本，无 Git 依赖。已有 561 份 `.crate` 全部匹配锁 checksum；622 个 sparse index 文件覆盖全部锁版本与 checksum。逐文件使用 macOS `clonefile` 成功返回，禁止失败时回落普通复制，已验证同设备、不同 inode、目标与源字节一致。归档逻辑总大小 77,186,759 字节，未复制整个用户 Cargo 目录、旧 target 或解压源码。15 个归档来源是本地 rsproxy 缓存，按相同 Cargo.lock checksum 验证后放入 canonical crates.io 缓存路径；不复制镜像配置。唯一复制的 registry 公共元数据是 canonical index 的 `config.json`，其内容已精确核为 crates.io 的公共 dl/api 地址；未读取 `~/.cargo/config*` 或 credentials。

直接使用已安装 `stable-aarch64-apple-darwin/bin` 下 cargo、rustc、rustdoc，仅查询了 `--version`，三者均为 1.98.0、退出码 0；二进制 SHA 和版本输出已记录。建议把该 bin 目录放到现有私有 PATH 前端，并指定 RUSTC/RUSTDOC，以避免经用户 rustup 配置选择工具链。未复制用户 RUSTUP_HOME 或 Cargo 配置。

Playwright 对应依赖为 `@playwright/test`/`playwright-core` 1.60.0，包元数据锁定 Chromium 与 headless-shell revision 1223、浏览器版本 148.0.7778.96；ffmpeg revision 1011。已定位本地缓存的上述三个精确目录，散列 357 个普通文件，核对 5 个 symlink 都落在各自 bundle 内，安装完成标记和三个入口的可执行权限均存在。未读 `.links`、任何用户 profile/配置，也未启动或下载浏览器。LED-024 原入口使用 frontend 的 `@playwright/test` 并 headless launch，建议 `PLAYWRIGHT_BROWSERS_PATH` 指向已核缓存根；不得用其他 revision 冒充。全部路径、SHA 和包元数据在 `playwright-local-assets.json`。

## 剩余缺口与证据边界

| 项目 | 当前事实 |
| --- | --- |
| LED-061 输入 | 原先缺失已精确补齐；仍须由真实本轮测试产生本轮观测，并保留原 wrapper 的恢复语义。 |
| Playwright 运行资产 | 固定版本的本地 bundle 已找到并记录字节，运行成功尚未验证。没有因此获得真实 App UI 通过证据。 |
| Rust 离线闭包 | 151 个锁版本在两个本地 registry 中均无归档或解压源码，明细见 `rust-offline-assets.json.missingArchives`。其中大量为 Android/Linux/Windows/wasm 等目标；本轮没有执行 Cargo 依赖解析，因此既不能声称本机闭包完备，也不能把 151 项全部认定为本机 full 阻断。现有本地缓存可安全准备到这里；未尝试获取缺失项。 |
| LED-054 条件真浏览器用例 | `CREATOROS_TEST_CFT_ROOT` 对应的已核 bundle 路径可供 root 选择；不自动设置，不指向旧 fixture binary。设置后会启用原有 5 个条件用例，需要真实编译/运行证据；本轮不替它们签通过，也不把未开启产生的 skip 写为已覆盖。 |
| 磁盘 | 准备后观察到可用 24,044,597,248 字节（约 22.39 GiB）；这不是后续编译输出峰值的保证。未复制旧 target，也未改变原 timeout、命令或断言。 |
| 完整环境 | `suggested-env-delta.json` 只给建议增量，未应用到 state.json。root 仍需注入本轮 owned PG 的四个已审键，保持同一私有 TMPDIR，排除 DATABASE_URL、TEST_DATABASE_URL、NODE_PATH/NODE_OPTIONS 等用户继承配置。此准备不替代 OS 隔离和原 Gate 的完整证据。 |

准备命令实际退出码 0（终态工具回执 chunk `1c4526`），完成时复核 state.json 字节与起始值相同、两个 Cargo.lock 字节未变。修改范围仅为本目录证据、私有环境中的精确 Cargo 缓存/空 target 目录，以及显式授权的两份工作树历史基线；未改产品、配置或依赖源码。
