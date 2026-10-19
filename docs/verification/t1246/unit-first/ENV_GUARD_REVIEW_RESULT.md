# T-1246 单元测试环境护栏独立评审

2026-10-11，独立子 Agent，具体模型 `unknown/inherited`。只读核查护栏、VM 证据、真实 pg 消费者和两条 native CLI 源码链；短证明仅运行已核 Node preload 的同步拒绝及无连接的子进程继承观察。没有 SQL、PG 成功连接、长测试、系统配置或 integration 文件改动。

护栏 SHA256 `2c77bad16a509957762ab42fb6b9a148404b4331a54aa54c900474aed569dd26`。VM 原源码+真实 Node normalize 的既有证据为 21 项通过，原 connect 为记录桩；其他端口原参数引用/顺序、this、回调、返回值保持由这个有限证据证明，不能称真实 PG 连接通过。

独立实际 Node v25.9.0 以 `NODE_OPTIONS=--require /tmp/t1246-unit/deny-legacy-postgres.cjs` 加载，先核 `Socket.prototype.connect.name === t1246GuardedConnect`，再对 `localhost`、`127.0.0.1`、`::1` 的 55422 调用：均同步抛 `T1246_ENV_NOT_OWNED_PG`，原连接阶段未达到，SQL 0、成功网络连接 0。真实 Node spawn 继承环境后观察 `preloaded:true`；Worker 默认配置及 `execArgv:[]` 均观察 `guarded:true`，各网络调用 0。此项是实际 preload/拒绝与继承证据，不是模拟网络响应。没有尝试连接本轮 50028 或既有服务。

## 准入前置与实际绕过边界

发现真实消费者 `backend/node_modules/pg/lib/index.js:41` 读取 `NODE_PG_FORCE_NATIVE`，非空会选择 native libpq；它不经本护栏的 Node Socket。最终 runner 必须显式删除此变量，并记录实际受控环境与 preload 已加载。清 `DATABASE_URL/PG*` 不涵盖这个名称。未完成该前置时，`migration-convergence.test.ts` 的旧 PG 家族与 `group-upgrade-postgres.integration.test.ts` 必须 NOT-RUN，记录安全环境前置和完整套件覆盖缺口，不能执行到 native CLI 后再补保护。

护栏仅保护加载它的 Node 进程，且只拒绝已声明三个 host 的 55422；不是系统防火墙，不能阻断 C 程序直接 TCP、pg.native、自定义原生 stream、移除 NODE_OPTIONS 的 Node 子进程或主动改写 Socket 原型。独立检索当前相关测试未发现 pg.native 或清除护栏再 SQL 的消费者；执行 Worker 的安全 env 会清 NODE_OPTIONS，本护栏不能冒称在那里仍存在，必须沿真正 SQL 所属的 backend 端核准。允许的其他端口仍是真实原 connect，未放回模拟响应。

## 两条危险 native CLI 的可达性

在 frozen 源码、默认 Node pg、真实 preload 已加载且上述 native 变量清除时，可证明旧 PG 的 C 程序不可达：

- `migration-convergence.test.ts:99` 每个 PG 分支先 `await admin.query(CREATE DATABASE)`。所装 `pg/lib/stream.js` 使用 `new net.Socket()`，`connection.js:43` 调用该 Socket.connect，故首条实际 SQL 连接前同步拒绝。后面的 runtime 初始化、备份、再次 CREATE、`pg_restore` 均需要第一条 SQL 已成功才会达到；finally 也只调用同样受拦的 admin.query/Pool.end，没有 native CLI。没有 mock pg/net/child_process 的旁路。
- `group-upgrade-postgres.integration.test.ts:7` 原合同只允许 55422。本轮 50028 会在连接前原 guard 拒绝；若误传旧 55422，`:9` 的第一条 Node CREATE 同样在连接前被护栏拒绝。`:15` 备份和 `:16` native pg_restore 在先前 SQL 成功之后，不可达。
- `backupPostgresBeforeGroupUpgrade` 的 native `pg_dump` 需要先通过真实 client 的 tables/counts/history，且上述测试先 CREATE。其生产 helper 不是系统级被护栏保护；本结论限两条已核冻结调用链。PGlite 备份测试不调用此 PG helper。

因此护栏本体及受控默认 Node PG 链可接受用于首轮环境拒绝，但最终 runner 的 native 清除/preload 绑定尚须当场确认，不能仅凭评审报告启动。新 50028 不替换原 55422 guard；原测试因固定端口拒绝、无前置 skip 或护栏拒绝均保留原结果，分别记录 ENV/未覆盖，不计产品通过，不暗中删 selector，不签完整 PostgreSQL 家族全绿。
