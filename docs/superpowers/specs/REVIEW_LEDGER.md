# SPEC 审核台账(REVIEW_LEDGER)

> **gate 的 durable 状态。** 改方向/架构/数据归属的 SPEC,**过审(verdict≠FAIL)才准开工**(CLAUDE.md 铁律 + 宪法)。本台账记录每份 SPEC 的审核裁决,SessionStart hook 会把 ⛔ FAIL / 未审 的条目注入每个会话(可见性即 enforcement)。
>
> **裁决来源**:跨上下文/跨模型独立评审(reviewer 角色见 orchestrator `prompts/spec-reviewer.md`,**预设 reviewer 模型 = MiniMax**;当前 Agent 工具够不到 MiniMax 时用 Claude 独立上下文代,已实战有效)。verdict 规则:有 blocker→FAIL;有 major 无 blocker→CONCERNS;仅 minor→PASS。CONCERNS 须逐条裁决处置后方可开工;FAIL 须重写后再过审。
>
> verdict:✅ PASS · ⚠️ CONCERNS(已处置) · ⛔ FAIL(重写待审) · ⬜ 未审。

| SPEC | 审核日期 | verdict | 状态 | 备注 |
|---|---|---|---|---|
| [产品定位.md](../产品定位.md)(宪法) | — | — | 单一真值 | 不是待审 SPEC,是审一切 SPEC 的对照基准 |
| [data-foundation-and-director-chatbox](2026-06-30-data-foundation-and-director-chatbox-design.md) | 2026-06-30 | ⚠️ CONCERNS | **已处置→可开工** | 逮 2 真问题(迁移 0006 撞号→0008、评论抓取悬空 wikilink)已裁决修复(`d30d6b5`)。T-001/002/003/004/005/006 据此已落地 |
| [project-lifecycle-0to1-spec](2026-06-30-project-lifecycle-0to1-spec.md) | 2026-06-30 | ⚠️ CONCERNS | **已处置→可开工** | 逮 video_type 矛盾(→删 content_category)+ 缺基线 reconcile,已修(`d30d6b5`)。T-008/009 据此已落地 |
| [data-source-pipeline-design](2026-06-30-data-source-pipeline-design.md) | 2026-06-30 | ⛔ **FAIL** | **重写待审,T-007 不准开工** | 2 blocker:①采集底座押已弃用的 connectOverCDP(应 launchPersistentContext)②新建 self_work/self_metric_snapshot 撞已 ✅ 的 T-001 数据归属(应复用 projects:imported)。+3 major。用户已拍板**对标博主不纳入本期**(砍 benchmark_*)。重写要点见 SPEC 顶部裁决注 |
| [product-workflow-and-triage](2026-06-30-product-workflow-and-triage.md) | — | ⬜ 未审 | 清理类,未触架构 | T-010 据它做"去误导"清理(纯前端文案/桩,不改架构/数据归属),按铁律不强制过审;若后续要据它改架构再补审 |

## 用法

- **开工前**:查本台账 + SPEC 顶部裁决注。⛔ FAIL 的 SPEC 对应任务**不准开工**(看板标 ⛔);⚠️ CONCERNS 须确认 findings 已处置;⬜ 未审 + 改架构/数据归属 → 先送审。
- **送审**:起一个独立上下文/跨模型 reviewer(预设 MiniMax),读 `产品定位.md`(宪法)+ `prompts/spec-reviewer.md`(角色)+ 目标 SPEC → 出 verdict + 结构化 findings → 人裁决 → 把裁决注写进 SPEC 顶部 + 更新本台账。
- **未做的口子(T-012 剩)**:① reviewer 跑在 MiniMax 上的 spec.review capability 自动化(现手动起 reviewer)② PreToolUse 硬 hook 在"标 🔨/写实现"前自动拦未过审 SPEC(现靠 SessionStart 注入 + 人/Agent 查台账,已挡住 T-007)。
