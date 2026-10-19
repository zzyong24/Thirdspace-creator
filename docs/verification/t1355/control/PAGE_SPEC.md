# T1355 本地绑定完成流程验收合同

本合同在正式浏览器执行前固定，当前没有浏览器PASS。现有主题/tokens沿用，不开启新风格。真实平台宿主不得启动；合成身份通过真实public binding service和隔离持久数据完成，再由实际页面上的Panel/manager核验。必须在证据中分开标出受控宿主、UI运输夹具和真实鉴权HTTP路径，不能把响应替身说成正式服务，也不能把已存数据冒新真人扫码。NativeReport恢复链使用真实组件与受控服务，不能触实际采集。

列表完整性、成功后的自动回位、未知原任务、历史恢复与同账号授权均由正式SPEC决定；本合同不扩大授权。各checkpoint保存同run/account/group关联、状态/计数、可见文案、视口及条件，原失败与新结果分开。正式源冻结后在干净候选执行；主树混合源的局部测试不可冒候选/安装通过。

```frontend-journey-contract
{
  "schema": "frontend-journey-contract/v2",
  "task_id": "T-1355",
  "copy_guard": {
    "forbid_internal_ids": true
  },
  "required_checks": [
    {
      "id": "verified_auto_close",
      "test_id": "t1355-verified-close",
      "description": "当前平台明确点击一次启动，受控宿主经真实public binding服务写后同run/account/member/完整列表核验才自动关闭，焦点回位与新成员读回；清楚标注非真人扫码"
    },
    {
      "id": "unverified_retains_original",
      "test_id": "t1355-retain-run",
      "description": "详情/成员/列表失败或在途保原Dialog与run，重读恢复且不重启；第101+账号通过真实meta完整分页可见"
    },
    {
      "id": "intent_and_repeated_binding",
      "test_id": "t1355-repeat",
      "description": "同平台及不同平台连续绑定各唯一run；历史成功、活跃run、unknown、StrictMode和scope晚回按原意图处置，不误关新表面"
    },
    {
      "id": "single_surface_and_focus",
      "test_id": "t1355-single-surface",
      "description": "Dialog单一标题，核验成功无扫码/刷新/继续冗余动作；键盘触发/取消/自动关闭焦点与轻反馈清楚"
    },
    {
      "id": "responsive_states",
      "test_id": "t1355-responsive",
      "description": "1366与1024正常暗色及实际200%下等待/失败/unknown/长账号名可读可操作，实际历史返回与刷新保持同组同成员"
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
    "frontend/src/features/platform-account/account-binding-panel.tsx",
    "frontend/src/features/platform-account/account-group-manager.tsx",
    "frontend/src/features/platform-account/native-report-panel.tsx",
    "frontend/src/features/platform-account/account-binding-panel.test.tsx",
    "frontend/src/features/platform-account/account-group-manager.test.tsx",
    "frontend/src/features/platform-account/native-report-panel.test.tsx",
    "frontend/tests/e2e/t1355-binding-dialog-completion.spec.ts",
    "frontend/playwright.t1355.config.ts"
  ]
}
```

NativeReport授权恢复由SPEC AC1355-4另以当前真实组件/原key与同账号、历史成功0采集的定向测试验收，不把这些非浏览器结果写成browser checkpoint。正式页面旅程只见证其实际操作的manager/Panel。
