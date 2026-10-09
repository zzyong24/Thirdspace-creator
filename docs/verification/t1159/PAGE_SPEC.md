# T1159 微信原生报表页面验收合同

保留账号组原方向。从组内手工登记、身份未验证的微信账号进入真实原生报告页：fresh隔离PGlite/auth、实际公开dispatch、scheduler关闭且无外网。真实reports.list=0，刷新/重复/返回保持实际账号与0；实际同步应SCOPE_MISSING且不创建run/浏览器。手工登记不是扫码验证。本页旅程不使用route模拟成功业务，也不签真人报表、扫码或原生App。

正常有报告、表数据0/null/部分/单位、取消与过期响应另由当前组件/隔离service验证，明确合成来源。独立视觉和任务走查在初版稳定后执行，不继承来源图。主操作是同步，身份缺失显示同位置恢复提示，旧报告和任务不被错误清空，长表按需展开/局部横滚。

```frontend-journey-contract
{"schema":"frontend-journey-contract/v2","task_id":"T-1159","copy_guard":{"forbid_internal_ids":true},"watched_paths":["frontend/src/app/(creator)/accounts/works/page.tsx","frontend/src/features/platform-account/account-binding-panel.tsx","frontend/src/features/platform-account/account-group-manager.tsx","frontend/src/features/platform-account/native-report-panel.tsx","frontend/src/features/platform-account/platform-account-labels.ts","frontend/tests/e2e/t1159-wechat-native-report.spec.ts","docs/verification/t1159/run-report-journey.mjs"],"required_checks":[{"id":"AC-REPORT-ENTRY","test_id":"TEST-T1159-REPORT"},{"id":"AC-UI","test_id":"TEST-T1159-REPORT"}],"required_conditions":["refresh","repeat","back"],"viewports":[{"width":1366,"height":900},{"width":900,"height":900},{"width":390,"height":900}],"coherence_groups":[]}
```
