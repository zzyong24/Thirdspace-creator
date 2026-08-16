# T-849 发布物料查看旅程契约

```frontend-journey-contract
{
  "schema": "frontend-journey-contract/v2",
  "task_id": "T-849",
  "journey": "同一作品已有发布事实时，查看完整生成物料并在刷新后继续看到简介与标签",
  "entry": "当前项目稿面 → 发布物料 → 查看发布物料",
  "watched_paths": [
    "backend/src/modules/ai-runtime/platform-adapt-runner.ts",
    "backend/src/modules/ai-runtime/platform-adapt-runner.test.ts",
    "frontend/src/features/draft-workbench/draft-workbench-data.ts",
    "frontend/src/features/draft-workbench/draft-workbench-state.test.ts",
    "frontend/src/features/draft-workbench/draft-workbench-page.tsx",
    "frontend/src/features/draft-workbench/draft-workbench-page.bug8.test.tsx",
    "frontend/tests/e2e/publish-package-readback.spec.ts"
  ],
  "required_checks": [
    {"id": "AC-PUBLISH-PACK-RICH-REVISION", "test_id": "E2E-T849-01"},
    {"id": "AC-PUBLISH-PACK-SINGLE-LINE", "test_id": "E2E-T849-01"},
    {"id": "AC-PUBLISH-PACK-REFRESH", "test_id": "E2E-T849-01"},
    {"id": "AC-PUBLISH-STATUS-PRESERVED", "test_id": "E2E-T849-01"}
  ],
  "required_conditions": [
    "rich-package-plus-title-only-published-fact",
    "single-line-description",
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
    {"id": "published-project", "visible": "已发布 · 查看发布物料"},
    {"id": "package-open", "visible": "单行简介 · 真实标签"},
    {"id": "package-restored", "visible": "刷新后仍显示同一简介与标签"}
  ],
  "actions": [
    {"from": "published-project", "action": "点击查看发布物料", "to": "package-open"},
    {"from": "package-open", "action": "刷新页面并再次查看", "to": "package-restored"}
  ],
  "honesty": [
    "发布状态来自同一作品下的真实已发布记录，不因当前展示生成物料而改写",
    "简介只折叠换行与连续空白，不改写文字、标点或创作含义",
    "已保存数据不迁移、不覆盖，查看时读取真实当前版本"
  ]
}
```
