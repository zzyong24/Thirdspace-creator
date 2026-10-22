# 页面合同检查

> 适用判定与证据格式见 [_GATE_EVIDENCE.md](./_GATE_EVIDENCE.md)。

- 页面说明用途、数据、动作、状态和验收，并对应已确认的 IA/需求。
- 真实交互绑定 `SERVICE_CONTRACT.md` 中存在的操作；`planned` 明示规划中并绑定 HARD 或任务所有者，`static` 不承诺操作。核心路径未实现不能当成完成。
- 每个核心动作描述意图、即时反馈、最终结果、下一步、返回/刷新、AC 和旅程测试 ID。
- 新页面使用 `frontend-journey-contract/v2`，与人工表一致，`copy_guard.forbid_internal_ids=true`；v1 仅作旧工件兼容。
- 声明适用的加载、空、错、重复操作状态和两个不同的正常/最小视口。
- 主从选择保持 `selectedId == null || visibleIds.includes(selectedId)` 和 `detail == null || detail.id == selectedId`。
- 探索稿不包含正式绑定，不直接作为 BUILD 合同。

证据为页面及上游路径、合同块、AC/测试核对结果。重要范围改变或接受风险才需要新授权。
