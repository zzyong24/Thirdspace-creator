---
id: MOD-003
kind: module
title: 三态熔断与中性许可释放
problem_tag: [resilience, failover, state-machine]
when_to_use: 存在真实的多上游故障隔离需求，并需要半开探针判断恢复。
when_not_to_use: 简单有界重试已够用、无需健康状态或半开探针时。
keywords: [circuit-breaker, half-open, failover, resilience, state-machine, error-rate, half-open-permit, backpressure, upstream-health]
status: active
verified: true
tier: distilled-verified
winner: true
provenance:
  source: C
  origin_repo: https://github.com/farion1231/cc-switch.git
  origin_commit: ab6266f745bfff989ff4c20040e9695d5dea6479
  content_hash: rewrite
license: MIT
files:
  - files/circuit-breaker.blueprint.md
example: ./example/example.test.ts
---

# 三态熔断与中性许可释放

为每个实际健康边界维护 Closed/Open/HalfOpen。连续失败或足量请求的错误率达到阈值时打开；超时后限制半开探针数量，连续成功关闭，探针失败重新打开。

`allow()` 返回 `{ allowed, usedHalfOpenPermit }`，每次取得许可必须恰好进入 `recordSuccess`、`recordFailure` 或 `releaseNeutral`。不应计入上游故障的重试也要释放许可，避免半开状态死锁。仅保留单线程 JavaScript 状态语义，不包含原 Rust 运行时。

时间可注入，测试不依赖真实等待。具体接入边界见 `files/circuit-breaker.blueprint.md`。

## 来源与验证

来源仓库、提交和许可证保留在元数据中；改写不自动免除许可证义务，集成前核对实际代码和项目要求。状态及历史验证记录不代表在当前项目已经验证。

在资产目录运行：

```bash
node --test --experimental-strip-types example/example.test.ts
```
