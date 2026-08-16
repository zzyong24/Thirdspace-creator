# T-853 稿面素材真实预览旅程契约

```frontend-journey-contract
{
  "schema": "frontend-journey-contract/v2",
  "task_id": "T-853",
  "journey": "项目稿面里的视频素材卡可通过双击或键盘打开素材中心同款真实播放器",
  "entry": "当前项目稿面 → 内容弹药 → 视频素材卡",
  "watched_paths": [
    "frontend/src/components/resources/material-summary.tsx",
    "frontend/src/components/ui/dialog.tsx",
    "frontend/src/features/draft-workbench/ammo-card-list.tsx",
    "frontend/src/features/draft-workbench/ammo-card-list.test.tsx",
    "frontend/tests/e2e/draft-ammo-media-preview.spec.ts"
  ],
  "required_checks": [
    {"id": "AC-AMMO-VIDEO-LIVE-PREVIEW", "test_id": "E2E-T853-01"},
    {"id": "AC-AMMO-PREVIEW-LAZY-OFFICIAL-URL", "test_id": "E2E-T853-01"},
    {"id": "AC-AMMO-PREVIEW-KEYBOARD", "test_id": "E2E-T853-01"},
    {"id": "AC-AMMO-PREVIEW-REFRESH-COMPACT", "test_id": "E2E-T853-01"}
  ],
  "required_conditions": [
    "real-uploaded-video-bytes",
    "official-assets-download-url",
    "page-refresh",
    "regular-and-compact-viewports"
  ],
  "viewports": [
    {"width": 1536, "height": 1024},
    {"width": 900, "height": 720}
  ],
  "coherence_groups": [],
  "copy_guard": {"forbid_internal_ids": true},
  "states": [
    {"id": "video-card", "visible": "视频素材卡 · 双击预览"},
    {"id": "video-dialog", "visible": "视频预览 · 可控播放器"},
    {"id": "compact-restored", "visible": "刷新后键盘打开同一视频预览"}
  ],
  "actions": [
    {"from": "video-card", "action": "双击视频素材卡", "to": "video-dialog"},
    {"from": "video-dialog", "action": "关闭、刷新并在紧凑窗口按 Enter", "to": "compact-restored"}
  ],
  "honesty": [
    "播放器只读取正式 assets.downloadUrl 返回的签名地址，不拼接本机文件路径",
    "未打开弹层时不为视频卡换取预览地址",
    "素材读取失败时沿用素材中心诚实占位，不展示伪造画面或假成功"
  ]
}
```
