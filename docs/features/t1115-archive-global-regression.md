# T1115 归档执行回归再次失败的实际诊断

用户要求“有问题的创建 task 及时修复”。T1114新安装版启动、18项公共读取、原12任务/4对象/3会话对照通过，但完整reconcile实际exit1，共43项失败。与T1112当场41项日志相比，LED052和LED027从通过变失败；本任务处理LED052。

```mermaid
flowchart LR
 A[完整对账43项失败] --> B[LED052原检查再次失败]
 B --> C[原命令独立执行 留内层日志]
 C --> D[核权限 幂等 PG与预算]
 D --> E[确认根因后独評修复]
```

本次完整命令明确传入CREATOROS_TEST_POSTGRES_URL与CREATOROS_ISOLATED_PG_URL，均指向本会话隔离PG 55422；不能把失败直接写成缺配置。实际全局日志只保存门级失败描述，未保存内层错误；根因未知。

实际命令、1650.020671秒、退出1与日志SHA `1e61e1761593475e5fbf3f867a4390ce15a59c8a344751731196fce48c6a5a71` 见T1114证据。检查入口为 `node docs/verification/t1022/run-archive-guard.mjs`。之前相同配置的T1112完整对账LED052通过，账本也有本轮之前的失败事件，这些历史均保留，不推定本轮原因。

先读取原入口并独立运行原命令，保存真实内层日志；不连接用户数据库，不扫码/采集/生成，不删除权限或幂等断言。若是测试预算或旧夹具，先实际证明，再精确SPEC与独立复核；若涉及产品归档执行，必须保持普通生成/source_sync禁止与真实collector有限豁免、原结算回放。

原命令独立复现：107.851851秒、退出1，55PASS/4SKIP；日志SHA256 `84ff4275986c7e16a9f036b91c72b67c48efc6841ce6b1510b2242c147d63d43`。execution-lease.service.test.ts的beforeAll在createDb期间触发“Hook timed out in 10000ms”，四例尚未执行；另外两文件通过。因此已确认当前入口的初始化预算缺口，不是四个权限断言失败。backend/vitest.config.ts只设置testTimeout=30000，未设置hookTimeout；原公共wrapper没有预算覆盖。保持原失败，精确SPEC独评后修改真实默认预算。

## 实现规格：真实测试消费者的有限预算

本任务进入4-BUILD维护修复。问题已由原入口复现，无产品方向、契约、数据归属、执行策略或页面变化。用户全功能验证及发现问题及时修复授权已存在，DEC-T1115记录其适用范围；根会话串行实施，独立初审通过后才能修改测试配置。

FR-T1115-01：backend/vitest.config.ts的默认testTimeout由30000改为120000，并明确hookTimeout=120000。实际单位为毫秒，作用于Vitest单例及beforeAll/beforeEach/afterAll/afterEach，不是产品任务deadline或整个套件总预算。保留既有更长局部预算，保留include和其它配置；不使用无限值、retry、bail或skip制造成功。

FR-T1115-02：同一原归档入口内startup-group-collectors.postgres.integration.test.ts的两个真实SQL锁竞争用例显式30000毫秒执行预算改为120000。它们是it的第三参数，不是hook；只改这两个数字，全部竞争步骤、SQL、归属、版本、断言、释放和afterEach清理不变。waitSqlLock的采样间隔与次数不是本次已确认的hook根因，保持原样，不在本任务猜测延长。

FR-T1115-03：真实入口仍为run-archive-guard.mjs，保留两种PG配置、127.0.0.1:55422限制、随机临时库、maxWorkers=2和非零退出码。父进程没有独立总执行上限，内层测试与清理按原runner串行/并行语义完成；本次不引入更小外层预算。不读写当前安装App、用户数据库、原媒体、凭据或模型任务。超时发生仍真实失败，不能报成PASS。

## 精确写集

可执行变更仅两文件：backend/vitest.config.ts、backend/src/integration/startup-group-collectors.postgres.integration.test.ts。其余只写本SPEC及独立review、docs/verification/t1115内真实证据、BACKLOG.md、PROJECT.md、DECISION_LOG、task/review审计、modules.config与实际生成的lessons-stats。不改产品service、数据库工厂、Vitest依赖、原wrapper、CAS测试或产品超时；不改扫描器、allowlist和断言。

## 验收与完成边界

- AC-T1115-01：保留上述实际107.851851秒退出1、55PASS/4SKIP、10000ms hook失败，不补拍权限断言RED。配置修改后原归档命令以相同两种隔离PG配置执行，不加CLI预算覆盖或retry；59例全部执行、0SKIP、退出0。
- AC-T1115-02：共享默认影响PGlite初始化，实际执行原CAS backend两文件及frontend一文件，44+5例、0SKIP；不据其通过反推T1116原完整对账失败原因，T1116仍需自己的实际结论。
- AC-T1115-03：pnpm --dir backend typecheck、git diff --check、timeout-policy、boundary、semantic、orphan、pmem和完整reconcile真实执行，保存命令、环境、时间、退出码及日志SHA。新完整reconcile必须确认LED052原门通过；若还有T1115范围内失败则继续修，范围外既有失败逐条记录并保留其任务，不写全绿或静默accept-risk。完整timeout-policy若原静态27项仍失败保留T1081，不删除检查。
- AC-T1115-04：独立最终复核核两文件变更、测试正文未变、真实原入口与完整对账结果。完成用taskctl，必须明确保留范围外全局失败和T1116未知；不以重跑通过自动代签全功能、图文联合生成或原生UI。仅验证配置变化，不要求重新打包产品；已安装54af33d0产品及其安装证据不改写成新源码包。
