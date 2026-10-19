# T1044 Codex App Server 公共接口探针（2026-10-01）

本报告只使用官方 npm 包、公开源码和 `/tmp` 内的假配置。未读取用户 `auth.json`、token、真实配置或项目数据；未调用 `turn/start` 或模型。

## 结论

采用随应用锁定的 `@openai/codex@0.159.3` 平台二进制，直接启动其 `app-server --stdio`。保留默认 `CODEX_HOME`，让 Codex 自己使用现有 file/keyring 登录；CreatorOS 不定位、读取、复制或链接 `auth.json`。应用只调用 `account/read(refreshToken:false)` 并将响应在内存中缩减为“是否已登录/账号类型”。

每个临时任务使用独立 `cwd`，以 `initialize.capabilities.experimentalApi=true` 启动临时 `thread/start`，固定 `ephemeral:true`、`approvalPolicy:"never"`、`sandbox:"read-only"`、`environments:[]`、任务冻结的 `dynamicTools`。`environments:[]` 是关键：0.159.3 源码规定空数组禁用执行环境；工具装配代码中的原生命令、`apply_patch`、`view_image`、权限提升工具都要求存在执行环境。不能用 `sandboxPolicy.readOnly.access` 限制目录：0.159.3 明确拒绝 `access=restricted`，0.156.1 和 0.159.3 实际生成 schema 都没有该字段。

此模式仍须关闭 hosted web、图像生成、浏览器、电脑、apps、plugins、hooks、多 Agent，并处理用户配置的 MCP。**不能对外声称“模型工具列表字面上只有 dynamicTools”**：按模型目录仍可能注册时钟、请求用户输入等无业务数据 I/O 的内置工具。服务端应对非任务工具回调 fail closed，并把业务数据访问只交给任务绑定 `dynamicTools`。

## 版本与实测

| Codex | 官方来源 | `account/read` | `thread/start.dynamicTools` / `environments` | `readOnly.access` |
|---|---|---|---|---|
| 0.156.1 | 随旧 codex-acp 安装的官方平台包 | 无凭据假 home 下返回成功、账号空 | 实验 API 下临时 thread/start 接受两字段 | schema 仅 `type`、`networkAccess` |
| 0.159.3 | `npm pack @openai/codex@0.159.3-darwin-arm64` | 同上 | 同上 | 同上，源码还明确拒绝旧 `access=restricted` |

0.159.3 临时 thread/start 应答摘要：`approvalPolicy=never`、`sandbox={type:readOnly,networkAccess:false}`、`cwd=/private/tmp/.../workspace-0159`、有 thread ID。实验 `environments`/`dynamicTools` 不在应答中回显，其接受性由无 turn 的 RPC 成功与官方源码共同支持。假 MCP `probe` 经 `-c mcp_servers.probe.enabled=false` 后，新线程 `mcpServerStatus/list` 的 `runtimeStatus=disabled`。

可复现：

```bash
cd /tmp/creatoros-open-source-references/codex-schema-probe
env CODEX_HOME="$PWD/home-0159" "$PWD/bin-0159/package/vendor/aarch64-apple-darwin/bin/codex" app-server generate-json-schema --out "$PWD/schema-0159"
python3 -u probe_thread.py "$PWD/bin-0159/package/vendor/aarch64-apple-darwin/bin/codex" 0159
python3 probe_config.py "$PWD/bin-0159/package/vendor/aarch64-apple-darwin/bin/codex" -c 'mcp_servers.probe.enabled=false' -c 'features.plugins=false' -c 'features.apps=false'
```

`probe_config.py` 的假配置位于 `home-config-probe/config.toml`，仅含指向 `127.0.0.1:9` 的无凭据 MCP；输出仅有名称、启用布尔值和状态。对照探针证明 `-c 'mcp_servers={}'` **不清空**原配置中的 `probe`，逐名 `enabled=false` 才有效。0.159.3 的配置探针确认 `webSearch=disabled`、`pluginsFeature=false`、`mcpServers.probe=false`；无模型回合。

## 生产进程参数与门禁

最小明确能力关闭参数（通过 argv 数组传递，不经 shell）：

```text
app-server --stdio
-c web_search="disabled"
-c features.apps=false
-c features.plugins=false
-c features.hooks=false
-c features.multi_agent=false
-c features.multi_agent_v2=false
-c features.image_generation=false
-c features.browser_use=false
-c features.computer_use=false
-c features.code_mode=false
-c features.code_mode_host=false
-c features.tool_suggest=false
-c features.shell_tool=false
-c features.unified_exec=false
-c features.view_image=false
```

最后三项在 `environments:[]` 下是防御性覆盖。`web_search` 必须用顶层模式 `disabled`，仅关旧 `features.web_search*` 不够。若产品明确不允许其它发现/安装入口，再加 `features.skill_search=false`、`features.skill_mcp_dependency_install=false`；这些与原生文件权限边界无关。

启动前在同一 Codex 二进制上做版本门和假 home 能力探针。真实登录预检：启动 app-server，以 `initialize` 握手后调用 `account/read({refreshToken:false})`；只保留 `account != null` 和 `account.type`，不记录完整响应。配置预检：调用 `config/read({includeLayers:false,cwd:taskWorkspace})`，只在内存提取有效 MCP 名、`enabled` 和关键 feature 布尔值。依据 MCP 名构造根值 `-c 'mcp_servers={"原名"={enabled=false}}'`（原名在 TOML value 中编码，不在 override key 加引号），重启 app-server，重复 `config/read`；`thread/start` 后用 `mcpServerStatus/list({threadId,detail:"toolsAndAuthOnly"})` 检查所有非任务 MCP 为 `disabled`。任何未知/非 disabled 服务器、配置覆盖失败、实验字段拒绝或版本偏差都在 `turn/start` 前拒绝任务。不得落盘原始 RPC 帧、配置、账号响应或 stdout/stderr 里的敏感值。

`CODEX_HOME` 的用户配置本身仍由 Codex 读取；0.159.3 `app-server --help` 没有 `--ignore-user-config`，而空表 `mcp_servers={}` 不会清掉合并后的服务器。因此不能声称整个用户配置被忽略。该路径保证的是已证实的工具权限边界，并以启动前有效配置/运行时 MCP 状态门禁排除非任务外部工具。没有真实登录或模型回合 E2E，尚不能宣称全平台最终验收。

## 官方依据

- [`ThreadStartParams`：空 `environments` 禁用执行环境；`dynamicTools` 为实验字段](https://github.com/openai/codex/blob/rust-v0.159.3/codex-rs/app-server-protocol/src/protocol/v2/thread.rs#L134-L151)
- [工具装配：执行环境门、动态工具注册、MCP 独立注册](https://github.com/openai/codex/blob/rust-v0.159.3/codex-rs/core/src/tools/spec_plan.rs#L149-L175)
- [工具装配：shell、补丁、图片查看和权限工具的门](https://github.com/openai/codex/blob/rust-v0.159.3/codex-rs/core/src/tools/spec_plan.rs#L1079-L1288)
- [工具装配：hosted web 与多 Agent](https://github.com/openai/codex/blob/rust-v0.159.3/codex-rs/core/src/tools/spec_plan.rs#L622-L741)
- [0.159.3 拒绝旧 `readOnly.access=restricted`](https://github.com/openai/codex/blob/rust-v0.159.3/codex-rs/app-server-protocol/src/protocol/v2/permissions.rs#L537-L648)
- [官方 App Server `account/read`、MCP 状态和实验工具说明](https://developers.openai.com/codex/app-server)
- [官方配置说明：`web_search=disabled` 和 MCP 单项启用](https://developers.openai.com/codex/config-reference)
- [官方认证说明：file/keyring 由 Codex 持有](https://developers.openai.com/codex/auth)
