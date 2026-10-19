# T-1115 SPEC 独立初审

- 评审时间（UTC）：`2026-10-09T08:49:03.045491+00:00`
- 结论：**PASS**
- Findings：`[]`
- SPEC SHA-256：`dd00528cef1f1ed9515db739ff0dd5e1c40fbf85c8e4e5fba449d224be8eae8b`
- modules SHA-256：`cbd06d9a11a5645f6215f388bb0a99f200e23ac456064025a951e4b654cd5428`
- 产品宪法 SHA-256：`86bc2c8add6a01ebf5b2ecf9de05d448770ca14a4e0bdbbf376fffc6387e3800`（仓库实际宪法路径为 `docs/产品定位.md`；不存在 `orchestrator/constitution.md`）
- 架构 SHA-256：`eb1826d4c09054df622d9718c38ca372bd19833e72bd1a752757631a5747c1df`

## 结论

方案与真实失败相符。原入口执行 107.851851 秒后 exit 1，55 个测试通过、4 个跳过；唯一失败点是 `execution-lease.service.test.ts` 的 `beforeAll` 使用 Vitest 默认 `hookTimeout=10000ms`。它不是四个租约权限断言失败，也不是产品归档逻辑失败。原 RED 收据 SHA-256 为 `0fe6d40b4870c06e09712f39b80b3adfdb14db4c33bea1837975a3ff9c615810`。

把 backend 默认 `testTimeout` 从 30000ms 调整为 120000ms，并显式设置 `hookTimeout=120000ms`，属于测试执行预算。它不改变产品任务 deadline、持久任务剩余期限、SQL 锁规则或外层套件上限；断言失败仍立即失败，超时仍以非零退出。已有更长局部预算不受影响。两个 startup collector 用例的第三参数从 30000ms 改为 120000ms，同样只调整用例预算，锁采样、释放、清理及归属断言保持不变。

写集与根因一致：仅 `backend/vitest.config.ts` 和 `startup-group-collectors.postgres.integration.test.ts` 两个执行文件，另有规定的控制与证据文件。原 wrapper、三测试文件、PG 环境、`maxWorkers=2` 和退出码不变。验收要求原 59 例全部实际执行、0 skip、exit 0，并运行 CAS 分段回归、backend 类型、timeout-policy、三门卫及完整 reconcile，足以防止仅靠 helper 或局部绿误签。

## 边界

T1116 的分段 44+5 PASS 不解释 LED-027 完整门失败，必须保持 UNKNOWN/待诊断。完整 reconcile 若仍有范围外失败必须逐项留存；本评审不代签全局绿、安装版、图文联合生成或原生 UI。
