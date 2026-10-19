# T1246 首轮测试环境护栏独立评审输入

当前仅/tmp文件；integration写集暂停。尚未开始四包测试、未启用该护栏执行业务。

## 目的与实现

既有127.0.0.1:55422 / PID52177经主线程只读确认属于2026-10-09另任务T1117：`/Users/zyongzhu/.codex/creatoros-verification/t1117-20261009/isolated-pg/data`。禁止本轮连接、SQL、停止或改它。本轮独立PG50028/PID74714已准备。

`deny-legacy-postgres.cjs`仅在Socket.connect真实网络前拒绝localhost/127.0.0.1/::1:55422（默认host也是localhost、大小写等价），同步抛code `T1246_ENV_NOT_OWNED_PG`。没有网络/SQL返回值模拟，不改产品/test/assert/旧guard。其他连接把原this/参数引用/顺序与回调原样传入真实原connect，原返回值保持。

当前Node25.9.0原生Socket.connect源码已读取：合法参数交net._normalizeArgs，内部带符号已规范化数组直接使用。护栏处理相同两形态；该Node helper缺失则停止测试，不无保护运行。source SHA：`2c77bad16a509957762ab42fb6b9a148404b4331a54aa54c900474aed569dd26`。

## 已发生的验证及边界

`deny-legacy-postgres.proof.cjs`实际执行护栏原源码于VM，原connect是记录桩、参数normalize使用真实Node实现：21PASS/0FAIL/真实网络0。三host的options/numeric/string/normalized、默认host/大小写均先拒绝，原connect计数0；本轮50028/其他端口/Unixsocket/非本机55422保持原参数、this与返回值。回执 `deny-legacy-postgres.proof.json/.txt`。这不是实际PG连接、完整Vitest、Worker继承或系统级防火墙验证；不能宣称它覆盖C程序直接TCP或主动删除NODE_OPTIONS的子进程。

拟启动方式是给本轮Vitest及继承的fork设置NODE_OPTIONS `--require /tmp/t1246-unit/deny-legacy-postgres.cjs`，真实环境拒绝计ENV，不计产品FAIL。现阶段待独评；完整测试还等主线程冻结与4基础检查。

## 非opt-in硬编码消费者与native进程审计

对四包原测试源扫描 `55422/PGHOST/PGPORT/pg_dump/pg_restore/psql/createdb/dropdb`：contract/Worker/frontend测试未发现这些硬编码PG或nativeCLI项。backend如下；其实际源SHA及匹配位置将与首轮冻结再次核对。

1. `backend/src/migration-convergence.test.ts:95`非opt-in硬编码zyongzhu@127.0.0.1:55422/postgres。`:99`各PG分支首先await admin.query CREATE DATABASE，Node pg使用net.Socket，应该在真实连接前被拒绝；所有后续迁移/备份/pg_restore不得执行。`:105`确实有C程序pg_restore及PGPORT55422，Node护栏本身无法拦截它。当前源码中它位于第一条admin.query及再次CREATE DATABASE之后，两个都必须已成功；故在护栏完整加载且未移除时源码顺序证明它不可达。finally只调用同样受护栏的admin.query/Pool.end，无nativeCLI。**独评必须审核此不可达证明；未确认则该文件NOT-RUN，明确完整套件缺口，不加暗中selector。**
2. `backend/src/group-upgrade-postgres.integration.test.ts:7`是opt-in，首先验证URL固定55422；本轮50028URL会原样拒绝。`:9`创建临时source/target库在nativeCLI前；`:16`pg_restore是C程序，但位于guard及真实admin.query之后。本轮新端口原guard阻断，不可达。若未来误传旧55422，则Node护栏也先挡CREATE DATABASE。源中不mock net/pg/child_process。
3. `backend/src/group-upgrade-backup.ts:60`生成PG备份的生产helper会执行pg_dump（`:67`），C程序不能由本护栏拦截。但首先await tables(client)（`:61`）、counts（`:65`）、history（`:66`），所有真实旧PG路径必须先经Node连接；上面两消费者先CREATE DATABASE。该helper没有无客户端首发pg_dump；group-upgrade-backup.integration.test.ts本身只有PGlite，不调用PG备份helper。首次suite环境必须清理继承的生产DATABASE_URL/PG*并使用本轮路径。
4. 其余backend约26+消费者有CREATOROS_TEST_POSTGRES_URL/CREATOROS_ISOLATED_PG_URL且原guard强制55422；新端口会明确原guard失败（或原opt-in无前置时skip），不改guard。T1074原guard只要求loopback、role creatoros_t1074和/postgres，本轮role已创建，能用50028合法环境。TEST_DATABASE_URL使用本轮unique空库。

未对既有55422做连接探针或SQL。未执行危险nativeCLI；无系统网络配置修改。若独評发现其他native路径可在Node拒绝之前触发，必须NOT-RUN对应危险文件并记录环境覆盖缺口，完整首轮后统一解决。

请独立复核精确拒绝/参数保持、VM证据层级、preload传递边界和上述nativeCLI可达性；只写/tmp评审结果并回主线程，不改integration或产品源码、不运行长测试、不触及真实PG。
