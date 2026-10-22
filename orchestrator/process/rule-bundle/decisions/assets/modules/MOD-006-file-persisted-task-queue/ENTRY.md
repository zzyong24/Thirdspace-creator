---
id: MOD-006
kind: module
title: 文件持久化后台任务队列
problem_tag: [background-jobs, job-orchestration, task-queue]
when_to_use: 单进程、低并发后台任务需要状态查询和重启后的明确处置，单 JSON 存储足够。
when_not_to_use: 多进程或多副本，或需要调度、优先级、延迟任务、可靠重试及背压时。
keywords: [task-queue, job-queue, fire-and-forget, asyncio-create-task, json-persistence, file-backed, restart-recovery, crash-compensation, background-jobs, status-polling, async-mutex]
status: active
verified: true
tier: distilled-verified
winner: true
provenance:
  source: C
  origin_repo: deepwiki-open
  origin_commit: 6be3c1602fabf6875fb3638f08371072f96287a2
  content_hash: rewrite
license: MIT
files:
  - files/task-queue.mjs
example: ./example/example.test.ts
---

# 文件持久化后台任务队列

将内存任务表保存到单文件，用异步互斥保护读改写；`submit()` 立即返回任务编号并在后台执行。启动加载时把失去执行进程的 `running` 任务转为 `error`，不能继续假装运行。

`createTaskQueue({ load, save, now, genId })` 创建队列；提供 `submit/update/get/list/remove/clearDone/drain`。执行者通过 `update` 报告进度；未设置终态就返回时标 `done`，抛错则标 `error`。

保存采用尽力而为策略，磁盘错误不会传给调用方；因此不提供强持久性保证。测试覆盖后台完成、进度、异常、重启补偿、清理与保存失败。

## 来源与验证

来源仓库、提交和许可证保留在元数据中；改写不自动免除许可证义务，集成前核对实际代码和项目要求。状态及历史验证记录不代表在当前项目已经验证。

在资产目录运行：

```bash
node --test --experimental-strip-types example/example.test.ts
```
