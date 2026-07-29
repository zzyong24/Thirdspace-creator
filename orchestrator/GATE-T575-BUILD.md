# T-575 CreatorOS 三系统接入 BUILD Gate

> 日期：2026-07-29
> 结论：**本地 BUILD PASS；SHIP / live HTTPS E2E BLOCKED**
> 边界：默认 capability 关闭；未发布、未部署、未生成 Windows 包。

## 1. 本轮完成

- `config.pull` 从当前加密授权取得 Activity 短票，验证 Activity raw body，再消费 Growth
  RFC 8785 JCS + Ed25519 signed bundle。
- 只解析 `creatoros.model-config@creatoros-model-config-v1` 为不含 identity、digest、签名和
  secret 的安全 `modelPolicy`。
- Growth canonical ticket/bundle fixture 已 byte-for-byte pin。
- LKG 使用既有原生 master key 派生 AES-256-GCM 子密钥，临时文件 `0600`、原子 replace、
  目录 sync、读后验真；原生 key 降级时在出网前 fail-closed。
- 应用 sidecar 就绪、旧激活成功、新 claim 原子落盘后刷新；持续运行每 6 小时加最多
  15 分钟稳定抖动刷新。开关关闭时零出网。
- 领取、反馈与 T-534 signed `channelConfig` 原链路未被替换。
- pending-consume journal 已拆出可测试的 `CredentialBackend`：生产仍固定使用 keyring
  的 macOS Keychain / Windows Credential Manager，CI 用同一 `ProtectedCredentialJournal`
  验证序列化、读回、删除和强杀恢复，不引入普通文件 fallback。
- AM consume 已拆出 `ConsumeTransport`，可确定性注入“服务端已处理但响应丢失”；重试逐字复用
  同一 canonical body。`.license` 原子 replace + readback 也通过注入式失败证明不会提前删除
  journal。
- 增加默认 ignored 的非 fixture live HTTPS harness：只展示 `userCode`，其余 secret 留在
  Rust 内存/独立 OS 凭据项；真实 Growth owner 确认后 exact consume AM，并回读临时
  加密 `.license`。不配置显式开关时不会出网。

## 2. 红→绿

| 红测 | 首次失败 | 最小修复 | 绿色证据 |
| --- | --- | --- | --- |
| 无原生 master key 禁止 LKG/出网 | consumer 使用开发降级 key 后继续请求 provider | 拒绝 `resolveMasterKey(...).degraded` | `client-config.server.test.ts` 12/12 |
| sidecar 就绪后持续刷新 | Rust 编译失败：缺 `client_config_refresh_interval_secs` | 构建期开关 + loopback 空 POST + 6h/≤15min 定时循环 | Rust 定向 1/1 |

## 3. 命令原始摘要

| 命令 | 结果 |
| --- | --- |
| `pnpm exec vitest run`（client-config、claim panel、feedback、local routes、desktop release contract） | 8 files / 74 tests PASS |
| `pnpm exec eslint <T-575 config files>` | PASS |
| `pnpm typecheck` | PASS |
| `cargo test --manifest-path frontend/src-tauri/Cargo.toml entitlement_claim --lib` | 13 PASS；1 个 live HTTPS harness 默认 ignored |
| fresh `CARGO_TARGET_DIR` focused：灭靶点自检 + T-575 启动结构断言 | 2/2 PASS；测试二进制不再自带 `license.rs` 源码 |
| `pnpm --dir frontend exec vitest run`（claim、feedback sidecar/UI focused） | 4 files / 44 tests PASS |
| `node --test orchestrator/process/reviewctl.test.mjs` | 15/15 PASS；constitution 变更可复审重绑，audit 仍 fail-closed |
| `node orchestrator/process/reconcile.mjs` | 0 error；仅既有 BACKLOG bloat warning |
| `CARGO_TARGET_DIR=/private/tmp/creatoros-t575-cargo-target cargo test t575_client_config_refresh_is_bound_to_local_sidecar_and_startup --lib` | 1 PASS |
| `CARGO_TARGET_DIR=/private/tmp/creatoros-t575-cargo-target cargo check --locked` | PASS；范围外 1 个 dead-code warning |
| fixture `cmp` + `shasum -a 256` | PASS；ticket `a71d2177…8620`，bundle `5a2db6c9…3251` |
| `/private/tmp` 干净 HEAD+T-575 快照 `pnpm build` | `0.2.1-beta.3` Turbopack PASS，路由表含 claim/config/feedback |

补充：原全量 Rust 唯一失败已确认是测试自指假阳性：同模块的 T-575 启动结构断言使用
`include_str!("license.rs")`，把整份源码（包括 `obfstr` 参数）原样嵌入 debug 测试二进制；
并非生产授权代码泄漏。最小修复为测试运行时从 `CARGO_MANIFEST_DIR/src/license.rs` 读取，
原结构断言与 `current_exe` 灭靶点扫描均未削弱。fresh target 全量
`cargo test --lib` 为 **147 PASS、1 个 live harness ignored、0 fail**；
`cargo check --locked` PASS（仅既有 decoy `dead_code` warning）。

隔离构建只在临时快照将 `turbopackPluginRuntimeStrategy` 设为 `workerThreads`，原因是 Codex
沙箱禁止 Turbopack 插件子进程绑定本地 IPC 端口；源仓 `next.config.ts` 未修改。webpack
探针因仓库既有 `onnxruntime-node` 原生二进制 loader 不兼容失败，不作为产品构建结果。

## 4. Fixture 互操作

- Creator ticket fixture 与
  `/Users/zyongzhu/Workbase/Thirdspace-growth/docs/contracts/fixtures/config-access-ticket-v1.vector.json`
  `cmp` 相同；SHA-256
  `a71d21773cb2f0b0033a0231c657ec09df24f2a1b07ae99f1c395e35a6fc8620`。
- Creator bundle fixture 与
  `/Users/zyongzhu/Workbase/Thirdspace-growth/docs/contracts/fixtures/growth-client-config-bundle-v1.vector.json`
  `cmp` 相同；SHA-256
  `5a2db6c963a16c06b47956579c7974dba02f73df7fef389d90a515b1ee8f3251`。

## 5. Journal fault matrix

| 故障点 | 结论 |
| --- | --- |
| protected journal 写入/读回失败 | AM 出网前停止 |
| prepared 后强杀、重启进入 attempted | 新 journal 实例从同一 credential backend 恢复，保留同 token/requestId/nonce/digest |
| AM 已处理、响应丢失 | journal 保持 attempted；第二次发送的 canonical body 与第一次逐字相同 |
| AM response 坏 digest/签名/date/identity/closed schema | 零授权落盘 |
| `.license` replace 或读后验真失败 | 注入 readback failure 后 journal 仍为 attempted、delete=0，不猜成功 |
| 正式授权读回成功 | 才删除 journal，并异步触发 config.pull |

## 6. Live harness

命令入口（必须在受控自托管 macOS/Windows runner 上显式配置；不要把变量值写进日志）：

```bash
CREATOROS_T575_LIVE_E2E=1 \
GROWTH_ENTITLEMENT_API_ORIGIN=https://<growth-origin> \
CREATOROS_LICENSE_BASE_URL=https://<am-origin> \
CREATOROS_LICENSE_PUBLIC_KEY_B64=<am-public-key> \
cargo test --manifest-path frontend/src-tauri/Cargo.toml \
  live_https_growth_to_am_non_fixture_harness -- --ignored --nocapture
```

该 harness 会拒绝 `example.com`，需要真实 owner 在 Growth 页面输入 stdout 中唯一允许展示的
`userCode`；验收会拒绝 fixture activation code，并核对签名、项目、设备、OS protected
journal 清理以及 `.license` 原子读回。它不会生成或读取任何生产私钥。

## 7. 工作树隔离

- T-599/T-595 及其 publishing/calendar/backend/contract/治理文件是进入本轮前已经存在的用户
  工作树，全部原样保留。
- 本轮 live-readiness **产品代码**写集仅包含：
  `frontend/src-tauri/src/entitlement_claim.rs`、
  `frontend/src-tauri/src/license.rs`、
  `frontend/src/server/feedback/product-feedback.server.test.ts` 与本 Gate；其中
  `license.rs` 只移除测试二进制的源码自嵌入，不改变生产 wire、派生上下文或反逆向守卫。
  领取/反馈 UI 文件是上一批 T-575/T-538 工作树，未与 T-599/T-595 路径混改。
- 治理收口另修改 `orchestrator/process/reviewctl.mjs` 与其测试，并通过工具合法生成
  `T-595/T-599 round-3` receipt、BACKLOG 引用和 review event；没有手工改写 receipt hash。

## 8. 未解除外部门

- 缺 Growth 正式 `CREATOROS_GROWTH_CONFIG_PUBLIC_KEY_B64` 与
  `CREATOROS_GROWTH_CONFIG_KEY_ID`；不得用 fixture key 猜生产值。
- 当前进程与 `.env.local` 也未提供 Activity/Growth live claim、反馈、Tauri verdict/updater
  所需发布材料；任何 secret 均未读取或回显。
- 因此真实线上 claim consume、config pull、反馈 `202 publicRef`、权威回读、双平台真机
  credential backend 和 Mac beta 打包尚未执行。确定性强杀/丢包/读回矩阵已落地，
  capability 仍保持关闭，不宣称上线。
- 唯一候选版本已推进到 `0.2.1-beta.3`，不会覆盖已存在的 beta.2；出包/回滚步骤见
  `docs/handoffs/T-575-CreatorOS配置联调测试版-beta.3.md`。
