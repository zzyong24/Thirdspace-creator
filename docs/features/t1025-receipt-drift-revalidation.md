# T-1025 历史评审与前端验收回执重新核验

## 问题

2026-09-21 全量 `reconcile` 的运行测试、架构边界、孤儿扫描和教训门均通过，但以下历史回执已与当前仓库真相不一致：

- T-703、T-691、T-656、T-645、T-635 的 review receipt 所记录 constitution hash 已过期。
- T-1022 的 frontend acceptance report 内容 hash 已变化，completion event commit 与报告 commit 不一致。

这些证据不能通过修改 hash 或补写历史 PASS 消除，否则会把没有在当时发生的新评审伪装成历史证据。

## 目标

1. 按当前 constitution 和当前代码重新执行上述任务要求的独立评审与前端验收。
2. 生成带当前 commit、输入 hash、检查结果和时间的正式回执。
3. 保留旧回执及失效原因，建立新旧证据链，不覆盖历史事实。
4. 重新运行全量 `reconcile`，使 receipt 检查与运行门同时通过。

## 验收

- 每个失效回执都有当前真相下真实发生的评审或验收记录。
- T-1022 前端报告覆盖当前共享聊天恢复链路，报告 commit 与 completion event 一致。
- 不复用旧 reviewer 结论，不手改 hash 冒充通过。
- `node orchestrator/process/reconcile.mjs` 全绿。
