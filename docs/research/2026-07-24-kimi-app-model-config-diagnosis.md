# 打包版 APP：Kimi 模型配置诊断

日期：2026-07-24  
范围：仅 `/Applications/CreatorOS.app`，不使用 localhost 开发网页作为证据。  
结论：本轮只排查和给出配置口径，不修改实现。

## 结论

“只有 OpenAI Chat 能连上”符合当前 Kimi 接口能力和 CreatorOS 的请求拼接逻辑，不是三个格式都应该使用同一地址。

- Anthropic 测试失败：APP 实际请求 `/v1/v1/messages`，说明保存的 Base URL 已以 `/v1` 结尾，而 Anthropic 适配器又追加了 `/v1/messages`。
- OpenAI Responses 测试失败：APP 实际请求 `/v1/responses`；Kimi 当前公开兼容接口没有声明支持 Responses API。
- OpenAI Chat 成功：随后 APP 日志出现真实对话 `outcome=completed durationMs=2291`。

## APP 日志证据

打包 APP 的加密 sidecar 日志经项目自带解密器读取：

```text
[settings.models.test] chatProbe/anthropic 404 ... "url":"/v1/v1/messages"
[settings.models.test] chatProbe/openai-responses 404 ... "url":"/v1/responses"
[chat-turn] outcome=completed durationMs=2291
```

日志文件：

```text
~/Library/Application Support/cloud.aitongban.creatoros/logs/sidecar.prev.log.enc
```

## 当前 APP 为什么容易配错

1. `接口格式` 决定请求协议和追加路径，不是展示标签：
   - Anthropic 兼容：追加 `/v1/messages`
   - OpenAI Chat 兼容：追加 `/chat/completions`
   - OpenAI Responses：追加 `/responses`
2. `提供商` 主要是预设/标识；真正决定能否连接的是 `接口格式 + Base URL + 模型 ID + 同平台 API Key`。
3. 当前 Kimi 预设仍填入 `https://api.moonshot.cn/anthropic` 与 Anthropic 格式，和 Kimi 当前开放平台官方 OpenAI 兼容口径不一致。
4. Kimi 开放平台和 Kimi Code 是两套平台：Base URL、Key 和模型 ID 不能混用。

## 用户可直接照填

| Key 来源 | Base URL | 接口格式 | 模型 ID 示例 |
|---|---|---|---|
| Kimi 开放平台（按量计费） | `https://api.moonshot.cn/v1` | `OpenAI Chat 兼容` | `kimi-k3`（以账户实际可用列表为准） |
| Kimi Code（会员订阅） | `https://api.kimi.com/coding/v1` | `OpenAI Chat 兼容` | `k3`、`k3-256k`、`kimi-for-coding` |
| Kimi Code 的 Anthropic 兼容入口 | `https://api.kimi.com/coding/` | `Anthropic 兼容` | 同 Kimi Code 模型 ID |

Kimi 不选择 `OpenAI Responses`。配置修改后先保存，再点连接测试。

## 后续实现建议（未实施）

- 把一个 Kimi 预设拆成“Kimi 开放平台”和“Kimi Code”。
- 预设自动锁定正确的 Base URL、协议和可选模型；普通用户只填 Key、选模型。
- 将协议和 Base URL 收进“高级设置”。
- 连接失败直接展示解析后的请求地址与具体不匹配原因。
- 对不支持 Responses API 的供应商隐藏或禁用该选项。

## 官方依据

- Kimi 开放平台快速开始：<https://platform.kimi.com/docs/overview>
- Kimi OpenAI 兼容说明：<https://platform.kimi.com/docs/guide/migrating-from-openai-to-kimi>
- Kimi Code 接口与模型说明：<https://www.kimi.com/code/docs/en/>
- Kimi Code FAQ：<https://www.kimi.com/code/docs/en/kimi-code/faq.html>
