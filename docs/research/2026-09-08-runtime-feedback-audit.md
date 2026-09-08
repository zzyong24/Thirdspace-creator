# T-928 截图故障与重构实际状态核对

用户要求先排查选题生成中重复取消按钮、聊天生成失败，更新CodeGraph，并确认是否已移除旧架构。以当前源码、安装包及最新日志为证据；不将已打包等同全量重构验收。先只读定位，存在明确局部缺陷时在既有T-919/T-915契约下修复；改变产品/架构前独立SPEC评审。

不直接读写业务数据库，不批量删除旧路径，不运行用户暂缓的业务测试或全局reconcile，不改参考工程。代码清理需证明没有生产消费者；兼容旧冻结任务的路径单独说明。不因截图有7个按钮就断言存在7个真实任务。

## 2026-09-08 排查结论

CodeGraph 已执行 `codegraph index --force --quiet .`，随后 status 显示 up to date：2,634 文件、32,888 节点、75,057 边。调用图确认 TopicTaskControls 仅由 ItemDetail 渲染一次。

### 截图中的重复取消按钮

`frontend/src/features/intelligence/intelligence-workbench.tsx` 中 TopicTaskControls 与相邻 TopicCandidateEditor 同用 `latestTransform.id` 作为 key。轮询替换详情时，这违反兄弟节点 key 唯一性，存在错误复用风险。本轮改为 `task-controls:<id>` 与 `candidate-editor:<id>`，保留各自随任务重置的行为。同时让原链接保持单行、不被标题挤成竖排。

这是已确认的源码缺陷，尚未真机复现截图，因此不把截图的全部成因判定为已闭环，也不推断实际提交了七个任务。未改任务取消、恢复、幂等和后台执行语义。

### 聊天生成失败：尚未确认根因

当前安装运行日志 sidecar-2026-09-08-3.log.enc 在 10:50:54–10:54:40 UTC 多次记录 `[api/chat] stream failed class=Error reason=unknown`。此日志出自聊天路由准备/提交执行的 catch，不能证明模型已开始运行。相邻启动日志有 CLIENT_CONFIG_ACCESS_CHANGED，但尚无证据证明它导致这些聊天失败。

路由以 omitMessage 隐去异常信息，界面通用失败分支还会覆盖 publicMessage，因此目前无法从截图定位具体原因。不能通过放开原始日志泄露密钥或对话内容来补诊断。

公开 CLI 的版本和 help 正常，但 status/access status 均返回 CONNECTION_NOT_FOUND；未继续调用业务接口，未读取业务数据库。下一步需要在应用设置开启本次启动 CLI 完整访问，再通过公开任务状态区分提交失败与 Worker 执行失败，必要时加阶段与安全错误码。没有擅自重提生成任务。

### 安装版本与源码不同步风险

当前安装应用 sidecar SHA256 为 5940a17f74cc978bed17b6db05ceb7f1800d3e3ae341bc32644d63fb1a4fab4d；T926 打包产物内 sidecar 为 5a5691ae863c4c378031d5fb40aa18c2d6174ecfba06dae55044e65d8bcb9fb1。只能确认二进制不一致，不能据此反推代码差异。此次源码修复尚未重新打包、安装。

## 重构退役盘点

| 路径 | 当前消费者与结论 |
|---|---|
| chat-turn-submission.service → chat-worker-run → chat-pi-loop | 新聊天冻结 executionEngine=pi；Pi 主执行路径已接入 |
| chat-worker-run → chat-model-stream | 无新版引擎字段的旧冻结任务仍走兼容路径；未确认旧任务清空，暂不可删 |
| chat-pi-loop 的 streamText、structured-node、durable-generation-model | 仍是正常生产使用的单次模型适配、结构化节点、调用账本；AI SDK 尚未完全下线，但不能等同旧 Agent Loop |
| execution/agentic/deterministic-engine.ts；createAgenticExecutor | 静态图中只发现导出/测试，可作为清理候选；agentic-executor.ts 的 DEFAULT_AGENTIC_SYSTEM_PROMPT 仍被 persistence-client 消费，不能整文件删除 |
| runExecutionTask / executor-registry | 仍服务 echo.manifest 和 video.render，不是无效代码 |
| frontend/src/server/persistence-client.ts | 仍约 11,157 行，组装层拆分未完成；不能宣称全项目高内聚迁移已结束 |
| 老默认 48 次/10 分钟、8 次/20k | 有旧冻结/缺少冻结预算时的兼容消费者；新任务 continuous 预算不能用这些默认值推断已失效 |

## 交付证据与保留项

本轮仅局部 UI 源码修复、静态消费者盘点与 CodeGraph 更新。按用户指示未运行业务测试、真机生成或全局 reconcile；不记录为 PASS。T-928 保持进行中，聊天故障根因、安装验证与实际旧任务存量待核查。T-915/T-919 不能据此标记全量完成。

独立源码复核（2026-09-08，continuous_budget）：局部 diff 无阻断问题；角色前缀 key 保留按任务重建行为，链接样式与可收缩标题兼容。仅代码复核，未运行测试。源码修改后再次增量更新 CodeGraph，命令退出 0。`git diff --check` 通过。

## 用户开启 CLI 后的复查

2026-09-08 status/access status 均确认 connected/full；accounts.list 仅一个账号 acct-ae1a8346-9（月明水清深），自动绑定该唯一账号。公开 conversations.list/messages.list 找到截图会话 ai-conv-3302704d-525，归属 project-3302704d-510。会话包含 7 条相同用户请求，modelMetadata 都为空，没有助手回复；ai.tasks.list 按该项目过滤返回 total=0（req-3302704d-570）。这将问题限定到用户消息保存后、任务绑定前；不是已启动 Worker 的自动重试失效。

已核对当前进程 cwd 为 sidecar/frontend，runtime/execution-worker.cjs 文件存在，所以“路径文件缺失”不能当作本次根因。源码启动路径会吞 Worker 定位异常、对话错误会隐藏提交阶段，本轮新增有限阶段及机器码日志，不输出 SQL、参数、密钥或模型正文，并保留服务端已翻译的人话错误供界面展示。尚未安装新代码、未重提真实生成；原始失败具体抛出点仍待新诊断或可复现证据。

T-930 同时退役仅验证旧供应商 SDK 的 T-501 research/model-stream-tool-rat.mts；历史 T-501 审计引用仍属于当时提交，不改成新 Pi 验证。运行时新的 Pi 三协议尚未执行真实模型验收，旧 RAT 证据不能挪作新实现 PASS。

### 已复现的提交阻断：标准工具 Schema 被拒绝

直接对真实 `asSchema(z.object({query:z.string()}))` 调用 `prepareChatToolParameters`，无模型/数据库/网络输入，得到 `Error: 工具参数约束尚不支持：$schema`。SDK 正常输出 draft-7 `$schema`，手写子集转换器将它误认为未知约束；已有测试仅手写不含元数据的 JSON，未覆盖真实 Zod 注册链。这是原生 Zod 工具准备时的确定性阻断，但当前业务注册还大量使用手写 jsonSchema，不能直接认定为截图根因。真实工具集合的复核与安装验证尚待完成。

修复：真实 Zod 工具复用原校验器，冻结 JSON 不变；纯 JSON fallback 识别受支持的 draft-7 元数据，仍执行原严格约束。无外部 IO 的协议探针得到 valid=true、empty=false、extra=false、metadataPreserved=true。增加对应回归用例但按用户指示未运行自动测试套件。

真实工具集合的无外部 IO 复核：allChatTools(dummy deps) 普通与绑定项目各 44/44，选区绑定 45/45；prepareChatToolDefinitions 均完整通过。因此 Zod 修复属于潜在协议缺陷消除，不能作为本次截图的直接根因。

产品说明快照的合成诊断：官方 v1、无覆盖时通过；缺失快照、版本不同或存在覆盖时，会在聊天装配前明确拒绝。当前没有真实账号配置证据，不能认定为截图根因。已为 CREATOROS_GUIDE_UNAVAILABLE 补 Error.code，保留原判断；SKILL_SNAPSHOT_INCOMPLETE 原本已有 code。
