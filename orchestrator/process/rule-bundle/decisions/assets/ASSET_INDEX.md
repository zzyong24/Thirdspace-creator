# Asset Index (L0 · grep 友好)

> `decisions/PATTERNS.md` 的孪生表。agent 命中 problem_tag / keywords → 读对应 ENTRY / 卡。详细治理见 [README.md](./README.md)。

| id | kind | problem_tag | when(触发短语) | status | verified | winner |
|---|---|---|---|---|---|---|
| [MOD-001](./modules/MOD-001-s3-encrypted-upload/ENTRY.md) | module | object-storage, crypto | 上传文件经 presigned URL 落 S3 兼容存储 | active | true | true |
| [MOD-002](./modules/MOD-002-configurable-llm-adapter/ENTRY.md) | module | llm, provider-abstraction | 多家 LLM 供应商走同一可配置适配层 | active | true | true |
| [MOD-003](./modules/MOD-003-circuit-breaker-3state/ENTRY.md) | module | resilience, failover, state-machine | 调用 3+ 可互换上游、一家故障不级联(连续失败/错误率熔断 + 半开限流探测) | active | true | true |
| [MOD-004](./modules/MOD-004-sse-tool-call-accumulator/ENTRY.md) | module | streaming, llm-integration | 解析 OpenAI 协议 SSE 流、重组碎片化 tool_calls(content/reasoning 分离) | active | true | true |
| [MOD-005](./modules/MOD-005-structured-output-retry-loop/ENTRY.md) | module | structured-output, retry, validation | 结构化输出校验失败后带反馈重试(LLM JSON / codegen / 表单抽取) | active | true | true |
| [MOD-006](./modules/MOD-006-file-persisted-task-queue/ENTRY.md) | module | background-jobs, job-orchestration, task-queue | 文件持久化的 fire-and-forget 后台任务队列、重启后扫 running→error 补偿 | active | true | true |
| [MOD-007](./modules/MOD-007-structure-aware-chunker/ENTRY.md) | module | chunking, rag, text-processing | 文档按结构切块送 RAG/embedding(滑窗 + overlap,token 计数可注入) | active | true | true |
| [PAT-002](../patterns/PAT-002-inmemory-vs-real-db.md) | pattern | persistence, testing | 该用真 DB 还是内存桩(含 CreatorOS P1 应用) | active | true | — |

## scope → 该查哪些资产

- 接 object-storage / 加密上传 / presigned → **MOD-001**
- 接 LLM / 换供应商 / 可配置 provider → **MOD-002**
- 代理/调用多上游、要熔断防级联 / 半开探测恢复 → **MOD-003**
- 解析 SSE 流式响应 / 重组流式 tool_calls → **MOD-004**
- LLM/结构化输出校验失败要带反馈重试 → **MOD-005**
- 后台异步任务 / 进度持久化 / 重启补偿 → **MOD-006**
- 文档分块送 RAG / embedding(滑窗+overlap)→ **MOD-007**
- 选持久化(真库 vs 内存桩)/ 测试与运行时共用 migrator → **PAT-002**

> **tier 说明(质量分级,诚实标注)**:**MOD-001/002 = A 源 `verified`**(自有交付实战背书)。**MOD-003–007 = C 源 `distilled-verified`**(从 OSS 蒸馏重写、example 跑绿 + license 清白 + 非高危,但**尚未在真实交付里复用过**)。借用 MOD-003–007 时按 ENTRY 的 SEAM/when_not_to_use 自行接线验证;一旦真实项目复用并验证,可升级为 A 源 `verified`。
