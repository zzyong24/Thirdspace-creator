# T1310 独立规格初审记录

本轮完成当前规格的完整 initial 审查，未提出 finding。正式规格裁决由 `reviewctl` 消费同目录 `SPEC_REVIEW.json` 后计算；本记录不代表已经复现首个异常、已修产品或功能验收成功。

## 审查身份与冻结输入

- 审查者：GPT-6.1 Sol，high，独立 Agent、全新上下文；作者 C 也是 GPT-6.1 Sol/high，独立性类别为 `homogeneous`。未冒称跨模型或跨家族审核。未主动开启 Fast；工具无 tier 开关/读回，因此未声称已验证 tier。
- 已读取 `product-to-code-orchestrator`、`spec-reviewer.md`、`stage-router.md` 与 `_COMMON.md`；技能与项目版本同为 `3.29.0`。
- 实际 HEAD：`21aa443545a740004c033ba5de30ddf0ea051afb`。
- SPEC：`docs/features/t1310-topic-chat-completion-conflict-diagnosis.md`，SHA256 `d156a5fcfb8968929c97d4a5ff65834ad7ca6ed430d45d5fb2b74d354971d403`。
- constitution：`orchestrator/SYSTEM_ARCHITECTURE.md`，SHA256 `eb1826d4c09054df622d9718c38ca372bd19833e72bd1a752757631a5747c1df`。
- 输入锁：`INPUT_LOCK.json`，SHA256 `758eebb95cbea7a031ef72a7ac9400e565592e830ab154be78ffca0b45a960ae`；实际逐项核验 33 项路径、字节数及 SHA256，零不符。
- 模块范围：`MODULE_SCOPE.json`，SHA256 `b0677e8546272623b5da62c5cd628728ad1aecff29c1e7b2e8ac2a3d5d119413`。
- 实核只读 worker：`/private/tmp/t1300-artifact-bcz9nlt5/sidecar/frontend/runtime/execution-worker.cjs`，5,618,216 字节，SHA256 `3851b4fb132035f1b03528d68b0fa1c5ab86bda8134d8b98795252295c5a6454`。

## 独立核查与判断

| 核查项 | 真实消费者及结论 |
| --- | --- |
| 当前阶段和授权 | 当前维护期 BUILD 的新诊断任务，只允许自身 runtime 与 DIAGNOSIS_RESULT 写入；零产品/contract/既有测试修改。诊断无结论亦可如实交付，若要修产品必须另有精确方案与独立初审，不暗中扩大本任务。 |
| 原件事实与未知 | 原 U04 public POST200 后 execution 最终 cancelled，attempt6/maxAttempts3；公开 modelcalls-allpages 确为 calls=[]/hasMore=false。它不足以证明内部未调用，更不能推出首个 complete 的具体失败断言。规格保留 pure-group inspect 合同拒绝、logger 缺上下文和未冻结活动全文的限制，不强认与 U05 同根因。 |
| 外部父工具到子模型链 | 源码 `createExternalChatToolConsumer` 先 recordCodexToolCall/checkChatToolApproval，再经 durable reserveAgenticTool 进入 `runChatGenerationInWorker`。该 worker 走真实 resolve/prepare/reserve/start/settle/complete 端口，host `execution-chat-generation.service.ts` 基于父工具绑定、原 node preparation、identity、完整子调用序列和回放完成候选。与短 host `external-task-tool.service.ts` 路径明确区分；后者自身不能代签 worker.structured-node 主族。 |
| schema 与首错观察 | 当前 `generationSettlementSchema` 要求 settled 的完整 workerProviderReceipt 与 usage；`complete` 经 receipts() 拒绝未知/未确认前缀、缺 totalTokens/providerResult，再经原节点回放验证 consumed/下一请求和输出。当前规格要求实际消费者及真实 schema，并保存首 throw 安全 stack、账本/attempt/fence/状态/结果；未预判是费用、输入、归属或 daily 根因。 |
| 原生只读恢复 | `codex-read-recovery.ts`、`chat-generation-recovery.ts` 及 complete/settle 的消费者要求原任务、原根和子 call、thread/turn、preparation、identity、provider receipts、期限/continuous 及当前 fence。`reserve` 有原生只读恢复不能新增生成调用的明确拒绝。规格三族中的恢复样本要求沿这些真实约束，未新增原任务恢复授权。 |
| 正常、partial/结构修复和重复 | worker 用 durable model 运行原 structured sequence；异常时尝试原 complete 重建，仍不能完成时按原 failure 语义处理。规格要求正常回执、partial/结构修复、原生只读恢复三族分别走实际消费者，并对照 API/Codex、pure-group/合法legacy账号、一次完成/重复回执，足以区分合法原回放与新调用。 |
| 现有测试的可复用边界 | 现有 `chat-generation-worker.test.ts` 主矩阵为 legacy HTTP topic.enrich/定位/诊断，beforeAll 会构建 W 外 dist；`chat-work-editor-worker.test.ts` 的 Codex 覆盖为 host read/propose。它们均不能代签 v2 Codex external topic.generate。规格准确声明主族新增诊断的必要性，并禁止原样 beforeAll 构建。仓内已有 Codex provider 公共测试展示可仅替身 AppServer 边界、保留真实 SDK/provider/native 协议的办法，受控实现可在授权 runtime 内组合。 |
| 隔离、清理与执行预算 | 只用新 owned DB/fixture 和受控 provider，无当前 App 请求、真实模型、旧任务重发/续期/改状态。显式 Vitest config 仅选择本任务，单 worker、retry0、test/hook≥180s，外层覆盖启动/串行/清理；绑定旧 worker 不等于已成功运行协议链。日志只保存必要安全字段；新派生输出须先明确授权。 |
| 架构与证据诚实 | worker 经 backend service port，真实 schema/领域 complete 保留；代码仍只核机械权限和协议。诊断不改 continuous/maxAttempts、费用、取消/fence 或通用模型策略，不把原取消或空公开投影洗成功，也不成为父任务其它验收的循环依赖。 |

大白话：保留已经取消的失败任务，用全新的隔离样本走同一条工具完成链，记下真正第一次被哪项检查拒绝；若样本没有重现，也只能报告这次没有重现。

```mermaid
flowchart LR
 A[原失败与取消原件] --> B[只读代码映射]
 B --> C[新隔离父工具和子模型样本]
 C --> D[原prepare到complete真实端口]
 D --> E[首个异常与原账本证据]
 E --> F[有界诊断结论]
 F --> G[若需产品修改另立精确修复方案]
```

## 未发生的验证与执行前提示

本次只运行只读文件检索、哈希和源码检查；未运行受控 harness、测试、真实模型、浏览器、RPC、数据库访问、构建、reviewctl/taskctl 或控制写入。未停止或重启 controller94030，未打开活动业务库或读取敏感原始日志。没有新受控 RED、原案根因结论或功能 PASS。

只读 `context-plan.mjs --task T-1310 --json` 当前返回“无法从 progress.json 唯一确定当前 pending/claimed step”。这是新任务尚无可唯一定位执行步的真实结果；由控制 writer 在正式诊断前完成登记和 packet，不由 reviewer 补造。未将它作为规格缺陷。

执行者仍须实际运行三族完整链并区分真实执行与替身范围，保留失败/首错/未复现、HTTP与模型调用数、原 call 树及清理结果。新的 fixture 异常不能追认为原 U04 首抛，原取消任务不得重发。本次空 findings 仅代表当前规格未发现实质缺口。
