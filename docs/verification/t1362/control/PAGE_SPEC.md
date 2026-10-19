# T1362 已采集作品的真实入口与数据验收

以同一fresh私有PG、真实服务及Next页面为锚。平台源为明确合成事实，不冒真人采集；初始14条种子采集再加新4条仅私有fixture建模，正式页面不得新增采集/模型。每窗口独立纯typed组执行手动确认，不重置原持久进度。

```frontend-journey-contract
{
  "schema": "frontend-journey-contract/v2",
  "task_id": "T-1362",
  "copy_guard": {
    "forbid_internal_ids": true
  },
  "required_checks": [
    {
      "id": "collected_work_entry",
      "test_id": "t1362-real-entry-catalog",
      "description": "真实首页历史作品及项目近邻入口进入当前组平台目录，合法目录与创作项目/Publication保各自数量。"
    },
    {
      "id": "member_scope_and_reentry",
      "test_id": "t1362-member-scope",
      "description": "当前组active真实成员选择、同组改账号清旧作品和cursor、切组/返回/刷新无旧数据、无效成员不读他组或偷偷回退。"
    },
    {
      "id": "truthful_work_metrics",
      "test_id": "t1362-same-id-work-metrics",
      "description": "XHS/KS真实目录及选中同account/work读取浏览/播放、0/未知与来源，粉丝记录空不冒全部数据空。"
    },
    {
      "id": "manual_review_completion",
      "test_id": "t1362-pure-typed-manual-review",
      "description": "没有legacy Project的真实typed组，从已有内容进入目录后返回手动完成，再公共读回/刷新持续，点击链接不自动完成。"
    },
    {
      "id": "overview_typed_coverage",
      "test_id": "t1362-overview-typed",
      "description": "总览当前scope浏览123/真实0、legacy样本数不变，有typed证据不误报未采集。"
    },
    {
      "id": "responsive_work_entry",
      "test_id": "t1362-entry-responsive",
      "description": "两窗口、暗色及真实浏览器200%下主要成员入口和指标可达，无新主题/假按钮，实际有限遮挡明确记录。"
    }
  ],
  "coherence_groups": [],
  "required_conditions": [
    "loading",
    "empty",
    "error",
    "repeat",
    "keyboard",
    "back",
    "refresh",
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
    "frontend/src/components/shell/account-switcher.tsx",
    "frontend/src/components/shell/account-switcher.test.tsx",
    "frontend/src/app/(creator)/accounts/works/page.tsx",
    "frontend/src/app/(creator)/accounts/works/page.test.tsx",
    "frontend/src/features/platform-account/platform-work-account-navigation.tsx",
    "frontend/src/features/platform-account/platform-work-catalog.tsx",
    "frontend/src/features/onboarding/onboarding-steps.ts",
    "frontend/src/features/onboarding/onboarding-steps.test.ts",
    "frontend/src/features/onboarding/onboarding-card.tsx",
    "frontend/src/features/onboarding/onboarding-card.test.tsx",
    "frontend/src/features/projects/projects-page.tsx",
    "frontend/src/features/projects/projects-page.test.tsx",
    "frontend/src/features/group-workspace/group-overview.tsx",
    "frontend/src/features/group-workspace/group-workspace.test.tsx",
    "frontend/tests/e2e/t1362-collected-work-entry.spec.ts",
    "frontend/playwright.t1362.config.ts"
  ]
}
```

原T1356完整首页及T1361真实迟到旧响应门独立保留，本合同不降低它们。视频号真实采集仍失败另T1363，原公众号1726首因UNKNOWN，不能由本目录/渲染验收代签。暗色/200%旧固定顶栏有限遮挡按实际像素保留，不签全页无遮挡。
