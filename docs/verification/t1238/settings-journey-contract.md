# T-1238 设置页真实旅程合同

```frontend-journey-contract
{
  "schema": "frontend-journey-contract/v2",
  "task_id": "T-1238",
  "copy_guard": {
    "forbid_internal_ids": true
  },
  "watched_paths": [
    "frontend/src/features/settings/assistant-engine-card.tsx",
    "frontend/src/features/settings/settings-model-region.tsx",
    "frontend/src/features/settings/settings-interactive-region.tsx",
    "frontend/src/features/copilot/assistant-engine.ts",
    "frontend/src/features/copilot/use-assistant-engine.ts",
    "frontend/src/features/copilot/assistant-engine-selector.tsx",
    "frontend/src/proxy.ts",
    "docs/verification/t1238/ui-final.cjs",
    "docs/verification/t1238/run-ui-journey.cjs"
  ],
  "required_checks": [
    {
      "id": "AC-UI-1",
      "test_id": "E2E-T1238-SETTINGS"
    },
    {
      "id": "AC-UI-2",
      "test_id": "E2E-T1238-SETTINGS"
    },
    {
      "id": "AC-UI-3",
      "test_id": "E2E-T1238-SETTINGS"
    },
    {
      "id": "AC-UI-4",
      "test_id": "E2E-T1238-SETTINGS"
    },
    {
      "id": "AC-UI-5",
      "test_id": "E2E-T1238-SETTINGS"
    },
    {
      "id": "AC-UI-6",
      "test_id": "E2E-T1238-SETTINGS"
    },
    {
      "id": "AC-UI-7",
      "test_id": "E2E-T1238-SETTINGS"
    },
    {
      "id": "AC-UI-8",
      "test_id": "E2E-T1238-SETTINGS"
    },
    {
      "id": "AC-UI-9",
      "test_id": "E2E-T1238-SETTINGS"
    },
    {
      "id": "AC-UI-10",
      "test_id": "E2E-T1238-SETTINGS"
    }
  ],
  "required_conditions": [
    "loading",
    "unauthenticated",
    "image-unavailable",
    "refresh",
    "repeat",
    "error"
  ],
  "viewports": [
    {
      "width": 1366,
      "height": 900
    },
    {
      "width": 390,
      "height": 900
    }
  ],
  "coherence_groups": []
}
```
