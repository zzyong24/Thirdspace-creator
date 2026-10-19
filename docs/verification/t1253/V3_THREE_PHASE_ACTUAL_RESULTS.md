# T1253 V3 当场执行结果

原 25 项完成 23 PASS、2 FAIL；原 9 文件 46 项完成 44 PASS、2 FAIL，均无 SKIP。两组包含重复用例，不能相加。失败都是同两处回执形状：draft 的规范 usage 没有独立 totalTokens 字段，而调用账本 totalTokens 仍为 5；ports 的失败通报含自有 retryAfterMs: undefined 字段。保留严格断言和原完整日志，V4 仅在私有目录待独立复核。

proper backend 与 ai-worker 类型检查分别 exit 0，耗时 40012ms 与 7524ms。25 项子进程 74332ms、外层 76262.20875ms；46 项子进程 133051ms、外层 134325.293167ms；类型外层 49821.841667ms。

三轮实际 sourceActualUnchanged/source guard 均成立，自有子进程已关闭、自有进程组为空、signals=[]、临时根清理完成。完整原 JSON/log、源前后及退出回执均在相应 execution 目录，逐文件 SHA 见同名 JSON。原首轮 8 红与两次观察 17/8 仍保留。

证据是受控模型、真实 Worker 子进程/服务端口与临时数据库回归。它不证明官方账号整链、全部功能真机、原生 App 或已安装交付版本通过。
