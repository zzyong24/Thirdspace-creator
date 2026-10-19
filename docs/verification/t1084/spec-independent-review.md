# T-1084 SPEC 独立前置评审

- 评审时间：`2026-10-08T15:40:42.509054Z`
- 结论：**PASS（SPEC 可进入正式 reviewctl 记录；本报告不执行该记录）**
- SPEC：`docs/features/t1084-chat-workbench-preparation-order.md`
- SPEC SHA256：`f51f7610908bad84f0546af3f77e72ee364aa54431ebec4788cc0ea6e789b559`
- 当前源码 HEAD：`0bc810de8458b7f18a15a5d78492cdbea8617be8`

## 真实问题

安装版公开入口 `ai.conversations.messages.create` 返回 HTTP 400：`Workbench 能力未装配执行入口：plan.update`。对应证据 SHA256 为 `674845032b09831431173b1774d493e603aa7d7e59661e70867c309a8dfddf2c`。原 `chat-assembly.test.ts` 单用例实际 RED，SHA256 为 `acf9169be484cbb6771d9c896b4ea17cef69063230d78e618b2517eb52e62c2c`，失败栈与安装版一致。

源码调用链支持 SPEC 的根因判断：

1. `chat-turn-preparation.ts:16-22` 把包含 `workbenchCapabilities` 的完整 `toolDefinitionOptions` 传入 `prepareChatAssembly`。
2. `chat-assembly.ts:271-273` 此时只构建旧业务工具原型，却立即调用 `prepareChatToolDefinitions`。
3. `chat-tool-definitions.ts:105` 对 Workbench 目录逐项要求已有执行入口，因此 `plan.update` 在外层注入之前被拒绝。
4. `chat-turn-preparation.ts:23-30` 原本会在内层返回后注入计划与其他 Workbench 原型，`31` 行随后再次用完整冻结选项执行最终严格准备。

因此最小修复应只让内层装配看不到尚未注入的 `workbenchCapabilities`；其余 atomic、worker、schema 和执行引擎选项必须原样保留。外层完成原型注入后，仍以原完整冻结选项执行最终 `prepareChatToolDefinitions`。这既消除错误的提前拒绝，也不放宽缺入口、schema/描述/version 漂移、重名覆盖或租约执行守卫。

## 边界与必验判断

- 产品写集限定为 `backend/src/modules/ai-runtime/chat-turn-preparation.ts`，符合根因闭包；无需修改 `chat-tool-definitions.ts` 的严格规则。
- 测试写集限定为已有 `backend/src/modules/ai-runtime/chat-assembly.test.ts`，应保留全部原测试和断言。
- 新 RED/GREEN 至少覆盖 `prepareDurableChatTurn` 的 `pi`、`codex`、可选 `plan.update`、其他原生 Workbench capability、旧未启用快照无新增工具，以及最终目录缺入口/描述/schema/version 漂移仍拒绝。
- 必须验证修复没有剥离内层仍需的 atomic/worker flags；不能通过把所有 `toolDefinitionOptions` 清空来得到 GREEN。
- 原失败发生在模型和任务提交前。安装复验前先读取原会话与任务列表，确认没有未知任务；新验证请求需按公开幂等恢复规则建立清晰关联，不能把旧失败改写成成功。
- 完整原测试、plan host/公开 plan 集成、前端公开聊天提交、类型、boundary、semantic 和 timeout 检查按实际结果记录；既有全局欠债不得冒充本任务通过或被删除。
- 最终仍需重新出包并在当前用户客户端走公开入口验证真实任务、消息、步骤和结果。此 SPEC PASS 不代表安装版、模型、Codex、T-1062 或 T-1074 已通过。

## 范围判断

本修复不改变公共 API/schema、数据归属、权限、数据库、UI、模型或 Skill 语义，也不增加新的执行入口或生命周期。它只调整同一准备函数中的校验时序，属于已确认能力的兼容性修复。没有新增安全、数据完整性或架构 finding。

## 初审机器输入

`docs/features/t1084-chat-workbench-preparation-order.review-input.json` 为 `spec-review-round/v2`、`review_kind=initial`，`findings=[]`。正式 reviewctl、任务状态和事件应由 ROOT 按流程另行记录，本次独立评审未执行这些操作。
