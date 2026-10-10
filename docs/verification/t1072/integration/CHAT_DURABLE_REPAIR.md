# 聊天持久协议测试维修与未满足事实

本轮保留原 `route.test.ts` 的 50 个输入场景（13 个标题及退役 onFinish/中断断言按 durable 合同调整，并非原断言原样），并增加 8 个严格反例。真实提交、冻结快照、PGlite、租约、调用账本、检查点、工具投影、完成幂等及 SSE 服务参与验证；身份、外部内容及供应商输出为隔离合成夹具，未冒称真实用户、真实供应商或 Worker 子进程验收。

## 精确写集与实现

- `frontend/src/app/api/chat/route.test.ts`：唯一导入下列测试 helper 的文件。退役 `runChatStream/onFinish` mock 改为真实 `prepareChatReply` + 官方 `getOfficialSkillBase` JSON 快照，守卫未放宽。
- `backend/src/modules/ai/chat-route-durable.test-fixture.ts`：测试专用服务装配；源 ID/角色/正文必须与保存回执精确一致，缺源拒绝，不补造 user。
- `frontend/src/app/api/chat/route.ts`：仅恢复当前会话最新已存 user 的原 source；属主/scope 检查在前，文本与附件精确一致才提交。缺失/变化返回 409，不插重复 user、不产生新 execution key、不扩终态恢复。完整差异为 `chat-source-recovery.diff`。

授权依据为旧 hardening S6（重试轮 user 不重复落）和 T-915 R-05/AC-05/AC-08 的唯一执行权、未知提交不换键要求。原严格 regenerate RED 为 `frontend-chat-regenerate-red.log`，旧 50 场景 GREEN 为 `frontend-chat-regenerate-green.log`。独立 review 整改期间误传 Zod 对象，真实 26/58 拒绝日志 `frontend-chat-durable-reviewed-green.log` 保留；改用官方 JSON 边界后 `frontend-chat-durable-official-schema-green.log` 为 58/58 PASS。

新增反例包括缺源、正文变化、附件变化三项零提交；成功原 source 只回同一回答/回执且调用数为 1；unknown 经真实调用账本和 worker outcome 只观察原任务、调用/期限不重置；主动停止有/无确认用量两项保留正文/工具事件及账本、确认 cancelled 且迟到成功拒绝；夹具错误源 ID/角色/空对象拒绝。断订阅仍不取消任务，空产物仍拒绝完成。取消后没有成功 assistant 消息，事件和账本保存不能冒称成功落库。

## S5 模型身份缺口（未通过）

旧 `2026-07-11-director-agent-hardening-design.md` S5 要求 input/output/cache tokens + modelId。当前 `chat-turn-completion.service.ts` 只累计确认调用的 tokens，模型结果回执合同未包含可信非秘密模型身份。原 mock 的 deepseek/glm modelKey 断言无法证明当前落库路径，不能把 tokens 通过写成 S5 全部满足。此项未实现、未验收。

最小规范候选：后端模型 admission 冻结可信非秘密计费身份，绑定原调用回执；BYOK 真实模型与 channel-managed 身份分别定义，多调用/fallback 的累计用量与模型身份不压成一个虚假 modelKey。旧 null 保留为未知；不读秘密、不重计费、不新模型调用。新增 wire 字段、冻结摘要和历史兼容需正式规范裁决及独立评审后实现。

## 成功后明确再生成（未通过）

`ai-copilot-content.tsx` 的 retryLastTurn 在错误入口发 regenerate；unknown/result_unconfirmed 已禁止普通重试。但 script.patch 成功纯文字却无所需候选时，composerLifecycleError 会让用户直接重试。当前 durable.submit 按原 source 原子绑定且 existing() 无终态新意图分支，因此会回旧成功答案；按钮无法完成明确再生成，是真实缺口。当前修复只验证此事实，未把回旧答案称产品成功。

最小规范候选：显式区分原意图恢复与用户新的生成意图；新的 intent/attempt 必须由后端原子创建且绑定同 owner/scope/source 及稳定 request-id，兼容旧 taskId/executionTaskId 回读。只有已确认终态且用户明确提交新意图才允许新计费调用；在途、未知和响应丢失继续原 task，不猜测、不自动换键。保存原回答和预算事实，失败后以新 intent 原 key 回读恢复，用户可结束；提交前显示会再次调用模型与可能计费。当前母 SPEC 未裁决这一 wire/成本行为，尚不实现。

真实原生 HTTP 与双电脑 UAT 仍未完成；本报告中的 58 测试通过仅为隔离服务协议及输入场景证据。
