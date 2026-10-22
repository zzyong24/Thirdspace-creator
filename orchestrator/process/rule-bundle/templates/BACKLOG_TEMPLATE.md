# <项目名> 任务看板(BACKLOG)

> **任务执行状态的唯一记录。** 会话入口只注入队头；需要更多任务时按实际依赖读取。规则见项目 `AGENTS.md` 和 `rules/task-ledger-rules.md`。
> 状态：📋 待办 · 🔨 进行中 · ✅ 完成 · ⏸️ 搁置。
> 读取当前任务、引用的规格与相关代码。已确认需求进入看板，从依赖就绪项开始，用任务工具变更状态。任务可有多个内部步骤，中间步骤不提前结束整条任务。委派和并行只在当前授权允许时使用。
> `buildout` 先实现与验证，`maintenance` 才按适用条件使用评审收据；已覆盖的重要选择不重复确认。

## 🔨 进行中 / 📋 待办(按执行顺序,从上往下取)

| ID | 任务 | 状态 | 文档 | 审核 | 验收 | 一句话 |
|---|---|---|---|---|---|---|
| T-001 | <任务标题> | 📋 | [<spec>](docs/...) | — | — | <一句话范围> |

> **审核列**:`buildout` 的活动任务统一用 `—`，不创建 formal-review 步骤、review sidecar 或多轮审核；
> 产品方向、数据归属、公共接口、安全姿态和发布标准超出已有授权时补充确认。
> 项目稳定并由 `delivery-phase.mjs promote` 进入 `maintenance` 后，受影响任务才填 `待审`，
> 再由 `reviewctl.mjs record` 写成 `PASS|CONCERNS|FAIL[REV:<12hex>]`；此时只有 `PASS[REV:…]` 是开工授权。
> 缺失 `receipt_policy` 或仍为 `legacy` 的旧项目只读，禁止继续
> `start/complete`；先运行 `strict-receipts-migrate.mjs check`，再显式 `apply`。迁移不会
> 伪造历史收据，活动任务默认进入 `待验`。
>
> **验收列**:非 UI 任务为 `—`；UI/桌面页面组为 `待验`。`taskctl.mjs complete --evidence
> <FRONTEND_VALIDATION_REPORT.md>` 只有在真实旅程报告通过后才会原子写成
> `PASS:<12hex>` 并标 ✅。任意“单测全绿”文字不能替代这份收据；文档列链接了
> `frontend-journey-contract` 的任务不能把验收改成 `—` 绕过。
>
> **技术阻塞**:同类失败第二次、契约/Schema 失败、昂贵真实运行、连续补丁无效或供应商能力未知时，
> 原实现任务转 `⏸️`，另建一条有界研究任务并引用 `docs/research/` 研究卡。只有
> `research-gate.mjs resume` 能解除研究门；恢复后回到 `📋`，不跳过当前生命周期的用户确认或审核规则。

## ✅ 已完成(粗粒度,倒序)

| 任务 | 文档 |
|---|---|
| <已完成功能> | <spec> |
