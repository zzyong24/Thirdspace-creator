# T1356 既有采集事实的首页展示验收合同

本合同在正式UI验收前固定，当前没有本轮浏览器PASS。以隔离真实本机身份/持久服务建立合成平台目录与typed指标，不访问/改写用户原数据，不发平台采集或假造Publication/Project。seed、公开groupOverview和页面同实体同日期核对，统计值不是平台新采集实绩。

原上方5项summary保留，浏览作为独立第6项；下方既有六卡与独立自然日报链不变。数据由合同元数据而非UI猜测语义，最终像素需实际正常/最小/暗色/200%与独立评审。任何受控错误只证明本次局部失败路径，不能假称真实平台失败。原全局审计失败与本批新drift分列。

```frontend-journey-contract
{
  "schema": "frontend-journey-contract/v2",
  "task_id": "T-1356",
  "copy_guard": {
    "forbid_internal_ids": true
  },
  "required_checks": [
    {
      "id": "typed_metrics_same_scope",
      "test_id": "t1356-existing-collected",
      "description": "合成持久目录/typed指标经真实groupOverview→首页，同组/账号/日期读回一致；XHS窗内与KS旧窗口均能显示已知值，0与未知保持区别"
    },
    {
      "id": "truthful_metric_semantics",
      "test_id": "t1356-metric-semantics",
      "description": "浏览/视频播放/文章阅读分开；累计不冒日增；原项目/发布/待分发指标不变，新浏览summary独立，历史真实XHS发布行用浏览措辞"
    },
    {
      "id": "frozen_group_attribution",
      "test_id": "t1356-frozen-attribution",
      "description": "metric服务端immutable ingestedAt按member历史区间归属，转组A旧事实/B新事实排他，跨组重叠/无metric不猜；真实引用只对原链已贡献同key排重"
    },
    {
      "id": "error_and_other_cards",
      "test_id": "t1356-local-error",
      "description": "摘要失败保旧合法指标/其它工作台卡和原日报图卡，不假报全空、不启动采集；最新不可用保持未知而非回旧数"
    },
    {
      "id": "filters_and_navigation",
      "test_id": "t1356-filters",
      "description": "真实平台/账号/合法日期筛选、返回刷新/切组晚回与URL/public readback一致，不将日期窗外数据冒本窗指标"
    },
    {
      "id": "responsive_caption",
      "test_id": "t1356-responsive",
      "description": "1366/1024暗色、实际200%下6项summary/下方既有六卡可读，用户caption简洁保累计来源，不展示混合技术分母"
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
    "loading",
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
  "watched_paths": [
    "backend/src/application/queries/group-workspace.ts",
    "backend/src/application/queries/dashboard-collected-metrics.ts",
    "backend/src/modules/platform-account/account-group.service.ts",
    "backend/src/modules/platform-collection/platform-collection.service.ts",
    "contract/src/pages/group-workspace.ts",
    "frontend/src/server/persistence-client.ts",
    "frontend/src/app/(creator)/page.tsx",
    "frontend/src/features/dashboard/dashboard-page.tsx",
    "frontend/src/features/dashboard/dashboard-page.test.tsx",
    "frontend/src/features/dashboard/dashboard-trend-card.tsx",
    "frontend/src/features/dashboard/dashboard-trend-card.test.tsx",
    "frontend/src/components/analytics/horizontal-bars-chart.tsx",
    "frontend/tests/e2e/t1356-collected-metrics.spec.ts",
    "frontend/playwright.t1356.config.ts"
  ]
}
```

跨组重叠保护由真实后端公共组合测试覆盖；浏览器只构造合法transfer历史与无metric事实，不注入损坏membership冒公共成功。摘要错误场景仅在严格核验的fresh私有PG最后临时rename指标表，finally恢复并重读原值；不是用户库或生产hook。
