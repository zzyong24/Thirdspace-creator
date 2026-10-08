# T1088 终态工具失败以真实绑定参数收口

> 状态：正式待审方案；用户持续授权全功能稳定性和 gap 修复。待独立评审通过后实现，原失败保留。

- 形成时间（UTC）：`2026-10-08T16:37:26.282127+00:00`
- 源码基点：`3a60fafc4fd299d2a0d2efc403ee6a24691075de`
- 新真实 RED：`/Users/zyongzhu/CreatorOS-local-acceptance/main-installed-20261008/t1085/plan-signature-green-first.log`
- RED SHA256：`3afe7e64f3de42774099c79d374267630837ba6366561adf24dbe3c43e3199a1`
- 实际结果：`chat-workbench-plan.integration.test.ts` 5 例中 4 PASS / 1 FAIL；新增“真实 Worker 相同参数两条 invalid_input”两次 `commitChatResult` 均 `HOST_PORT_REJECTED`，任务保持 `running`，120 秒观察超时。原四例已通过，不能写成整组失败。

## 已确认根因

`validateTerminalToolFailures` 当前用 `[receipt.toolName, call.inputDigest, errorCode]` 分组。这个 `inputDigest` 不是“业务参数摘要”：`createAgenticToolBinding` 把 `model.id`、供应商 `toolCallId`、tool name、冻结 definition version/effect、解析后 input、execution 和 validationOutcome 一起纳入 identity。相同参数出现在两个不同 model 回合时，model ID 和 toolCallId 必然不同，因此两个合法调用的 ledger digest 也必须不同。

当前 unit 直接伪造两个相同 `inputDigest`，绕过了真实 binding 规则，所以假绿。新公共 Worker 用例证明真实两次同参无法进入有限收口，完成端口拒绝后任务持续 running。该问题发生在 T1085 Pi callback 参数恢复完成之后；不得回退 T1085，也不得把 SDK/Pi 占位 `{}` 当成权威输入。

## 目标

对**同一个冻结工具定义、同一个后端已绑定输入、同一个不可重试错误码**的至少两条真实 settled 根工具回执，允许现有 terminal partial 机制有限收口；不同输入、不同工具定义/执行位置、可重试错误、未知或损坏回执继续不收口。完成仍由最新 settled `stop` model、完整 call IDs、租约、checkpoint、会话归属和账本事务共同确认。

## 权威事实与签名

终态校验不得直接信任 worker 提交的 `terminalToolFailureCallIds`、receipt 内自报参数、Pi message 占位参数或 `call.inputDigest` 的跨回合相等性。对每个候选 call 必须：

1. 从当前 execution task、全部原 `execution_calls`、冻结工具定义与原 settled model `providerResult.content` 调用现有 `createAgenticToolBinding(...).forCall(task,calls,call)`。
2. `forCall` 继续核 operationKey→model/toolCall、唯一原 model tool-call、冻结 tool name/version/effect/execution、原 provider input 解析以及 ledger `inputDigest` 完整一致；任一失败即整次不能终态收口。
3. 解析原 `workerToolResultReceipt`，要求 receipt.toolCallId/toolName 与 binding 的真实 provider toolCallId/toolName 一致；只接受 `status:error`、`sideEffect:none`、`retryable:false` 的 settled 根工具回执。
4. 若 binding 存在机械 `validationOutcome`（例如 invalid_input），实际 receipt output 必须与它深等；不得用 worker 自报的另一个错误覆盖原绑定校验结果。其它宿主真实执行错误仍以已结算 ledger receipt 为事实，但必须通过同一 binding 来源核验。
5. 业务重复签名由 canonical 机械事实组成：`executionToolName + execution + effect + canonical(bound.input) + error.code`。同一任务的 binding 已锁定 frozen definition version；实现也可显式把解析到的 frozen version 纳入签名，但不能把 model ID、provider toolCallId 或完整 ledger inputDigest 当作“业务参数相等”字段。
6. canonical 必须保对象键、JSON 类型和数组顺序的精确语义；不做字符串相似、默认补值、字段删除或创作判断。对象仅键序不同可按项目既有 canonical JSON 相等，数组换序和任意值/缺字段不同必须不同。

`call.inputDigest` 仍保留其原用途：证明每一条 call 与各自 model/toolCall/definition/input 的完整绑定。此次只取消“两个不同调用的完整身份 digest 必须相同”这一错误分组前提，绝不能忽略或改写 ledger digest。

## 最小生产写集

必需：

1. `backend/src/modules/execution/workbench-plan.service.ts`：终态分组改为消费经权威 binding 解析的事实；保留原 terminal call IDs 精确匹配、唯一 terminal group 和 failure summary。
2. `backend/src/modules/ai/chat-turn-completion.service.ts`：内部验证端口获得当前 task 和真实 calls，并要求每条候选 call 的可信 binding；所有原 lease/ownership/checkpoint/latest-stop/receipt/card/事务门保持。
3. `backend/src/modules/execution/model-worker-dispatcher.ts`：`commitChatResult` 前复用本次 active chat scope 已解析的真实 tools map，向 completion 内部端口提供 binding resolver；不得重新调用模型、从 worker request 接 tools，或在任务结束后动态采用当前 registry。

条件路径，仅当类型无法表达上述只读事实时：

4. `backend/src/modules/execution/agentic-tool-binding.ts`：只允许把已有 `forCall` 已验证的 frozen definition version 或只读 terminal identity 字段显式返回；不得改 identity/inputDigest 生成、operationKey、解析、reuse 或执行行为。

T1085 已改的 Pi loop/callback 两条生产路径不在写集；不得回退、复制或加入 fallback `{}`。新增同参公共 Worker 例当前 succeeded 断言与既有真实 partial 合同不一致，应校正为 partial，核原业务任务/消息/result/finish/两卡与notice；这不消除实际 HOST_PORT_REJECTED 与120秒running缺陷，原RED保留。原不同参五轮纠错仍断言 succeeded。

## 测试写集与真实 RED/GREEN

- `backend/src/modules/execution/workbench-plan.service.test.ts`：删除“两个手填相同 digest 就算同参”的假前提。用可信 resolver fixture 返回两个各自不同完整 digest、但同 frozen tool/input/effect/execution 的 binding，验证可收口；数组顺序、值、字段、tool/version/effect/execution/error code 任一不同不收口；损坏 receipt、toolCallId/name 不符、resolver 拒绝均不收口。
- `backend/src/modules/ai/chat-turn-completion.service.test.ts`：真实 task/calls/lease/checkpoint 下，worker 只提交 call IDs；完成服务从内部 binding 解析。同参两次 + latest settled stop 成功写 partial 终态一次；不同参、单次、非最新 stop、漏 call、伪 call ID、跨 task/user/workspace、过期 lease 全拒且零消息/result/终态写。
- `backend/src/integration/chat-workbench-plan.integration.test.ts`：保留本次真实公共 Worker RED，实际两次 model 产生不同 model/toolCall 和不同 ledger inputDigest，但原 provider 参数相同；期望任务有限收口、两条原 invalid_input 卡及 partial notice 可读、plan 不写。增加不同参数公共 Worker 旅程继续纠错而不是提前终态。
- 若 dispatcher 内部 tools resolver 新增独立逻辑，在现有 `model-worker-dispatcher` 测试文件中覆盖 active scope 的原 frozen tools 被复用、worker 无法自报 tools、scope 消失 fail closed；只有实际新增逻辑才准入该测试路径。

所有测试 retry 0；单次 Worker 观察预算至少两分钟，外层覆盖两轮 model/tool、提交及清理。保留本次 120 秒失败日志，不重命名为 PASS。

## 必须保持的安全边界

- 不改变 tool ledger `inputDigest`、model/provider receipt、operationKey、费用、租约、fence、deadline、checkpoint 或 call 树。
- 不信任 worker 声称“同参”；worker 只提交既有 call IDs，后端独立复原每条 binding。
- 不允许 child call、未 settled、resultText 缺失/损坏、retryable、sideEffect 非 none、unknown 或成功回执进入终态失败组。
- 至少两条、同一且唯一 terminal group、调用 ID 原顺序精确匹配规则保持；不同参数继续下一模型纠错。
- 不删除原 plan failure 校验、卡片确认、最后 stop、partial notice、消息/result 幂等与同事务提交。
- 旧任务没有可复原 frozen binding 时保持 running/可恢复或明确失败，绝不以 Pi `{}`、receipt 自报参数或 digest 忽略降级。

## 验收标准

1. 静态证明每条候选 call 都经 `forCall` 对原 task/model receipt/frozen definition/ledger digest 完整复核；worker request 中没有新增可信参数入口。
2. 真实公共 Worker 同参例：两条 ledger inputDigest **不同**，解析出的 canonical 业务签名相同，两条 settled invalid_input 原回执匹配，最终一次 partial 终态（executionTask.status 与 aiTask.status 均为 partial，metadata.completeness=partial、stopReason=stop）；任务/消息/result/finish/checkpoint 一致且 plan payload 未写。
3. 真实公共 Worker 不同参例：两个 canonical 业务签名不同，不能提交 terminal failure IDs；任务继续原纠错流程，不制造 succeeded。
4. 篡改 model provider input、toolCallId/name、definition version/effect/execution、call digest、receipt output/error，或换入跨任务 call 时均确定性拒绝且零业务完成写。
5. 原 T1085 四个 backend plan 用例继续全 PASS；Pi 参数恢复协议用例继续 PASS，不复活 `{}` 签名。
6. 运行 workbench plan、chat completion、公共 Worker integration 及相关 durable ledger/authority 回归，backend typecheck、boundary、semantic、timeout Gate；实际 argv/exit/log SHA 单独记录。
7. 实施独立复核后才能称实现 PASS；本草稿不代签安装版、真实付费模型或 T1086/T1062。

## 明确不采用的方案

- 比较或忽略 `call.inputDigest` 的一部分、把 digest 直接删出所有安全检查。
- 读取 Pi SDK message 中的 `arguments:{}` 或 worker 回传 input 作为参数权威。
- 只按 toolName + errorCode 分组；这会把不同参数失败误收口。
- 让 worker 传 canonical digest 并由后端照信。
- 将两次失败改成一次、降低至少两次门槛，或把 running 强制写 succeeded。
- 修改 T1085 已完成 callback、原不同参纠错旅程的成功断言或 production plan 保存语义；新增同参例按上述原 partial 合同校正。

## 当前源码与证据绑定

- `backend/src/modules/execution/workbench-plan.service.ts` SHA256 `ee509ea5f52cc19041ee7d7155f397452369ba68dcc8c940cc57e7a2ba9b3220`
- `backend/src/modules/execution/agentic-tool-binding.ts` SHA256 `aa396ac9b8eec023124da7c78cb7e4d78ef86534dae8701c693f41e1a7f2ccde`
- `backend/src/modules/ai/chat-turn-completion.service.ts` SHA256 `90139acc4f101b2a5435cf950df04acd7bf75558b268c0770da344f806eb7e07`
- `backend/src/modules/execution/model-worker-dispatcher.ts` SHA256 `dcf1578774e35f8c4a0143414438f2020dfa6f977ad141d2c029aa57b91a5181`
- `backend/src/modules/execution/workbench-plan.service.test.ts` SHA256 `09c43b2605f7bfa1480f801cd2896a40b2ea996fd6f11ea236bf1f9691a12caf`
- `backend/src/modules/ai/chat-turn-completion.service.test.ts` SHA256 `1a7c8d52684d5ed77f8eda15a7ff84e207dd3b9fc2d2092b38f731a3eedb6741`
- `backend/src/integration/chat-workbench-plan.integration.test.ts` SHA256 `f7f7944820e0327de715ff30422bb92b7a4e73a9cccbc7655ff10c651bc86a72`
- `/Users/zyongzhu/CreatorOS-local-acceptance/main-installed-20261008/t1085/plan-signature-green-first.log` SHA256 `3afe7e64f3de42774099c79d374267630837ba6366561adf24dbe3c43e3199a1`
- `/Users/zyongzhu/CreatorOS-local-acceptance/main-installed-20261008/t1085/protocol-signature-green-first.log` SHA256 `b5655a832c8ebfdf290dc0292af64d5a4fd15832bc850d5c0c4e8859f3020562`（T1085 Pi 参数协议已绿，只作不回退边界）

## 未验证

本诊断未修改仓库，未运行模型、数据库、测试、构建、App 或业务 API。真实 RED 已发生且保留；上述实现、测试、正式任务登记、SPEC 独评和最终安装验证均待 root 后续流程。
