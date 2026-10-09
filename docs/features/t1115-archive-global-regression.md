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
