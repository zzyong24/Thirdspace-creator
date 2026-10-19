# 画布与扫码入口页面验收契约

用户2026-10-09指定的局部交互方向，保留现有tokens/组件。正常窗口1366×900；窄窗900×900。
素材库只显示预览与操作；提交锁与重新生成确认同节点生效；用户连线填精确参考文件，不自动采纳/执行；用户手选、清空和模式切换优先。各平台表格按钮打开对应平台/目标账号组的原扫码面板，Esc关闭后表格仍可操作。

真实浏览器在隔离PGlite中经正式HTTP上传用户提供截图、创建账号组、画布与素材，实际保存和重开。模型运行回执是明确标注的供应商替身；不触及本人扫码或真实profile。平台绑定与调度另经公开transport+真实DB+隔离浏览器源替身验收。这些证据不等于供应商实机生成/本人扫码/安装后的验收。

```frontend-journey-contract
{
  "schema": "frontend-journey-contract/v2",
  "task_id": "T-1101",
  "copy_guard": {
    "forbid_internal_ids": true
  },
  "watched_paths": [
    "frontend/src/components/media/asset-picker.tsx",
    "frontend/src/features/creative-canvas",
    "frontend/src/features/platform-account/account-group-manager.tsx",
    "frontend/src/features/platform-account/account-group-manager.test.tsx",
    "frontend/src/features/automations/automations-island.tsx",
    "frontend/src/features/automations/automations-island.test.tsx",
    "frontend/src/server/persistence-client.ts",
    "frontend/src/server/__module_integration__/local-platform-binding.persistence-client.test.ts",
    "frontend/tests/e2e/creative-canvas.spec.ts",
    "backend/src/application/scheduling",
    "backend/src/modules/ai/ai.service.ts",
    "backend/src/modules/ai/ai.service.test.ts",
    "backend/src/application/platform-collection/periodic.ts",
    "backend/src/application/workspace/startup.ts",
    "backend/src/modules/ai-runtime/collection-bootstrap.ts",
    "backend/src/modules/creative-canvas",
    "backend/src/modules/platform-collection",
    "backend/src/modules/scheduling",
    "backend/src/modules/ai-runtime/scheduled-collection-runner.ts"
  ],
  "required_checks": [
    {
      "id": "AC-GALLERY",
      "test_id": "TEST-T1101-CANVAS"
    },
    {
      "id": "AC-GENERATION",
      "test_id": "TEST-T1101-CANVAS"
    },
    {
      "id": "AC-EDGE",
      "test_id": "TEST-T1101-CANVAS"
    },
    {
      "id": "AC-BINDING",
      "test_id": "TEST-T1101-BINDING"
    }
  ],
  "required_conditions": [
    "refresh",
    "repeat",
    "back"
  ],
  "viewports": [
    {
      "width": 1366,
      "height": 900
    },
    {
      "width": 900,
      "height": 900
    }
  ],
  "coherence_groups": []
}
```
