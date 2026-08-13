# T-804 AI 可靠性恢复验收契约

```frontend-journey-contract
{
  "schema": "frontend-journey-contract/v1",
  "task_id": "T-804",
  "watched_paths": [
    "ai-worker/src/prompt/templates/script-review.ts",
    "backend/src/modules/ai-runtime/script-review-runner.ts",
    "backend/src/modules/ai-runtime/video-decisions-runner.ts",
    "backend/src/modules/ai-runtime/cover-runner.ts",
    "backend/src/modules/ai/ai.service.ts",
    "frontend/src/features/production/production-workbench.tsx",
    "frontend/src/server/persistence-client.ts",
    "frontend/tests/e2e/ai-reliability-recovery.spec.ts"
  ],
  "required_checks": [
    { "id": "AC-FAILURE-VISIBLE", "test_id": "E2E-T804-01" },
    { "id": "AC-TERMINAL-STOPS-POLLING", "test_id": "E2E-T804-02" },
    { "id": "AC-RETRY-CARRIES-SOURCE", "test_id": "E2E-T804-03" }
  ],
  "required_conditions": [
    "real-chromium",
    "real-terminal-ai-task",
    "no-external-model-call",
    "regular-and-compact-viewports"
  ],
  "viewports": [
    { "width": 1536, "height": 1024 },
    { "width": 1024, "height": 768 }
  ],
  "coherence_groups": []
}
```
