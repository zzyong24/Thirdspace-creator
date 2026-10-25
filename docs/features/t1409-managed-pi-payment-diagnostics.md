# T-1409 官方 Pi 支付拒绝的安全诊断

用户2026-10-25要求继续修复官方Pi402，验收通过后再推送；本任务从T1408已授权闭环拆出确定性产品缺陷，不新增钱包调整/付款/换源授权。

## 事实与边界

原task ai-task-5e73167d-401 / execution-task-5e73167d-402 已合法resume一次，attempt2仍http_402/waiting_user。仅已结算调用进入modelCalls摘要，空摘要不是未调用。错误在Pi提取、受管保护、generationFailure与outcome层丢失。providerErrorDetail对字符串error和error.type读取遗漏已证实；不能据此断言现场就是该响应。真实支付/额度原因仍未知。当前浏览器旧额度页面刷新要求重登，旧余额不是当前依据。

## FR-140901 错误提取与对外安全分类

在现有错误边界识别对象error.code/type/message、字符串error以及SDK短消息，保留原有非JSON短消息长度/凭据脱敏。仅内部解析错误正文，不把任意body/headers/cause挂入受管错误。受管模型明确信号仍按既有AI_CREDIT_EXHAUSTED分类；泛HTTP402新增领域码CHANNEL_MODEL_PAYMENT_REQUIRED，固定中文提示“官方模型服务返回支付或权益核验拒绝（HTTP 402）。请在设置查看 AI 额度与消耗，核对后继续原任务。”不把泛402认成余额不足，不透传任意供应商code或model/provider/URL/token。业务码只使用明确白名单映射。

## FR-140902 持久诊断与恢复

CHANNEL_MODEL_PAYMENT_REQUIRED在无输出时为waiting_user，retryable=false；有输出保持原unknown_result规则，不改变恢复授权、预算、请求指纹或来源。GenerationFailure与原rejected call留安全领域码/固定诊断，backend原任务展示相同固定信息，不被泛等待提示覆盖。明确额度耗尽仍显示既有额度入口；401/403、400/404/422、429/5xx、断流分类不退化。不得添加自动重试或自动换源。

## 精确写集

- contract/src/provider-error-detail.ts
- contract/tests/provider-error-detail.test.ts
- ai-worker/src/runtime/provider-factory.ts
- ai-worker/src/runtime/provider-factory.test.ts
- ai-worker/src/execution/generation-error.ts
- ai-worker/src/execution/durable-stream-model.test.ts
- ai-worker/src/execution/durable-pi-stream.test.ts
- ai-worker/src/runtime/error-diagnostics.ts
- ai-worker/src/runtime/error-diagnostics.test.ts
- backend/src/modules/execution/model-engine-error.ts
- backend/src/modules/execution/execution-worker-outcome.service.test.ts

优先通过现有modelEngineUnavailableMessage领域映射完成backend提示，无需放宽outcome任意正文出口。若实际还需pi-provider或协议等路径，先补精确合同并独审。

## AC-140901–04

1. 使用本地HTTP真实Pi适配器到受管modelFor与durable链红测：字符串error、对象code/type、JSON混入token/URL/模型名、未知402、部分输出断流；旧代码准确失败后实现。只明确余额证据为AI_CREDIT_EXHAUSTED；泛402为独立支付拒绝。
2. 检查安全错误对象、原rejected回执及后端task读取无原body、token/model/provider/URL，领域消息不是假余额。无备用源、无自动重发。现有权限与恢复回归通过。
3. 相关contract/worker/backend聚焦测试、各工作区串行typecheck、LED053/047适用回归、boundary与独立代码审查。真实CLI与安装/界面验收由T1408总任务执行；本任务局部通过不能标原402恢复。
4. 原任务最后一次尝试留待新包安全诊断及权威原因核对后再用；允许用公开settings.models.test最小官方探针核因，按当前路由CAS保存恢复，不建替代对话冒充原任务。

## FR-140903 公开最小连接探针保留安全领域诊断

settings.models.test的textModelProbe目前catch把所有非鉴权错误收成密钥/Base URL配置提示，修复worker后仍会丢失402分类。将frontend/src/server/settings-model-test-wrap.ts及对应.test.ts加入精确写集；仅spec.displayModelKey=channel-managed时，读取既有safeModelFailureMessage白名单安全输出，将AI_CREDIT_EXHAUSTED与CHANNEL_MODEL_PAYMENT_REQUIRED固定诊断原样给CLI/UI。其它自配配置错误行为不变，不导出原body/供应商身份。红测受管明确额度、泛402、安全异常正文与自配402；同一默认模型最小探针，不增加探测次数。

### FR-140903 IPC 边界的定向修订

正式探针worker只发安全message，request-io重建普通Error，领域code不会跨IPC。两条固定提示集中从contract/src/provider-error-detail.ts导出；frontend仅对channel-managed精确完整匹配这两条canonical提示，允许剥离现有worker实际添加的单个HTTP状态前缀（支付拒绝仅402）。命中返回contract常量，未知内容仍走安全通用提示；不模糊匹配、不透传任意正文、不伪造错误code。

settings-model-test-wrap.test.ts中的集成回归临时打包原model-probe-worker-entry（既有esbuild及piRuntimeInitializationPlugin），通过已导出的createModelProbeIoService及真实IPC、普通Error重建、runModelConnectionTest，配本地HTTP测试泛402/明确额度/私密混入/自配402。每次只发一次HTTP，不调用原用户task，finally停止IO与HTTP、删除临时产物。无需扩IPC schema或request-io生产路径。该修订销账本轮独审提出的丢码finding，保留原只读反馈，不把mock带code异常当真实入口证据。
