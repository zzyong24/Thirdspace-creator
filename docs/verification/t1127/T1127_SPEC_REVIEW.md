# T1127 当前 main analytics 整合独立 SPEC 初审

结论：**CONCERNS**。12条路径确实与共同基点逐字相同且来源不同，7条测试与5条产品的范围足够窄；封面比例、T1107日历和T1110微信明确排除。analytics、cron、自然日、ChartFrame、归属/幂等、120秒预算与原41项全局债务边界均可实施。

## REV-001 / major / testability

SPEC要求用当前main、同一数据取得1366和900宽度画面，由主Agent实际看图，并取得当前公共浏览器或组件回放证据。正式`T-1127.verify_commands`目前只有`chart-coordinates.test.tsx`和通用LED-047等命令，没有T1127专用浏览器/视觉采证入口。这样实现可能通过所有正式命令，却仍只拿来源截图或组件断言说明像素、null断开、摘要和响应式。

建议不扩大产品写集：在`docs/verification/t1127`增加当前main专用的无模型、无平台写采证入口，正式命令生成同数据1366/900工件，绑定0retry、当前source SHA及主Agent实际看图；保留现有单测、LED-047、类型、边界、timeout和reconcile。

除REV-001外未发现新增阻断。本结论未授权实施，未运行测试、浏览器、数据库或模型，也不继承来源T1106 PASS。
