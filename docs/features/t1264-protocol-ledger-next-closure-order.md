# T-1264 修复协议账本读取前Next元数据恢复顺序

当场protocol7原自动ledger子进程自然exit1：ledgerOnly在SQL之前执行完整runtime verify，被frontend/tsconfig.json拒绝。launcher对protocol为保独立PG跳过pre-ledger全stop，Next仍在运行；Next退出后严格恢复原metadata，最终source/runtime verify均无error，恢复后的tsconfig与expected SHA895dc494相同。失败当时actual SHA/bytes没有捕获，必须保持UNKNOWN，禁止用恢复后SHA或推导字节回填历史。证据docs/verification/t1261/db4669-incremental/protocol-ledger-tsconfig-order.json SHA5b59a518406bc5d79bea557100e29a49f4bffaab138996015453357f4e7c3688。不是本轮冻结SOURCE漂移的证明。

正式写集仅冻结树docs/verification/t1246/round-3/new-v3/driver/launch.cjs及相邻本叶生命周期回归/证据，原verify-binding、产品backend/worker、PG身份守卫保持原字节。先独评再改源，应用前所有当前profile真实闭合。目标顺序：按本轮持有身份精准关闭Next及其Worker并证明stdio/日志/实际子进程组闭合，恢复仅本轮Next生成metadata；保留同一已注册PG实例及birth/UID/port/dataDir身份；执行原完整source/runtime verifier与原只读SQL账本；最后完整关闭PG。禁止直接把全stop移到ledger前、宽泛豁免tsconfig、删source guard、放宽PID/PG身份或开第二实例补账。stopPromise/清理子集合必须模式明确，选择性关闭不能等待保留PG的close而死锁，未证明资源闭合仍失败。

先在未修原公共launcher/ledger链真实RED，保原输出；GREEN需真实Next产生元数据且PG同身份保留、完整verify→只读SQL→最终资源关闭。覆盖有效protocol、Next失败/元数据恢复失败、错PID/PG与取消、PGlite非protocol原顺序不变。单元/helper不能代公共链。真实完整协议7/原账本再次执行，原7FAIL和自动缺失不覆盖。正执行/观察至少120秒且原更长预算不降，原单epoch/futureCore所有清理槽必须按实际完整串行/重试核算、不能续原任务deadline。保原自动账本缺失、官方模型/原103分母、App未验；pmem/reconcile/taskctl依实证收尾。

```mermaid
flowchart LR
 A[原实际失败] --> B[窄范围独立评审]
 B --> C[公共链真实红测与集中修复]
 C --> D[开发包及完整独立复验]
 D --> E[人查看结果和明确未验项]
```
