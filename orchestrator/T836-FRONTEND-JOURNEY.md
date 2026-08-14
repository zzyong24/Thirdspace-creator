# T-836 前端旅程契约

```frontend-journey-contract
{
  "schema": "frontend-journey-contract/v2",
  "task_id": "T-836",
  "journey": "在当前稿件的编导快捷区选择按语义生成图片或视频素材",
  "entry": "当前项目稿面 → 编导输入框快捷按钮行",
  "watched_paths": [
    "frontend/src/fixtures/selectors/copilot.ts",
    "frontend/src/features/copilot/ai-copilot-content.tsx",
    "frontend/tests/e2e/semantic-material-generation.spec.ts",
    "backend/src/modules/ai-runtime/chat-runner.ts",
    "backend/src/modules/ai-runtime/chat-tools.ts"
  ],
  "required_checks": [
    {"id": "AC-MATERIAL-BUTTONS", "test_id": "E2E-MATERIAL-GENERATE-01"},
    {"id": "AC-IMAGE-SEMANTIC-PREFILL", "test_id": "E2E-MATERIAL-GENERATE-01"},
    {"id": "AC-VIDEO-SEMANTIC-PREFILL", "test_id": "E2E-MATERIAL-GENERATE-01"},
    {"id": "AC-MATERIAL-NO-AUTO-SEND", "test_id": "E2E-MATERIAL-GENERATE-01"}
  ],
  "required_conditions": ["confirmed-script", "image", "video", "minimum-window"],
  "viewports": [
    {"width": 1536, "height": 1024},
    {"width": 1024, "height": 768}
  ],
  "coherence_groups": [],
  "copy_guard": {"forbid_internal_ids": true},
  "states": [
    {"id": "ready", "visible": "生成图片素材 · 生成视频素材"},
    {"id": "image-prefilled", "visible": "先读取当前确认稿，再生成图片素材候选"},
    {"id": "video-prefilled", "visible": "先读取当前确认稿，再生成连续短视频素材候选"}
  ],
  "actions": [
    {"from": "ready", "action": "点击生成图片素材", "to": "image-prefilled"},
    {"from": "ready", "action": "点击生成视频素材", "to": "video-prefilled"}
  ],
  "honesty": [
    "点击只预填，不自动发送或产生费用",
    "用户可见话术不暴露工具名、内部类型或技术 ID",
    "没有当前确认稿时后端不会脱稿生成"
  ]
}
```
