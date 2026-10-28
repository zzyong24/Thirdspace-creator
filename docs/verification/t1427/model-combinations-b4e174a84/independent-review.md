# T-1427 安装版模型组合独立验收复核

> 接手说明：本轮只追加证据可得性备注；原结论和哈希仍指原验收时版本，不代表本机重跑。原文保留于提交 c8589fe7f。原件所在电脑依用户接手规划说明，本轮只核对本仓库。


复核时间：2026-10-25T13:10:03.538184+00:00。独立复核者：`/root/t1427_contract_review`。安装构建候选：`b4e174a8433e21f75bbc6b2f69b2e065855b7698`。

结论：本轮 4 个支持组合的 12 轮真实对话均满足约定的回复、跨轮记忆/计算和同组只读工具判据；`codex/pi` 按既定合同拒绝。原模型来源配置已真实恢复。没有发现 matrix、原始公开回执和 summary 之间的矛盾。**官方 Pi 仍未通过，不能把本报告解释为所有组合可用、T-1427 完成或允许推送。**

本次已读取 T-1427 任务包 §1–5、§7–9，写入前核对 §6；只读取已产生的回执、执行脚本和相关证据，并仅新写本报告。没有运行业务 CLI、探针、模型、剪辑、浏览器、测试或构建，没有更改配置、源码或控制面。按用户最新范围纠正，仅评审模型组合，旧剪辑失败不转为 PASS、不在本轮继续操作。

## 实际组合结果

表中 source 是测试窗口的模型来源设置，engine 是明确请求并由完成消息及 finish 事件共同回显的实际引擎；二者不是同一个供应商身份字段。

| 来源 / 请求引擎 | 本轮结果 | actualEngine | 三轮任务 / 拒绝回执 |
|---|---|---|---|
| `codex/codex` | 三轮通过 | `codex` | `ai-task-a057fe81-651`、`ai-task-a057fe81-715`、`ai-task-a057fe81-783` |
| `codex/pi` | 预期不支持：HTTP 409；无返回任务 ID | 未执行 | `0053-codex-pi-turn1-submit.json` |
| `official/codex` | 三轮通过 | `codex` | `ai-task-a057fe81-896`、`ai-task-a057fe81-951`、`ai-task-a057fe81-1005` |
| `self/pi` | 三轮通过 | `pi` | `ai-task-a057fe81-1085`、`ai-task-a057fe81-1126`、`ai-task-a057fe81-1160` |
| `self/codex` | 三轮通过 | `codex` | `ai-task-a057fe81-1219`、`ai-task-a057fe81-1282`、`ai-task-a057fe81-1332` |
| `official/pi` | 未通过；本次矩阵未重复提交正式三轮 | 不由本次矩阵证明 | 同安装候选 T-1417 的 128 成功 / 8192 HTTP 402，以及此前正式 402 证据，见下文 |

四组各自使用同一对话完成三轮；每轮提交的 conversationId、请求 executionEngine、返回 taskId、sourceMessageId、持久消息及 finish 元数据互相匹配。每个完成任务均为 `status=succeeded`、`runtimeStatus=succeeded`、无 errorCode，消息为 `completeness=completed`。没有仅凭 CLI 退出码或顶层 `ok` 签业务成功。

第一轮均真实回答创作者辅助问题，并以测试代号 `月光731` 结尾；第二轮提示没有重新提供代号，四组均精确返回 `月光731｜323`。前两轮的消息 parts 与完整事件流都无工具调用。

每组第三轮都只有一个工具输入和一个对应输出，使用 `system.read` 或 Pi 序列化名 `system_read`，输入请求精确为 `accountGroups.get` 且 groupId 与绑定组一致。工具输出 `complete=true`，标准 outcome 为 `status=ok`、`sideEffect=none`；最终回复的组名称与该真实结果一致。未发现业务创建、修改、采纳、发布或外部采集工具事件。本报告不复述组成员、账号标识或原始工具结果正文。

独立解析了全部 198 份 CLI 回执，完成 12 轮 matrix 与原始 submit/task/messages/modelCalls/events 的逐项比对。各轮事件页从 afterSequence=0 开始、序号连续、末页 hasMore=false；事件 text-delta 拼接结果与持久回复逐字相同，finish 元数据也一致。总事件中有 12 个 finish、4 对工具输入/输出，其余为文本事件。Pi 的 modelCalls 回执均 valid 且无截断；Codex 的 modelCalls 汇总为空，不能用其空数组证明未执行工具，本结论依据实际消息 parts 和完整事件流。 【2026-10-28 接手补注：所述198份原始CLI回执目录当前未入库；原始日志和截图在朱志勇机器上，未入库。】

`codex/pi` 只有一次消息提交，原回执 exitCode=4、`ok=false`、`HTTP_409`，明确报告当前 Codex 来源不能由 Pi 执行，未返回 taskId；驱动没有继续第二、第三轮。其结果是预期拒绝，不是成功对话。其他 CLI 回执正常，未见未解释的非零退出。

## 正常终态与配置恢复

等待原脚本全部运行结束、route-restoration 实际生成后才形成此结论。`driver-exit.json` 记录主线程 exec session `56040` 实际退出 0，观察时间 `2026-10-25T13:05:47.349843+00:00`；我核对其 logSha256 与当前 run.log 一致。这是主线程原执行终态收据，独立审核没有重新运行脚本，也没有把审核中的只读解析当业务复验。

初始公开 routing 回执为 revision 77、text=`codex`。三次写入均携带对应 expectedRevision，服务响应和后续公开回读一致：

| 原始回执 | expectedRevision | 返回 revision | text |
|---|---:|---:|---|
| `0057-set-route-official.json` | 77 | 78 | official |
| `0104-set-route-self.json` | 78 | 79 | self |
| `0194-set-route-codex.json` | 79 | 80 | codex |

最后 restored-route 的原始成功响应与 route-restoration.final 精确相同；初始 choices、originalChoices、最终 choices 及 routing-state.original/choices 全部一致，最终 revision=80。vision/image/video/audio/embed 在整个三次写入中均保留原值。驱动先核当前 revision/choices，再作 CAS；本轮没有发生覆盖他人配置的可见冲突。 【2026-10-28 接手补注：本段原始路由回执未入库；原始日志和截图在朱志勇机器上，未入库。】

本轮直接业务调用只有路由读写、一次账号组核实、五个专用测试对话创建、13 次消息提交（12 次成功及一次预期拒绝），以及任务/消息/模型调用摘要/事件读取。没有 `settings.models.test`、恢复/重试原任务、支付、剪辑或采集调用。专用测试对话和消息的创建是本次授权的测试记录，不能因此声称整个用户持久层零写入。原任务最后一次恢复未在这条执行链中使用。

此前并行 `test -f` 检查发生在 finally 尚未写完时，不足证明恢复失败，也不能提前签成功；本报告依据随后真实生成并与原始响应相等的恢复证据，不改写该早期检查结果。

## 官方 Pi 与供应商身份的边界

同一安装候选的 T-1417 已留存并独立核过两个 `copilot.assist` 最小探针：128 的 CLI 顶层 ok=true 且 data.ok=true；8192 的 CLI 顶层 ok=true、exitCode=0，但 **data.ok=false**，固定诊断为 HTTP 402。它们分别为请求 `req-a057fe81-191` 和 `req-a057fe81-198`，不能把传输成功当模型成功，也不能用最小回复代替正式上下文和工具验收。

此前 `f9e5e5ece` 正式请求的公开 inspect 回执仍为 `execution-task-c34e9921-537`、`blocked/waiting_user`、`CHANNEL_MODEL_PAYMENT_REQUIRED`。这是前候选正式失败的历史证据，不冒充 `b4e174a84` 的正式三轮执行。当前 summary 将 officialPi 标为 `NOT_PASSED`、formalThreeTurnTest 标为 not passed、allCombinationsPassed=false，表述准确；本轮没有为追求全绿重发官方失败请求。

`official/codex` 和 `self/codex` 的 actualEngine、protocolKind 均证明由 Codex 引擎 / codex-app-server 完成；路由来源设置为 official 或 self，不能据此推断对应官方或自配 API 已恢复。`self/pi` 证明当前自配路由下 Pi 的这三个约定文本场景可用。原始 task.modelKey 为空，本报告不虚构底层精确模型 ID，也不将这次来源/引擎矩阵扩写为所有供应商、图像/视频/音频或任意复杂任务的质量验收。

此处没有验证 pmem/reconcile、完整工程门、远端合并或推送状态，没有新增预算/恢复/资金授权。正式官方 Pi 验收未满足，因此仍须保留失败并继续有证据的修复或核因；本报告不批准推送。

补核主线程随后落盘的 `RESULT.md`：表格、12 轮判据、来源/实际引擎区分、恢复结果及官方 Pi 未通过均与原件一致。公开 `models.json` 的 default 配置确实标为 MiniMax-M3；这只能支持配置名称描述，不能反推所有回执的实际供应商型号。公开文档访问证据仅记录一次页面返回 403，不能据此确定 402 根因。

可用性局限也如实保留：26.784–80.227 秒是包括 CLI 提交、等待和回读的观察墙钟，不能当模型净生成时延；self/pi 第三轮虽只调用了允许的只读工具，回答仍附带了不必要的内部组 ID 和成员概述。它符合本次功能断言，但表达可以更简洁，不能据三轮功能通过宣称体验没有问题。本报告不复制那些原始字段。

## 字节绑定

201 项 receipt-hashes 条目（198 份原始回执及 matrix / route-restoration / routing-state）均逐文件重新计算 SHA-256，与清单一致。下表绑定本次结论所用摘要、脚本和相关历史证据；完整逐回执哈希在已核清单中，未复制成员正文。 【2026-10-28 接手补注：receipt-hashes.json 清单已入库，清单所指 cli-retest/ 原件未入库。以下历史哈希保持原值，不代表本轮逐项重算。原始日志和截图在朱志勇机器上，未入库。】

| 项目相对路径 | SHA-256 |
|---|---|
| `docs/verification/t1427/model-combinations-b4e174a84/run-installed-retest.py` | `8cbb4c646a8a1e73016d8bc6d773591cb06e33947c7b6167783ad8e8653b4749` |
| `docs/verification/t1427/model-combinations-b4e174a84/verify-results.py` | `33148a7728355c313e145d59f057ec777cb45cc31b000d5c64893d2b167f3f1f` |
| `docs/verification/t1427/model-combinations-b4e174a84/driver-exit.json` | `1194b296944694da43e31de8db8b2f943834abe556cda19d14df7b08b68c8bb7` |
| `docs/verification/t1427/model-combinations-b4e174a84/run.log` | `9103ea9427a41db7e7accda38ef94553a4372ab6a4ac0e63816dabe3d1b3d024` |
| `docs/verification/t1427/model-combinations-b4e174a84/status.json` | `563fc6ba91bf46f694a1412a92d2fcfe0ea0eba537719cb3fba2190e23cfb2ca`  【2026-10-28 接手补注：原始日志和截图在朱志勇机器上，未入库。】 |
| `docs/verification/t1427/model-combinations-b4e174a84/summary.json` | `5df2ddeae366d26689d888dc6d0480d21b1d181ba07552714f2b03cec1030604` |
| `docs/verification/t1427/model-combinations-b4e174a84/receipt-hashes.json` | `8a5dd5164831a548bd31b20b583b31463c0c4e852c6b08df3a31882f0c057ba6` |
| `docs/verification/t1427/model-combinations-b4e174a84/cli-retest/matrix.json` | `8cda43adce7ef49e1fb541b7e3408d65e9bb84162a6eeece8dfdea9043dfb0d0`  【2026-10-28 接手补注：原始日志和截图在朱志勇机器上，未入库。】 |
| `docs/verification/t1427/model-combinations-b4e174a84/cli-retest/route-restoration.json` | `37996e0e07abb66bc6460b4ec017ddd652dac306561f12b7e4d32a1cdf22b05a`  【2026-10-28 接手补注：原始日志和截图在朱志勇机器上，未入库。】 |
| `docs/verification/t1427/model-combinations-b4e174a84/cli-retest/routing-state.json` | `dc26f4285ff66172606ca235e6166c1c209440825af3c2183588e3f477137c70`  【2026-10-28 接手补注：原始日志和截图在朱志勇机器上，未入库。】 |
| `docs/verification/t1417/installed-review.md` | `a6dee58760d3d8778bbf7dfff5e66ddcfec6d69ca77ce616b1592d7ce4aa8106` |
| `docs/verification/t1417/installation-proof.json` | `b9c2f661d1697e2339b32c7c477dc22a7068382b40eed15794e8973bf43148c9` |
| `docs/verification/t1417/installed-cli/020-probe-128.json` | `e1baeda7a31ea156cb2e2e0a8e074955001da95d9369d6c5b1d6718df1ba5925` |
| `docs/verification/t1417/installed-cli/022-probe-8192.json` | `746a263887c531490e44a8f94ab78fd2997900660913fd2b019978e5d93f6357` |
| `docs/verification/t1427/resumed-f9e5e5ece/new-official-task.json` | `c8f6f8b0e0c530f3b745f9b075d968a4c2e702b78ff5a7b9481efafb46b7d48d`  【2026-10-28 接手补注：原始日志和截图在朱志勇机器上，未入库。】 |
| `docs/verification/t1427/model-combinations-b4e174a84/RESULT.md` | `63eb16133ba4ea84e899e0ec2e3ab59bd50cf8342b6a850bb2517bbd7cd0d591` |
| `docs/verification/t1427/model-combinations-b4e174a84/models.json` | `48bd1cd86fadbb39432a81caeb9eb49736fd919adfd16a812dae9aef5b9c0067`  【2026-10-28 接手补注：原始日志和截图在朱志勇机器上，未入库。】 |
| `docs/verification/t1427/model-combinations-b4e174a84/provider-public-docs.json` | `f101bd942bdfaa90861ffd2119fc6f08804eaed7f85bee45bba1f2de3e8382ae` |
