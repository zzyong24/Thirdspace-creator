# 母 SPEC 精确加法补丁 v2（未批准、未实现）

替代上一版概念候选。独立报告 `creator-chat-mother-spec-review.md` 的 MC-01..05 全部保留为必须复审的问题；本文不是 PASS 或实施许可。目标母规范 `docs/superpowers/specs/2026-09-04-agent-runtime-refactor.md` R-03/R-05、AC-04/05/08，继承旧 hardening S5。母文件、schema、API、UI 均未按本提案修改。

操作者已有已确认结束的一轮聊天、原输入/附件/局部改稿入口和回答，却没有该入口所需候选。目标是明确提交新的用户请求并取得可采纳结果，交给原项目稿面；取消/返回不调用模型。已有在途或未知结果只能恢复原任务。新提交响应丢失时回读同一个持久 source/task；原回答、预算和调用历史完整保留。

## MC-01：明确新消息与同 HTTP 重放

母 R-05 增补：`regenerate-message` 是原意图恢复，原 source 永久绑定原 task。`submit-message` 的最后 user UIMessage.id 是受核请求定位符，不是可信持久 source ID。有效定位符为 `[A-Za-z0-9_-]{1,128}`；它必须与请求中最后 user 行一致，不能引用已有其它 conversation/source 或采用 URL。服务器生成真实消息 ID。相同定位符只对应一个原输入；新定位符表示用户显式新消息，即使文本/附件相同也不能按字符串偷偷复用旧意图。

| 对象 | old → new 候选 | 兼容 |
|---|---|---|
| POST /api/chat `trigger/messages[].id/messageId` | 现 UI id 忽略、同文兜底涵盖全部非regenerate → 显式submit校验最后user id并作为replay locator；regenerate仍查当前真实最后user、核精确文本附件，保原source | 无trigger或缺合法UI id的旧客户端保旧原输入恢复，不凭空有稳定跨响应幂等；公开如实列旧协议限度 |
| 新内部表 `chat_submission_requests` | 无 → `user_id/client_message_id` 联合主键；`conversation_id` FK、`workspace_kind`（group/legacy-account）、`workspace_id`、`conversation_scope`、`source_message_id` FK unique、`input_digest`、`schema_version=1`、`created_at` | 仅新显式submit使用；旧消息不回填定位符、不重锚 |
| `ai_messages.model_metadata` user行 | 原对象 → 新user追加 `requestLocatorV1:{schemaVersion:1,clientMessageId}` | 安全公开随机定位符，不含权限、模型、凭据；旧metadata不改 |
| durable.submit / source绑定 / AI与execution幂等键 | 不变：`chat:<服务器sourceId>` | 不增generation key，不从客户端id直接造task/operation；原source重放只原task |

backend 新事务服务负责 lazy conversation 创建、request映射、source创建，路由不得查库或跨模块repo。按既有 owner/workspace 验证 conversation 并持行锁；首轮无conversation时同定位符在事务中只有一个winner，冲突winner回读其canonical conversation，不另建会话。对 request 映射加行锁，先核 `userId + 当前workspace + scope + conversation` 与请求声明精确相符，再比较规范化输入摘要。摘要固定服务器解析的正文、按现合同顺序的attachmentIds、functionKey、selection（artifact/version/section锚）、project/surface/scope及可选再生成来源引用；不含时间戳、原码或凭据。相同locator异文本/附件/功能上下文或不同owner/workspace/conversation均409、零新source/task。事务内同时落source与mapping，失败整单回滚；事务后durable.submit失败仍可按同mapping恢复原source，不能重造user行。

旧无trigger兜底与regenerate的现S6核属主/最新user精确文本附件保留。普通明确submit新locator不走同文兜底。这是明确可评审的旧→新行为差异，不能仍写“若需再审”。先以新增合法SDK请求路径部署，旧客户端不强制新字段。输入摘要一经绑定不可被新的当前稿件/配置重写；同请求恢复使用已有冻结执行，只有尚未建立执行时才按当前公开守卫完成准备。

客户端在第一次显式发送时，把此次定位符对应的正文/附件/functionKey/selection/来源引用冻结为pending请求封套；请求重试复用该封套，不能再次消费one-shot而丢functionKey。用户编辑后明确发送使用新locator。返回/刷新走已有owner/scope会话列表→messages（含安全定位符）→既有任务状态和SSE恢复原source/task；无HTTP回执的首轮也能在该scope最近会话找到已落库source，不自动重发。后台无映射且无source时不宣称已提交；用户可取消或明确重新发送。

## MC-02：再次生成的服务器 admission 与正常操作

不把已成功请求交给regenerate。UI独立「再次生成」先明确展示“本轮已结束，但没有所需候选。再次发送会新调用模型，可能产生费用”，预填原文本/attachmentIds/functionKey/selection；用户可编辑、取消或退出，预填不新建source/task。新发送复用上述submit路径，并在请求添加可选 `newRequestFromMessageId`（原assistant持久ID）。这是新增**定位语义**的加法wire，须母规范正式批准；不是generation key，不隐瞒字段增量。普通新消息不带此字段，既有合法并发/自由对话不受该专项限制。

服务器在创建映射/source之前，按稳定锁顺序先读取并锁原execution→AI task→conversation（与现完成端口保持顺序），再重验该assistant属本owner/workspace/conversation/project，源user、原task及conversation_reply相互绑定，原execution/business均succeeded，完成receipt/finish/source映射真实一致。旧task缺完整证据、queued/running/waiting_user/unknown_result/result_unconfirmed/partial等不得新生成：409且返回原公开task/execution/source引用，零新source/task/调用；用户沿原任务核对/恢复。不能信任客户端status。

只有原冻结hostContext.chatContext.functionKey属于当前已批准“必需候选”入口（本缺口script.patch），并由现结果投影核实没有该工具的成功候选/patch回执，才允许这个专项引用。不由用户字符串或文本语义猜“无候选”。已存在成功候选、其它入口、缺旧冻结functionKey均不能绕专项guard；保普通用户新消息入口。锁内核验失败不写mapping，重复已成功绑定的新locator优先回原source/task，不因原task后续历史变化重复收费。

编辑后的新输入仍按当前属主/group/project、附件公开服务、selection当前artifact/version正常验证，不能继承旧私有权限或旧失效锚。局部改稿必须保script.patch入口；明确编辑改变功能则取消专项引用并按普通新消息明确发送。unknown原任务不能借这个UI动作生成新attempt；不新增终态恢复协议。新消息有自己的现行连续预算，原预算/调用不重置；新提交未知时只续原新source/task，禁止自动换locator。两轮结果与失败均在会话历史可回读，操作者可取消预填结束失败循环。

## MC-03：逐 model call 的宿主可信身份绑定

采用完整现 `executionModelIdentitySchema` 内部schema，不手抄删字段：workerModelSpec去token/baseUrl，保model/apiFormat/authStyle/displayModelKey/structuredOutputs与schemaVersion/capability/baseUrlDigest/customEndpoint。新增 `execution_calls.model_identity JSONB NULL`，仅宿主写，Worker/client/settlement不能自报或改。它是内部authority，不能直接序列化到任何公开DTO。

| 真实model调用 | 唯一宿主绑定证据 | 首次写窗及恢复 |
|---|---|---|
| chat根 `<modelInput.operationKey>/model/<正整数>` | execution-generation-ports现严格operation校验、无parentCallId、task.payload.modelIdentity且capability与原chatInput一致 | 同reserve/admission事务首次写call identity；start前再核同原绑定；同reserve/retryOfCallId恢复不得换身份 |
| 已登记文本/结构化子模型 | 真实parentCallId；binding.forCall核toolName/execution/inputDigest/capability；nodePreparations该parent的nodeVersion/inputDigest与node冻结operation；chatModelIdentities[parentCallId]的inputDigest/identity | 专用节点reserve同原父tool及精确operation（text节点现`<prepared.operationKey>/model/1`）写入；child不能继承root猜身份；start重验parent/claim/原请求 |
| fallback `<原root operation>/fallback/model/1` | execution-chat-fallback现chatFallbackParent/isChatModelOperation；原root无parent、明确rejected且CHAT_MODEL_RETRYABLE_REJECTION；原task已冻结chatFallbackModelIdentity | 该fallback reserve同事务锁原rejectedcall并核已冻结identity；原主call仍原identity，unknown禁止fallback |
| model.generate/model.structured等其它已登记模型路径 | 各现专用operation/inputDigest/admission核验与原payload.modelIdentity | 能唯一对应才写；没有唯一宿主证据则null并记未覆盖，不拿当前配置或provider标签猜 |

逐调用内部identity与原owner/workspace、callId/operationKey/parentCallId/inputDigest构成不可变绑定。newcall首次reserve之前必先宿主pin；已有call的null不补填，即使task后来有identity。settle只写已有usage事实，不根据Worker报告model改身份；重复reserve/start/settle读取原call identity并核等价，不改变字段、预算或调用数。受管身份来自resolveModelSpec→resolveLlmConfig的settings/channel resolver实际受信配置，BYOK来自settingsService.getModelConfig，fallback来自已登记dedicated resolver；聊天文本/客户端modelKey/供应商模型标签都不是authority。

## MC-04：内部与公开身份分层、精确 allowlist

公开 `modelUsageV1` 仅：`{schemaVersion:1,calls:[{callId,displayIdentity:null|{kind:"byok",modelKey:string}|{kind:"channel-managed",modelKey:"channel-managed"},inputTokens:number|null,outputTokens:number|null,cachedTokens:number|null}]}`。callId是当前owner/workspace可见的真实调用引用，按call sequence稳定排序。此allowlist外字段拒绝；未知内部identity公开displayIdentity=null，不从当前配置补名。

managed仅公开channel-managed，不含真实model、provider路由/渠道配置、apiFormat/authStyle/structuredOutputs、rawendpoint、baseUrlDigest/customEndpoint、token或其它内部身份字段。BYOK可公开该call宿主冻结实际model作为modelKey；端点、认证、内部配置仍不公开。顶层AIMessage.modelKey使用同一安全投影：所有必要confirmed model身份确定且display一致才给其显示值；混合显示或任一必要身份未知则null，不假称主模型覆盖整轮。

ai_messages.modelMetadata、finish.messageMetadata、conversation_reply.resultData使用同一已冻结**公开**对象，不附内部model_identity。公开execution/tasks DTO也须逐一核既有payload投影，不能因原payload已有modelIdentity就照搬新列。测试遍历message.list/get、finish/SSE、resultData及所有公开execution DTO，断言managed实际model/端点摘要/内部属性/秘密均不存在（包括nested）。旧metadata原样；安全扩展不是以顶层遮挡掩盖nested泄漏。

## MC-05：历史回执、迁移与用量集合

候选迁移 `backend/drizzle/0123_chat_submission_and_model_identity.sql`（实施前若编号已被占用必须规范再确认准确顺序，不直接覆盖），配套meta journal与backend/src/schema/ai.ts、intelligence.ts：加request映射表与可空identity列。单事务前向、备份→副本迁移/重跑→关键行逐行相等→实际候选迁移；旧call全部null，无旧消息/finish/resultData重写。新表外键/unique冲突如实失败，不删重复历史来过门。旧schema无新列/表时显式关闭本项新能力且保旧读/原task恢复；不得把DB异常吞成成功或自动再调用。

新completion第一次提交时固定公开modelUsageV1并标记其schemaVersion=1，同一事务保存assistant metadata/resultData/finish。existing成功replay先读已保存结果：无modelUsageV1的历史按当前旧metadata/resultData/finish精确比较与恢复，不增加字段/不重算usage；有v1按已保存v1对象精确验证与回读，禁止补当前call身份。已有成功finish不得再次追加或替换。rollback只回到保留新增列/表的兼容读取版本，保存新事实；不DROP列、不清非null、不改原receipt。若旧二进制无法读v1原成功深比较，则不是允许的回退版本，必须停在兼容恢复构建或另获具体breaking确认。

集合按真实callId去重：model而非tool；每model使用自己持久providerResult.usage。完成消息集合沿现confirmed=status非rejected且全部settled的完成门，主/子/fallback各自列项；父tool不得再加子token。input total已包含cache，cachedTokens只显示cacheRead，不再加cacheRead/write到input total。某项必要用量缺失则该项聚合null。rejected仅在现明确拒绝证据允许无费用时不进完成汇总；unknown不能填0/不能凑成功completion。取消没有assistant成功消息时，使用真实既有 `ai.tasks.get`（GET `/ai/tasks/:taskId`，传业务 aiTaskId，不能传 executionTaskId）：`ai.transport.ts` → `AiService.getTask` → `repoFor(ctx,"ai.getTask").requireTask` 的 userId + workspaceFilter 属主门 → `projectExecutionTasks` 的同 owner/workspace 执行映射校验。拟在 `contract/src/resources/ai.ts:aiTaskResource` 新增可选安全字段 `modelUsageV1`，既有 `contract/src/operations/ai.ts:getTask.response` 继续引用该资源；没有新 endpoint、没有绕过 `executionService.requireExecTask`。对应 `backend/src/modules/ai/execution-task-projection.ts` 加受控 DTO 投影：只沿原业务行 executionTaskId 查执行行，核 `kind=ai_task`、`ownerType=ai_task`、`ownerId=aiTask.id`、payload.aiTaskId、当前 owner/workspace；聊天还核 taskType=copilot.assist/inputData.kind=chat.run、原 source/conversation 与已冻结 modelInput/摘要绑定后，才查此 executionTaskId 的 model 账本并按上述 allowlist 输出。任一映射不符保持 ConflictError，不容许客户任意指定执行引用、跨 scope 查 call；无 executionTaskId 的旧业务行保持字段缺省。listTasks 与 findTaskByAttempt 已共享该投影，必须同样使用安全 allowlist，不在这些公开 DTO 附内部 identity。取消/非终态的现 AI task owner 可通过同一 getTask 回读此字段；前端消息绑定的 chatTaskId 是准确业务引用。现入口已能回读 copilot.assist/chat.run 的任务状态，但尚无 modelUsageV1，不能声称现已实现。`execution.tasks.get` 仍限 exec.*；PersistentTaskService.get 仍是内部受控服务，不冒称其为这个公开路由。非终态/取消回读包括原model call，unknown/started无确认usage的数字为null，身份仅其已冻结值；完成消息的集合仍按confirmed完成规则，两类集合不得相互缓存覆盖；不制造答案、finish、调用或费用。

## 验收、下游与 breaking 裁决

MC01：同显式locator并发、回复后重放、首轮无conversation响应丢失均只有一source/task；同id异正文/附件/功能/scope409；新id同文本创建新显式意图；旧无trigger与regenerate守卫保。MC02：预填/取消/切workspace零调用；服务器在途/unknown竞态零新任务；真实终态无候选→明示新消息→候选→回读/刷新，两轮历史保；functionKey/附件/版本精准。

MC03/04：真实Worker+隔离PGlite、loopback BYOK/channel-managed、root/child/fallback逐call映射；unknown禁fallback、同call不改identity/usage；所有公开出口managed脱敏、跨owner/group拒绝。MC05：旧完成metadata/finish深比较、迁移副本/重跑、旧null/取消回读、不丢新事实的兼容回退。S5仅tokens/身份部分；旧S5价格配置和成本角标仍需具体另验，不能整体称PASS。

母规范获准变更后才标记下游artifact失效：API/数据模型/安全/测试计划、contract资源投影、前端新消息/恢复UX、backend admission/ledger/completion、迁移与发布恢复文档。新增表、可空列、可选wire与record安全扩展拟加法兼容；不得自动把“加法”当免评审。具体breaking包括改变原regenerate收费或source绑定、强制旧客户端新字段、移除既有合法普通新消息、删改公开字段/历史receipt、使旧成功不可回读、丢新增事实回退，必须逐项向用户解释并确认后才能改。当前没有这些实施许可，本提案待正式母SPEC复审。
