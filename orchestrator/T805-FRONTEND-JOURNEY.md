# T-805 AI 分场失败恢复体验验收契约

```frontend-journey-contract
{
  "schema": "frontend-journey-contract/v1",
  "task_id": "T-805",
  "watched_paths": [
    "backend/src/modules/ai-runtime/video-decisions-runner.ts",
    "backend/src/modules/ai-runtime/cover-runner.ts",
    "frontend/src/features/production/production-workbench.tsx",
    "frontend/tests/e2e/ai-reliability-recovery.spec.ts"
  ],
  "required_checks": [
    { "id": "AC-HUMAN-FAILURE-COPY", "test_id": "E2E-T805-01" },
    { "id": "AC-REFRESH-RECOVERS-RETRY", "test_id": "E2E-T805-02" },
    { "id": "AC-COMPACT-NEXT-ACTION", "test_id": "E2E-T805-03" }
  ],
  "required_conditions": [
    "real-chromium",
    "real-terminal-ai-task",
    "page-refresh",
    "regular-and-compact-viewports"
  ],
  "viewports": [
    { "width": 1536, "height": 1024 },
    { "width": 1024, "height": 768 }
  ],
  "coherence_groups": []
}
```
