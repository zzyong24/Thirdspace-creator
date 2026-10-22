---
id: MOD-005
kind: module
title: 结构化输出校验与有界重试
problem_tag: [structured-output, retry, validation]
when_to_use: 输出必须符合结构契约，且可把明确的校验错误反馈给生产者修正。
when_not_to_use: 自由文本、鉴权等不可恢复错误，或单次输出已足够时。
keywords: [retry, validation, feedback, model-retry, structured-output, bounded-loop, self-correct]
status: active
verified: true
tier: distilled-verified
winner: true
provenance:
  source: C
  origin_repo: pydantic/pydantic-ai
  origin_commit: 60f51471c0763c29ec723473cafb0c8f32e53b06
  content_hash: rewrite
license: MIT
files:
  - files/structured-output-retry.mjs
example: ./example/example.test.ts
---

# 结构化输出校验与有界重试

`RetrySignal` 表示生产者可修正的错误，其他异常立即停止。`buildRetryPrompt` 将被拒输出和原因送入下一次尝试，不修改原始提示前缀；`maxRetries` 用完后抛出 `RetryBudgetExhausted`。

接入实际 `validate` 和 `produce(prompt, attempt)`；消息数组模式可替换提示构造器。测试覆盖首轮成功、反馈重试、预算耗尽、硬错误、零重试和提示构造。不要把网络或权限错误当成结构错误消耗重试。

## 来源与验证

来源仓库、提交和许可证保留在元数据中；改写不自动免除许可证义务，集成前核对实际代码和项目要求。状态及历史验证记录不代表在当前项目已经验证。

在资产目录运行：

```bash
node --test --experimental-strip-types example/example.test.ts
```
