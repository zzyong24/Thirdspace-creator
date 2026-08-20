# T-904 构建验证：官方受管生图提交断连恢复

## 结论

- 本机 1.1.0 日志证明封面策划成功，实际生图在提交阶段瞬时断连后被立即取消；同一配置稍后成功，
  排除提示词、模型选择与响应解析永久损坏。
- 官方受管封面与普通图片现在沿用原任务、原方案和同一 `Idempotency-Key`，最多按 1 秒、3 秒恢复
  两次；最终只记录一个候选。
- 用户自配中转站不自动重放提交未知请求；官方受管视频仍按 provider job/checkpoint 续跑，不新建
  第二条付费任务。

## 红测与绿测

- RED：受管封面和受管图片断言预期各调用 2 次，旧实现实际均只调用 1 次后取消；`2 failed | 36 passed`。
- GREEN：封面/图片 runner 聚焦回归 `38/38`；OpenAI-compatible 图片适配器 `12/12`。
- 全量回归：backend `2945 passed | 4 skipped`，ai-worker `389/389`。
- 类型检查：backend、ai-worker 均通过。
- boundary 与 semantic 门卫通过；reconcile 中新增 LED-045 守卫通过。全局 reconcile 仍以 99 项既有
  历史 review/frontend receipt 欠债和既有 LED-024 内容动效 recurrence 失败，本任务未触碰这些路径，
  不把全局状态冒报为全绿。
- 未调用真实付费接口；真实日志里最新封面任务已在 47 秒内成功，只作为上游可用证据，不冒充本修复
  的稳定性验收。

## 设计证据

- PAT-003 AF-003：保留既有异步任务与审计，在同一任务内恢复。
- MOD-003 `when_not_to_use`：少量上游且有界重试足够，不引入熔断器。
- `SEMANTIC_BOUNDARY_ALLOW`：确定性代码只校验受管身份、传输阶段、错误原因和幂等保证，不参与创作。
