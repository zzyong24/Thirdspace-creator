# T-829 上游模型全能力真实兼容矩阵（2026-08-14）

## 结论（大白话）

当前渠道不能再用一个“连接成功”代表模型能承担 CreatorOS 全功能。

```text
渠道配置同步 ──失败──> 模型请求根本不会发生（本次 Windows 日志的首要问题）
       │
       └─成功──> 再分别验：流式聊天 / 工具调用 / 结构化输出 / 图片 / 视频
                              │
                              └─不同模型结果确实不同，不能混成一个绿灯
```

- Windows 三份日志没有任何 provider/model/image HTTP 调用；先失败在渠道配置同步，结果是
  `security_error`。其中一份同时进入 activation-only/expired。故这台 Windows 的“文本/生图
  都不可用”不能归因给具体模型。
- 用独立、限额、测试后已撤销的 OmniHi Key 做了真实请求。渠道托管与用户自配中转都走
  `https://api.omnihi.ai/openai`；两者的协议结果趋势一致，包装层不是模型能力差异来源。
- 中转站 `/openai/models` 实时返回 79 个文本模型，但只声明模型名和厂商，不声明工具调用、
  结构化输出等能力，因而不能把“出现在模型列表”当成“CreatorOS 全功能可用”。
- 全量首轮真实执行 79×3=237 次请求：153 次通过、84 次失败。36 个模型首轮三项全过；
  3 个模型在 60 秒复测后才三项全过；22 个仅部分能力可用或跨轮次不稳定；18 个三项均失败。
- 全量模型探测使用用户中转站协议单跑一轮；渠道托管包装层已在前一轮 13 模型双接入验证中
  证明使用相同线协议，故没有把 79 模型再重复一遍以制造 237 次无新增信息的请求。
- 文生图真实成功。参考图生图首轮失败的根因已纠正：首轮把
  `openai/gpt-image-2-text-to-image` 错送到编辑接口，不能据此否定上游图生图能力。OmniHi
  模型广场明确分别提供 `openai/gpt-image-2-edit` 与
  `gemini/gemini-3.1-flash-image-edit`；改用正确模型后共 5 次真实编辑调用均进入生成服务，
  但 GPT Image 2 连续 3 次返回 HTTP 502、Nano Banana 2 连续 2 次返回 HTTP 503，均为
  “生成服务暂时不可用”。结论是“目录已声明、当前实测不稳定”，不是“不支持”。
- 文生视频真实成功；当前签名配置只声明 `mode=t2v`，参考图/首帧生视频未声明且适配器不支持。
- ASR 的本地适配器与 Growth 临时凭据契约测试通过，但本机没有可用的真实 Qwen 临时凭据，
  因此真实上游转写诚实标为“未验证”，不写假 PASS。
- 渠道图没有 `asset.classify`（图片理解）和 embedding 模型；这两项是“未配置/不适用”，不是失败。

## 测试入口与真实端点

| 能力 | 当前模型/协议 | 真实端点 | 结果 |
| --- | --- | --- | --- |
| 文本流式/工具/结构化 | `/models` 返回的 79 个 `openai_chat` 模型 | `POST /openai/chat/completions` | 首轮 153/237 请求通过；见全量表 |
| 文生图 | `openai/gpt-image-2-text-to-image` | `POST /openai/v1/images/generations` | PASS，36.125s，PNG 232,855 bytes |
| 参考图生图 | `openai/gpt-image-2-edit` / `gemini/gemini-3.1-flash-image-edit` | `POST /openai/v1/images/edits` | 目录明确支持；正确模型真实复测 0/5，通过率 0%，GPT 为 502×3、Gemini 为 503×2，当前不可承诺稳定可用 |
| 文生视频 | `seedance/seedance-2.0-fast` | `POST /media/v1/videos/generations` + job 轮询 | PASS，121.290s，MP4 362,034 bytes |
| 参考图生视频 | 当前仅 `mode=t2v` | 不应请求 | UNSUPPORTED；已改为零请求明确拒绝，不再静默忽略首帧 |
| ASR | `qwen3-asr-flash` / `qwen_chat_audio` | DashScope compatible-mode chat | 真实上游未验证；Creator 适配器 25 项相关测试与 Growth lease 11 项测试通过 |
| 图片理解 | 无渠道模型 | — | 未配置 |
| embedding | 无渠道模型 | — | 未配置 |

## 中转站 79 个模型全量结果

测试口径：每个模型都走 CreatorOS 实际 `modelFor`、流式响应、强制工具调用和
`runStructuredNode` 文本结构化链路；首轮每项 20 秒，所有超时/疑似瞬时上游错误再以 60 秒复测。
`✅` 首轮通过；`⚠️` 复测后通过或跨轮次不稳定；`❌` 明确协议/渠道/输出失败。

| 模型 | 厂商 | 流式 | 工具 | 结构化 | 结论 |
| --- | --- | --- | --- | --- | --- |
| `gpt-5.6-sol` | OpenAI | ✅ | ✅ | ✅ | 首轮全过 |
| `gpt-5.6-terra` | OpenAI | ✅ | ✅ | ✅ | 本轮全过；前轮曾有上游波动 |
| `gpt-5.6-luna` | OpenAI | ✅ | ✅ | ✅ | 本轮全过；前轮曾有上游波动 |
| `claude-fable-5` | Anthropic | ✅ | ❌ 400 | ✅ | 部分可用 |
| `gpt-5.6-luna-reverse` | OpenAI | ⚠️ 上游失败后通过 | ❌ 502 | ✅ | 部分可用 |
| `gpt-5.6-terra-reverse` | OpenAI | ✅ | ❌ 400 | ✅ | 部分可用 |
| `gpt-5.6-sol-reverse` | OpenAI | ✅ | ❌ 502 | ✅ | 部分可用 |
| `claude-sonnet-5` | Anthropic | ✅ | ✅ | ✅ | 首轮全过 |
| `claude-opus-5` | Anthropic | ⚠️ 空流后通过 | ⚠️ 通过后 60s 超时 | ⚠️ 通过后 60s 超时 | 跨轮次不稳定 |
| `claude-opus-4.8` | Anthropic | ⚠️ 通过后空流 | ⚠️ 超时后通过 | ❌ 两轮超时 | 不可承担结构化任务 |
| `claude-sonnet-5-reverse` | Anthropic | ❌ 403 | ❌ 403 | ❌ 403 | 三项不可用 |
| `claude-opus-5-reverse` | Anthropic | ❌ 403 | ❌ 403 | ❌ 403 | 三项不可用 |
| `claude-opus-4.7` | Anthropic | ✅ | ⚠️ 20s 超时后通过 | ✅ | 复测全过，仍需稳定性观察 |
| `claude-opus-4.8-reverse` | Anthropic | ✅ | ✅ | ✅ | 首轮全过 |
| `claude-opus-4.6` | Anthropic | ⚠️ 空流后通过 | ✅ | ✅ | 复测全过，仍需稳定性观察 |
| `claude-opus-4.7-reverse` | Anthropic | ✅ | ✅ | ✅ | 首轮全过 |
| `claude-sonnet-4.6` | Anthropic | ✅ | ⚠️ 20s 超时后通过 | ✅ | 复测全过，前轮双接入均通过 |
| `claude-opus-4.5` | Anthropic | ✅ | ✅ | ✅ | 首轮全过 |
| `claude-opus-4.6-reverse` | Anthropic | ✅ | ✅ | ✅ | 首轮全过 |
| `claude-sonnet-4.5` | Anthropic | ✅ | ✅ | ✅ | 首轮全过 |
| `claude-sonnet-4.6-reverse` | Anthropic | ✅ | ✅ | ✅ | 首轮全过 |
| `claude-haiku-4.5` | Anthropic | ✅ | ✅ | ✅ | 首轮全过 |
| `claude-haiku-4.5-reverse` | Anthropic | ✅ | ✅ | ❌ schema | 部分可用 |
| `gemini-3.1-pro-preview` | Google | ❌ 空流 | ❌ 无工具调用 | ❌ schema | 三项不可用 |
| `gemini-3.5-flash` | Google | ✅ | ✅ | ✅ | 首轮全过 |
| `gemini-3.1-flash-lite` | Google | ✅ | ✅ | ✅ | 首轮全过 |
| `gemini-3-flash-preview` | Google | ✅ | ✅ | ✅ | 首轮全过 |
| `gemini-2.5-pro` | Google | ❌ 空流 | ❌ 无工具调用 | ❌ schema | 三项不可用 |
| `gemini-2.5-flash` | Google | ✅ | ✅ | ✅ | 首轮全过 |
| `gpt-5.5` | OpenAI | ❌ 空流 | ✅ | ✅ | 部分可用 |
| `gpt-5.5-pro` | OpenAI | ❌ 400 | ❌ 400 | ❌ 400 | 三项不可用 |
| `gpt-5.5-reverse` | OpenAI | ✅ | ❌ 400 | ✅ | 部分可用 |
| `gpt-5.4` | OpenAI | ✅ | ✅ | ✅ | 首轮全过 |
| `gpt-5.4-pro` | OpenAI | ❌ 400 | ❌ 400 | ❌ 400 | 三项不可用 |
| `gpt-5.4-reverse` | OpenAI | ✅ | ❌ 400 | ✅ | 部分可用 |
| `gpt-5.4-mini` | OpenAI | ❌ 400 | ✅ | ✅ | 部分可用 |
| `gpt-5.4-nano` | OpenAI | ❌ 400 | ❌ 400 | ✅ | 仅结构化通过 |
| `gpt-5.4-mini-reverse` | OpenAI | ❌ 403 | ❌ 403 | ❌ 403 | 三项不可用 |
| `gpt-5.3-codex` | OpenAI | ❌ 400 | ❌ 400 | ❌ 400 | 三项不可用 |
| `gpt-5.3-chat-latest` | OpenAI | ❌ 500 | ❌ 500 | ❌ 500 | 三项不可用 |
| `gpt-5.2` | OpenAI | ✅ | ✅ | ✅ | 首轮全过 |
| `gpt-5.2-pro` | OpenAI | ❌ 400 | ❌ 400 | ❌ 400 | 三项不可用 |
| `gpt-5.2-codex` | OpenAI | ❌ 400 | ❌ 400 | ❌ 400 | 三项不可用 |
| `gpt-5.2-chat-latest` | OpenAI | ✅ | ✅ | ✅ | 首轮全过 |
| `gpt-5.1` | OpenAI | ✅ | ✅ | ✅ | 首轮全过 |
| `gpt-5.1-codex` | OpenAI | ❌ 400 | ❌ 400 | ❌ 400 | 三项不可用 |
| `gpt-5.1-chat-latest` | OpenAI | ❌ 超时后 500 | ❌ 超时后 500 | ❌ 超时后 500 | 三项不可用 |
| `gpt-5-pro` | OpenAI | ❌ 400 | ❌ 400 | ❌ 400 | 三项不可用 |
| `gpt-5` | OpenAI | ❌ 空流 | ❌ 无工具调用 | ❌ schema | 三项不可用 |
| `gpt-5-codex` | OpenAI | ❌ 400 | ❌ 400 | ❌ 400 | 三项不可用 |
| `gpt-5-mini` | OpenAI | ❌ 空流 | ❌ 无工具调用 | ❌ schema | 三项不可用 |
| `gpt-5-nano` | OpenAI | ❌ 400 | ❌ 400 | ❌ schema | 三项不可用 |
| `gpt-4.1` | OpenAI | ✅ | ✅ | ✅ | 首轮全过 |
| `gpt-4.1-mini` | OpenAI | ✅ | ✅ | ✅ | 首轮全过 |
| `gpt-4.1-nano` | OpenAI | ✅ | ✅ | ✅ | 首轮全过 |
| `gpt-4o` | OpenAI | ✅ | ✅ | ✅ | 首轮全过 |
| `gpt-4o-mini` | OpenAI | ✅ | ✅ | ✅ | 首轮全过 |
| `deepseek-v4-pro` | DeepSeek | ✅ | ✅ | ✅ | 首轮全过 |
| `deepseek-v4-flash-0731` | DeepSeek | ✅ | ❌ 400 | ✅ | 部分可用 |
| `deepseek-v4-flash` | DeepSeek | ✅ | ❌ 400 | ✅ | 部分可用 |
| `glm-5.1` | GLM | ✅ | ✅ | ❌ schema | 不可承担当前结构化任务 |
| `glm-5.2` | DeepSeek（目录标注） | ✅ | ✅ | ❌ schema | 不可承担当前结构化任务 |
| `glm-5` | GLM | ✅ | ❌ 无工具调用 | ❌ schema | 仅普通流式通过 |
| `minimax-m3` | MiniMax | ✅ | ✅ | ✅ | 首轮全过；正式业务链已验证 |
| `kimi-k2.7-code` | Moonshot | ✅ | ✅ | ✅ | 首轮全过 |
| `minimax-m2.7` | MiniMax | ✅ | ✅ | ❌ schema | 不可承担当前结构化任务 |
| `kimi-k2.6` | Moonshot | ✅ | ✅ | ✅ | 首轮全过 |
| `deepseek-v3.2` | DeepSeek | ✅ | ✅ | ✅ | 首轮全过 |
| `deepseek-v3.2-exp` | DeepSeek | ✅ | ✅ | ✅ | 首轮全过 |
| `kimi-k2.5` | Moonshot | ✅ | ✅ | ✅ | 首轮全过 |
| `minimax-m2.5` | MiniMax | ✅ | ✅ | ❌ schema | 不可承担当前结构化任务 |
| `deepseek-v3-turbo` | DeepSeek | ✅ | ✅ | ✅ | 首轮全过 |
| `deepseek-v3` | DeepSeek | ✅ | ✅ | ✅ | 首轮全过 |
| `kimi-k2` | Moonshot | ✅ | ✅ | ✅ | 首轮全过，流式/结构化约 18s |
| `glm-4.7` | GLM | ✅ | ❌ 缺调用/400 | ⚠️ 20s 超时后通过 | 部分可用 |
| `glm-4.7-flash` | GLM | ✅ | ✅ | ❌ schema | 不可承担当前结构化任务 |
| `minimax-m2.1` | MiniMax | ✅ | ✅ | ✅ | 首轮全过 |
| `kimi-k2-thinking` | Moonshot | ✅ | ✅ | ✅ | 首轮全过 |
| `minimax-m2` | MiniMax | ✅ | ✅ | ❌ schema | 不可承担当前结构化任务 |

分类汇总：

- 36 个首轮三项全过。
- 3 个（`claude-opus-4.7`、`claude-opus-4.6`、`claude-sonnet-4.6`）60 秒复测全过，
  但保留首轮超时/空流记录，不冒充稳定。
- 22 个部分能力可用或跨轮次不稳定。
- 18 个三项均不可用。
- 全量测试与复测共消耗 0.84532054 元；隔离 Key `133` 已删除，按名称复查剩余 0 个。

## 当前配置 13 个模型的双接入结果

符号：`✅` 两种接入均通过；`⚠️` 至少一次通过但上游不稳定；`❌` 两次真实请求均出现同类不兼容。

| 模型 | 流式 | 工具调用 | 结构化输出 | 可承担的当前业务结论 |
| --- | --- | --- | --- | --- |
| `minimax-m3` | ✅ | ✅ | ✅ | 全能力通过；默认模型真实业务回归也通过 |
| `gpt-5.6-luna` | ✅ | ⚠️ 一次 60s 超时 | ⚠️ 一次 `upstream_error` 400 | 上游波动，不宜显示“全能力稳定” |
| `gpt-5.6-terra` | ⚠️ 一次 `upstream_error` 400 | ❌/⚠️ 两轮均出现 400 | ✅ | 普通/工具路由不稳定 |
| `gpt-5.6-sol` | ✅ | ✅ | ✅ | 全能力通过 |
| `claude-haiku-4.5` | ✅ | ✅ | ✅ | 全能力通过 |
| `claude-sonnet-4.6` | ✅ | ✅ | ✅ | 全能力通过 |
| `claude-opus-4.8` | ✅ | ✅ | ❌ 两次 60s 超时 | 可聊天/工具，不适合作为当前结构化业务默认模型 |
| `gemini-3.5-flash` | ✅ | ✅ | ✅ | 全能力通过 |
| `gemini-3.1-pro-preview` | ❌ 空流 | ❌ 无 tool call | ❌ 无合 schema 对象 | 当前 CreatorOS 协议下不可用 |
| `deepseek-v4-flash` | ✅（reasoning 流） | ❌ 两次 400 | ✅ | 不适合需要工具的编导/Agent 功能 |
| `deepseek-v4-pro` | ✅ | ✅ | ✅ | 全能力通过 |
| `kimi-k2.6` | ✅ | ✅ | ✅ | 全能力通过 |
| `glm-5.2` | ✅（reasoning 流） | ✅ | ❌ 两次 schema 不合格 | 可聊天/工具，不适合当前结构化业务 |

两种接入的共同稳定全能力集合：

1. `minimax-m3`
2. `gpt-5.6-sol`
3. `claude-haiku-4.5`
4. `claude-sonnet-4.6`
5. `gemini-3.5-flash`
6. `deepseek-v4-pro`
7. `kimi-k2.6`

## 正式业务入口回归（不是“只回复 OK”）

默认 `minimax-m3` + 当前正式 Skill：

| 业务入口 | 结果 | 真实证据 |
| --- | --- | --- |
| `topic.generate` | PASS | 23.863s，生成 7 条选题，schema 通过 |
| `script.draft` | PASS | 102.543s，生成 5 段分镜，完整性 `valid` |
| `script.review` | PASS | 17.480s，返回合法审核报告 |

因此 MiniMax M3 本身不是本次 Windows 报错的统一根因。Windows 先修渠道配置同步；若同步成功后
仍在某个任务失败，再用新增的稳定错误码定位具体节点。

## 本次已落代码修复

1. 中转站把上游故障包成 HTTP 400 + `upstream_error` 时，渠道错误不再落成泛化
   `CHANNEL_MODEL_UNKNOWN`，而是 `CHANNEL_MODEL_UPSTREAM` + `retryable=true`。
2. 渠道配置同步投影为 `security_error` 时，日志状态从误导性的 `completed` 改成 `blocked`。
3. `refreshClientConfig` 安全失败时，日志新增安全稳定的 `errorCode`，不记录授权码、Key、ticket、
   identity 或响应正文。下次 Windows 日志可以直接区分签名、授权范围、缓存、过期等根因。
4. OmniHi 收到 `firstFrame` 时不再静默丢弃并假装完成参考图生视频；改为零上游请求、明确提示
   “当前渠道只支持文生视频”。

## 自动验证

- `/openai/models` 实时清单：79/79 个唯一模型已纳入矩阵；全量首轮 237 次请求，超时/瞬时项
  另做 24 次 60 秒复测；测试 Key 删除回查通过。
- AI Worker provider 分类：20/20 PASS。
- OmniHi 视频适配器：9/9 PASS。
- 图片、视频、Qwen ASR 适配器聚焦测试：25/25 PASS。
- Client config route + server：33/33 PASS。
- Growth Qwen 临时凭据契约：11/11 PASS（契约级，不冒充真实上游转写）。
- AI Worker、Frontend TypeScript 类型检查：PASS。
- 物理架构门卫：无新增违规（5 条均为既有基线）。
- 全局 `reconcile` 仍被 15 条既有治理欠债阻断（BACKLOG runaway、旧 review receipt 过期、
  T-828 验收列非法、旧 frontend receipt 漂移）；T-829 本身未新增 reconcile 错误，不冒充全绿。
- Frontend 全量测试曾被误触发并主动停止；停止前暴露的 2 个 `context-deps-resolver` 失败属于
  工作树既有并发变更，不作为 T-829 的通过证据。聚焦测试和类型检查均已独立通过。

## 发布判断与剩余项

- 中转站返回的 79 个模型不能原样全部塞进可选列表：只有 36 个首轮三项全过，另 3 个要标
  “复测通过但不稳定”。模型图应由服务端按能力声明流式/工具/结构化，UI 只展示当前任务所需
  能力满足的模型；禁止按模型名猜能力。
- 当前签名模型图中的 13 个也不应表现成同等“全能力可用”。至少应将
  `gemini-3.1-pro-preview` 从可选默认模型移除或禁用；Opus/GLM/DeepSeek Flash 需要按能力标注，
  Luna/Terra 保留上游波动提示。
- “参考图生图”上游目录明确支持，但当前不能对用户承诺稳定可用：一方面正确编辑模型 5 次
  真实复测均返回生成服务暂不可用；另一方面 Growth 模型图目前只有 `image.generate`，CreatorOS
  也会把同一个模型 ID 同时用于文生图与编辑。需要新增明确的 `image.edit` 能力并让参考图请求
  选用编辑模型，入口再依据签名能力显示；禁止按模型名硬编码猜能力。
- 完成真实 ASR 验收需要一次有效的 Growth `qwen-asr-main` per-request lease；本地没有该临时凭据。
  在拿到合法 lease 前保持“未验证”。
- 本次未修改用户现有模型配置、未自动切换模型、未发布、未部署；专用 OmniHi 测试 Key 已撤销。
