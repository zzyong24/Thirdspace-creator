# T-1059：Codex 宿主接入代码复用核对

日期：2026-10-04。结论仅为固定源码核对；产品接通、取消恢复、图片导入及兼容性实测均待实施。没有安装依赖、执行第三方脚本、运行测试/模型/浏览器、读取用户认证或修改仓库。

## 选定一条

**选择 `openclaw/acpx` 的 `AcpClient` 与其进程/流/SDK 辅助代码，连接维护中的 `@agentclientprotocol/codex-acp`。** 复用现有客户端，CreatorOS 仅做既有任务、权限、回执与资产服务的必要接线。

不采用 acpx 的任务编排、会话历史、文件存储或运行时管理器；不复制 AionCore 的既有会话/数据库系统；CodeBuddy 不注册、不提供入口，不作为候选。

```mermaid
flowchart LR
  U[现有聊天或业务请求] --> O[CreatorOS 原任务与权限服务]
  O --> C[复用 acpx AcpClient]
  C --> A[固定版本 codex-acp]
  A --> X[Codex 自身模型与认证]
  X --> M[本轮限定的 CreatorOS 工具接口]
  M --> B[原后端服务与候选采纳]
  A --> R[文字 / 工具 / 图片回执]
  R --> O
```

用大白话说：借用别人已经接通的客户端和适配器；任务归属、保存、采纳和图片入库仍由现有产品服务管理。

## 固定来源、许可与依赖来源

| 来源 | 本轮固定身份 | 许可及边界 |
|---|---|---|
| acpx | `27efb1b57b9de22105a91e9154b1d29b51ede8cb`；版本 `0.19.4`；提交时间 `2026-10-03T05:13:59Z` | 根 LICENSE 与 package 均为 MIT。复制代码须保留版权和许可原文。它是 TypeScript/Node 项目，无 Electron 依赖；Node 要求 `>=22.13.0`。 |
| Codex ACP 适配器 | acpx 默认范围为 `@agentclientprotocol/codex-acp@^1.1.5`；本轮读取了 **1.1.5** 的公开包元数据，`gitHead=ca66e03adbc18072cd3395f140fdcd3c86fd2403` | 包声明 Apache-2.0；仓库为 `agentclientprotocol/codex-acp`。这是来源身份，不是本轮真实连接结果。适配器源码的完整能力由维护桥专项核对，不从 npm 依赖声明推断全部能力。 |
| ACP TypeScript SDK | acpx lock 实际解析 `1.5.1`；公开包元数据 `gitHead=c77d9bd204b6a05a10137632e46e84908191f9de` | Apache-2.0，来源 `agentclientprotocol/typescript-sdk`。 |

直接来源：[acpx LICENSE](https://github.com/openclaw/acpx/blob/27efb1b57b9de22105a91e9154b1d29b51ede8cb/LICENSE)、[acpx package](https://github.com/openclaw/acpx/blob/27efb1b57b9de22105a91e9154b1d29b51ede8cb/package.json)、[适配器 1.1.5 元数据](https://registry.npmjs.org/@agentclientprotocol%2Fcodex-acp/1.1.5)、[SDK 1.5.1 元数据](https://registry.npmjs.org/@agentclientprotocol%2Fsdk/1.5.1)。

acpx 生产依赖清单为 SDK、`@openclaw/fs-safe`、commander、skillflag、tsx、zod；lock 中 SDK=`1.5.1`、fs-safe=`0.21.3`、zod=`4.6.5`。独立摘取客户端时保留实际相对依赖闭包；不从 CLI 全包清单推断每项均为客户端必需。适配器 1.1.5 自身声明 `@openai/codex:^0.144.6`、SDK `^1.2.1`、vscode-jsonrpc、zod、diff、open；仍有浮动范围，因此后续分发合同必须锁定完整解析链，不能只锁顶层版本后声称可复现。

**不使用浮动 `npx -y`。** 固定包版本及摘要后，使用经核对的本地适配器可执行引用；不在用户运行任务时下载 latest、安装或修复包。适配器与 CreatorOS 当前捆绑 Codex `0.159.3` 是否兼容，本轮没有实测，不能默认等同。

本轮主报告选择的是维护适配器 **v2.1.1 / 68d7d2d5ddfc0ed5746f9f6130892dda685e65dd**，并单独核对了实际源码和 Apache LICENSE；见 [主报告](reuse.md) 与 [来源清单](source-manifest.json)。上表 1.1.5 只说明 acpx 已有默认消费路径的来源，不作为本次最终分发版本；新版本组合兼容仍待真实实施验证。

## 已实现的接入事实：不是 README 宣称

| 能力 | 实际文件/函数 | 本轮事实 |
|---|---|---|
| 默认 Codex 接入 | [agent-registry.ts:65](https://github.com/openclaw/acpx/blob/27efb1b57b9de22105a91e9154b1d29b51ede8cb/src/agent-registry.ts#L65) | 默认 argv 为 `npx -y @agentclientprotocol/codex-acp@^1.1.5`；已安装 bin 为 `codex-acp`。不是旧 `@zed-industries` 包名。注册表有命令解析和安装路径优先逻辑；产品只启用固定 Codex 引用。 |
| 建立连接 | [client.ts:628](https://github.com/openclaw/acpx/blob/27efb1b57b9de22105a91e9154b1d29b51ede8cb/src/acp/client.ts#L628) `AcpClient.start`；[client.ts:1012](https://github.com/openclaw/acpx/blob/27efb1b57b9de22105a91e9154b1d29b51ede8cb/src/acp/client.ts#L1012) `createConnection` | 真正启动子进程和 SDK 连接，使用 `client(...).onNotification(...).onRequest(...).connect(stream)`，随后 initialize；没有自写协议栈。 |
| 新建与恢复 | [client.ts:1178](https://github.com/openclaw/acpx/blob/27efb1b57b9de22105a91e9154b1d29b51ede8cb/src/acp/client.ts#L1178) `createSession`；1230 `loadSession`；1275 `resumeSession` | 实际调用 SDK 的 session new/load/resume，并传入 cwd 与 MCP 配置。支持情况仍看 initialize 返回能力。 |
| 发送 | [client.ts:1316](https://github.com/openclaw/acpx/blob/27efb1b57b9de22105a91e9154b1d29b51ede8cb/src/acp/client.ts#L1316) `prompt` | 现成提示输入、控制权检查、事件和回合取消处理。 |
| 取消与关闭 | [client.ts:1617](https://github.com/openclaw/acpx/blob/27efb1b57b9de22105a91e9154b1d29b51ede8cb/src/acp/client.ts#L1617) `cancel`；1718 `close` | 发送 session cancel、撤销当前交互、等待/清理进程；不能把“取消通知写出”当远端已终止或未扣费的证明。 |
| 认证 | [client.ts:2069](https://github.com/openclaw/acpx/blob/27efb1b57b9de22105a91e9154b1d29b51ede8cb/src/acp/client.ts#L2069) `selectAuthMethod`；2144 `authenticateIfRequired` | 根据 Agent 声明方法读取显式环境/配置来源，必要时调用 authenticate；无匹配值时默认 skip，允许 Agent 自行处理。它不是 CreatorOS 激活授权，不能伪造登录成功。 |
| 权限与交互 | [client.ts:1025](https://github.com/openclaw/acpx/blob/27efb1b57b9de22105a91e9154b1d29b51ede8cb/src/acp/client.ts#L1025)、[types.ts:287](https://github.com/openclaw/acpx/blob/27efb1b57b9de22105a91e9154b1d29b51ede8cb/src/types.ts#L287) | 已有权限请求回调与 ACP elicitation 处理。是否能承接 Codex 某个原生问答请求，还需适配器实际映射证据；不按方法同名推断。 |
| 生命周期接点 | [client.ts:864](https://github.com/openclaw/acpx/blob/27efb1b57b9de22105a91e9154b1d29b51ede8cb/src/acp/client.ts#L864)；[types.ts:280](https://github.com/openclaw/acpx/blob/27efb1b57b9de22105a91e9154b1d29b51ede8cb/src/types.ts#L280) | `processLifecycle.onBeforeSpawn/onSpawned/onSpawnFailed/onExit` 可以接现有进程准入与回执；客户端本身不保存数据库记录。 |

## 精确摘取边界与依赖文件

客户端主文件是 **`src/acp/client.ts` 的 `AcpClient`**。以下是该文件实际引用的第一层源码依赖与邻近辅助模块，不能只复制单文件后遗漏相对模块：

- SDK/连接及流：`src/acp/client-protocol.ts`、`client-process.ts`、`ndjson-stream.ts`、`observed-stream.ts`、`process-descendants.ts`；`jsonrpc-error.ts` 属相邻模块引用链。
- 进程及认证：`src/agent-registry.ts`、`src/spawn-command-options.ts`、`src/acp/agent-command.ts`、`agent-session-id.ts`、`auth-env.ts`、`command-probe.ts`。
- 控制、权限、提示和错误：`src/async-control.ts`、`src/errors.ts`、`src/types.ts`、`src/filesystem.ts`、`src/permissions.ts`、`src/prompt-content.ts`、`src/acp/error-shapes.ts`、`model-support.ts`、`codex-compat.ts`、`terminal-manager.ts`、`session-control-errors.ts`。

这是第一层清单，不冒称已完整编译依赖闭包。上述模块本身的相对引用仍须按同一固定提交保留；后续源码复用合同登记完整闭包及第三方许可。原许可、版权和来源 commit 一并保留。必要适配限于宿主参数、可信启动引用、环境过滤、权限结果、事件与 service ports，不另写 ACP、恢复算法或模型执行器。

重要包边界：acpx 公布 `acpx/runtime`，但没有公开导出 `AcpClient` 类；构建入口只有 cli/flows/runtime/agent-registry。不能凭 package 的 `./dist/*` 通配导出断言 `dist/acp/client.js` 实际随包存在。独立客户端采用 **固定源码依赖闭包，加一个仅导出原类的入口**，或维护小型上游源代码补丁；不依赖不存在的发布子路径。

## 为什么不用公开 runtime 管理器

`AcpxRuntime` 确实能调用，`AcpRuntimeOptions.sessionStore` 必填且 `AcpSessionStore.load/save` 可注入，所以不是“只能文件落盘”的实现。

然而 [manager.ts](https://github.com/openclaw/acpx/blob/27efb1b57b9de22105a91e9154b1d29b51ede8cb/src/runtime/engine/manager.ts) 还自己维护 SessionRecord、对话 reducer、checkpoint、排队、保留连接与重连：498 等处调用 store.save，845 ensureSession，1173 起创建回合队列。仅把 store 替换成数据库不会自动消除第二套产品历史与任务语义。

因此主路径直接使用 **AcpClient**，不引入 `AcpRuntimeManager`、`createSharedAcpRuntime`、flows、CLI queue、`createFileSessionStore`、历史导入/导出或磁盘锁。provider 连接内的临时状态由原类处理；产品任务、会话映射、重试和正式历史仍由 CreatorOS 既有服务管理。

## 图片、权限、取消恢复：明确缺口

### 图片

- [client.ts:2792](https://github.com/openclaw/acpx/blob/27efb1b57b9de22105a91e9154b1d29b51ede8cb/src/acp/client.ts#L2792) 的 `handleSessionUpdate` 将原 SessionNotification 传给 `onSessionUpdate`，无需把 ACP 图片压成纯文本。该回调同步调用，同步异常只记日志；回调投递不等于已保存。宿主必须接入现有可靠回执管道，持久化成功后才确认产品状态。
- 作为字段保留参考，[events.ts:506](https://github.com/openclaw/acpx/blob/27efb1b57b9de22105a91e9154b1d29b51ede8cb/src/runtime/public/events.ts#L506) 保留 `rawOutput`，工具事件也有 `content`；可摘取相应字段处理函数，不使用文本摘要作为资产证据。
- acpx 不提供 CreatorOS 资产入库、作品归属或用户采用。适配器实际是否提供图片块/文件路径，以及路径是否可读，都仍需真实版本核验。必须通过原资产服务校验执行身份、工作区路径、文件类型/大小、幂等和候选归属；不凭模型文本中的路径直接入库。
- 原 `codex-native-turn.ts` 只提取文字，原 host 关闭 image_generation；引入源码不等于已经生图成功。

### 权限与环境

- 明确 `fs:false`、`terminal:false` 关闭客户端托管读写/终端回调；它们默认启用。**关闭 ACP 回调不是 Agent 自身操作系统沙箱**，适配器的原生工具与 sandbox/approval 策略还须按既有产品合同落实。
- 主动传入限制性模式和原 owner 权限回调。`onPermissionRequest` 抛异常时源码会回退模式解析（client.ts:2404）；不能把回调异常当成拒绝。宿主失败应明确返回拒绝/取消，且默认模式不得偷偷批准。
- `auth-env.ts` 以 `{...process.env}` 起建子环境；默认继承不能直接照搬到持有产品密钥的宿主。必要适配要限制环境传递；不读写或复制用户 Codex 认证文件，不把第三方登录令牌塞入业务库。
- 仅注入本次任务允许的 MCP 工具面，不把全 contract→dispatch 权限直接交给内部 Agent。

### 取消与恢复

- `loadSession/resumeSession` 是继续 provider 会话的能力，不是确认某个旧回合是否已完成的回执查询。原 unknown 任务必须先核对真实回执，不能自动恢复后重发提示。
- acpx runtime 的重连层存在 `allow-new` 路径；本方案不接入该层，不让失败恢复悄悄新建会话。底层客户端返回“不支持/找不到”时，交回既有任务恢复规则。
- 新适配器身份、源码和包版本需要冻结到新任务；旧 native 任务继续使用原引擎/回执路径，不能因设置切换改走 ACP 重试。
- 不添加第二张任务表、第二套调度器或独立正式历史；Worker 只回传候选和 provider 回执，经既有 backend port 落库。

## AionUi 当前真实代码与旧说法的区别

已核对 AionUi `6744099b279b991c17e31c243f0920477bd31cb6`（2.2.2），实际锁定 AionCore `v0.2.2=47e66d0d151123e973b3fd1e77afcb5671b3f8c5`。当前执行代码已迁出旧 `src/agent/acp`；不能用旧 wiki 目录作当前接入证据。

- [AionCore factory/acp.rs:44](https://github.com/iOfficeAI/AionCore/blob/47e66d0d151123e973b3fd1e77afcb5671b3f8c5/crates/aionui-ai-agent/src/factory/acp.rs#L44)、106 起明确：Codex 走 DirectCli→SessionAgentTask，**不走 AcpAgentManager**，也不静默回退 ACP。
- [codex_conn.rs:107](https://github.com/iOfficeAI/AionCore/blob/47e66d0d151123e973b3fd1e77afcb5671b3f8c5/crates/aionui-session/src/backend/codex_conn.rs#L107) `CodexConnection.open_session` 真正启动 codex app-server；223 起区分 thread start/resume；3238 起将 imageGeneration.savedPath 投影成 FilePath。
- 2648 起命令/文件审批已处理；2733 起原生 requestUserInput 明确尚未处理；权限扩展请求也未按普通 decision 答复。不能宣称全部权限/问答能力齐备。
- 独立 ACP client 在 `aionui-ai-agent/src/protocol/acp.rs`，真实使用其既有桌面宿主的 SDK，但当前 Codex 路由不消费它。其终端、会话和宿主依赖较重，不作为此次摘取主线。
- AionUi 根 LICENSE 与前端头声明 Apache-2.0；AionCore 根 LICENSE 是 Apache-2.0，而 workspace.package license 写 MIT，声明存在差异。未选择复制 AionCore，因此不把该差异处理成已经完成的再分发许可结论。

T3 Code 已有固定快照的 Codex 原生宿主也真实存在，但其 driver 接 Effect、workspace contracts、安装/认证及应用服务。此次不再展开它，选择依赖和职责更贴合的 acpx 客户端源码路径。

## 本地必要接点

- [现有原生引擎执行边界](/Users/zyongzhu/.codex/worktrees/user-diagnostics/Thirdspace-creator/ai-worker/src/execution/codex-native-turn.ts:24)：保持旧任务路径；新源码客户端只在 Worker 接入。
- [现有 Codex host 策略](/Users/zyongzhu/.codex/worktrees/user-diagnostics/Thirdspace-creator/ai-worker/src/execution/codex-app-server.ts:10)：不能借引入客户端放开原禁用工具；版本/能力变化须形成实施合同。
- [Worker 协议与服务 ports](/Users/zyongzhu/.codex/worktrees/user-diagnostics/Thirdspace-creator/contract/src/internal/execution-worker.ts)：复用归属、执行身份、取消和候选结算，不由 acpx 直接写业务库。
- MCP 继续复用本项目 `mcp-server/src` 与冻结任务工具面；合法保存、上传、无图写稿和底层下载/Whisper/ffmpeg 路径不受此研究影响。

## 来源归档

本轮抓取的是公开原文，不是安装包或可执行结果：

- acpx 固定 commit/tree/source 原文及摘要：[source-records.json](/tmp/t1059-source/acpx/source-records.json)。
- 适配器包元数据：[codex-acp-1.1.5-metadata.json](/tmp/t1059-source/acpx/codex-acp-1.1.5-metadata.json)；SDK 元数据：[sdk-1.5.1-metadata.json](/tmp/t1059-source/acpx/sdk-1.5.1-metadata.json)。这两份首次请求时间未单独保存，不补造首次时间。
- AionUi 固定来源：[source-records.json](/tmp/t1059-source/aionui/source-records.json)；AionCore v0.2.2 固定来源：[source-records.json](/tmp/t1059-source/aioncore/source-records.json)。

以上足以锁定源码复用候选；没有真实连接或产品实现 PASS，也没有采用 issue 提案作为已实现证据。
