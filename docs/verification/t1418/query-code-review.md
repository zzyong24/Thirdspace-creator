# T-1418 LATERAL 实现独立复核

**PASS，未发现需要修复的代码 finding。** 结论限本次两条作品指标查询和已有聚焦回归，不代表新安装候选的总览性能已达标。只读核对了通过 SPEC、两文件 diff、实际 SQL/EXPLAIN 与红绿日志；未运行测试、业务查询、安装或网络操作。另执行限定两文件的 `git diff --check`，实际退出0。未修改产品和控制面。

统计等价性已核实：

- 第1条 `CROSS JOIN LATERAL` 内只有 user/account/platform/work 四维关联，没有预过滤 assigned。子查询是无 GROUP BY 的聚合，即使零样本仍返回一行：count=0、hasOwned=false、hasUnattributed=true，保持原 LEFT JOIN 的无指标判断。只有合法其它组样本时，完整样本仍参与计算，assigned=false 而 unassigned=false，不会被误算成无指标；重叠/非法成员区间仍进入原 countMatches/invalid 守卫，维持不可归属。最终 works/unattributableWorkCount 的筛选未改。
- 第2条在四维关联与原 assigned 条件之后执行原 DENSE_RANK。分族仍是 account/work/metric_key/metric_window，排序仍是 observed_at、captured_at 的真实 timestamp；没有 LIMIT 1、ID 取胜或提前去掉 unavailable，因此同刻冲突与最新不可用不回退的行为保持。work id 是唯一主键，移动 window 到单作品子查询不会跨越原分区。
- scopedWorks 原文未改：目录 generation、public 冻结标记、允许的已完成 unknown、tombstone、发布日期和上海时区范围全部保留。账号粉丝第3条 SQL、历史成员取证、所有权校验及投影算法未改。没有新增数据库写入、schema/index 迁移或缓存。

执行计划证据与实现一致。旧 `query-probe-before.json` 的两条查询分别为429.448ms、1672.792ms，各排除1,800,600个交叉组合。新 `query-plan-green.json` 对同规模301作品/6002指标，分别为6.440ms、22.210ms；两条指标 Index Cond 均包含 user/account/platform_work_id，每作品平均约20条指标，301 loops；作品目录均只扫描1次。原先第2条6002次重复目录扫描已不再出现。这是具体 fixture 的真实计划和计时，不能推导其它数据规模、P95 或安装页面耗时；总 elapsed 包含 EXPLAIN ANALYZE 的额外执行，也不能当单次生产查询耗时。

SQL 驱动方面：继续使用原 Drizzle `sql` 参数化表达式和 `db.execute(...).rows`，未拼接外部 SQL 文本。实际 PGlite/Drizzle 执行已通过，返回别名、boolean 聚合及窗口候选形状符合原消费者。源码没有 PGlite 专用分支或 PostgreSQL 不同参数协议；本次没有外部 PostgreSQL 实跑证据，因此只确认静态兼容性与已测试的 PGlite 路径，不宣称另一驱动已经实测。

回归证据：`query-plan-red.log` 保留原真实1失败/29跳过，失败点为 work ID 没有进入指标 Index Cond；`query-plan-green.log` 完整汇总为2文件、38 PASS。新增 fixture 检查301作品、302最新候选、300个新增作品的最新时间、指标按作品索引和目录单次扫描，测试未通过改大超时来规避计划缺陷。原双端点隔离 fixture 继续覆盖 A→B→A、异用户/异组、重叠与非法成员区间、无指标、真实0/未知、最新不可用、同刻冲突、旧目录/私密/tombstone、摘要失败及读取不写业务数据。可选链修正仅适配 DashboardMetric 的 nullable platformWorkId，不改变数据断言。

`query-typecheck.log` 当前只有 backend tsc 启动文本、无错误输出；该文件单独不足以证明实际进程退出码，本报告不替执行者签静态终态。原839d7f280未达预算的安装记录保留；仍须对包含这次 SQL 修复的新包执行合同规定的同组/日期、正常/最小视口测量。

复核文件 SHA256：

|文件|SHA256|
|---|---|
|`docs/features/t1418-creator-overview-read-performance.md`|`f52b3bb934515c343fac500e773bcd4a26a62591d68ebe2de2c11b7ed811f4bc`|
|`backend/src/modules/platform-collection/platform-collection.service.ts`|`51526df90c463bb75600888ebf0c1709a3f5b3ec6e7c5ece73b71b0cf591ea00`|
|`backend/src/application/queries/dashboard-collected-metrics.test.ts`|`cf646f042901a7791ee87190a7be860311e98895ee68f361bc06c4ef0f3a92f3`|
|`docs/verification/t1418/query-probe-before.json`|`987c27f062b63b2258869632210419aba7f7908814629cb85c942ce9eb76c3cd`|
|`docs/verification/t1418/query-plan-red.log`|`101df883c584f18ab0aff3b487e8b3b4d8fe68291421cf54f834a1cd34e40dbc`|
|`docs/verification/t1418/query-plan-red.json`|`b2c7041690cccb4c3c17454f999afbdedcfb76c26a0d59ac45b0d6af831dafa7`|
|`docs/verification/t1418/query-plan-green.log`|`012b352bd6478fe64b740c12b587e250d4abdc49145ca9861ee4ed5b5fc0870f`|
|`docs/verification/t1418/query-plan-green.json`|`2476b668c61c4ed487c623239395324e8ce0184b51e14727b2609d64b33e3c6b`|
|`docs/verification/t1418/query-typecheck.log`|`30d0af1e99767f574fb68c5344685b3f009842cc2b095e36e65795b8692aca74`|
