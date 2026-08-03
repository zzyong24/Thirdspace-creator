# T-666 定位母版非破坏草稿真实浏览器旅程契约

```frontend-journey-contract
{
  "schema": "frontend-journey-contract/v2",
  "task_id": "T-666",
  "journey": "已有正式定位时开始完全从零前采，确认当前母版、规则与历史仍在，草稿独立显示",
  "entry": "/positioning",
  "copy_guard": { "forbid_internal_ids": true },
  "required_checks": [
    { "id": "AC-POSITIONING-MASTER", "test_id": "E2E-POS-SAFE-01" },
    { "id": "AC-POSITIONING-DRAFT", "test_id": "E2E-POS-SAFE-02" },
    { "id": "AC-POSITIONING-SEARCH-LOCALE", "test_id": "E2E-POS-SEARCH-01" }
  ],
  "required_conditions": ["existing-master", "scratch-draft", "history-visible", "minimum-window"],
  "watched_paths": [
    "backend/src/modules/positioning/positioning.service.ts",
    "backend/src/modules/positioning/positioning.service.test.ts",
    "frontend/src/features/positioning/positioning-center.tsx",
    "frontend/src/features/positioning/positioning-interactive-region.tsx",
    "frontend/tests/e2e/recent-data-safety.spec.ts"
  ],
  "viewports": [
    { "width": 1440, "height": 900 },
    { "width": 1024, "height": 720 }
  ],
  "coherence_groups": [],
  "honesty": [
    "scratch 只隔离生成输入，不删除正式定位",
    "旧 reset operation 在后端失败关闭",
    "只有用户明确采纳候选后才能切换当前母版"
  ]
}
```
