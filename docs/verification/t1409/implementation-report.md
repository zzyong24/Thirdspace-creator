# T-1409 实现与聚焦验证报告

日期：2026-10-25。执行者：子代理 `/root/t1408_pi_diagnosis`。本报告只覆盖授权源码与隔离测试；没有调用真实业务、读取用户数据库/密钥、使用原任务最后一次恢复预算，也没有提交代码或改动控制面。

## 结论与边界

已实现受管 Pi 的泛 HTTP 402 安全分类和持久诊断，补齐字符串 `error` 与 `error.type` 的内部提取；明确额度信号继续沿用 `AI_CREDIT_EXHAUSTED`。泛 402 使用 `CHANNEL_MODEL_PAYMENT_REQUIRED`，不再用余额不足解释没有余额证据的拒绝。未输出时保留 `waiting_user`、原 rejected call 和安全固定提示；已有输出仍为 `unknown_result`。没有添加自动重试或备用源调用。

公开 `settings.models.test` 的正式 Worker 只通过 IPC 传递 message，再重建普通 Error。入口现仅在 `channel-managed` 下完整匹配 contract 的两条固定提示，最多剥离 worker 的一层合法状态码/空状态前缀；支付提示仅接受 402 前缀。任意附加正文、未知码、自配模型继续走原有安全错误提示。未扩展 IPC schema 或通用错误正文出口。

局部实现验证通过不代表原任务已恢复，也不代表现场支付/额度原因已经证实。原任务 `ai-task-5e73167d-401` / `execution-task-5e73167d-402` 的实际 402 原因仍未知；安装、公开 CLI 核因、原任务恢复与总验收由 T-1408 主任务执行。

## 评审前置依据

- 初审：`PASS[REV:9fa8ff0c623b]`。
- contract 测试路径修订：`PASS[REV:e0ed2a67cf18]`，允许 `contract/tests/provider-error-detail.test.ts`，未另建 src 测试。
- FR-140903 IPC 定向修订：`PASS[REV:04839f8bcbce]`；SPEC SHA-256 `e1b986306ebc2364bdee7396eb5c4bdb1a30e6552a3d59462e46a878a49bac97`。
- 该修订已将真实 IPC 丢失 code 纳入合同，未用 mock 带 code 的异常冒充公开入口证据。

## 修改文件

产品 6 个文件：

- `contract/src/provider-error-detail.ts`：集中两条固定提示；提取字符串 error 及对象 code/type/message，原脱敏与长度限制保留。
- `ai-worker/src/runtime/provider-factory.ts`：受管泛 402 转安全支付领域码与 `retryable=false`；保留旧额度常量导出兼容。
- `ai-worker/src/execution/generation-error.ts`：无输出支付拒绝保留等待用户状态、领域码与固定提示。
- `ai-worker/src/runtime/error-diagnostics.ts`：支付领域码对应固定提示，额度常量复用 contract。
- `backend/src/modules/execution/model-engine-error.ts`：原任务显示固定提示，不放宽任意 outcome.errorMessage 出口。
- `frontend/src/server/settings-model-test-wrap.ts`：只对受管探针匹配完整 canonical 消息，普通 Error 跨 IPC 后仍可安全展示。

测试 6 个文件：

- `contract/tests/provider-error-detail.test.ts`
- `ai-worker/src/runtime/provider-factory.test.ts`
- `ai-worker/src/runtime/error-diagnostics.test.ts`
- `ai-worker/src/execution/durable-stream-model.test.ts`
- `backend/src/modules/execution/execution-worker-outcome.service.test.ts`
- `frontend/src/server/settings-model-test-wrap.test.ts`

`ai-worker/src/execution/durable-pi-stream.test.ts` 在授权写集内但未修改，仅运行回归。

## 当场红测记录

| 日志 | 结果 | 失败意义 |
| --- | --- | --- |
| `contract-red.log` | 3 failed / 2 passed | 旧解析遗漏字符串 error 与 error.type |
| `worker-red-retry0.log` | 6 failed / 40 passed | 真实 HTTP→Pi→modelFor→聊天 durable 的余额提取及泛 402 领域诊断缺失；固定诊断函数缺失 |
| `backend-red.log` | 1 failed / 10 passed | 任务读取被泛等待提示覆盖 |
| `frontend-probe-red.log` | 11 failed / 55 passed | 7 个 canonical 文案用例与 4 个真实 HTTP→Worker→IPC→普通 Error 用例均被配置通用错误覆盖 |

最初 `worker-red.log` 使用仓库默认重试 2 次，随后同一旧源码以 `--retry 0` 重跑并保留 `worker-red-retry0.log`，没有把重试当额外独立测试。首次前端测试在 jsdom 下导入 esbuild 触发跨 realm TextEncoder/Uint8Array 不变量，0 tests，保存为 `frontend-probe-environment-failure.log`；将这个 server 测试文件标记 Node 环境后，得到上述真正红测。环境失败不作 TDD 红测证据。

## 最终聚焦绿测

全部使用 `--retry 0`，退出码 0：

| 日志 | 文件数 | 通过数 |
| --- | ---: | ---: |
| `contract-final-green.log` | 1 | 5 |
| `worker-final-green.log` | 9 | 129 |
| `backend-final-green.log` | 1 | 11 |
| `frontend-probe-green.log` | 1 | 66 |
| 合计 | 12 | 211 |

Worker 最终回归包括 provider-factory、error-diagnostics、durable-stream-model、durable-pi-stream、durable-generation-model、pi-provider-http、pi-provider-deepseek、pi-provider-diagnostic、worker-runtime。扩大范围的原因是 generationFailure 由多个调用链共用；没有反复扩大已通过测试。

`git diff --check` 通过。全工作区 typecheck、timeout-policy、boundary、quality 与独立实现审查由主任务统一完成；本报告不提前标记这些 Gate 通过。

## 可观察的安全与恢复证据

- loopback HTTP 实际进入 Pi，覆盖字符串 error、对象 code/type、SDK 短消息、含伪造 provider/model/URL/token/headers/body 的泛 402、自配 402。
- 每例计数恰为一次 HTTP；聊天 fallback spy 未调用。输出前拒绝账本为 rejected；部分文本后断流为 unknown，保留文本与 unknown_result。
- 受管异常、结算和公开结果不包含测试用的私密字段；所有测试密钥和正文均为合成 fixture。
- 后端隔离 fixture 中原任务进入 waiting_user，自动 claim 为 null；显式 resume 后仍是同一 task，新调用通过 retryOfCallId 指向旧调用。
- 前端集成临时打包原 `model-probe-worker-entry.ts`，使用正式 `piRuntimeInitializationPlugin` 与已导出的 `createModelProbeIoService`；明确断言收到 constructor 为 Error 且没有 code 的异常。每例 finally 停止 IO/HTTP，suite 清理临时包。
- 前端白名单负例覆盖附加私密正文、重复状态前缀、支付提示配错误状态、非法状态码、仅有领域码文本以及自配模型同文案；均不变成官方诊断或透出原文。

## 后续主任务验收

先做独立实现审查及全局 Gate，再本地冻结构建和安装。公开最小受管连接探针可区分明确额度不足与泛支付/权益拒绝，但泛 402 仍需正常余额入口或官方权威反馈核因；不可根据此诊断直接声称余额不足、钱包故障或服务已经恢复。原任务最后一次恢复预算继续保留给核因后的授权恢复。
