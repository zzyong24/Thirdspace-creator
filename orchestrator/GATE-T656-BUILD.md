# T-656 本地 BUILD Gate 证据

日期：2026-08-02  
状态：本地实现与定向验证通过；Windows NSIS 真安装扫描待下一次候选包执行，任务保持 🔨/待验。

## 已完成

- 删除生产 Sidecar 的 `CREATOROS_SMOKE_BYPASS_VERDICT` 分支；保留的唯一豁免是非生产开发模式。
- 打包冒烟使用端口绑定、最长 5 分钟的真实 Ed25519 token，实际 Sidecar child env 明确删除 signing key、allow marker 与旧 bypass。
- 签名 seed 只接受 canonical 32B base64url；sentinel、换行、padding 均在重活前拒绝。
- `build.rs` 将 seed 拆成 32B 随机 mask + 32B XOR 材料；release/release-fast 缺钥或非法时 fail-closed。
- Rust 运行时从 64B blob 重组 seed，构造 `SigningKey` 后清零临时数组；不再使用 `option_env!`、base64 或 sentinel 解析。
- Tauri build 后扫描最终 shell、gunzip 后的 canonical/package tar；Windows NSIS Gate 进一步扫描 `runtime-current.txt` 指向的实体 runtime。扫描同时要求匹配公钥仍存在。
- 可分发打包入口已移除 `CREATOROS_SKIP_SMOKE`，不能跳过真实 token 验证后继续出包。

## 新鲜验证

- 红测（实施前）：3 个文件共 4 个失败，分别命中旧 bypass、legacy sentinel 宽松解析、缺少真实 smoke token helper、私钥 child env 继承隔离缺失。
- `pnpm exec vitest run scripts/desktop/verdict-key-material.test.mjs scripts/desktop/obfuscate.test.mjs scripts/desktop/startup-safety-contract.test.mjs scripts/desktop/desktop-release-workflow.test.mjs scripts/desktop/verdict-artifact-hardening.test.mjs`
  - 5 files passed，68 tests passed。
- `cargo test --manifest-path frontend/src-tauri/Cargo.toml license::tests --lib`
  - 70 passed，0 failed。
- `CREATOROS_VERDICT_SIGNING_KEY_B64=<32B fixture> CREATOROS_LICENSE_PROJECT_KEY=creatoros cargo check --manifest-path frontend/src-tauri/Cargo.toml --profile release-fast --lib`
  - release-fast 编译通过。
- release-fast 缺少 `CREATOROS_VERDICT_SIGNING_KEY_B64`：`build.rs` 以 `T-656: 缺少 ...` 拒绝构建。
- `node --check`（package/scanner/obfuscate）、`cargo fmt --check`、目标文件 `git diff --check`：通过。
- boundary scan：无新增物理架构违规；orphan scan：0 errors。
- 独立实现复核首轮提出 2 个 major（Windows 公钥正向检查、smoke 可跳过），复核又要求公钥必须从实际固定 JSON 精确解析；三项均已修正，最终复核无剩余 blocker/major。
- 用新扫描器检查工作区现存的 2026-08-02 04:37 旧 `sidecar.tar.gz`，正确命中 `removed-smoke-bypass` 并拒绝；证明旧构建产物尚未自动变安全，下一次出包必须重建 sidecar 后才能通过。

## 尚未冒充为 PASS 的证据

- 本轮没有重新打 macOS 安装包，也没有执行 Windows NSIS 真安装；真实最终壳、最终 tar 与 Windows current runtime 的扫描将在下一次候选包流水线中自动执行。
- `reconcile` 的功能/边界/orphan 子门为绿，但全局仍因 T-653 非法审核文案、T-642/T-645/T-635 receipt 漂移而红；`pmem sync` 在本次三轮评审后刷新了 `PROJECT.md`，也使 T-656 receipt 的 constitution hash 过期。三轮上限禁止伪造第四轮 receipt，因此任务保持待验，不写成全绿。
- `test-integrity.mjs` 被工作区既有未跟踪测试目录触发 `EISDIR` 工具异常，未把该工具异常冒充成本任务测试失败或通过。
