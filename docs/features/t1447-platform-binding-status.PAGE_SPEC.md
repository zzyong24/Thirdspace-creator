# 平台绑定状态显示

在原“平台能力”表的平台名与扫码按钮之间加入“绑定状态”，逐个列出当前成员账号。保留原字号、紫色按钮、白色面板及表格局部横滚。未绑定显示未绑定；身份未验证、已隐藏、绑定待确认不显示绿色登录结果。已知结果显示最近验证有效或需要重新登录及真实时间，未知显示登录待验证。脚注明确最近检测，不承诺实时在线。

“刷新绑定状态”始终对应当前所选自有组的一次只读读取。加载显示登录状态读取中；失败保留成员名并提示登录状态未确认，按钮可重读。切组立即清旧结果，迟到响应丢弃；绑定成功后的状态读取失败不影响保存成功。原扫码和进入账号组入口继续有效。

桌面1440×900与窄窗口390×844验证：公开操作创建的实际隔离账号组及同平台两个未验证账号，切空组不会出现旧账号；刷新、重复、加载、真实故障注入后恢复。故障只拦截本验收页的只读请求，不伪造登录成功。真实授权有效/失效由后端PGlite集成及React逻辑独立核对；本旅程不冒充真人扫码。

```frontend-journey-contract
{
  "schema": "frontend-journey-contract/v2",
  "task_id": "T-1447",
  "copy_guard": {
    "forbid_internal_ids": true
  },
  "watched_paths": [
    "frontend/src/features/platform-account/account-group-manager.tsx",
    "frontend/src/features/platform-account/account-group-binding-status.tsx",
    "frontend/src/features/platform-account/account-group-binding-status.test.tsx",
    "frontend/src/features/platform-account/account-group-manager.test.tsx",
    "frontend/src/server/persistence-client.ts",
    "frontend/src/app/api/v1/dispatch/route.ts",
    "backend/src/modules/platform-account/account-binding-status.service.ts",
    "backend/src/modules/platform-account/account-group.transport.ts",
    "backend/src/modules/platform-collection/platform-collection.service.ts",
    "contract/src/resources/account-groups.ts",
    "contract/src/operations/account-groups.ts",
    "docs/verification/t1447/browser-verify.mjs"
  ],
  "required_checks": [
    {
      "id": "collection",
      "test_id": "binding-status:collection"
    },
    {
      "id": "selection",
      "test_id": "binding-status:selection"
    },
    {
      "id": "detail",
      "test_id": "binding-status:detail"
    },
    {
      "id": "empty-action",
      "test_id": "binding-status:empty-action"
    },
    {
      "id": "refresh",
      "test_id": "binding-status:refresh"
    },
    {
      "id": "failure-recovery",
      "test_id": "binding-status:failure-recovery"
    }
  ],
  "required_conditions": [
    "loading",
    "empty",
    "error",
    "refresh",
    "repeat"
  ],
  "viewports": [
    {
      "width": 1440,
      "height": 900
    },
    {
      "width": 390,
      "height": 844
    }
  ],
  "coherence_groups": [
    {
      "id": "selected-account-group",
      "pattern": "master-detail",
      "control": "账号组列表",
      "collection": "组内当前成员",
      "selection": "选中账号组",
      "detail": "平台绑定状态表",
      "transition": "切换自有账号组",
      "policy": "clear-or-reselect",
      "check_ids": {
        "collection_matches_control": "collection",
        "selection_valid_or_empty": "selection",
        "detail_matches_selection_or_empty": "detail",
        "next_action_when_empty": "empty-action"
      }
    }
  ]
}
```
