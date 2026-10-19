# T-1084 相邻集成失败只读诊断

- 评审时间：2026-10-08T15:46:20Z（Asia/Shanghai 2026-10-08 23:46:20）
- 方式：只读源码与既有日志；未修改产品或测试，未调用用户数据库/API，未启动模型或新增测试进程。
- 结论范围：本报告只判断三个既有集成失败与 T-1084 的关系，不代签 T-1084、安装版或完整回归 PASS。

## 结论

1. `chat-workbench-plan.integration` 的两个失败均**不是 T-1084 单属性改动造成**。该文件直接构造工具定义、提交任务并启动 dispatcher，没有调用 `prepareChatTurn`；T-1084 唯一产品变更位于 `chat-turn-preparation.ts` 的内层 `toolDefinitionOptions.workbenchCapabilities=[]`。
2. “两次非法回执后继续第三次修正”是**旧 fixture 与当前终态工具失败协议漂移**。当前协议对“同一工具、同一错误码、同一参数”的不可重试且无副作用错误累计两次后，下一轮强制 `tools={}`、`toolChoice=none` 做有限文字收口。旧 fixture 的第三个响应仍派发 `plan_update`，违反当前请求协议，任务失败符合现实现；不能靠放宽生产门恢复五轮工具调用。
3. “暂停后必须进入 unknown_result 且不得再请求”也是**旧恢复预期与当前安全恢复协议漂移**。暂停的第二次请求只是无供应商结果、无子调用、无外部副作用的根模型调用，满足 `resumableChatModelCalls` 的显式安全续跑条件；当前实现将旧调用废弃并继续相同任务，最终 `succeeded` 是预期行为。
4. `chat-read-host.integration` 的失败发生在准备阶段之后。三次尝试都输出了 `[chat-context] est=2329→2329`，说明 T-1084 原先修复的完整能力目录准备没有再次因 `plan.update` 缺失而在提交前失败。现有日志只记录“25 秒超时、retry x2”，没有保存第 177 行已有诊断字符串或最终断言栈，因而当前证据不足以判断是 fixture 漂移、Worker 后段缺陷还是环境超时；不能把它归因于 T-1084，也不能宣称无产品缺陷。

## 证据与因果链

### 后端：重复不可重试错误

- 旧 fixture：`backend/src/integration/chat-workbench-plan.integration.test.ts:31-46` 固定前两轮发两个不同非法参数，第三轮仍发 `plan_update`，并在 `:53-59` 要求五次模型请求、四次工具调用及最终成功。
- 当前协议：`ai-worker/src/runtime/chat/chat-pi-loop.ts:216-223` 以工具名、错误码和规范化参数组成签名；相同不可重试、无副作用错误累计两次后登记终态失败。`:84-89` 在下一轮进入 final recovery，`:96` 发送空工具表并强制 `toolChoice=none`。
- 当前协议已有精确测试：`ai-worker/src/runtime/chat/chat-pi-loop.protocol.test.ts:104-112` 要求两次相同 `invalid_input` 后第三轮无工具收口，只执行两次工具，并保留两条终态失败回执。
- 因此最小后续处理应是更新旧集成场景，使其验证：两次相同不可重试错误后有限收口、任务以已定义的部分结果/终态失败语义完成，且不第三次执行工具。若仍需验证“模型纠正不同错误后成功”，fixture 必须让第二次错误后的签名与第一次不同，避免触发重复错误门，并继续保留真实回执与计划 CAS 断言；这属于测试语义校准，不是 T-1084 产品修复。
- 现有失败日志只显示最终任务 `failed`，没有 `lastErrorCode` 和调用账本，故不能进一步断言失败码；但上述请求/响应协议矛盾已足以证明旧五轮预期不再成立。

### 后端：暂停恢复

- fixture：`chat-workbench-plan.integration.test.ts:191-205` 的第二个模型流只保持连接，不返回供应商结果，也没有派发工具；`:218-226` 仍期待恢复后 `unknown_result / CHAT_CHECKPOINT_REQUIRES_RECONCILIATION / requests=2`。
- 当前恢复规则：`backend/src/modules/execution/model-call-recovery.ts:72-89` 只允许恢复 `started|unknown`、无 `providerJob/providerResult/resultRef` 的根模型调用，并拒绝有子调用、结果文本或其它 pending 调用的情况。本 fixture 精确满足这些安全条件。
- 历史也表明旧断言早于当前恢复能力：该测试源自 `ad222e10 test: preserve plan and require reconciliation after interrupted model stream`；之后已有 `87607e90 fix: 恢复暂停模型并修复长网页读取和动作重放` 与 `da77cd61 fix: 恢复模型重试锚并贯通复制目录与多区域诊断`。
- 最小后续处理应更新该测试，验证旧根模型调用被标为可恢复终态、第三次请求沿原冻结任务继续、已结算 `plan.update` 不重放、计划从 revision 1 以真实原调用回执完成；不得删除原计划/账本/不重复工具的断言。

### 前端真实装配

- `frontend/src/server/chat-read-host.integration.test.ts:158-169` 通过 `prepareDurableChatTurn`，并在提交前严格断言包含 `context.projects / script.hooks / topic.generate / brief.fill`。三次 `[chat-context]` 输出证明这段准备至少已运行，没有再出现安装版原始 `plan.update` 完整目录校验错误。
- 测试在 `:175-177` 已准备了有价值的诊断：最终任务状态、`lastErrorCode`、模型请求数、工厂错误与未接工具。但当前 `public-chat-regression.log` 在测试摘要后转入下一 suite，没有 Vitest 的最终 failed-tests 段，因此这些事实没有落盘。
- 最小诊断建议：先等待/读取同一次现有 suite 的完整结束日志，取得第 177 行断言消息与最终栈；同时保留这次隔离 fixture 的任务最终状态、`lastErrorCode`、请求计数、`factoryFailure`、`missingTools`。若完整日志仍未输出这些字段，后续经范围准入后只增强测试诊断保存，不改产品行为或断言。当前禁止用三次 25 秒超时推断“plan 装配仍坏”、缺工具、模型失败或数据库问题。

## 证据绑定

- `public-plan-integration.log`: `b127d2e0fec582a84f404e44511731d988c00b01c9866c52fe40151a25257c11`
- `public-chat-regression.log`: `5cb3f5250baf999bfa7e72b3f8236d0f74a3fb7400f27ff4c2678b4c8e98c8c5`（读取时大小 4600 字节，属于缺最终断言段的进行中/不完整汇总证据）
- `chat-workbench-plan.integration.test.ts`: `e166b824e3c301dfaccbaea5836bafa98b6ee0b6611c9290284e43666eba1585`
- `chat-read-host.integration.test.ts`: `3005663879d77e8a980b3b667baad327738048edc2c0ea67d179797bf3ac91c3`
- `chat-turn-preparation.ts`: `4bcd064091f18250f1aaf97f6efdcdc06d4b426158dbdc0604cc67e404977ef5`
- `chat-pi-loop.ts`: `1bbde6d6fe9f126e4f10e518bf5dbb7d25a34f08b67c4bbebfd82e31d8f7da9c`
- `model-call-recovery.ts`: `7acf67fa290f352b778a9236cd5a992b4590730fc5890469d34d83724ef75b40`

## 准入判断

- 两个 plan integration 红测不应作为 T-1084 产品改动回退依据；应单独校准到现行终态失败和安全续跑协议，并重新实际验证。
- frontend chat-read-host 红测仍是未关闭的相邻回归，必须取得完整失败诊断并修复/校准后再验；在此之前不能把 T-1084 写成完整聊天宿主或安装版 PASS。

## 串行复核追加观察（同轮进行中）

- ROOT 后续启动了相同三个原文件、原断言、`--retry=0 --no-file-parallelism` 的串行复核。读取时 `public-chat-regression-serial.log` 尚未结束；目标 `chat-read-host` 单次在 5278ms 进入失败，而不是旧日志中 retry x2 累计的 25182ms。它再次输出 `[chat-context]`，仍证明准备阶段成功，但最终 Vitest failed-tests 详情尚未写出，不能提前定根因。
- 静态检查没有发现“点号工具名/下划线工具名”在当前链上直接错配：`chatToolProviderName` 统一把 `context.projects` 编码为 `context_projects`；`chat-pi-loop` 用编码名接收供应商调用，但向 `approve/execute` 传回原 definition 的业务名；`chat-worker-run` 在冻结范围和 reservation 回执处也用同一个 `sanitizeToolName` 比较。仅凭失败不能把命名层判成缺陷。
- 同轮 `planning.thesis` 原 fixture 也失败的事实提示问题可能位于两者共享的 Worker/提交协议，而非 Workbench plan 注入；但它同样不经过本次 T-1084 的 `prepareChatTurn` 改动。必须等待串行完整断言输出中的任务行、错误码和账本摘要，才能区分 fixture 预期漂移与共享宿主缺陷。
