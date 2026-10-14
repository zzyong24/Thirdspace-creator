# T1290 当前正式源原三迁移测试：完整76实际通过

正式Main `c9a8b6aa503a89356ce6aba34e79444166a54f57` 的原三文件已当场 **3 files PASS /76 PASS /0 FAIL**，retry0/maxWorkers1/body与hook180000ms，耗时 **472.37s**；真实 **nodeExit0 /postgresExit0**。原无显式ownedURL的57P19F日志保持，本次不修改断言、不skip PG族，用全新明确归属实例补齐实际运行。模型、用户DB、finance、Activity0；业务源码/测试/Git/control写0。

|原文件|实际通过|
|---|---:|
|`backend/src/legacy-source-migration.test.ts`|31|
|`backend/src/migration-convergence.test.ts`|28|
|`backend/src/legacy-scheduled-job-migration.test.ts`|17|

命令与独占config见ACTUAL_TEST_COMMAND.json、vitest.owned.config.mjs；完整verbose原日志 migration-three-files.log，逐case回执CASE_RESULTS.json。原测试文件按Main正式路径执行，未复制/修改测试；owned config只导入原backend/vitest.config.ts后限定root、cache、worker/retry与180k预算。所有3test/db/已审bridge111/SQL及backend+contract源SHA前后相同，核心源与R逐字节相同；完整源码绑定SOURCE_BINDING.json、FINAL_RESULT.json。原111 journal与137 SQL身份也绑定，没有宽松last或替代数据库结论。

## 新ownedPG与真实关闭

唯一新实例：`/private/tmp/t1290mt-bt14mjqy/t1246-owned-pg-5yj68112`，uid `501`，原PID `36448`，本轮端口 `59943`，dataDir `/private/tmp/t1290mt-bt14mjqy/t1246-owned-pg-5yj68112/data`。短/private/tmp owned parent mode0700；marker含nonce/UID/PID出生/实际postgres二进制与postmaster.pid，沿原T1246测试端口逐连接核真实服务器/role/db/dataDir与注册关系。只将该新实例的显式CREATOROS_TEST_POSTGRES_URL传给原测试，各test自建/销毁自己的登记库，不使用用户URL或既有PG。

|关闭事实|实际结果|
|---|---|
|node /postgres退出|0 /0|
|postmaster.pid已移除|true|
|Unix socket及锁文件已移除|true /true|
|原PID已不存在|true|
|本轮TCP listener已不存在|true|
|registeredDatabasesRemaining|0|

完整证据OWNED_PG_RESULT.json、owned-pg-initdb/postgres/stop.log与marker快照；未停止其它在途实例。所有76旧104/105、真实PG持锁退让、DDL-first实际40P01诊断反例、PostgreSQL旧库备份恢复/双启、未知hash/错when/缺列/冻结历史与canonical111完整SQL receipt哨兵、计划任务转组与旧执行冻结族均原样运行，逐case表不靠重写expected冒通过。

## 隔离与限制

clean env仅必要PATH、owned HOME/TMPDIR/cache与本轮marker/PGURL；Vite/node cache均在本证据目录。Node network guard只允许当前owned PG端点，HTTP/TLS/fetch/listen禁止；未调用业务服务、真实模型或资金/Activity。PG命令仅本轮initdb/postgres/pg_dump/pg_restore/pg_ctl及归属核对，符合本次明确测试授权。

日志保留cache.dir与pg client.query并行使用的deprecation提示，未为消提示改source或重跑。它们未造成失败。该回执只证明原三迁移文件76，不签整产品/安装/模型/真钱验收。ownedPG数据/缓存暂保留供Root统一交付后清空间；本次只关闭归属实例，未清用户数据或删原失败证据。
