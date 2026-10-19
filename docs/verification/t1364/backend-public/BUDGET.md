# T1364 固定预算及完成点

预算是允许的最坏执行包络，不能解释为正常耗时，也不能据原125.447秒失败猜超时首因。

|真实消费者|毫秒|
|---|---:|
|host lifecycle 排队|120000|
|source STARTUP（包含原guard及启动余量）|1120000|
|source初始主页goto|120000|
|production identity goto+字段观察|600000|
|有限导航观察|120000|
|两张viewport PNG|240000|
|物理关闭|120000|
|source整体completionWaitMs结算余量|10000|
|完整执行小计|2450000|
|backend scope/私有manifest及索引结算|120000|
|最终终端余量|10000|
|唯一全局包络|2580000|

backend只冻结一次startedAt/globalDeadline；source继承startedAt+2450000，backend结算最迟到globalDeadline−10000。先前2570000漏计source自身aggregate10000，当前补足只适用于新run，不续原任务。原CLI POST 8100000及无凭据观察8280000足够，未改其默认。

manifest及result.prepared为私有异步准备；最终scope读取完成后，在同一无await段复核原signal、绝对deadline与canonical目录，以renameSync提交有效result.json。提交点前取消只提交无图隔离摘要；提交点后取消不倒改已完成事实。实停与租约释放各自只有实际事件成功才为true，auditReceipt存在不代签任何停止。

公共六用例每例及before/after hook为2700000；Python子进程外层21780000覆盖六串行用例、两hook、120000清理及60000余量。公开测试使用真实CLI SDK/HTTP、生产Next adapter及同业务链；不是已安装Next路由实测。
