# T1346 真实工作区旅程合同

实现前SPEC已独审；本验收合同在正式浏览器矩阵运行前固定。沿全新私有PGlite/media/auth根，public组与项目真实创建/保存/回读，延迟真实RSC只控制交付时序不替换领域数据。正常1280×800与宿主minimum1024×680分别执行，原RED保。后台未启动新模型或采集，0取消/0模型证据不冒后台任务自然完成；同scope编辑与新scope离开分别验证。只有实际看过的图和完成的操作才进入PASS。

```frontend-journey-contract
{
  "schema": "frontend-journey-contract/v2",
  "task_id": "T-1346",
  "copy_guard": {
    "forbid_internal_ids": true
  },
  "required_checks": [
    {
      "id": "switch_pending",
      "test_id": "t1346-switch_pending",
      "description": "scope切换后侧栏立即更新、旧内容清零、加载屏障可见且未因layout先提交过早放行"
    },
    {
      "id": "switch_settled",
      "test_id": "t1346-switch_settled",
      "description": "真实新scope RSC完成后仅目标组的首页/项目/绑定内容可见"
    },
    {
      "id": "aba_order",
      "test_id": "t1346-aba_order",
      "description": "A-B-A及延迟旧RSC放行不覆盖当前组"
    },
    {
      "id": "entity_route",
      "test_id": "t1346-entity_route",
      "description": "获准切换的project/canvas实体详情转对应列表，静态new/create与合法模板筛选保"
    },
    {
      "id": "scope_collection",
      "test_id": "t1346-scope_collection",
      "description": "侧栏当前组与组筛选/列表集合一致"
    },
    {
      "id": "scope_selection",
      "test_id": "t1346-scope_selection",
      "description": "binding manager旧显式组选择切scope后不残留"
    },
    {
      "id": "scope_detail",
      "test_id": "t1346-scope_detail",
      "description": "所见项目/成员/空态属于当前组"
    },
    {
      "id": "scope_empty",
      "test_id": "t1346-scope_empty",
      "description": "空组有真实下一步，归档组不在切换菜单，刷新/返回恢复"
    },
    {
      "id": "public_other_pages",
      "test_id": "t1346-public_other_pages",
      "description": "素材/知识/选题/雷达/发布/定位/账号数据页实际锚点与scope正确，无错误空壳"
    },
    {
      "id": "same_scope_preservation",
      "test_id": "t1346-same_scope_preservation",
      "description": "同scope刷新保编辑器实例/未发送内容，dirty切组由T1348同矩阵实际确认保护"
    }
  ],
  "required_conditions": [
    "back",
    "refresh",
    "repeat",
    "loading",
    "empty",
    "error",
    "keyboard"
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
  "coherence_groups": [
    {
      "id": "workspace-content",
      "pattern": "master-detail",
      "policy": "clear-or-reselect",
      "check_ids": {
        "collection_matches_control": "scope_collection",
        "selection_valid_or_empty": "scope_selection",
        "detail_matches_selection_or_empty": "scope_detail",
        "next_action_when_empty": "scope_empty"
      }
    }
  ],
  "watched_paths": [
    "frontend/src/components/shell/account-switcher.tsx",
    "frontend/src/components/shell/workspace-initialization.tsx",
    "frontend/src/components/shell/account-switcher.test.tsx",
    "frontend/src/components/shell/workspace-initialization.test.tsx",
    "frontend/tests/e2e/t1346-account-group-switch.spec.ts",
    "frontend/playwright.t1346.config.ts",
    "docs/verification/t1345/control/run-frozen-ui.mjs"
  ]
}
```
