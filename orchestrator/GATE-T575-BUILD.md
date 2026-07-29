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
| `CARGO_TARGET_DIR=/private/tmp/creatoros-t575-cargo-target cargo test entitlement_claim --lib` | 10 PASS |
| `CARGO_TARGET_DIR=/private/tmp/creatoros-t575-cargo-target cargo test t575_client_config_refresh_is_bound_to_local_sidecar_and_startup --lib` | 1 PASS |
| `CARGO_TARGET_DIR=/private/tmp/creatoros-t575-cargo-target cargo check --locked` | PASS；范围外 1 个 dead-code warning |
| fixture `cmp` + `shasum -a 256` | PASS；ticket `a71d2177…8620`，bundle `5a2db6c9…3251` |
| `/private/tmp` 干净 HEAD+T-575 快照 `pnpm build` | `0.2.1-beta.3` Turbopack PASS，路由表含 claim/config/feedback |

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
| prepared→attempted 崩溃 | 保留同 token/requestId/nonce/digest，重启 exact replay |
| AM response 坏 digest/签名/date/identity/closed schema | 零授权落盘 |
| `.license` replace 或读后验真失败 | 保留 journal，不猜成功 |
| 正式授权读回成功 | 才删除 journal，并异步触发 config.pull |

## 6. 未解除外部门

- 缺 Growth 正式 `CREATOROS_GROWTH_CONFIG_PUBLIC_KEY_B64` 与
  `CREATOROS_GROWTH_CONFIG_KEY_ID`；不得用 fixture key 猜生产值。
- 当前进程与 `.env.local` 也未提供 Activity/Growth live claim、反馈、Tauri verdict/updater
  所需发布材料；任何 secret 均未读取或回显。
- 因此真实线上 claim consume、config pull、反馈 `202 publicRef`、权威回读、OS keychain
  强杀恢复和 Mac beta 打包尚未执行。capability 保持关闭，不宣称上线。
- 唯一候选版本已推进到 `0.2.1-beta.3`，不会覆盖已存在的 beta.2；出包/回滚步骤见
  `docs/handoffs/T-575-CreatorOS配置联调测试版-beta.3.md`。
