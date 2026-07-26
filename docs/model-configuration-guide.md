# CreatorOS 模型配置教程

CreatorOS 的主模型通常只需要三项：

1. 选择供应商预设；
2. 填写服务商控制台里的精确模型 ID；
3. 粘贴 API 密钥，然后点击“保存并测试”。

预设会自动填写接口地址和协议。普通用户不需要理解 `Base URL`、Chat Completions 或
Responses；只有使用 New API、自建中转站或服务商特殊入口时，才展开“高级设置”。

## 常用供应商

| 使用场景 | 供应商预设 | 需要用户填写 |
|---|---|---|
| Anthropic 官方 | Anthropic 官方 | 模型 ID、API Key |
| MiniMax | MiniMax | 模型 ID、API Key |
| DeepSeek | DeepSeek | 模型 ID、API Key |
| Kimi 开放平台 | Kimi 开放平台 | 开放平台模型 ID、开放平台 API Key |
| Kimi Code | Kimi Code | Code 模型 ID、Kimi Code Key |
| OpenAI 官方 | OpenAI 官方 | 模型 ID、API Key |

Kimi 开放平台与 Kimi Code 是两套入口，地址、密钥和模型 ID 不能混用。

## New API / 自建中转站

选择“自定义”，展开“高级设置”，然后填写：

- `提供商标识`：便于自己识别，例如 `new-api`；
- `Base URL`：必须是 API 地址，很多中转站需要包含 `/v1`；
- `接口格式`：按渠道实际支持选择 `OpenAI Chat 兼容` 或 `OpenAI Responses`；
- `模型 ID`：复制中转站控制台显示的精确 ID，不要使用展示名称；
- `API Key`：使用该中转站签发的密钥。

接口格式不是模型品牌标签。一个中转站支持 OpenAI Chat，不代表它一定支持 Responses。

## “保存并测试”验证什么

CreatorOS 会先保存当前表单，再复用正式聊天使用的模型工厂和流式调用进行测试。只有收到
非空模型文本才显示“连通”：

- HTTP 200 但返回网页，不算成功；
- HTTP 200 但返回空流，不算成功；
- 模型不存在、密钥错误、Base URL 或协议不匹配，会显示失败并提示核对配置。

测试通过代表基础流式文本通路可用；复杂工具调用仍以实际使用结果为准。

## 常见错误

- Base URL 填成官网首页，而不是 API 地址；
- 中转站地址漏了 `/v1`；
- 模型 ID 前后多了空格、符号，或填写成宣传名称；
- Kimi 开放平台 Key 与 Kimi Code Key 混用；
- 服务商只支持 OpenAI Chat，却选择了 OpenAI Responses；
- 修改了表单但没有保存。主模型请直接使用“保存并测试”，系统会自动先保存。
