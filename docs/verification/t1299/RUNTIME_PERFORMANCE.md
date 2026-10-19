# T1299：AI 对话运行时性能与落地建议

本次四个 Codex 改稿样本最有证据的两个问题，是**等待期间没有及时交付已经发生的外部工具过程**，以及**简单改稿携带很大的工具参数目录**。前者可以改善等待感；后者可能减少模型上下文，但必须对照实测才能声称变快。不能把 37–75 秒全部记作数据库慢或纯模型推理，也不能拿开发服务器测量替代安装版，也不把四样本的外部工具路径推广为所有引擎/工具都只在终态显示。

本报告只读分析，未修改产品。沿用 `product-to-code-orchestrator` 3.29.0，项目版本一致，阶段是既有 BUILD 的分析验收。T1299 `context-plan` 实际退出 2，原因是 progress 无法唯一确定 pending/claimed step，原输出在 [context-plan.log](runtime/context-plan.log)；没有放宽门或伪造任务包。已读本任务 SPEC、项目记忆与物理架构。执行模型按总控指定继续 Sol 高思考；工具不能读回极速开关，没有宣称技术确认该开关状态。

## 证据与口径

- 原真实运行：T1298 `prepared-e5d626b5ff97ae2d` 与 `prepared-78ec5dfefb16c9e9`，各四轮同组实际 Codex 重组/校正/采纳/刷新。源码绑定 `8dbccad6a1b359bd69cd0d43a68988b1b4d37b95`；本报告在 `cd4974feb` 分析，所引用核心消费者相对此源码无差异。
- 本轮补证：经总控批准，核 78ec `owner.json` 的 task/uid/marker SHA 与 test/shutdown 0，仅复制**已结束的隔离测试 PGlite**。副本 `BEGIN READ ONLY`，限定原四个 task IDs，读取冻结输入的结构/字节数、账本时间、usage 和事件形状；不查询设置/凭据，不保存原提示词、工具参数或正文。随后 ROLLBACK、close，删除本次副本。原库未打开，没有 Next、浏览器、模型或网络请求。见 [脚本](runtime/read-owned-snapshot.cjs)、[运行输出](runtime/read-owned-snapshot.log)、[摘要](runtime/owned-snapshot-summary.json)。这是原测试库事实核对，不是生产数据库性能基准。
- 下面“实证”指原运行或本轮副本字段；“推断”指代码有该成本路径但收益未量化；“待测”指没有对应观测。没有 CPU profile、heap/RSS 曲线、SQL 慢查询/执行计划、完整原生通知时间戳、成功旅程 trace 或当前安装 App 数据。
- 点击发送前准备、项目顶部 tab、Next 冷编译/暖路由由 A 报告负责。这里从持久任务及模型调用账本开始，不与 A 的 POST 前段重复相加。E2E 整套时长不是某个按钮延迟，Next 的流式 POST 总时长也不是响应头或首 token 时间。

本轮诊断脚本实际退出 **0**，四个任务查询完成，`readOnlyTransaction/rolledBack/closed=true`；后续仅删除本次临时副本的清理命令退出 **0**，摘要记录 `scratchRemovedAfterClose=true`、`originalDbOpened=false`。没有运行新的产品测试套件、付费模型或当前 App；也没有修改生产/测试源码、配置和旧验收文件。

## 已经能量化的时段

八轮持久执行 created→updated 为 **37.461–75.169 秒**，输入 usage 为 253,143–400,500，缓存输入比例 78.51%–92.94%。每轮成功工具正文处理日志合计 **69–89 毫秒**，仅包住 `config.execute` 与结果预算处理，未覆盖租约/调用账本/IPC。完整逐轮原字段与日志行见 [existing-turn-facts.json](runtime/existing-turn-facts.json)。

78ec 四轮再由原账本分段，单位秒：

| 真实动作 | 任务创建→调用预留 | 调用预留→首工具预留 | 工具调用预留→结算区间合计 | 最后候选结算→任务终态 | 任务全程 |
|---|---:|---:|---:|---:|---:|
| 公众号重组 | 2.886 | 17.771 | 1.357 | 4.143 | 53.360 |
| 公众号校正 | 2.486 | 16.303 | 1.200 | 3.444 | 37.461 |
| 图文重组 | 2.441 | 23.302 | 1.386 | 4.814 | 69.017 |
| 图文校正 | 2.060 | 22.232 | 1.199 | 4.944 | 46.813 |

这些列**不能直接相加当成完整分摊**：两次工具之间仍有模型、协议和 IPC 等待；调用预留发生在受控 Codex 初始化之前，不是 turn/start；最后候选后仍有上游总结、用量/回执结算和完成事务。账本工具区间每次 215–385 毫秒，明显大于 0–31 毫秒的工具正文计时，但不能把差额全称 SQL 锁等待。精确计算见 [derived-timeline.json](runtime/derived-timeline.json)。

```mermaid
flowchart LR
 A[点击与保存准备\nA报告负责] --> B[POST与任务创建\nt=0]
 B --> C[外部调用预留\nt=2.886秒]
 C --> D[受控预检与模型等待\n首工具预留t=20.657秒]
 D --> E[多次模型与工具往返\n工具账本区间合计1.357秒]
 E --> F[候选已结算\nt=49.217秒]
 F --> G[最终总结与完成事务\nt=53.360秒]
 G --> H[本轮全部正文和工具卡\n此时才进入持久事件流]
```

图用 78ec 公众号重组这一真实样本。它解释“执行期间发生了什么”，不把无日志的时间强分给某个组件。

## token 角标到底在数什么

**实证与消费者确认：** UI 是“↑输入 ↓输出”，tooltip 明确“本会话累计 token”，没有展示费用。`conversation-persistence.ts:89` 的 `sumUsageTokens` 累计落库历史，`:104` 的 `sumStreamedUsage` 累计本轮 finish metadata；历史转 UI 时不再带该 metadata，`ai-copilot-content.tsx:2476` 相加，`:2514` 展示。未发现本样本因读回历史重复相加的证据。

截图的约 265K/1.2K **确实可对应 e5d 第一轮公众号自身**：`inputTokens=265336`、`outputTokens=1192`、`cachedTokens=216832`，因此不能只归因为两次 UI 对话累计。78ec 同动作是 264417/1230/216192。两次 UI 对话结束后，角标才进一步累加两条 assistant 行。

这也**不是最后一次内部模型请求单独用了 265K**：`codex-native-turn.ts:75` 读取 `thread/tokenUsage/updated.tokenUsage.total`，不是 `last`，相同通知去重；`runCodexNativeTurn` 每个 UI 回合新建 ephemeral thread，`external-chat-turn.service.ts` 把该回合最终累计 usage 写到 assistant。一个 UI 回合内经过 4–5 个实际宿主工具，期间存在多次上游往返；原始逐次 usage 通知和每次推理请求未落盘，无法精确还原每次贡献。不能从 token 数反推出私有推理或请求次数。

缓存是供应商报告的 `cachedInputTokens`，不是估算：原生适配到 `cachedReadTokens`，再投影为消息 `cachedTokens`。以 e5d 首轮为例，输入减缓存是 48,504；这只是计数差，**不等于计费金额、网络新传输字节或最后请求的 prompt 大小**。本轮没有供应商价格、缓存价格或真实费用结算数据，不能把 265K 都说成新计费输入。

### 可确认的上下文放大来源

78ec 的原冻结输入：

| 项目 | 公众号重组 | 公众号校正 | 图文重组 | 图文校正 |
|---|---:|---:|---:|---:|
| system UTF-8 字节 | 28,459 | 28,817 | 28,726 | 29,084 |
| messages UTF-8 字节 | 513 | 24,803 | 47,516 | 70,043 |
| model messages 数 | 1 | 4 | 7 | 10 |
| 冻结工具数 | 52 | 52 | 52 | 52 |
| 冻结工具 UTF-8 字节 | 336,290 | 336,290 | 336,290 | 336,290 |

单个 `work.editor.propose` 的冻结定义 195,339 字节，参数 schema 192,692 字节，约占工具目录 58%。其次 `system.action.propose` 45,814、`system.read` 24,742 字节，前三项约占 79%。`work-editor.ts:66–80` 将文章/图文/视频完整快照与 typed patch/markdown union 放在同一入参；`chat-tools.ts:4093` 即使当前是文章也使用这份联合 schema，说明文案还包含视频元素编辑细节。

`external-task-tool.service.ts:list` 先用真实权限和运行时可用性过滤冻结工具，`external-chat-worker-run.ts:149` 再把返回的 description/inputSchema 映射给 thread/start 的 dynamicTools。**没有最终 wire 清单或供应商 tokenizer trace，不能声称冻结 336KB 恰好等于每次实发量或某个精确 token 数**。但实际被调用的 `work.editor.propose` 携带大联合 schema、首轮历史仅 513 字节仍出现高输入累计，已经是值得验证的具体输入放大路径。

另一个增长点是历史：`chat-model-messages.ts:7` 在支持 `history.read` 且序列化消息不超 36MB 时保留完整模型历史，注释意图是之后每次供应商调用再投影。Pi 确有该调用层；Codex 的 `externalChatPrompt` (`external-chat-worker-run.ts:31`) 直接拼接 system 和全部 frozen messages，把历史 tool-call/result JSON 当文本加入。当前外部路径没有消费同一上下文投影器的证据。四轮增长到 70KB 是本样本实证，长会话的延迟/内存增幅仍待测；不得据此删存储历史。

## 等待期间为何看不到已发生的工作

**实证：** 78ec 每轮 12 或 14 条 `execution_stream_events` 全部带最终完成时刻，没有中途持久正文或工具卡。公众号首个真实 `work.editor.read` 在任务创建后 20.657 秒预留、20.957 秒结算，最终事件在 53.360 秒才写入。

**源码闭环：** `worker-runtime.ts:179` 将 Codex 文本增量只发为 Worker `progress`；`worker-supervisor.ts:120` 仅通过可选 `onText` 转交，而 `model-worker-dispatcher.ts:185` 创建 supervisor 未传 `onText`。HTTP `chat-execution-stream.ts:17` 订阅持久事件。`external-chat-turn.service.ts:250–254` 到 commit 时才一次 append 完整正文、工具卡和 finish。原任务状态提示仍可传回，不能描述为整个 HTTP 一字节也未响应；缺的是执行中的真实正文/工具过程。

**为什么没有走现有 ordinary 工具流：** 本四样本的子调用全是 `execution_calls.kind=external_tool`，不是 `tool`。`external-chat-tools.ts:18` 的 `handles` 仅承接非 host、committed、plan 或 Workbench 专用工具；这次的 `work.editor.read/propose`、`skill.read`、`context.*` 是 host 的 none/proposal，因此由 `external-chat-worker-run.ts` 的另一分支送入 `executeExternalTaskTool`，在 `external-task-tool.service.ts` 独立预留/结算，不调用 ordinary 的实时流投影。`external-chat-turn.service.ts:188` 则按 `kind=tool` 走 `ordinary:true`；约 `:235` 处要求已有唯一 input/output 流，并与最终卡逐字段一致，随后 `return []` 避免重复 append。这套能力已经存在，其他 Codex 专用工具/Pi 不应被本报告归为缺流。此次 `external_tool` 进入非 ordinary 分支，才在 commit 批量补 input/output。

**phase 边界：** `codex-native-turn.ts:74` 的 `onText` 只响应 `item/agentMessage/delta`，不响应 reasoning delta；但仅传字符串，未保留 itemId/phase，也未消费 `item/started`。`item/completed` 的 phase 只在最终选择 `final_answer`、合并及冲突检查时使用。因而不能直接把当前 `onText` 接到 UI 并保证所有增量适合公开。原成功运行没有保存完整通知，未知 phase 的增量是否出现过仍未知。

## 可落地改动建议（均未实施）

### 真实进度先到达，正式候选仍守确认门

- **证据等级与影响：实证。** 当前真实工具完成后可能再等数十秒才出现业务内容，用户会把正在工作感受成卡住。这一改动改善可见反馈，**不冒称缩短模型推理或最终任务耗时**。
- **最窄独立落地项是已结算工具事件：** 原 `external-task-tool.service.ts` 结算成功处投影已验证阶段；复用 `execution-stream.service.ts`、`chat-tool-stream-projection.service.ts` 和终态已有 ordinary input/output 唯一性、一致性及去重机制。现有 projector 绑定 `kind=tool` 的原 receipt，不能不经适配直接拿来处理 `external_tool`；应在同一流体系增加受信 external identity/proof 适配，并使终态按精确已保存投影对账，不伪改原 row kind、不增第二套通道或执行权。只表达真实“已读取当前稿”等动作事实，未完成操作不显示成功；显示一个可预览改稿候选仍须完整 schema/digest/真实版本校验和回执保存。这个工具进度改动可以独立验收，**不依赖先把 raw onText 接到 UI**。
- **公开正文 phase 是另一个协议改动：** 若继续做，需经 `codex-native-turn.ts` → `external-chat-worker-run.ts` → `worker-runtime.ts` 携带 thread/turn/item 与明确可公开 phase 的窄事件，再到原命名持久端口和 HTTP 订阅。未知 phase 不展示，reasoning 不透传。必要时扩现有 contract 的命名事件，先独审；不能直接连接现有只带字符串的 `onText`，也不能把未校验候选标成可采纳。这部分收益和安全性应单独衡量。
- **负例与风险：** 外 thread/turn/item、未知 phase、reasoning、重复或乱序 delta、同 item phase 冲突、旧 fence/attempt、取消后的迟到文本、订阅断开重连、两次并发订阅、旧任务仅终态批量事件回放、完成事务回滚、巨大合法输出与背压。候选仅在 schema/digest/真实版本校验及回执保存成功后可预览/采纳，采纳仍由 backend service 完成。网络断开仅释放订阅，不能取消后台原任务；不重发 unknown。
- **可观察成功指标：** 记录上游允许公开事件、宿主持久 append、浏览器收到三时刻，同一次事件尽快到达；独立设定并复核例如“结算后 1 秒内见真实工具阶段”的目标，不把未发生的“正在思考”文案当达标。真实首次可见内容时间必须早于 finish；确认正文不重复、刷新后不丢、旧回放一致，最终任务时长另测。依赖 phase 协议和事件兼容设计，不能只改 UI 文案。

### 按明确工作面减少 schema，保留通用能力与旧任务

- **证据等级与影响：实证输入体积，提速收益待测。** 最大项是跨文章/图文/视频联合 schema，并非作者原稿。优先减这项比无依据换模型/提高并发更有针对性。
- **最小范围：** `contract/resources/work-editor.ts` 拆出可复用的 owner 专属 schema；`chat-tools.ts`、`chat-tool-definitions.ts` 按**用户明确打开的 editorTarget.owner/能力 manifest** 构造该工具的真实声明，描述也对应同 owner。宿主仍执行原严格参数、所有权、真实 ID/版本/digest 校验。统一语义判断仍由模型/Skill 完成，不能按关键词猜意图或因为当前页面直接禁止合法跨能力任务。若要更进一步按需发现其它工具，应另设计显式能力发现/授权及冻结快照，不能简单删掉 52 个工具的大部分。
- **旧任务与回归风险：** 工具 version/fingerprint 是真实绑定，schema 变化需新版本；原 frozen definition/历史 resolver 保持可回放，不重哈希旧任务或放宽 strict parser。覆盖文章完整稿/局部稿、图文卡片/正文/图片、视频 typed patch/markdown、大数组/未知字段、跨 owner 参数拒绝、用户切页后旧任务、脚本与其他平台不变、旧 V1/V2 回执恢复、候选采纳并发冲突、取消/unknown/原期限。
- **可观察成功指标：** 先离线比较相同清单的字节数与 schema 语义等价/完整覆盖；再用同一模型、同原稿/当前稿、同工具操作、相同缓存冷热口径成组对照，观察输入总量/缓存量、首可见事件和终态 p50/p95。测不到时延改善就只报告体积下降。不能拿一次随机快响应当证据，也不能把免费读/模拟工具测试当真实模型完成。
- **依赖：** 原服务契约/冻结工具版本独审，当前工作面必须明确；若采用 `$defs/$ref` 等 schema 去重，先核锁定 Codex 与所有消费者实际支持，不能只以 JSON Schema 合法推定可用。

### 补齐同一次调用的分段观测，再决定预检与宿主优化

- **证据等级与影响：实证缺证。** 78ec 业务 `started_at`、`model_call_started_at` 均为 null。调用预留前 2.060–2.886 秒无法拆成 claim、工具复原、Worker ready、模型路由；之后首工具前 16.303–23.302 秒仍混有 Codex 预检与供应商等待。两个数据不能拿来证明数据库已经占了几十秒。
- **最小范围：** 在原提交/dispatcher/supervisor/受控 Codex adapter 和命名端口诊断中，记录 task/call/attempt 关联的安全阶段时间、duration 和输入字节计数；不给诊断新的执行权或凭据，禁止保存 raw prompt/config/account/secret/私有推理。优先原观测能力，不另建平台。记录 provider turn ACK、首个可公开文本/工具、工具调用外层与正文两种计时、append/commit 时刻。执行 deadline 与观察期限分开，保留原持续任务归属。
- **预检路径（推断，未认定主要根因）：** `createControlledCodexSession` 每次解析锁定 binary 并执行 `--version`，启动一次无名单 host 读取 MCP 名称、关闭，再启动受控 host，重复 config/read、account/read；精确 account/read/-32603 仅同会话重读一次。新 thread 再核 MCP。它们有启动成本，但不能删安全检查或复用未知认证来提速。应先计每阶段，再考虑只缓存非秘密的锁定 artifact 解析/版本结果，且按真实文件/宿主代际失效；认证与权限仍重新验证。复用长活 host 涉及更大取消/归属/多任务边界，不作为无测量的默认方案。
- **验证与指标：** 新诊断不得改变调用次数、任务 ID/费用、取消、失败分类；假模型/时钟测量只证明观测接线，仍需已授权隔离公共真实链验证。首阶段明确分出 queue/ready/preflight/provider/tool/commit；观测自身大小/耗时有界。若缓存获独审，覆盖升级、卸载、配置代际变化、认证失效、取消、其它错误不重读、旧 started/unknown 不重发。

### 宿主数据库与轮询成本，按证据收敛

- **证据等级：实证有约 1.2–1.4 秒工具账本区间，主因仍待测。** 外部工具 `reserve`、`scope` 多次经 `withLease`，事务重读 workspace/parent/task，锁定 task/business/conversation，校验完整 modelInputDigest；每次还有 supervisor 前置 validate。冻结输入 365KB 起随历史增长，JSON parse/clone/digest 路径确实存在，但没有 CPU/SQL 分摊，不能称已测瓶颈。
- **静态路径：** `external-task-tool.service.ts:reserve/execute` 的业务 `tool.execute` 明确在事务之外；不存在据此认定“持锁等待模型”的证据。`execution-lease.service.ts:withLease` 的原子权限/fence/控制检查是必要边界。`model-worker-dispatcher.ts:503` 控制观察约 250ms，`:582` 空闲队列默认 1000ms；`subscribeExecutionStream` 默认 100ms 查询，但单订阅串行且等待前次完成，符合 LED061 单在途原则。并发为 2，当前四轮串行不能证明队列拥堵，也没有证据支持提高并发。
- **最小后续动作：** 给实际 lease/digest/query 添加安全分段计时；若确认重复纯 schema 转换是 CPU 热点，可仅按不可变定义摘要缓存纯 parser，实际 task/control/ownership 必须实时核；如果证明确有空事件轮询负担，再评估进程内通知加原数据库恢复兜底，保有界单在途、断线重连和停止清理。不要降低原预算、放宽校验、跳 lease、删除历史或取消合法任务。
- **验证与指标：** 隔离真实 PGlite 服务下测同一输入的 query 次数/事务等待/CPU 与端到端时间；覆盖两个并发任务、切组、过期 fence、取消/停止、服务 dispose、事务回滚、长合法历史和同键重入。成功以真实工具调用外层 p95 下降且全部不变量仍过为准。没有观测前不实施缓存或改调度。

## 与 tab、媒体及历史欠账的关系

项目 tab 的服务数据聚合、重复权限/资源请求是否挡导航，应以 A 的实际请求时间轴再对应服务实现；不能根据 `persistence-client` 文件大就推断运行慢。已知 ResourceGrantsPanel 组作用域错误与 account-null 的 ingestion 查询，在 T1294 原成功运行保留，但它们不是已证 AI 对话耗时根因。

T1276 原片事务内根设置连接自等待、T1275 冷编译/初始化超时、T1189/LED061 资源释放有历史真实教训与修复/未验范围。没有本轮锁等待/heap 证据，不把旧故障宣称仍复现。LED053 的长执行/连续任务与 LED061 的背压、单在途、原任务取消归属继续作为回归要求，不能为了快删恢复/缩期限。

T1296 首轮两个 E2E 为 15.9 秒与 17.4 秒，后者包含创建/上传/探针/候选预览/响应式/采纳/导出/恢复，不能当成一次媒体导出延迟。两秒合成 MP4 与 AAC 容器 2.089796 秒是**媒体长度**，不是运行耗时；本轮不新做媒体 benchmark。当前没有“tab 装载媒体导致明确等待”的证据，不扩到渲染内核优化。

20 项审核绑定漂移与其余全局门失败由 C 做欠账分类，不能用它们解释 AI 对话或 tab 卡顿。本报告不替历史任务收尾，也没有改变任何旧状态。

## 建议总控裁决

可以把“真实可见进度”“当前工作面的工具 schema”“同一次调用的阶段计时”作为不同改动目标审阅。前两个已有具体消费者和实证，不需要先做广泛压力测试才立项；实施前仍补精确 SPEC、冻结协议兼容和独审。schema 只证明体积大，进度只改善等待反馈，各自必须用对应指标验收。

阶段计时应随上述实际改动一起接入和验证，不再为分析单跑独立大套件。最窄工具事件可先独立落实，公开正文 phase 则保留自己的安全设计和验收边界。

预检复用、数据访问缓存、并发扩容、媒体重构目前只有潜在路径或缺证，先有分段测量再决定。所有建议均未实施，当前安装 App 的真实体验和性能仍待经授权测量。

## 具体消费者索引

下列均为仓库相对路径，仓库根是 `/Users/zyongzhu/Workbase/Thirdspace-creator`。

| 事实或建议 | 文件与函数 |
|---|---|
| UI 历史/流用量及角标 | `frontend/src/features/copilot/conversation-persistence.ts:89` `sumUsageTokens`、`:104` `sumStreamedUsage`；`frontend/src/features/copilot/ai-copilot-content.tsx:2476`、`:2514` |
| 外部完整提示词/工具映射 | `ai-worker/src/execution/external-chat-worker-run.ts:31` `externalChatPrompt`、`:149` definitions→dynamicTools |
| 原生累计 usage、phase 与新 thread | `ai-worker/src/execution/codex-native-turn.ts:9` `completedResult`、`:67` notification handler、`:74` onText、`:75` tokenUsage.total、`:109` thread/start |
| Codex 二次进程与受控预检 | `ai-worker/src/execution/codex-app-server.ts:73` `createControlledCodexSession` |
| 最大联合 schema | `contract/src/resources/work-editor.ts:64` `workEditorCompleteCandidate`、`:69` `workEditorCandidateInputV1`、`:80` `workEditorProposeInput`；`backend/src/modules/ai-runtime/chat-tools.ts:4093` tool definition |
| 冻结定义与历史投影 | `backend/src/modules/ai-runtime/chat-tool-definitions.ts:91` `prepareChatToolDefinitions`；`backend/src/modules/ai-runtime/chat-model-messages.ts:4` `prepareChatModelMessages`；`backend/src/modules/ai/chat-turn-submission.service.ts:97` assemble、`:112` frozen modelInput、`:129` enqueue |
| 实际外部工具与结算 | `backend/src/modules/ai/external-task-tool.service.ts` `createExternalTaskToolService` 的 `reserve`、`execute`、`list`；`ai-worker/src/execution/external-chat-tools.ts:18` handles 分流 |
| Worker 增量到持久 HTTP 的断点 | `ai-worker/src/execution/worker-runtime.ts:179`；`backend/src/modules/execution/worker-supervisor.ts:120`；`backend/src/modules/execution/model-worker-dispatcher.ts:185`；`frontend/src/server/chat-execution-stream.ts:17` |
| 完成时一次投影 | `backend/src/modules/ai/external-chat-turn.service.ts:250` `commit` 的 text/finish append；`backend/src/modules/execution/chat-tool-stream-projection.service.ts` 原工具流一致性投影 |
| 身份、锁与轮询 | `backend/src/modules/execution/execution-lease.service.ts` `withLease`；`backend/src/modules/execution/model-worker-dispatcher.ts:503` watch、`:582` tick；`backend/src/modules/execution/execution-stream.service.ts:200` `subscribeExecutionStream` |
| 固定并发与运行时装配 | `backend/src/modules/ai-runtime/chat-production-composition.ts:104`、`:107`；`backend/src/modules/ai-runtime/chat-production-runtime.ts:10` |

索引用于限定后续实际实现评审范围，不表示本轮已经修改这些文件。
