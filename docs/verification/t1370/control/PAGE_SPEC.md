# T1370 前瞻正式界面验收合同

此合同在本次正式strict重执行前登记，不追写成此前RED/GREEN的先行合同。已发生的源与私有原件保留；当前产品源码已独立审和实际两窗通过，仍须由现有taskctl严格门在clean同源候选上实际重新执行。代表性平台输入为明确合成事实，经真实service/私有PG/Next持久与UI读回，不冒真人扫码、真实采集或已安装App；2d旧安装未替换。只见证本任务FR/AC中的实际UI链，不引入Oil/探索评分或新页面。

```frontend-journey-contract
{
  "schema": "frontend-journey-contract/v2",
  "task_id": "T-1370",
  "copy_guard": {
    "forbid_internal_ids": true
  },
  "required_checks": [
    {
      "id": "inline_binding_and_removed_entries",
      "test_id": "t1370-inline",
      "description": "原平台能力表在顶部展开，对应平台行原扫码入口，冗余按钮/数据入口与不支持能力隐藏"
    },
    {
      "id": "verified_auto_close",
      "test_id": "t1370-readback",
      "description": "同run真实保存后公开账号/成员完整分页读回才关闭与轻反馈"
    },
    {
      "id": "unverified_retains_original",
      "test_id": "t1370-original-run",
      "description": "注入读回失败、unknown丢回执及真实failed保原run，显式重读不另起run"
    },
    {
      "id": "intent_and_repeated_binding",
      "test_id": "t1370-repeat",
      "description": "同平台/跨平台与两个独立组合成账号、唯一意图及返回刷新保持原归属"
    },
    {
      "id": "single_surface_and_focus",
      "test_id": "t1370-focus",
      "description": "键盘打开、唯一Dialog标题、成功后焦点回原行按钮"
    },
    {
      "id": "responsive_states",
      "test_id": "t1370-responsive",
      "description": "1366×900及1024×680旧样式，列/扫码水平可见，等待/失败/长名称可读"
    }
  ],
  "coherence_groups": [],
  "required_conditions": [
    "back",
    "refresh",
    "repeat",
    "keyboard",
    "empty",
    "error",
    "loading"
  ],
  "viewports": [
    {
      "width": 1366,
      "height": 900
    },
    {
      "width": 1024,
      "height": 680
    }
  ],
  "watched_paths": [
    "frontend/src/features/platform-account/account-group-manager.tsx",
    "frontend/src/features/platform-account/account-group-manager.test.tsx",
    "frontend/src/features/platform-account/account-binding-panel.tsx",
    "frontend/tests/e2e/t1370-platform-capability-inline-binding.spec.ts",
    "frontend/playwright.t1370.config.ts",
    "frontend/playwright.t1355.config.ts",
    "docs/verification/t1355/harness/binding-fixture-server.mts",
    "docs/verification/t1370/control/run-frozen-ui.mjs"
  ]
}
```
