# T1090 独立实施复核

- 复核时间：2026-10-09（Asia/Shanghai）
- 复核方式：只读当前四个产品路径、新增测试与既有 RED；未修改仓库，未运行测试、数据库、模型、API、App 或 Git 操作
- SPEC review receipt：`[REV:0f4c60fe8b62]`
- 当前结论：**PASS_STATIC；实际 Gate 尚在运行，不能签实现完成或发布 PASS**

## 当前字节绑定

| 路径 | SHA-256 |
|---|---|
| `backend/src/modules/ai/chat-turn-history.ts` | `7fe5cb7ef3c499107b5570de8ddc081d9da169181d887e7af7d58943a856d727` |
| `backend/src/modules/ai/chat-turn-submission.service.ts` | `2dfe0b81703688458fdd93c61f43e635204b0b00fb3cc8305746931377cca64d` |
| `backend/src/modules/ai/chat-turn-completion.service.ts` | `029dccdb1b6f316e5ae7b73133e1b125dc2902d8e59f8716b550560249c30b96` |
| `backend/src/modules/ai/external-chat-turn.service.ts` | `ff4386742c6dc15be75195b037f28077f769cacb947edb32b75070357af850b3` |
| `backend/src/modules/ai/frozen-chat-history.service.test.ts` | `2a68fa6297e18670d33279be35462fb46a73a5b8252eb6b2bef72d53b9a3eb20` |

若上述任一产品或测试 SHA 后续变化，本静态结论只对未变路径继续有效。

## 静态审查结论

### 冻结历史选择是机械边界，不做语义选择

新增 `selectFrozenChatHistory` 只消费后端可信 task 保存的 ID 数组，并要求：数组非空；每项是非空字符串；ID 唯一；最后一项精确等于 source；每个 ID 在当前 conversation 的真实消息行中存在；最后一行角色是 `user`。返回顺序严格来自原 ID 数组，内容、角色、parts、attachments 均取当前数据库真实行。

helper 没有按文本、角色含义、时间、业务名或相似度挑选消息，也没有生成替代 ID、修改行或重算摘要。它符合“代码只核机械事实”的边界。

### 旧摘要、ID 和冻结输入校验仍保留

三个调用面在恢复 frozen rows 后仍执行原检查：

- `history.map(id)` 必须逐项等于旧 `inputData.historyMessageIds`；
- `chatHistoryDigest` 仍使用 conversation ID/project/scope 与每行真实 `id/role/content/parts/attachments`，并与旧 `historyDigest` 比较；
- `modelInputDigest`、conversation/source、project、`copilot.assist`、`chat.run` 映射不变；
- source 的 `modelMetadata.chatTaskId` 仍须指向当前 business task；
- host context digest、execution owner、group/account/user 与 task payload 校验没有删除。

因此，修复只排除了“后写 assistant 因 createdAt 相同而插入冻结 source 之前”造成的假冲突。真实正文、parts、附件、conversation/source、task 绑定或冻结输入变化仍会拒绝。

### lease、fence、账本和回执真实性没有提前绕过

Pi completion 仍在 `withLease(..., "settlement")` 内核 execution/business owner、workspace、conversation、calls、checkpoint、stream events、provider receipt、tool cards、existing result/message/finish 和终态状态。选择冻结历史发生在 existing result 幂等回放分支之前，但没有跳过上述校验。

external completion 仍沿原 owner/lease、engine、business、workspace、conversation、call/session/receipt 和 budget 规则；只把原 `slice(0, sourceIndex + 1)` 替换成冻结 ID 选择。submission 仍由 `assertWritableWorkspace`、真实 conversation owner、task/execution/frozen payload、host pair 和 transaction 内 membership/fence 规则保护。

没有新增 schema、迁移、Worker 自报字段、写类工具、采纳权限或第二套账本。

### host / proposal 的共享路径闭合

`readChatTurnSnapshot` 在 source 已有 `chatTaskId` 时，先按 user/workspace 查询真实 task，并核 task type、project、conversation/source 和 `chat.run` 映射，再用其原 `historyMessageIds` 选择历史。host 与 proposal 保持原有后置校验，包括 execution/task、source binding、project、owner、input/history/host digest。

未绑定 source 仍走原 createdAt 截取路径；本实现没有声称修复初次未绑定历史或 UI 显示顺序。

## 测试覆盖审查

原始 RED 文件 SHA-256 为 `33581c705e9831f01f13a5e46d2cb4c5d2d841d3f678adcd861cfffd71853363`，实际 21 项中 5 FAIL / 16 PASS。五个失败分别落在 submission/host、Pi completion、external completion、Pi proposal 和 Codex proposal 的真实 source 冲突，符合根因，不是 helper 人工失败。

新增测试使用真实 PGlite 与原 service 组合，先正常冻结任务，再把后续消息的 `createdAt` 移到 source 之前；冻结 ID、摘要、正文、payload 与 receipt 不变。正向断言包括：

- submission replay 不重复 assemble；
- host/proposal 恢复原 `[first, answer, source]` 顺序；
- Pi 与 external 首次完成后同参回放不新增消息、result、call 或 finish；
- 原 task input/payload deep-equal。

负向 16 族覆盖空、重复、坏类型、缺失、跨会话、source 非末项、content/parts/attachments 篡改、source binding、project/account/user、frozen model input、host context 与 fence；失败前后行集合相同。

该文件本身是服务组合回归，不是独立 Worker 子进程证明。SPEC 要求的完整 Worker 边界必须由正在运行的原 T1089/T1086 frontend Worker 恢复回归提供；在结果产生前不能把当前 21 项代签完整 Worker Gate。

## 当前 Gate 状态

静态审查未发现阻断实现缺陷。以下结果在本次复核时仍未完成：

- 新 21 项 GREEN；
- 原 completion 60 例及 submission/external/proposal/host 相关五文件回归；
- backend/frontend typecheck；
- T1089/T1086 frontend 实际 Worker 恢复；
- boundary / semantic / orphan / reconcile；
- 后续打包与安装公开只读验收。

只有这些实际结果与上述 SHA 绑定后，才能升级为最终 Gate 结论。当前报告不宣称测试全绿、真实 PostgreSQL、安装版、Codex、UI 或全功能通过。
