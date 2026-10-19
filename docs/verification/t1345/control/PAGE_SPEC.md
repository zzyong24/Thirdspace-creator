# T1345 真实账号绑定与新用户引导验收合同

本合同在正式浏览器验收前固定；实现前的产品合同与独立评审见本任务SPEC及review记录。隔离真实公共组/账号写与读回、组件/服务受控宿主扫码链分别记录，不冒真人扫码或真实平台验证；所有见证只属本轮隔离库。正常/最小页面保持同数据，实际看图并由Root独立评审。完整非fixture旅程证明页面与公开持久数据一致；受控平台宿主证明public start/run与前端意图计数，不发起实际外部浏览器或付费。

```frontend-journey-contract
{
  "schema": "frontend-journey-contract/v2",
  "task_id": "T-1345",
  "copy_guard": {
    "forbid_internal_ids": true
  },
  "required_checks": [
    {
      "id": "first_group_entry",
      "test_id": "t1345-first-home",
      "description": "全新隔离数据根首页首屏真实确认零组零旧账号，去同一/accounts创建首组并读回后直接进入平台选择"
    },
    {
      "id": "scan_once_and_continue",
      "test_id": "t1345-click-run",
      "description": "明确平台点击到public start/run恰一次，连续同平台及不同支持平台，未知重开沿原run不重发；受控宿主边界单列"
    },
    {
      "id": "removed_and_single_row",
      "test_id": "t1345-single-row",
      "description": "三块UI完全移除、每成员单次身份呈现及对象右侧管理，能力真实读取不猜平台"
    },
    {
      "id": "group_control",
      "test_id": "t1345-group-master",
      "description": "组列表选择与当前编辑组标题/状态一致，已归档可读与恢复"
    },
    {
      "id": "member_selection",
      "test_id": "t1345-member-selection",
      "description": "切换到另一组后成员列表只显示该组或真实空态，无旧成员残留"
    },
    {
      "id": "member_detail",
      "test_id": "t1345-member-detail",
      "description": "对象管理确认对正确账号/组进行，错误与未知保输入，写后同实体读回"
    },
    {
      "id": "empty_next_action",
      "test_id": "t1345-empty-next",
      "description": "无成员仍可选择支持平台扫码或继续创作，不出现假成功"
    },
    {
      "id": "back_refresh_repeat",
      "test_id": "t1345-return",
      "description": "实际返回/刷新/重复打开仍当前组与原账号，管理/扫码回执及键盘焦点正确"
    },
    {
      "id": "responsive_and_zoom",
      "test_id": "t1345-visual",
      "description": "1366及1024真实页面、长名称/空/错误/加载、200%可用并实际看图"
    }
  ],
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
  "coherence_groups": [
    {
      "id": "groups-and-members",
      "pattern": "master-detail",
      "policy": "clear-or-reselect",
      "check_ids": {
        "collection_matches_control": "group_control",
        "selection_valid_or_empty": "member_selection",
        "detail_matches_selection_or_empty": "member_detail",
        "next_action_when_empty": "empty_next_action"
      }
    }
  ],
  "watched_paths": [
    "frontend/src/features/platform-account/account-group-manager.tsx",
    "frontend/src/features/platform-account/account-binding-panel.tsx",
    "frontend/src/features/platform-account/account-manager-interactive-region.tsx",
    "frontend/src/features/onboarding/onboarding-data.ts",
    "frontend/src/features/onboarding/onboarding-card.tsx",
    "frontend/src/features/onboarding/onboarding-steps.ts",
    "frontend/src/components/shell/account-switcher.tsx",
    "frontend/src/components/shell/workspace-initialization.tsx",
    "frontend/src/features/platform-account/account-binding-panel.test.tsx",
    "frontend/src/features/platform-account/account-group-manager.test.tsx",
    "frontend/src/features/platform-account/account-binding-public.integration.test.ts",
    "frontend/tests/e2e/t1345-account-binding-guidance.spec.ts",
    "frontend/playwright.t1345.config.ts",
    "docs/verification/t1345/control/run-frozen-ui.mjs"
  ]
}
```
