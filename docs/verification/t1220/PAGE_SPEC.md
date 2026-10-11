# 画布素材上传旅程验收

仅复核现有抽屉新增真实上传链接。空库存能够导航，dirty稿先保存、回读、返回刷新；重复及失败保护同时由真实组件spy端口验证，不能冒称组件覆盖为服务器CAS。原真实CAS竞争回归在15例中单列。表面与旅程使用隔离Chromium和正常公共API，不模拟页面及数据库。

```frontend-journey-contract
{
  "schema": "frontend-journey-contract/v2",
  "task_id": "T-1220",
  "required_checks": [
    {
      "id": "AC-UPLOAD-ENTRY",
      "test_id": "E2E-T994-UPLOAD"
    },
    {
      "id": "AC-SAVED-LEAVE",
      "test_id": "E2E-T994-UPLOAD"
    },
    {
      "id": "AC-RETURN-PRESERVES",
      "test_id": "E2E-T994-UPLOAD"
    }
  ],
  "required_conditions": [
    "empty",
    "back",
    "refresh",
    "error",
    "repeat"
  ],
  "watched_paths": [
    "frontend/src/features/creative-canvas/canvas-asset-picker.tsx",
    "frontend/src/features/creative-canvas/canvas-editor.tsx",
    "frontend/src/features/creative-canvas/canvas-editor.test.tsx",
    "frontend/tests/e2e/creative-canvas.spec.ts"
  ],
  "viewports": [
    {
      "width": 1536,
      "height": 1024
    },
    {
      "width": 1024,
      "height": 768
    }
  ],
  "coherence_groups": [],
  "copy_guard": {
    "forbid_internal_ids": true
  }
}
```
