# T-813 联网素材先阅读后保存体验验收契约

```frontend-journey-contract
{
  "schema": "frontend-journey-contract/v1",
  "task_id": "T-813",
  "watched_paths": [
    "backend/src/modules/ai-runtime/chat-context.ts",
    "backend/src/modules/ai-runtime/chat-runner.ts",
    "backend/src/modules/assets/assets.service.ts",
    "backend/src/modules/material-links/material-links.repository.ts",
    "contract/src/operations/assets.ts",
    "contract/src/operations/material-links.ts",
    "contract/src/resources/assets.ts",
    "frontend/src/app/api/chat/route.ts",
    "frontend/src/features/copilot/ai-copilot-content.tsx",
    "frontend/src/features/copilot/chat-gather-card.tsx",
    "frontend/src/features/copilot/chat-web-read-card.tsx",
    "frontend/src/server/persistence-client.ts",
    "frontend/tests/e2e/web-material-read-save.spec.ts"
  ],
  "required_checks": [
    { "id": "AC-READ-BEFORE-SAVE", "test_id": "E2E-T813-01" },
    { "id": "AC-BOUND-URL-COVERAGE", "test_id": "E2E-T813-02" },
    { "id": "AC-STABLE-ASSET-SAVE", "test_id": "E2E-T813-03" }
  ],
  "required_conditions": [
    "real-chromium",
    "real-isolated-account-and-project",
    "deterministic-provider-tool-stream",
    "regular-and-compact-viewports"
  ],
  "viewports": [
    { "width": 1536, "height": 1024 },
    { "width": 1024, "height": 768 }
  ],
  "coherence_groups": []
}
```
