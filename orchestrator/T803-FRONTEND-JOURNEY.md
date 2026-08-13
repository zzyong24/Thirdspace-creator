# T-803 Scene Graph 主体比例与双画幅重排验收契约

```frontend-journey-contract
{
  "schema": "frontend-journey-contract/v1",
  "task_id": "T-803",
  "watched_paths": [
    "backend/src/modules/execution/video-render/template.ts",
    "backend/src/modules/execution/video-render/template.test.ts",
    "orchestrator/process/verify-t802-scene-graph.mjs"
  ],
  "required_checks": [
    { "id": "AC-VISUAL-SCALE", "test_id": "E2E-T803-01" },
    { "id": "AC-ASPECT-REFLOW", "test_id": "E2E-T803-02" },
    { "id": "AC-OBJECT-SEPARATION", "test_id": "E2E-T803-03" },
    { "id": "AC-ALL-FRAMES-SAFE", "test_id": "E2E-T803-04" }
  ],
  "required_conditions": [
    "real-chromium",
    "six-cross-theme-winners",
    "landscape-wide-composition",
    "portrait-vertical-reflow",
    "all-output-frames",
    "twelve-real-mp4"
  ],
  "viewports": [
    { "width": 1920, "height": 1080 },
    { "width": 1080, "height": 1920 }
  ],
  "coherence_groups": []
}
```
