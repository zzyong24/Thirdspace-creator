# T-730 流程门恢复后的应用烟测契约

T-730 本身只修改 orchestrator。逻辑层由 122 项流程测试和 test-integrity 负责；真实浏览器旅程
只用于证明恢复工具与模板没有让当前候选应用链退化。

```frontend-journey-contract
{
  "schema": "frontend-journey-contract/v1",
  "task_id": "T-730",
  "required_checks": [
    { "id": "AC-PROCESS-ALL", "test_id": "NODE-T730-01" },
    { "id": "AC-INTEGRITY", "test_id": "INTEGRITY-T730-02" },
    { "id": "AC-APP-SMOKE", "test_id": "E2E-T730-03" }
  ],
  "required_conditions": ["all-process-tests", "no-integrity-error", "normal-viewport", "minimum-viewport"],
  "watched_paths": [
    "orchestrator/process/test-integrity.config.json",
    "orchestrator/process/test-integrity.mjs",
    "orchestrator/templates",
    "orchestrator/tools"
  ],
  "viewports": [
    { "width": 1440, "height": 900 },
    { "width": 1024, "height": 720 }
  ],
  "coherence_groups": []
}
```
