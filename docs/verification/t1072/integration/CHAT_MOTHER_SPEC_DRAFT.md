# T-915 母规范精确 draft（已应用，待正式审核）

本交付仅规范 draft。主控已核准并应用母补丁，正式审核待执行；backend/schema/contract/UI 行为未修改；全前端测试源码冻结在6dd9db7a。精确候选为CHAT_MOTHER_SPEC_DRAFT.candidate.md，unified diff为CHAT_MOTHER_SPEC_DRAFT.patch；metadata记录当前母、独立已读提案、候选的完整SHA256。主控已核写集，当前pending build被合法窄化到同精确规范文件；旧design-review done51ed266e保，真实generate/context仍显示build，不手改状态。接下来独立执行者对实际母快照正式recheck。设计提案无blocker不是正式审核回执。

## 当前真实审核上下文

T-915同cycle1、round2/3，latest_event_hash为1d0f281764a2d94f245bbaedad518a9d89ad8fc824c531ba04bf5609a747b93b。旧SPEC SHA b990a38a015698105d29d2da0cada4767b3be4bd09948cc5ef147621fb98d8ce，应用前母SHA 76d22c8860767ac5de715af3c6e3c2b3079f5e452ebcb22aceca055c574d2822；旧receipt已过期，原review-events不改。合法下一轮是同cycle recheck round3；不得借T1072 round3、new-cycle或通用DEC重置能力。原modules.config的T915 design-review写集为空，现已准确登记本轮规范文件，并将pending build限定相同范围；不据旧宽域实施新母行为。

## 母补丁位置

| 当前母段落 | 精确 draft |
| --- | --- |
| R-03 现调用预算/恢复/观测 | 原段逐字保留；新增R-03a逐call宿主identity、公开allowlist、取消真实ai.tasks.get、旧回执/迁移/兼容回退 |
| R-05 现结果/唯一scheduler/旧入口 | 原段逐字保留；新增R-05a显式submit定位符、原source恢复、新source原子映射、succeeded无候选明示新请求及服务器admission |
| AC-04 | 原停止/fence/预算验收后增加root/child/fallback身份、unknown null及公开managed脱敏 |
| AC-05 | 原暂停/重启/预算/operation后增加同locator竞争/丢响应、旧finish深比较、新v1只持久回读、取消AI任务读取与跨scope拒绝 |
| AC-08 | 原完整入口兼容后增加submit与regenerate分开、终态明示新消息/unknown不重提、加法wire/前向迁移/保新事实回退 |
| 旧hardening S5/T239e | 原文未修改；价格model-config可配和会话成本角标仍原责任，不以此次tokens/identity冒称整个S5通过 |

## schema、wire 与冻结摘要逐项差异

| 位置/当前事实 | 拟加法差异 | 冻结/兼容要求 |
| --- | --- | --- |
| backend/src/schema/ai.ts 无request映射 | chat_submission_requests：user_id/client_message_id联合PK；conversation_id与source_message_id FK、source unique；workspace_kind/workspace_id/conversation_scope/input_digest/schema_version=1/created_at | server校验合法SDK locator，scope来自server当前workspace；新显式submit使用，旧消息不回填；conversation/source/map同事务，unique冲突只核真winner不删旧行 |
| user model_metadata 原安全record | requestLocatorV1:{schemaVersion:1,clientMessageId} | locator只是受核定位符，不是source/权限；与新映射同事务，旧metadata精确不改 |
| backend/src/schema/intelligence.ts execution_calls当前无model_identity | model_identity JSONB NULL，解析完整现executionModelIdentitySchema | 仅宿主原reserve事务第一次写；旧call null不补，start重验原identity/operation/inputDigest/parent；token/baseUrl不入内部列，内部managed实际model/endpoint摘要仍不公开 |
| POST /api/chat现trigger/messageId/messages[].id被有限恢复分支消费 | 明确submit-message校验最后user UI id；可选newRequestFromMessageId引用原assistant | 新locator是新明确意图，同locator异输入/scope409；source/task键仍服务器chat:<sourceId>；旧无trigger/无合法locator与regenerate原守卫保持，不强制旧client字段 |
| 新请求摘要 | 服务器解析正文、现有序attachmentIds、functionKey、selection/artifact/version/section、project/surface/scope、可选原assistant来源 | 摘要不可被后续稿件/配置重写；重试复用pending请求封套；不改旧chatHistoryDigest/modelInputDigest算法或现已持久历史 |
| 原source→copilot.assist→execution(chat.run)与chat:<sourceId> | 不改原绑定和幂等键；新用户确认请求才创建新source | unknown/在途/partial禁止专项再生成；原task恢复不新扣费；server核原execution→AI→conversation及成功finish无候选，不信client状态 |
| contract/src/resources/ai.ts aiTaskResource现无usage明细 | modelUsageV1可选严格allowlist；ai.tasks.get.response仍该资源 | 业务taskId入口实际可达；AiService.getTask→requireTask owner/workspace→projectExecutionTasks原映射；list/find共享投影同脱敏；旧无execution字段缺省，exec.*入口/DTO不改 |
| ai_messages.modelMetadata、conversation_reply.resultData、finish.messageMetadata | 同一个首次completion冻结的公开modelUsageV1 | BYOK仅实际冻结modelKey；managed仅channel-managed，不含内部model/apiFormat/baseUrlDigest/customEndpoint/凭据/nested属性；旧成功无v1按旧原形深比较，新v1只回读原持久对象 |
| inputTokens/outputTokens/cachedTokens/modelKey现消息列 | 按去重model call已确认usage安全投影；必要未知null | parent tool不计子tokens两次；input total不再加cache；cancel无答案按ai.tasks.get回读原model集合，不造finish/费用；价格与成本按旧S5另验 |
| backend/drizzle当前最后0122 | 拟0123_chat_submission_and_model_identity.sql与meta journal | 正式实施前确认编号；前向事务/备份副本/重跑/旧行逐值相等，旧调用null；兼容回退保新增列/事实，不DROP或清非null；旧二进制不能读新v1不当恢复版本 |

内部身份schema、root/child/fallback操作绑定的逐字段authority与公开usage完整形状均在candidate R03a原样列出；表中不是删字段的替代schema。没有唯一宿主证据的其它模型路径继续null并如实未覆盖，不能凭current配置猜历史。

## 主控拟核最小规范写集与下游失效（未应用）

正式规范这一步仅：母SPEC与其review.md；orchestrator/process/modules.config.json中T915 design-review精确文件绑定；orchestrator/CHANGE_IMPACT.md、ARTIFACT_MANIFEST.yaml、DECISION_LOG.md；BACKLOG审核栏/真实review-events/progress由既有工具生成；T915 packet与本draft/规范review packet/report。不沿backend/**、contract/**、frontend/**宽写集实施；T1072链独立不消费。

母修改后在CHANGE_IMPACT和manifest新增T915聊天变更范围记录，标API/数据模型/安全/测试计划、新消息恢复UX、backend admission/ledger/completion、迁移/回退为invalidated，待派生与真实验证；既有全局2-contract/3-design的其它已通过切片不擅改成全部失效。4-build/5-ship仍draft不改PASS。旧S5价格配置与成本角标仍未验责任。当前仅规范draft已应用，manifest新母draft/局部downstream invalidated，不写新PASS或伪造下游完成。

breaking裁决仍逐项：强制旧client locator、改变原regenerate/source/计费、放宽exec namespace、删除历史或公开合法字段、丢新事实回退都不在本补丁许可内；如实施选择需要任何一项，必须另述差异并获用户确认。当前拟加法不自动免正式规范审核。
