# 最新内容雷达“生成选题卡卡住”日志诊断

- 任务：T-627
- 飞书记录：`rec27T6wlsnDaI`
- 反馈时间：2026-07-30 13:39:21（UTC+08:00，本机时间）
- 应用版本：0.2.0
- 页面：`/intelligence`
- 范围：只读反馈记录、附件加密日志与当前代码；未修改代码、用户数据或飞书结论

## 大白话结论

这次和此前 T-589“内容雷达逐字稿转选题很慢”属于同一根因族，但和 T-617 的
Copilot `topic.enrich` 不是同一条任务。

最新反馈走的是内容雷达自己的 `intelligence.topic-decompose`：旧 0.2.0 包把完整逐字稿交给
自定义 OpenAI Chat 兼容端点的 `gpt-4o-mini`，端点不支持 schema 级 `responseFormat`，
AI SDK 只能退成普通 JSON object；旧执行器随后可能继续做结构校验、重试和文本兜底，页面又只
跟踪约 8 秒，因此用户看到长时间“生成中”却拿不到卡。

```mermaid
flowchart LR
  A["内容雷达：确认生成"] --> B["旧 0.2.0<br/>发送完整逐字稿"]
  B --> C["gpt-4o-mini 兼容网关"]
  C --> D["不支持 schema responseFormat"]
  D --> E["慢响应 / 结构校验 / 重试"]
  E --> F["页面早已停止自动跟踪<br/>用户看到一直生成中"]
```

当前证据不能把 warning 本身写成 100% 的单一失败原因：同一份日志里，
`topic.enrich` 在出现相同 warning 时曾于 9.464 秒内成功。最新这次还有同一网关稍早连续
HTTP 502 的证据，所以“网关不稳定 + 结构化协议不匹配 + 旧版重试/短轮询放大”才是完整结论。

## 最新反馈的时间线

| 本机时间（UTC+08） | 日志证据 | 结论 |
|---|---|---|
| 13:26:14 / 13:26:39 | `chat-turn llm retry ... reason=http_502` 两次 | 同一自定义模型网关在反馈前已有上游 502 波动 |
| 13:27:07 | `creatoros-custom.chat / gpt-4o-mini` 不支持 `responseFormat` schema | 结构化输出能力声明与当前调用不匹配 |
| 13:35:13 | 再次出现同一 `responseFormat` warning | 与用户生成选题的时间窗吻合 |
| 13:38:16 | 又一次出现同一 warning | 两次间隔约 183.8 秒，符合慢响应/旧重试被放大的表现 |
| 13:39:21 | 用户提交反馈 | warning 后没有选题生成成功、失败或结构化节点终态日志 |

日志在 13:38:16 后结束；不能仅凭附件断言任务最终落成 `failed` 还是仍在运行，但可以确认用户
提交反馈时没有留下成功终态。

## 和之前问题的同异

| 对比项 | T-617 Copilot 补全卡 | 本次 T-627 内容雷达 |
|---|---|---|
| 页面/入口 | Copilot 对话 | `/intelligence` 生成选题候选 |
| 模板 | `topic.enrich` | `intelligence.topic-decompose` |
| 模型执行底座 | `runStructuredNode` | `runStructuredNode` |
| 已知结果 | 47.9 秒后成功 | 用户反馈时仍无卡、日志无终态 |
| 共同信号 | 结构化模型调用慢、`responseFormat` 能力不匹配 | 相同 |
| 本次新增信号 | — | 同一网关稍早连续 HTTP 502；运行包缺少新性能终态日志 |

因此若“之前”指 T-589 的内容雷达慢：基本就是同一问题，而且用户仍在使用未包含后续优化的
旧 0.2.0 包。若指 T-617 的 Copilot 截图：底层问题相同，但不是同一个入口、模板或任务实例。

## 为什么判断用户仍是旧执行链

当前 main 在 `bc2fe12f` 已加入：

- 内容雷达结构化调用 `maxRetries: 0`；
- 首次拆解后按 `transcriptHash` 复用拆解证据；
- 页面从固定约 8 秒改为最长 240 秒自动跟踪；
- `[structured-node] template/status/duration/path/modelCalls/tokens` 安全性能日志。

附件里多次运行结构化能力，却完全没有任何 `[structured-node]` 日志；反馈表同时明确记录版本
0.2.0。结合公开 0.2.0 打包点早于 `bc2fe12f`，可高置信判断该用户没有运行上述优化后的包。
由于版本号没有携带 commit/build id，这仍是高置信推断，不冒充二进制哈希级证明。

## 后续修复判断

代码侧不应重复造一套新修复。先让线上反馈用户获得包含 `bc2fe12f` 及后续 main 的新安装包，
再用同一条逐字稿复测并检查新增的 `[structured-node]` 终态。

如果新包仍失败，下一步才根据真实 `template/path/modelCalls/duration` 区分：

1. 自定义网关的 HTTP 502/超时；
2. `json_object` 返回但本地 schema 校验失败；
3. 任务已终态但页面读取未回显。

目前最缺的发布证据不是再猜一次模型原因，而是“新包 build id + 同输入复测 + 新结构化终态日志”。
