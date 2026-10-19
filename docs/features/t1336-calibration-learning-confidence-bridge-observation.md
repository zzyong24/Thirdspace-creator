# T1336：核对校准结果到经验置信度的既有反馈预留

状态：待调查/待独立评审，未START，生产0W。不属于本轮7f1d4ec9固定包修复范围，不阻已授权的手动Learning→默认量表回流验收。

当前事实：`frontend/src/server/persistence-client.ts:2775` 的事务校准组合与 `:4525` 的主校准组合都注入 `learnings.adjustConfidence: async () => {}`。`:4498–4501`、`:4523–4525` 明确称它是 OQ3 的 best-effort no-op 预留。`backend/src/modules/calibration/calibration.service.ts:762–768` 在记录结果后调用该port，但当前组合不会因此调整经验置信度。

旧计划 `docs/superpowers/plans/modules/20-calibration.md:202` OQ3已提出置信度调整契约问题；本轮只读检索BACKLOG未发现对应单独任务。因此登记为“校准结果自动调整经验置信度未接入（现有预留/非本次回归）”。尚未判定当前Learnings是否已有可复用更新service/contract，不能据旧注释直接新增接口。

后续调查应核真实Learning目标绑定、当前可用service与权限/归属/幂等、结果事实的post-commit失败语义，以及确认范围。需最小SPEC/独评与当场公共RED后才允许实现；本记录不授权新schema/端口/自动打分或修改7f1候选。

当前公开验收只验证明确人工隔离数据、显式Learning创建/建议/用户采纳与默认量表回流，不称自动置信度反馈、真实平台表现或该预留已修复。不得借T1301特定accepted-risk或用新的手动Learning绕签该自动路径。
