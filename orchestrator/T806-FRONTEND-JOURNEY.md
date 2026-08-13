# T-806 直接错误与证据归因验收契约

```frontend-journey-contract
{
  "schema": "frontend-journey-contract/v1",
  "task_id": "T-806",
  "watched_paths": [
    "backend/src/modules/ai-runtime/error-diagnostics.ts",
    "backend/src/modules/ai-runtime/video-decisions-runner.ts",
    "backend/src/modules/ai-runtime/cover-runner.ts",
    "backend/src/modules/ai-runtime/chat-context.ts",
    "backend/src/modules/ai-runtime/chat-runner.ts",
    "frontend/src/features/production/production-workbench.tsx",
    "frontend/tests/e2e/ai-reliability-recovery.spec.ts"
  ],
  "required_checks": [
    { "id": "AC-REDACTED-RAW-ERROR-VISIBLE", "test_id": "E2E-T806-01" },
    { "id": "AC-REFRESH-PRESERVES-DIAGNOSTIC", "test_id": "E2E-T806-02" },
    { "id": "AC-EVIDENCE-ONLY-SYSTEM-DIAGNOSIS", "test_id": "TEST-T806-03" }
  ],
  "required_conditions": [
    "real-chromium",
    "real-terminal-ai-task",
    "secret-redaction",
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
