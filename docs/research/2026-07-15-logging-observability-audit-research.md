# 日志机制与 AI 可观测性审计(2026-07-15)

> 目的:评估现有日志/trace 设计能否支撑「客户问题复现」与「产品功能优化」。
> 方法:两个只读盘点子代理并行扫全仓(AI 链路 trace / 业务日志与落盘),主 agent 合并 + 对照业界实现。
> 拍板:调研结论由用户审阅;修复方案落 T-337(SPEC 待写)。未改任何代码。

## 0. 一句话总评

**业务日志 = 及格线附近**(靠 Tauri 壳的 sidecar.log 落盘+脱敏+导出闭环救场,但轮转策略和前端盲区削弱它);**AI trace = 不合格**(只有「事故门牌号」——task id + 一句 error message,没有「黑匣子」——实际 prompt/响应/token/主路 or 兜底全部无痕)。对「客户报 AI 输出异常,事后复现」当前支撑很弱。

## 1. AI 链路 trace 现状(子代理 A 盘点,均有 file:line 实证)

### 1.1 调用层记录

| 路径 | 记了什么 | 缺什么 |
|---|---|---|
| `runStructuredNode`(26+ 结构化节点公共路径,ai-worker/src/nodes/structured-node.ts:90-146) | **什么都不记**(仅 90s 硬超时) | model id/耗时/token/prompt/响应全无;`generateObject→generateText` **fallback 完全静默**,事后不知走了主路还是文本兜底 |
| `chat-runner.ts:1669-1701` | `[chat-turn] outcome=<x> durationMs=<ms>`(outcome ∈ completed/error_recovered/fallback_used/retry_exhausted/aborted/error)+ retry/fallback console.warn;**token usage 真采集**(onFinish totalUsage → reportUsage → 落 `ai_messages` 的 input/output/cached_tokens + model_key) | console 行无 requestId/conversationId/model;原始 prompt/响应不存 |
| `runAgentNode`(agent-runtime.ts:65-77) | AgentStepEvent{stepNo, text, toolCalls(仅 name+input), finishReason} | 无 token、无 model、tool 只记入参不记结果 |
| Pi 引擎(pi-engine.ts) | turn_end 的 usage 只喂预算控制(chargeTokens),不落库;步事件=人话摘要进 `ai_task_steps`;终态 stopReason/toolLog/整会话聚合 token | **session 转录不落盘**(SessionManager.inMemory + dispose,思考过程/逐工具 I/O 内存即焚);无 per-step token |

- Vercel AI SDK `experimental_telemetry` 全仓 **0 处使用**;otel/langfuse/pino/winston/sentry 依赖 **0 命中**。

### 1.2 相关性 / trace id

- `RequestContext`(contract/src/request-context.ts:24-31)有 `requestId`,但**只服务 envelope meta**,persistence-transport.ts:15 甚至硬编码成常量 `"persistence"`;**没有任何日志行带 requestId**。
- 无贯穿「一次用户动作」的 traceId;chat 轮内多 tool 调用、task 内多次 LLM 调用均无 span 级定位;chat↔task 跨界无关联键(`ai_tasks.session_id` 是 Agent SDK resume 键,非 trace)。

### 1.3 持久化与失败可复现性

- 无 usage/trace/log 专表。token 仅存 `ai_messages` 列;**`ai_tasks` 无 token 列,`cost_usd` 恒 null**(ai.repository.ts:391 写死 null;pi-engine.ts:139 provider cost 故意置 0)。
- `ai_tasks` 有 `input_data`(完整入参 jsonb)+ `model_key` → 能复现「粗入参 + 用了哪个模型配置」;**装配后的实际 prompt(CreativeContext+facets)与模型原始响应不落盘** → 无法逐字复现。
- `error_message` = 裸 `err.message` 自由文本,**无系统化错误分类码**;唯一分类是 transcribe-runner.ts:34-69 的 5 类(靠字符串 match,且只进 step 文本非结构化列);scheduled-collection 另有 `NEEDS_RECONNECT_ERROR` 哨兵串。
- token 成本 UI 仅 copilot 会话角标(ai-copilot-content.tsx:1151);**无按 capability/模型/时间的任何聚合**。

### 1.4 AI 侧缺口排序(影响从高到低)

1. 结构化节点(26+)调用级零记录 + 静默 fallback。
2. 原始 prompt/响应全程不落盘(复现止步于粗入参)。
3. 无端到端 traceId(requestId 未真用)。
4. 错误无分类码,errorMessage 自由文本,无法按错因聚合。
5. Pi 会话转录不落盘。
6. 无 token/成本聚合,`cost_usd` 恒 null。
7. chat outcome 日志缺关联字段。

## 2. 业务日志现状(子代理 B 盘点)

### 2.1 基座

- **全仓无日志库、无自建 logger 封装**,裸 `console.*`:frontend/src 97 处、backend/src 107 处、ai-worker/src 2 处。
- 前缀风格 `[模块名]` 基本统一但纯靠人肉;**无级别分层**(console.debug 全仓 0)、**无 DEBUG 环境开关**(唯一环境门控:ai-error-humanize.ts:119 dev-only)。

### 2.2 落盘(本仓最扎实的部分,T-259)

- `frontend/src-tauri/src/logging.rs` + lib.rs:354-374,458-474:sidecar 进程 stdout/stderr tee 到 `<appDataDir>/logs/sidecar.log`,每行 `[RFC3339] [channel] <脱敏行>`,逐行 flush(崩溃也留尾行)。
- **脱敏两档**(logging.rs:105-290):tier1 高信号词(authorization/cookie/api_key/bearer…)一律 `***REDACTED***`;tier2 泛化词(token/secret/key)仅 ≥32 位 hex/base64 才遮。单测覆盖 JWT/cookie/中文行。
- **轮转 = 按会话仅留 2 份**(sidecar.log + sidecar.prev.log,logging.rs:61-88);单会话内无大小上限。
- 诊断导出闭环:设置页「导出诊断日志」→ `/api/v1/local/reveal-logs` → 打开日志文件夹(settings-interactive-region.tsx:1513-1554)。**无一键打包/无 app 版本/OS 等环境信息**。

### 2.3 盲区

- **webview 前端 console 完全不落盘**(frontend 97 处里 6 处在 "use client" 文件,打包态彻底丢失);**无 window.onerror/unhandledrejection 全局兜底**;只有 segment 级 `(creator)/error.tsx`(其 console.error 也在 webview 侧),**无 root global-error.tsx** → 白屏场景磁盘零痕迹。
- **发布链路多处静默吞错**:publishing.service.ts:281/500/511/521/564 的 catch 连 console 都不打。
- 定时任务:调度器 node-cron 缺失时仅一行 error 后静默不启动(scheduled-collection-scheduler.ts:285)。
- 密钥侧风险低:secret-crypto.ts 明确「密钥永不落日志」+ Rust 落盘脱敏双保险。

### 2.4 「昨天下午采集失败」能否事后定位?

- **最强的一环**:采集链路有 DB `job_run` 持久(status/error/finished_at,scheduled-collection-runner.ts:283-295)——日志轮转掉也能查到。
- **最致命时间窗**:按会话轮转只留 2 份 → 隔天反馈、期间重启 ≥2 次即丢;前端表现类问题(白屏)零痕迹;无法让用户「开 debug 复现」。

## 3. 业界优秀实现对照

| 业界实践 | 本产品现状 | 差距 |
|---|---|---|
| **OpenTelemetry GenAI 语义约定**(gen_ai.request.model / gen_ai.usage.input_tokens / gen_ai.response.finish_reason…)已成 LLM 观测字段事实标准 | 无任何标准字段 | 即使不上 OTel 全家桶,自建表/日志字段按它命名,未来可零成本导出 |
| **Langfuse/LangSmith 的 trace→span→generation 三层模型**:一次用户动作=trace,每次 LLM 调用=generation(存 prompt/响应/token/耗时/模型),工具调用=span | 只有 aiTaskId + 人话 steps | 本地自建等价物即可(见 §4),不必引云服务 |
| **Vercel AI SDK 原生 `experimental_telemetry`**:streamText/generateObject 一个开关产出 OTel span(含 prompt/completion/usage) | 已用 ai@7.0.4 却 0 处启用 | 接入成本全行业最低的一档,现成的黑匣子数据源 |
| **pino 式结构化日志**:JSON 行、level 分层、child logger 携带上下文(requestId/taskId)、env 开关 | 裸 console + 人肉前缀 | 一个 ~100 行的轻量封装即可达到 80% 收益(桌面单机不需要 pino 全功能) |
| **桌面端诊断包**(VS Code「报告问题」/Sentry offline):一键 zip(日志+版本+OS+近期错误摘要),按大小/天数轮转保留 | 打开文件夹让用户手动发文件;按会话留 2 份 | 轮转策略和打包体验都差一档 |
| **用户可切 debug 级别**(VS Code 设 log level、CLI 工具 --verbose) | 无级别无开关,出 bug 无法提高详细度复现 | 缺「事后调高再复现」的标准动作 |
| **本地优先产品的独特优势**:数据不出机器 → prompt/响应全文可放心落本地(云产品反而要顾虑 PII) | 未利用 | 全存+大小上限+导出时脱敏,黑匣子成本比云产品还低 |

## 4. 建议方案(T-337 SPEC 的骨架,均为方向、待 SPEC 细化)

1. **轻量 logger 封装**(TS,单文件):`log.<level>(namespace, msg, fields)` → 结构化单行 JSON 或 `[ts][level][ns][traceId]` 文本,stdout 输出天然进 sidecar.log;level 由设置页/env 开关(默认 info,可切 debug)。全仓 console.* 渐进替换,先咽喉(runner/route/service catch)。
2. **traceId 真贯穿**:RequestContext.requestId 真生成(uuid),chat 轮/任务派发/日志行/`job_run`/`ai_tasks` 全带;跨 chat→task 传递。字段名对齐 OTel。
3. **AI 黑匣子表**(如 `ai_call_log`):每次 LLM 调用一行——traceId/aiTaskId/capability/model_key/耗时/input+output+cached tokens/finish_reason/**主路 or fallback**/错误分类码/**装配后 prompt 与原始响应全文**(本地库,设总量上限+过期清理;导出诊断时可选剔除正文)。数据源优先 `experimental_telemetry` 或在 runStructuredNode/chat-runner 的统一收口处埋点。
4. **错误分类码枚举统一**(contract 层):transient/config/auth/captcha/parse/permanent…,`ai_tasks.error_message` 旁加 `error_code` 列——同时是 **T-329 重试层的分类地基**(两任务共享)。
5. **webview 错误落盘**:root `global-error.tsx` + window.onerror/unhandledrejection → POST `/api/v1/local/client-log` → 进 sidecar.log。
6. **轮转与诊断包**:sidecar.log 改按大小(如 10MB×5 份)或天数(保 7 天)轮转;「导出诊断」升级为一键 zip(日志+app 版本+OS+近 N 条失败 task/job_run 摘要,过脱敏)。
7. **成本可观测**:cost_usd 真算(model-config 里配单价或内置价目)、按 capability/模型/日聚合,设置页给「AI 用量」面板——同时反哺产品优化(哪些节点贵、哪些常失败)。
8. **Pi 会话转录落盘**:session 消息流序列化到 appDataDir(与 aiTaskId 关联,同受总量上限约束),agentic 异常不再内存即焚。
9. **发布链路静默 catch 补日志**(publishing.service.ts 五处)——可并进 T-328/小修直接做。

## 5. 与既有任务的关系

- **T-334(任务可靠性层)**:错误分类码(§4.4)是共享地基,重试策略按分类码决策——两个 SPEC 要一起设计分类枚举。
- **T-335(skill 资产化)**:黑匣子的 prompt/响应记录顺带支撑「skill 版本 A/B 数据裁判」(科学家角色)。
- **T-328**:发布收口优先;§4.9(publishing 静默 catch)是唯一建议提前小修的点。

> 注:本轮曾因并行会话撞号,原 T-329/330/331 已改号 T-334/335/336;本报告对应任务为 **T-337**。
