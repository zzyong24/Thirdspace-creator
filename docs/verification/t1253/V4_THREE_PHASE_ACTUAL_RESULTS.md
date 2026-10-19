# T1253 V4 当场执行结果

原 25 项完成 25 PASS、0 FAIL、0 SKIP；原 9 文件 46 项完成 46 PASS、0 FAIL、0 SKIP。两组包含重复用例，不能相加。原首轮 8 红、两观察轮 17/8、V3 的 23/2 与 44/2 均保留，不重写历史回执。

V4 仅校准两处真实数据形状：draft 将输入/输出及完整细项 usage 作独立严格比较，调用账本 totalTokens 仍严格为 5；ports 严格失败通报包含原消费者保留的自有 retryAfterMs: undefined 字段。没有改生产、SPEC、原 res.destroy/模型响应、请求数、未知保护、父子身份、预留账本/预算、正式结果 0 或成功分支。完整原文件执行，后续原正式 partial/流回放/总账断言均实际到达并通过，不由局部 helper 推测。

proper backend 与 ai-worker 类型检查分别 exit 0，耗时 39354ms 与 7088ms。25 项子进程 75590ms、外层 77345.999541ms；46 项子进程 137042ms、外层 138708.116083ms；类型外层 47713.386ms。

三轮实际 sourceActualUnchanged/source guard 均成立，自有子进程已关闭、自有进程组为空、signals=[]、临时根清理完成。源码及安装实现完整绑定 3035 输入、3888 实现文件，原入口预算与 helper 生命周期保留；完整原 JSON/log、源前后及退出回执均在相应 execution 目录，逐文件 SHA 见同名 JSON。

证据是受控模型、真实 Worker 子进程/服务端口与临时数据库回归。它不证明官方账号整链、全部功能真机、原生 App 或已安装交付版本通过；frontend 原历史四类型错误和 T1254 两旧默认预算门由各自任务保留处理。
