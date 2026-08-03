# T-665 内容雷达信源彻底删除真实浏览器旅程契约

```frontend-journey-contract
{
  "schema": "frontend-journey-contract/v2",
  "task_id": "T-665",
  "journey": "在内容雷达删除一个真实创建的信源，确认二次提示、删除结果和刷新后消失",
  "entry": "/intelligence",
  "copy_guard": { "forbid_internal_ids": true },
  "required_checks": [
    { "id": "AC-SOURCE-DELETE", "test_id": "E2E-SOURCE-DELETE-01" },
    { "id": "AC-SOURCE-DISAPPEAR", "test_id": "E2E-SOURCE-DELETE-02" }
  ],
  "required_conditions": ["created-source", "confirmed-delete", "refresh-disappear", "minimum-window"],
  "watched_paths": [
    "backend/src/modules/intelligence/intelligence.service.ts",
    "backend/src/modules/intelligence/intelligence.service.test.ts",
    "contract/src/operations/intelligence.ts",
    "frontend/src/features/intelligence/intelligence-workbench.tsx",
    "frontend/tests/e2e/recent-data-safety.spec.ts",
    "frontend/tests/helpers/fixed-evidence-clock.cjs",
    "orchestrator/process/run-recent-data-safety-fixed.mjs"
  ],
  "viewports": [
    { "width": 1440, "height": 900 },
    { "width": 1024, "height": 720 }
  ],
  "coherence_groups": [],
  "honesty": [
    "成功提示只展示后端返回的真实独占内容计数",
    "共享内容、正式选题和项目证据不能冒充已删除",
    "同步中的来源明确拒绝删除"
  ]
}
```
