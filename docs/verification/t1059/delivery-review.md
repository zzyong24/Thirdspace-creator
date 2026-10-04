# T-1059 研究交付独立复核

日期：2026-10-04。评审对象为工作树 `/Users/zyongzhu/.codex/worktrees/user-diagnostics/Thirdspace-creator` 的 T1059 SPEC、主报告、Codex/WorkBuddy 附件、冻结来源清单，并只读抽查已归档的公开源码。本次未修改仓库、控制面或生产代码，未扩展来源，未运行第三方脚本、测试、模型、浏览器、安装或连接探针。

## 结论

**研究交付可接受；独立 findings：`[]`。** 当前报告有可追溯的既有接入源码和具体复用边界，未发现把来源存在、作者验证或模拟测试误写为本项目真实接通的事实问题。

本结论仅审核本轮研究交付，不是未来实现合同、完整依赖闭包、产品集成、模型、图片、取消恢复或界面验收通过，也不授予运行时改动。报告明确保留的实施缺口仍须处理。

## 实际核对事实

1. **Codex 客户端是真实消费链。** acpx 固定提交 `27efb1b57b9de22105a91e9154b1d29b51ede8cb` 的 `src/agent-registry.ts` 实际注册 `@agentclientprotocol/codex-acp@^1.1.5`，安装可执行名为 `codex-acp`；`src/acp/client.ts` 使用官方 SDK 建连接、注册通知/请求处理，再调用会话新建、加载、恢复、提示和取消。选定维护适配器为 `2.1.1 / 68d7d2d5ddfc0ed5746f9f6130892dda685e65dd`，两者不是已经验证过的同一组合。报告已分开记载默认消费范围、固定源码选择与兼容性待验证项。
2. **精确摘取边界成立。** `AcpClient` 没有公开独立包入口；报告没有把 `./dist/*` 当作实际构建文件证明。当前首层清单包含真实直接引用的 `session-control-errors.ts`，`jsonrpc-error.ts` 被准确标为邻近引用链；没有声称完整依赖闭包已编译。未选 acpx runtime 管理器、正式历史、存储和队列，保留本项目 `execution_tasks` 与 backend service ports 的唯一权威。
3. **图片及权限没有假保证。** 固定适配器有真实 `imageGeneration` 事件与报告器；普通结果过滤路径链接而保留 `rawOutput.savedPath`。客户端原始通知回调同步调用，投递成功不代表落库成功。报告保留原资产入库/候选归属/幂等校验，并指出当前宿主仍未开放原生图片。客户端回调能力关闭不等于 Agent 自身限制；权限回调异常会转模式解析、默认继承环境、旧未知结果不可盲重放等风险均有源码依据，没有复制认证文件的复用建议。
4. **WorkBuddy MCP 方向准确。** Univer 包装脚本真实生成连接器元数据、stdio 配置和 Skill，`src/mcp/main.ts` 使用 MCP SDK transport；该方向是 WorkBuddy 调用应用工具。作者 `release-readiness.md` 明确成功证据为 WorkBuddy 5.5.4 手工 HTTP，正式 stdio 安装和完整宿主流程仍未验收；报告没有把它转换为 CreatorOS 成功证据。
5. **配置复用有真实代码。** PowerContext 仅合并自己 MCP 项，保留其他服务器，保存非旧默认 URL/headers，备份和失败回滚；EverMe 固定用户 `~/.workbuddy/mcp.json`，避免生成聚合及应用自带配置，写入后仍提示首次信任。报告仅借鉴这些片段，没有带入记忆服务、提示 Hook 或额外业务工具表。
6. **云端 ACP 不是本地引擎。** MIT 的 PHP 库实际从任务 link/token 开 SSE，以同连接标识 POST JSON-RPC，发送 initialize/load/prompt，并维护单连接活跃提示、权限请求及未知结果。`close()` 仅本地断开；源码没有 `session/cancel`。公开测试使用 MockHttpClient/MockResponse。报告已明确宿主差异、远端取消和恢复缺口、官方云任务授权及网络可达性，未宣称独立本地 WorkBuddy ACP 已可用，也没有为缺口建议从零重写 bridge。
7. **产品边界保留。** 本项目现有 MCP 使用 contract 生成工具，经 `/api/v1/dispatch` 调用；写操作仍要求 apply、幂等与影响确认。内部 Agent 仅注入冻结任务许可工具面。CodeBuddy 不作为执行候选，协议名称或环境变量包含该名称没有被冒充产品支持；无明确许可或依赖私有登录态的来源未被选择。Univer 的 iframe 预览与 Office 领域 UI/存储不复制，现有原生工作台组件和样式继续作为宿主。

## 来源与摘要抽查

六个来源记录文件的实际 SHA256 均与最终清单一致；六个 LICENSE 原文及摘要亦匹配。另抽查以下八个核心源码，摘要全部一致：维护适配器 `CodexAcpServer.ts`、`ImageGenerationReporter.ts`；acpx `client.ts`、`agent-registry.ts`；Univer 包装脚本；PowerContext `workbuddy.py`；EverMe `workbuddy.go`；云端库 `AcpTransport.php`。这属于抽查，不冒称独立逐项重验全部 82 份文件。

最终补充的两份未选宿主来源记录，以及默认适配器 1.1.5/SDK 1.5.1 包元数据的四份摘要也已匹配。缺失首次读取时间如实记载，没有补造时间。

| 冻结交付文件 | 本次最终 SHA256 |
| --- | --- |
| `reuse.md` | `50a32fa69f6ca39bbd1033cb88da30509df2cd0f944cb82f531e3987f2a83fa7` |
| `codex-reuse.md` | `4a1325e7d5319fe36c416ebfd9c8c262961ec2242cf3618fa44da4f4efa951d6` |
| `workbuddy-reuse.md` | `a5b1ba07619e4bc0ece297260fd79a4beca87e8d6eb9cbd337499ed276e2565a` |
| `source-manifest.json` | `afb5bc0f55ce4e42d44251c3465aba655865476f9e62e042d5f591c0218515fc` |

## 检查证据的限度

已阅读本轮 `verification.md`：研究准入、范围与研究门按各自覆盖范围记录；全仓对账仍为 35 errors / 1 warning，审核审计仍有 19 项其他任务问题，没有被写成全仓通过。这些流程命令由主会话运行，本次独立评审未重跑，也不据此扩张为真实集成或界面通过。
