# T-1398：DeepSeek Copilot 400 协议核对（2026-10-22）

官方来源：
- https://api-docs.deepseek.com/api/create-chat-completion/
- https://api-docs.deepseek.com/guides/tool_calls/
- https://api-docs.deepseek.com/guides/thinking_mode/

`deepseek-flash` 是当前有效模型 ID。默认启用 thinking；`required` 和具名强制工具选择与 thinking 不兼容，官方明确返回 400。当前 Copilot 首轮实际发送具名 tool_choice，适配器未明确关闭 thinking，因此存在可确定的协议冲突。按该协议仅在 DeepSeek 强制工具请求关闭 thinking，保留自动选择轮次的原行为。官方输出上限字段为 max_tokens；Pi 0.80.7 对 DeepSeek 却默认使用 max_completion_tokens，一并显式修正；不能证明这一字段单独导致历史400。

工具名称须唯一且仅使用字母、数字、下划线和连字符；工具参数为 JSON Schema。strict=true 属 Beta；实际适配器发送 strict=false，不启用严格 schema 子集，未发现依据裁剪37个工具。具名 tool_choice 格式本身正确。未发现 parallel_tool_calls 或 response_format 注入普通 Copilot 请求；无 reasoning 请求时也不从空 capability 占位行注入 effort。显式 medium 当前文档接受并映射 high，不能据此认定400。Pi 按 DeepSeek 地址保留 system 角色，并保留 tool_call_id、工具结果与 reasoning_content 的协议处理。

验证只使用合成 fetch 和本地 HTTP：未读取真实凭据、未调用 DeepSeek。原始400响应已丢失，因此历史具体供应商错误未知，也未证明线上全部链路已恢复。

诊断链：供应商消息/码 → 脱敏限512字符 → 原调用 resultText → GenerationFailure → commitResult / backend → task.errorMessage → SSE → 错误卡。
