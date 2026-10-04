# T1060 最后两处增量独立复核

## 结论

本次限定实现增量 `findings: []`。Codex 目录错误已修正，回环代理修复沿原环境与权限链生效；未发现新增协议、工具或权限放宽。此结论仅覆盖所列源文件、隔离测试与已提供的会话证据，不等于 Windows 实包启动、真实模型工具回合或图片验收通过。

## 1. Codex 0.159.3 目录纠正

已只读核对本机锁定官方包 `node_modules/.pnpm/@openai+codex@0.159.3/node_modules/@openai/codex/bin/codex.js:79-93`，真实入口拼接为 `vendorRoot / targetTriple / bin / codex(.exe)`，其字节 SHA 与归档副本一致。原 Worker 的 `codex-app-server.ts:55` 已使用这个布局。

`tools/windows-closure-rat/stage-layered-workers.mjs:110` 本轮生产修改仅把 Windows x64 检查路径改为 `@openai/codex-win32-x64/vendor/x86_64-pc-windows-msvc/bin/codex.exe`。三层顺序、非空文件检查、fs-safe 路径、上一轮已解决的 alias 身份检查及复制行为保持原状。

相关夹具改为真实目录，并新增三层正确目录接受、只有旧目录拒绝以及锁版官方入口/Worker resolver/检查路径一致的回归。独立当场运行既有 Node 套件：32 项通过、0 失败、0 跳过，exit 0（1368.746792 ms）。提供方日志的修前 RED 为 6 通过、26 失败，修后 GREEN 为 32 通过，已核对日志与 SHA；没有独立重演历史 RED。

此前 25 项采用旧 `codex/codex.exe` 夹具的结果只能证明当时身份与复制算法在夹具下的行为，不能证明 Windows 合法实包目录通过。本文明确修正这一证据限制；本次 32 项仍没有执行 Windows EXE、原生绑定或完整发行包。

## 2. 回环 MCP 代理环境

`ai-worker/src/execution/codex-acp-host.ts:15-19` 复用原 `codexRuntimeEnvironment` 白名单，保留原 `HTTP_PROXY/HTTPS_PROXY` 和双方原绕过值，将两个绕过值合并后只追加 `127.0.0.1,localhost,::1`，写入同值的 `NO_PROXY/no_proxy`。源环境未被修改，没有新增全网绕过值或模型渠道覆盖。

第 32-35 行把该环境传给原 AcpClient。其 `vendor/acpx/src/acp/client.ts:742-746` 与 `auth-env.ts:95-120` 使用宿主显式环境；原 adapter 的 `vendor/codex-acp/src/index.ts` 调用 `startCodexConnection`，该连接通过 `CodexJsonRpcConnection.ts:17-25` 把进程环境交给固定 Codex 二进制。因此修复覆盖实际 MCP 初始化所用的原生子进程。Windows 原有环境键大小写归一化只保留等价值，未改变该既有行为。

```mermaid
flowchart LR
  A[原环境白名单与代理] --> B[追加回环绕过]
  B --> C[原 AcpClient 子进程]
  C --> D[原 adapter 与固定 Codex]
  D --> E[回环 MCP 桥]
```

只读对比补丁，原只读 sandbox、用户审批策略、禁用功能、全局 MCP 禁用、请求工具集合与 deny-all/fs=false/terminal=false 均未改变。没有修改原 native preflight、工具桥、协议或任务权威。

独立当场运行 `pnpm exec vitest run src/execution/codex-acp-host.test.ts --retry=0`：1 文件、3 项全部通过，exit 0，开始于 18:13:01，941 ms。覆盖原大小写绕过与代理保留、无原绕过时只加回环、原白名单与源环境不变。提供方正式 RED 日志为 3 项失败、最终 GREEN 为 3 项通过；已核对原始日志，不将首次准备失败当作产品 RED。

## 真实调用证据边界

已读取提供方最终会话日志 `/tmp/t1060-mcp-compat/evidence/session-final-green.log`：`created=true`、真实 sessionId 存在、`listCalls=2`、`toolCalls=0`、`promptSent=false`。它支持最终原 adapter 能创建该会话、完成工具发现，不能证明执行工具或模型输出。根会话正在运行的 prompt/tool probe 尚未提供最终结果，本复核未执行或评价该探针。此前纯文本回合也不能替代工具或图片验收。

## 冻结字节

| 工件 | SHA-256 |
| --- | --- |
| `stage-layered-workers.mjs` | `0c25dfe6150733c6495afb2b597119ae6d0a40c52bf879f026e1e0cf5c938de3` |
| `stage-layered-workers.test.mjs` | `963afb6dcf4d3bce62f49c74bc776c1e2be70f01c07b57d4d3be5d9377ed0d45` |
| `codex-acp-host.ts` | `edb4c55bb81a5d550e3f0549327b333a23fb1226f728ac3b9362c29ddcf5bab5` |
| `codex-acp-host.test.ts` | `aaa6d403518e35a32476efb2deafaf94e0a7de746333f3478c9fc32349ef52f8` |
| 官方 `bin/codex.js` 与归档副本 | `61b0194f3bb6534439c8d26a3ed57d0805f84b884588b761795323eeb92fcf70` |
| `/tmp/t1060-codex-bin-layout-implementation.patch` | `bf503e496e43fc79a83f0ae0ab96c58f6d4e4a10bd5185e141ac8156f6f97fea` |
| `/tmp/t1060-mcp-proxy-implementation.patch` | `cfd32c48bd722dabf0eefabc268a4454377a18e14ee63f7228d18d6fe9d85d66` |
| bin 布局 RED 日志 | `c34d733716c26ef596c2bae68512cee7c112f9fd9c8f0762794c100c895b6712` |
| bin 布局 GREEN 日志 | `51cb60ade7d8489536caaab8188cb3024de0d949ed593251bcce0e719efd2abe` |
| 代理环境正式 RED 日志 | `25f00655b9f7e8c7713e9b2a21a05176ca1f0c63fe7a81ba63d76dd52dd658bf` |
| 代理环境最终 GREEN 日志 | `9be6a5461f271714ccf64295eef1de103bd3143e1b67c4ae245d3951297c91b4` |
| 会话最终 GREEN 日志 | `ee7d59162cb06c3774271a3dafdb49f2e66a840e58fd6894d1853fbf90545242` |

共享源文件只读；仅本报告写入 `/tmp`。未运行真实 Agent、浏览器、Windows 工具或安装依赖，未读取凭据。
