# T1246 Rust 单元构建资源补齐独立复核

候选 533224f334c43cdb81a344424e420cad93784dd1；只读，不复制、不执行。首轮 /tmp/t1246-rust-unit/first.log 真实 exit101，tauri_build 缺 binaries/creatoros-server-aarch64-apple-darwin，0 Rust tests。保留首轮失败，不称其为已执行单元测试。

结论：可在独立 integrated-unit-acceptance 树补入下列本轮真实 package 生成资源，再按原安全预审命令执行默认 debug 纯 lib harness。不是 fake binary；不改产品源码、Cargo.toml、build.rs、tauri.conf.json 或正式包。

| 目标相对路径（保持相同） | 本轮实际源 bytes | SHA256 |
|---|---:|---|
| frontend/src-tauri/binaries/creatoros-server-aarch64-apple-darwin | 68384 | 32e234a5b6bec67d72a016f2baadf7fadf3afd328470b395b73af473fdee0d85 |
| frontend/src-tauri/sidecar.tar.gz | 853667799 | 07b9351c8e2f2e49c6ac7c9f50560addf3b6cfb9562bae45a279d01398aa055c |
| frontend/src-tauri/THIRD_PARTY_NOTICES.md | 1620 | 164b46fc33639cb2e79cba8abea46e7daccc285d9c19343178823e8ec964e962 |

资源源根：/Users/zyongzhu/.codex/worktrees/integrated-dev-acceptance/Thirdspace-creator。目标根：/Users/zyongzhu/.codex/worktrees/integrated-unit-acceptance/Thirdspace-creator。本例平台为 aarch64-apple-darwin，不能拿 arm 资源冒充其它 target。

实际出处：package-first/freeze.json 与 artifacts.json 均绑定上述 533 候选，package_exit0；build.txt:1396 明确生成该 sidecar binary，1573–1574 生成 sidecar.tar.gz。tar 与 notices 又同本轮 CreatorOS.app/Contents/Resources 实际字节 SHA 一致（/tmp/t1246-rust-resource-package-proof.json）。bundle 后 MacOS/creatoros-server 经 ad-hoc 重签，不能声称它与构建前带 target 后缀 binary SHA 必相同；复制上表实际构建资源的字节，不复制/执行 App 主程序。

真实消费者：tauri.conf.json:31 externalBin=binaries/creatoros-server；tauri-build 2.6.3 lib.rs:545 按 target_triple 加后缀，:56–84 copy_binaries 仅 fs::copy 到 CARGO_TARGET_DIR 的 debug 根。:570 copy_resources 按配置复制 tar 和 notices，没有执行 sidecar。build.rs:356 对 tar SHA 只读；:366 的 expanded sidecar/frontend/server.js 缺省空 hash，:435 expanded sidecar 不存在时生成空 integrity manifest，源码明确支持 dev/cargo check 空资源目录。无需复制整个 expanded sidecar、vendor/runtime、签名 key、配置凭据、用户数据或 App。

保持原 tracked icons、placeholder-dist、permissions/capabilities 等冻结输入；若目标已有 notices，要先比较同 SHA，不能覆盖未知来源文件。三资源复制后保存源/目标 SHA、bytes、权限和 provenance 回执；binary 保原 executable mode 即可，复制不执行。保持默认 debug，不改为 release/release-fast、不设置真实 verdict signing key、不执行 Tauri CLI/beforeBuildCommand/package script，不启动 App，不安装，不触发授权。清除 TAURI_CONFIG 和先前安全预审所列 CREATOROS/GROWTH 外部真实探针变量，独立 CARGO_TARGET_DIR 和 TMPDIR；原 --locked --offline --lib -- --test-threads=1，不加 --ignored。

测试边界仍为 /tmp/t1246-rust-unit-safety-review.md：非忽略 harness 不走 App builder/setup、共享 CLI、Keychain、defaults、用户库或真实激活；少量进程/socket/local HTTP 为各例自有 fixture。已识别 IPC child --exact 前缀遗漏造成 0-child-test 假覆盖等缺口仍保留，资源补齐不修/掩盖它们。

本复核只是构建前置资源安全与消费者可达性确认，不能保证后续编译/测试成功；若下一真实阶段缺其它资源或出现错误，保留日志并精确归因，禁止补空文件骗过构建。资源补齐属于准备期环境修复，首轮 exit101 仍计历史证据。
