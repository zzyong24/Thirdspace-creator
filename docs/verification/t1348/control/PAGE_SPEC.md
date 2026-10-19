# T1348 真实工作区旅程合同

实现前SPEC已独审；本验收合同在正式浏览器矩阵运行前固定。沿全新私有PGlite/media/auth根，public组与项目真实创建/保存/回读，延迟真实RSC只控制交付时序不替换领域数据。正常1280×800与宿主minimum1024×680分别执行，原RED保。后台未启动新模型或采集，0取消/0模型证据不冒后台任务自然完成；同scope编辑与新scope离开分别验证。只有实际看过的图和完成的操作才进入PASS。

```frontend-journey-contract
{
  "schema": "frontend-journey-contract/v2",
  "task_id": "T-1348",
  "copy_guard": {
    "forbid_internal_ids": true
  },
  "required_checks": [
    {
      "id": "rich_dirty_cancel",
      "test_id": "t1348-rich_dirty_cancel",
      "description": "rich关闭autosave真实编辑后切组先确认，取消逐字保稿、scope/路由不变、无额外保存"
    },
    {
      "id": "structure_dirty_cancel",
      "test_id": "t1348-structure_dirty_cancel",
      "description": "structure真实编辑后同样确认与取消保持"
    },
    {
      "id": "saving_guard",
      "test_id": "t1348-saving_guard",
      "description": "两现保存状态dirty/saving注册，saved/卸载释放、不误清其它活动，保存中切组提示保护"
    },
    {
      "id": "confirmed_leave",
      "test_id": "t1348-confirmed_leave",
      "description": "用户明确仍切后沿新scope真实完成协议进入目标列表，未保存草稿不冒自动恢复"
    },
    {
      "id": "scope_saved_return",
      "test_id": "t1348-scope_saved_return",
      "description": "返回原组只显示真实已保存正文，原数据归属与同scope刷新保实例合同不改"
    }
  ],
  "required_conditions": [
    "repeat",
    "keyboard",
    "back",
    "refresh"
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
    "frontend/src/features/script/script-rich-editor.tsx",
    "frontend/src/features/script/script-structure-view.tsx",
    "frontend/src/features/script/script-rich-editor.test.tsx",
    "frontend/src/features/script/script-structure-view.test.tsx",
    "frontend/src/components/shell/account-switcher.tsx",
    "frontend/src/components/shell/workspace-initialization.tsx",
    "frontend/tests/e2e/t1346-account-group-switch.spec.ts",
    "frontend/playwright.t1346.config.ts",
    "docs/verification/t1345/control/run-frozen-ui.mjs"
  ]
}
```
