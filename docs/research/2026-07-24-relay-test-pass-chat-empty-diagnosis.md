# 打包版 APP：中转站测试成功但编导空回复诊断

日期：2026-07-24  
范围：仅 `/Applications/CreatorOS.app`；本轮只诊断，不修改实现。  
隐私：未读取、调用或输出用户 API Key。

## 结论

这是“弱连接测试放过了不完整的中转兼容性”叠加“空回复兜底只能落库、不能即时回显”：

1. 设置页测试只发一个非流式 1 token `ping`，收到任意 HTTP 2xx 就判成功，不检查响应 JSON/SSE 中是否真的存在模型文本。
2. 编导真实请求会携带约 5700 tokens 上下文、system prompt、工具定义，并使用流式 Responses API。
3. 中转站对真实请求返回 2xx 空流；AI SDK 的 `onFinish` 仍触发，所以日志是 `outcome=completed`，但文本、工具部件和 token 用量全为空。
4. T-464 空回复兜底会把提示写入 `ai_messages`，但它发生在当前 SSE 已经空着结束之后；前端内存不会即时收到这条数据库消息，因此用户当下仍看到“编导不回话”，刷新/重载历史后才可能看到提示。

### OpenAI Chat 复测补充

用户切换为 `openai_chat` 后，生产库确认配置已经生效；新一轮仍在 3312ms 后 `completed` 且零文本、零 token。进一步对中转站做不带 Key、不会产生模型费用的响应类型探测：

| 请求地址 | HTTP | Content-Type | 结论 |
|---|---:|---|---|
| `https://api.jiucaihezi.studio/chat/completions` | 200 | `text/html` | 命中营销网页，不是模型 API |
| `https://api.jiucaihezi.studio/responses` | 200 | `text/html` | 命中营销网页，不是模型 API |
| `https://api.jiucaihezi.studio/v1/chat/completions` | 401（无 Key） | `application/json` | 正确进入 API 鉴权路由 |
| `https://api.jiucaihezi.studio/v1/responses` | 401（无 Key） | `application/json` | 正确进入 API 鉴权路由 |

因此本次直接根因是 Base URL 缺少 `/v1`。当前测试探针只看 `res.ok`，把营销页 HTML 200 当成模型补全成功；真实 SDK解析不到 JSON/SSE 模型内容，最终表现为空回复。

### 加上 `/v1` 后的验证

用户保存 `/v1` 后，打包 APP 在 12:47 和 12:49 的连接测试已进入真实 API；Chat 与 Responses 不再返回 HTML 200，而是中转站明确返回：

```text
503 model_not_found
No available channel for model -claude-haiku-4-5-20251001 under group 3.2 (distributor)
```

这证明 Base URL 已修正。当前剩余阻塞是中转站没有为该用户分组提供这个模型 ID；尤其模型名前导 `-` 高度可疑，应先核对/去掉，再从中转站“可用模型”列表选择精确 ID。协议切换不会修复 `model_not_found`。

## APP 证据

加密 sidecar 日志：

```text
[2026-07-24T12:36:11.505Z] [chat-context] est=5707→5707 tokens cleared=0 truncated=0
[2026-07-24T12:36:15.877Z] [chat-turn] outcome=completed durationMs=4371
```

生产库只读快照中的同一轮：

```text
12:36:11 user      墨迹阿婆
12:36:15 assistant AI 未返回任何内容。可能的原因:①API 代理返回空流……
```

该 assistant 行：

- `parts=[]`
- `model_key=NULL`
- `input_tokens=NULL`
- `output_tokens=NULL`

这证明不是模型回复已经生成但前端漏画，而是上游没有产生任何可消费模型内容；数据库中的 104 字提示是 CreatorOS 自己的空流兜底。

## 当前生效配置（不含 Key）

编导专用 `copilot.assist` 行为空，因此回落到 `default`：

| 字段 | 当前值 |
|---|---|
| Base URL | `https://api.jiucaihezi.studio` |
| 接口格式 | 初次为 `openai_responses`；复测已切为 `openai_chat` |
| 模型 ID | `-claude-haiku-4-5-20251001` |
| Key | 已配置，未读取 |

`provider=kimi` 只是标签，不决定运行协议；真正路由由 `api_format=openai_responses` 决定。模型 ID 开头的 `-` 也需要向中转站核对是否为其真实别名，CreatorOS 不应猜测并自动修正。

## 测试与真实聊天的差异

| 项目 | 设置页测试 | 编导真实聊天 |
|---|---|---|
| 输入 | `ping` | 完整历史、定位上下文和 system prompt |
| 输出上限 | 1 token | 正常生成 |
| 流式 | 否 | 是 |
| 工具定义 | 无 | 有 |
| 成功条件 | 仅 `res.ok` | 必须解析出文本或工具部件 |
| 当前结果 | 2xx，被判连接成功 | 2xx 空流，无模型内容 |

因此“测试连接成功”现在只代表 Key/域名/最小路由没有立即返回 4xx/5xx，不代表该中转站支持 CreatorOS 编导所需的流式、Responses 和 tool calling。

本次中转站应先把 Base URL 改为 `https://api.jiucaihezi.studio/v1`；再按中转站对该模型的实际兼容协议选择 OpenAI Chat 或 Responses。模型 ID 前导 `-` 仍须向中转站核对。

## 后续若实施的验收口径

- 连接测试必须使用与编导一致的 SDK/协议和流式模式。
- 探针至少验证收到一个合法文本 delta，不能只看 HTTP 2xx。
- 中转站配置应分别探测：基础补全、流式、tool calling；缺哪个就明确标红哪个。
- 空流提示必须作为当前响应的一部分即时送给前端，不能只在流结束后写数据库。
- 展示解析后的实际接口地址、协议、模型 ID，并提示异常模型 ID；不显示 Key。
