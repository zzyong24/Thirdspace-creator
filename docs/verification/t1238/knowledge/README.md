# T-1238 四类知识功能实测证据

2026-10-11 在专属工作树验证知识归类、全文蒸馏、知识关联与评论问题提炼。公共接口继续返回原候选形状；前端用户采纳后仍走原 `knowledge.create` 等领域接口。模型执行迁入原 `aiTask` 与唯一 `execution_tasks`，没有单独任务系统或结果存储。

```mermaid
flowchart LR
  A[原知识公共接口] --> B[原 aiTask]
  B --> C[唯一 execution_tasks 和原截止时间]
  C --> D[受控 Worker]
  D --> E[Codex 原生协议或原 Pi 配置]
  E --> F[原调用预约与回执账本]
  F --> G[原候选结果和同步响应]
  G --> H[用户确认后由原领域服务创建知识]
```

实际结果：后端 7 个文件 48 个测试通过，Worker 1 个文件 12 个测试通过。测试全部 `retry=0`，单个测试和 Hook 的预算至少 120 秒；整链测试外层预留 300 秒，原业务任务期限 180 秒，构建子进程上限 180 秒。测试不使用用户业务数据库、账户模型或浏览器。

- `routing-red.txt`：迁移前四类入口仍尝试宿主 `resolveModelSpec`，4 个测试失败、1 个通过；`routing-green.txt` 是同一入口迁移后的 5 个通过。
- `backend-48-pass.txt`：保留原归一/截断/空候选/真实 ID 过滤，并通过真实 PGlite、真实 Worker 子进程和本地 Pi HTTP 供应商验证四类同步链路。全文蒸馏多块共用首次绑定的绝对期限，只增加必要调用数量；最后只保留一个父任务和一个候选。请求观察终止、Worker 唤醒故障保留原任务 ID 和真实状态；没有调用 `createKnowledge`。
- `worker-12-pass.txt`：Codex 四类节点在 AsyncLocalStorage 执行权下预留、启动、绑定原 thread/turn 并结算。已结算回执重放不会再生成；已启动或未知的调用只恢复原 turn。蒸馏取消不预约下一块；第二块未知时不交付半篇，恢复原 turn 后才交付全文。四类旧 Pi 路径仍用原配置访问本地 HTTP，无隐式 Codex 切换。
- Codex 原生会话在该 Worker 测试中使用隔离 fixture；这证明调用权、原协议和账本闭环，不证明用户账户真实模型在线。真实账户探针由 T-1238 主线程另行保留。
- 全文 coverage 按实际送入模型的分块字符数计算；硬上限落在空白区时也不虚报已处理字符。`onChunkProgress` 继续报告全文完成后的真实完成数；四个当前 HTTP 路由无该回调消费者。

`first-integration-hook-failure.txt` 保留首次测试编写中将 Hook 超时误传为对象造成的 NaN 失败；已改成数字预算，之后真实整链通过。`worker-test-type-failure.txt` 保留测试构造 facets 的 union 类型错误，已给输入显式契约类型，最终 Worker `tsc --noEmit` 成功（`worker-types.txt` 空日志）。这些失败不是补拍成通过。

本次 Worker 类型检查成功；后端类型检查观测到 `execution-codex-call.service.ts:38` 的三个账本字段类型错误，保存在 `backend-types-observed-failure.txt`，知识文件没有类型错误。后端最终类型检查、全局边界/孤儿/超时门及实际公共路由验收由主线程汇总；本证据不替代全系统上线验收。
