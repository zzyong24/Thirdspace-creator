# T-1060 原生 MCP 启动链核对

日期：2026-10-04。共享源码只读；编译/测试/临时文件均位于 `/tmp/t1060-native-cli-verify`。没有操作真实 WorkBuddy、读取实际授权文件或更改全局配置。

## 已验证与结论

新增 Rust 测试 `cli_access::tests::workbuddy_mcp_launch_is_exact_bundled_argv_without_credentials` **实际通过：1 passed / 0 failed / 9 filtered**，exit 0。当前 `cli_access.rs` 原样复制的 SHA256 为 `b636bb14f33dc457701563508134c6a1d703198c367055865277e8c8efa6ad58`。

测试验证真实临时文件条件、含空格/中文路径保持单 argv、原生 node command、`--connection-file` 参数顺序、无 token/nonce/秘密导出、关闭时不输出及缺可执行文件时不输出。测试在 macOS 执行，其中 `.exe` 文件名仅是夹具，不能证明 Windows spawn。

隔离 crate 使用原 lock 中同版本 serde/serde_json/sha2/tauri，Tauri `default-features=false` 只排除完整桌面 WebView 运行时。模块编译成功，13 条未使用警告源自孤立模块。未编译完整桌面包；没有无关错误需要修复。

证据：`/tmp/t1060-native-cli-verify/cargo-test.log` 与 `evidence.json`，命令、哈希与范围位于 evidence。源码未重写或裁剪，仅用最小 lib 导入整个模块。

## 实际调用链

```mermaid
flowchart LR
  P[原 build-sidecar 组装随包 Node 与 CLI] --> R[壳 resolve_sidecar_dir 选择实际 runtime]
  R --> L[原生 mcpLaunch：command 与逐项 args]
  L --> U[设置：复制或下载本机配置]
  U --> W[WorkBuddy 添加服务器及用户首次信任：待验]
  W --> C[随包 CLI mcp serve]
  C --> D[discoverConnection：安装身份与租期]
  D --> M[原 MCP tools/call]
  M --> H[原 dispatch 权限、账号归属与业务服务]
```

| 接点 | 已读取的实际代码与作用 |
| --- | --- |
| 打包 | `frontend/scripts/desktop/creatoros-cli-runtime.mjs:10,60` 的 `creatorOsCliRuntimePaths/stageCreatorOsCliRuntime` 产 `frontend/cli/creatoros.cjs`；非 macOS 复制当前构建 Node 到 `cli/node.exe` 或 `cli/node`；macOS 复用 server.app。`build-sidecar.mjs:270,2388,455` 将 CLI 装入 runtime，并在最后封包前断言文件齐全。 |
| bundle入口 | `mcp-server/scripts/build-runtime.mjs:14` 从 `src/sea-entry.ts` bundle CJS，target Node25；SEA entry 直接调用原 `main()`。MCP SDK 与 contract 一起 bundle，不需用户另装 npm/tsx。 |
| macOS Node | `build-sidecar.mjs:1725` 的 `buildServerApp()` 复制 Node 本体；依赖库由既有打包流程改成相对 `@rpath`，并非 shell launcher。 |
| 随包路径 | `frontend/src-tauri/src/lib.rs:1626,2118` 的 `resolve_sidecar_dir` 与 cfg 分支产生实际 macOS `server.app/Contents/MacOS/creatoros-server`、Windows `cli/node.exe`、Linux `cli/node`，脚本统一 `frontend/cli/creatoros.cjs`。debug 源路径只在 debug 分支，release 使用实际安装/展开 runtime。 |
| 原生导出 | `cli_access.rs:114,597` 的 `mcp_launch/cli_access_status` 只输出 enabled + 存在文件 + 绝对 UTF-8 安全路径；status enabled 先校验凭据与本次 launch、pid、租期匹配。command/args 不借助 PATH、sh、cmd.exe、PowerShell 或 `.cmd`。 |
| 前端交付 | `cli-access-card.tsx:125` 的 `transferConfig` 仅 JSON 序列化 native argv；复制/download 与 host 首次信任/真实工具调用分别说明。不会写 WorkBuddy 文件。 |
| 启动/握手 | `mcp-server/src/cli.ts:241,577` 的 `clientFor/runCliCommand` 接受 `--connection-file`；env 清空 `CREATOROS_BASE_URL` 进入安装发现。`connection.ts:161` 校验文件权限、protocol、process/lease、product/package/nonce，再生成 loopback base URL；未把秘密装入公开配置。 |
| 工具/落账 | `server.ts:27` 的 `createCreatorOsMcpServer` 复用 contract tools、apply/idempotency/confirmImpact；`dispatch.ts:165` 请求真实 `/api/v1/dispatch`；`frontend/src/app/api/v1/dispatch/route.ts:130` 再校验 CLI token 与本次 launch 身份，沿原账号归属/后台服务。 |
| 关闭 | `cli.ts:289` 的 `serveMcpStdio` 幂等关闭本 MCP，EOF/信号不取消原后台业务任务。 |

## 仍需真实客户端或跨平台验证

1. WorkBuddy 的本机 stdio 添加、其解析 `type/command/args/env` 的行为、空 env override 是否确实覆盖继承的开发 BASE_URL、首次信任及 `accounts_list → projects_list → 指定项目` 实调均未做。本轮测试不能替代这些。上游作者 5.5.4 的记录主要是手工 HTTP，不是当前 CreatorOS stdio 真机 PASS。
2. Windows command 是 `.exe` 且参数分离，源码路线正确；实际 Windows 文件权限/杀进程/特殊路径、NSIS 安装后 Node 与 CLI 文件、WorkBuddy 直接 spawn 与下载行为未验证。macOS 完整签名/公证/干净用户机 Node 拉起也未验证。
3. Linux 现有打包路径可表达 Node + argv；WorkBuddy Linux 客户端及其安装/信任能力未核定，本任务不据此宣称三平台产品可用。当前宿主构建复制 `process.execPath`，并非跨目标自动生成正确 Node，跨编译包需另做原发行流程验收。
4. 配置含本机运行时的绝对路径，重装、runtime 版本/位置变化后应重新生成；公开 ZIP 只有占位符，不是自动解析宿主路径的市场安装器。不能把 ZIP 生成成功称为市场审核或宿主安装完成。
5. 需 CreatorOS 保持运行并开启 CLI 权限。撤销/退出/重启后旧连接按原身份门失败，已有 MCP 应重新启动以发现本次 launch；这条真实跨应用恢复行为未验。CLI 只提供工具入口，不负责启动/控制 WorkBuddy 会话。
6. 设置侧只观察复制或 Blob 触发，没有宿主信任回执或文件落盘回执；状态按事实显示“已复制/已生成”，不显示“已连接”。既有启动发现失败走原 CLI 错误退出，WorkBuddy 对该错误的展示尚未知。

原始固定来源及许可仍在 `scripts/workbuddy/SOURCE.md`，本轮未追加调研、下载或 vendor 运行。
