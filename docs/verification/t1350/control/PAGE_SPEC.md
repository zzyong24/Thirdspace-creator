# T1350 画布切组统一导航公共验收

与T1346同一真实公共suite验证，单独保canvas前置失败及消费者兼容组件回归。沿现公开routeRefreshScheduled，不改变任何数据/权限合同；持久任务/生成不由此冒通过。正常及最小真实画布先保存同ID读回，获准切组后真实RSC延后期间旧input消失、loading；放行后新组/canvases与已完成屏障一致。未标记事件原导航及迟到读取拒回显由真实CanvasEditor组件回归补充，不冒真人生成。

```frontend-journey-contract
{
  "schema": "frontend-journey-contract/v2",
  "task_id": "T-1350",
  "copy_guard": {
    "forbid_internal_ids": true
  },
  "required_checks": [
    {
      "id": "entity_route",
      "test_id": "t1350-canvas-owner",
      "description": "真实乙画布同组保存读回后获准切甲，旧input立即卸载，统一owner完成目标/canvases真实列表且scope甲；无重复导航挂起"
    }
  ],
  "required_conditions": [
    "loading"
  ],
  "viewports": [
    {
      "width": 1280,
      "height": 800
    },
    {
      "width": 1024,
      "height": 680
    }
  ],
  "coherence_groups": [],
  "watched_paths": [
    "frontend/src/features/creative-canvas/canvas-editor.tsx",
    "frontend/src/features/creative-canvas/canvas-editor.test.tsx",
    "frontend/tests/e2e/t1346-account-group-switch.spec.ts",
    "frontend/src/components/shell/account-switcher.tsx",
    "frontend/src/components/shell/workspace-initialization.tsx",
    "docs/verification/t1345/control/run-frozen-ui.mjs"
  ]
}
```
