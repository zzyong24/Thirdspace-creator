# T-802 双画幅 Scene Graph 真实渲染旅程

```frontend-journey-contract
{
  "schema": "frontend-journey-contract/v1",
  "task_id": "T-802",
  "watched_paths": [
    "ai-worker/src/prompt/templates/video-decisions.ts",
    "backend/src/modules/ai-runtime/video-decisions-runner.ts",
    "backend/src/modules/execution/video-render/template.ts",
    "contract/src/resources/video-render.ts",
    "orchestrator/process/verify-t802-scene-graph.mjs"
  ],
  "required_checks": [
    { "id": "AC-SCENE-V4", "test_id": "E2E-SCENE-01" },
    { "id": "AC-SCENE-DIVERSITY", "test_id": "E2E-SCENE-02" },
    { "id": "AC-SCENE-SAFETY", "test_id": "E2E-SCENE-03" },
    { "id": "AC-SCENE-BOTH-ASPECTS", "test_id": "E2E-SCENE-04" }
  ],
  "required_conditions": [
    "real-chromium",
    "six-cross-theme-winners",
    "landscape-delivery",
    "portrait-delivery",
    "all-output-frames",
    "no-scene-fallback"
  ],
  "viewports": [
    { "width": 1920, "height": 1080 },
    { "width": 1080, "height": 1920 }
  ],
  "coherence_groups": []
}
```
