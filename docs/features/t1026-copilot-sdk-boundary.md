# T-1026 Copilot 前端 SDK 边界回归

2026-09-30 执行 `node orchestrator/process/reconcile.mjs` 与 `boundary-scan.mjs`，相对既有 5 项基线新增 2 项 R2：`frontend/src/features/copilot/live-chat-session.ts` 引入 `@ai-sdk/react` 与 `ai`。本任务调查该组件实际职责，把模型/Agent SDK 执行移至允许的 worker/ai-runtime 端口，前端只保留状态与交互。不得提高门卫基线或通过删掉可用对话流程消警。验收覆盖聊天发送、流式显示、取消、错误恢复及边界扫描，记录桌面端真实运行结果。当前 T-1020 的平台代码未改该文件；此任务是全局 reconcile 的独立根因。


## 2026-10-01 再验证

隔离工作区 boundary-scan 再次退出 1，仍为同一文件的两项新增 R2。当前 T-1043 表单和 T-1044 正文断言修改没有改该文件；不得声称全局 Gate 已通过，也不得提高基线。日志：[boundary-current.log](../research/evidence/t1043/boundary-current.log)。后续仍由本任务统一跟踪，保留现有合法会话、取消和恢复链。

## 2026-10-02 开源工作台整合再验证

同一文件的 ai、@ai-sdk/react 新增 R2 仍失败。本轮原生工作台没有加入对应 SDK 或改该决策 runner；失败继续由本任务跟踪，不提高基线或虚记通过。见[全仓失败登记](../research/evidence/t1042/complete-editors/global-checks.md)及原始日志。
