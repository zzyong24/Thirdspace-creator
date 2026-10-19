# T1371 前瞻正式界面验收合同

此合同在本次正式strict重执行前登记，不追写成此前RED/GREEN的先行合同。已发生的源与私有原件保留；当前产品源码已独立审和实际两窗通过，仍须由现有taskctl严格门在clean同源候选上实际重新执行。代表性平台输入为明确合成事实，经真实service/私有PG/Next持久与UI读回，不冒真人扫码、真实采集或已安装App；2d旧安装未替换。只见证本任务FR/AC中的实际UI链，不引入Oil/探索评分或新页面。

```frontend-journey-contract
{
  "schema": "frontend-journey-contract/v2",
  "task_id": "T-1371",
  "copy_guard": {
    "forbid_internal_ids": true
  },
  "required_checks": [
    {
      "id": "current_unknown_summary",
      "test_id": "t1371-current",
      "description": "完成current unknown经真实service保存后同scope Next总览读到真实typed123"
    },
    {
      "id": "scope_date_zero_null",
      "test_id": "t1371-scope",
      "description": "平台/账号/日期999与123、真实零值0和缺失—保留，跨组不泄漏"
    },
    {
      "id": "return_refresh",
      "test_id": "t1371-return",
      "description": "真实侧栏进入，已采集作品返回与刷新保持同账号/日期123"
    }
  ],
  "coherence_groups": [],
  "required_conditions": [
    "back",
    "refresh",
    "repeat"
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
    "backend/src/modules/platform-collection/platform-collection.service.ts",
    "backend/src/application/queries/dashboard-collected-metrics.test.ts",
    "frontend/tests/e2e/t1371-xiaohongshu-unknown-dashboard.spec.ts",
    "frontend/playwright.t1371.config.ts",
    "docs/verification/t1371/harness/seed-unknown-dashboard.mts",
    "docs/verification/t1356/harness/seed-collected-dashboard.mts",
    "docs/verification/t1355/harness/binding-fixture-server.mts",
    "docs/verification/t1370/control/run-frozen-ui.mjs"
  ]
}
```
