# <项目名> 任务看板(BACKLOG)

> **单一执行真相。每个会话必读(SessionStart hook 自动注入)。** 规则见项目 `AGENTS.md` / SKILL.md Harness Control Plane。
> 状态:📋 待办 · 🔨 进行中 · ✅ 完成 · ⏸️ 搁置。
> 读取顺序:**本看板 → 任务引用的 SPEC → 代码**。
> 铁律:需求即任务(提了就建,别只活在对话里);开工从看板顶取并改 🔨;做完改 ✅+提交;**禁止 P0/P1 分级、禁止多阶段执行**,任务清楚即起 Workflow/并行 subagent 一次做完;改方向/架构/数据归属的 SPEC 只有当前 `PASS[REV:…]` 收据才准开工。

## 🔨 进行中 / 📋 待办(按执行顺序,从上往下取)

| ID | 任务 | 状态 | 文档 | 审核 | 验收 | 一句话 |
|---|---|---|---|---|---|---|
| T-001 | <任务标题> | 📋 | [<spec>](docs/...) | — | — | <一句话范围> |

> **审核列**:`—` 仅限免审琐碎项；方向/架构/数据归属任务先填 `待审`，再由
> `reviewctl.mjs record` 写成 `PASS|CONCERNS|FAIL[REV:<12hex>]`。只有 `PASS[REV:…]`
> 是开工授权。缺失 `receipt_policy` 或仍为 `legacy` 的旧项目只读，禁止继续
> `start/complete`；先运行 `strict-receipts-migrate.mjs check`，再显式 `apply`。迁移不会
> 伪造历史收据，活动任务默认进入 `待验`。
>
> **验收列**:非 UI 任务为 `—`；UI/桌面页面组为 `待验`。`taskctl.mjs complete --evidence
> <FRONTEND_VALIDATION_REPORT.md>` 只有在真实旅程报告通过后才会原子写成
> `PASS:<12hex>` 并标 ✅。任意“单测全绿”文字不能替代这份收据；文档列链接了
> `frontend-journey-contract` 的任务不能把验收改成 `—` 绕过。

## ✅ 已完成(粗粒度,倒序)

| 任务 | 文档 |
|---|---|
| <已完成功能> | <spec> |
