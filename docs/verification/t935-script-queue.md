# T-935 整稿任务排队

公开 CLI 2026-09-08 确认 ai-task-8933b989-127 为 script.draft，14:47:28 UTC 入队，无 executionTaskId 和 startedAt。父任务 ai-task-939f9996-d042-439e-9f71-529c829e9964 约18秒完成。需定位子任务准备/唤醒/重启恢复，不能将卡片转圈认作模型生成中。

## 确认根因与修复范围

2026-09-08 解密应用诊断日志显示每约2秒 PREPARATION_RECOVERY_REJECTED，任务没有进入模型生成。独立排查使用真实公开工具输入，在隔离 PGlite 中经过 JSONB 存储重排 schema.properties 后复现：生产参数解析序列为 mode/topic/angle，恢复重建后变为 mode/angle/topic；agentic-tool-binding 的旧摘要使用 JSON.stringify，导致同内容不同键序被误判篡改。

修复不修改历史摘要算法，也不取消来源校验。恢复时注入原生产解析器，先验证工具版本、执行位置、副作用、schema 与冻结定义一致，再按原解析顺序核对原摘要。继续原子任务和原工具回执，不新建替代任务。所有恢复前置错误仍需可诊断，不再只吞成泛化代码。

独立实现与回归：`pnpm -C backend exec vitest run src/modules/execution/execution-chat-script-draft.service.test.ts` 15/15通过。完整内存PGlite父/子事务重现旧恢复失败；生产resolver使同一子任务prepare一次成功，原digest不变、子任务仍只有一条，伪造schema仍拒绝。frontend tsc通过。实际用户任务尚待安装后恢复。
