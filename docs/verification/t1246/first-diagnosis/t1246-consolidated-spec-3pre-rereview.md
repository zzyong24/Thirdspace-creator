# T1246 三项 PRE 窄复评：ACP 公开恢复消费者

结论：**PRE1246-01 的文件/计数合同、PRE1246-03 的非法 SRT 状态决定已补齐；PRE1246-02 仍有一项真实公开 producer 路径阻断。当前不签最终控制面 PASS、不解除冻结。**

绑定 SPEC SHA256 `a8924f85f92cc373e19eb536a49edbca9301c802d888cdf8b41855db6d93125b`、157 来源 binding `42c7583649a8afa4924a6aa8f9eec4cce9d3c2d169e479b2446a4376e162d885`、首轮产品候选 `533224f334c43cdb81a344424e420cad93784dd1`。本次 145 既有来源全部匹配、12 明确新增路径仍缺席；17 个协议消费者与候选字节一致。逐条记录见 `t1246-consolidated-spec-3pre-source-recheck.json`。未修改 SPEC/产品/测试，未运行测试、模型、PG 或 App；下述方案只是可实施的静态消费者证明，不是已交付夹具或恢复 PASS。

## 三项复核

- PRE1246-01：新版固定 `round-2/new-v3` 的 4 个原副本、routes/protocol/support 两族、唯一 JSONRPC executable、9 个驱动文件、三种私有 runtime 与唯一 evidence 根；59 journey、49 generationKey、38 routeKey 和实际 body 分开计数，实际 calls 不硬凑 49。合同层缺口关闭。V3 尚未交付，源/副本 SHA、精确 `--list` 和所有 consumer 预算仍必须在实际执行前独评，不可把合同关闭签作工具完成。
- PRE1246-03：SPEC:55 明确原非法 SRT 是 `failed`、`VIDEO_DECISIONS_FAILED`、attempt=1、calls=0，另用真实 cancel 命令验证 `cancelled`，保原后置而不接受任意终态集合。此项合同缺口关闭，不代签修订测试已绿。
- PRE1246-02：SPEC:152–154 新写的 native dynamicTools/`CodexRpcSession.chain` 不是本轮新公开聊天实际路径，须修订下述准确链路和 ACK 含义后再准入。

## 阻断：新公开聊天固定 ACP，不能删绑定制造 native 任务

`backend/src/modules/ai/chat-turn-submission.service.ts:94` 在 Codex 新任务冻结 `externalAgentBinding:codexAcpBinding`；`contract/src/internal/chat-worker.ts:6` 固定 ACP client/adapter/runtime/read-only-v2。`ai-worker/src/execution/external-chat-worker-run.ts:64` 因此进入 `runCodexAcpInWorker`。历史无 ACP binding 的 native 分支不等价这个公开 producer；禁止修改 DB、删除 binding 或给生产 wrapper 加 executable 注入来切换路径。

```mermaid
flowchart LR
 A[公开聊天 原 source/task] --> B[真实 ACP adapter]
 B --> C[私有 native JSONRPC fixture]
 C --> D[turn started 和真实 MCP 项目读回]
 D --> E[turn start 响应仍在途时 exit]
 E --> F[ACP prompt 拒绝 排空元信息 原 unknown]
 F --> G[公开同 ID resume 原 thread read]
```

## 最窄可达方案：保留 turn/start 响应在途，再真实 EOF/exit

1. 通过本轮实际 UI/公共聊天发送来源消息，原服务创建 conversation/source/business task/execution task/root call。保原 ACP binding、冻结引擎、组/项目与原预算。fixture 只是独立 vendor 新 inode 的合成 app-server，不替换 ACP adapter 或 Worker 11 bundles。
2. 原 `createCodexAcpHost` 加载真实 `codex-acp.cjs` 和私有解析出的 executable；完整版本/config/account/model/MCP 启动与工具目录读回按本例合成上游实现，不读取官方认证、不转发官方。`CodexAcpClient.newSession:723` 的真实 `thread/start.config.mcp_servers` 包含本轮桥配置；不能伪造缺省 capability 或跳过 `CreatorOsPolicy.verifyCreatorOsThreadTools`。未知请求必须真实拒绝，不能万能 `{}` 返回蒙混过门。
3. fixture 收到初始 `turn/start` 后持久保存本例原 thread/turn/请求计数，但**先不返回这个请求的响应**。发送 `turn/started` 的原 threadId 和 `turn:{id,status:'inProgress',...}`。原 `CodexEventHandler.ts:519` → `creatorOsTurnMeta` → `ACPSessionConnection.update:19` → acpx 原 session/update → `codex-acp-worker-run.accept:58–65` 排队 `recordExternalChatProviderTurn`/`bindCodexCall`。使用原 notification 顺序，不直接调用后台 setter。
4. 从该次 `thread/start.config` 读取真实 MCP URL 和 `http_headers`，按真实 Streamable HTTP MCP initialize/initialized/tools/list/tools/call 流程调用同桥。准确工具选 **`context.project.detail`**，参数 **`{projectId:<本例公开创建并绑定的原 projectId>}`**；必须在本例 `tools/list` 和冻结定义中存在、effect=`none`，不能硬造 `read_project` 或只取第一个工具。原 schema `chat-tools.ts:3013` 禁止额外字段；实现 `:4596` 必须返回 `found:true` 且 `project.id` 等于原项目。原读端口 `chat-read-tool-bindings.ts:36` 仍用当前 ctx。
5. URL/headers 的真实消费者：`external-task-mcp-bridge.ts` 创建随机 `creatoros-task-*`、`http://127.0.0.1:<owned port>/mcp` 与 Bearer；`CodexAcpClient.createMcpSeverConfig:977` 转为 `url/http_headers`，fixture 只能从这个原 config 获取且核 loopback 路径、服务名与实际 namespace。桥以随机 secret 验证请求，使用 `extra.requestId` 当原 toolCallId，转原 `executeExternalTaskTool`；`external-task-tool.service.ts` 检查租约、任务/source/组/项目、冻结工具版本/schema，再创建原 external_tool、调用真实项目读取并结算。核 MCP `isError` 不为 true、文本能按真实 outcome parse 为 `status:'ok'`、`sideEffect:'none'`、无 error 和本例项目。仅 HTTP200、tool ACK 或空对象不能算成功。MCP secret 只在内存用于请求，不入 state/截图/trace/日志。
6. 若模拟 MCP item started/completed，使用原本例 server/tool/arguments 及真实工具结果通知；不能用 fabricated dynamicTools 请求替代 ACP MCP。收到真实项目读成功后，**native fixture 关闭 stdio 并退出进程**，仍不返回 `turn/start` 响应、不发送 turn/completed。仅 stdout EOF 而进程存活不是本故障定义。
7. 可达拒绝依据：`CodexJsonRpcConnection.ts:37–42` exit→connection.dispose；当前真实 `vscode-jsonrpc/lib/common/connection.js:1228` 会 reject 在途 responsePromises；`CodexAppServerClient.runTurn:319` 此时仍 await 原 turnStart；真实 adapter `CodexAcpServer.runWithProcessCheck:3458`/prompt catch 传播进程退出错误；当前 acpx `client-protocol.ts` 未声明 AIR typed session failure，不走成功 stopReason 伪结果。`AcpClient.prompt:1354–1363` 传播拒绝，原 `runCodexAcpInWorker:103–108` 排空客户端更新与宿主 updates 后才 `settleExternalChatTurn(status:'unknown')`。
8. 这与“先返回 turn/start 再 EOF”不同：`CodexAppServerClient.awaitTurnCompleted:838` 只有 resolve，native exit 不直接 reject 这个 Promise；后者可能挂到原期限，不能用固定 sleep 宣称已触发 unknown。禁止靠人工 cancel/耗尽 deadline 来冒充本恢复成功 producer。

## ACK 与原 binding/usage：只能在实际 unknown 之后核实

MCP 成功 ACK 证明原 external_tool 已结算项目读取，**不证明 ACK 前 providerTurn/bind/usage 已持久**。ACP adapter 通知串行队列只等通知发送；acpx `handleSessionUpdate:2790` 调用同步 callback；宿主 `accept` 另排 `updates` Promise，MCP 桥不等该队列。`execution-codex-call.service.ts` 对 ACP 初始线程证明也不能代替真实 providerTurn。因此 SPEC 必须删除“第二 tool ACK 沿串行链保证元信息已持久”的强断言。

静态上原断线 catch 会等待已收到的 updates，这提供可做的验证点：先实际观察原 task `unknown_result`/公开投影 blocked+runtimeStatus，并用 owned 账本**只读**查原 source/task/root 的 start providerTurnId 与 `payload.codexCalls[rootCallId]` threadId/turnId严格相符；缺绑定就是本次失败/缺 binding 拒绝族，不算恢复成功、不重新发 turn。公开 task resource 不暴露全部 payload/calls，不能编私有 GET；账本对账只读并绑定本例数据根，不执行 SQL update 或 ledger setter。

未知用量族不发任何 native tokenUsage 帧，核 unknown 前后/root settled 后的 usage/totalTokens 仍保持实际 null（请求计数 accountingBasis 不冒充 token）。已观察族在同一原 thread/turn发送 `thread/tokenUsage/updated` 的完整合成 total/last 和有效 modelContextWindow，可随后再真实读取一次项目 ACK，但持久证明仍在 unknown 完成后只读核：`CodexEventHandler:1171` → `creatorOsUsageMeta` → host `bindCodexCall(observedUsage)`。恢复 receipt 的 usage=null 不得清除原已观察累计字段；合成 token 必须标合成，非官方收费。若需要“EOF 前后台已持久”的更强保证，现有 effect=none MCP ACK 没有这个接口，不能偷偷新增测试 permission；须另明确窄服务合同并独评。本方案不需要该生产扩权。

## 原同 ID resume 与完整读回

公开 `execution.tasks.command resume` 只允许原已绑定 Codex read-only恢复；原 Worker 输入仍 ACP。`codex-acp-worker-run.ts:20–29` 对 reservation.protocolKind/sessionId/providerTurnId 和原 `readCodexCall` 精确比对，原 `recoverExternalChatChildren` 后仅 `recoverCodexNativeTurn`；后者 `codex-native-turn.ts:18` `thread/read(includeTurns:true)` 寻原 providerTurnId。fixture 的持久状态只能由其自己收到的原协议事件更新，测试准备只配置不可变 scenario；UI/helper不得在断线后修改 fixture state 假造完成。

成功族给原同 turn 的 completed 及合法 final agentMessage，原服务 settle/commit 成功后公开读取原 source/assistant/result：task、call、thread、turn、conversation、sourceMessageId 一致，assistant metadata actualEngine=codex/protocolKind=acp/providerTurnId一致、completeness=completed；恢复增量 turn/start/prompt=0，原 deadline不变、不 supersede/retryOf，attempt实际进位，原 MCP call 不重复执行。image 族另给明确合成 imageGeneration item，沿原保存/候选/采纳/原file下载200 bytes/mime/size/SHA闭包，不能用文本成功代签图片恢复。

首次 thread/read 不完整的独立 scenario 应真实仍 unknown，后续无自动重发/续期；缺 binding 族必须由原缺通知断线产生而非写 DB。错组、真实 cancel、原过期限/attempt/fence拒绝各保当前权威门。原计划的损坏 proof/structured/hooks/draft子模型等变体也须逐变体标实际可达 producer/测试ID；不能拿单 root text 的新浏览器 PASS 代签，不能用篡改数据库制造“七族损坏”后叫公共 E2E。

所有 fixture requests、MCP actions、读回与排空正预算≥120秒，保原更长值；outer按 preflight/session创建、两次 MCP、native在途拒绝、ACP cleanup及两层updates排空、unknown观察、resume/末请求/结算/截图清理实列。bounded 只用原剩余期限，continuous保原null，不给原任务加时间。实际工具审核后才能执行，当前未执行。

## 29/49/59 来源兼容及剩余准入

原 `browser-cases.json` 有29个唯一family、49唯一 generationKey。当前封存来源草稿 native33+dependent16=49 recipe，family/key静态逐项无缺失/额外/错误归属；browser有10个非生成 journey，合为旧59。旧 key包括带空格的 `intelligence generation`、`scheduled flywheel`、`transcribe postprocess`、`系列图`等验收身份，不可当作可直接传给task API的taskType；新版映射应保旧key作来源，并另列真实producer/原taskType/冻结worker kind/model operationKey。38route拆分会改变 body 数，原29family及59逻辑来源不能变；本次未运行 `--list`，没有签新V3库存或官方49调用。

backend/type真实EOF、设置两原case完整因果及最小可信返回合同仍待最终闭包；本报告不准入其未定义产品改动。PRE02应将 SPEC:152–154 替换成上述 ACP/在途响应/断线后核绑定/原 ACP resume，其他两PRE可保持关闭；补终版源binding/control/context和工具实际静态审后，再集中实施。首轮全部红结果及未达到下游保持原证据。
