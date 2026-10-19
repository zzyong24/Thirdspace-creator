# T1347 真实首页原生日图验收合同

实现前SPEC及round2独审见任务原件。本验收合同在正式候选浏览器运行前固定，不冒此前Vite组件图或共享源码测试已是候选通过。八族合成事实经候选自身backend seed落私有PGlite并关闭连接，再启动真实Next首页与public endpoint读取；不是HTTP成功mock，不是真人采集。正常1366×900与最小1024×680、局部故障/晚回、原生Chrome200%分checkpoint取证。只有实际执行并看过的图才能进入最终报告。

```frontend-journey-contract
{
  "schema": "frontend-journey-contract/v2",
  "task_id": "T-1347",
  "copy_guard": {
    "forbid_internal_ids": true
  },
  "required_checks": [
    {
      "id": "SCOPE",
      "test_id": "t1347-scope",
      "description": "当前账号组与真实public日报结果一致，筛选与切组后无旧数据"
    },
    {
      "id": "SINGLE_CARD",
      "test_id": "t1347-single-card",
      "description": "概览只一层卡，完整工作台其它内容保留"
    },
    {
      "id": "METRIC_TRUTH",
      "test_id": "t1347-metric-truth",
      "description": "真实每日/单日/稀疏/零/null及无日报累计回退和公众号未知口径不混淆"
    },
    {
      "id": "OTHER_CARDS",
      "test_id": "t1347-other-cards",
      "description": "日报延迟或失败只影响图卡，工作台其它卡与切组transition已完成"
    },
    {
      "id": "STALE_SCOPE",
      "test_id": "t1347-stale-scope",
      "description": "实际菜单A-B-A与晚返回拒旧scope，不复用旧图"
    },
    {
      "id": "FILTER",
      "test_id": "t1347-filter",
      "description": "平台/账号/快捷日期及返回刷新采用实际路由与所属实体"
    },
    {
      "id": "HOVER_DATE",
      "test_id": "t1347-hover-date",
      "description": "真实图上hover和单日日期/单位/零轴可读，截图实际独评"
    },
    {
      "id": "THEME_ZOOM",
      "test_id": "t1347-theme-zoom",
      "description": "正常/最小暗色与原生Chrome200%实际图和操作可用"
    }
  ],
  "required_conditions": [
    "loading",
    "error",
    "empty",
    "back",
    "refresh",
    "repeat",
    "keyboard",
    "zoom"
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
  "coherence_groups": [
    {
      "id": "trend-workspace",
      "pattern": "master-detail",
      "policy": "clear-or-reselect",
      "check_ids": {
        "collection_matches_control": "SCOPE",
        "selection_valid_or_empty": "FILTER",
        "detail_matches_selection_or_empty": "METRIC_TRUTH",
        "next_action_when_empty": "OTHER_CARDS"
      }
    }
  ],
  "watched_paths": [
    "backend/src/application/queries/group-workspace.ts",
    "backend/src/application/queries/group-workspace.test.ts",
    "backend/src/application/queries/dashboard-native-trend.ts",
    "backend/src/application/queries/dashboard-native-trend.test.ts",
    "contract/src/pages/group-workspace.ts",
    "contract/tests/group-dashboard-native-trend.test.ts",
    "frontend/src/server/persistence-client.ts",
    "frontend/src/app/(creator)/page.tsx",
    "frontend/src/features/dashboard/dashboard-page.tsx",
    "frontend/src/features/dashboard/dashboard-page.test.tsx",
    "frontend/src/components/analytics/views-trend-chart.tsx",
    "frontend/src/components/analytics/chart-coordinates.test.tsx",
    "contract/src/operations/pages.ts",
    "backend/src/modules/query-services/query-services.transport.ts",
    "frontend/src/features/dashboard/dashboard-trend-card.tsx",
    "frontend/src/features/dashboard/dashboard-trend-card.test.tsx",
    "contract/src/workspace-operation-scope.ts",
    "contract/src/cli-policy.ts",
    "contract/src/observability.ts",
    "contract/src/observability-registry.json",
    "contract/src/resources/assistant-system.ts",
    "frontend/src/server/__module_integration__/query-services.contract.test.ts",
    "contract/tests/endpoint-bootstrap.test.mjs",
    "contract/tests/registry.test.ts",
    "contract/src/index.ts",
    "docs/verification/t1347/seed-native-fixture.mts",
    "docs/verification/t1347/ui-playwright.config.mts",
    "docs/verification/t1347/ui-public-probe.spec.mts",
    "docs/verification/t1345/control/run-frozen-ui.mjs"
  ]
}
```
