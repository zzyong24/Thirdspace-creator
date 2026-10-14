# T-1255 异常采集与运行指标观测方案候选

2026-10-12 用户认可Growth端集中查看/解密日志，进一步要求异常即采集、定期上报日志，以及类似Prometheus的成功率与异常次数；接入必须轻量、可以调控，允许调研开源项目。随后用户明确软件为离线软件，上报对用户无感、不影响使用，只在软件开启时一天一次；此修订替代此前60秒/5分钟发送建议。

本文件是此次技术方案与公开来源调研，不替代原日志直传SPEC，不声称旧PASS覆盖新指标和配置范围。当前阶段为CONTRACT增量候选；本轮先调研与说明，不修改生产代码、Activity或真实用户数据。确认技术方向后再将精确字段/指标口径/配置与验收回写原SPEC并独立复核。

## 推荐结构

客户端采用一个轻量Observability模块、三类入口探针、两类持久发送数据。异常立即冻结现场，日志和指标默认每24小时最多一个共同上报轮次，仅软件开启且空闲时发送，全部通过HTTPS直达Growth，不依赖Activity。客户端无常驻Prometheus/Collector/Vector服务。Growth保存密文、按需解密；汇总指标用于自身看板，并提供受保护的OpenMetrics/Prometheus指标出口。本地异常采集与统计持续进行，网络发送统一遵守每天一次；不把本地采集周期当网络发送周期。

```mermaid
flowchart LR
 A[页面 / 后端 / Worker / Rust宿主入口] --> B[轻量观测端口]
 B --> C[异常立即冻结现场并加密]
 B --> D[真实操作计数与耗时分布]
 C --> E[本机持久待发队列]
 D --> E
 E -->|软件运行且空闲时每天一轮| F[Growth接收去重]
 F --> G[异常列表与按需解密]
 F --> H[分钟统计 / 成功率 / 异常趋势]
 H --> I[受保护metrics出口]
 I --> J[服务器Prometheus或Grafana]
 K[Growth版本化观测策略] -->|每日同轮次一次配置读取| B
```

## 异常即时采集

异常来源为真实错误边界和正式执行回执，不扫日志关键词判断业务是否失败。

- React error boundary、window.error、unhandledrejection捕获前端异常，路由/请求名称用固定标识；不拦截页面输入。
- Node请求/命令统一入口和Worker IPC入口记录真实error对象及稳定错误码；uncaughtExceptionMonitor仅做崩溃前有界落盘，不改变原退出行为。Rust宿主记录panic、启动失败、子进程异常退出，正常取消/退出不标崩溃。
- 启动保留有界breadcrumb ring buffer，建议100条/最多1MiB，存脱敏事件而不是任意应用对象；异常时立即冻结异常前30秒的可用上下文，附错误堆栈、版本、系统、operationId/requestId/taskId/attemptId。异常后追加最多10秒上下文为可选，先封存异常前现场；进程已崩溃时不等后窗口或网络。
- 封存仍用现有CRLOG加密格式和公钥；完整受管日志按原合同定期上传，同时加异常索引以定位到session/时间/帧，不把自定义片段冒充从中间可独立解密的CRLOG文件。阶段性快照始终保留原HEADER和完整前缀帧；若另产异常小包，必须用同公钥新加密为独立完整CRLOG容器，不能直接拼非零counter密文帧。
- 浏览器现场经既有可信本机入口交宿主加密，网页不持私钥；旧sidecar stdout/stderr tee继续作为兜底。signal入口失效时由Rust宿主保存崩溃现场，下次可启动时发送，不承诺断电/硬杀后仍能采到未落盘字节。
- 同一异常60秒内保留第一份代表现场并聚合重复次数；新的业务事件编号依然进入完整计数。故障日志采样/去重不改变指标分母。SEMANTIC_BOUNDARY_ALLOW: eventId/时间窗/稳定代码+首个源栈帧指纹仅用于机械去重与定位，不做内容语义或创作选择。

## 指标口径

1. creatoros_operations_total：业务任务在正式持久回执确认后的结局，result为success/failed/partial；cancelled单列，running/waiting/unknown不混入分母。严格成功率=success/(success+failed+partial)，同时显示partial比例、取消数和未决数。分母0显示无样本，不显示100%。
2. creatoros_attempts_total：每次实际执行尝试的成功/失败/取消计数。一次任务失败两次后成功，业务成功记1，attempt记失败2/成功1，二者分开呈现。
3. creatoros_exceptions_total：真实异常事件数量；同异常被UI、IPC、宿主多层观察时用共同eventId关联，不能三次计数。不能确定同一异常时分别标观察来源，不声称已精确去重。
4. creatoros_operation_duration_seconds：耗时Histogram；排队时间与实际执行时间分开，P50/P95由全体桶汇总计算，不平均各客户端P95。建议共同固定桶0.1/0.5/1/2/5/10/30/60/120/300/600/1800秒，超过上限进+Inf。
5. 观测自身状态：queue_bytes、pending_batches、dropped_events_total、last_received_timestamp_seconds和config_revision；客户端离线显示最近未收到，不能当业务失败。

维度限稳定module/operation/result/errorCode/appVersion/osName，provider或platform只有各自操作需要时纳入。用户ID、安装别名、taskId、requestId、路径与错误全文只在受控事件详情/信封，不进Prometheus label。指标名遵循_total、_seconds、_bytes，范围枚举/属性组合数量受配置与schema限制。

API返回2xx不等于异步任务成功；业务结局读取当前持久execution/任务账本的真实终态。探针提供即时观测，后台按游标补读既有正式账本，弥补回调丢失；不能为了观测给业务事务增加失败点。旧execution.service与新持久执行同时存在，需逐消费者定位真实唯一owner，不按文件名猜哪个代表全部任务。

## 上报与去重

每个指标窗口封存不可变delta batch：schemaVersion、batchId、installationAlias、bootId、sequence、windowStart/windowEnd、configRevision、完整count/bucket。入持久outbox后发送；Growth以installationAlias+batchId和body digest在同一事务去重与落分钟聚合，重复只回相同回执、不同body同batchId拒绝。回执前不清本机记录。网络重试复用batchId，不重计。

SDK负责Counter/Histogram/API语义，不把SDK内存导出器当持久队列。准确性依赖正式账本游标与持久batch；崩溃前未封存的短期系统观测可能丢，需显示丢失/恢复范围，不能承诺绝对零丢失。日志沿原hash/前缀幂等合同；上传并发默认1，日志与指标按有界配额公平发送，不能互相饿死；网络错误终止本轮并等下一日发送机会，原batchId不变，不进行高频重试。

Growth看板定位为每日健康与历史诊断，显示各安装最近收到时间/数据覆盖/上报延迟，不标为实时监控。客户端可在本机按分钟聚合，但只随每日批次发送；后台缺失当天批次不直接宣称软件异常。Growth看板按事件发生窗口计算历史指标；额外保存receivedAt和上报延迟。断网后补发标迟到，不拿接收时刻当原故障发生时刻；Prometheus出口清楚定义为已接收累计计数，实际客户端历史5分钟趋势由Growth窗口表查询。未授权/离线/被采样安装的统计不能冒充所有用户全量。

数据类别为独立可控：加密日志、结构化指标。指标无stack/正文等字段，但仍新增上传用途；授权合同版本按确切范围升级，旧日志/旧本机共享授权不能自动扩大。

## 轻注入与控制

核心业务依赖窄端口recordOutcome/recordException/recordDuration，关闭时no-op。SDK/聚合/持久发送放backend观测模块，进程入口装配一次；Worker经受限IPC交宿主，不直写库/直上Growth；Rust宿主持有日志/公钥/独立崩溃记录。优先接统一dispatch、正式execution回执、React边界、Worker入口和Rust进程生命周期。零散自行捕获的业务错误少量补recordException，不能宣称纯HTTP自动插桩能覆盖业务成功率。

建议默认配置（是候选取值，不是已实测性能承诺）：

|配置|默认建议|调整方式|
|---|---|---|
|日志/指标上传开关|分别遵守用户有效授权|本机可关闭；云端不能越过本机授权开启|
|日志/指标发送周期|每24小时最多一轮，软件运行且空闲时执行|后台可停用或延长，不能远程提高到一天多轮|
|严重异常发送|同样等每日轮次|异常当场采集封存，不触发额外立即上传|
|breadcrumb条数/容量|100条/1MiB|有限schema配置，不读任意对象|
|异常前窗口/后窗口|30秒/可选10秒|异常前先落盘，崩溃不等后窗口|
|重复现场压缩窗口|60秒|只减少重复附件，次数仍100%记录|
|错误现场采样|首次严重异常100%|普通重复现场可调；业务结果指标不采样|
|临时debug|默认关|指定版本/模块临时开启，建议15分钟自动恢复|
|发送并发/限速/额度|1 / 128KiB每秒 / 单轮10MiB|候选资源上限；超额留待后续日轮次，运行前需实测|
|云端日志保留|30天|与已告知范围一致；扩展用途另升版本|

Growth控制页支持总停发、按版本/OS/模块范围下发、限量/采样/延长周期、临时debug与生效版本/到期/最近应用时间；周期不能突破用户每天最多一轮的上限。灰度按安装随机别名哈希分桶，不做业务语义判断。配置由Growth独立签名或可信HTTPS版本化返回，客户端只应用白名单有界字段，缓存最后有效配置、明确过期保守回退；不给远端任意代码/路径/目的地址能力。活动进程先安全热更新，无需整个软件重启；本机关闭立即生效，后台配置在每日原轮次起点由一次有界GET取得，并缓存最后有效配置；此请求同样受24小时下限，本机关闭时不发生。远端暂停只停数据，恢复仍可由下一日同轮次GET获得；没有独立分钟级轮询、WebSocket常连或软件关闭后的后台进程。后台显示最近配置应用时间，客户端再次联网收件前不能承诺后台指令实时生效。远端配置不能提高原业务执行期限或改任务状态。

## Growth端用户操作

- 运行概览：按版本/系统/模块看严格成功率、部分完成、失败数、P95、上报覆盖与延迟。
- 异常列表：错误码/版本/首次与最近发生/发生次数/影响安装数量；点入同event关联上下文，再按需解密现有日志；明文不另落副本。
- 观测策略：开关、周期、采样、日志等级、临时debug、灰度、配置版本与生效回执。
- 告警：失败率/异常突增/P95/队列积压，阈值+最小样本数+连续窗口+冷却+恢复。建议初始只生成Growth站内告警，不擅自给他人发送外部消息。

## 开源调研与取舍（2026-10-12）

|项目|官方依据|复用方向|本方案取舍|
|---|---|---|---|
|OpenTelemetry JS|[源码/API与metrics SDK](https://github.com/open-telemetry/opentelemetry-js)、[SDK配置](https://opentelemetry.io/docs/specs/otel/configuration/sdk-environment-variables/)、[指标SDK](https://opentelemetry.io/docs/specs/otel/metrics/sdk/)|Counter/Histogram/no-op/API与SDK分离、周期导出、有限属性Views|推荐API+metrics SDK，自有持久exporter直送Growth；不安装客户端Collector，也不启用全部自动插桩|
|Prometheus|[Pushgateway适用边界](https://prometheus.io/docs/practices/pushing/)、[命名与label](https://prometheus.io/docs/practices/naming/)|Counter/Histogram/低基数维度、服务器metrics出口|推荐服务器抓Growth汇总；桌面不暴露抓取端口；不采用每安装Pushgateway series|
|Sentry JavaScript SDK|[MIT许可证](https://github.com/getsentry/sentry-javascript/blob/develop/LICENSE)、[breadcrumbs](https://docs.sentry.io/platforms/javascript/guides/svelte/enriching-events/breadcrumbs/)|错误边界+异常前事件上下文、事件关联与去重方式|调研其SDK机制；现有CRLOG加密直传不能被默认Sentry明文transport替代，默认不接Sentry云或整套自托管服务|
|Vector|[持久buffer模型](https://vector.dev/docs/architecture/buffering-model/)|有界队列、ACK、满载取舍与自监控|参考可靠发送模型；其disk buffer有最低约256MiB等约束，不把Vector进程分发到每个桌面客户端|
|OTel Collector|[持久发送队列/WAL](https://opentelemetry.io/docs/collector/resiliency/)|服务器扩展/转发与持久队列|本轮保自有Growth入口；未来确需多后端转发时仅服务器引入，不作为客户端运行前置|

上述是基于官方资料的适配判断，未做本项目依赖安装、性能基准或真实上报验收。Node崩溃监听选型依据[官方uncaughtExceptionMonitor](https://nodejs.org/api/process.html#event-uncaughtexceptionmonitor)，落地需核实际随包Node25消费者，保原崩溃/取消语义。

## 验收边界

以真实任务成功/失败/partial/取消/重试和未知账本为刺激；同一个任务失败两次后成功须同时得到业务成功1、attempt失败2/成功1。同批重发100次统计仍只加一次；日志附件压缩100次不能把异常计数降成1。离线/重启/配置切换/异常风暴/文件满/Growth503/崩溃均不阻断原业务，丢弃数量与水位真实可见。用当前正式公钥加密虚构异常在部署Growth解密、看板指标逐条对应真实账本；测开启/关闭对比的CPU/内存/耗时，而非先承诺零开销。每日调度另验连续运行跨24小时、多次启动/多窗口/崩溃重启不重发、离线留待发、失败不高频重试、重负载推迟、退出不等待、远端不能提频；有界资源开关前后实际CPU/内存/网络/操作延迟对比。契约字段、默认值与精确接入文件待定稿/独评，此文不签新增实现准入。

## 用户确认的每日排期规则

每个安装滚动24小时最多领取一个上报轮次，lastAttemptAt及租约持久存储，重启不重置。软件未运行时不发送；软件运行且到期后等待空闲再发送。异常立即在本机留证，严重异常也不插队额外联网。生成/渲染/导出/发布期间推迟或暂停后续发送；退出abort在途，不等待上报完成。离线与失败保留待发批次，后续每日轮次补发，不循环重试。每天一轮可包含多份小批次，不以一次HTTP请求冒充全部数据已收到；单轮资源预算和每份回执分别有界，超额留后续日轮次。统计计数可以按原事件窗口保存在本地，daily上传延迟与回执逐项记录；崩溃/时间回拨只使发送推迟，不能绕过24小时限额。

## 2026-10-12实施确认

用户确认按每日空闲上报执行，明确Growth管理端仅Admin手机号17362936917可看，允许选开源查看器自行使用。服务端以已认证官方会话+现有Admin角色+真实phone hash校验，不能依前端手机号或仅admin_security角色；统一限制日志/下载/解密/异常/指标/配置端点。此来源说明已并入原SPEC合同，实际代码/发布待验。
