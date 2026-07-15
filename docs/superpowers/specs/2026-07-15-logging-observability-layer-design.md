# SPEC:日志与 AI 可观测性层(T-337)

- 日期:2026-07-15
- 状态:草案(待 spec-review gate;加数据面/动运行时咽喉,稳妥过审后开工)
- 依据:[审计报告](../../research/2026-07-15-logging-observability-audit-research.md)(两子代理全仓实证,file:line 齐)
- 关联:T-334(可靠性层,共享错误分类枚举)· T-335(skill 资产化,黑匣子供 A/B 裁判数据)· T-328(publishing 静默 catch 提前小修)· T-259(sidecar.log 既有落盘,本 SPEC 的地基不重造)

## 0. 一句话

给产品装上「黑匣子 + 病历本」:每次 AI 调用可事后逐字复现(本地存全文,数据不出机器),每条业务失败可按 traceId 串链定位,用户一键导出诊断包——支撑客户问题复现与产品数据化优化。

## 1. 背景(审计结论,不复述,只列本 SPEC 要治的病)

1. `runStructuredNode`(26+ 节点公共路径)调用级零记录,`generateObject→generateText` 降级静默(structured-node.ts:90-146)。
2. 无贯穿 traceId:`RequestContext.requestId` 未真用,persistence-transport.ts:15 硬编码常量。
3. prompt/响应正文全程不落盘;`ai_tasks.error_message` 裸文本无分类码;`cost_usd` 恒 null。
4. 全仓裸 `console.*`(206 处),无级别、无 debug 开关;webview 侧 console 与错误零落盘(无 global-error.tsx / window.onerror)。
5. sidecar.log 按会话仅留 2 份(隔天反馈即丢);诊断导出无打包无环境信息。
6. Pi 会话转录内存即焚;publishing.service.ts 五处 catch 静默吞错。

## 2. 设计原则

- **本地优先是优势**:prompt/响应全文放心落本地库,设容量上限;导出诊断时默认剔除正文(用户可选包含)。绝不上云、不引远端遥测。
- **字段语义对齐 OTel GenAI 约定,但不引 OTel 依赖**(`gen_ai.request.model`→`model_key` 等命名可映射)。明确否决 `experimental_telemetry` 路线:它要求 tracer/exporter 全家桶,桌面单机不值;三个收口手动埋点等价且零依赖。
- **观测永不伤主链路**:埋点/写日志一律 best-effort(try/catch 吞 + 降级 console),失败不阻塞、不拖慢 AI 调用(写库异步 fire-and-forget)。
- **诚实**:记录真实发生的事(主路/兜底、重试次数、真实错误),不美化;脱敏复用 T-259 两档规则,TS 侧写盘前同样过一遍。

## 3. 组件设计

### 3.1 轻量 logger(零依赖,contract 内)

- `contract/src/observability/logger.ts`:`log.debug|info|warn|error(namespace, msg, fields?)`,输出单行 `[ISO8601][LEVEL][ns][traceId?] msg {fields JSON}` 到 stdout/stderr → 天然进 sidecar.log(复用 T-259 管道与脱敏,不新造落盘)。
- 级别开关:进程级 `setLogLevel()`;来源=系统设置表新键 `log_level`(默认 info),设置页「诊断日志」卡加下拉(debug/info/warn/error),改后热生效——用户可被引导「切 debug 复现一次」。
- 三包共用(contract 零依赖被 frontend/backend/ai-worker 都引)。**不强求一次替换全部 206 处 console**;本任务只换咽喉:所有 runner 的 catch、API route 的 catch、service 层 catch、scheduler。其余渐进。

### 3.2 traceId 贯穿

- `RequestContext.requestId` 真生成(`crypto.randomUUID()`),在三个入口铸造:chat route、任务派发(dispatch)、定时 tick。传播规则:chat 轮内派生 task 时继承(前缀链 `<chatReqId>` 直传);同一 ai_task 内所有 LLM 调用/日志行共用。
- 落列:`ai_tasks.trace_id`、`job_run.trace_id`(新列,nullable,旧行不补);logger 的 traceId 经 AsyncLocalStorage 或显式传参(实现选型留给切片,倾向显式传参——与现有 ctx 传递风格一致,不引全局魔法)。
- 修 bug:persistence-transport.ts 硬编码 `"persistence"` 改为透传真 requestId。

### 3.3 AI 黑匣子表 `ai_call_log`(核心)

每次 LLM 调用一行。schema(backend/src/schema/observability.ts + drizzle 迁移):

| 列 | 说明 |
|---|---|
| id, created_at | uuid / 时间 |
| trace_id, ai_task_id?, conversation_id?, message_id? | 关联键(chat 或 task 至少一个) |
| capability, model_key, provider | 哪个能力、解析后的模型配置 |
| duration_ms, input_tokens, output_tokens, cached_tokens | 性能与用量 |
| finish_reason, route | route ∈ `primary\|fallback_model\|text_fallback\|retry:<n>`(治「降级静默」) |
| error_code?, error_message? | 分类码(§3.4)+ 人话 |
| prompt_text, response_text | **装配后完整 prompt(system+template 渲染结果)与模型原始输出**;单列各截断上限 256KB |

- **三个收口埋点**(全部经依赖倒置写端口 `AiCallLogWritePort`,ai-worker 不直连 db,照 `SkillConfigOverrideReadPort` 范式):
  1. `runStructuredNode`(structured-node.ts)——覆盖 26+ 节点,含 text-fallback 分支各记一行;
  2. `chat-runner` onFinish/重试恢复层——含 retry/fallback 事件;
  3. `pi-engine` turn_end——每 turn 一行(prompt_text 置 null,转录走 §3.8)。
- **容量治理**:总行数上限(默认 20_000)+ 正文总字节上限(默认 512MB),超限按最旧删除;每日启动时清理。设置页显示当前占用 + 「清空黑匣子」按钮。
- **消费面(本期最小)**:任务详情/失败卡加「查看调用记录」(按 ai_task_id 查,显示 route/token/耗时/错误码,展开看 prompt/响应全文)。聚合面板见 §3.7。

### 3.4 错误分类码(contract 枚举,与 T-334 共享地基)

- `contract/src/observability/error-codes.ts`:`transient_network | provider_5xx | provider_auth | rate_limited | config_missing | config_invalid | captcha | login_expired | parse_failed | timeout | aborted | permanent` (+ `other` 兜底)。
- 分类器:一个纯函数 `classifyError(err): ErrorCode`,吸收现有散装先例(transcribe-runner 5 类字符串匹配、scheduled-collection 的 `NEEDS_RECONNECT_ERROR` 哨兵、chat-runner 恢复层的 retry 分类),**单一实现,三处换用**。
- 落列:`ai_tasks.error_code`(新列)+ `ai_call_log.error_code`。T-334 的重试决策直接消费此枚举(transient/rate_limited/5xx → 重试;config/auth → 引导设置;permanent → 诚实失败)——**两个 SPEC 以本节为契约,T-334 不再自定义分类**。

### 3.5 webview 错误落盘

- 新增 root `frontend/src/app/global-error.tsx`(现仅 segment 级 error.tsx,根崩溃无兜底)。
- 客户端全局钩子(root layout 内小组件):`window.onerror` + `unhandledrejection` + 两个 error boundary 的 onError → `POST /api/v1/local/client-log`(节流:同 message 60s 去重;体积上限)→ 服务端经 logger 打出 → 进 sidecar.log。
- route 仅本机回环可用(对齐 T-328 W3 的 loopback 门),防外部注入日志。

### 3.6 轮转与一键诊断包

- 轮转改造(logging.rs):会话制 → **大小+份数制**:单文件 10MB 滚动,保留 5 份 + 现役(≈60MB 上限,覆盖数天),启动不再无条件覆盖 prev。
- 「导出诊断包」升级:tauri command 生成 zip 到用户选择路径,内容=日志全份 + `diagnostics.json`(app 版本/OS/架构/模型配置摘要**不含密钥**/最近 50 条失败 ai_tasks+job_run 摘要:id/type/error_code/时间)。默认不含 prompt/响应正文,勾选后附带(明示提醒含创作内容)。zip 实现用 Rust `zip` crate(sidecar 侧 Node 不引打包依赖)。

### 3.7 成本可观测与「AI 用量」面板

- 价目:`model-provider-presets.ts`(T-325 已建)每预设附 `pricing?`(input/output 每百万 token 单价,内置常见模型价,自定义 provider 用户可填、不填则只显 token 不显钱)。
- `cost_usd` 真算:在 §3.3 收口处按价目计算落 `ai_call_log.cost_usd`(ai_tasks 聚合列不再单独维护,按需 sum)。
- 设置页新「AI 用量」卡:按日/按 capability/按模型三个维度聚合(调用数/token/成本/失败率——失败率来自 error_code 非空占比)。**产品优化价值**:哪些节点贵、哪些能力常失败,一屏可见。

### 3.8 Pi 会话转录落盘

- pi-engine 的 `SessionManager.inMemory()` → 文件 SessionManager,目录 `appDataDir/pi-sessions/<aiTaskId>/`(JSONL,pi-coding-agent 原生格式);受 §3.3 同一容量治理(总量上限,最旧先删)。与 T-316(会话续)共用目录约定,不冲突:T-316 管「续」,本节管「留证」。

### 3.9 publishing 静默 catch 补日志(提前小修)

- publishing.service.ts:281/500/511/521/564 五处 catch 至少 `log.warn("publishing", ...)` 带上下文 id。**建议并进 T-328 当前波顺手改**,不等本 SPEC 过审(纯加日志无行为变化,零风险)。

## 4. 边界(防走样)

- 不引 OTel/pino/sentry 等任何观测依赖;不做远端上报/APM;不做实时监控告警(单机产品没有值班场景)。
- 不在本期替换全部 console(只换咽喉,余下渐进,防大面积 churn 撞 T-328)。
- 黑匣子只记 LLM 调用与 AI 任务;业务 CRUD 不进(那是 job_run/领域表的事)。
- 观测代码永不 throw 到主链路;性能预算:单次埋点开销 < 5ms(异步写)。

## 5. 切片(拆 Task,已按铁律落 BACKLOG)

| 片 | 内容 | 依赖 |
|---|---|---|
| T-337a | contract logger + 错误分类枚举 + classifyError 收编三处散装分类 + 设置页 log_level 开关 + 咽喉 console 替换 | 无 |
| T-337b | traceId 铸造/传播/落列(ai_tasks.trace_id、job_run.trace_id)+ 修 persistence-transport 硬编码 | a |
| T-337c | `ai_call_log` 表 + 三收口埋点(写端口范式)+ 容量治理 + 任务详情「查看调用记录」 | a,b |
| T-337d | webview 错误落盘(global-error.tsx + onerror + client-log route,loopback 门) | a |
| T-337e | logging.rs 轮转改大小制 + 一键诊断包(Rust zip + diagnostics.json) | 无(Rust 侧独立) |
| T-337f | 价目 + cost_usd 真算 + 「AI 用量」聚合面板 | c |
| T-337g | Pi 会话转录落盘(文件 SessionManager + 容量治理) | 无(与 T-316 协同) |
| (并 T-328) | §3.9 publishing 五处 catch 补日志 | 立即可做 |

## 6. 验收

- **黑匣子端到端**:跑一次真实 `topic.generate` 任务(真 app dispatch 路径,承 [[verify-through-real-call-path]]),`ai_call_log` 出现该行且 prompt_text 与模板渲染一致、token>0、route=primary;人为断网重跑,error_code=transient_network 且 route 记录重试。
- **trace 串链**:一次 chat 轮触发的派生任务,凭同一 trace_id 在 sidecar.log(logger 行)+ ai_tasks + ai_call_log 三处 grep 得到完整链。
- **复现演练(总验收)**:模拟「客户昨天采集失败」:重启 app 3 次后,凭轮转日志 + job_run + ai_call_log 仍能定位失败原因与当时输入;导出诊断包解压即含 diagnostics.json 与全份日志。
- **webview**:root 层抛错 → sidecar.log 出现 client-log 行;白屏场景磁盘有痕。
- **不伤主链路**:黑匣子写端口注入一个必抛错的 fake,AI 调用照常成功(仅 warn)。
- 各包 tsc + 既有测试全绿;新增逻辑带单测(分类器/容量清理/脱敏拼接/轮转)。

## 7. 风险与未决

- prompt 全文含用户创作内容:本地存储无隐私外泄面,但诊断包默认剔除正文已是硬规则;残余风险=用户自己把包发给不可信第三方,导出弹窗明示。
- PGlite 单库写入量增大:埋点异步 + 容量上限治理;若实测拖慢,黑匣子可降级独立 sqlite 文件(未决,先不做)。
- AsyncLocalStorage vs 显式传参:倾向显式(与 ctx 风格一致),切片 b 实现时定,若侵入面过大再换 ALS。
- 与 T-328 并行波的文件冲突:a/c 片碰 runner/chat-runner 咽喉,**排在 T-328 收口后开工**(§3.9 除外)。
