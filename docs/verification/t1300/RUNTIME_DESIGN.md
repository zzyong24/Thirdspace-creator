# T1300运行时最小实现契约（B，独审输入）

源码基线`4eb101161`。本轮仅只读盘点及写本文件/`CODEX_RUNTIME_MATRIX.md`；没有执行测试、真实模型或生产修改。遵循product-to-code-orchestrator 3.29.0；实现前仍须SPEC独审、Task Packet/执行归属前置及root派发。以下是可审查方案，不能写成已实现或收益已验证。

先恢复用户功能：选Codex后的设置、普通聊天、不同工作面、独立结构化、工具子节点、图片、后台桥分别验。当前没有证实中央路由依赖供应商文本API，不修改兜底/预检来猜修。安装包是否含已知修复由A提供当前产物身份。发现新的实际故障后保存原task/call/失败，以其最小根因补SPEC再修；不重发旧unknown。

## 真实工具阶段：复用原持久流

T1299四个Codex改稿样本的Host读/候选调用全部为`external_tool`，事件在终态批量写入。原因是`external-chat-tools.ts:handles`把Host none/proposal且非workbench的工具交`executeExternalTaskTool`；这条分支未走ordinary工具投影。ordinary工具已经有`createChatToolStreamProjection`和`external-chat-turn.service.ts`唯一input/output及终态一致性校验，不能说所有引擎/工具都缺流。

新任务冻结可选`externalToolProjectionVersion:1`；缺省保持历史终态行为，禁止给已冻结任务补默认或重算摘要。字段由`chat-turn-submission.service`服务端赋值，调用方不得任意选择。旧Codex/CodeBuddy/ACP输入仍可解析及终态回放。

本轮即时投影仅用于冻结`definition.effect === 'none'`且outcome.sideEffect为none的已结算Host只读工具。所有proposal候选output（包括work.editor、work.creation、system、canvas）保留在终态commit后发出；不为了提前反馈建立暂缺来源的可预览/可采纳卡，不扩改所有UI卡的完成门。工具完成顺序：真实execute → 后端校验outcome及sideEffect → 原lease settlement事务保存`settled/resultText` → 从已保存call/proof构造原协议chunk → 原持久订阅读回。投影在已settled后独立lease事务执行，回执保留；已settled原ID重入只补投影，**绝不重新execute**。投影异常记安全诊断并保留原任务恢复，不把展示故障转换成新模型/新工具执行。方案独审及红测覆盖投影失败后的原回执恢复，不能用“前端先显示成功”掩盖未提交。

不新增公开事件种类，仍是`tool-input-available`、`tool-output-available`及原denied/error族，写同一`execution_stream_events`。提取/扩展现有投影模块内的事务级公共工具卡构造与严格幂等append能力，ordinary/external只负责把不同真实账本转换成可信输入；不改call.kind，不混用ordinary reservation，不给worker任意chunk写入权。

external可信输入必须核：execution/attempt/fence、原ai_task/conversation/group映射、原external_agent父call、已settled状态、冻结toolName/version/effect/execution、`externalToolInputProofSchema`、inputDigest、原参数，以及完整outcome。明确要求`identity.toolVersion === definition.version === proof.toolVersion`，proof的call/turn/toolCall/toolName均与真实call逐项相同；重算inputDigest匹配原call；保存input/output chunk与可信重建的完整JSON深相等。只允许当前已有Host none/proposal族。拒绝缺proof的新协议、伪造parent、未知/committed效果、参数或回执不匹配。旧协议缺proof的历史行为不升级为可提前展示。

同一toolCall的输入只追加一次、输出只追加一次；输入归父call，输出归工具call，sequence/callIndex沿原事务锁和顺序。已有相同事实幂等返回，不同事实冲突；finish后不补新阶段。终态构造最终卡时对新协议external也执行ordinary现有的唯一性/完整内容一致性规则；已提前投影的只读卡**不再次批量append**，proposal卡在终态原事务内首次append再验证；老协议沿旧路径。若terminal时应早发的只读流缺失，允许按已settled事实补同一投影再对账，不能重跑模型或工具，也不能让性能门hard-fail原本合法聊天。此时输出安全诊断`projectionTiming=recovered_at_finish`及对应call身份；早期投影已有为`before_finish`；proposal明确为`deferred_proposal`。补齐结果可以完成业务，但该call绝不能计作实时反馈PASS。篡改/重复不一致属于安全事实冲突，不能借补齐覆盖。

“候选就绪”只来自已校验完整候选与保存回执。阶段可以先显示“已读取当前版本”等真实工具结果，但候选仍受schema/digest/版本/采纳门。`chat-work-editor-card.tsx:53`的`useAssistedWorkReview`要求真实conversation/sourceMessage/toolCall；`work-candidate-source.service.ts:116`先读该消息及task/call，再核冻结Host/proof/完整候选。其sourceMessage可为已持久用户消息，不可笼统声称所有来源均等assistant commit，但当前仍不能仅因schema完整就承诺提前可用；最小方案统一保proposal终态。取消/失租/过期task不能借settlement投影取得新执行权；取消前已结算事实的可读性遵守原owner及流服务约束。

**本轮不接公开正文增量。** `codex-native-turn`现有onText来自`item/agentMessage/delta`，但丢失itemId/phase，不能直接公开裸字符串。reasoning/未知phase不得进UI；正文协议若另做，须单独独审。工具阶段可独立完成本轮目标，不需要为此新建第二正文机制。

## 当前owner专属schema：新版本保完整旧解析

只根据用户明确打开、已保存且经原owner验证的`chatContext.editorTarget.owner`选择：wechat_article、graphic_post、production。无editorTarget保持通用能力发现，不用关键词、平台名称猜创作意图。只缩`work.editor.read/propose`中与该owner无关的联合参数/说明，其它合法工具、权限、能力发现及跨能力任务入口不删除。

`contract/src/resources/work-editor.ts`导出owner参数schema：文章保全量article snapshot、article typed patches及相应selection/window；图文保完整graphic snapshot、graphic typed patches/imageRequest；production保完整native snapshot/typed patches及markdown_timeline。owner/base种类严格关联，跨owner参数拒绝；production完整参数族不能为缩体积而删合法retime/params/animation/媒体操作。图卡图片、来源、未改字段仍由现有候选服务保持。候选输出和采纳DTO不改版，不把新schema当写库权限。

工具声明用明确前缀`chat-tools-work-editor-owner-v1-wechat_article:`、`chat-tools-work-editor-owner-v1-graphic_post:`、`chat-tools-work-editor-owner-v1-production:`加原64位hash。hash仍包含实际description/schema/effect，长度不超过现有128上限。只对本轮新assembly启用专属选项，已有冻结输入不补字段。以同一个纯解析函数把冻结read/propose前缀解析为协议选择：`director-v1`、`director-v2`、`markdown-v1`或`owner-v1(owner)`；仅按精确允许前缀分派，不按是否包含某字符串猜版本。

兼容表：`chat-tools-work-director-v1:`使用原V1 read/propose schema和原描述，workWritingContext=false；`chat-tools-work-director-v2:`同原V1参数及原描述，但workWritingContext=true；`chat-tools-work-editor-markdown-v1:`使用当前read/propose含markdown参数及当前完整描述；新owner前缀使用对应owner的全部合法参数/专属描述。两个旧director与markdown声明的原description文本/拼接顺序/JSON schema导出顺序作为固定fixture保存并深比，不能让新默认说明改变旧hash。

`createChatWorkEditorToolHost.resolve`与返回外层`createChatHostToolAdapter`前目前各计算一次legacy/options。两处改为共用**同一次冻结定义解析结果**及相同`definitionOptions`；resolve中的重建与adapter.current重建均须与原冻结definition完整深相等/相同hash。已有read/propose子集可以单项重建，但同任务同时出现的两项必须属于相同协议族；混v1/v2/markdown/owner、未知前缀、owner前缀与frozen target不符一律拒绝。旧任务绝不按当前target默认选新协议或重哈希。测试同时覆盖这两处及外层adapter.current，而不是只测prepareChatToolDefinitions。历史resolver执行读写权限不增加。

另一个独立实际消费者是`backend/src/modules/ai/work-candidate-source.service.ts:42`：readSource再次buildChatTools/prepareChatToolDefinitions并比较propose版本/schema。它也必须使用上述同一冻结协议解析器和原target构建工具；保原work.creation分支定义不变。否则新owner候选虽生成成功，文章来源读取/采纳仍会因hash不符失败。测试必须从新文章来源候选经公开`ai.workCandidates.source`读回并采纳，旧director/markdown来源同样读回；三owner分别经各自现有公共source/preview/adoption路径验证，不把当前文章来源专用source接口扩大接受图文/native。新旧混合、伪造source、错组、篡改proof拒绝。不能只改Host执行重建而漏掉采纳来源消费者。

最窄优先用现有Zod原生JSON导出；不引入`$ref/$defs`压缩技巧。若锁定Codex dynamic tools拒绝生成schema，应保存真实拒绝并核消费者约束，不放宽backend strict parser。静态schema合法不等于Codex实际支持。`resolveSubmittedChatToolParameters`目前只匹配实际登记的提交工具，work.editor执行由专用Host重建；不为此无证扩大submitted resolver权限或改全局历史表。

## 分段计时：随这两项改动加诊断

不加性能硬门，不减少预算或重试/校验。工具持久事实计时优先来自createdAt/updatedAt及append时间；记录task/call/attempt、允许的phase码、持续毫秒、schema/message字节数、成功/失败类别，不存原prompt/用户正文/凭据/URL/私有推理。浏览器点击/准备/POST与接收由A供相同task/run时间线，不能与服务端重复累加。

建议最小闭合的计时边界：worker被调度/ready；受控Codex预检开始/完成；thread/turn绑定；首次真实工具请求；工具结算；持久append；finish。线程已创建不等于首token，上游首次工具也不是TTFT。使用同进程单调duration＋ISO观察时间；不同进程时钟只作相关性，不声称纳秒精度。

本轮**不扩worker协议、不改worker**。精确实现范围确定为从已有ledger及新增投影边界输出安全诊断：`executionTaskId`、`callId`、`attempt`、`phase`（`tool_settled`、`tool_projection_appended`、`turn_finished`）、`observedAt`（ISO）、`elapsedMs`（同进程单调非负值，可缺）、`inputSchemaBytes`（非负整数，可缺）、`projectionTiming`（上述三个允许值，可缺）、`result`（`ok`或稳定失败码）。单行JSON诊断不存业务正文，不改变执行终态；sink失败忽略。已有task/call.createdAt/updatedAt作跨进程相关性，不伪造queue/ready/preflight/provider首token时间；这些段本轮继续缺测。A浏览器点击/接收时间按同run关联。若未来需扩诊断envelope，另提精确协议独审，本轮不留悬而未决的worker写集。

## 精确候选写集

所有路径相对仓库根`/Users/zyongzhu/Workbase/Thirdspace-creator`。以下供C锁SPEC/packet；没有授予整目录任意编辑权。

| 改动 | 生产文件 | 聚焦测试文件／公共链 |
| --- | --- | --- |
| 新冻结流版本 | `contract/src/internal/chat-worker.ts`；`backend/src/modules/ai/chat-turn-submission.service.ts` | `contract/tests/chat-worker.test.ts`、`chat-worker-entry.test.ts`；`backend/src/modules/ai/chat-turn-submission.service.test.ts` |
| external真实阶段与终态对账 | `backend/src/modules/ai/external-task-tool.service.ts`、`external-chat-turn.service.ts`；`backend/src/modules/execution/chat-tool-stream-projection.service.ts`，允许同模块新增`chat-tool-stream-chunks.ts`作为无执行权的事务helper | `external-task-tool.service.test.ts`、`external-chat-turn.service.test.ts`、`backend/src/modules/execution/execution-codex-chat-tool.test.ts`、`execution-stream.service.test.ts` |
| owner专属参数与冻结版本 | `contract/src/resources/work-editor.ts`；`backend/src/modules/ai-runtime/chat-tools.ts`、`chat-tool-definitions.ts`、`chat-assembly.ts`、`chat-work-editor-tool-host.ts`；允许同模块新增`chat-work-editor-protocol.ts`纯解析helper；`backend/src/modules/ai/work-candidate-source.service.ts` | `contract/tests/work-editor.test.ts`；`chat-tool-definitions.test.ts`、`chat-work-editor-tool-host.test.ts`；`backend/src/modules/ai/work-candidate-source.service.test.ts`；`backend/src/integration/chat-work-editor-worker.test.ts` |
| 精确阶段诊断 | 仅上述external服务/投影文件中增加安全计时；不新增worker/IPC文件 | 上述服务测试fake clock、诊断无正文且sink失败不影响业务；ledger＋浏览器公共时序关联 |
| Codex其它功能实际缺陷 | **当前没有已证根因，不预留任意route/adapter改动** | 新owned代表链若有真实失败，再记录准确根因/写集/红测与独审 |

`frontend/src/server/persistence-client.ts`是composition root，初版两项方案无需改它；若新诊断sink或真实故障确需接线，必须先协调A及C追加**精确片段**，不能两代理同时改共享大文件。`chat-submitted-tool-parameters.ts`和`chat-host-context.service.ts`目前只读，不是必改。无数据库迁移、新表或新任务系统。A负责前端准备/事件接收与视图；B不给前端workbench下业务逻辑。

## 红测、真实验收和成功指标

| 项目 | 当场RED→GREEN应覆盖 | 公共链及指标 |
| --- | --- | --- |
| 新external阶段 | 先证明工具已settled但finish前订阅无工具结果；重复settle、重复订阅、重连同序列、乱序/篡改、缺proof、新旧版本、rollback、取消/迟到、双worker竞争/旧fence | 一个真实Codex工作面工具链，记录工具settle→append→浏览器收取→finish四时刻。至少一次工具阶段早于finish，最终卡唯一且与持久结果相等，非仅console日志 |
| owner schema | 先记录当前各owner声明同时含无关族；新schema只允许当前owner但该owner所有合法候选族仍过；旧三类冻结定义hash/执行重建不变，跨owner/current-base/篡改定义拒绝 | 三owner工具声明字节分别量；文章/图文/视频真实候选预览/采纳/刷新/脚本和其他平台隔离。当前目录冻结336290B/propose195339B只作旧样本参照，新wire另测 |
| 功能可用 | 设置选择与主/子route不一致的受控负例；无供应商文本key时Codex合法路径；明确unsupported及原第三方依赖；原deadline/取消/幂等/归属 | `CODEX_RUNTIME_MATRIX.md`各不同消费者用有界代表链，复用中性输入。真实输出/失败逐项记录；不以设置绿灯或请求200为PASS |
| 阶段诊断 | fake clock断言标签/持续时间；reasoning/用户文字不可进入诊断schema；旧worker兼容、回调抛错不改变结果、过期ref/乱序不变业务 | 可关联task/call/attempt，无敏感正文；未测首token必须保留缺测，不把工具阶段称TTFT |

反馈提前、schema变小、总耗时减少分开报告。相同模型/原稿/工具目标的对照记录输入/输出/cache/模型回合差异、首阶段和完成时间；缓存/上游差异不可控制时不声称因果提速。正常任务不因性能目标硬失败，不删历史、不降低预算、不取消合法长任务。LED047/053/058/061及受影响类型/contract/boundary/真实公共链，待实现后按SPEC串行完成，保全部历史失败与范围外债。
