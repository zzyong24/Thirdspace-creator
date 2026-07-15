# 模型配置参考 CC Switch —— provider 预设目录调研(T-325)

> 2026-07-15 · 用户要求「模型配置参考 CC Switch,适配更多模型」。核查 CC Switch 做法 + 定我们落点。
> 结论拍板:用户(2026-07-15)。纯功能增强,不改数据归属/定位,**无需 gate**。

## ① CC Switch 是什么(核查,非凭记忆)

`farion1231/cc-switch`(官网 ccswitch.io,Tauri 桌面工具):给 Claude Code / Codex / Gemini CLI / OpenCode 等做**多供应商配置管理 + 一键切换**。核心能力:

- **50+ 内置供应商预设**。Claude 家族(anthropic 格式)约 23 个:Claude 官方、DeepSeek、智谱 GLM、百炼、Kimi、StepFun、ModelScope、Longcat、MiniMax、DouBaoSeed、SiliconFlow、AiHubMix、DMXAPI、OpenRouter、Nvidia…;Codex 家族(OpenAI Chat/Responses)约 29 个。
- **预设字段**:名称、Base URL、API 格式、API Key(+可选 token)、模型列表、备注。
- **三种 API 格式**:`Anthropic Messages API`、`OpenAI Chat Completions`、`OpenAI Responses API`(Responses 仅 Codex/OpenAI 专用)。
- **自动发现模型**:调供应商 `/v1/models` 端点自动拉可用 model 列表,免手抄 model id。
- **推理能力自适应**:识别供应商是分等级(DeepSeek/OpenRouter)还是仅开关(Kimi/GLM/Qwen)。

来源:[cc-switch repo](https://github.com/farion1231/cc-switch) · [添加供应商文档](https://github.com/farion1231/cc-switch/blob/main/docs/user-manual/zh/2-providers/2.1-add.md)

## ② 我们现状(落点)

- 数据模型:model-config 按 **capability** 配(`(user_id, capability)` 唯一索引)。每条 = `provider`(自由文本)/`modelName`/`baseUrl`/`apiFormat`(**仅 `anthropic` \| `openai_chat`**)/secret/settings。`resolveModelForCapability`:exact → isDefault → 硬默认 `claude-opus-4-8`。
- UI:`frontend/src/features/settings/settings-interactive-region.tsx` `ModelConfigurationCard`(~1964)——纯自由填表单(提供商/模型/接口地址/接口格式/密钥/温度),`PROVIDER_SUGGESTIONS`(1951)只有 5 个建议词(anthropic/minimax/openai/google/deepseek)。3 处能力卡复用同款(默认文本 :387、文案审核 :412、备用对话 chat.fallback :445;另有 :2629 一处 apiFormat select)。
- **缺口**:零预设 —— 用户得自己知道每家的 baseUrl + apiFormat + model id 手填。这正是 CC Switch 解决的。

**关键判断:两 apiFormat 已够。** 国内主流(DeepSeek/GLM/Kimi/MiniMax/通义/阶跃/硅基流动/魔搭/OpenRouter/火山/千帆)都提供 `anthropic` 或 `openai_chat` 兼容端点;`responses` 是 Codex 专用,**我们用不上,后端不用改**。

## ③ 我们要做(T-325)

**核心:加「provider 预设目录 + 选预设自动填」的前端体验**(后端零改或极小改)。

### A. 预设目录(新数据文件,前端)
`frontend/src/features/settings/model-provider-presets.ts`,导出 `MODEL_PROVIDER_PRESETS`,每项:
```ts
{ id, label, apiFormat: "anthropic"|"openai_chat", baseUrl, models: string[], reasoning?: "levels"|"toggle"|"none", note? }
```
**起始目录(baseUrl/model 为参考起始值,字段全可改 —— 同 cc-switch,用户仍需粘 key、可调):**

| id | label | apiFormat | baseUrl(参考) | 候选 models(参考) |
|---|---|---|---|---|
| anthropic | Anthropic 官方 | anthropic | (留空=官方) | claude-opus-4-8 / claude-sonnet-5 / claude-haiku-4-5 |
| minimax | MiniMax | anthropic | https://api.minimaxi.com/anthropic | MiniMax-M2 / abab6.5s-chat |
| deepseek | DeepSeek | openai_chat | https://api.deepseek.com | deepseek-chat / deepseek-reasoner |
| zhipu-glm | 智谱 GLM | anthropic | https://open.bigmodel.cn/api/anthropic | glm-4.6 / glm-4.5 |
| kimi | Kimi(Moonshot) | anthropic | https://api.moonshot.cn/anthropic | kimi-k2-0905-preview / moonshot-v1-128k |
| qwen | 通义千问(百炼) | openai_chat | https://dashscope.aliyuncs.com/compatible-mode/v1 | qwen-max / qwen-plus / qwen3-coder-plus |
| stepfun | 阶跃 StepFun | openai_chat | https://api.stepfun.com/v1 | step-2-16k |
| siliconflow | 硅基流动 | openai_chat | https://api.siliconflow.cn/v1 | deepseek-ai/DeepSeek-V3 / Qwen/Qwen2.5-72B-Instruct |
| modelscope | 魔搭 ModelScope | openai_chat | https://api-inference.modelscope.cn/v1 | (聚合,自填) |
| volcengine | 火山方舟(豆包) | openai_chat | https://ark.cn-beijing.volces.com/api/v3 | doubao-pro-32k |
| openrouter | OpenRouter | openai_chat | https://openrouter.ai/api/v1 | (聚合,自填) |
| openai | OpenAI 官方 | openai_chat | https://api.openai.com/v1 | gpt-5.2 / gpt-4o |
| custom | 自定义 | (用户选) | (自填) | (自填) |

> baseUrl 是**起始模板值**,不保证永久正确(供应商会变);UI 明示可编辑。真正生效仍以用户粘的 key + 可改字段为准。

### B. UI(改 `ModelConfigurationCard`,3 处能力卡复用)
- 表单顶部加「**供应商预设**」`Select`:选中 → 自动填 provider/baseUrl/apiFormat,并把「模型」输入切成**该预设 models 的下拉**(仍允许自由输入=可输入的 combobox / datalist)。
- 选 `自定义` 或手改任一字段 → 回到全自由填(预设只是起点,不锁死)。
- 其余字段(密钥/温度)不变。

### C.(可选·stretch)自动发现模型
「自动获取模型列表」按钮:用当前 baseUrl+key 调 `/v1/models`(openai_chat)拉 model 列表填下拉。**best-effort**、失败静默回退手填。**临发布期可后置**,不阻断核心。

## ④ 边界/风险
- 不改数据归属/产品定位 → 无需 gate。
- 后端 `apiFormat` 仍两值,不动 resolve.ts/provider.ts。
- 预设 baseUrl 可能过时 → 用「参考起始值 + 全字段可编辑」化解,不做「锁死预设」。
- 验证:UI 改动需真机看;因 PGlite 单写者**不能 dev server 与装机版并跑**,视觉验收放在**重打包后装机版**(或用户先关 app 再 dev preview)。
