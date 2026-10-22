---
id: MOD-004
kind: module
title: SSE 工具调用分片累积
problem_tag: [streaming, llm-integration]
when_to_use: 接收兼容 OpenAI 聊天协议的 SSE，需要实时文字并组装交错的工具参数。
when_not_to_use: 现有 SDK 已组装工具调用、只需文本流或使用其他事件协议时。
keywords: [sse, streaming, tool-calls, openai-protocol, delta-accumulation, reasoning-content, partial-frames, llm-agent]
status: active
verified: true
tier: distilled-verified
winner: true
provenance:
  source: C
  origin_repo: ArvinLovegood/go-stock
  origin_commit: f28fc5f
  content_hash: rewrite
license: Apache-2.0
files:
  - files/sse-tool-call-accumulator.mjs
example: ./example/example.test.ts
---

# SSE 工具调用分片累积

将 SSE 字节流按行拼接，处理 `data:` 和 `[DONE]`；分别累积 `content`、`reasoning_content`，按 `index` 合并增量 `tool_calls` 参数，保留首次出现顺序。缺少 ID 时使用确定性的 `call_<index>`。

传输尾部由调用方跨读取保存；工具结果的执行、回注、下一轮调用、取消与预算由现有内核负责。此模块只处理协议，不另建 Agent 循环。测试覆盖碎片、交错、坏帧和无结束原因的终止。

## 来源与验证

来源仓库、提交和许可证保留在元数据中；改写不自动免除许可证义务，集成前核对实际代码和项目要求。状态及历史验证记录不代表在当前项目已经验证。

在资产目录运行：

```bash
node --test --experimental-strip-types example/example.test.ts
```
