# T-1060 适配器隔离交付

共享工作树未写；修改在 `/tmp/t1060-codex-patch`。原 Apache-2.0 LICENSE 保留，固定上游 2.1.1 / `68d7d2d5ddfc0ed5746f9f6130892dda685e65dd`，基准运行闭包与主会话复制来源一致。

## 交付顺序

1. `/tmp/t1060-codex-policy-tests.patch`：独立 7 个行为测试。主会话已告知当场 RED 为 7 failed；本报告不替代主会话原日志。
2. `/tmp/t1060-codex-policy-test-fixture.patch`：变量路径动态导入防止项目 tsc 穿透缺失的 type-only generated 声明；为原生 MCP 启动等待补正确替身。
3. `/tmp/t1060-codex-policy-test-types.patch`：保证单元素 fixture 的非空证明。
4. `/tmp/t1060-codex-adapter.patch`：初始实现 7 个 vendor 文件。
5. `/tmp/t1060-codex-adapter-cjs.patch`：2 行 CJS require 路径兼容，共计 8 个 vendor 文件。
6. `/tmp/t1060-codex-policy-empty-mcp.patch`：原首个测试补空 MCP 与额外 argv 拒绝。

`/tmp/t1060-codex-adapter-final.patch` 为原始基准到当前 vendor 的完整合并差异，供归档，不需在已应用初始补丁后重复应用。逐文件前后 SHA 在 `/tmp/t1060-codex-patch/changed-files.json`，原全目录 SHA 在 `source-before.json`；工件与现场日志 SHA 在 `evidence/artifact-sha256.json`。

## 落点

- `CodexJsonRpcConnection.ts`：固定 argv 透传、shell=false、冻结路径核对、删除原始传输日志。
- `CreatorOsPolicy.ts`：固定权限/配置/argv 一致核验，保留全局禁用 MCP 合并，原生线程权限与实际分页工具集合核验，真实回合元数据。
- `CodexAcpClient.ts`：原 newSession 创建链内核验实际 config/read、ThreadStartResponse、线程 mcpServerStatus/list；沿已有原生启动等待，不用请求 sandbox 充当证明。
- `CodexAcpServer.ts`：原 prompt 路径维持只读；PromptResponse._meta.creatoros.codex 来自真实原生回合；缺值不造终态；宿主模式不缓存 stderr。
- `CodexEventHandler.ts`：原标准 session_info_update 的 update._meta.creatoros.codex 传递原生 started/completed 回合。
- `StdUtils.ts` / `index.ts`：移除解析错误原文及启动配置/认证/正文日志；版本来自静态 package JSON。
- `CodexCli.ts`：原 generic fallback 的 createRequire 在 CJS 取 __filename，ESM 留原 import.meta.url；未运行该 CLI 分支。

不新增 ACP 方法、不复制 task/manager/persistence。新会话仅在真实权限与工具核验完成后返回。

## 当场验证

- 隔离 esbuild adapter bundle 成功，原选依赖从主会话已安装路径只读解析。
- 纯净环境 `--version` 成功：`@agentclientprotocol/codex-acp 2.1.1`。日志 `evidence/adapter-build-cjs.log`、`adapter-version-cjs.log`。
- 复用主会话实际 `codexProcessArguments` 的纯结构检查成功：空及一个全局 MCP 的 config/argv 一致；非法额外启动配置拒绝。日志 `evidence/config-argv-check.log`，自写检查源 `check-config-argv.ts`。
- 命令运行于 Node v25.9.0，构建目标 node24。没有 Node24 真运行证据。
- CJS 构建仍有两处 ESM fallback import.meta 静态警告；CJS 实际走 __filename，新增宿主模式冻结 CODEX_PATH，使 generic fallback 不可达。index.ts 没有 import.meta 版本路径。
- 未运行真实 Agent、模型、登录或凭据读取；本子任务未执行完整适配器 tsc（原 type-only generated 闭包未迁入）。聚焦行为 GREEN 与项目 tsc、集成 Gate 以主会话现场日志为准。
