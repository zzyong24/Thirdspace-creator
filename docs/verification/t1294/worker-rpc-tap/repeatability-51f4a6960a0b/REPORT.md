# 原close字节下8轮独立零回合实验

实际controlled 8/8成功；4次前置status中3成功、**第7轮status返回CODEX_RPC_REJECTED**。不称8轮全绿，不解释为旧错误根因已解。

| 轮次 | 独立流程 | status | controlled |
|---|---|---|---|
| 1 | status-then-controlled | OK | OK |
| 2 | controlled-only | — | OK |
| 3 | status-then-controlled | OK | OK |
| 4 | controlled-only | — | OK |
| 5 | status-then-controlled | OK | OK |
| 6 | controlled-only | — | OK |
| 7 | status-then-controlled | CODEX_RPC_REJECTED（method/code未取得） | OK |
| 8 | controlled-only | — | OK |

真实owned Next59136/PID92329的Codex runtime白名单环境由KERN_PROCARGS2内存提取，HOME/CODEX_HOME保持原值，不落环境值/账号/config/帧。每轮新hash cwd；调用原createControlledCodexSession(nativeImages=false)，成功立即close，不调用thread/start/turn/start；前置status使用原正常codex-status-worker.cjs，由owned Node wrapper只记录进程PID/close并拒绝任何线程/回合请求。模型、付费、业务任务、用户DB操作0。没有重试失败的第7 status。

第7 status原生产端口只返回errorCode，method/rpcCode未透传；本runner未记录其帧，无法追补安全数字码，也不能假称account/read拒绝。该轮随后独立controlled请求全部OK。下一版候选只补内存id→固定method及错误码投影，不重放本轮失败。

controlled源码在loop前一次import，此时protocol SHA9cbc438bf97444108f58a4483e52ddb07fb6b6d2fcd16887a5b6577bbeda348e；匹配启动SHA的源副本见source-snapshot/SOURCE_SNAPSHOT_BINDING。Root在实验中获准修改TS，sourceAfter漂移如实保留；不影响已加载旧模块。status每轮加载原正常bundle39980c828fd29bb761c2e45e24f98328666f5e07bcb0286759117debe2c715bc，结束前未build变化。

每RPC仍120000ms；controlled外层960000ms覆盖版本检查与5串行RPC/启动余量；status保原120000ms deadline、ready观察120000ms及结果观察260000ms，最后每类退出观察120000ms。8轮不含自动重试。close原字节的producer退出观察均完整等120000ms且Node close事件标志false；本版使用disconnect，**不同于RequestIo.stop的terminate+awaitclose**，不能签正常stop等价。

但最终独立kill(pid,0)证明所有记录原生子进程/4 producer及launcher/runner/esbuild共57项均ESRCH，PID_ABSENCE_OBSERVATION.json保精确PID与时间。未仍活者，无需杀已消失进程；不拿absence重写原close事件false。8轮实际SDK/进程已结束，已通知Root解除dist冻结，可正常build和关闭59136。未删除原失败/数据，未改正式source/dist/control，后续v2只候选不运行，等Root正常build/full10结束再单独批准。
