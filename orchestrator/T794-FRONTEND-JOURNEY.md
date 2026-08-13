# T-794 内容驱动动效卡片浏览器旅程契约

```frontend-journey-contract
{
  "schema": "frontend-journey-contract/v2",
  "task_id": "T-794",
  "journey": "在真实 Chromium 中加载现有视频渲染器，依次看到数字、对比、步骤、因果和建立后推翻五种视觉句子，并确认虚线网格、横竖画幅与字幕安全区",
  "entry": "本地 HyperFrames 成片 HTML",
  "copy_guard": { "forbid_internal_ids": true },
  "required_checks": [
    { "id": "AC-MOTION-RELATIONS", "test_id": "E2E-MOTION-01" },
    { "id": "AC-MOTION-SAFE-AREA", "test_id": "E2E-MOTION-02" },
    { "id": "AC-MOTION-GRID", "test_id": "E2E-MOTION-03" },
    { "id": "AC-MOTION-FALLBACK", "test_id": "TEST-MOTION-04" }
  ],
  "required_conditions": [
    "real-chromium",
    "five-content-relations",
    "landscape-delivery",
    "portrait-delivery",
    "subtitle-safe-area",
    "invalid-plan-fallback"
  ],
  "watched_paths": [
    "ai-worker/src/prompt/templates/video-decisions.ts",
    "backend/src/modules/ai-runtime/video-decisions-runner.ts",
    "backend/src/modules/execution/video-render/template.ts",
    "contract/src/resources/video-render.ts",
    "frontend/src/features/production/assemble-video-render-props.ts",
    "orchestrator/process/verify-t794-motion-card-preview.mjs"
  ],
  "viewports": [
    { "width": 1920, "height": 1080 },
    { "width": 1080, "height": 1920 }
  ],
  "coherence_groups": [],
  "honesty": [
    "关系由视频卡片 Skill 声明，代码不得根据词面猜因果或对比",
    "视觉计划所有文字必须来自口播原文，坏计划只降级计划",
    "真实 Chromium 加载正式 GSAP 时间线与模板 DOM，不用静态设计稿冒充",
    "虚线网格保持静态低对比，不覆盖人物、字幕和信息节点"
  ]
}
```
