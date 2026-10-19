# T1361 真实导航收尾的窄公共验收

本任务是现有刷新行为修复，不是页面重设计。最终锚为实际Next与私有服务同ID；旧async mock有限，不作浏览器替身。两窗口只验证当前导航/旧响应/重新进入合同；T1356原暗色/200%/六卡/真实SQL降级八条件合同仍全部要求实际通过，本窄合同不替代它。

原Response-stage观察两读body SHA不同保持未知；前置红例与临时日志撤净记录独立保存。最终不修改请求Cookie/headers或响应body，不拼Flight。只从真实终态响应递归解析workspace/initialScope；不可解析标UNKNOWN不猜。平台事实均合成、0真实采集或模型/用户任务动作。

```frontend-journey-contract
{
  "schema": "frontend-journey-contract/v2",
  "task_id": "T-1361",
  "copy_guard": {
    "forbid_internal_ids": true
  },
  "required_checks": [
    {
      "id": "latest_group_after_old_terminal",
      "test_id": "t1361-real-next-final-scope",
      "description": "真实A原响应完成/取消后B真实服务端范围与可见数据完成，存储/Cookie/URL/实际页同组，不能仅HTTP200或本地选择当完成"
    },
    {
      "id": "single_navigation_owner",
      "test_id": "t1361-navigation-owner",
      "description": "已提交/待完成筛选及清理目标同异URL下唯一既有owner完成切组，原query清理保持，不补拼Flight/强制complete"
    },
    {
      "id": "old_scope_hidden_and_exclusive",
      "test_id": "t1361-old-scope-exclusion",
      "description": "切B等待时旧A内容不可见，原A终态后只显示B，解析实际workspace字段而非全响应字符串匹配"
    },
    {
      "id": "public_reentry_and_same_scope",
      "test_id": "t1361-real-reentry",
      "description": "真实键盘选择、重复/反向、返回刷新和空组正常进入，原same-scope操作无不必要卸载；错误/脏稿保护由现组件和原相关公共保护分层引用"
    }
  ],
  "coherence_groups": [],
  "required_conditions": [
    "loading",
    "repeat",
    "keyboard",
    "back",
    "refresh",
    "empty"
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
    "frontend/src/components/shell/workspace-initialization.tsx",
    "frontend/src/components/shell/workspace-initialization.test.tsx",
    "frontend/tests/e2e/t1361-pending-filter-workspace-refresh.spec.ts",
    "frontend/playwright.t1361.config.ts"
  ]
}
```

错误可恢复、脏稿/取消保存与驻留后台归属的现保护按实际受影响调用链定向运行；没有发生的公共输入族不得补成PASS。全局41ERROR与新增宽路径收据漂移继续分类保留，修复后仍须当前完整合同/strict，未满足不完成任务。
