# Copilot 工具过程反馈与“补全选题卡”长耗时诊断

- 任务：T-617
- 时间：2026-07-29
- 范围：用户截图对应的最新 CreatorOS 加密 sidecar 日志、Copilot 前端流式状态、
  `topic.enrich` 工具编排与结构化节点
- 结论：界面有工具级加载反馈，但没有工具内部阶段；截图中的 47.9 秒主要耗在
  `topic.enrich` 的第二次模型调用，不是前端卡死。

## 大白话结论

目前对话只展示了两层很粗的状态：

1. 整个 SSE 仍在进行时显示“编导思考中…”；
2. 模型已经发出工具调用、但工具尚未返回时显示“正在调用 补全选题卡…”。

截图里两条同时出现是当前实现的正常结果，不代表同时有两个任务。全局流还没结束，所以
“编导思考中”不会消失；工具结果还没回来，所以工具行也继续转。

真正缺失的是工具内部阶段。`topic.enrich` 进入 `runStructuredNode(generateObject)` 后，
前端只收到一个未完成的 tool part；直到完整 JSON 对象返回前，没有“已读取定位”“正在生成
观众/痛点/Hook/结构”“正在校验卡片”等事件。因此 33 秒被压成一个无变化的 spinner。

```mermaid
flowchart LR
  A["外层 Copilot<br/>理解请求"] --> B["发出 topic.enrich"]
  B --> C["内层结构化模型<br/>一次生成完整选题卡"]
  C --> D["工具结果回到对话"]
  D --> E["外层 Copilot<br/>文字收尾"]
```

## 截图这一次的真实耗时

最新日志 `sidecar-2026-07-29-5.log.enc` 中，对应调用发生于
`2026-07-29 17:22:32–17:23:20 UTC`：

| 阶段 | 日志证据 | 耗时 |
|---|---|---:|
| 外层上下文准备 | `[chat-context] est=5952→5952 tokens` | 已在整轮起点完成 |
| 强制工具调用兼容降级 | `tool_choice_unsupported_downgrade` | 约 0.22 秒，无退避 |
| 外层模型输出开场并发出工具调用 | 由相邻时间反推 | 约 7.1 秒 |
| `topic.enrich` 结构化模型调用 | `status=ok durationMs=33340 path=structured modelCalls=1` | 33.34 秒 |
| 外层模型根据工具结果收尾 | 工具完成至整轮完成 | 约 7.29 秒 |
| 整轮 | `[chat-turn] outcome=error_recovered durationMs=47928` | 47.93 秒 |

结构化工具这一次输入 `6643` tokens、输出 `1847` tokens，且 `modelCalls=1`，没有发生
结构化重试或文本兜底。因此这一例中最大的单段耗时就是模型生成完整选题卡。

`error_recovered` 不是这次工具失败：相邻日志明确是当前模型不接受强制
`tool_choice`，恢复层立即降级为 auto 后继续成功。它只占约 0.22 秒，不是 48 秒的主因。

日志还出现：

```text
creatoros-custom.chat / deepseek-v4-pro:
The feature "responseFormat" is not supported
```

本次仍以 `path=structured / modelCalls=1 / status=ok` 完成，所以不能把这条 warning 直接判成
33 秒的原因；但它证明当前模型适配与结构化输出能力并非完全匹配，是后续性能优化应单独处理
的兼容性信号。

## 它到底在“想”什么

日志不能、也不应该暴露模型的私有逐 token 推理链。可以确定的是它正在完成明确的业务任务：

- 读取当前选题标题和切入角度；
- 注入创作者定位、过往经验、受众信号、知识库材料和素材诚实约束；
- 一次性生成 `oneLiner`、目标观众、观众痛点、核心冲突、Hook、内容结构、形式、
  素材依据、风险、立项建议以及三个评分/难度字段；
- 用 schema 校验完整 JSON，再把卡片结果交回外层 Copilot。

模板要求见 `ai-worker/src/prompt/templates/topic-enrich.ts`。本次日志只能证明以上输入、输出规模、
调用次数与耗时，不能还原模型内部的隐藏思维文字。

## 为什么当前反馈不够

- 前端工具 part 只有 `output-available` 与“尚未 output”两大状态；未完成时统一渲染
  “正在调用…”，见 `frontend/src/features/copilot/ai-copilot-content.tsx:1821`。
- 只要整轮仍 streaming，就额外渲染“编导思考中…”，见同文件 `:2343`，所以工具执行期重复
  出现两个 spinner。
- `runStructuredNode` 只在整个结构化节点结束时打印一条 performance log，见
  `ai-worker/src/nodes/structured-node.ts:265`；调用过程中没有进度回调或流式业务事件。
- `topic.enrich` 是一次完整 `generateObject`，不是按 13 个字段逐段生成，不能诚实展示伪造的
  “30% / 60%”。可展示的是确定发生的阶段，而不是模型隐式推理。

## 正确优化方向

后续若用户确认实施，应保持一条真实事件链，只增加诚实的阶段反馈：

1. “正在读取当前选题与账号定位”；
2. “正在生成完整选题卡（观众、痛点、Hook、结构等）”；
3. “正在校验选题卡完整性”；
4. 完成后显示卡片，并移除重复的全局“编导思考中”。

同时应量化所有 Copilot 工具的 `外层首步 / 工具内部 / 外层收尾` 三段耗时，优先优化
工具内部模型延迟和重复的外层模型往返。不能展示或存储原始 chain-of-thought，也不能在单次
不可观测的模型请求里伪造百分比进度。

本轮只读诊断，没有修改 Copilot 交互、模型配置、运行中数据或日志。
