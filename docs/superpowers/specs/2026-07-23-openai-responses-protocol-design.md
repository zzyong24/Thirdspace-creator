# OpenAI Responses 协议支持 SPEC

> 原任务：T-471
> 补正任务：T-483
> 状态：代码已先于 SPEC 落地；本文件是 2026-07-23 的追溯性重建，不冒充前置设计
> 用户确认：CreatorOS 需要正式支持 Responses，并以本地 Thirdspace-api（New API fork）
> 的兼容能力为目标
> 上游：FR-064 模型配置、PAGE-017 设置页、
> `2026-06-23-configurable-llm-design.md`、`2026-07-14-pi-runtime-full-integration-design.md`

## 1. 问题

CreatorOS 原有 `apiFormat` 只有 `anthropic | openai_chat`。这导致用户把 New API 或
OpenAI 官方 Responses 模型接入 CreatorOS 时，没有办法明确声明 `/v1/responses`
协议；设置保存、连接测试、Vercel AI SDK、Pi Agent 和桌面 sidecar 也可能各走不同
协议，出现“配置看起来成功，实际运行却偷偷走 Chat Completions”的假成功。

## 2. 用户价值

- 用户可以在设置中明确选择 OpenAI Responses。
- 同一条模型配置从保存、测试到 Agent 执行始终使用同一协议。
- New API 中只支持 Responses 的模型可以被 CreatorOS 正常使用。
- Chat Completions 用户不会因 SDK 默认值变化被静默迁移到 Responses。

## 3. 范围

### FR-069：显式 Responses 协议

`apiFormat` 增加 `openai_responses`，适用于文本模型配置。该值必须贯穿：

- contract 请求/响应；
- backend 持久化、导入导出与模型解析；
- 设置页展示和保存；
- “测试连接”的真实 `/responses` 探测；
- Vercel AI SDK 模型工厂；
- Pi Agent 原生协议映射；
- 桌面 sidecar 打包完整性检查。

### 不在范围

- 不增加数据库列；现有 `api_format` 文本列可承载新值。
- 不把 embedding 改为 Responses；embedding 继续使用 `/embeddings`。
- 不增加厂商专属 New API 分支；协议由 `apiFormat` 决定，`provider` 保持自由文本。
- 不在 Chat 失败后自动回退 Responses，也不在 Responses 失败后自动回退 Chat。
- 不支持 `/responses/compact`；本任务只覆盖标准 `/responses`。

## 4. 用户流程（FLOW-023）

```text
进入设置 PAGE-017
  → 选择或新增模型配置
  → 协议选择 OpenAI Responses
  → 填 provider / modelName / baseUrl / key
  → 保存（API-008）
  → 读回仍是 openai_responses
  → 点击测试连接（API-009）
  → POST <baseUrl>/responses
  → Agent 执行时仍走 Responses
```

任何环节不支持该协议都必须明确失败，不能降级成另一协议后返回成功。

## 5. 契约

### API-008：保存模型配置

- 现有操作：`settings.models.put`
- 请求新增合法值：`apiFormat = "openai_responses"`
- 响应：`modelConfigurationResource.apiFormat` 原样返回该值
- 权限：沿用设置模块当前用户所有权
- 幂等：同一 `(userId, capability)` 为 upsert
- 错误：未知 `apiFormat` 由 Zod 拒绝

### API-009：测试模型连接

- 现有操作：`settings.models.test`
- 当解析后的格式为 `openai_responses`：
  - URL：`<trimmed baseUrl>/responses`
  - 方法：`POST`
  - Header：`Authorization: Bearer <token>`
  - Body：`{ "model": "<model>", "input": "ping", "max_output_tokens": 1 }`
- 非 2xx：返回真实失败摘要
- 不允许 fallback 到 `/chat/completions`

### 运行时映射

| `apiFormat` | Vercel AI SDK | Pi Agent |
|---|---|---|
| `anthropic` | Anthropic Messages | `anthropic-messages` |
| `openai_chat` | 显式 `.chat(model)` / compatible `chatModel` | `openai-completions` |
| `openai_responses` | 显式 `.responses(model)` | `openai-responses` |

## 6. 数据链路可行性

| FR | 数据来源 | 存储 | 读回与消费 | 判定与证据 |
|---|---|---|---|---|
| FR-069 | 用户在 PAGE-017 选择协议；OpenAI/New API 公开协议 | `model_configurations.api_format` | `settings.models.list` → resolver → AI SDK/Pi | feasible：仓内列为 text；Thirdspace-api 有 `/v1/responses` 路由与 `RelayFormatOpenAIResponses` |

冷启动不依赖外部发现：协议是用户显式选择，不自动探测或猜测。第三方端点是否真正支持
Responses，由连接测试和实际调用返回决定。

## 7. 现成方案与 OSS 调研

| 候选 | 结论 | 理由 |
|---|---|---|
| `@ai-sdk/openai` 原生 `.responses(model)` | 采用 | 官方 SDK 已提供 Responses 模型，不自研请求循环 |
| `@ai-sdk/openai-compatible` Chat 模型 | 仅用于 `openai_chat` | compatible provider 的 Chat 路径成熟，但不能冒充 Responses |
| `@earendil-works/pi-ai` `openai-responses` | 采用 | Pi 已带原生 Responses lazy 模块和工具循环 |
| 把 Responses 转成 Chat 再执行 | 否决 | 掩盖模型能力差异，无法支持 Responses-only 模型 |
| 失败时自动双协议重试 | 否决 | 可能重复收费/重复副作用，并制造假成功 |
| CreatorOS 自研 Responses client | 否决 | SDK/Pi 已覆盖流式和工具调用，重复造轮子风险高 |

兼容目标仓库位于 `/Users/zyongzhu/Workbase/Thirdspace-api`，其 Go module 为
`github.com/QuantumNous/new-api`，路由明确暴露 `/v1/responses`。

## 8. 测试与验收

| ID | 验证 |
|---|---|
| TEST-001 | contract 接受并返回 `openai_responses` |
| TEST-002 | model config 保存、导出、导入、解析不降级 |
| TEST-003 | AI SDK 官方/自定义 Chat 与 Responses 返回不同 provider identity |
| TEST-004 | Pi 将三种 `apiFormat` 映射到正确协议，并透传 baseUrl/key/model |
| TEST-005 | 连接测试向 `/responses` 发送规范 body，不调用 `/chat/completions` |
| TEST-006 | 设置页显示 OpenAI Responses，官方 OpenAI 预设默认 Responses |
| TEST-007 | sidecar 缺任一 Pi 协议模块时构建失败 |
| TEST-008 | Thirdspace-api 的 Responses 路由、校验和转换测试通过 |

### 历史证据说明

T-471 实现时留下了绿色回归结果，但没有可审计的“实现前红测”输出。因此：

- 当前绿色回归可以作为 P2P/防回归证据；
- TDD 红→绿 Gate 不得追溯判 PASS；
- 该历史缺口进入 DEC-019，并由用户决定是否接受风险。

### 仍需真机验证

一次带真实 New API token 和实际模型的完整生成会产生外部费用，本补正任务不会擅自调用。
发布前应由用户提供授权后完成：设置保存 → 测试连接 → Agent 工具循环 → UI 回显。

## 9. 物理架构

本功能遵守现有房间边界：

- 协议 schema 在 `contract/`；
- 设置 UI 与组合根连接探测在 `frontend/`；
- 配置持久化和解析在 `backend/`；
- AI SDK 模型工厂在 `ai-worker/`，Pi 引擎在 backend `ai-runtime/execution` 边界；
- 不新增 worker 直写数据库或页面导入 Agent SDK。
